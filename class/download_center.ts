import { fetchDownloader } from "./fetch_downloader"
import { database } from "./database"
import { fileManager } from "./file_manager"

/**
 * 全局下载中心（模块级单例）。
 *
 * 目的：把下载状态从「各页面组件 state」上收成一个跨页面卸载存活的单例，
 * 所有下载统一走它，解决「退出页面就丢进度/看似取消」的问题。
 *
 * 引擎仍是 fetchDownloader（真实 fetch + 断点续传 + ID3/封面/歌词/入库）；
 * 本 store 负责：并发上限 + 等待队列 + 进度聚合 + 订阅通知 + 启动对账。
 */

export type DownloadInfo = {
  id: string
  provider: string
  title: string
  artist: string
  album: string
  duration: number
  cover: string
  source_id?: string
  audio_url?: string
}

export type DownloadStatus =
  | "queued"
  | "downloading"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled"

export type DownloadCenterItem = {
  musicId: string
  info: DownloadInfo
  progress: number // 0..1
  status: DownloadStatus
  error?: string
  /** 已下字节（用于无 content-length 时展示 MB） */
  received?: number
  /** 总字节；0/undefined 表示未知（直链无 content-length），UI 走不确定进度 */
  total?: number
  /** 是否处于「解析真实直链」准备阶段（还没进入 fetch 流） */
  preparing?: boolean
}

type Awaiter = { resolve: () => void; reject: (e: any) => void }

class DownloadCenter {
  private items = new Map<string, DownloadCenterItem>()
  private order: string[] = []
  private queue: string[] = []
  private active = new Set<string>()
  private concurrency = 3
  private subscribers = new Set<() => void>()
  private awaiters = new Map<string, Awaiter>()
  private unsubProgress = new Map<string, () => void>()

  // ===== 订阅 =====

  subscribe(cb: () => void): () => void {
    this.subscribers.add(cb)
    return () => this.subscribers.delete(cb)
  }

  private notify() {
    for (const cb of this.subscribers) {
      try { cb() } catch (e) { console.error("[下载中心] 订阅回调异常:", e) }
    }
  }

  getItems(): DownloadCenterItem[] {
    // 返回浅拷贝：store 内部是原地改属性，若直接返回同引用，
    // React diff 会认为行 props 未变而跳过重渲染（进度/MB 定住不动）。
    return this.order.map(id => this.items.get(id)).filter(Boolean).map(it => ({ ...it! }))
  }

  /** 决定入口显隐：queued/downloading/paused/failed 视为「有任务」，completed/cancelled 不计。 */
  activeCount(): number {
    let n = 0
    for (const it of this.items.values()) {
      if (it.status === "queued" || it.status === "downloading" || it.status === "paused" || it.status === "failed") n++
    }
    return n
  }

  // ===== 启动对账 =====

  async init(): Promise<void> {
    try {
      const tasks = await database.getAllDownloadTasks()
      for (const t of tasks) {
        if (t.status !== "downloading" && t.status !== "pending" && t.status !== "paused") continue
        const music = await database.getMusic(t.music_id).catch(() => null)
        if (!music || music.is_downloaded) continue
        // 上次会话被杀，内存 task 已丢；标记为 paused（可重试/续传），DB 里 downloading 顺手改 paused。
        if (t.status === "downloading" || t.status === "pending") {
          try { await database.updateDownloadTask(t.id, "paused", t.progress) } catch {}
        }
        const item: DownloadCenterItem = {
          musicId: music.id,
          info: {
            id: music.id,
            provider: music.provider ?? "mp3juice",
            title: music.title,
            artist: music.artist,
            album: music.album,
            duration: music.duration,
            cover: music.cover_url ?? "",
            source_id: music.source_id ?? music.id,
          },
          progress: (t.progress ?? 0) / 100,
          status: "paused",
        }
        this.items.set(item.musicId, item)
        this.order.push(item.musicId)
      }
      if (this.items.size > 0) this.notify()
      console.log(`[下载中心] 对账完成，恢复 ${this.items.size} 个中断任务`)
    } catch (e) {
      console.error("[下载中心] 对账失败:", e)
    }
  }

  // ===== 入队 / 调度 =====

