/**
 * 榜单数据源 — Apple iTunes RSS（免 key）。
 *
 * 端点：https://itunes.apple.com/<country>/rss/topsongs/limit=<N>/genre=<id>/json
 * 每条 entry 自带 30s 官方 preview 直链（audio-ssl.itunes.apple.com/...mzaf_*.m4a），
 * 可直接喂给 AVPlayer 做即时试听，无需任何解析。
 *
 * 完整播放/下载仍走 mp3juice（用 "歌名 艺人" 搜索）。
 */

import { fetch } from "scripting"

/** 试听用的虚拟 provider，命中 player.ts「非 mp3juice + audio_url 有值 → 直接播」分支。 */
export const ITUNES_PREVIEW_PROVIDER = "itunes_preview"

export type ChartGenre = {
  /** iTunes genre id */
  id: number
  /** 稳定 key（用于 Storage/缓存） */
  key: string
  /** 展示名 */
  label: string
  emoji?: string
}

/** 口味向预设流派清单（欧美另类/独立优先）。 */
export const CHART_GENRES: readonly ChartGenre[] = [
  { id: 20, key: "alternative", label: "另类", emoji: "🎸" },
  { id: 10, key: "singer-songwriter", label: "唱作人", emoji: "🎤" },
  { id: 7, key: "electronic", label: "电子", emoji: "🎹" },
  { id: 21, key: "rock", label: "摇滚", emoji: "🪕" },
  { id: 14, key: "pop", label: "流行", emoji: "🎧" },
] as const

export type ChartTrack = {
  /** 统一 id：itp:<trackId>，避免与 mp3juice id 冲突 */
  id: string
  trackId: string
  title: string
  artist: string
  album: string
  cover: string
  previewUrl: string
  duration: number
  provider: typeof ITUNES_PREVIEW_PROVIDER
}

// ---- 内部解析辅助 ----

function pick(obj: any, path: string): any {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj)
}

/** im:image 数组取最大尺寸，再升级到 600x600。 */
function bestCover(images: any): string {
  if (!Array.isArray(images) || images.length === 0) return ""
  let best = ""
  let bestH = -1
  for (const img of images) {
    const url = img?.label
    const h = parseInt(img?.attributes?.height ?? "0", 10) || 0
    if (url && h > bestH) { best = url; bestH = h }
  }
  // 把 .../NNxNNbb.(jpg|png) 升级为 600x600bb
  return best.replace(/\/\d+x\d+bb\.(jpg|png)/i, "/600x600bb.$1")
}

/** 从 link 数组里找 rel=enclosure 的 preview 直链。 */
function previewFromLinks(link: any): { url: string; duration: number } {
  const links = Array.isArray(link) ? link : link ? [link] : []
  for (const l of links) {
    const attrs = l?.attributes
    if (attrs?.rel === "enclosure" && attrs?.href) {
      const durMs = parseInt(l?.["im:duration"]?.label ?? "0", 10) || 0
      return { url: attrs.href, duration: durMs > 0 ? Math.round(durMs / 1000) : 30 }
    }
  }
  return { url: "", duration: 0 }
}

function parseEntry(entry: any): ChartTrack | null {
  if (!entry) return null
  const title = pick(entry, "im:name.label")
  const artist = pick(entry, "im:artist.label") ?? ""
  const album = pick(entry, "im:collection.im:name.label") ?? ""
  const trackId = pick(entry, "id.attributes.im:id") ?? ""
  const cover = bestCover(entry["im:image"])
  const { url: previewUrl, duration } = previewFromLinks(entry.link)
  // 缺歌名或缺 preview 的条目无法试听 → 丢弃
  if (!title || !previewUrl) return null
  return {
    id: `itp:${trackId || title}`,
    trackId: String(trackId),
    title,
    artist,
    album,
    cover,
    previewUrl,
    duration: duration || 30,
    provider: ITUNES_PREVIEW_PROVIDER,
  }
}

type CacheEntry = { data: ChartTrack[]; ts: number }
const CACHE_TTL = 10 * 60 * 1000
const cache = new Map<string, CacheEntry>()

class ChartsSource {
  /**
   * 拉取某流派榜单。
   * @param genreId iTunes genre id
   * @param limit 条数（默认 40）
   * @param country 地区（默认 us，欧美另类）
   */
  async fetchChart(genreId: number, limit = 40, country = "us"): Promise<ChartTrack[]> {
    const cacheKey = `${country}:${genreId}:${limit}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

    const url = `https://itunes.apple.com/${country}/rss/topsongs/limit=${limit}/genre=${genreId}/json`
    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
        "Accept": "application/json",
      },
    })
    if (!resp.ok) throw new Error(`榜单请求失败 HTTP ${resp.status}`)
    const json = await resp.json()
    const rawEntry = pick(json, "feed.entry")
    const entries = Array.isArray(rawEntry) ? rawEntry : rawEntry ? [rawEntry] : []
    const tracks: ChartTrack[] = []
    for (const e of entries) {
      const t = parseEntry(e)
      if (t) tracks.push(t)
    }
    cache.set(cacheKey, { data: tracks, ts: Date.now() })
    return tracks
  }

  clearCache(): void {
    cache.clear()
  }
}

export const charts = new ChartsSource()
