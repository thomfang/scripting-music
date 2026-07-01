import { List, Section, Button, Label, HStack, Text, Image, useEffect, useMemo, useState, Menu, Toolbar, ToolbarItem, ForEach, useObservable } from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { EmptyState } from "../components/empty_state"
import { LoadingState } from "../components/loading_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { SongRow } from "../components/song_row"
import { BatchDownloadProgressSection } from "../components/batch_download_progress"
import { safeRun } from "../../class/safe_run"
import { playlistShare } from "../../class/playlist_share"
import { downloadCenter } from "../../class/download_center"
import { BatchDownloadProgress, confirmBatchDownload, getBatchDownloadCandidates, hasBatchDownloadCandidates, loadAudioExistsMap, runBatchDownload, toDownloadMusicInfo } from "../../class/batch_download_helper"

type SortType = "added" | "title" | "artist"

export function FavoritesView() {
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [sortType, setSortType] = useState<SortType>(Storage.get<SortType>("favorites_sort") ?? "added")
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [batchDownload, setBatchDownload] = useState<BatchDownloadProgress | null>(null)
    const [audioExists, setAudioExists] = useState<Record<string, boolean>>({})
    const selected = useObservable<string[]>([])
  const editMode = useObservable<EditMode>(() => EditMode.inactive())
  const state = usePlayerState()
    const [searchText, setSearchText] = useState("")

    const isEditing = editMode.value.isEditing
    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics
    const allIds = filtered.map(m => m.id)
    const selectedSet = useMemo(() => new Set(selected.value), [selected.value])
    const musicById = useMemo(() => new Map(filtered.map(m => [m.id, m])), [searchText, musics])
    const filteredItems = useObservable<{ id: string }[]>(filtered.map(m => ({ id: m.id })))
    useEffect(() => { filteredItems.setValue(filtered.map(m => ({ id: m.id }))) }, [searchText, musics])
  const hasSelection = selected.value.length > 0
  const hasDownloadCandidates = hasBatchDownloadCandidates(musics, audioExists)
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id))

  useEffect(() => { loadMusics() }, [])

  async function loadMusics() {
    await safeRun(async () => {
      const data = await database.getFavoriteMusic()
      setMusics(sortMusics(data, sortType))
      const [coverMap, audioMap] = await Promise.all([
        (async () => {
          const r: Record<string, boolean> = {}
          await Promise.all(data.map(async m => { r[m.id] = await fileManager.coverExists(m.id) }))
          return r
        })(),
        (async () => loadAudioExistsMap(data))(),
      ])
      setCoverExists(coverMap)
      setAudioExists(audioMap)
    }, { tag: "favorites.load" })
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
    Storage.set("favorites_sort", sortType)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await safeRun(async () => {
      await database.toggleFavorite(music.id)
      await loadMusics()
    }, { title: "操作失败", tag: "favorites.toggle" })
  }

  async function deleteMusic(music: Music) {
    await safeRun(async () => {
      await database.deleteMusic(music.id)
      await loadMusics()
    }, { title: "删除失败", tag: "favorites.delete" })
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
    }, { title: "添加到播放列表失败", tag: "favorites.addToPlaylist" })
  }

  async function batchDelete() {
    await safeRun(async () => {
      const toDelete = musics.filter(m => selectedSet.has(m.id))
      await Promise.all(toDelete.map(m => database.deleteMusic(m.id)))
      await loadMusics()
      exitEditing()
    }, { title: "批量删除失败", tag: "favorites.batchDelete" })
  }

  async function shareViaSheet() {
    if (musics.length === 0) return
    await safeRun(async () => {
      const { fileUrl } = await playlistShare.exportMusicsToTempFile("我喜欢", musics)
      await ShareSheet.present([fileUrl])
    }, { title: "分享失败", tag: "favorites.share" })
  }

  async function saveToFiles() {
    if (musics.length === 0) return
    await safeRun(async () => {
      const { content, filename } = playlistShare.serializeFromMusics("我喜欢", musics)
      const data = Data.fromRawString(content)
      if (!data) throw new Error("序列化失败")
      await DocumentPicker.exportFiles({ files: [{ data, name: filename }] })
    }, { title: "保存失败", tag: "favorites.saveToFiles" })
  }
  
  async function handleDownload(music: Music) {
    if (downloadingIds.has(music.id)) return
    setDownloadingIds(prev => { const next = new Set(prev); next.add(music.id); return next })
    await safeRun(async () => {
      await downloadCenter.enqueue(toDownloadMusicInfo(music))
    }, { title: "下载失败", tag: "favorites.download" })
    setDownloadingIds(prev => { const next = new Set(prev); next.delete(music.id); return next })
    await loadMusics()
  }

  async function handleDownloadAll() {
    if (batchDownload) return
    const candidates = await getBatchDownloadCandidates(musics)
    const confirmed = await confirmBatchDownload(candidates.length)
    if (!confirmed) return

    setBatchDownload({ done: 0, total: candidates.length, ok: 0, failed: 0, skipped: 0, currentTitles: [] })
    await safeRun(async () => {
      const result = await runBatchDownload(candidates, {
        concurrency: 3,
        onItemStart: (info: any) => {
          setDownloadingIds(prev => { const next = new Set(prev); next.add(info.id); return next })
          setBatchDownload((prev: BatchDownloadProgress | null) => prev ? {
            ...prev,
            currentTitles: Array.from(new Set([...(prev.currentTitles ?? []), info.title])),
          } : prev)
        },
        onProgress: (done: number, total: number, last: any) => {
          setDownloadingIds(prev => { const next = new Set(prev); next.delete(last.info.id); return next })
          setBatchDownload((prev: BatchDownloadProgress | null) => prev ? {
            done,
            total,
            ok: prev.ok + (last.ok && !last.skipped ? 1 : 0),
            skipped: prev.skipped + (last.skipped ? 1 : 0),
            failed: prev.failed + (!last.ok ? 1 : 0),
            currentTitles: (prev.currentTitles ?? []).filter(title => title !== last.info.title),
          } : prev)
        },
      })
      await loadMusics()
      setBatchDownload(null)
      await Dialog.alert({
        title: "下载完成",
        message: `成功 ${result.ok} 首，已跳过 ${result.skipped} 首，失败 ${result.failed} 首。`,
      })
    }, { title: "批量下载失败", tag: "favorites.downloadAll" })
    setBatchDownload(null)
  }

  if (loading) return <LoadingState message="加载收藏中..." />
  if (musics.length === 0) return <EmptyState icon="heart" title="暂无收藏" message="收藏你喜欢的音乐" />

  return (
    <List
          navigationTitle="我喜欢"
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
                  {hasDownloadCandidates && (
                    <Button action={handleDownloadAll} disabled={batchDownload !== null}>
                      <Image systemName={batchDownload ? "arrow.down.circle.fill" : "arrow.down.circle"} />
                    </Button>
                  )}
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
      <BatchDownloadProgressSection progress={batchDownload} />
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
                placeholderIcon="heart.fill"
                placeholderTint="systemPink"
                coverExists={coverExists}
                audioExists={audioExists}
                downloadingIds={downloadingIds}
                isEditing={isEditing}
                onToggleFavorite={toggleFavorite}
                onDelete={deleteMusic}
                onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                onDownload={handleDownload}
                leadingSwipe={[
                  <Button key="unfav" tint="systemPink" action={() => toggleFavorite(music)}>
                    <Label title="取消" systemImage="heart.slash.fill" />
                  </Button>
                ]}
              />
            )
          }}
        />
      </Section>
    </List>
  )
}