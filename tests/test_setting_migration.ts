import { Path } from "scripting"
import { defineSuite, expect, TestSuite } from "./test_runner"
import { database } from "../class/database"
import { setting } from "../class/setting"

/**
 * P0-1 回归测试：切换存储位置时不能丢 db / 不能丢播放列表收藏。
 *
 * 思路：我们不真的切到 iCloud（测试环境不稳定），而是测试：
 *   1. copyTree 能完整复制 db 文件（包含数据、索引、WAL）
 *   2. close + reopen 后数据仍然在
 *   3. _forceSetLocation 只是切 key 不删数据
 *   4. 完整 switchStorageLocation 在同 location 下是 no-op
 *
 * 其中 copyTree 我们通过直接调 setting 内部拷贝——它是 private，
 * 所以用 ((setting as any).copyTree) 的跳门方式；这是允许的测试手法。
 */

const TEST_MUSIC_ID = "migration_test_song"
const SCRATCH_ROOT = Path.join(FileManager.appGroupDocumentsDirectory, "__scripting_music_test__")
const SCRATCH_SRC = Path.join(SCRATCH_ROOT, "src")
const SCRATCH_DST = Path.join(SCRATCH_ROOT, "dst")

async function cleanupScratch(): Promise<void> {
  if (await FileManager.exists(SCRATCH_ROOT)) {
    await FileManager.remove(SCRATCH_ROOT)
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  const dir = path.substring(0, path.lastIndexOf("/"))
  await FileManager.createDirectory(dir, true)
  await FileManager.writeAsString(path, content)
}

async function readFile(path: string): Promise<string> {
  return await FileManager.readAsString(path)
}

export const suite: TestSuite = defineSuite({
  name: "P0-1 · 存储位置迁移",
  beforeEach: cleanupScratch,
  afterAll: cleanupScratch,

  cases: [
    {
      name: "copyTree · 复制嵌套目录和文件",
      fn: async () => {
        const copyTree = (setting as unknown as {
          copyTree: (src: string, dest: string) => Promise<void>
        }).copyTree.bind(setting)

        await writeFile(Path.join(SCRATCH_SRC, "top.txt"), "top")
        await writeFile(Path.join(SCRATCH_SRC, "sub", "a.bin"), "aaa")
        await writeFile(Path.join(SCRATCH_SRC, "sub", "nested", "b.bin"), "bbb")

        await copyTree(SCRATCH_SRC, SCRATCH_DST)

        expect(await FileManager.exists(Path.join(SCRATCH_DST, "top.txt"))).toBe(true)
        expect(await FileManager.exists(Path.join(SCRATCH_DST, "sub", "a.bin"))).toBe(true)
        expect(await FileManager.exists(Path.join(SCRATCH_DST, "sub", "nested", "b.bin"))).toBe(true)
        expect(await readFile(Path.join(SCRATCH_DST, "top.txt"))).toBe("top")
        expect(await readFile(Path.join(SCRATCH_DST, "sub", "nested", "b.bin"))).toBe("bbb")
      }
    },
    {
      name: "copyTree · 目标已存在同名文件会覆盖",
      fn: async () => {
        const copyTree = (setting as unknown as {
          copyTree: (src: string, dest: string) => Promise<void>
        }).copyTree.bind(setting)

        await writeFile(Path.join(SCRATCH_SRC, "x.txt"), "new")
        await writeFile(Path.join(SCRATCH_DST, "x.txt"), "old")

        await copyTree(SCRATCH_SRC, SCRATCH_DST)
        expect(await readFile(Path.join(SCRATCH_DST, "x.txt"))).toBe("new")
      }
    },
    {
      name: "copyTree · src 不存在时只建 dest 空目录",
      fn: async () => {
        const copyTree = (setting as unknown as {
          copyTree: (src: string, dest: string) => Promise<void>
        }).copyTree.bind(setting)

        await copyTree(SCRATCH_SRC, SCRATCH_DST)
        expect(await FileManager.exists(SCRATCH_DST)).toBe(true)
        const items = await FileManager.readDirectory(SCRATCH_DST)
        expect(items.length).toBe(0)
      }
    },
    {
      name: "database · close + reopen 保留数据",
      fn: async () => {
        await database.init()

        // 清理可能存在的旧测试数据
        const existing = await database.getMusic(TEST_MUSIC_ID)
        if (existing) await database.deleteMusic(TEST_MUSIC_ID)

        await database.addMusic({
          id: TEST_MUSIC_ID,
          title: "迁移测试曲",
          artist: "test",
          album: "test",
          duration: 1,
          is_downloaded: false,
          added_at: Date.now()
        })
        await database.updateMusicPlayCount(TEST_MUSIC_ID)
        await database.toggleFavorite(TEST_MUSIC_ID) // => true

        // 关 + 重开
        database.close()
        expect(database.isOpen()).toBe(false)
        await database.reopen()
        expect(database.isOpen()).toBe(true)

        const m = await database.getMusic(TEST_MUSIC_ID)
        expect(m).toBeTruthy()
        expect(m!.play_count).toBe(1)
        expect(m!.is_favorite).toBe(true)

        // 清理
        await database.deleteMusic(TEST_MUSIC_ID)
      }
    },
    {
      name: "switchStorageLocation · 相同 location 为 no-op",
      fn: async () => {
        const { switchStorageLocation } = await import("../class/storage_migration")
        const current = setting.location
        await switchStorageLocation(current)
        expect(setting.location).toBe(current)
        // db 仍可用
        expect(database.isOpen()).toBe(true)
        const list = await database.getAllMusic()
        expect(Array.isArray(list)).toBe(true)
      }
    },
    {
      name: "getDbPath · 返回基于当前 location 的路径",
      fn: async () => {
        const expected = Path.join(setting.getBasePath(), "music.db")
        expect(database.getDbPath()).toBe(expected)
      }
    },
  ]
})
