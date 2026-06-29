import { sourceMP3Juice, MP3JUICE_PROVIDER } from "./sources/source_mp3juice"
import type { ResolveInput } from "./sources/source"

/**
 * provider 现仅保留 mp3juice。历史 provider 字面量保留在类型里，
 * 仅用于兼容老数据库记录的读取/诊断，不再作为可搜索源。
 */
export type MusicProvider =
  | "livepoo" | "migu" | "qqmp3" | "qq" | "bugu" | "gequhai" | "gequbao"
  | "mp3juice"

/** 官方支持的 provider 白名单。 */
export const SUPPORTED_PROVIDERS: readonly MusicProvider[] = [
  "mp3juice"
] as const

export function isSupportedProvider(p: string | undefined | null): p is MusicProvider {
  if (!p) return false
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p.trim())
}

export type MusicData = {
  id: string
  title: string
  provider: string
  artist?: string
  cover?: string
  album?: string
  duration?: number
}

export type { ResolveInput }

class Music {
  /** 搜索：固定走 MP3Juice 源（含 iTunes 元数据富化）。 */
  async search(query: string): Promise<{ items: MusicData[] }> {
    try {
      const items = await sourceMP3Juice.search(query)
      return { items }
    } catch (error) {
      console.error("搜索API错误:", error)
      throw error
    }
  }

  /**
   * 统一异步解析最终音频直链。mp3juice 走 savetube 多步解析（短时直链）。
   */
  async resolveAudioUrl(info: ResolveInput): Promise<string> {
    return sourceMP3Juice.resolveAudioUrl(info)
  }

  /** 解析视频直链（mp4） */
  async resolveVideoUrl(info: ResolveInput): Promise<string> {
    return sourceMP3Juice.resolveVideoUrl(info)
  }

  /** 旧的 download 接口（实际下载走 fetch_downloader，此处保留兼容） */
  async download(id: string, provider: MusicProvider) {
    const url = await this.resolveAudioUrl({ id, provider, title: "", source_id: id })
    const { fetch } = await import("scripting")
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.bytes()
  }
}

export const music = new Music()
export { MP3JUICE_PROVIDER }
