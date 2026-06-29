import { List, Section, Button, Label, HStack, VStack, Text, Image, Spacer, useEffect, useMemo, useState, Menu, Toolbar, ToolbarItem, useObservable, ForEach } from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { EmptyState } from "../components/empty_state"
import { LoadingState } from "../components/loading_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { SongRow } from "../components/song_row"
import { safeRun } from "../../class/safe_run"
import { playlistShare } from "../../class/playlist_share"

type SortType = "added" | "title" | "artist"

export function DownloadView() {
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [sortType, setSortType] = useState<SortType>(Storage.get<SortType>("download_sort") ?? "added")
    const selected = useObservable<string[]>([])
  const editMode = useObservable<EditMode>(() => EditMode.inactive())
  const state = usePlayerState()
    const [searchText, setSearchText] = useState("")

    const isEditing = editMode.value.isEditing
    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics
    const filteredItems = useObservable<{ id: string }[]>([])
    useEffect(() => { filteredItems.setValue(filtered.map(m => ({ id: m.id }))) }, [searchText, musics])
    const allIds = filtered.map(m => m.id)
    const selectedSet = useMemo(() => new Set(selected.value), [selected.value])
    const musicById = useMemo(() => new Map(filtered.map(m => [m.id, m])), [searchText, musics])
  const hasSelection = selected.value.length > 0
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id))

  useEffect(() => { loadMusics() }, [])

  async function loadMusics() {
    await safeRun(async () => {
      const data = await database.getDownloadedMusic()
      setMusics(sortMusics(data, sortType))
      const exists: Record<string, boolean> = {}
      await Promise.all(data.map(async (m: Music) => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setCoverExists(exists)
    }, { tag: "download.load" })
    setLoading(false)
  }

  function sortMusics(data: Music[], type: SortType): Music[] {
    const sorted = [...data]
    switch (type) {
      case "title": return sorted.sort((a, b) => a.title.localeCompare(b.title))
      case "artist": return sorted.sort((a, b) => a.artist.localeCompare(b.artist))
      default: return sorted.sort((a, b) => b.added_at - a.added_at)
    }
  }

  useEffect(() => {
    setMusics(prev => sortMusics(prev, sortType))
        Storage.set("download_sort", sortType)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await safeRun(async () => {
      await database.toggleFavorite(music.id)
      await loadMusics()
    }, { title: "操作失败", tag: "download.toggle" })
  }

  async function deleteMusic(music: Music) {
    await safeRun(async () => {
      await database.deleteMusic(music.id)
      await loadMusics()
    }, { title: "删除失败", tag: "download.delete" })
  }

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
    await safeRun(async () => {
      await Promise.all(validIds.map(id => database.addMusicToPlaylist(playlistId, id)))
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
      if (selected.value.length > 0) exitEditing()
    }, { title: "添加到播放列表失败", tag: "download.addToPlaylist" })
  }

  async function batchDelete() {
    await safeRun(async () => {
      const toDelete = musics.filter(m => selectedSet.has(m.id))
      await Promise.all(toDelete.map(m => database.deleteMusic(m.id)))
      await loadMusics()
      exitEditing()
    }, { title: "批量删除失败", tag: "download.batchDelete" })
  }

  function formatFileSize(bytes?: number): string {
    if (!bytes) return "未知"
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function shareViaSheet() {
    if (musics.length === 0) return
    await safeRun(async () => {
      const { fileUrl } = await playlistShare.exportMusicsToTempFile("已下载", musics)
      await ShareSheet.present([fileUrl])
    }, { title: "分享失败", tag: "download.share" })
  }

  async function saveToFiles() {
    if (musics.length === 0) return
    await safeRun(async () => {
      const { content, filename } = playlistShare.serializeFromMusics("已下载", musics)
      const data = Data.fromRawString(content)
      if (!data) throw new Error("序列化失败")
      await DocumentPicker.exportFiles({ files: [{ data, name: filename }] })
    }, { title: "保存失败", tag: "download.saveToFiles" })
  }

  if (loading) return <LoadingState message="加载下载音乐中..." />
  if (musics.length === 0) return <EmptyState icon="arrow.down.circle" title="暂无下载" message="下载音乐后可以离线播放" />

  return (
    <List
          navigationTitle="已下载"
          searchable={{ value: searchText, onChanged: setSearchText }}
          navigationBarBackButtonHidden={isEditing}
      tabBarVisibility={isEditing ? "hidden" : "automatic"}
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
                <>
                  <Menu label={<Image systemName="ellipsis.circle" />}>
                    <Button title="分享…" systemImage="square.and.arrow.up" action={shareViaSheet} />
                    <Button title="保存到文件…" systemImage="folder" action={saveToFiles} />
                  </Menu>
                  <Menu label={<Image systemName="arrow.up.arrow.down" />}>
                    <Button title="按添加时间" systemImage={sortType === "added" ? "checkmark" : undefined} action={() => setSortType("added")} />
                    <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
                    <Button title="按艺人名称" systemImage={sortType === "artist" ? "checkmark" : undefined} action={() => setSortType("artist")} />
                  </Menu>
                </>
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
                      placeholderIcon="arrow.down.circle.fill"
                      placeholderTint="systemGreen"
                      coverExists={coverExists}
                      trailingMeta={formatFileSize(music.file_size)}
                      isEditing={isEditing}
                      onToggleFavorite={toggleFavorite}
                      onDelete={deleteMusic}
                      onAddToPlaylist={(m: Music) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                    />
                  )
                }}
              />
      </Section>
    </List>
  )
}