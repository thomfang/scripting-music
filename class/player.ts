import { Widget } from "scripting"
import { database, Music } from "./database"
import { fileManager } from "./file_manager"
import { sleepTimerManager } from "./sleep_timer"

type PlayMode = "sequential" | "shuffle" | "repeat-one" | "repeat-all"
type PlayerState = "idle" | "loading" | "playing" | "paused" | "error"

type PlayerEvent = {
  onStateChange?: (state: PlayerState) => void
  onMusicChange?: (music: Music | null) => void
  onProgressChange?: (current: number, duration: number) => void
  onQueueChange?: (queue: Music[]) => void
  onPlayModeChange?: (mode: PlayMode) => void
  onError?: (error: string) => void
  /** 封面补下完成（本地文件已落盘），use_cover.ts 订阅此事件刷新 UI */
  onCoverPatched?: (musicId: string) => void
}

class Player {
  private player: AVPlayer | null = null
  private currentMusic: Music | null = null
  private queue: Music[] = []
  private currentIndex: number = -1
  private playMode: PlayMode = "sequential"
  private state: PlayerState = "idle"
  private listeners: PlayerEvent[] = []
  private progressTimer: number | null = null
  private isTimerRunning: boolean = false
  private hasCountedPlay: boolean = false
  private initialized: boolean = false
  // 切歌竞态令牌：playMusic 进入自增，每个 await 后校验，丢弃过期解析。
  private playToken: number = 0
  // shuffle 历史栈：记已播 index 访问序，previous 回退、next 优先 redo。
  private shuffleHistory: number[] = []
  private shuffleForward: number[] = []

  private static readonly STORAGE_QUEUE_KEY = "player_queue"
  private static readonly STORAGE_INDEX_KEY = "player_index"
  private static readonly STORAGE_MUSIC_KEY = "player_current_music"
  private static readonly STORAGE_PLAY_MODE_KEY = "player_play_mode"

  async init(): Promise<void> {
    if (this.initialized) return
    this.initialized = true
    await fileManager.init()
    await database.init()

    this.player = new AVPlayer()

    this.player.onReadyToPlay = () => {
      console.log(`[Player] 音频准备完成，开始播放`, this.player?.duration)
      this.setState("playing")
      this.player?.play()
      const dur = this.player?.duration ?? 0
      if (isFinite(dur) && dur > 0) {
        this.listeners.forEach(l => l.onProgressChange?.(0, dur))
        if (this.currentMusic && (!this.currentMusic.duration || this.currentMusic.duration === 0)) {
          this.currentMusic = { ...this.currentMusic, duration: dur }
        }
      }this.startProgressTimer()
      this.updateNowPlayingInfo()
      this.saveNowPlayingToStorage(this.currentMusic)
      sleepTimerManager.onSongStarted()
    }

    this.player.onEnded = () => {
      this.handlePlaybackEnded()}

    this.player.onError = (message) => {
      this.setState("error")
      this.listeners.forEach(l => l.onError?.(message))
    }

    SharedAudioSession.setCategory("playback", ["allowBluetoothA2DP", "allowAirPlay"])
    SharedAudioSession.setActive(true)

    this.setupInterruptionHandling()
    this.setupMediaPlayerCommands()
    sleepTimerManager.setTriggerCallback(() => this.pause())
    this.restoreSession()
  }

  private restoreSession(): void {
    const queue = Storage.get<Music[]>(Player.STORAGE_QUEUE_KEY)
    const index = Storage.get<number>(Player.STORAGE_INDEX_KEY)
    const music = Storage.get<Music>(Player.STORAGE_MUSIC_KEY)
    if (queue && queue.length > 0 && index !== null) {
      this.queue = queue
      this.currentIndex = index
      this.listeners.forEach(l => l.onQueueChange?.(queue))}
    if (music) {
      this.currentMusic = music
      this.listeners.forEach(l => l.onMusicChange?.(music))
    }const savedMode = Storage.get<PlayMode>(Player.STORAGE_PLAY_MODE_KEY)
    if (savedMode) this.playMode = savedMode
  }

