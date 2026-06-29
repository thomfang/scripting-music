import { fetch } from "scripting"
import type { MusicData, MusicProvider } from "../music"
import type { MusicSource, ResolveInput } from "./source"
import { aesCbcDecrypt } from "./aes_cbc"
import { enrichBatch } from "./itunes_meta"

/**
 * MP3Juice 源适配器（mp3juice3.ninja 搜索 + savetube.vip 下载）。
 *
 * 逆向流程（已真机实跑验证，见 spec 第 3 节）：
 * 1) 搜索: POST mp3juice3.ninja/api/yt-data {query} -> {items:[{id,title,duration,thumbnail,url}]}
 * 2) 取直链:
 *    a. GET media.savetube.vip/api/random-cdn -> {cdn}
 *    b. POST https://<cdn>/v2/info {url} -> {data: base64(AES-128-CBC, iv=前16字节)}
 *       解密 key 固定: C5D58EF67A7584E4A29F6C35BBC4EB12
 *    c. mp3: POST https://<cdn>/download {downloadType:"audio",quality:128,key} -> {data:{downloadUrl}}
 *       mp4: 解密 info 的 video_formats[i].url
 *
 * 注意：savetube 直链为短时签名，不入库久存，每次播放/下载实时解析。
 */

const SEARCH_API = "https://mp3juice3.ninja/api/yt-data"
const RANDOM_CDN_API = "https://media.savetube.vip/api/random-cdn"
const AES_KEY_HEX = "C5D58EF67A7584E4A29F6C35BBC4EB12"

export const MP3JUICE_PROVIDER = "mp3juice"

function hexToBytes(hex: string): Uint8Array {
  const m = hex.match(/[\dA-F]{2}/gi)
  if (!m) throw new Error("invalid hex key")
  return new Uint8Array(m.map(b => parseInt(b, 16)))
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s/g, ""))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** "3:57" / "1:02:03" -> 秒 */
function parseDuration(s: string | undefined): number {
  if (!s) return 0
  const parts = s.split(":").map(x => parseInt(x, 10))
  if (parts.some(isNaN)) return 0
  return parts.reduce((acc, v) => acc * 60 + v, 0)
}

type DecryptedInfo = {
  key: string
  title: string
  audio_formats?: any[]
  video_formats?: { url?: string | null; quality?: number; label?: string; default_selected?: number }[]
}

class SourceMP3Juice implements MusicSource {
  readonly id = MP3JUICE_PROVIDER as unknown as MusicProvider
  readonly label = "MP3Juice"
  readonly isAggregator = false

  async search(query: string): Promise<MusicData[]> {
    const resp = await fetch(SEARCH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({ query }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
    const data = await resp.json()
    const items = (data?.items ?? []) as any[]

    const base: MusicData[] = items.map(it => ({
      id: String(it.id),
      title: String(it.title ?? ""),
      provider: MP3JUICE_PROVIDER,
      artist: "",
      cover: it.thumbnail ?? "",
      album: "",
      duration: parseDuration(it.duration),
    } as MusicData))

    // iTunes 元数据富化：补 artist/album/高清封面/时长（置信度护栏，失败不阻断）
    try {
      const metas = await enrichBatch(base, m => m.title, 4)
      base.forEach((m, i) => {
        const meta = metas[i]
        if (!meta?.matched) return
        if (meta.artist) m.artist = meta.artist
        if (meta.album) m.album = meta.album
        if (meta.cover) m.cover = meta.cover
        if (meta.duration && (!m.duration || m.duration === 0)) m.duration = meta.duration
      })
    } catch (e) {
      console.log(`[mp3juice] iTunes 富化跳过: ${e}`)
    }

    return base
  }

  private async getCdn(): Promise<string> {
    const r = await fetch(RANDOM_CDN_API)
    if (!r.ok) throw new Error(`random-cdn HTTP ${r.status}`)
    const j = await r.json()
    if (!j?.cdn) throw new Error("random-cdn 无 cdn 字段")
    return j.cdn as string
  }

  private async decryptInfo(dataB64: string): Promise<DecryptedInfo> {
    const all = base64ToBytes(dataB64)
    if (all.length < 16) throw new Error("加密数据长度不足")
    const iv = all.slice(0, 16)
    const ct = all.slice(16)
    // Scripting 的 WebCrypto/原生 Crypto 仅支持 AES-GCM，此处用自带纯 JS AES-CBC
    const plain = aesCbcDecrypt(ct, hexToBytes(AES_KEY_HEX), iv)
    return JSON.parse(new TextDecoder().decode(plain))
  }

  /** videoUrl 由 source_id(=videoId) 构造 */
  private youtubeUrl(info: ResolveInput): string {
    const vid = info.source_id ?? info.id
    return `https://www.youtube.com/watch?v=${vid}`
  }

  private async fetchInfo(cdn: string, youtubeUrl: string): Promise<DecryptedInfo> {
    const infoResp = await fetch(`https://${cdn}/v2/info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({ url: youtubeUrl }),
    })
    if (!infoResp.ok) throw new Error(`/v2/info HTTP ${infoResp.status}`)
    const outer = await infoResp.json()
    if (!outer?.data) throw new Error("/v2/info 无 data 字段")
    return this.decryptInfo(outer.data)
  }

  async resolveAudioUrl(info: ResolveInput): Promise<string> {
    const cdn = await this.getCdn()
    const decoded = await this.fetchInfo(cdn, this.youtubeUrl(info))
    const dlResp = await fetch(`https://${cdn}/download`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
      },
      body: JSON.stringify({ downloadType: "audio", quality: 128, key: decoded.key }),
    })
    if (!dlResp.ok) throw new Error(`/download HTTP ${dlResp.status}`)
    const dl = await dlResp.json()
    const url = dl?.data?.downloadUrl
    if (!url) throw new Error("/download 无 downloadUrl")
    return url as string
  }

  async resolveVideoUrl(info: ResolveInput): Promise<string> {
    const cdn = await this.getCdn()
    const decoded = await this.fetchInfo(cdn, this.youtubeUrl(info))
    const formats = decoded.video_formats ?? []
    const f = formats.find(x => x.url && x.default_selected) || formats.find(x => x.url)
    if (!f?.url) throw new Error("无可用 mp4 直链")
    return f.url
  }
}

export const sourceMP3Juice = new SourceMP3Juice()
