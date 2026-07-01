import { Path } from "scripting"
import { setting } from "./setting"
import { writeBytesCompat } from "./write_compat"

class MusicFileManager {
  /** 封面存在性内存缓存，避免每次进页面都 I/O */
  private coverExistsCache = new Map<string, boolean>()

  private get rootPath(): string {
    return setting.getBasePath()
  }

  private get audioDir(): string {
    return Path.join(this.rootPath, "audios")
  }

  private get coverDir(): string {
    return Path.join(this.rootPath, "covers")
  }

  private get lyricsDir(): string {
    return Path.join(this.rootPath, "lyrics")
  }

  /** 断点续传的临时分片目录（<root>/downloads/<id>.part） */
  private get downloadsDir(): string {
    return Path.join(this.rootPath, "downloads")
  }

  async init(): Promise<void> {
    await FileManager.createDirectory(this.audioDir, true)
    await FileManager.createDirectory(this.coverDir, true)
    await FileManager.createDirectory(this.lyricsDir, true)
    await FileManager.createDirectory(this.downloadsDir, true)
  }

  async saveAudio(musicId: string, data: Uint8Array): Promise<string> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getAudioPath(musicId)
    await writeBytesCompat(path, data)
    return path
  }

  async saveCover(musicId: string, data: Uint8Array): Promise<string> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getCoverPath(musicId)
    await writeBytesCompat(path, data)
    this.coverExistsCache.set(musicId, true)
    return path
  }

  getAudioPath(musicId: string, format: string = "mp3"): string {
      return Path.join(this.audioDir, `${musicId}.${format}`)
    }

    async findAudioPath(musicId: string): Promise<string | null> {
      for (const fmt of ["mp3", "m4a", "ogg", "flac", "wav"]) {
        const p = this.getAudioPath(musicId, fmt)
        if (await FileManager.exists(p)) return p
      }
      return null
    }

  getCoverPath(musicId: string): string {
    return Path.join(this.coverDir, `${musicId}.jpg`)
  }

  async audioExists(musicId: string): Promise<boolean> {
      return (await this.findAudioPath(musicId)) !== null
    }

  async coverExists(musicId: string): Promise<boolean> {
    const cached = this.coverExistsCache.get(musicId)
    if (cached !== undefined) return cached
    const exists = await FileManager.exists(this.getCoverPath(musicId))
    this.coverExistsCache.set(musicId, exists)
    return exists
  }

  async deleteAudio(musicId: string): Promise<void> {
      const path = await this.findAudioPath(musicId)
      if (path) await FileManager.remove(path)
    }

  async deleteCover(musicId: string): Promise<void> {
    const path = this.getCoverPath(musicId)
    if (await FileManager.exists(path)) {
      await FileManager.remove(path)
    }
    this.coverExistsCache.set(musicId, false)
  }

  // ===== 歌词（与封面同生命周期：下载时存、删歌时删）=====

  getLyricsPath(musicId: string): string {
    return Path.join(this.lyricsDir, `${musicId}.json`)
  }

  /** 保存歌词为 JSON 文本。data 形如 { synced: LyricLine[]|null, plain: string|null }。 */
  async saveLyrics(musicId: string, data: unknown): Promise<string> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getLyricsPath(musicId)
    await FileManager.writeAsString(path, JSON.stringify(data))
    return path
  }

  /** 读取本地歌词 JSON，不存在或解析失败返回 null。 */
  async readLyrics<T = any>(musicId: string): Promise<T | null> {
    const path = this.getLyricsPath(musicId)
    if (!(await FileManager.exists(path))) return null
    try {
      const text = await FileManager.readAsString(path)
      return JSON.parse(text) as T
    } catch (e) {
      console.error("[歌词] 本地读取失败:", e)
      return null
    }
  }

  async lyricsExists(musicId: string): Promise<boolean> {
    return await FileManager.exists(this.getLyricsPath(musicId))
  }

  async deleteLyrics(musicId: string): Promise<void> {
    const path = this.getLyricsPath(musicId)
    if (await FileManager.exists(path)) {
      await FileManager.remove(path)
    }
  }

  // ===== 断点续传 partial 分片 =====

  getPartPath(musicId: string): string {
    return Path.join(this.downloadsDir, `${musicId}.part`)
  }

  async partExists(musicId: string): Promise<boolean> {
    return await FileManager.exists(this.getPartPath(musicId))
  }

  /** 已下字节数（part 文件大小）；不存在返回 0。 */
  async partSize(musicId: string): Promise<number> {
    const path = this.getPartPath(musicId)
    if (!(await FileManager.exists(path))) return 0
    try {
      const s = await FileManager.stat(path)
      return s.size || 0
    } catch {
      return 0
    }
  }

  /** 追加分片数据到 part 文件（自动建文件/目录）。 */
  async appendPart(musicId: string, bytes: Uint8Array): Promise<void> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getPartPath(musicId)
    const DataNS = (globalThis as any).Data
    const FM = FileManager as any
    if (DataNS?.fromUint8Array && typeof FM.appendData === "function") {
      const data = DataNS.fromUint8Array(bytes)
      if (data) { await FM.appendData(path, data); return }
    }
    if (typeof FM.appendData === "function" && DataNS?.fromUint8Array) {
      await FM.appendData(path, DataNS.fromUint8Array(bytes))
      return
    }
    // 极端回退：读旧 + 拼接 + 覆盖写（appendData 不可用时）
    let prev = new Uint8Array(0)
    if (await FileManager.exists(path)) prev = await FileManager.readAsBytes(path)
    const merged = new Uint8Array(prev.length + bytes.length)
    merged.set(prev, 0)
    merged.set(bytes, prev.length)
    await writeBytesCompat(path, merged)
  }

  async readPart(musicId: string): Promise<Uint8Array> {
    return await FileManager.readAsBytes(this.getPartPath(musicId))
  }

  async deletePart(musicId: string): Promise<void> {
    const path = this.getPartPath(musicId)
    if (await FileManager.exists(path)) await FileManager.remove(path)
  }

  /** 统计目录内文件总大小（并行 stat） */
  private async sumDirSize(dir: string): Promise<number> {
    if (!(await FileManager.exists(dir))) return 0
    const files = await FileManager.readDirectory(dir)
    const stats = await Promise.all(
      files.map(f => FileManager.stat(Path.join(dir, f)))
    )
    return stats.reduce((sum, s) => sum + (s.size || 0), 0)
  }

  async getStorageSize(): Promise<number> {
    const [audioSize, coverSize, lyricsSize, partSize] = await Promise.all([
      this.sumDirSize(this.audioDir),
      this.sumDirSize(this.coverDir),
      this.sumDirSize(this.lyricsDir),
      this.sumDirSize(this.downloadsDir)
    ])
    return audioSize + coverSize + lyricsSize + partSize
  }
}

export const fileManager = new MusicFileManager()