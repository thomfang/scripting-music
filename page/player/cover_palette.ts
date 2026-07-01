import { useState, useEffect } from "scripting"
import { Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"

/**
 * 从专辑封面提取一组「流动 Mesh」用的主色调色板。
 *
 * 背景：早期认为 Scripting 无取色 API（UIImage 无 average/dominant/像素读取）。
 * 实测发现可行链路：UIImage.preparingThumbnail → toPNGData → 剥 zlib 头后
 * Data.decompressed(zlib)（Apple 实现是裸 deflate）→ 反 PNG filter → 得到 RGB 像素。
 * 再做「按饱和度加权的色相直方图」聚类，得到封面主色相。
 *
 * 返回 CoverPalette：9 个顶点色相 + 基准饱和度/亮度。
 * - 彩色封面：色相取自封面主色，饱和度高、明亮。
 * - 灰度/暗淡封面：回退默认多彩色相，但压低饱和度贴合封面气质。
 * - 无封面/解码失败：返回 null，调用方用内置默认色。
 */
export type CoverPalette = {
  hues: number[]   // 9 个色相（0-360），对应 mesh 9 个顶点
  sat: number      // 基准饱和度（%）
  lig: number      // 基准亮度（%）
}

// 默认色相（紫/品红/暖橙/靛蓝家族），无封面或解码失败时使用。
export const DEFAULT_HUES = [268, 322, 12, 232, 292, 20, 246, 286, 332]
export const DEFAULT_PALETTE: CoverPalette = { hues: DEFAULT_HUES, sat: 74, lig: 56 }

// ---- 缓存：按封面标识（本地路径 or 远程 URL）缓存提取结果，避免重复解码 ----
const cache = new Map<string, CoverPalette>()

// ================= PNG 解码 =================

function u32(b: Uint8Array, o: number) { return (b[o] << 24 | b[o + 1] << 16 | b[o + 2] << 8 | b[o + 3]) >>> 0 }

function collectIDAT(png: Uint8Array) {
  // 校验 PNG 签名
  if (png.length < 33 || png[0] !== 137 || png[1] !== 80) return null
  const w = u32(png, 16), h = u32(png, 20)
  const bitDepth = png[24], colorType = png[25]
  let o = 8
  const chunks: Uint8Array[] = []
  while (o + 12 <= png.length) {
    const len = u32(png, o)
    const type = String.fromCharCode(png[o + 4], png[o + 5], png[o + 6], png[o + 7])
    if (type === "IDAT") chunks.push(png.slice(o + 8, o + 8 + len))
    if (type === "IEND") break
    o += 12 + len
  }
  let total = 0; for (const c of chunks) total += c.length
  const idat = new Uint8Array(total)
  let p = 0; for (const c of chunks) { idat.set(c, p); p += c.length }
  return { w, h, bitDepth, colorType, idat }
}

function paeth(a: number, b: number, c: number) {
  const p = a + b - c
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

// 反 PNG filter（bitDepth=8）。bpp = 每像素字节数（RGB=3 / RGBA=4）。
function unfilter(raw: Uint8Array, w: number, h: number, bpp: number): Uint8Array {
  const stride = w * bpp
  const out = new Uint8Array(w * h * bpp)
  let ri = 0
  for (let y = 0; y < h; y++) {
    const ft = raw[ri++]
    const row = out.subarray(y * stride, y * stride + stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, (y - 1) * stride + stride) : null
    for (let x = 0; x < stride; x++) {
      const rawv = raw[ri++]
      const a = x >= bpp ? row[x - bpp] : 0
      const b = prev ? prev[x] : 0
      const c = (prev && x >= bpp) ? prev[x - bpp] : 0
      let v = rawv
      switch (ft) {
        case 1: v = rawv + a; break
        case 2: v = rawv + b; break
        case 3: v = rawv + ((a + b) >> 1); break
        case 4: v = rawv + paeth(a, b, c); break
      }
      row[x] = v & 0xff
    }
  }
  return out
}

// 解出 RGB 像素数组（只支持 8-bit truecolor/truecolor+alpha，覆盖 iOS toPNGData 的输出）。
function decodePixels(png: Uint8Array): { px: Uint8Array, bpp: number, w: number, h: number } | null {
  const info = collectIDAT(png)
  if (!info) return null
  const { w, h, bitDepth, colorType, idat } = info
  if (bitDepth !== 8) return null
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (bpp === 0) return null
  if (idat.length < 3) return null
  try {
    // 剥 zlib 2 字节头（Apple zlib 解压是裸 deflate）
    const deflate = idat.slice(2)
    const raw = Data.fromUint8Array(deflate)!.decompressed(CompressionAlgorithm.zlib).toUint8Array()
    if (!raw || raw.length < h * (w * bpp + 1)) return null
    const px = unfilter(raw, w, h, bpp)
    return { px, bpp, w, h }
  } catch {
    return null
  }
}

// ================= 取色 =================

// RGB → HSL（h:0-360, s/l:0-1）
function rgb2hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b)
  const l = (mx + mn) / 2
  let h = 0, s = 0
  if (mx !== mn) {
    const d = mx - mn
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn)
    switch (mx) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      default: h = (r - g) / d + 4; break
    }
    h *= 60
  }
  return [h, s, l]
}

