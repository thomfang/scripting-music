import { fetch, AbortController } from "scripting"
import { database } from "./database"
import { fileManager } from "./file_manager"
import { writeBytesCompat } from "./write_compat"
import { MusicProvider, music } from "./music"
import { lyrics } from "./sources/lyrics"
import { ID3Writer } from "../module/browser-id3-writer"
import { detectAudioFormat } from "./audio_format"
import { MATCH_THRESHOLD, pickBestMatch, rankCandidates } from "../page/setting/resource_repair_match"

type MusicInfo = {
  id: string
  provider: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  audio_url?: string
  /** provider 侧 id，如 local id 差异于 provider id 时传入；与修复页保持一致 */
  source_id?: string
}

type ResolvedMusicInfo = MusicInfo & {
  provider: MusicProvider
}

type DownloadTask = {
  taskId: string
  musicInfo: MusicInfo
  abortController: AbortController
  isPaused: boolean
  /** 当前 part 文件对应的已解析直链 URL；与本次 audio_url 不符则不能用 Range 续传。 */
  partUrl?: string
}

type ProgressCallback = (progress: number, status: "downloading" | "completed" | "failed" | "cancelled" | "paused", received?: number, total?: number) => void

class FetchDownloader {
  private tasks = new Map<string, DownloadTask>()
  private isBackgroundActive = false
  private progressCallbacks = new Map<string, ProgressCallback>()
  private readonly retryProviders: MusicProvider[] = ["livepoo", "migu", "qqmp3", "qq", "bugu", "gequhai", "gequbao"]

  onProgress(musicId: string, cb: ProgressCallback): () => void {
    this.progressCallbacks.set(musicId, cb)
    return () => this.progressCallbacks.delete(musicId)
  }

  async init() {
    console.log(`[FetchDownloader] 初始化完成`)
  }

  async downloadMusic(info: MusicInfo): Promise<void> {
    if (this.tasks.has(info.id)) {
      console.log(`[下载] ${info.title} 已在下载队列中`)
      return
    }
    if (await fileManager.audioExists(info.id)) {
      console.log(`[下载] ${info.title} 已存在`)
      return
    }

    const resolvedInfo = await this.resolveDownloadInfo(info)
    const taskId = await database.createDownloadTask(info.id)
    console.log(`[下载开始] ${resolvedInfo.title}`)

    try {
      const abortController = new AbortController()
      this.tasks.set(info.id, {
        taskId,
        musicInfo: resolvedInfo,
        abortController,
        isPaused: false
      })

      await this.startBackgroundKeeper()
      await this.performDownload(info.id)
    } catch (error) {
      console.error(`[下载失败] ${resolvedInfo.title}: ${error}`)
      await database.updateDownloadTask(taskId, "failed", 0, String(error))
      this.tasks.delete(info.id)
      await this.stopBackgroundKeeperIfNeeded()
      throw error
    }
  }

  private async resolveDownloadInfo(info: MusicInfo): Promise<ResolvedMusicInfo> {
    const primaryProvider = this.normalizeProvider(info.provider)
    const isShortLived = info.provider === "mp3juice"
    const resolvedUrl = (isShortLived || !info.audio_url)
      ? await music.resolveAudioUrl({
          id: info.id, provider: info.provider, title: info.title,
          artist: info.artist, album: info.album, duration: info.duration,
          source_id: info.source_id ?? info.id,
          audio_url: isShortLived ? undefined : info.audio_url,
        })
      : info.audio_url
    const initialInfo: ResolvedMusicInfo = {
      ...info,
      provider: primaryProvider,
      source_id: info.source_id ?? info.id,
      audio_url: resolvedUrl,
    }

    try {
      await this.assertAudioReachable(initialInfo)
      return initialInfo
    } catch (error) {
      console.log(`[下载重试] ${info.title} 主源失效，开始搜索候选: ${error}`)
    }

    const repaired = await this.findReplacementSource(initialInfo)
    if (!repaired) return initialInfo

    console.log(`[下载重试] ${info.title} 切换到 ${repaired.provider} / ${repaired.source_id}`)
    return repaired
  }

  private normalizeProvider(provider: string): MusicProvider {
    if (provider === "mp3juice") return "mp3juice"
    if (this.retryProviders.includes(provider as MusicProvider)) return provider as MusicProvider
    return "migu"
  }

