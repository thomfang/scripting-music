import { fileManager } from "./file_manager"
import { setting } from "./setting"
import { id as idGen } from "./id"

export type Music = {
  id: string
  title: string
  artist: string
  album: string
  duration: number
  cover_url?: string
  audio_url?: string
  provider?: string
  /** provider 侧的原始 id；为空时回退到 id（历史数据兼容） */
  source_id?: string
  is_downloaded: boolean
  file_size?: number
  added_at: number
    play_count: number
  last_played_at?: number
  is_favorite: boolean
}

export type Playlist = {
  id: string
  name: string
  cover?: string
  created_at: number
  updated_at: number
  music_count: number
}

export type PlaylistMusic = {
  playlist_id: string
  music_id: string
  added_at: number
  position: number
}

export type SearchHistory = {
  id: string
  keyword: string
  searched_at: number
}

export type DownloadTask = {
  id: string
  music_id: string
  session_id?: string
  status: "pending" | "downloading" | "paused" | "cancelled" | "completed" | "failed"
  progress: number
  error?: string
  created_at: number
  updated_at: number
}

// ---------- Raw row types (1:1 SQL columns, INTEGER booleans) ----------

type RawMusicRow = {
  id: string; title: string; artist: string; album: string; duration: number
  cover_url: string | null; audio_url: string | null; provider: string | null
  source_id: string | null
  is_downloaded: number; file_size: number | null
  added_at: number; play_count: number; last_played_at: number | null; is_favorite: number
}

type RawPlaylistRow = {
  id: string; name: string; cover: string | null
  created_at: number; updated_at: number; music_count: number
}

type RawSearchHistoryRow = {
  id: string; keyword: string; searched_at: number
}

type RawDownloadTaskRow = {
  id: string; music_id: string; session_id: string | null
  status: string; progress: number; error: string | null
  created_at: number; updated_at: number
}

/** 迁移辅助：sqlite_master 行 */
type RawTableNameRow = { name: string }
type RawColumnInfoRow = { name: string }
type RawMaxPosRow = { max_pos: number | null }

class Database {
  private db: SQLite.Database | null = null
  private dbPath: string = ""

  async init(): Promise<void> {
    await fileManager.init()
    const basePath = setting.getBasePath()
    this.dbPath = basePath + "/music.db"
    this.db = SQLite.open(this.dbPath)
    await this.createTables()
  }

  /** 当前 db 文件绝对路径（供迁移逻辑使用） */
  getDbPath(): string {
    return this.dbPath
  }

  /** 是否已初始化（db 句柄存在） */
  isOpen(): boolean {
    return this.db !== null
  }

  /** 重新按当前 setting.getBasePath() 打开数据库。用于存储位置切换后。 */
  async reopen(): Promise<void> {
    this.close()
    await this.init()
  }

  private async migrateDatabase(): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")
      
