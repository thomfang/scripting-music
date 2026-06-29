import { defineSuite, expect, TestSuite } from "./test_runner"
import { database } from "../class/database"
import { playlistShare } from "../class/playlist_share"

/**
 * P1-1 · playlist_share 核心逻辑测试
 *
 * 覆盖：
 *  - serializePlaylist 结构 & 字段
 *  - exportToTempFile 写入真实文件 / 文件 URL 前缀
 *  - parse/validate 的各类错误分支
 *  - importFromFile
 *      · 新建歌单场景（新增全部歌曲）
 *      · 已有歌曲复用（不破坏 play_count/is_favorite）
 *      · 歌单重名自动改名
 *      · mergeIntoPlaylistId 指定合并
 *      · 重复导入不再增加
 */

// 用固定的测试 id 前缀，便于 afterAll 清理
const SONG_A = "plshare_test_A"
const SONG_B = "plshare_test_B"
const SONG_C = "plshare_test_C"
const PL_NAME = "PL_SHARE_TEST_SRC"

async function cleanTestData(): Promise<void> {
  await database.init()
  // 清理所有同名测试歌单
  const all = await database.getAllPlaylists()
  for (const p of all) {
    if (p.name === PL_NAME || p.name.startsWith(PL_NAME)) {
      await database.deletePlaylist(p.id)
    }
  }
  for (const id of [SONG_A, SONG_B, SONG_C]) {
    const existed = await database.getMusic(id)
    if (existed) await database.deleteMusic(id)
  }
  await playlistShare.cleanupSharedDir()
}

async function seedSourcePlaylist(): Promise<string> {
  const id = await database.createPlaylist(PL_NAME)
  for (const m of [
    { id: SONG_A, title: "A", artist: "ar", album: "al", duration: 100 },
    { id: SONG_B, title: "B", artist: "ar", album: "al", duration: 200 },
  ]) {
    await database.addMusic({ ...m, is_downloaded: false, added_at: Date.now() })
    await database.addMusicToPlaylist(id, m.id)
  }
  return id
}

