import { fetch } from "scripting"

/**
 * 艺人信息源（TheAudioDB）。
 *
 * 用途：艺人列表行头像 + 艺人详情页大图/简介/结构化信息。
 *
 * 数据源选型（2026-06-30 node 实测）：
 * - iTunes：只有 name/genre/url，给不了图和简介。
 * - TheAudioDB：免 key（测试 key=2），图片域名 r2.theaudiodb.com 可达。✔ 选用
 * - Deezer / Wikipedia / Wikidata：本网络环境超时屏蔽，弃用。
 * - MusicBrainz：TLS 间歇失败且无图无简介，弃用。
 *
 * 接口：GET https://www.theaudiodb.com/api/v1/json/2/search.php?s=<艺人名>
 * 返回 { artists: [ {...} | null ] }，取 artists[0]。
 * - 图片（均 https://r2.theaudiodb.com）：strArtistThumb（方形头像）、strArtistFanart（宽幅横图）。
 * - 简介：strBiographyCN（中文，优先）→ strBiography（英文）。
 * - 结构化：intFormedYear/intBornYear/strCountry/strGenre/strStyle/intMembers/strWebsite。
 *
 * 局限：华语/冷门艺人可能查不到（实测「周杰伦」NO RESULT）→ 调用方降级。
 */

const ENDPOINT = "https://www.theaudiodb.com/api/v1/json/2/search.php"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
const TIMEOUT_MS = 8000

export interface ArtistInfo {
  name: string
  thumb?: string
  fanart?: string
  biography?: string
  formedYear?: string
  bornYear?: string
  country?: string
  genre?: string
  style?: string
  members?: string
  website?: string
}

function normalize(name: string): string {
  return (name || "").trim().toLowerCase()
}

class ArtistInfoSource {
  /** key=normalize(name)。值为 ArtistInfo（命中）或 null（已查无）。 */
  private cache = new Map<string, ArtistInfo | null>()
  /** 进行中的请求去重，避免同一艺人并发多次请求。 */
  private inflight = new Map<string, Promise<ArtistInfo | null>>()

  /**
   * 拉取艺人信息。命中缓存（含 null）直接返回；
   * 网络失败 / 未命中 / 匹配护栏不过 → 返回 null 并缓存 null。
   */
  async fetch(name: string): Promise<ArtistInfo | null> {
    const key = normalize(name)
    if (!key) return null
    if (this.cache.has(key)) return this.cache.get(key)!
    const existing = this.inflight.get(key)
    if (existing) return existing

    const task = this.doFetch(name, key)
    this.inflight.set(key, task)
    try {
      return await task
    } finally {
      this.inflight.delete(key)
    }
  }

  private async doFetch(name: string, key: string): Promise<ArtistInfo | null> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const url = `${ENDPOINT}?s=${encodeURIComponent(name)}`
      const resp = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal })
      const json = await resp.json() as { artists?: any[] }
      const raw = json?.artists?.[0]
      if (!raw) {
        this.cache.set(key, null)
        return null
      }

      // 匹配护栏：返回的艺人名规整化后需与查询名吻合（相等或互相包含）。
      const got = normalize(raw.strArtist ?? "")
      const matched = got === key || got.includes(key) || key.includes(got)
      if (!got || !matched) {
        this.cache.set(key, null)
        return null
      }

      const pick = (v: any): string | undefined => {
        const s = (v ?? "").toString().trim()
        return s ? s : undefined
      }

      const info: ArtistInfo = {
        name: raw.strArtist || name,
        thumb: pick(raw.strArtistThumb),
        fanart: pick(raw.strArtistFanart),
        biography: pick(raw.strBiographyCN) ?? pick(raw.strBiography),
        formedYear: pick(raw.intFormedYear),
        bornYear: pick(raw.intBornYear),
        country: pick(raw.strCountry),
        genre: pick(raw.strGenre),
        style: pick(raw.strStyle),
        members: pick(raw.intMembers),
        website: pick(raw.strWebsite),
      }
      this.cache.set(key, info)
      return info
    } catch (e) {
      // 网络失败（超时/无网）：不缓存 null，下次可重试；本次降级到占位。
      console.error("[艺人信息] 拉取失败:", name, e)
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

export const artistInfo = new ArtistInfoSource()