  on(events: PlayerEvent): () => void {
    this.listeners.push(events)
    return () => {
      this.listeners = this.listeners.filter(l => l !== events)
    }
  }

  async play(music?: Music): Promise<void> {
    if (music) {
      console.log(`[Player] 开始播放: ${music.title}`)
      await this.playMusic(music)
    } else if (this.state === "paused") {
      console.log(`[Player] 恢复播放`)
      this.player?.play()
      this.setState("playing")
      this.startProgressTimer()
      await this.updateNowPlayingInfo()
      await this.saveNowPlayingToStorage(this.currentMusic)
    } else if (this.state === "idle" && this.currentMusic) {
      console.log(`[Player] 重新播放: ${this.currentMusic.title}`)
      await this.playMusic(this.currentMusic)
    }
  }

  async pause(): Promise<void> {
    console.log(`[Player] 暂停播放`)
    this.player?.pause()
    this.setState("paused")
    this.stopProgressTimer()
    MediaPlayer.playbackState = MediaPlayerPlaybackState.paused
    this.updateNowPlayingInfo()
    await this.saveNowPlayingToStorage(this.currentMusic)
  }

  stop(): void {
    this.player?.stop()
    this.setState("idle")
    this.stopProgressTimer()
    this.currentMusic = null
    this.listeners.forEach(l => l.onMusicChange?.(null))
    MediaPlayer.nowPlayingInfo = null
  }

  async next(): Promise<void> {
    const nextIndex = this.getNextIndex()
    if (nextIndex !== -1) {
      await this.playAtIndex(nextIndex)
    }
  }

  async previous(): Promise<void> {
    const prevIndex = this.getPreviousIndex()
    if (prevIndex !== -1) {
      await this.playAtIndex(prevIndex)
    }
  }

  seek(time: number): void {
    if (this.player) {
      // Stop timer first to prevent stale currentTime from overwriting seek position
      this.stopProgressTimer()
      this.player.currentTime = time
      // Immediately notify so UI reflects new position
      this.listeners.forEach(l => l.onProgressChange?.(time, this.player!.duration))
      // Restart timer if still playing, delay first tick so AVPlayer seek completes first
            if (this.state === "playing") {
              this.startProgressTimer(true)
            }
    }
  }

  setQueue(queue: Music[], startIndex: number = 0): void {
    this.queue = queue
    this.currentIndex = startIndex
    this.resetShuffleHistory()
    this.listeners.forEach(l => l.onQueueChange?.(queue))
    Storage.set(Player.STORAGE_QUEUE_KEY, queue)
    Storage.set(Player.STORAGE_INDEX_KEY, startIndex)
  }

  addToQueue(music: Music): void {
    this.queue.push(music)
    // 队列变更 → 重置 shuffle 历史，避免 index 访问序失配。
    this.resetShuffleHistory()
    this.listeners.forEach(l => l.onQueueChange?.(this.queue))
    Storage.set(Player.STORAGE_QUEUE_KEY, this.queue)
  }

  /**
   * 从待播队列移除指定 index 的歌曲。
   *
   * 待播列表 UI 只对「即将播放」（index > currentIndex）调用，此时 currentIndex 不变、播放不中断。
   * 方法本身对任意 index 健壮：删当前曲之前的项会前移 currentIndex；删当前曲会 clamp 到有效范围（不主动切歌，交由调用方决定）。
   */
  removeFromQueue(index: number): void {
    if (index < 0 || index >= this.queue.length) return
    this.queue.splice(index, 1)
    if (index < this.currentIndex) {
      this.currentIndex--
    } else if (index === this.currentIndex) {
      // 保险分支：UI 不会删当前曲。clamp 到队列范围，避免越界。
      if (this.currentIndex > this.queue.length - 1) this.currentIndex = this.queue.length - 1
    }
    // 队列结构变更 → 重置 shuffle 历史，避免裸 index 访问序失配。
    this.resetShuffleHistory()
    Storage.set(Player.STORAGE_QUEUE_KEY, this.queue)
    Storage.set(Player.STORAGE_INDEX_KEY, this.currentIndex)
    this.listeners.forEach(l => l.onQueueChange?.(this.queue))
  }