  private async assertAudioReachable(info: ResolvedMusicInfo): Promise<void> {
    const response = await fetch(info.audio_url!)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
  }

  private async findReplacementSource(info: ResolvedMusicInfo): Promise<ResolvedMusicInfo | null> {
    const queries = Array.from(new Set([
      [info.title, info.artist].filter(Boolean).join(" ").trim(),
      [info.title, info.artist, info.album].filter(Boolean).join(" ").trim(),
      info.title.trim(),
    ].filter(Boolean)))

    for (const query of queries) {
      try {
        const { items } = await music.search(query)
        const best = pickBestMatch({
          title: info.title,
          artist: info.artist,
          album: info.album,
          duration: info.duration,
        }, items)
        if (!best || best.score < MATCH_THRESHOLD) continue

        const ranked = rankCandidates({
          title: info.title,
          artist: info.artist,
          album: info.album,
          duration: info.duration,
        }, items, 8).filter(x => x.score >= MATCH_THRESHOLD)

        const candidates = [
          ...ranked.filter(x => this.normalizeProvider(x.item.provider) !== info.provider),
          ...ranked.filter(x => this.normalizeProvider(x.item.provider) === info.provider),
        ]

        for (const cand of candidates) {
          const provider = this.normalizeProvider(cand.item.provider)
          const sourceId = cand.item.id
          let candAudioUrl: string
          try {
            candAudioUrl = await music.resolveAudioUrl({
              id: cand.item.id, provider: cand.item.provider,
              title: cand.item.title || info.title,
              artist: cand.item.artist || info.artist,
              album: cand.item.album || info.album,
              duration: cand.item.duration || info.duration,
              source_id: sourceId,
            })
          } catch (error) {
            console.log(`[下载重试] 候选解析失败 ${provider}/${sourceId}: ${error}`)
            continue
          }
          const nextInfo: ResolvedMusicInfo = {
            ...info,
            title: cand.item.title || info.title,
            artist: cand.item.artist || info.artist,
            album: cand.item.album || info.album,
            duration: cand.item.duration || info.duration,
            cover: cand.item.cover || info.cover,
            provider,
            source_id: sourceId,
            audio_url: candAudioUrl,
          }
          try {
            await this.assertAudioReachable(nextInfo)
            return nextInfo
          } catch (error) {
            console.log(`[下载重试] 候选不可达 ${provider}/${sourceId}: ${error}`)
          }
        }
      } catch (error) {
        console.log(`[下载重试] 搜索失败 ${query}: ${error}`)
      }
    }

    return null
  }

