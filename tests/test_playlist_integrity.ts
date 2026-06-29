import { defineSuite, expect, TestSuite } from "./test_runner"
import { database } from "../class/database"

const MUSIC_ID = "playlist_integrity_song"
const MISSING_ID = "playlist_integrity_missing_song"

async function addFixtureMusic() {
  await database.addMusic({
    id: MUSIC_ID,
    title: "Playlist Integrity Song",
    artist: "Test Artist",
    album: "Test Album",
    duration: 123,
    is_downloaded: false,
    added_at: 1000,
  })
}

async function cleanupFixture() {
  const playlists = await database.getAllPlaylists()
  await Promise.all(
    playlists
      .filter(p => p.name.startsWith("__test_playlist_integrity_"))
      .map(p => database.deletePlaylist(p.id))
  )
  const existed = await database.getMusic(MUSIC_ID)
  if (existed) await database.deleteMusic(MUSIC_ID)
}

export const suite: TestSuite = defineSuite({
  name: "Playlist integrity · 防止孤儿 playlist_music",
  beforeEach: async () => {
    await database.init()
    await cleanupFixture()
  },
  afterAll: cleanupFixture,
  cases: [
    {
      name: "不存在的 musicId 不能写入歌单，也不能增加 music_count",
      fn: async () => {
        const playlistId = await database.createPlaylist("__test_playlist_integrity_missing")
        const before = await database.getPlaylist(playlistId)
        expect(before!.music_count).toBe(0)

        await expect(async () => {
          await database.addMusicToPlaylist(playlistId, MISSING_ID)
        }).toThrow("Music not found")

        const after = await database.getPlaylist(playlistId)
        const visibleMusics = await database.getPlaylistMusic(playlistId)
        expect(after!.music_count).toBe(0)
        expect(visibleMusics.length).toBe(0)
      }
    },
    {
      name: "真实 musicId 正常写入，music_count 与可见歌曲一致",
      fn: async () => {
        await addFixtureMusic()
        const playlistId = await database.createPlaylist("__test_playlist_integrity_valid")

        await database.addMusicToPlaylist(playlistId, MUSIC_ID)

        const playlist = await database.getPlaylist(playlistId)
        const visibleMusics = await database.getPlaylistMusic(playlistId)
        expect(playlist!.music_count).toBe(1)
        expect(visibleMusics.map(m => m.id)).toEqual([MUSIC_ID])
      }
    },
    {
      name: "重复添加同一首歌不重复计数",
      fn: async () => {
        await addFixtureMusic()
        const playlistId = await database.createPlaylist("__test_playlist_integrity_duplicate")

        await database.addMusicToPlaylist(playlistId, MUSIC_ID)
        await database.addMusicToPlaylist(playlistId, MUSIC_ID)

        const playlist = await database.getPlaylist(playlistId)
        const visibleMusics = await database.getPlaylistMusic(playlistId)
        expect(playlist!.music_count).toBe(1)
        expect(visibleMusics.length).toBe(1)
      }
    }
  ]
})