  /**
   * 入队一首歌。返回一个在该任务到达 terminal（completed/cancelled）时 resolve、
   * failed 时 reject 的 promise（供 await 处保持原有「下完再刷新」语义）。
   * 已存在活跃/queued 的同 id 会复用其 promise；已完成的直接 resolve。
   */
  enqueue(info: DownloadInfo): Promise<void> {
    const existing = this.items.get(info.id)
    if (existing) {
      if (existing.status === "completed") return Promise.resolve()
      if (existing.status === "downloading" || existing.status === "queued" || existing.status === "paused") {
        // 复用已有 awaiter（如果有）；否则给个新 awaiter。旧 awaiter 先 resolve 避免泄漏。
        const prev = this.awaiters.get(info.id)
        if (prev) prev.resolve()
        return new Promise<void>((resolve, reject) => {
          this.awaiters.set(info.id, { resolve, reject })
        })
      }
      // failed/cancelled → 重新入队
    }

    const item: DownloadCenterItem = {
      musicId: info.id,
      info,
      progress: 0,
      status: "queued",
    }
    this.items.set(info.id, item)
    if (!this.order.includes(info.id)) this.order.push(info.id)
    this.queue.push(info.id)
    this.notify()

    const p = new Promise<void>((resolve, reject) => {
      this.awaiters.set(info.id, { resolve, reject })
    })
    this.pump()
    return p
  }

  private pump() {
    while (this.active.size < this.concurrency && this.queue.length > 0) {
      const id = this.queue.shift()!
      const item = this.items.get(id)
      if (!item || item.status !== "queued") continue
      this.start(id)
    }
  }

  private start(id: string) {
    const item = this.items.get(id)
    if (!item) return
    item.status = "downloading"
    this.active.add(id)
    this.notify()

    // 引擎 downloadMusic 在「已下载」或「已在队列」时会静默早退（不触发任何
    // onProgress），直接委派会导致 item 永远卡在 downloading。先探测并处理。
    ;(async () => {
      try {
        if (await fileManager.audioExists(id)) {
          const it = this.items.get(id)
          if (it) { it.progress = 1; it.status = "completed" }
          this.settle(id, true)
          return
        }
      } catch {}
      this.runEngine(id)
    })()
  }

  private runEngine(id: string) {
    const item = this.items.get(id)
    if (!item) return

    // 未进入 fetch 流前（要先解析真实直链）标记为准备中，避免 UI 看上去像 0% 卡住。
    item.preparing = true
    this.notify()

    // 桥接引擎进度到本 store。
    const unsub = fetchDownloader.onProgress(id, (progress, status, received, total) => this.onEngineProgress(id, progress, status, received, total))
    this.unsubProgress.set(id, unsub)

    fetchDownloader.downloadMusic(item.info as any).catch((e) => {
      // terminal 一般由 onProgress 驱动；这里兜底 failed（若 cb 未触发）。
      const it = this.items.get(id)
      if (it && (it.status === "downloading" || it.status === "queued")) {
        it.status = "failed"
        it.preparing = false
        it.error = e instanceof Error ? e.message : String(e)
        this.settle(id, false, it.error)
      }
    })
  }

  /** 释放并发槽并触发下一个，但不结算 awaiter（用于 paused）。 */
  private freeSlot(id: string) {
    this.active.delete(id)
    const unsub = this.unsubProgress.get(id)
    if (unsub) { unsub(); this.unsubProgress.delete(id) }
    this.pump()
  }

  /** 结算 terminal：释放槽 + resolve/reject awaiter + pump。completed 延时自清。 */
  private settle(id: string, ok: boolean, error?: string) {
    this.active.delete(id)
    const unsub = this.unsubProgress.get(id)
    if (unsub) { unsub(); this.unsubProgress.delete(id) }
    const aw = this.awaiters.get(id)
    if (aw) {
      this.awaiters.delete(id)
      if (ok) aw.resolve()
      else aw.reject(new Error(error ?? "下载失败"))
    }
    this.notify()
    this.pump()
    // 完成项 5s 后自动移除（避免新下载时还看到旧的已完成）。
    const it = this.items.get(id)
    if (it && it.status === "completed") {
      const scheduledId = id
      setTimeout(() => {
        const cur = this.items.get(scheduledId)
        if (cur && cur.status === "completed") {
          this.items.delete(scheduledId)
          this.order = this.order.filter(x => x !== scheduledId)
          this.notify()
        }
      }, 5000)
    }
  }

  // ===== 控制 =====

