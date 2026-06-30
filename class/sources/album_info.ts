import { fetch } from "scripting"

/**
 * 专辑信息源（TheAudioDB）。
 *
 * 用途：专辑列表行封面 + 专辑详情页大图/简介/结构化信息。
 *
 * 数据源选型（2026-06-30 node 实测，与 artist_info 同源同域）：
 * - TheAudioDB：免 key（测试 key=2），图片域 r2.theaudiodb.com 可达。✔ 选用
 * - iTunes：有封面但无专辑简介/年代/厂牌等结构化信息。
 *
 * 接口：GET https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=<艺人名>&a=<专辑名>
 * 返回 { album: [ {...} | null ] }，取 album[0]。
 * - 封面（均 https://r2.theaudiodb.com）：strAlbumThumbHQ（高清，部分专辑才有）→ strAlbumThumb（方形）。
 * - 简介：strDescription（英文）。无中文字段；空串视为无。
 * - 结构化：intYearReleased / strGenre / strStyle / strLabel / strReleaseFormat / strMood / intScore。
 *
 * 局限：华语/冷门专辑可能查不到（实测「周杰伦/范特西」NO RESULT）→ 调用方降级到本地封面/占位。
 */

const ENDPOINT = "https://www.theaudiodb.com/api/v1/json/2/searchalbum.php"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const TIMEOUT_MS = 8000

export interface AlbumInfo {
  album: string
  artist: string
  thumb?: string
  description?: string
  year?: string
  genre?: string
  style?: string
  label?: string
  format?: string
  mood?: string
  score?: string
}

function normalize(name: string): string {
  return (name || "").trim().toLowerCase()
}

function keyOf(artist: string, album: string): string {
  return `${normalize(artist)}|${normalize(album)}`
}

class AlbumInfoSource {
  /** key=normalize(artist)|normalize(album)。值为 AlbumInfo（命中）或 null（已查无）。 */
  private cache = new Map<string, AlbumInfo | null>()
  /** 进行中的请求去重，避免同一专辑并发多次请求。 */
  private inflight = new Map<string, Promise<AlbumInfo | null>>()

  /**
   * 拉取专辑信息。命中缓存（含 null）直接返回；
   * 网络失败 / 未命中 / 匹配护栏不过 → 返回 null；查无/护栏不过会缓存 null，网络失败不缓存（可重试）。
   */
  async fetch(artist: string, album: string): Promise<AlbumInfo | null> {
    const a = normalize(artist)
    const al = normalize(album)
    if (!a || !al) return null
    const key = keyOf(artist, album)
    if (this.cache.has(key)) return this.cache.get(key)!
    const existing = this.inflight.get(key)
    if (existing) return existing

    const task = this.doFetch(artist, album, a, al, key)
    this.inflight.set(key, task)
    try {
      return await task
    } finally {
      this.inflight.delete(key)
    }
  }

  private async doFetch(artist: string, album: string, artistKey: string, albumKey: string, key: string): Promise<AlbumInfo | null> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const url = `${ENDPOINT}?s=${encodeURIComponent(artist)}&a=${encodeURIComponent(album)}`
      const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal })
      const json = await resp.json() as { album?: any[] }
      const raw = json?.album?.[0]
      if (!raw) {
        this.cache.set(key, null)
        return null
      }

      // 匹配护栏：返回的专辑名与艺人名规整化后都需与查询吻合（相等或互相包含）。
      const gotAlbum = normalize(raw.strAlbum ?? "")
      const gotArtist = normalize(raw.strArtist ?? "")
      const albumMatched = !!gotAlbum && (gotAlbum === albumKey || gotAlbum.includes(albumKey) || albumKey.includes(gotAlbum))
      const artistMatched = !!gotArtist && (gotArtist === artistKey || gotArtist.includes(artistKey) || artistKey.includes(gotArtist))
      if (!albumMatched || !artistMatched) {
        this.cache.set(key, null)
        return null
      }

      const pick = (v: any): string | undefined => {
        const s = (v ?? "").toString().trim()
        return s ? s : undefined
      }

      const info: AlbumInfo = {
        album: raw.strAlbum || album,
        artist: raw.strArtist || artist,
        thumb: pick(raw.strAlbumThumbHQ) ?? pick(raw.strAlbumThumb),
        description: pick(raw.strDescription),
        year: pick(raw.intYearReleased),
        genre: pick(raw.strGenre),
        style: pick(raw.strStyle),
        label: pick(raw.strLabel),
        format: pick(raw.strReleaseFormat),
        mood: pick(raw.strMood),
        score: pick(raw.intScore),
      }
      this.cache.set(key, info)
      return info
    } catch (e) {
      // 网络失败（超时/无网）：不缓存 null，下次可重试；本次降级到本地封面/占位。
      console.error("[专辑信息] 拉取失败:", artist, album, e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const albumInfo = new AlbumInfoSource()
