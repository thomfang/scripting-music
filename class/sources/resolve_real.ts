import { music } from "../music"
import { Music } from "../database"

/**
 * 真实音源解析（iTunes 元数据 → mp3juice 真实可播/可下载源）。
 *
 * 背景：iTunes（发现页 RSS、搜索页在线专辑/艺人）给的是元数据，其 trackId
 * 不是 mp3juice/YouTube 的 videoId。mp3juice 的 resolveAudioUrl 只用
 * `source_id ?? id` 拼 `youtube.com/watch?v=<id>`，不会按标题搜索。
 * 因此任何 iTunes 曲目要播放/下载，必须先用「标题 艺人」搜 mp3juice，
 * 拿到首条真实源（真实 id/source_id/provider），再交给 player/downloader。
 *
 * 发现页与在线详情页共用本函数，避免重复实现。
 */

export type ResolveRealMeta = {
  title: string
  artist?: string
  album?: string
  duration?: number
  cover?: string
}

/**
 * 用「标题 艺人」搜 mp3juice，取首条真实可下载源，映射成完整 Music。
 * 未命中返回 null。元数据（专辑/封面/时长）优先用搜索结果，缺失回退传入 meta。
 */
export async function resolveRealMusic(meta: ResolveRealMeta): Promise<Music | null> {
  const query = [meta.title, meta.artist].filter(Boolean).join(" ").trim()
  if (!query) return null
  const { items } = await music.search(query)
  const top = items?.[0]
  if (!top) return null
  return {
    id: top.id,
    title: top.title || meta.title,
    artist: top.artist || meta.artist || "未知艺术家",
    album: top.album || meta.album || "未知专辑",
    duration: top.duration || meta.duration || 0,
    cover_url: top.cover || meta.cover || "",
    audio_url: "",
    provider: top.provider,
    source_id: (top as any).source_id,
    is_downloaded: false,
    added_at: Date.now(),
    play_count: 0,
    is_favorite: false,
  }
}