export const suite: TestSuite = defineSuite({
  name: "P1-1 · playlist_share",
  beforeEach: cleanTestData,
  afterAll: cleanTestData,

  cases: [
    {
      name: "serializePlaylist · 产出合法结构",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { content, filename, playlist } = await playlistShare.serializePlaylist(plId)
        expect(playlist.name).toBe(PL_NAME)
        expect(filename.endsWith(".smpl.json")).toBe(true)
        const parsed = JSON.parse(content)
        expect(parsed.format).toBe("scripting-music-playlist")
        expect(parsed.version).toBe(1)
        expect(parsed.playlist.name).toBe(PL_NAME)
        expect(Array.isArray(parsed.musics)).toBe(true)
        expect(parsed.musics.length).toBe(2)
        expect(parsed.musics[0].id).toBe(SONG_A)
        // 不应泄露用户行为字段
        expect("play_count" in parsed.musics[0]).toBe(false)
        expect("is_favorite" in parsed.musics[0]).toBe(false)
      }
    },
    {
      name: "exportToTempFile · 写入真实文件 + 返回 file:// URL",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const r = await playlistShare.exportToTempFile(plId)
        expect(r.count).toBe(2)
        expect(r.fileUrl.startsWith("file://")).toBe(true)
        expect(r.fileUrl.endsWith(r.filePath)).toBe(true)
        expect(await FileManager.exists(r.filePath)).toBe(true)

        // 覆盖写：第二次导出同名文件不应报错
        const r2 = await playlistShare.exportToTempFile(plId)
        expect(r2.filePath).toBe(r.filePath)
      }
    },
    {
      name: "parse · 拒绝非法 JSON / 非本格式 / 未来版本号",
      fn: async () => {
        await expect(async () => playlistShare.parse("not json")).toThrow("JSON")
        await expect(async () =>
          playlistShare.parse(JSON.stringify({ format: "other", version: 1 }))
        ).toThrow("不是歌单")
        await expect(async () =>
          playlistShare.parse(JSON.stringify({
            format: "scripting-music-playlist", version: 999,
            playlist: { name: "x" }, musics: []
          }))
        ).toThrow("版本")
      }
    },
    {
      name: "parse · 拒绝 musics 里缺 id/title",
      fn: async () => {
        await expect(async () => playlistShare.parse(JSON.stringify({
          format: "scripting-music-playlist", version: 1,
          playlist: { name: "x" },
          musics: [{ title: "缺 id" }]
        }))).toThrow("id")
      }
    },
    {
      name: "importFromFile · 新建歌单，插入全部歌曲",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { filePath } = await playlistShare.exportToTempFile(plId)

        // 清空源歌单的两首歌，确保导入时是全新入库
        await database.deleteMusic(SONG_A)
        await database.deleteMusic(SONG_B)
        await database.deletePlaylist(plId)

        const stats = await playlistShare.importFromFile(filePath)
        expect(stats.playlistName).toBe(PL_NAME)
        expect(stats.total).toBe(2)
        expect(stats.newMusics).toBe(2)
        expect(stats.existedMusics).toBe(0)
        expect(stats.addedToPlaylist).toBe(2)
        expect(stats.alreadyInPlaylist).toBe(0)

        const added = await database.getPlaylistMusic(stats.playlistId)
        expect(added.length).toBe(2)
        expect(added.map(m => m.id).sort()).toEqual([SONG_A, SONG_B].sort())
      }
    },
    {
      name: "importFromFile · 重名歌单自动改名，不覆盖本地",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { filePath } = await playlistShare.exportToTempFile(plId)

        // 不清理，直接再导入一次 → 重名
        const stats = await playlistShare.importFromFile(filePath)
        expect(stats.playlistName).toBe(`${PL_NAME} (导入 2)`)
        expect(stats.newMusics).toBe(0)        // 歌曲已存在
        expect(stats.existedMusics).toBe(2)
        expect(stats.addedToPlaylist).toBe(2)  // 但新歌单里还没有，要加进去

        const srcStill = await database.getPlaylist(plId)
        expect(srcStill!.name).toBe(PL_NAME)   // 源歌单名不受影响
      }
    },
    {
      name: "importFromFile · 保留已有歌曲的 play_count / is_favorite",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        // 让 SONG_A 产生用户行为
        await database.updateMusicPlayCount(SONG_A)
        await database.updateMusicPlayCount(SONG_A)
        await database.toggleFavorite(SONG_A)  // => true

        const { filePath } = await playlistShare.exportToTempFile(plId)
        await playlistShare.importFromFile(filePath)   // 再次导入

        const a = await database.getMusic(SONG_A)
        expect(a!.play_count).toBe(2)
        expect(a!.is_favorite).toBe(true)
      }
    },
    {
      name: "importFromFile · 指定 mergeIntoPlaylistId 合并到已有歌单",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { filePath } = await playlistShare.exportToTempFile(plId)

        const targetId = await database.createPlaylist("target_merge_playlist")
        // 先手动放一首非分享内的歌
        await database.addMusic({
          id: SONG_C, title: "C", artist: "ar", album: "al",
          duration: 10, is_downloaded: false, added_at: Date.now()
        })
        await database.addMusicToPlaylist(targetId, SONG_C)

        const stats = await playlistShare.importFromFile(filePath, {
          mergeIntoPlaylistId: targetId
        })
        expect(stats.playlistId).toBe(targetId)
        expect(stats.addedToPlaylist).toBe(2)   // SONG_A / SONG_B 合进来
        expect(stats.alreadyInPlaylist).toBe(0)

        const contents = await database.getPlaylistMusic(targetId)
        expect(contents.length).toBe(3)   // C + A + B
        // 清理
        await database.deletePlaylist(targetId)
      }
    },
    {
      name: "importFromFile · 重复合并不会增加（alreadyInPlaylist 计数）",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { filePath } = await playlistShare.exportToTempFile(plId)
        const targetId = await database.createPlaylist("target_merge_dup")

        const stats1 = await playlistShare.importFromFile(filePath, { mergeIntoPlaylistId: targetId })
        expect(stats1.addedToPlaylist).toBe(2)
        expect(stats1.alreadyInPlaylist).toBe(0)

        const stats2 = await playlistShare.importFromFile(filePath, { mergeIntoPlaylistId: targetId })
        expect(stats2.addedToPlaylist).toBe(0)
        expect(stats2.alreadyInPlaylist).toBe(2)

        const contents = await database.getPlaylistMusic(targetId)
        expect(contents.length).toBe(2)

        await database.deletePlaylist(targetId)
      }
    },
    {
      name: "importFromFile · 指定不存在的合并目标 → 抛错",
      fn: async () => {
        const plId = await seedSourcePlaylist()
        const { filePath } = await playlistShare.exportToTempFile(plId)
        await expect(async () =>
          playlistShare.importFromFile(filePath, { mergeIntoPlaylistId: "not_exist_id" })
        ).toThrow("目标播放列表")
      }
    },
    {
      name: "serializeFromMusics · 从 Music[] 直接序列化",
      fn: async () => {
        await seedSourcePlaylist()
        const a = await database.getMusic(SONG_A)
        const b = await database.getMusic(SONG_B)
        const { content, filename } = playlistShare.serializeFromMusics("测试分享", [a!, b!])
        expect(filename.endsWith(".smpl.json")).toBe(true)
        const parsed = JSON.parse(content)
        expect(parsed.format).toBe("scripting-music-playlist")
        expect(parsed.playlist.name).toBe("测试分享")
        expect(parsed.musics.length).toBe(2)
        expect(parsed.musics[0].id).toBe(SONG_A)
        // 不泄露行为字段
        expect("play_count" in parsed.musics[0]).toBe(false)
        expect("is_favorite" in parsed.musics[0]).toBe(false)
      }
    },
    {
      name: "exportMusicsToTempFile · 写入真实文件",
      fn: async () => {
        await seedSourcePlaylist()
        const a = await database.getMusic(SONG_A)
        const b = await database.getMusic(SONG_B)
        const r = await playlistShare.exportMusicsToTempFile("已下载", [a!, b!])
        expect(r.count).toBe(2)
        expect(r.fileUrl.startsWith("file://")).toBe(true)
        expect(await FileManager.exists(r.filePath)).toBe(true)
        // 导入回来也能用
        const stats = await playlistShare.importFromFile(r.filePath)
        expect(stats.playlistName).toBe("已下载")
        expect(stats.total).toBe(2)
        // 清理
        await database.deletePlaylist(stats.playlistId)
      }
    },
  ]
})
