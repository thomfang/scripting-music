import { source001co } from "./sources/source_001co"
import { sourceMP3Juice, MP3JUICE_PROVIDER } from "./sources/source_mp3juice"
import type { ResolveInput } from "./sources/source"

export type MusicProvider =
  | "livepoo" | "migu" | "qqmp3" | "qq" | "bugu" | "gequhai" | "gequbao"
  | "mp3juice"

/** 官方支持的 provider 白名单。不在列表里的 等同于无效 provider，需要被修复页处理。 */
export const SUPPORTED_PROVIDERS: readonly MusicProvider[] = [
  "livepoo", "migu", "qqmp3", "qq", "bugu", "gequhai", "gequbao", "mp3juice"
] as const

export function isSupportedProvider(p: string | undefined | null): p is MusicProvider {
  if (!p) return false
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p.trim())
}

/** 搜索源标识（搜索后端的选择，与单条结果的 provider 不同） */
export type SourceId = "001co" | "mp3juice"

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
  /** 兼容旧引用：001co 基址 */
  base = "https://001-co.vercel.app"

  /**
   * 搜索。`source` 选择搜索后端：
   * - "001co"：聚合源（跨 migu/qq/... 多 provider）
   * - "mp3juice"：YouTube 音视频源
   */
  async search(
    query: string,
    source: SourceId = "001co"
  ): Promise<{ items: MusicData[] }> {
    try {
      const items = source === MP3JUICE_PROVIDER
        ? await sourceMP3Juice.search(query)
        : await source001co.search(query)
      return { items }
    } catch (error) {
      console.error("搜索API错误:", error)
      throw error
    }
  }

  /**
   * 同步拼接音频直链。**仅适用于 001co 系 provider**（历史调用点兼容）。
   * mp3juice 等异步源请改用 `resolveAudioUrl`。
   */
  getAudioUrl(id: string, provider: MusicProvider): string {
    return source001co.getAudioUrl(id, provider)
  }

  /**
   * 统一异步解析最终音频直链。按 `info.provider` 路由：
   * - "mp3juice" → savetube 多步解析（短时直链）
   * - 其它（001co 系）→ 同步拼接
   */
  async resolveAudioUrl(info: ResolveInput): Promise<string> {
    if (info.provider === MP3JUICE_PROVIDER) {
      return sourceMP3Juice.resolveAudioUrl(info)
    }
    return source001co.resolveAudioUrl(info)
  }

  /** 解析视频直链（目前仅 mp3juice 支持） */
  async resolveVideoUrl(info: ResolveInput): Promise<string> {
    if (info.provider === MP3JUICE_PROVIDER) {
      return sourceMP3Juice.resolveVideoUrl(info)
    }
    throw new Error(`provider ${info.provider} 不支持视频直链`)
  }

  /** 供 UI 列出可选搜索源 */
  listSources(): { id: SourceId; label: string }[] {
    return [
      { id: "001co", label: source001co.label },
      { id: "mp3juice", label: sourceMP3Juice.label },
    ]
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
