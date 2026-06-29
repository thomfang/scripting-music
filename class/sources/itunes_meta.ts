import { fetch } from "scripting"

/**
 * iTunes Search API 元数据富化。
 *
 * 背景：mp3juice/YouTube 结果只有标题（常含 "(Official Video)" 等噪声），
 * 没有独立的 artist/album/高清封面。用免费的 iTunes Search API 按清洗后的
 * 标题匹配，补全 artist / album / 高清封面 / 时长。
 *
 * 关键实测结论（2026-06-29）：
 * - iTunes Search API 必须带 User-Agent，否则 Scripting fetch 报「不支持的URL」。
 * - country=CN 时中文歌保留原名（周杰伦/晴天/叶惠美），英文歌也能正常匹配。
 * - API 总返回最接近的一条，垃圾标题会被强行匹配 → 必须置信度护栏。
 */

const ITUNES_ENDPOINT = "https://itunes.apple.com/search"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const ACCEPT_THRESHOLD = 0.5

export type ItunesMeta = {
  artist?: string
  album?: string
  track?: string
  cover?: string
  duration?: number
  score: number
  matched: boolean
}

/** 去除 YouTube 标题里的常见噪声 */
export function cleanTitle(raw: string): string {
  return (raw || "")
    // () [] {} 通常是英文噪声（Official Video / Lyrics / feat. 等），整体删除
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\{[^}]*\}/g, " ")
    // 【】「」『』 里常是 CJK 歌名本身 → 只去括号、保留内容
    .replace(/[【】「」『』]/g, " ")
    .replace(/official|music\s*video|lyric[s]?|歌词|歌詞|audio|m\/?v|hd|4k|visualizer|live|remix|cover|feat\.?|ft\.?/gi, " ")
    .replace(/[''‘’""“”|·]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** 归一化：仅保留字母数字（含 CJK），用于相似度比较 */
function norm(s: string): string {
  return (s || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
}

/**
 * 匹配置信度打分（0~1）：
 * - track 名是否大体出现在清洗标题里（权重 0.6，支持包含/字符重叠）
 * - artist 名是否出现在清洗标题里（权重 0.4）
 */
function matchScore(clean: string, artist: string, track: string): number {
  const c = norm(clean)
  const t = norm(track)
  const a = norm(artist)
  if (!c || !t) return 0
  let s = 0
  if (c.includes(t) || t.includes(c)) {
    s += 0.6
  } else {
    const overlap = t.length > 0 ? [...t].filter(ch => c.includes(ch)).length / t.length : 0
    s += 0.6 * overlap
  }
  if (a && c.includes(a)) s += 0.4
  return s
}

/** 高清封面：把 100x100 替换为 600x600 */
function upscaleCover(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.")
}

/**
 * 查询并富化单个标题。匹配置信度低于阈值时返回 matched:false（不注入错误元数据）。
 * @param country 默认 "CN"（中文歌保留原名，英文歌也正常）
 */
export async function enrichByTitle(rawTitle: string, country = "CN"): Promise<ItunesMeta> {
  const clean = cleanTitle(rawTitle)
  if (!clean) return { score: 0, matched: false }
  const url = `${ITUNES_ENDPOINT}?term=${encodeURIComponent(clean)}&media=music&entity=song&limit=1&country=${country}`
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } })
    if (!r.ok) return { score: 0, matched: false }
    const j = await r.json()
    const hit = j?.results?.[0]
    if (!hit) return { score: 0, matched: false }
    const score = matchScore(clean, hit.artistName || "", hit.trackName || "")
    if (score < ACCEPT_THRESHOLD) return { score, matched: false }
    return {
      matched: true,
      score,
      artist: hit.artistName || undefined,
      album: hit.collectionName || undefined,
      track: hit.trackName || undefined,
      cover: upscaleCover(hit.artworkUrl100 || hit.artworkUrl60),
      duration: hit.trackTimeMillis ? Math.round(hit.trackTimeMillis / 1000) : undefined,
    }
  } catch (e) {
    console.log(`[itunes] 富化失败 "${clean}": ${e}`)
    return { score: 0, matched: false }
  }
}

/**
 * 带并发限流的批量富化。返回与输入等长的结果数组（一一对应）。
 * @param limit 最大并发（默认 4，避免一次打满 20 条触发限流）
 */
export async function enrichBatch<T>(
  items: T[],
  getTitle: (item: T) => string,
  limit = 4,
  country = "CN"
): Promise<ItunesMeta[]> {
  const results = new Array<ItunesMeta>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await enrichByTitle(getTitle(items[i]), country)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker())
  await Promise.all(workers)
  return results
}