  private async performDownload(musicId: string) {
    const task = this.tasks.get(musicId)
    if (!task) return

    const { taskId, musicInfo, abortController } = task
    const url = musicInfo.audio_url!

    try {
      // 断点续传判定：part 存在 && 与当前 URL 同源才能续；否则从头重下。
      let offset = 0
      if (task.partUrl === url && await fileManager.partExists(musicId)) {
        offset = await fileManager.partSize(musicId)
      } else {
        await fileManager.deletePart(musicId)
        task.partUrl = url
      }

      await database.updateDownloadTask(taskId, "downloading", 0)
      console.log(`[下载] ${musicInfo.title} - 开始请求（offset=${offset}）`)

      const response = await fetch(url, {
        signal: abortController.signal,
        headers: offset > 0 ? { Range: `bytes=${offset}-` } : {},
      })

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Range 探测：
      //  - 206：服务端支持续传，继续追写；total 从 Content-Range 解析。
      //  - offset>0 但返回 200：服务端忽略了 Range，part 作废，从头重写。
      let total = 0
      if (response.status === 206) {
        const cr = response.headers.get("content-range") || ""
        const m = cr.match(/\/(\d+)\s*$/)
        total = m ? parseInt(m[1]) : (parseInt(response.headers.get("content-length") || "0") + offset)
      } else {
        // 200：全量响应
        if (offset > 0) {
          console.log(`[下载] ${musicInfo.title} - 服务端不支持 Range，从头重下`)
          await fileManager.deletePart(musicId)
          offset = 0
          task.partUrl = url
        }
        total = parseInt(response.headers.get("content-length") || "0")
      }
      console.log(`[下载] ${musicInfo.title} - 总大小: ${total} 字节（已有 ${offset}）`)

      let downloadedBytes = offset

      // 兼容新旧 Scripting fetch：优先 dataStream（新旧都给 Data chunk），否则 body；chunk 归一化 Uint8Array。
      const resp = response as any
      const stream = resp.dataStream ?? resp.body
      if (!stream) throw new Error("response 没有可读流（body/dataStream 均为空）")
      const reader = stream.getReader()
      while (true) {
        if (task.isPaused) {
          console.log(`[下载暂停] ${musicInfo.title}（保留 part ${downloadedBytes}/${total}）`)
          const p = total > 0 ? (downloadedBytes / total) * 100 : 0
          await database.updateDownloadTask(taskId, "paused", p)
          this.progressCallbacks.get(musicId)?.(p / 100, "paused", downloadedBytes, total)
          try { await reader.cancel() } catch {}
          return
        }

        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue

        const bytes: Uint8Array = typeof (value as any).toUint8Array === "function"
          ? (value as any).toUint8Array()
          : (value as Uint8Array)
        if (!bytes || bytes.length === 0) continue

        await fileManager.appendPart(musicId, bytes)
        downloadedBytes += bytes.length

        const progress = total > 0 ? (downloadedBytes / total) * 100 : 0
        if (Math.floor(progress) % 10 === 0) {
          console.log(`[下载进度] ${musicInfo.title}: ${Math.floor(progress)}% (${downloadedBytes}/${total})`)
        }
        await database.updateDownloadTask(taskId, "downloading", progress)
        this.progressCallbacks.get(musicId)?.(progress / 100, "downloading", downloadedBytes, total)
      }

      const finalBytes = await fileManager.readPart(musicId)
      console.log(`[下载完成] ${musicInfo.title} - 总大小: ${finalBytes.length} 字节`)
      await this.processDownloadedFile(musicId, [finalBytes])
      await fileManager.deletePart(musicId)
    } catch (error: any) {
      console.error(error)
      if (error.name === "AbortError") {
        console.log(`[下载取消] ${musicInfo.title}`)
        await database.updateDownloadTask(taskId, "cancelled", 0)
        await fileManager.deletePart(musicId)
        this.progressCallbacks.get(musicId)?.(0, "cancelled")
      } else {
        console.error(`[下载失败] ${musicInfo.title}: ${error}`)
        await database.updateDownloadTask(taskId, "failed", 0, String(error))
        // 失败不删 part：保留以便重试续传（重试若换 URL 会自动重下）
        this.progressCallbacks.get(musicId)?.(0, "failed")
      }
      this.progressCallbacks.delete(musicId)
      this.tasks.delete(musicId)
      await this.stopBackgroundKeeperIfNeeded()
      throw error
    }
  }