// 从像素提取调色板：按饱和度加权的色相直方图找主色相。
function paletteFromPixels(px: Uint8Array, bpp: number, w: number, h: number): CoverPalette {
  const BINS = 24 // 每 15°
  const weight = new Float64Array(BINS)
  let satSum = 0, ligSum = 0, vivid = 0, n = 0
  for (let i = 0; i < w * h; i++) {
    const o = i * bpp
    if (bpp === 4 && px[o + 3] < 128) continue // 跳过透明像素
    const [hh, s, l] = rgb2hsl(px[o], px[o + 1], px[o + 2])
    n++
    ligSum += l
    // 只有足够饱和、亮度适中的像素才计入色相直方图（排除黑白灰边框）
    if (s > 0.28 && l > 0.18 && l < 0.9) {
      const bin = Math.min(BINS - 1, Math.floor(hh / (360 / BINS)))
      weight[bin] += s
      satSum += s
      vivid++
    }
  }
  const avgLig = n > 0 ? ligSum / n : 0.5

  // 灰度/暗淡封面：主色像素太少 → 回退默认多彩，但压低饱和度贴合气质。
  if (vivid < n * 0.04) {
    return { hues: DEFAULT_HUES, sat: 40, lig: Math.round(clamp(avgLig * 100, 40, 68)) }
  }

  // 找直方图峰值（局部极大），按权重降序取主色相。
  const peaks: { hue: number, w: number }[] = []
  for (let i = 0; i < BINS; i++) {
    const prev = weight[(i - 1 + BINS) % BINS], next = weight[(i + 1) % BINS]
    if (weight[i] > 0 && weight[i] >= prev && weight[i] >= next) {
      peaks.push({ hue: (i + 0.5) * (360 / BINS), w: weight[i] })
    }
  }
  peaks.sort((a, b) => b.w - a.w)
  const tops = peaks.slice(0, 4).map(p => p.hue)
  if (tops.length === 0) tops.push(0) // 理论不会发生

  // 由主色相生成 9 个顶点色相：循环取主色 + 小幅抖动，制造相邻顶点差异（液态感）。
  const hues: number[] = []
  const jitter = [0, 10, -8, 14, -12, 6, -6, 12, -10]
  for (let v = 0; v < 9; v++) {
    const base = tops[v % tops.length]
    hues.push(((base + jitter[v]) % 360 + 360) % 360)
  }

  const avgSat = vivid > 0 ? satSum / vivid : 0.5
  // 提升饱和度让 mesh 更鲜活（Apple Music 观感），但保留封面本身的高低差异。
  const sat = Math.round(clamp(avgSat * 100 * 1.15 + 20, 55, 92))
  const lig = Math.round(clamp(avgLig * 100 * 0.9 + 12, 46, 68))
  return { hues, sat, lig }
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)) }

// 从 UIImage 提取调色板（缩略图 → PNG → 解码 → 取色）。
function paletteFromImage(img: UIImage): CoverPalette | null {
  const thumb = img.preparingThumbnail({ width: 24, height: 24 }) ?? img
  const pngData = thumb.toPNGData()
  if (!pngData) return null
  const png = pngData.toUint8Array()
  if (!png) return null
  const decoded = decodePixels(png)
  if (!decoded) return null
  return paletteFromPixels(decoded.px, decoded.bpp, decoded.w, decoded.h)
}

// ================= Hook =================

/**
 * 解析当前歌曲封面的调色板。
 * - 已下载：用本地封面文件。
 * - 未下载：用远程 cover_url（UIImage.fromURL）。
 * - 提取中/失败/无封面：返回 DEFAULT_PALETTE。
 * 结果按封面标识缓存，切歌回到旧歌时秒出。
 */
export function useCoverPalette(music: Music | null): CoverPalette {
  const [palette, setPalette] = useState<CoverPalette>(DEFAULT_PALETTE)

  useEffect(() => {
    let cancelled = false
    if (!music) { setPalette(DEFAULT_PALETTE); return }

    const localPath = music.is_downloaded ? fileManager.getCoverPath(music.id) : null
    const remoteUrl = music.cover_url && music.cover_url.length > 0 ? music.cover_url : null
    const key = localPath ?? remoteUrl
    if (!key) { setPalette(DEFAULT_PALETTE); return }

    // 命中缓存
    const cached = cache.get(key)
    if (cached) { setPalette(cached); return }

    // 先给默认色，异步提取后替换
    setPalette(DEFAULT_PALETTE)

    ;(async () => {
      try {
        let img: UIImage | null = null
        if (localPath) {
          const exists = await FileManager.exists(localPath)
          if (exists) img = UIImage.fromFile(localPath)
        }
        if (!img && remoteUrl) {
          img = await UIImage.fromURL(remoteUrl)
        }
        if (!img) return
        const pal = paletteFromImage(img)
        if (!pal) return
        cache.set(key, pal)
        if (!cancelled) setPalette(pal)
      } catch {
        /* 保持默认色 */
      }
    })()

    return () => { cancelled = true }
  }, [music?.id, music?.is_downloaded, music?.cover_url])

  return palette
}
