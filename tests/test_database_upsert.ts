import { defineSuite, expect, TestSuite } from "./test_runner"
import { database } from "../class/database"

/**
 * P0-2 回归：addMusic 不能清零用户行为数据。
 *
 * 保护字段：play_count / is_favorite / last_played_at / added_at
 * 可变字段：title / artist / album / duration / cover_url / audio_url / is_downloaded / file_size
 */

const ID = "upsert_test_song"

async function ensureClean() {
  await database.init()
  const existed = await database.getMusic(ID)
  if (existed) await database.deleteMusic(ID)
}

export const suite: TestSuite = defineSuite({
  name: "P0-2 · addMusic upsert 不污染用户数据",
  beforeEach: ensureClean,
  afterAll: async () => {
    const existed = await database.getMusic(ID)
    if (existed) await database.deleteMusic(ID)
  },
  cases: [
    {
      name: "首次插入：默认 play_count=0, is_favorite=false",
      fn: async () => {
        await database.addMusic({
          id: ID,
          title: "T1",
          artist: "A1",
          album: "AL1",
          duration: 100,
          is_downloaded: false,
          added_at: 1000
        })
        const m = await database.getMusic(ID)
        expect(m).toBeTruthy()
        expect(m!.title).toBe("T1")
        expect(m!.play_count).toBe(0)
        expect(m!.is_favorite).toBe(false)
        expect(m!.added_at).toBe(1000)
      }
    },
    {
      name: "再次添加同 id：play_count/is_favorite/added_at/last_played_at 保持不变",
      fn: async () => {
        // 准备：插入 + 累积播放次数 + 收藏
        await database.addMusic({
          id: ID,
          title: "T1",
          artist: "A1",
          album: "AL1",
          duration: 100,
          is_downloaded: false,
          added_at: 1000
        })
        await database.updateMusicPlayCount(ID)
        await database.updateMusicPlayCount(ID)
        await database.updateMusicPlayCount(ID)
        await database.toggleFavorite(ID) // => true

        const before = await database.getMusic(ID)
        expect(before!.play_count).toBe(3)
        expect(before!.is_favorite).toBe(true)
        expect(before!.added_at).toBe(1000)
        const originalLastPlayed = before!.last_played_at
        expect(typeof originalLastPlayed).toBe("number")

        // 再次 addMusic（模拟搜索同一首歌再次"添加"）
        await database.addMusic({
          id: ID,
          title: "T1-new",
          artist: "A1-new",
          album: "AL1-new",
          duration: 200,
          cover_url: "https://example.com/new.jpg",
          audio_url: "https://example.com/new.mp3",
          is_downloaded: false,
          added_at: 9999 // 传入不同值，但应被忽略
        })

        const after = await database.getMusic(ID)
        // 元信息被更新
        expect(after!.title).toBe("T1-new")
        expect(after!.artist).toBe("A1-new")
        expect(after!.album).toBe("AL1-new")
        expect(after!.duration).toBe(200)
        expect(after!.cover_url).toBe("https://example.com/new.jpg")
        expect(after!.audio_url).toBe("https://example.com/new.mp3")
        // 用户行为字段保持
        expect(after!.play_count).toBe(3)
        expect(after!.is_favorite).toBe(true)
        expect(after!.added_at).toBe(1000)
        expect(after!.last_played_at).toBe(originalLastPlayed)
      }
    },
    {
      name: "下载状态字段可通过 addMusic 变更（下载完成后回填）",
      fn: async () => {
        await database.addMusic({
          id: ID,
          title: "T",
          artist: "A",
          album: "AL",
          duration: 100,
          is_downloaded: false,
          added_at: 1000
        })
        // 模拟下载完成后重新 addMusic（当前下载流程里存在这种调用）
        await database.addMusic({
          id: ID,
          title: "T",
          artist: "A",
          album: "AL",
          duration: 100,
          is_downloaded: true,
          file_size: 1024 * 1024,
          added_at: 1000
        })
        const m = await database.getMusic(ID)
        expect(m!.is_downloaded).toBe(true)
        expect(m!.file_size).toBe(1024 * 1024)
      }
    },
    {
      name: "addMusic 不影响其他歌曲",
      fn: async () => {
        const OTHER = ID + "_other"
        try {
          await database.addMusic({
            id: OTHER, title: "X", artist: "X", album: "X",
            duration: 1, is_downloaded: false, added_at: 1
          })
          await database.updateMusicPlayCount(OTHER)

          await database.addMusic({
            id: ID, title: "T", artist: "A", album: "AL",
            duration: 1, is_downloaded: false, added_at: 1
          })

          const other = await database.getMusic(OTHER)
          expect(other!.play_count).toBe(1)
        } finally {
          await database.deleteMusic(OTHER)
        }
      }
    }
  ]
})
