import { Music } from "./database"
import { fileManager } from "./file_manager"
import { downloadCenter } from "./download_center"

export type BatchDownloadProgress = {
  done: number
  total: number
  ok: number
  failed: number
  skipped: number
  currentTitles?: string[]
}

export type DownloadMusicInfo = {
  id: string
  provider: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  audio_url?: string
  source_id?: string
}

export type BatchDownloadResult = {
  ok: number
  failed: number
  skipped: number
  errors: Array<{ id: string; title: string; error: string }>
}

export function toDownloadMusicInfo(music: Music): DownloadMusicInfo {
  return {
    id: music.id,
    provider: music.provider ?? "",
    title: music.title,
    artist: music.artist,
    album: music.album,
    duration: music.duration,
    cover: music.cover_url ?? "",
    audio_url: music.audio_url,
    source_id: music.source_id,
  }
}

/**
 * 批量下载候选：未下载，或数据库标记已下载但本地音频文件丢失。
 */
export async function getBatchDownloadCandidates(musics: Music[]): Promise<Music[]> {
  const candidates: Music[] = []
  for (const music of musics) {
    if (!music.is_downloaded) {
      candidates.push(music)
      continue
    }
    if (!(await fileManager.audioExists(music.id))) {
      candidates.push(music)
    }
  }
  return candidates
}

export async function loadAudioExistsMap(musics: Music[]): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  await Promise.all(musics.map(async music => {
    result[music.id] = music.is_downloaded ? await fileManager.audioExists(music.id) : false
  }))
  return result
}

/**
 * 用已加载的 audioExists 快速判断当前列表是否还有可下载项。
 * 未下载歌曲直接算候选；已下载但 audioExists[id] === false 视为文件丢失，可重新下载。
 */
export function hasBatchDownloadCandidates(musics: Music[], audioExists: Record<string, boolean>): boolean {
  return musics.some(music => !music.is_downloaded || audioExists[music.id] === false)
}

export async function confirmBatchDownload(count: number, title = "下载全部"): Promise<boolean> {
  if (count === 0) {
    await Dialog.alert({ title: "无需下载", message: "所有歌曲都已下载" })
    return false
  }
  return await Dialog.confirm({
    title,
    message: `将下载 ${count} 首歌曲（并发 3）。持续时间取决于网络。`,
    confirmLabel: "开始",
    cancelLabel: "取消",
  })
}

export async function runBatchDownload(
  musics: Music[],
  options: {
    concurrency?: number
    onItemStart?: (info: DownloadMusicInfo) => void
    onProgress?: (done: number, total: number, last: { info: DownloadMusicInfo, ok: boolean, skipped?: boolean, error?: string }) => void
  } = {}
): Promise<BatchDownloadResult> {
  // 走全局下载中心（并发/队列由 center 统一调度），每首入队并 await terminal。
  const infos = musics.map(toDownloadMusicInfo)
  const total = infos.length
  let done = 0, ok = 0, failed = 0
  const skipped = 0
  const errors: Array<{ id: string; title: string; error: string }> = []

  await Promise.all(infos.map(async info => {
    options.onItemStart?.(info)
    try {
      await downloadCenter.enqueue(info)
      ok++
      done++
      options.onProgress?.(done, total, { info, ok: true })
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e)
      failed++
      done++
      errors.push({ id: info.id, title: info.title, error })
      options.onProgress?.(done, total, { info, ok: false, error })
    }
  }))

  return { ok, failed, skipped, errors }
}