  async pause(id: string) {
    const it = this.items.get(id)
    if (!it) return
    if (it.status === "downloading") {
      await fetchDownloader.pauseDownload(id)
      // 引擎会在循环里发 "paused" cb，本 store 在 cb 中置 paused + freeSlot。
    } else if (it.status === "queued") {
      // 还没开始，直接从队列摘掉、置 paused。
      this.queue = this.queue.filter(x => x !== id)
      it.status = "paused"
      this.notify()
    }
  }

  async resume(id: string) {
    const it = this.items.get(id)
    if (!it || it.status !== "paused") return
    if (fetchDownloader.hasTask(id)) {
      // 引擎里 task 还活着（同会话暂停）→ 走 resumeDownload（part 命中则 Range 续传）。
      it.status = "downloading"
      this.active.add(id)
      const unsub = this.unsubProgress.get(id)
      if (!unsub) {
        const u = fetchDownloader.onProgress(id, (progress, status, received, total) => this.onEngineProgress(id, progress, status, received, total))
        this.unsubProgress.set(id, u)
      }
      this.notify()
      fetchDownloader.resumeDownload(id).catch((e) => {
        const cur = this.items.get(id)
        if (cur && cur.status === "downloading") {
          cur.status = "failed"
          cur.error = e instanceof Error ? e.message : String(e)
          this.settle(id, false, cur.error)
        }
      })
    } else {
      // 引擎里无 task（对账恢复/被杀）→ 重新从头调度（part 若同源命中则续，换 URL 则重下）。
      it.status = "queued"
      if (!this.queue.includes(id)) this.queue.push(id)
      this.notify()
      this.pump()
    }
  }

  /** resume 场景复用的引擎进度桥（与 start 内联逻辑一致）。 */
  private onEngineProgress(id: string, progress: number, status: string, received?: number, total?: number) {
    const it = this.items.get(id)
    if (!it) return
    if (status === "downloading") {
      it.progress = progress; it.status = "downloading"; it.preparing = false
      if (received != null) it.received = received
      it.total = total && total > 0 ? total : 0
      this.notify()
    }
    else if (status === "paused") {
      it.progress = progress; it.status = "paused"; it.preparing = false
      if (received != null) it.received = received
      it.total = total && total > 0 ? total : 0
      this.freeSlot(id); this.notify()
    }
    else if (status === "completed") { it.progress = 1; it.status = "completed"; it.preparing = false; this.settle(id, true) }
    else if (status === "failed") { it.status = "failed"; it.preparing = false; this.settle(id, false, "下载失败") }
    else if (status === "cancelled") { it.status = "cancelled"; it.preparing = false; this.settle(id, true) }
  }

  async cancel(id: string) {
    const it = this.items.get(id)
    if (!it) return
    await fetchDownloader.cancelDownload(id).catch(() => {})
    this.queue = this.queue.filter(x => x !== id)
    this.active.delete(id)
    const unsub = this.unsubProgress.get(id)
    if (unsub) { unsub(); this.unsubProgress.delete(id) }
    const aw = this.awaiters.get(id)
    if (aw) { this.awaiters.delete(id); aw.resolve() }
    this.items.delete(id)
    this.order = this.order.filter(x => x !== id)
    this.notify()
    this.pump()
  }

  retry(id: string) {
    const it = this.items.get(id)
    if (!it || (it.status !== "failed" && it.status !== "cancelled")) return
    it.status = "queued"
    it.progress = 0
    it.error = undefined
    if (!this.queue.includes(id)) this.queue.push(id)
    this.notify()
    this.pump()
  }

  remove(id: string) {
    const it = this.items.get(id)
    if (!it) return
    if (it.status === "downloading" || it.status === "queued") return // 活跃的不移除
    this.items.delete(id)
    this.order = this.order.filter(x => x !== id)
    this.queue = this.queue.filter(x => x !== id)
    this.notify()
  }

  clearFinished() {
    for (const id of [...this.order]) {
      const it = this.items.get(id)
      if (it && (it.status === "completed" || it.status === "cancelled" || it.status === "failed")) {
        this.items.delete(id)
      }
    }
    this.order = this.order.filter(id => this.items.has(id))
    this.notify()
  }

  async pauseAll() {
    for (const it of this.items.values()) {
      if (it.status === "downloading" || it.status === "queued") await this.pause(it.musicId)
    }
  }

  async resumeAll() {
    for (const it of [...this.items.values()]) {
      if (it.status === "paused") await this.resume(it.musicId)
    }
  }
}

export const downloadCenter = new DownloadCenter()
