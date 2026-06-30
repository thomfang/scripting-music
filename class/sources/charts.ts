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

/**
 * 「为你推荐」默认种子艺人池（用户口味：欧美另类/独立）。
 * 库为空或偏好不足时，从此池按「当天 seed」随机抽取，而非固定头几个，
 * 以保证推荐会轮换。artistId 为已知值，缺则运行时 Search 解析。
 */
export const SEED_ARTISTS: readonly { name: string; artistId?: number }[] = [
  { name: "Radiohead", artistId: 657515 },
  { name: "Novo Amor" },
  { name: "Cigarettes After Sex" },
  { name: "Bon Iver" },
  { name: "The National" },
  { name: "Sufjan Stevens" },
  { name: "Beach House" },
  { name: "Fleet Foxes" },
  { name: "The xx" },
  { name: "Phoebe Bridgers" },
  { name: "Alvvays" },
  { name: "Slowdive" },
]

// ---- 确定性随机工具（供「按天 seed」轮换推荐用） ----

/** 字符串 → uint32 哈希（FNV-1a 变体），用于把 dayKey/库指纹折叠成种子。 */
export function hashStr(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32 确定性 PRNG：同一 seed 必产同一序列。返回 [0,1) 取数函数。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 用给定 PRNG 对数组做 Fisher–Yates 洗牌（返回新数组，不改原数组）。 */
export function shuffleWith<T>(arr: readonly T[], rand: () => number): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

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

/** 从 RSS entry 取发行时间戳（ms，无法解析返回 0）。 */
function releaseDateOf(entry: any): number {
  const s = pick(entry, "im:releaseDate.label")
  if (!s) return 0
  const t = Date.parse(s)
  return isNaN(t) ? 0 : t
}

type CacheEntry = { data: ChartTrack[]; ts: number }
const CACHE_TTL = 10 * 60 * 1000
const cache = new Map<string, CacheEntry>()

const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"

/** “新歌”门槛：只保留近 N 个月内发行的曲目（跨流派拉 topsongs 后过滤）。 */
const NEW_SONG_MAX_AGE_MONTHS = 9
const NEW_SONG_MAX_AGE_MS = NEW_SONG_MAX_AGE_MONTHS * 30 * 24 * 3600 * 1000
/** 新歌池取样的流派（口味向：另类/唱作人/电子/摇滚/流行）。也供推荐随机流派源复用。 */
export const NEW_SONG_GENRES = [20, 10, 7, 21, 14]

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
   * 新歌（跨流派）：跨多个口味向流派拉 topsongs RSS，按 releaseDate 过滤出近
   * N 个月内发行的曲目，再按发行时间降序。
   *
   * 为何不用 Search：iTunes Search 按相关性/热度排序，新歌没热度永远排不进前列，
   * 实测返回全是 1~3 年前的老歌；topsongs RSS 自带 releaseDate 且含当日新发行的热门曲。
   */
  async fetchNewSongs(limit = 40, country = "us"): Promise<ChartTrack[]> {
    const cacheKey = `${country}:new:${limit}`
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data

    const now = Date.now()
    const results = await Promise.all(
      NEW_SONG_GENRES.map(async genreId => {
        try {
          const url = `https://itunes.apple.com/${country}/rss/topsongs/limit=100/genre=${genreId}/json`
          const resp = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } })
          if (!resp.ok) return [] as { t: ChartTrack; date: number }[]
          const json = await resp.json()
          const rawEntry = pick(json, "feed.entry")
          const entries = Array.isArray(rawEntry) ? rawEntry : rawEntry ? [rawEntry] : []
          const out: { t: ChartTrack; date: number }[] = []
          for (const e of entries) {
            const date = releaseDateOf(e)
            // 只保留近 N 个月内发行的（无发行时间的丢弃，避免混入老歌）
            if (!date || now - date > NEW_SONG_MAX_AGE_MS) continue
            const t = parseEntry(e)
            if (t) out.push({ t, date })
          }
          return out
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
    limit = 25,
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
