import { Path } from "scripting"
import { database, Music, Playlist } from "./database"
import { setting } from "./setting"

const FORMAT_ID = "scripting-music-playlist"
const FORMAT_VERSION = 1

export type SharedMusic = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover_url?: string
  audio_url?: string
  provider?: string
}

export type PlaylistShareFile = {
  format: typeof FORMAT_ID
  version: number
  exported_at: number
  playlist: {
    name: string
    cover?: string
  }
  musics: SharedMusic[]
}

export type ImportStats = {
  playlistId: string
  playlistName: string
  total: number
  newMusics: number
  existedMusics: number
  addedToPlaylist: number
  alreadyInPlaylist: number
}

class PlaylistShare {
  /** 为分享生成文件名（基于 playlist 名 + 日期） */
  private buildFilename(name: string): string {
    const safe = name.replace(/[\\/:*?"<>|]/g, "_").trim() || "playlist"
    const d = new Date()
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
    return `${safe}_${stamp}.smpl.json`
  }

  /** 把歌单序列化为 JSON 字符串 */
  async serializePlaylist(playlistId: string): Promise<{ content: string, filename: string, playlist: Playlist }> {
    const playlist = await database.getPlaylist(playlistId)
    if (!playlist) throw new Error("播放列表不存在")
    const musics = await database.getPlaylistMusic(playlistId)

    const { content, filename } = this.serializeFromMusics(playlist.name, musics)
    return { content, filename, playlist }
  }

  /**
   * 从任意 Music[] 序列化为分享文件内容。
   * 适用于“已下载”、“我喜欢”、“最近播放”等任意歌曲列表一键分享。
   */
  serializeFromMusics(name: string, musics: Music[]): { content: string, filename: string } {
    const file: PlaylistShareFile = {
      format: FORMAT_ID,
      version: FORMAT_VERSION,
      exported_at: Date.now(),
      playlist: { name },
      musics: musics.map(m => ({
        id: m.id,
        title: m.title,
        artist: m.artist,
        album: m.album,
        duration: m.duration,
        cover_url: m.cover_url,
        audio_url: m.audio_url,
        provider: m.provider
      }))
    }
    return {
      content: JSON.stringify(file, null, 2),
      filename: this.buildFilename(name)
    }
  }

  /**
   * 从任意 Music[] 导出到临时文件，返回文件路径和 file:// URL。
   */
  async exportMusicsToTempFile(name: string, musics: Music[]): Promise<{
    filePath: string
    fileUrl: string
    count: number
  }> {
    const { content, filename } = this.serializeFromMusics(name, musics)
    const tmpDir = this.getSharedDir()
    await FileManager.createDirectory(tmpDir, true)
    const filePath = Path.join(tmpDir, filename)
    if (await FileManager.exists(filePath)) {
      await FileManager.remove(filePath)
    }
    await FileManager.writeAsString(filePath, content)
    return { filePath, fileUrl: "file://" + filePath, count: musics.length }
  }

  /** 共享文件临时目录的字符路径（绝对，不带 file:// 前缀） */
  getSharedDir(): string {
    return Path.join(setting.getBasePath(), "shared")
  }

  /**
   * 导出到共享临时目录，返回文件路径与 file:// URL。
   * 同名文件存在时先删除（避免 writeAsString 歧义、避免旧内容被误分享）。
   */
  async exportToTempFile(playlistId: string): Promise<{
    filePath: string
    fileUrl: string
    playlist: Playlist
    count: number
  }> {
    const { content, filename, playlist } = await this.serializePlaylist(playlistId)
    const tmpDir = this.getSharedDir()
    await FileManager.createDirectory(tmpDir, true)
    const filePath = Path.join(tmpDir, filename)
    if (await FileManager.exists(filePath)) {
      await FileManager.remove(filePath)
    }
    await FileManager.writeAsString(filePath, content)
    const count = (JSON.parse(content) as PlaylistShareFile).musics.length
    return {
      filePath,
      fileUrl: "file://" + filePath,
      playlist,
      count
    }
  }

  /** 清理共享目录（用于“清理内存/存储”或测试 afterAll） */
  async cleanupSharedDir(): Promise<void> {
    const dir = this.getSharedDir()
    if (await FileManager.exists(dir)) {
      await FileManager.remove(dir)
    }
  }

  /** 校验文件结构 */
  private validate(data: any): PlaylistShareFile {
    if (!data || typeof data !== "object") throw new Error("文件内容无效")
    if (data.format !== FORMAT_ID) throw new Error("不是歌单分享文件")
    if (typeof data.version !== "number") throw new Error("缺少版本号")
    if (data.version > FORMAT_VERSION) throw new Error(`不支持的版本: ${data.version}`)
    if (!data.playlist || typeof data.playlist.name !== "string") throw new Error("缺少 playlist.name")
    if (!Array.isArray(data.musics)) throw new Error("musics 必须是数组")
    for (const m of data.musics) {
      if (!m || typeof m.id !== "string" || typeof m.title !== "string") {
        throw new Error("歌曲字段缺失 id/title")
      }
    }
    return data as PlaylistShareFile
  }

  /** 解析文件内容 */
  parse(content: string): PlaylistShareFile {
    let data: any
    try {
      data = JSON.parse(content)
    } catch (e) {
      throw new Error("JSON 解析失败: " + String(e))
    }
    return this.validate(data)
  }

  /** 选择一个不冲突的播放列表名 */
  private async resolvePlaylistName(desired: string): Promise<string> {
    const all = await database.getAllPlaylists()
    const existing = new Set(all.map(p => p.name))
    if (!existing.has(desired)) return desired
    for (let i = 2; i < 1000; i++) {
      const candidate = `${desired} (导入 ${i})`
      if (!existing.has(candidate)) return candidate
    }
    return `${desired} (导入 ${Date.now()})`
  }

  /** 执行导入：创建/合并播放列表 + 插入缺失歌曲 */
  async importFromFile(filePath: string, options?: { mergeIntoPlaylistId?: string }): Promise<ImportStats> {
    const exists = await FileManager.exists(filePath)
    if (!exists) throw new Error("文件不存在")
    const content = await FileManager.readAsString(filePath)
    const data = this.parse(content)

    // 目标歌单
    let playlistId: string
    let playlistName: string
    if (options?.mergeIntoPlaylistId) {
      const target = await database.getPlaylist(options.mergeIntoPlaylistId)
      if (!target) throw new Error("目标播放列表不存在")
      playlistId = target.id
      playlistName = target.name
    } else {
      playlistName = await this.resolvePlaylistName(data.playlist.name)
      playlistId = await database.createPlaylist(playlistName, data.playlist.cover)
    }

    // 合并统计
    let newMusics = 0
    let existedMusics = 0
    let addedToPlaylist = 0
    let alreadyInPlaylist = 0

    const existingInPlaylist = new Set(
      (await database.getPlaylistMusic(playlistId)).map(m => m.id)
    )

    for (const m of data.musics) {
      const existed = await database.getMusic(m.id)
      if (existed) {
        existedMusics++
      } else {
        await database.addMusic({
          id: m.id,
          title: m.title,
          artist: m.artist ?? "未知艺人",
          album: m.album ?? "未知专辑",
          duration: m.duration ?? 0,
          cover_url: m.cover_url,
          audio_url: m.audio_url,
          provider: m.provider,
          is_downloaded: false,
          added_at: Date.now()
        })
        newMusics++
      }

      if (existingInPlaylist.has(m.id)) {
        alreadyInPlaylist++
      } else {
        await database.addMusicToPlaylist(playlistId, m.id)
        existingInPlaylist.add(m.id)
        addedToPlaylist++
      }
    }

    return {
      playlistId,
      playlistName,
      total: data.musics.length,
      newMusics,
      existedMusics,
      addedToPlaylist,
      alreadyInPlaylist
    }
  }
}

export const playlistShare = new PlaylistShare()
