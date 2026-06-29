import { fetch } from "scripting"
import type { MusicData, MusicProvider } from "../music"
import type { MusicSource, ResolveInput } from "./source"

/**
 * 001-co 聚合源适配器。包装原 music.ts 中的 search / getAudioUrl 逻辑。
 * 自包含（不在运行时反向依赖 music.ts），仅引入类型，避免循环依赖。
 */
class Source001co implements MusicSource {
  readonly id = "001co" as unknown as MusicProvider // 占位标识，仅用于源注册/UI；实际 item.provider 由后端返回
  readonly label = "聚合源"
  readonly isAggregator = true

  base = "https://001-co.vercel.app"

  async search(query: string): Promise<MusicData[]> {
    const url = `${this.base}/api/search?q=${encodeURIComponent(query)}&provider=all`
    console.log("[001co] 搜索URL:", url)
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.json()
    return (data?.items ?? []) as MusicData[]
  }

  /** 同步拼接直链（原 music.getAudioUrl 逻辑） */
  getAudioUrl(id: string, provider: MusicProvider): string {
    return `${this.base}/api/download?id=${id}&provider=${provider}&filename=co.mp3`
  }

  async resolveAudioUrl(info: ResolveInput): Promise<string> {
    if (info.audio_url) return info.audio_url
    const id = info.source_id ?? info.id
    return this.getAudioUrl(id, info.provider as MusicProvider)
  }
}

export const source001co = new Source001co()
