import {
  Button, Color, HStack, Image, Label, List, Menu,
  Section, Spacer, Text, Toolbar, ToolbarItem, VStack, useEffect, useState
} from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { EmptyState } from "../components/empty_state"
import { LoadingState } from "../components/loading_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { SongRow } from "../components/song_row"

type SmartSortType = "recent" | "title" | "artist"

export function RecentlyPlayedView() {
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [sortType, setSortType] = useState<SmartSortType>(Storage.get<SmartSortType>("recently_played_sort") ?? "recent")
    const [searchText, setSearchText] = useState("")

    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics

    useEffect(() => { loadMusics() }, [])

  async function loadMusics() {
    try {
      const data = await database.getRecentlyPlayed(50)
      setMusics(sortMusics(data, sortType))
      const exists: Record<string, boolean> = {}
      await Promise.all(data.map(async m => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setCoverExists(exists)
    } catch (error) {
      console.error("加载最近播放失败:", error)
    } finally {
      setLoading(false)
    }
  }

  function sortMusics(data: Music[], type: SmartSortType): Music[] {
    const sorted = [...data]
    switch (type) {
      case "title": return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case "artist": return sorted.sort((a, b) => a.artist.localeCompare(b.artist))
      default: return sorted.sort((a, b) => (b.last_played_at || 0) - (a.last_played_at || 0))
    }
  }

  useEffect(() => {
    setMusics(prev => sortMusics(prev, sortType))
        Storage.set("recently_played_sort", sortType)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await database.toggleFavorite(music.id)
    await loadMusics()
  }

  async function deleteMusic(music: Music) {
    try {
      if (music.is_downloaded) await FileManager.remove(fileManager.getAudioPath(music.id))
      await database.deleteMusic(music.id)
      await loadMusics()
    } catch (error) {
      console.error("删除音乐失败:", error)
    }
  }

  async function addToPlaylist(playlistId: string) {
    if (!selectedMusic) return
    try {
      await database.addMusicToPlaylist(playlistId, selectedMusic.id)
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
    } catch (error) {
      console.error("添加到播放列表失败:", error)
    }
  }

  if (loading) return <LoadingState message="加载最近播放中..." />
  if (musics.length === 0) return <EmptyState icon="clock" title="暂无播放记录" message="播放音乐后会显示在这里" />

  return (
    <List
          navigationTitle="最近播放"
          searchable={{ value: searchText, onChanged: setSearchText }}
                    sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) { setShowPlaylistPicker(false); setSelectedMusic(null) } },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={() => { setShowPlaylistPicker(false); setSelectedMusic(null) }} />
      }}
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarTrailing">
            <Menu label={<Image systemName="arrow.up.arrow.down" />}>
              <Button title="按播放时间" systemImage={sortType === "recent" ? "checkmark" : undefined} action={() => setSortType("recent")} />
              <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
              <Button title="按艺人名称" systemImage={sortType === "artist" ? "checkmark" : undefined} action={() => setSortType("artist")} />
            </Menu>
          </ToolbarItem>
        </Toolbar>
      }
    >
      <Section>
        <Button action={async () => { player.setQueue(filtered, 0); await player.play(filtered[0]) }}>
                  <Label title="播放全部" systemImage="play.fill" tint="systemPink" />
                </Button>
                <Button action={async () => { const s = [...filtered].sort(() => Math.random() - 0.5); player.setQueue(s, 0); await player.play(s[0]) }}>
                  <Label title="随机播放" systemImage="shuffle" tint="systemPink" />
                </Button>
      </Section>
      <Section>
              {filtered.map(music => (
                <SongRow
                  itemId={music.id}
                  music={music}
                  queue={filtered}
                  coverExists={coverExists}
                  placeholderIcon="clock.fill"
                  placeholderTint="secondaryLabel"
                  onToggleFavorite={toggleFavorite}
                  onDelete={deleteMusic}
                  onAddToPlaylist={m => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                />
        ))}
      </Section>
    </List>
  )
}

export function TopPlayedView() {
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [sortType, setSortType] = useState<SmartSortType>(Storage.get<SmartSortType>("top_played_sort") ?? "recent")
    const [searchText, setSearchText] = useState("")

    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics

    useEffect(() => { loadMusics() }, [])

  async function loadMusics() {
    try {
      const all = await database.getAllMusic()
      const data = all.filter(m => m.play_count > 0).slice(0, 50)
      setMusics(sortMusics(data, sortType))
      const exists: Record<string, boolean> = {}
      await Promise.all(data.map(async m => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setCoverExists(exists)
    } catch (error) {
      console.error("加载最爱精选失败:", error)
    } finally {
      setLoading(false)
    }
  }

  function sortMusics(data: Music[], type: SmartSortType): Music[] {
    const sorted = [...data]
    switch (type) {
      case "title": return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case "artist": return sorted.sort((a, b) => a.artist.localeCompare(b.artist))
      default: return sorted.sort((a, b) => b.play_count - a.play_count)
    }
  }

  useEffect(() => {
    setMusics(prev => sortMusics(prev, sortType))
    Storage.set("top_played_sort", sortType)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await database.toggleFavorite(music.id)
    await loadMusics()
  }

  async function deleteMusic(music: Music) {
    try {
      if (music.is_downloaded) await FileManager.remove(fileManager.getAudioPath(music.id))
      await database.deleteMusic(music.id)
      await loadMusics()
    } catch (error) {
      console.error("删除音乐失败:", error)
    }
  }

  async function addToPlaylist(playlistId: string) {
    if (!selectedMusic) return
    try {
      await database.addMusicToPlaylist(playlistId, selectedMusic.id)
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
    } catch (error) {
      console.error("添加到播放列表失败:", error)
    }
  }

  if (loading) return <LoadingState message="加载最爱精选中..." />
  if (musics.length === 0) return <EmptyState icon="star" title="暂无播放记录" message="多听几首歌曲后会显示在这里" />

  return (
    <List
          navigationTitle="最爱精选"
          searchable={{ value: searchText, onChanged: setSearchText }}
                    sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) { setShowPlaylistPicker(false); setSelectedMusic(null) } },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={() => { setShowPlaylistPicker(false); setSelectedMusic(null) }} />
      }}
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarTrailing">
            <Menu label={<Image systemName="arrow.up.arrow.down" />}>
              <Button title="按播放次数" systemImage={sortType === "recent" ? "checkmark" : undefined} action={() => setSortType("recent")} />
              <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
              <Button title="按艺人名称" systemImage={sortType === "artist" ? "checkmark" : undefined} action={() => setSortType("artist")} />
            </Menu>
          </ToolbarItem>
        </Toolbar>
      }
    >
      <Section>
        <Button action={async () => { player.setQueue(filtered, 0); await player.play(filtered[0]) }}>
                  <Label title="播放全部" systemImage="play.fill" tint="systemPink" />
                </Button>
                <Button action={async () => { const s = [...filtered].sort(() => Math.random() - 0.5); player.setQueue(s, 0); await player.play(s[0]) }}>
                  <Label title="随机播放" systemImage="shuffle" tint="systemPink" />
                </Button>
      </Section>
      <Section>
              {filtered.map(music => (
                <SongRow
                  itemId={music.id}
                  music={music}
                  queue={filtered}
                  coverExists={coverExists}
                  placeholderIcon="star.fill"
                  placeholderTint="systemYellow"
                  onToggleFavorite={toggleFavorite}
                  onDelete={deleteMusic}
                  onAddToPlaylist={m => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                />
        ))}
      </Section>
    </List>
  )
}