  async playNext(music: Music): Promise<void> {
    const insertIndex = this.currentIndex < 0 ? 0 : this.currentIndex + 1
    this.queue.splice(insertIndex, 0, music)
    this.currentIndex = insertIndex
    // splice 在中间插入会移位后续所有 index，shuffleHistory/forward 存的是裸 index 会错位，重置。
    this.resetShuffleHistory()
    Storage.set(Player.STORAGE_QUEUE_KEY, this.queue)
    Storage.set(Player.STORAGE_INDEX_KEY, this.currentIndex)
    this.listeners.forEach(l => l.onQueueChange?.(this.queue))
    await this.playMusic(music)
  }

  setPlayMode(mode: PlayMode): void {
    // 切入/切出 shuffle 都重置历史，避免旧 index 访问序失配。
    if (mode !== this.playMode) this.resetShuffleHistory()
    this.playMode = mode
    Storage.set(Player.STORAGE_PLAY_MODE_KEY, mode)
    this.listeners.forEach(l => l.onPlayModeChange?.(mode))
  }

  getState(): PlayerState {
    return this.state
  }

  getCurrentMusic(): Music | null {
    return this.currentMusic
  }

  getQueue(): Music[] {
    return this.queue
  }

  getPlayMode(): PlayMode {
    return this.playMode
  }

  getCurrentIndex(): number {
    return this.currentIndex
  }

  getCurrentTime(): number {
    return this.player?.currentTime ?? 0
  }

  getDuration(): number {
    return this.player?.duration ?? 0
  }

  dispose(): void {
    this.stopProgressTimer()
    this.player?.dispose()
    this.player = null
    this.currentMusic = null
    this.queue = []
    this.currentIndex = -1
    this.listeners = []
    MediaPlayer.nowPlayingInfo = null
  }

  private async saveNowPlayingToStorage(music: Music | null): Promise<void> {
    if (music) {
      const coverPath = fileManager.getCoverPath(music.id)
      const hasCover = await FileManager.exists(coverPath)
      const loops = this.playMode === "repeat-all" || this.playMode === "shuffle"
      Storage.set("now_playing", {
        title: music.title,
        artist: music.artist,
        cover_url: music.cover_url ?? "",
        cover_path: hasCover ? coverPath : "",
        is_playing: this.state === "playing",
        can_prev: loops || this.currentIndex > 0,
        can_next: loops || this.currentIndex < this.queue.length - 1
      })
    } else {
      Storage.remove("now_playing")
    }Widget.reloadUserWidgets()
  }

