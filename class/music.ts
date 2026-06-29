import { fetch } from "scripting"

export type MusicProvider = "livepoo" | "migu" | "qqmp3" | "qq" | "bugu" | "gequhai" | "gequbao"

/** 官方支持的 provider 白名单。不在列表里的 等同于无效 provider，需要被修复页处理。 */
export const SUPPORTED_PROVIDERS: readonly MusicProvider[] = [
  "livepoo", "migu", "qqmp3", "qq", "bugu", "gequhai", "gequbao"
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

class Music {
  base = "https://001-co.vercel.app"

  async search(
    query: string,
    provider: MusicProvider | "all" = "all"
  ): Promise<{ items: MusicData[] }> {
    try {
      const url = `${this.base}/api/search?q=${encodeURIComponent(query)}&provider=${provider}`
      console.log("搜索URL:", url)
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }
      const data = await response.json()
      console.log("搜索结果:", data)
      return data
    } catch (error) {
      console.error("搜索API错误:", error)
      throw error
    }
  }

  getAudioUrl(id: string, provider: MusicProvider): string {
    return `${this.base}/api/download?id=${id}&provider=${provider}&filename=co.mp3`
  }

  async download(id: string, provider: MusicProvider) {
    const response = await fetch(
      `${this.base}/api/download?id=${id}&provider=${provider}&filename=co.mp3`
    )
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return await response.bytes()
  }
}

export const music = new Music()