      try {
        const tables = await this.db.fetchAll<RawTableNameRow>("SELECT name FROM sqlite_master WHERE type='table'")
        const tableNames = tables.map(t => t.name)
        
        // 迁移 music 表：添加 provider 列
        if (tableNames.includes("music")) {
          const columns = await this.db.fetchAll<RawColumnInfoRow>("PRAGMA table_info(music)")
          const columnNames = columns.map(c => c.name)
          
          if (!columnNames.includes("provider")) {
            console.log("[Migration] Adding provider column to music table")
            await this.db.execute("ALTER TABLE music ADD COLUMN provider TEXT")
          }

          if (!columnNames.includes("source_id")) {
            console.log("[Migration] Adding source_id column to music table")
            await this.db.execute("ALTER TABLE music ADD COLUMN source_id TEXT")
          }
        }
        
        // 迁移 download_task 表：添加 session_id 列
        if (tableNames.includes("download_task")) {
          const columns = await this.db.fetchAll<RawColumnInfoRow>("PRAGMA table_info(download_task)")
          const columnNames = columns.map(c => c.name)
          
          if (!columnNames.includes("session_id")) {
            console.log("[Migration] Adding session_id column to download_task table")
            await this.db.execute("ALTER TABLE download_task ADD COLUMN session_id TEXT")
          }
        }
      } catch (error) {
        console.log("Migration check:", error)
      }
    }

    private async createTables(): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")

      // 检查并添加缺失的列
      await this.migrateDatabase()

      // 音乐表
      await this.db.execute(`
        CREATE TABLE IF NOT EXISTS music (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL,
        duration INTEGER NOT NULL,
        cover_url TEXT,
        audio_url TEXT,
        provider TEXT,
        source_id TEXT,
        is_downloaded INTEGER DEFAULT 0,
        file_size INTEGER,
        added_at INTEGER NOT NULL,
        play_count INTEGER DEFAULT 0,
        last_played_at INTEGER,
        is_favorite INTEGER DEFAULT 0
      )
    `)

    // 播放列表表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS playlist (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        cover TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        music_count INTEGER DEFAULT 0
      )
    `)

    // 播放列表-音乐关联表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS playlist_music (
        playlist_id TEXT NOT NULL,
        music_id TEXT NOT NULL,
        added_at INTEGER NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, music_id)
      )
    `)

    // 搜索历史表
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS search_history (
        id TEXT PRIMARY KEY,
        keyword TEXT NOT NULL,
        searched_at INTEGER NOT NULL
      )
    `)

    // 下载任务表
        await this.db.execute(`
          CREATE TABLE IF NOT EXISTS download_task (
            id TEXT PRIMARY KEY,
            music_id TEXT NOT NULL,
            session_id TEXT,
            status TEXT NOT NULL,
            progress REAL DEFAULT 0,
            error TEXT,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
          )
        `)

    // 创建索引
    await this.db.execute("CREATE INDEX IF NOT EXISTS idx_music_artist ON music(artist)")
    await this.db.execute("CREATE INDEX IF NOT EXISTS idx_music_album ON music(album)")
    await this.db.execute("CREATE INDEX IF NOT EXISTS idx_music_downloaded ON music(is_downloaded)")
    await this.db.execute("CREATE INDEX IF NOT EXISTS idx_playlist_music_playlist ON playlist_music(playlist_id)")
    await this.db.execute("CREATE INDEX IF NOT EXISTS idx_search_history_time ON search_history(searched_at DESC)")
  }

  // Music CRUD
  /**
   * 插入新歌曲；如果 id 已存在，只更新可变元信息 + 下载状态。
   * 用户行为字段（play_count / is_favorite / last_played_at / added_at）一律保留，
   * 避免重新搜索或重新导入时清零用户数据。
   */
  async addMusic(music: Omit<Music, "play_count" | "is_favorite">): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    await this.db.execute(
      `INSERT INTO music
         (id, title, artist, album, duration, cover_url, audio_url, provider, source_id,
          is_downloaded, file_size, added_at, last_played_at, play_count, is_favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         artist = excluded.artist,
         album = excluded.album,
         duration = excluded.duration,
         cover_url = excluded.cover_url,
         audio_url = excluded.audio_url,
         provider = excluded.provider,
         source_id = excluded.source_id,
         is_downloaded = excluded.is_downloaded,
         file_size = excluded.file_size`,
      [
        music.id, music.title, music.artist, music.album, music.duration,
        music.cover_url ?? null, music.audio_url ?? null, music.provider ?? null,
        music.source_id ?? null,
        music.is_downloaded ? 1 : 0, music.file_size ?? null,
        music.added_at, music.last_played_at ?? null
      ]
    )
  }

  async getMusic(id: string): Promise<Music | null> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music WHERE id = ?", [id])
      return rows.length > 0 ? this.rowToMusic(rows[0]) : null
    }

  async getAllMusic(): Promise<Music[]> {
        if (!this.db) throw new Error("Database not initialized")
        const rows = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music ORDER BY added_at DESC")
        return rows.map(row => this.rowToMusic(row))
      }

    async getDownloadedMusic(): Promise<Music[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music WHERE is_downloaded = 1 ORDER BY added_at DESC")
      return rows.map(row => this.rowToMusic(row))
    }

    async getFavoriteMusic(): Promise<Music[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music WHERE is_favorite = 1 ORDER BY added_at DESC")
      return rows.map(row => this.rowToMusic(row))
    }

    async getRecentlyPlayed(limit: number = 20): Promise<Music[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music WHERE last_played_at IS NOT NULL ORDER BY last_played_at DESC LIMIT ?", [limit])
      return rows.map(row => this.rowToMusic(row))
    }

    async getMusicByArtist(): Promise<{ artist: string, count: number, musics: Music[] }[]> {
          if (!this.db) throw new Error("Database not initialized")
          const allMusic = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music ORDER BY artist, added_at DESC")
          const grouped = new Map<string, Music[]>()
          
          for (const row of allMusic) {
            const music = this.rowToMusic(row)
            if (!grouped.has(music.artist)) {
              grouped.set(music.artist, [])
            }
            grouped.get(music.artist)!.push(music)
          }
          
          return Array.from(grouped.entries())
            .map(([artist, musics]) => ({
              artist,
              count: musics.length,
              musics
            }))
            .sort((a, b) => b.count - a.count)
        }

    async getMusicByAlbum(): Promise<{ album: string, artist: string, count: number, musics: Music[] }[]> {
          if (!this.db) throw new Error("Database not initialized")
          const allMusic = await this.db.fetchAll<RawMusicRow>("SELECT * FROM music ORDER BY album, artist, added_at DESC")
          const grouped = new Map<string, Music[]>()
          
          for (const row of allMusic) {
            const music = this.rowToMusic(row)
            const key = `${music.album}|${music.artist}`
            if (!grouped.has(key)) {
              grouped.set(key, [])
            }
            grouped.get(key)!.push(music)
          }
          
          return Array.from(grouped.entries())
            .map(([key, musics]) => {
              const [album, artist] = key.split('|')
              return {
                album,
                artist,
                count: musics.length,
                musics
              }
            })
            .sort((a, b) => b.count - a.count)
        }

  async updateMusicDownloadStatus(id: string, isDownloaded: boolean, fileSize?: number): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")
      await this.db.execute(
        "UPDATE music SET is_downloaded = ?, file_size = ? WHERE id = ?",
        [isDownloaded ? 1 : 0, fileSize ?? null, id]
      )
    }

  async updateMusicPlayCount(id: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    const now = Date.now()
    await this.db.execute(
      "UPDATE music SET play_count = play_count + 1, last_played_at = ? WHERE id = ?",
      [now, id]
    )
  }

  /**
   * 仅更新「最近播放时间」，不动 play_count。
   * 用于开始播放时立即刷新最近播放顺序；真正计数（播达 80%）由 updateMusicPlayCount 唯一负责。
   */
  async touchLastPlayed(id: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    await this.db.execute(
      "UPDATE music SET last_played_at = ? WHERE id = ?",
      [Date.now(), id]
    )
  }

  async toggleFavorite(id: string): Promise<boolean> {
    if (!this.db) throw new Error("Database not initialized")
    const music = await this.getMusic(id)
    if (!music) return false
    const newValue = !music.is_favorite
    await this.db.execute("UPDATE music SET is_favorite = ? WHERE id = ?", [newValue ? 1 : 0, id])
    return newValue
  }

  async deleteMusic(id: string): Promise<void> {
        if (!this.db) throw new Error("Database not initialized")
        
        const music = await this.getMusic(id)
        if (music?.is_downloaded) {
          await fileManager.deleteAudio(id)
          await fileManager.deleteCover(id)
          await fileManager.deleteLyrics(id)
        }
        
        await this.db.execute("DELETE FROM music WHERE id = ?", [id])
        await this.db.execute("DELETE FROM playlist_music WHERE music_id = ?", [id])
      }

  // Playlist CRUD
  async createPlaylist(name: string, cover?: string): Promise<string> {
      if (!this.db) throw new Error("Database not initialized")
      const id = idGen.playlist()
      const now = Date.now()
      await this.db.execute(
        "INSERT INTO playlist (id, name, cover, created_at, updated_at, music_count) VALUES (?, ?, ?, ?, ?, 0)",
        [id, name, cover ?? null, now, now]
      )
      return id
    }

  async getPlaylist(id: string): Promise<Playlist | null> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawPlaylistRow>("SELECT * FROM playlist WHERE id = ?", [id])
      return rows.length > 0 ? this.rowToPlaylist(rows[0]) : null
    }

  async getAllPlaylists(): Promise<Playlist[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawPlaylistRow>("SELECT * FROM playlist ORDER BY created_at DESC")
      return rows.map(row => this.rowToPlaylist(row))
    }

  async addMusicToPlaylist(playlistId: string, musicId: string): Promise<void> {
        if (!this.db) throw new Error("Database not initialized")
        const musicRows = await this.db.fetchAll<{ 1: number }>(
          "SELECT 1 FROM music WHERE id = ?",
          [musicId]
        )
        if (musicRows.length === 0) {
          throw new Error(`Music not found: ${musicId}`)
        }
        const existing = await this.db.fetchAll<{ 1: number }>(
          "SELECT 1 FROM playlist_music WHERE playlist_id = ? AND music_id = ?",
          [playlistId, musicId]
        )
        if (existing.length > 0) return
        const now = Date.now()
        const rows = await this.db.fetchAll<RawMaxPosRow>(
          "SELECT MAX(position) as max_pos FROM playlist_music WHERE playlist_id = ?",
          [playlistId]
        )
        const position = (rows[0]?.max_pos ?? -1) + 1
        await this.db.execute(
          "INSERT INTO playlist_music (playlist_id, music_id, added_at, position) VALUES (?, ?, ?, ?)",
          [playlistId, musicId, now, position]
        )
        await this.db.execute(
          "UPDATE playlist SET music_count = music_count + 1, updated_at = ? WHERE id = ?",
          [now, playlistId]
        )
      }

  async removeMusicFromPlaylist(playlistId: string, musicId: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    await this.db.execute(
      "DELETE FROM playlist_music WHERE playlist_id = ? AND music_id = ?",
      [playlistId, musicId]
    )
    await this.db.execute(
      "UPDATE playlist SET music_count = music_count - 1, updated_at = ? WHERE id = ?",
      [Date.now(), playlistId]
    )
  }

  async getPlaylistMusic(playlistId: string): Promise<Music[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawMusicRow>(
        `SELECT m.* FROM music m
         INNER JOIN playlist_music pm ON m.id = pm.music_id
         WHERE pm.playlist_id = ?
         ORDER BY pm.position`,
        [playlistId]
      )
      return rows.map(row => this.rowToMusic(row))
    }

  async deletePlaylist(id: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    await this.db.execute("DELETE FROM playlist WHERE id = ?", [id])
    await this.db.execute("DELETE FROM playlist_music WHERE playlist_id = ?", [id])
  }

  // Search History
  async addSearchHistory(keyword: string): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    const id = idGen.search()
    await this.db.execute(
      "INSERT INTO search_history (id, keyword, searched_at) VALUES (?, ?, ?)",
      [id, keyword, Date.now()]
    )
  }

  async getSearchHistory(limit: number = 20): Promise<SearchHistory[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawSearchHistoryRow>(
        "SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?",
        [limit]
      )
      return rows.map(row => this.rowToSearchHistory(row))
    }

  async clearSearchHistory(): Promise<void> {
    if (!this.db) throw new Error("Database not initialized")
    await this.db.execute("DELETE FROM search_history")
  }

  // Download Task
  async createDownloadTask(musicId: string): Promise<string> {
    if (!this.db) throw new Error("Database not initialized")
    const id = idGen.download()
    const now = Date.now()
    await this.db.execute(
      "INSERT INTO download_task (id, music_id, status, progress, created_at, updated_at) VALUES (?, ?, 'pending', 0, ?, ?)",
      [id, musicId, now, now]
    )
    return id
  }

  async updateDownloadTask(id: string, status: DownloadTask["status"], progress: number, error?: string): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")
      await this.db.execute(
        "UPDATE download_task SET status = ?, progress = ?, error = ?, updated_at = ? WHERE id = ?",
        [status, progress, error ?? null, Date.now(), id]
      )
    }

  async getDownloadTask(id: string): Promise<DownloadTask | null> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawDownloadTaskRow>("SELECT * FROM download_task WHERE id = ?", [id])
      return rows.length > 0 ? this.rowToDownloadTask(rows[0]) : null
    }

  async getAllDownloadTasks(): Promise<DownloadTask[]> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawDownloadTaskRow>("SELECT * FROM download_task ORDER BY created_at DESC")
      return rows.map(row => this.rowToDownloadTask(row))
    }

  async deleteDownloadTask(id: string): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")
      await this.db.execute("DELETE FROM download_task WHERE id = ?", [id])
    }

    async updateDownloadTaskSessionId(id: string, sessionId: string): Promise<void> {
      if (!this.db) throw new Error("Database not initialized")
      await this.db.execute(
        "UPDATE download_task SET session_id = ? WHERE id = ?",
        [sessionId, id]
      )
    }

    async getDownloadTaskBySessionId(sessionId: string): Promise<DownloadTask | null> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawDownloadTaskRow>("SELECT * FROM download_task WHERE session_id = ?", [sessionId])
      return rows.length > 0 ? this.rowToDownloadTask(rows[0]) : null
    }

    async getDownloadTaskByMusicId(musicId: string): Promise<DownloadTask | null> {
      if (!this.db) throw new Error("Database not initialized")
      const rows = await this.db.fetchAll<RawDownloadTaskRow>("SELECT * FROM download_task WHERE music_id = ?", [musicId])
      return rows.length > 0 ? this.rowToDownloadTask(rows[0]) : null
    }

  // Helper methods
  private rowToMusic(row: RawMusicRow): Music {
    return {
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      duration: row.duration,
      cover_url: row.cover_url ?? undefined,
      audio_url: row.audio_url ?? undefined,
      provider: row.provider ?? undefined,
      source_id: row.source_id ?? undefined,
      is_downloaded: row.is_downloaded === 1,
      file_size: row.file_size ?? undefined,
      added_at: row.added_at,
      play_count: row.play_count,
      last_played_at: row.last_played_at ?? undefined,
      is_favorite: row.is_favorite === 1
    }
  }

  private rowToPlaylist(row: RawPlaylistRow): Playlist {
    return {
      id: row.id,
      name: row.name,
      cover: row.cover ?? undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      music_count: row.music_count
    }
  }

  private rowToSearchHistory(row: RawSearchHistoryRow): SearchHistory {
    return {
      id: row.id,
      keyword: row.keyword,
      searched_at: row.searched_at
    }
  }

  private rowToDownloadTask(row: RawDownloadTaskRow): DownloadTask {
      return {
        id: row.id,
        music_id: row.music_id,
        session_id: row.session_id ?? undefined,
        status: row.status as DownloadTask["status"],
        progress: row.progress,
        error: row.error ?? undefined,
        created_at: row.created_at,
        updated_at: row.updated_at
      }
    }

  close(): void {
    this.db = null
  }
}

export const database = new Database()