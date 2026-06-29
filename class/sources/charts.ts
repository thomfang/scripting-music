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

/** “新歌”特殊项的 genre id 哨兵值（不是真 genre，走 Search 新歌逻辑）。 */
export const NEW_SONGS_GENRE_ID = -1

/** 口味向预设流派清单（欧美另类/独立优先）。首项为跨流派「新歌」。 */
export const CHART_GENRES: readonly ChartGenre[] = [
  { id: NEW_SONGS_GENRE_ID, key: "new", label: "新歌", emoji: "🆕" },
  { id: 20, key: "alternative", label: "另类", emoji: "🎸" },
  { id: 10, key: "singer-songwriter", label: "唱作人", emoji: "🎤" },
  { id: 7, key: "electronic", label: "电子", emoji: "🎹" },
  { id: 21, key: "rock", label: "摇滚", emoji: "🪕" },
  { id: 14, key: "pop", label: "流行", emoji: "🎧" },
] as const

/** 「为你推荐」种子艺人（用户口味）。artistId 为已知值，缺则运行时 Search 解析。 */
export const SEED_ARTISTS: readonly { name: string; artistId?: number }[] = [
  { name: "Radiohead", artistId: 657515 },
  { name: "Novo Amor" },
  { name: "Cigarettes After Sex" },
]

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

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

/** “新歌”用的口味向检索词（欧美另类/独立）。 */
const NEW_SONG_TERMS = ["alternative", "indie", "singer songwriter", "dream pop", "indie rock"]

/** 升级 artworkUrl100 为 600x600。 */
function upgradeArtwork(url: string): string {
  return (url || "").replace(/\/\d+x\d+bb\.(jpg|png)/i, "/600x600bb.$1")
}

/** 解析 iTunes Search/Lookup 的 track 对象为 ChartTrack。 */
function parseSearchTrack(r: any): ChartTrack | null {
  if (!r || r.wrapperType !== "track" || r.kind !== "song") return null
  const previewUrl = r.previewUrl
  const title = r.trackName
  if (!previewUrl || !title) return null
  const trackId = String(r.trackId ?? "")
  const durMs = typeof r.trackTimeMillis === "number" ? r.trackTimeMillis : 0
  return {
    id: `itp:${trackId || title}`,
    trackId,
    title,
    artist: r.artistName ?? "",
    album: r.collectionName ?? "",
    cover: upgradeArtwork(r.artworkUrl100 ?? ""),
    previewUrl,
    // 试听仍是 30s，但保留真实时长供展示
    duration: durMs > 0 ? Math.round(durMs / 1000) : 30,
    provider: ITUNES_PREVIEW_PROVIDER,
  }
}

/** 按 trackId 去重。 */
function dedupe(tracks: ChartTrack[]): ChartTrack[] {
  const seen = new Set<string>()
  const out: ChartTrack[] = []
  for (const t of tracks) {
    const k = t.trackId || t.title
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

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

  /**
   * 新歌（跨流派）：iTunes Search 多检索词混合 → 按 releaseDate 降序。
   * 旧版 RSS 无歌曲级「新歌」feed，故用 Search。
   */
  async fetchNewSongs(limit = 40, country = "us"): Promise<ChartTrack[]> {
    const cacheKey = `${country}:new:${limit}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

    const perTerm = Math.max(12, Math.ceil(limit / NEW_SONG_TERMS.length) + 6)
    const results = await Promise.all(
      NEW_SONG_TERMS.map(async term => {
        try {
          const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&media=music&entity=song&country=${country}&limit=${perTerm}`
          const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
          if (!resp.ok) return [] as { t: ChartTrack; date: number }[]
          const json = await resp.json()
          const arr = Array.isArray(json?.results) ? json.results : []
          return arr.map((r: any) => {
            const t = parseSearchTrack(r)
            if (!t) return null
            const date = r.releaseDate ? Date.parse(r.releaseDate) : 0
            return { t, date: isNaN(date) ? 0 : date }
          }).filter(Boolean) as { t: ChartTrack; date: number }[]
        } catch {
          return [] as { t: ChartTrack; date: number }[]
        }
      })
    )
    const merged = results.flat()
    merged.sort((a, b) => b.date - a.date) // 最新在前
    const tracks = dedupe(merged.map(x => x.t)).slice(0, limit)
    cache.set(cacheKey, { data: tracks, ts: Date.now() })
    return tracks
  }

  /** 解析艺人名 → artistId（Search entity=musicArtist）。 */
  private async resolveArtistId(name: string, country = "us"): Promise<number | null> {
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&media=music&entity=musicArtist&limit=1&country=${country}`
      const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
      if (!resp.ok) return null
      const json = await resp.json()
      const a = Array.isArray(json?.results) ? json.results[0] : null
      return a?.artistId ?? null
    } catch {
      return null
    }
  }

  /**
   * 为你推荐：拉某种子艺人的热门曲（lookup id=artistId）。
   * @param artist 名称（可选预置 artistId）
   */
  async fetchArtistTop(
    artist: { name: string; artistId?: number },
    limit = 12,
    country = "us"
  ): Promise<ChartTrack[]> {
    const cacheKey = `${country}:artist:${artist.name}:${limit}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

    let id = artist.artistId ?? null
    if (!id) id = await this.resolveArtistId(artist.name, country)
    if (!id) return []

    try {
      const url = `https://itunes.apple.com/lookup?id=${id}&entity=song&limit=${limit + 1}&country=${country}`
      const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
      if (!resp.ok) return []
      const json = await resp.json()
      const arr = Array.isArray(json?.results) ? json.results : []
      const tracks = dedupe(
        arr.map((r: any) => parseSearchTrack(r)).filter(Boolean) as ChartTrack[]
      ).slice(0, limit)
      cache.set(cacheKey, { data: tracks, ts: Date.now() })
      return tracks
    } catch {
      return []
    }
  }

  clearCache(): void {
    cache.clear()
  }
}

export const charts = new ChartsSource()
