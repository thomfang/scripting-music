import { MusicData, MusicProvider } from "../music"

/**
 * 解析音频/视频直链时需要的最小输入。
 * 对齐 database.Music / fetch_downloader.MusicInfo 的关键字段。
 */
export type ResolveInput = {
  id: string
  provider: string
  title: string
  artist?: string
  album?: string
  duration?: number
  /** provider 侧原始 id（mp3juice 下为 YouTube videoId） */
  source_id?: string
  /** 已有的 audio_url（若可用直接复用） */
  audio_url?: string
}

/**
 * 统一的「服务源」抽象。每个源负责：搜索、解析最终可 GET 的音频直链。
 *
 * 设计取舍（见 spec 2026-06-29_12-55_MP3JuiceSource.md）：
 * - resolveAudioUrl 是异步的，以兼容 MP3Juice 这类「多步 + AES 解密 + 短时直链」的源；
 *   001-co 这类「同步拼 URL」的源在实现里直接同步返回即可。
 * - 短时直链不应久存 DB，调用方在播放/下载前实时解析。
 */
export interface MusicSource {
  /** 源标识，与 MusicData.provider 对齐 */
  readonly id: MusicProvider
  /** UI 显示名 */
  readonly label: string
  /** 是否为聚合源（一次搜索可能跨多个底层 provider） */
  readonly isAggregator?: boolean

  search(query: string): Promise<MusicData[]>

  /** 解析可直接 GET 的最终音频直链（mp3 等）。可异步多步。 */
  resolveAudioUrl(info: ResolveInput): Promise<string>

  /** 可选：解析视频直链（mp4） */
  resolveVideoUrl?(info: ResolveInput): Promise<string>
}
