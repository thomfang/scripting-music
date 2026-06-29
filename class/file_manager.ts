import { Path } from "scripting"
import { setting } from "./setting"

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

  async init(): Promise<void> {
    await FileManager.createDirectory(this.audioDir, true)
    await FileManager.createDirectory(this.coverDir, true)
  }

  async saveAudio(musicId: string, data: Uint8Array): Promise<string> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getAudioPath(musicId)
    await FileManager.writeAsBytes(path, data)
    return path
  }

  async saveCover(musicId: string, data: Uint8Array): Promise<string> {
    if (!musicId || musicId.includes("/") || musicId.includes("..")) {
      throw new Error("Invalid music ID")
    }
    const path = this.getCoverPath(musicId)
    await FileManager.writeAsBytes(path, data)
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
    const [audioSize, coverSize] = await Promise.all([
      this.sumDirSize(this.audioDir),
      this.sumDirSize(this.coverDir)
    ])
    return audioSize + coverSize
  }
}

export const fileManager = new MusicFileManager()