  private async playMusic(music: Music): Promise<void> {
    // 切歌令牌：本次调用的身份。每个 await 后校验，过期则静默丢弃（已有更新的 playMusic 接管）。
    const token = ++this.playToken
    this.setState("loading")
    this.currentMusic = music
    this.hasCountedPlay = false
    this.listeners.forEach(l => l.onMusicChange?.(music))
    this.saveNowPlayingToStorage(music)
    Storage.set(Player.STORAGE_MUSIC_KEY, music)
    Storage.set(Player.STORAGE_INDEX_KEY, this.currentIndex)

    let audioUrl: string | undefined

    console.log(`[Player] is_downloaded=${music.is_downloaded}, audio_url=${music.audio_url}, provider=${music.provider}`)

    if (music.is_downloaded) {
      const localPath = await fileManager.findAudioPath(music.id)
      if (token !== this.playToken) return // 已被新切歌接管
      const exists = localPath !== null
      console.log(`[Player] 本地路径: ${localPath}, 存在: ${exists}`)
      if (exists) {
        audioUrl = localPath!
      } else {
        console.log(`[Player] 本地文件不存在，尝试使用在线地址`)
        audioUrl = music.audio_url
        
        // 如果 audio_url 为空但有 provider，动态解析（兼容 mp3juice 等异步源）
        if (!audioUrl && music.provider) {
          console.log(`[Player] 通过 provider 解析播放地址`)
          const { music: musicService } = await import("./music")
          try {
            audioUrl = await musicService.resolveAudioUrl({
              id: music.id, provider: music.provider, title: music.title,
              artist: music.artist, album: music.album, duration: music.duration,
              source_id: music.source_id,
            })
          } catch (e) {
            console.error(`[Player] 解析播放地址失败: ${e}`)
          }
          if (token !== this.playToken) return // 解析返回前已切歌
        }
        
        if (!audioUrl) {
          if (token !== this.playToken) return
          this.setState("error")
          this.currentMusic = null
          this.listeners.forEach(l => l.onMusicChange?.(null))
          this.listeners.forEach(l => l.onError?.("本地文件不存在且无在线播放地址"))
          return
        }
      }
    } else {
      audioUrl = music.audio_url
      
      // mp3juice 等短时直链源不久存 audio_url，强制实时解析
      const isShortLivedSource = music.provider === "mp3juice"
      // 如果 audio_url 为空但有 provider，或为短时源，动态解析
      if ((!audioUrl || isShortLivedSource) && music.provider) {
        console.log(`[Player] 通过 provider 解析播放地址`)
        const { music: musicService } = await import("./music")
        try {
          audioUrl = await musicService.resolveAudioUrl({
            id: music.id, provider: music.provider, title: music.title,
            artist: music.artist, album: music.album, duration: music.duration,
            source_id: music.source_id,
            audio_url: isShortLivedSource ? undefined : music.audio_url,
          })
        } catch (e) {
          console.error(`[Player] 解析播放地址失败: ${e}`)
        }
        if (token !== this.playToken) return // 解析返回前已切歌，丢弃过期源
      }
      
      if (!audioUrl) {
        if (token !== this.playToken) return
        this.setState("error")
        this.currentMusic = null
        this.listeners.forEach(l => l.onMusicChange?.(null))
        this.listeners.forEach(l => l.onError?.("无可用的播放地址"))
        return
      }
    }

    if (token !== this.playToken) return // setSource 前最终校验
    console.log(`[Player] setSource: ${audioUrl}, player实例: ${this.player !== null}`)
    const success = this.player?.setSource(audioUrl)
    console.log(`[Player] setSource result: ${success}, onReadyToPlay已注册: ${this.player?.onReadyToPlay !== undefined}`)
    if (!success) {
      this.setState("error")
      this.listeners.forEach(l => l.onError?.("Failed to load audio"))
      return
    }

    // 开始播放只刷新「最近播放」；真正计数（play_count+1）由 checkPlayCompletion 在 ≥80% 时唯一负责。
    await database.touchLastPlayed(music.id)
    // 补封面：fire-and-forget，不阻塞播放；token 守卫防止切歌后写旧歌封面。
    this.patchCoverIfMissing(music, token).catch(() => {})
  }

  private async playAtIndex(index: number): Promise<void> {
    if (index >= 0 && index < this.queue.length) {
      this.currentIndex = index
      Storage.set(Player.STORAGE_INDEX_KEY, index)
      this.listeners.forEach(l => l.onQueueChange?.(this.queue))
      await this.playMusic(this.queue[index])
    }
  }

