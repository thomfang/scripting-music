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
import { downloadCenter } from "../../class/download_center"
import { BatchDownloadProgress, confirmBatchDownload, getBatchDownloadCandidates, hasBatchDownloadCandidates, loadAudioExistsMap, runBatchDownload, toDownloadMusicInfo } from "../../class/batch_download_helper"
import { safeRun } from "../../class/safe_run"

type SortType = "added" | "title" | "artist"

export function AllSongsView() {
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  /** 本地音频文件存在性（is_downloaded 和磁盘不一致时用来标识"文件丢失"） */
  const [audioExists, setAudioExists] = useState<Record<string, boolean>>({})
  /** 正在下载中的 musicId 集合（单首手动 + 批量并发共享） */
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
  const [sortType, setSortType] = useState<SortType>(Storage.get<SortType>("all_songs_sort") ?? "added")
  /** 批量下载状态：null = 未在跑；否则显示进度条 */
  const [batchDownload, setBatchDownload] = useState<BatchDownloadProgress | null>(null)
  const selected = useObservable<string[]>([])
  const musicItems = useObservable<{ id: string }[]>([])
  const editMode = useObservable<EditMode>(() => EditMode.inactive())
  const state = usePlayerState()
    const [searchText, setSearchText] = useState("")

    const isEditing = editMode.value.isEditing
    const filtered = searchText ? musics.filter(m => m.title.toLowerCase().includes(searchText.toLowerCase()) || m.artist.toLowerCase().includes(searchText.toLowerCase())) : musics
      const filteredItems = useObservable<{ id: string }[]>(filtered.map(m => ({ id: m.id })))
      useEffect(() => { filteredItems.setValue(filtered.map(m => ({ id: m.id }))) }, [searchText, musics])
      const allIds = filtered.map(m => m.id)
      const selectedSet = useMemo(() => new Set(selected.value), [selected.value])
      const musicById = useMemo(() => new Map(filtered.map(m => [m.id, m])), [searchText, musics])
  const hasSelection = selected.value.length > 0
  const hasDownloadCandidates = hasBatchDownloadCandidates(musics, audioExists)
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id))

  useEffect(() => { loadMusics() }, [])

  async function loadMusics() {
    try {
      const data = await database.getAllMusic()
      const sorted = sortMusics(data, sortType)
      setMusics(sorted)
      musicItems.setValue(sorted.map(m => ({ id: m.id })))
      // 并行检查封面 + 音频文件存在性
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
    } catch (error) {
      console.error("加载音乐失败:", error)
    } finally {
      setLoading(false)
    }
  }

  /** 下载单首歌的封装：统一维护 downloadingIds，完成后刷新状态 */
  async function downloadOne(music: Music) {
    if (downloadingIds.has(music.id)) return
    setDownloadingIds(prev => { const next = new Set(prev); next.add(music.id); return next })
    await safeRun(async () => {
      await downloadCenter.enqueue(toDownloadMusicInfo(music))
    }, { title: "下载失败", tag: "all_songs.downloadOne" })
    setDownloadingIds(prev => { const next = new Set(prev); next.delete(music.id); return next })
    await loadMusics()
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
    const sorted = sortMusics(musics, sortType)
    setMusics(sorted)
    musicItems.setValue(sorted.map(m => ({ id: m.id })))
    Storage.set("all_songs_sort", sortType)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await database.toggleFavorite(music.id)
    await loadMusics()
  }

  async function deleteMusic(music: Music) {
      try {
        await database.deleteMusic(music.id)
        await loadMusics()
      } catch (error) {
        console.error("删除音乐失败:", error)
      }
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
    try {
      await Promise.all(validIds.map(id => database.addMusicToPlaylist(playlistId, id)))
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
            if (selected.value.length > 0) exitEditing()
    } catch (error) {
      console.error("添加到播放列表失败:", error)
    }
  }

  async function batchDelete() {
    try {
      const toDelete = musics.filter(m => selectedSet.has(m.id))
      await Promise.all(toDelete.map(m => deleteMusic(m)))
      exitEditing()
    } catch (error) {
      console.error("批量删除失败:", error)
    }
  }

  /** 一键下载所有未下载的歌曲，并发池默认 3 */
  async function handleDownloadAll() {
    if (batchDownload) return // 已在跑
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
          setBatchDownload((prev: BatchDownloadProgress | null) => {
            if (!prev) return prev
            return {
              done,
              total,
              ok: prev.ok + (last.ok && !last.skipped ? 1 : 0),
              skipped: prev.skipped + (last.skipped ? 1 : 0),
              failed: prev.failed + (!last.ok ? 1 : 0),
              currentTitles: (prev.currentTitles ?? []).filter(title => title !== last.info.title),
            }
          })
        },
      })
      console.log(`[下载全部] 完成 ok=${result.ok} failed=${result.failed} skipped=${result.skipped}`)
      await loadMusics()
      setBatchDownload(null)
      await Dialog.alert({
        title: "下载完成",
        message: `成功 ${result.ok} 首，已跳过 ${result.skipped} 首，失败 ${result.failed} 首。`,
      })
    }, { title: "批量下载失败", tag: "all_songs.downloadAll" })
    setBatchDownload(null)
  }

  if (loading) return <LoadingState message="加载音乐中..." />
  if (musics.length === 0) return <EmptyState icon="music.note" title="暂无音乐" message="去搜索页面添加你喜欢的音乐吧" />

  return (
    <List
          navigationTitle="所有歌曲"
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
              <Button
                action={() => setShowPlaylistPicker(true)}
                disabled={!hasSelection}
                frame={{ maxWidth: "infinity" }}
                padding={{ horizontal: 16, vertical: 10 }}
                glassEffect={UIGlass.regular()}
              >
                <Label title="添加到播放列表" systemImage="music.note.list" />
              </Button>
              <Button
                role="destructive"
                action={batchDelete}
                disabled={!hasSelection}
                frame={{ maxWidth: "infinity" }}
                padding={{ horizontal: 16, vertical: 10 }}
                glassEffect={UIGlass.regular()}
              >
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
              <Button
                title={isAllSelected ? "反选" : "全选"}
                action={() => selected.setValue(isAllSelected ? [] : allIds)} />
            </ToolbarItem>
          )}
          <ToolbarItem placement="topBarTrailing">
            <HStack spacing={12}>
              {!isEditing && (
                <Menu label={<Image systemName="arrow.up.arrow.down" />}>
                  <Button title="按添加时间" systemImage={sortType === "added" ? "checkmark" : undefined} action={() => setSortType("added")} />
                  <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
                  <Button title="按艺人名称" systemImage={sortType === "artist" ? "checkmark" : undefined} action={() => setSortType("artist")} />
                </Menu>
              )}
              {!isEditing && hasDownloadCandidates && (
                <Button action={handleDownloadAll} disabled={batchDownload !== null}>
                  <Image systemName={batchDownload ? "arrow.down.circle.fill" : "arrow.down.circle"} />
                </Button>
              )}
              <Button
                title={isEditing ? "完成" : "编辑"}
                action={() => editMode.setValue(isEditing ? EditMode.inactive() : EditMode.active())}
              />
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
                coverExists={coverExists}
                audioExists={audioExists}
                downloadingIds={downloadingIds}
                isEditing={isEditing}
                onToggleFavorite={toggleFavorite}
                onDelete={deleteMusic}
                onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                onDownload={downloadOne}
              />
            )
          }}
        />
      </Section>
    </List>
  )
}