  private async processDownloadedFile(musicId: string, chunks: Uint8Array[]) {
    const task = this.tasks.get(musicId)
    if (!task) return

    const { taskId, musicInfo } = task

    try {
      console.log(`[处理文件] ${musicInfo.title} - 合并数据块`)
      const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const audioData = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of chunks) {
        audioData.set(chunk, offset)
        offset += chunk.length
      }

      const format = detectAudioFormat(audioData)
      console.log(`[处理文件] ${musicInfo.title} - 检测格式: ${format}，原始大小: ${audioData.byteLength} 字节，有封面: ${!!musicInfo.cover}`)

      let finalData: Uint8Array

      const fetchCover = async (): Promise<Uint8Array | null> => {
        if (!musicInfo.cover) return null
        try {
          const r = await fetch(musicInfo.cover)
          if (!r.ok) { console.log(`[封面] 获取失败 HTTP ${r.status}`); return null }
          return await r.bytes()
        } catch (e) {
          console.log(`[封面] 获取异常: ${e}`)
          return null
        }
      }

      if (format === "mp3") {
        // 剥离已有 ID3 标签后重新写入（避免 subarray().buffer bug）
        let rawBuffer = audioData.buffer
        if (audioData[0] === 0x49 && audioData[1] === 0x44 && audioData[2] === 0x33) {
          const tagSize = ((audioData[6] & 0x7f) << 21) | ((audioData[7] & 0x7f) << 14) | ((audioData[8] & 0x7f) << 7) | (audioData[9] & 0x7f)
          rawBuffer = audioData.buffer.slice(tagSize + 10)
        }
        const writer = new ID3Writer(rawBuffer)
        writer.setFrame("TIT2", musicInfo.title).setFrame("TALB", musicInfo.album).setFrame("TPE1", [musicInfo.artist])
        const coverData = await fetchCover()
        if (coverData) {
          writer.setFrame("APIC", { type: 3, data: coverData.buffer, description: "cover" })
          await fileManager.saveCover(musicInfo.id, coverData)
        }
        writer.addTag()
        finalData = new Uint8Array(writer.arrayBuffer)
      } else {
        // 非 MP3 格式直接保存原始数据，封面单独保存
        const coverData = await fetchCover()
        if (coverData) await fileManager.saveCover(musicInfo.id, coverData)
        finalData = audioData
      }

      console.log(`[处理文件] ${musicInfo.title} - 原始: ${audioData.byteLength} 字节，最终: ${finalData.byteLength} 字节`)

      const finalPath = fileManager.getAudioPath(musicInfo.id, format === "mp3" ? "mp3" : format === "unknown" ? "mp3" : format)
      await writeBytesCompat(finalPath, finalData)
      console.log(`[处理文件] ${musicInfo.title} - 已保存到: ${finalPath}`)

      await database.addMusic({
        id: musicInfo.id,
        title: musicInfo.title,
        artist: musicInfo.artist,
        album: musicInfo.album,
        duration: musicInfo.duration,
        cover_url: musicInfo.cover,
        audio_url: musicInfo.audio_url,
        provider: musicInfo.provider,
        source_id: musicInfo.source_id ?? musicInfo.id,
        is_downloaded: true,
        file_size: finalData.byteLength,
        added_at: Date.now()
      })

      // 顺带拉取并本地化歌词（与封面同生命周期；失败静默，不阻断下载）
      try {
        const lyricsResult = await lyrics.fetchLyrics({
          title: musicInfo.title,
          artist: musicInfo.artist,
          album: musicInfo.album,
          duration: musicInfo.duration,
        })
        if (lyricsResult.synced || lyricsResult.plain) {
          await fileManager.saveLyrics(musicInfo.id, lyricsResult)
          console.log(`[歌词] 已本地化: ${musicInfo.title}`)
        }
      } catch (e) {
        console.log(`[歌词] 本地化失败（忽略）: ${e}`)
      }

      await database.updateDownloadTask(taskId, "completed", 100)
      console.log(`[下载成功] ${musicInfo.title}`)
      this.progressCallbacks.get(musicId)?.(1, "completed")
      this.progressCallbacks.delete(musicId)
      this.tasks.delete(musicId)
      await this.stopBackgroundKeeperIfNeeded()
    } catch (error) {
      console.error(`[处理失败] ${musicInfo.title}: ${error}`)
      await database.updateDownloadTask(taskId, "failed", 0, String(error))
      this.tasks.delete(musicId)
      await this.stopBackgroundKeeperIfNeeded()
      throw error
    }
  }

  async pauseDownload(musicId: string) {
    const task = this.tasks.get(musicId)
    if (task && !task.isPaused) {
      task.isPaused = true
      console.log(`[暂停下载] ${task.musicInfo.title}`)
    }
  }

  async resumeDownload(musicId: string) {
    const task = this.tasks.get(musicId)
    if (task && task.isPaused) {
      task.isPaused = false
      console.log(`[恢复下载] ${task.musicInfo.title}`)
      await this.performDownload(musicId)
    }
  }

  async cancelDownload(musicId: string) {
    const task = this.tasks.get(musicId)
    if (task) {
      if (task.isPaused) {
        // 暂停中的 task 没有 in-flight fetch，abort 不会触发；手动收尾。
        console.log(`[取消下载（暂停态）] ${task.musicInfo.title}`)
        try { await database.updateDownloadTask(task.taskId, "cancelled", 0) } catch {}
        await fileManager.deletePart(musicId)
        this.progressCallbacks.get(musicId)?.(0, "cancelled")
        this.progressCallbacks.delete(musicId)
        this.tasks.delete(musicId)
        await this.stopBackgroundKeeperIfNeeded()
      } else {
        task.abortController.abort()
        console.log(`[取消下载] ${task.musicInfo.title}`)
      }
    } else {
      // 无活体 task（如 hydrate/被杀后）：清 part + 标记 DB。
      await fileManager.deletePart(musicId)
      const t = await database.getDownloadTaskByMusicId(musicId)
      if (t) { try { await database.updateDownloadTask(t.id, "cancelled", 0) } catch {} }
    }
  }

  /** 当前是否持有活体（含暂停）task。 */
  hasTask(musicId: string): boolean {
    return this.tasks.has(musicId)
  }

  private async startBackgroundKeeper() {
    if (!this.isBackgroundActive) {
      const playbackState = MediaPlayer.playbackState
      if (playbackState === MediaPlayerPlaybackState.playing) {
        console.log(`[后台保活] 检测到正在播放音乐，跳过启动以避免中断`)
        return
      }
      const success = await BackgroundKeeper.keepAlive()
      this.isBackgroundActive = success
      console.log(`[后台保活] ${success ? "已启动" : "启动失败"}`)
    }
  }

  private async stopBackgroundKeeperIfNeeded() {
    if (this.isBackgroundActive && this.tasks.size === 0) {
      const playbackState = MediaPlayer.playbackState
      if (playbackState === MediaPlayerPlaybackState.playing) {
        console.log(`[后台保活] 检测到正在播放音乐，延迟停止`)
        this.isBackgroundActive = false
        return
      }
      await BackgroundKeeper.stopKeepAlive()
      this.isBackgroundActive = false
      console.log(`[后台保活] 已停止`)
    }
  }

  async batchDownload(infos: MusicInfo[]) {
    for (const info of infos) {
      await this.downloadMusic(info)
    }
  }

  /**
   * 并发下载多首。内部用 N 个 worker 从队列取，保证同时运行任务不超过 concurrency。
   * 特点：
   *   - 已在队列里的（downloadMusic 内部会检查）会被跳过
   *   - 已下载过的（fileExists）会被跳过
   *   - 单首失败不会中断其他；返回统计
   *   - onProgress 回调在每次单首完成/失败/跳过后触发
   */
  async downloadMany(
    infos: MusicInfo[],
    opts: {
      concurrency?: number
      onItemStart?: (info: MusicInfo) => void
      onProgress?: (done: number, total: number, last: { info: MusicInfo, ok: boolean, skipped?: boolean, error?: string }) => void
    } = {}
  ): Promise<{ ok: number; failed: number; skipped: number; errors: Array<{ id: string; title: string; error: string }> }> {
    const concurrency = Math.max(1, opts.concurrency ?? 3)
    const queue = [...infos]
    const total = queue.length
    let done = 0
    let okCount = 0
    let failCount = 0
    let skipCount = 0
    const errors: Array<{ id: string; title: string; error: string }> = []

    const worker = async (): Promise<void> => {
      while (queue.length > 0) {
        const info = queue.shift()!
        let ok = false
        let skipped = false
        let errMsg: string | undefined
        try {
          if (await fileManager.audioExists(info.id)) {
            skipped = true
            ok = true
            skipCount++
          } else if (this.tasks.has(info.id)) {
            skipped = true
            ok = true
            skipCount++
          } else {
            opts.onItemStart?.(info)
            await this.downloadMusic(info)
            ok = true
            okCount++
          }
        } catch (e) {
          ok = false
          errMsg = e instanceof Error ? e.message : String(e)
          failCount++
          errors.push({ id: info.id, title: info.title, error: errMsg })
        } finally {
          done++
          opts.onProgress?.(done, total, { info, ok, skipped, error: errMsg })
        }
      }
    }

    const workers = Array.from({ length: Math.min(concurrency, total) }, () => worker())
    await Promise.all(workers)
    return { ok: okCount, failed: failCount, skipped: skipCount, errors }
  }

  getDownloadingTasks() {
    return Array.from(this.tasks.values())
  }

  async isDownloaded(musicId: string): Promise<boolean> {
    return await fileManager.audioExists(musicId)
  }

  async deleteDownload(musicId: string): Promise<void> {
    await fileManager.deleteAudio(musicId)
    await fileManager.deleteCover(musicId)
    await fileManager.deleteLyrics(musicId)
    await database.updateMusicDownloadStatus(musicId, false)
  }

  async getAllDownloaded(): Promise<string[]> {
    const allMusic = await database.getAllMusic()
    return allMusic.filter(m => m.is_downloaded).map(m => m.id)
  }
}

export const fetchDownloader = new FetchDownloader()