  /**
   * 播放时自动补封面。
   * 流程：① 有本地封面 → 直接返回；② 无 cover_url → iTunes 搜索补全 DB；
   * ③ 下载封面并落盘；④ 刷新 NowPlayingInfo + emit onCoverPatched 通知 UI。
   * 全程 fire-and-forget，任何异常静默。
   */
  private async patchCoverIfMissing(music: Music, token: number): Promise<void> {
    try {
      const hasCover = await fileManager.coverExists(music.id)
      if (hasCover) return
      if (token !== this.playToken) return

      let coverUrl = music.cover_url ?? ""

      // 无 cover_url → iTunes Search 补元数据
      if (!coverUrl) {
        const { enrichByTitle } = await import("./sources/itunes_meta")
        const term = music.artist ? `${music.title} ${music.artist}` : music.title
        const meta = await enrichByTitle(term, "CN")
        if (!meta.matched || !meta.cover) return
        coverUrl = meta.cover
        // 更新 DB cover_url（upsert 保留其余字段）
        await database.addMusic({ ...music, cover_url: coverUrl })
        if (token !== this.playToken) return
        // 同步内存中的 currentMusic 并通知 UI（remoteUrl 刷新）
        if (this.currentMusic?.id === music.id) {
          this.currentMusic = { ...this.currentMusic, cover_url: coverUrl }
          this.listeners.forEach(l => l.onMusicChange?.(this.currentMusic!))
        }
      }

      if (!coverUrl || token !== this.playToken) return

      // 下载封面并落盘
      const { fetch } = await import("scripting")
      const resp = await fetch(coverUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15" }
      })
      if (!resp.ok) return
      const data = await resp.bytes()
      if (!data || data.length === 0) return

      if (token !== this.playToken) return
      await fileManager.saveCover(music.id, data)

      // 更新 NowPlayingInfo 封面（锁屏 / 控制中心）
      if (this.currentMusic?.id === music.id) {
        await this.updateNowPlayingInfo()
      }
      // 通知 use_cover.ts 刷新本地封面
      this.listeners.forEach(l => l.onCoverPatched?.(music.id))
      console.log(`[Player] patchCoverIfMissing: 封面已补 ${music.id}`)
    } catch (e) {
      console.log(`[Player] patchCoverIfMissing 静默失败: ${e}`)
    }
  }

  private handlePlaybackEnded(): void {
    this.stopProgressTimer()

    if (this.playMode === "repeat-one") {
      this.player?.play()
      this.startProgressTimer()
      return
    }

    const nextIndex = this.getNextIndex()
    if (nextIndex !== -1) {
      this.playAtIndex(nextIndex)
    } else {
      this.setState("idle")
    }
  }

  private getNextIndex(): number {
    if (this.queue.length === 0) return -1
    if (this.playMode === "shuffle") {
      return this.nextShuffleIndex()
    }
    const next = this.currentIndex + 1
    if (next < this.queue.length) return next
    return this.playMode === "repeat-all" ? 0 : -1
  }

  private getPreviousIndex(): number {
    if (this.queue.length === 0) return -1
    if (this.playMode === "shuffle") {
      return this.prevShuffleIndex()
    }
    const prev = this.currentIndex - 1
    if (prev >= 0) return prev
    return this.playMode === "repeat-all" ? this.queue.length - 1 : -1
  }

  /**
   * shuffle 下一首：优先消费 forward（被 previous 回退后的 redo）；
   * 否则在「本轮未播过且非当前首」的 index 中随机选，避免原地重播与一轮内重复。
   * 一轮播完后重置历史（仅排除当前首）。调用会把当前 index 压入 history。
   */
  private nextShuffleIndex(): number {
    const n = this.queue.length
    if (n === 1) return 0
    if (this.shuffleForward.length > 0) {
      const idx = this.shuffleForward.pop()!
      if (this.currentIndex >= 0) this.shuffleHistory.push(this.currentIndex)
      return idx
    }
    const played = new Set(this.shuffleHistory)
    let pool: number[] = []
    for (let i = 0; i < n; i++) {
      if (i === this.currentIndex) continue
      if (!played.has(i)) pool.push(i)
    }
    // 一轮都播过了 → 重置，仅排除当前首
    if (pool.length === 0) {
      this.shuffleHistory = []
      for (let i = 0; i < n; i++) if (i !== this.currentIndex) pool.push(i)
    }
    const idx = pool[Math.floor(Math.random() * pool.length)]
    if (this.currentIndex >= 0) this.shuffleHistory.push(this.currentIndex)
    return idx
  }

  /** shuffle 上一首：从 history 弹出真正的上一首；把当前首压入 forward 供 redo。无历史则保持当前。 */
  private prevShuffleIndex(): number {
    if (this.shuffleHistory.length > 0) {
      const idx = this.shuffleHistory.pop()!
      if (this.currentIndex >= 0) this.shuffleForward.push(this.currentIndex)
      return idx
    }
    return -1
  }

  /** 重置 shuffle 历史（队列变更 / 切换播放模式时调用，避免 index 失配）。 */
  private resetShuffleHistory(): void {
    this.shuffleHistory = []
    this.shuffleForward = []
  }

  private setState(state: PlayerState): void {
    this.state = state
    this.listeners.forEach(l => l.onStateChange?.(state))
    if (state === "playing") {
      MediaPlayer.playbackState = MediaPlayerPlaybackState.playing
    } else if (state === "paused") {
      MediaPlayer.playbackState = MediaPlayerPlaybackState.paused
    }
  }

  private async updateNowPlayingInfo(): Promise<void> {
    if (!this.currentMusic) return

    const info: NowPlayingInfo = {
      title: this.currentMusic.title,
      artist: this.currentMusic.artist,
      albumTitle: this.currentMusic.album,
      playbackRate: this.state === "playing" ? 1.0 : 0.0,
      elapsedPlaybackTime: this.player?.currentTime ?? 0,
      playbackDuration: this.currentMusic.duration
    }

    try {
      const coverPath = fileManager.getCoverPath(this.currentMusic.id)
      if (await FileManager.exists(coverPath)) {
        const artwork = UIImage.fromFile(coverPath)
        if (artwork) info.artwork = artwork
      } else if (this.currentMusic.cover_url) {
        const artwork = await UIImage.fromURL(this.currentMusic.cover_url)
        if (artwork) info.artwork = artwork
      }
    } catch (error) {
      console.log(`[NowPlaying] 加载封面失败:`, error)
    }

    MediaPlayer.nowPlayingInfo = info
  }

  private setupInterruptionHandling(): void {
    SharedAudioSession.addInterruptionListener((type) => {
      if (type === "began") {
        this.pause()
      } else if (type === "ended") {
        if (this.state === "paused" && this.currentMusic) {
          this.play()
        }
      }
    })
  }

  private setupMediaPlayerCommands(): void {
    MediaPlayer.setAvailableCommands([
      "togglePausePlay", "nextTrack", "previousTrack", "seekForward", "play", "pause", "seekBackward"
    ])

    MediaPlayer.commandHandler = (command: MediaPlayerRemoteCommand) => {
      switch (command) {
        case "play": this.play(); break
        case "pause": this.pause(); break
        case "nextTrack": this.next(); break
        case "previousTrack": this.previous(); break
        case "seekForward": this.seek(this.getCurrentTime() + 15); break
        case "seekBackward": this.seek(this.getCurrentTime() - 15); break
      }
    }
  }

  private startProgressTimer(delayFirstTick: boolean = false): void {
      this.stopProgressTimer()
      this.isTimerRunning = true
      const tick = () => {
        if (this.player && this.state === "playing") {
          this.listeners.forEach(l => l.onProgressChange?.(this.player!.currentTime, this.player!.duration))
          this.checkPlayCompletion()
        }
        if (this.isTimerRunning) {
          this.progressTimer = setTimeout(tick, 1000)
        }
      }
      if (delayFirstTick) {
        this.progressTimer = setTimeout(tick, 1000)
      } else {
        tick()
      }
    }

  private stopProgressTimer(): void {
    this.isTimerRunning = false
    if (this.progressTimer !== null) {
      clearTimeout(this.progressTimer)
      this.progressTimer = null
    }
  }

  private checkPlayCompletion(): void {
    if (!this.player || !this.currentMusic || this.hasCountedPlay) return
    const progress = this.player.currentTime / this.player.duration
    if (progress >= 0.8) {
      this.hasCountedPlay = true
      database.updateMusicPlayCount(this.currentMusic.id)
    }
  }
}

export const player = new Player()
export type { PlayMode, PlayerState, PlayerEvent }