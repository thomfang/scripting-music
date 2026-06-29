import { List, Section, Button, Label, HStack, VStack, Text, Image, Spacer, useEffect, useMemo, useState, Menu, Toolbar, ToolbarItem, NavigationLink, ForEach, useObservable } from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { LoadingState } from "../components/loading_state"
import { SongRow } from "../components/song_row"

type SortType = "title" | "artist" | "added"

function ArtistDetail({ artist, musics: initialMusics }: { artist: string, musics: Music[] }) {
  const state = usePlayerState()
  const [musics, setMusics] = useState<Music[]>(initialMusics)
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [sortType, setSortType] = useState<SortType>("title")
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
    const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
    const selected = useObservable<string[]>([])
  const editMode = useObservable<EditMode>(() => EditMode.inactive())

  const [searchText, setSearchText] = useState("")
    const isEditing = editMode.value.isEditing
    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics
    const allIds = filtered.map(m => m.id)
    const selectedSet = useMemo(() => new Set(selected.value), [selected.value])
    const musicById = useMemo(() => new Map(filtered.map(m => [m.id, m])), [searchText, musics])
    const filteredItems = useObservable<{ id: string }[]>(filtered.map(m => ({ id: m.id })))
    useEffect(() => { filteredItems.setValue(filtered.map(m => ({ id: m.id }))) }, [searchText, musics])
  const hasSelection = selected.value.length > 0
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id))

  useEffect(() => {
    async function loadCovers() {
      const exists: Record<string, boolean> = {}
      await Promise.all(initialMusics.map(async m => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setCoverExists(exists)
    }
    loadCovers()
  }, [])

  useEffect(() => {
    const sorted = [...initialMusics]
    switch (sortType) {
      case "title": sorted.sort((a, b) => a.title.localeCompare(b.title)); break
      case "added": sorted.sort((a, b) => b.added_at - a.added_at); break}
    setMusics(sorted)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await database.toggleFavorite(music.id)}

  function exitEditing() {
    editMode.setValue(EditMode.inactive())
    selected.setValue([])
  }

  async function addToPlaylist(playlistId: string) {
    const rawIds = selected.value.length > 0 ? selected.value : selectedMusic ? [selectedMusic.id] : []
    const validIds = rawIds.filter(id => musics.some((m: Music) => m.id === id))
    if (rawIds.length > 0 && validIds.length === 0) {
      await Dialog.alert({ title: "未选中歌曲", message: "请重新选择要添加的歌曲" })
      return
    }
    try {
      await Promise.all(validIds.map(id => database.addMusicToPlaylist(playlistId, id)))
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
            if (selected.value.length > 0) exitEditing()
    } catch (e) {
      console.error(e)
    }
  }

  async function batchDelete() {
      try {
        await Promise.all(
          musics.filter(m => selectedSet.has(m.id)).map(m => database.deleteMusic(m.id))
        )
        setMusics(prev => prev.filter(m => !selectedSet.has(m.id)))
        exitEditing()
      } catch (e) {
        console.error(e)
      }
    }

  return (
    <List
          navigationTitle={artist}
          searchable={{ value: searchText, onChanged: setSearchText }}
                    navigationBarBackButtonHidden={isEditing}
      environments={{ editMode }}
      selection={selected}
      sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) { setShowPlaylistPicker(false); setSelectedMusic(null) } },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={() => { setShowPlaylistPicker(false); setSelectedMusic(null) }} />
      }}
      safeAreaInset={{
        bottom: isEditing ? {
          spacing: 0,
          content: (
            <HStack padding={{ horizontal: 16, vertical: 12 }} spacing={12}>
              <Button action={() => setShowPlaylistPicker(true)} disabled={!hasSelection} frame={{ maxWidth: "infinity" }} padding={{ horizontal: 16, vertical: 10 }} glassEffect={UIGlass.regular()}>
                <Label title="添加到播放列表" systemImage="music.note.list" />
              </Button>
              <Button role="destructive" action={batchDelete} disabled={!hasSelection} frame={{ maxWidth: "infinity" }} padding={{ horizontal: 16, vertical: 10 }} glassEffect={UIGlass.regular()}>
                <Label title="删除" systemImage="trash" />
              </Button>
            </HStack>
          )
        } : undefined
      }}
      toolbar={
        <Toolbar>
          {isEditing && (
            <ToolbarItem placement="topBarLeading">
              <Button title={isAllSelected ? "反选" : "全选"} action={() => selected.setValue(isAllSelected ? [] : allIds)} />
            </ToolbarItem>
          )}
          <ToolbarItem placement="topBarTrailing">
            <HStack spacing={12}>
              {!isEditing && (
                <Menu label={<Image systemName="arrow.up.arrow.down" />}>
                  <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
                  <Button title="按添加时间" systemImage={sortType === "added" ? "checkmark" : undefined} action={() => setSortType("added")} />
                </Menu>
              )}
              <Button title={isEditing ? "完成" : "编辑"} action={() => editMode.setValue(isEditing ? EditMode.inactive() : EditMode.active())} />
            </HStack>
          </ToolbarItem>
        </Toolbar>
      }
    >
      {!isEditing && (
        <Section>
          <Button action={async () => { player.setQueue(filtered, 0); await player.play(filtered[0]) }}>
                      <Label title="播放全部" systemImage="play.fill" tint="systemPink" />
                    </Button>
                    <Button action={async () => { const s = [...filtered].sort(() => Math.random() - 0.5); player.setQueue(s, 0); await player.play(s[0]) }}>
                      <Label title="随机播放" systemImage="shuffle" tint="systemPink" />
                    </Button>
        </Section>
      )}
      <Section>
        <ForEach
          data={filteredItems}
          builder={(item) => {
            const music = musicById.get(item.id)
            if (!music) return <Text>{""}</Text>
            return (
              <SongRow
                itemId={music.id}
                music={music}
                queue={musics}
                coverExists={coverExists}
                fallbackRemoteCover={true}
                subtitle={music.album}
                isEditing={isEditing}
                onToggleFavorite={toggleFavorite}
                onDelete={() => { /* 艺人页不提供删除 */ }}
                onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                trailingSwipe={[]}
              />
            )
          }}
        />
      </Section>
    </List>
  )
}

export function ArtistsView() {
  const [artists, setArtists] = useState<{ artist: string, count: number, musics: Music[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    database.getMusicByArtist().then(setArtists)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState message="加载艺人中..." />

  const filtered = searchText
    ? artists.filter(a => a.artist.toLowerCase().includes(searchText.toLowerCase()))
    : artists

  return (
    <List navigationTitle="艺人" searchable={{ value: searchText, onChanged: setSearchText }}>
      {filtered.map(item => (
        <NavigationLink
          key={item.artist}
          destination={<ArtistDetail artist={item.artist} musics={item.musics} />}>
          <HStack spacing={12}>
            <Image systemName="person.circle.fill" font="largeTitle" tint="accentColor" frame={{ width: 40, height: 40 }} />
            <VStack alignment="leading" spacing={2}>
              <Text font="headline" lineLimit={1}>{item.artist}</Text>
              <Text font="subheadline" foregroundStyle="secondaryLabel">{item.count} 首歌曲</Text>
            </VStack>
          </HStack>
        </NavigationLink>
      ))}
    </List>
  )
}