import { fetch } from "scripting"

/**
 * iTunes 在线浏览数据源（艺人 / 专辑 / 专辑曲目）。
 *
 * 与 itunes_meta.ts（搜索结果富化）区分：本模块用于「搜索页艺人/专辑模式 +
 * 在线艺人/专辑详情页」的浏览数据。
 *
 * 接口（均 GET，必带 UA，country=US 贴欧美口味）：
 * - search?entity=musicArtist  → 艺人（artistName/artistId/genre，无图）
 * - search?entity=album        → 专辑（collectionName/artistName/collectionId/封面/年份/曲目数）
 * - lookup?id=<artistId>&entity=album   → 首条 artist + 该艺人全部专辑
 * - lookup?id=<collectionId>&entity=song → 首条 collection + 各 track
 *
 * 局限：艺人无官方图（详情页大图/简介用 TheAudioDB artistInfo 兜底）。
 */

const SEARCH = "https://itunes.apple.com/search"
const LOOKUP = "https://itunes.apple.com/lookup"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const TIMEOUT_MS = 8000
const COUNTRY = "US"

export interface ItunesArtist {
  artistId: number
  name: string
  genre?: string
}

export interface ItunesAlbum {
  collectionId: number
  album: string
  artist: string
  artistId?: number
  cover?: string
  year?: string
  trackCount?: number
  genre?: string
}

export interface ItunesTrack {
  trackId: number
  title: string
  artist: string
  album: string
  cover?: string
  duration?: number
  trackNumber?: number
  previewUrl?: string
}

function pick(v: any): string | undefined {
  const s = (v ?? "").toString().trim()
  return s ? s : undefined
}

/** 100x100 → 600x600 高清封面 */
function upscale(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/\/\d+x\d+bb\./, "/600x600bb.")
}

function yearOf(releaseDate: string | undefined): string | undefined {
  if (!releaseDate) return undefined
  const m = /^(\d{4})/.exec(releaseDate)
  return m ? m[1] : undefined
}

function toAlbum(raw: any): ItunesAlbum {
  return {
    collectionId: raw.collectionId,
    album: raw.collectionName ?? "",
    artist: raw.artistName ?? "",
    artistId: raw.artistId,
    cover: upscale(raw.artworkUrl100 ?? raw.artworkUrl60),
    year: yearOf(raw.releaseDate),
    trackCount: typeof raw.trackCount === "number" ? raw.trackCount : undefined,
    genre: pick(raw.primaryGenreName),
  }
}

function toTrack(raw: any): ItunesTrack {
  return {
    trackId: raw.trackId,
    title: raw.trackName ?? "",
    artist: raw.artistName ?? "",
    album: raw.collectionName ?? "",
    cover: upscale(raw.artworkUrl100 ?? raw.artworkUrl60),
    duration: raw.trackTimeMillis ? Math.round(raw.trackTimeMillis / 1000) : undefined,
    trackNumber: typeof raw.trackNumber === "number" ? raw.trackNumber : undefined,
    previewUrl: pick(raw.previewUrl),
  }
}

class ItunesBrowseSource {
  /** 轻量内存缓存：key = 方法名+参数。 */
  private cache = new Map<string, any>()

  private async getJson(url: string): Promise<any | null> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal })
      if (!resp.ok) return null
      return await resp.json()
    } catch (e) {
      console.error("[itunes_browse] 请求失败:", url, e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }

  async searchArtists(q: string, limit = 25): Promise<ItunesArtist[]> {
    const key = `sa|${q}|${limit}`
    if (this.cache.has(key)) return this.cache.get(key)
    const url = `${SEARCH}?term=${encodeURIComponent(q)}&media=music&entity=musicArtist&limit=${limit}&country=${COUNTRY}`
    const json = await this.getJson(url)
    const list: ItunesArtist[] = (json?.results ?? [])
      .filter((r: any) => r.artistType === "Artist" && r.artistId)
      .map((r: any) => ({ artistId: r.artistId, name: r.artistName ?? "", genre: pick(r.primaryGenreName) }))
      .filter((a: ItunesArtist) => !!a.name)
    this.cache.set(key, list)
    return list
  }

  async searchAlbums(q: string, limit = 25): Promise<ItunesAlbum[]> {
    const key = `sal|${q}|${limit}`
    if (this.cache.has(key)) return this.cache.get(key)
    const url = `${SEARCH}?term=${encodeURIComponent(q)}&media=music&entity=album&limit=${limit}&country=${COUNTRY}`
    const json = await this.getJson(url)
    const list: ItunesAlbum[] = (json?.results ?? [])
      .filter((r: any) => r.collectionType === "Album" && r.collectionId)
      .map(toAlbum)
      .filter((a: ItunesAlbum) => !!a.album)
    this.cache.set(key, list)
    return list
  }

  /** 某艺人全部专辑（首条 artist 行已过滤），按年份降序。 */
  async artistAlbums(artistId: number, limit = 50): Promise<ItunesAlbum[]> {
    const key = `aa|${artistId}|${limit}`
    if (this.cache.has(key)) return this.cache.get(key)
    const url = `${LOOKUP}?id=${artistId}&entity=album&limit=${limit}&country=${COUNTRY}`
    const json = await this.getJson(url)
    const list: ItunesAlbum[] = (json?.results ?? [])
      .filter((r: any) => r.wrapperType === "collection" && r.collectionId)
      .map(toAlbum)
      .filter((a: ItunesAlbum) => !!a.album)
      .sort((a: ItunesAlbum, b: ItunesAlbum) => (b.year ?? "").localeCompare(a.year ?? ""))
    this.cache.set(key, list)
    return list
  }

  /** 某专辑信息 + 曲目（按 trackNumber 升序）。 */
  async albumTracks(collectionId: number): Promise<{ album: ItunesAlbum | null, tracks: ItunesTrack[] }> {
    const key = `at|${collectionId}`
    if (this.cache.has(key)) return this.cache.get(key)
    const url = `${LOOKUP}?id=${collectionId}&entity=song&country=${COUNTRY}`
    const json = await this.getJson(url)
    const results: any[] = json?.results ?? []
    const albumRaw = results.find(r => r.wrapperType === "collection")
    const album = albumRaw ? toAlbum(albumRaw) : null
    const tracks: ItunesTrack[] = results
      .filter(r => r.wrapperType === "track" && r.kind === "song" && r.trackId)
      .map(toTrack)
      .filter((t: ItunesTrack) => !!t.title)
      .sort((a: ItunesTrack, b: ItunesTrack) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0))
    const out = { album, tracks }
    this.cache.set(key, out)
    return out
  }
}

export const itunesBrowse = new ItunesBrowseSource()
