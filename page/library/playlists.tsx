import {
  Button, ForEach, HStack, Image, Label, List, Menu, Navigation, NavigationLink,
  Rectangle, ScrollView, Section, Text, Toolbar, ToolbarItem, VStack, ZStack,
  useEffect, useMemo, useObservable, useState
} from "scripting"
import { database, Music, Playlist } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { fileManager } from "../../class/file_manager"
import { CoverCollage } from "./components"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { SongRow } from "../components/song_row"
import { BatchDownloadProgressSection } from "../components/batch_download_progress"
import { playlistShare } from "../../class/playlist_share"
import { safeRun } from "../../class/safe_run"
import { BatchDownloadProgress, confirmBatchDownload, getBatchDownloadCandidates, hasBatchDownloadCandidates, loadAudioExistsMap, runBatchDownload, toDownloadMusicInfo } from "../../class/batch_download_helper"
import { downloadCenter } from "../../class/download_center"

export function PlaylistsView() {
  const playlists = useObservable<Playlist[]>([])
  const [collageMusics, setCollageMusics] = useState<Record<string, Music[]>>({})
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<string | null>(null)

  async function loadPlaylists() {
    await safeRun(async () => {
      const list = await database.getAllPlaylists()
      playlists.setValue(list)
      // 为拼图拉取各歌单前 4 首（并发）
      const entries = await Promise.all(list.map(async p => {
        const m = await database.getPlaylistMusic(p.id).catch(() => [] as Music[])
        return [p.id, m.slice(0, 4)] as const
      }))
      setCollageMusics(Object.fromEntries(entries))
    }, { tag: "playlists.load" })
  }

  async function createPlaylist() {
    const name = await Dialog.prompt({ title: "新建播放列表", placeholder: "播放列表名称" })
    if (!name) return
    await safeRun(async () => {
      await database.createPlaylist(name)
      await loadPlaylists()
    }, { title: "新建失败", tag: "playlists.create" })
  }

  async function importPlaylist() {
    await safeRun(async () => {
      const files = await DocumentPicker.pickFiles({
        allowsMultipleSelection: false,
      })
      if (!files || files.length === 0) return
      const filePath = files[0]

      // 弹出选择对话框：新建 or 合并
      // 0 = 新建歌单，1 = 合并到已有歌单，null = 取消
      const choice = await Dialog.actionSheet({
        title: "导入歌单",
        message: "选择导入方式",
        actions: [
          { label: "新建歌单" },
          { label: "合并到已有歌单" },
        ],
      })

      if (choice == null) {
        DocumentPicker.stopAcessingSecurityScopedResources()
        return
      }

      if (choice === 1) {
        // 先刷新歌单列表，然后显示 picker
        await loadPlaylists()
        if (playlists.value.length === 0) {
          DocumentPicker.stopAcessingSecurityScopedResources()
          await Dialog.alert({ title: "暂无歌单", message: "请先创建一个歌单后再选择合并" })
          return
        }
        setPendingImportFile(filePath)
        setShowImportPicker(true)
        return
      }

      // 新建歌单
      const stats = await playlistShare.importFromFile(filePath)
      DocumentPicker.stopAcessingSecurityScopedResources()
      await loadPlaylists()
      await Dialog.alert({
        title: "导入完成",
        message: `歌单：${stats.playlistName}\n共 ${stats.total} 首\n新增歌曲：${stats.newMusics}\n已存在：${stats.existedMusics}\n加入歌单：${stats.addedToPlaylist}\n已在歌单：${stats.alreadyInPlaylist}`
      })
    }, { title: "导入失败", tag: "playlists.import" })
  }

  async function handleMergeSelect(targetPlaylistId: string) {
    setShowImportPicker(false)
    const filePath = pendingImportFile
    setPendingImportFile(null)
    if (!filePath) return

    await safeRun(async () => {
      const stats = await playlistShare.importFromFile(filePath, { mergeIntoPlaylistId: targetPlaylistId })
      DocumentPicker.stopAcessingSecurityScopedResources()
      await loadPlaylists()
      await Dialog.alert({
        title: "导入完成",
        message: `已合并到：${stats.playlistName}\n共 ${stats.total} 首\n新增歌曲：${stats.newMusics}\n已存在：${stats.existedMusics}\n加入歌单：${stats.addedToPlaylist}\n已在歌单：${stats.alreadyInPlaylist}`
      })
    }, { title: "合并失败", tag: "playlists.merge" })
  }

  function handleImportPickerDismiss() {
    setShowImportPicker(false)
    setPendingImportFile(null)
    DocumentPicker.stopAcessingSecurityScopedResources()
  }

  useEffect(() => { loadPlaylists() }, [])

  return (
    <List
      navigationTitle="播放列表"
      sheet={{
        isPresented: showImportPicker,
        onChanged: (v: boolean) => { if (!v) handleImportPickerDismiss() },
        content: <PlaylistPickerContent onSelect={handleMergeSelect} onDismiss={handleImportPickerDismiss} />
      }}
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarTrailing">
            <Menu label={<Image systemName="plus" />}>
              <Button title="新建播放列表" systemImage="plus.circle" action={createPlaylist} />
              <Button title="导入歌单…" systemImage="square.and.arrow.down" action={importPlaylist} />
            </Menu>
          </ToolbarItem>
        </Toolbar>
      }
    >
      {playlists.value.length === 0 ? (
        <VStack spacing={14} padding={{ vertical: 60 }} frame={{ maxWidth: "infinity" }}>
          <Image systemName="music.note.list" font={{ name: "system", size: 52 }} foregroundStyle="tertiaryLabel" />
          <Text font="headline" foregroundStyle="secondaryLabel">还没有播放列表</Text>
          <Text font="subheadline" foregroundStyle="tertiaryLabel">点右上角 + 新建或导入歌单</Text>
        </VStack>
      ) : (
        playlists.value.map(playlist => (
          <NavigationLink key={playlist.id} destination={<PlaylistDetail playlistId={playlist.id} onDeleted={loadPlaylists} />}>
            <HStack spacing={12}>
              <CoverCollage musics={collageMusics[playlist.id] ?? []} size={50} cornerRadius={9} showShadow={false} />
              <VStack alignment="leading" spacing={2}>
                <Text font="headline">{playlist.name}</Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">{playlist.music_count} 首歌曲</Text>
              </VStack>
            </HStack>
          </NavigationLink>
        ))
      )}
    </List>
  )
}

function PlaylistDetail({ playlistId, onDeleted }: { playlistId: string, onDeleted: () => void }) {
  const dismiss = Navigation.useDismiss()
  const playlist = useObservable<Playlist | null>(null)
  const [musics, setMusics] = useState<Music[]>([])
  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [audioExists, setAudioExists] = useState<Record<string, boolean>>({})
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set())
  const [batchDownload, setBatchDownload] = useState<BatchDownloadProgress | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
    const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
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
  const hasDownloadCandidates = hasBatchDownloadCandidates(musics, audioExists)
  const isAllSelected = allIds.length > 0 && allIds.every(id => selectedSet.has(id))

  async function load() {
    await safeRun(async () => {
      const p = await database.getPlaylist(playlistId)
      playlist.setValue(p)
      const m = await database.getPlaylistMusic(playlistId)
      setMusics(m)
      const [coverMap, audioMap] = await Promise.all([
        (async () => {
          const exists: Record<string, boolean> = {}
          await Promise.all(m.map(async music => { exists[music.id] = await fileManager.coverExists(music.id) }))
          return exists
        })(),
        loadAudioExistsMap(m),
      ])
      setCoverExists(coverMap)
      setAudioExists(audioMap)
    }, { tag: "playlist.detail.load" })
  }

  useEffect(() => { load() }, [])

  async function deletePlaylist() {
    const confirmed = await Dialog.confirm({ title: "删除播放列表", message: "确定要删除这个播放列表吗？" })
    if (!confirmed) return
    await safeRun(async () => {
      await database.deletePlaylist(playlistId)
      onDeleted()
      dismiss()
    }, { title: "删除失败", tag: "playlist.delete" })
  }

  async function shareViaSheet() {
    if (!playlist.value) return
    if (musics.length === 0) {
      await Dialog.alert({ title: "无法分享", message: "歌单为空" })
      return
    }
    await safeRun(async () => {
      const { fileUrl } = await playlistShare.exportToTempFile(playlistId)
      // ShareSheet 的 ActivityItem 类型标注为 string | UIImage，
      // 但底层 UIActivityViewController 会尝试把 "file://..." 识别成文件 URL。
      // 若系统把它当文本处理，用户可从菜单选"保存到文件…"降级。
      await ShareSheet.present([fileUrl])
    }, { title: "分享失败", tag: "playlist.shareSheet" })
  }

  async function saveToFiles() {
    if (!playlist.value) return
    if (musics.length === 0) {
      await Dialog.alert({ title: "无法保存", message: "歌单为空" })
      return
    }
    await safeRun(async () => {
      const { content, filename } = await playlistShare.serializePlaylist(playlistId)
      const data = Data.fromRawString(content)
      if (!data) throw new Error("序列化失败")
      await DocumentPicker.exportFiles({
        files: [{ data, name: filename }]
      })
    }, { title: "保存失败", tag: "playlist.saveToFiles" })
  }

  async function removeFromPlaylist(musicId: string) {
    await safeRun(async () => {
      await database.removeMusicFromPlaylist(playlistId, musicId)
      await load()
    }, { title: "移除失败", tag: "playlist.remove" })
  }

  function exitEditing() {
    editMode.setValue(EditMode.inactive())
    selected.setValue([])
  }

  async function batchRemove() {
    await safeRun(async () => {
      await Promise.all(selected.value.map(id => database.removeMusicFromPlaylist(playlistId, id)))
      await load()
      exitEditing()
    }, { title: "批量移除失败", tag: "playlist.batchRemove" })
  }

  async function addToPlaylist(targetPlaylistId: string) {
    const rawIds = selected.value.length > 0 ? selected.value : selectedMusic ? [selectedMusic.id] : []
    const validIds = rawIds.filter(id => musics.some((m: Music) => m.id === id))
    if (rawIds.length > 0 && validIds.length === 0) {
      await Dialog.alert({ title: "未选中歌曲", message: "请重新选择要添加的歌曲" })
      return
    }
    await safeRun(async () => {
      await Promise.all(validIds.map(id => database.addMusicToPlaylist(targetPlaylistId, id)))
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
      if (selected.value.length > 0) exitEditing()
    }, { title: "添加到播放列表失败", tag: "playlist.addTo" })
  }

  async function downloadOne(music: Music) {
    if (downloadingIds.has(music.id)) return
    setDownloadingIds(prev => { const next = new Set(prev); next.add(music.id); return next })
    await safeRun(async () => {
      await downloadCenter.enqueue(toDownloadMusicInfo(music))
    }, { title: "下载失败", tag: "playlist.download" })
    setDownloadingIds(prev => { const next = new Set(prev); next.delete(music.id); return next })
    await load()
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
      await load()
      setBatchDownload(null)
      await Dialog.alert({
        title: "下载完成",
        message: `成功 ${result.ok} 首，已跳过 ${result.skipped} 首，失败 ${result.failed} 首。`,
      })
    }, { title: "批量下载失败", tag: "playlist.downloadAll" })
    setBatchDownload(null)
  }

  if (!playlist.value) return <Text>加载中...</Text>

  return (
    <List
          navigationTitle={playlist.value.name}
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
              <Button role="destructive" action={batchRemove} disabled={!hasSelection} frame={{ maxWidth: "infinity" }} padding={{ horizontal: 16, vertical: 10 }} glassEffect={UIGlass.regular()}>
                <Label title="移除" systemImage="minus.circle" />
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
                <Menu label={<Image systemName="ellipsis" />}>
                  <Button title="分享…" systemImage="square.and.arrow.up" action={shareViaSheet} />
                  <Button title="保存到文件…" systemImage="folder" action={saveToFiles} />
                  {hasDownloadCandidates && (
                    <Button title="下载全部" systemImage="arrow.down.circle" action={handleDownloadAll} disabled={batchDownload !== null} />
                  )}
                  <Button title="删除播放列表" role="destructive" action={deletePlaylist} />
                </Menu>
              )}
              <Button title={isEditing ? "完成" : "编辑"} action={() => editMode.setValue(isEditing ? EditMode.inactive() : EditMode.active())} />
            </HStack>
          </ToolbarItem>
        </Toolbar>
      }
    >
      <BatchDownloadProgressSection progress={batchDownload} />
      {!isEditing && <PlaylistHeader playlist={playlist.value} musics={musics} coverExists={coverExists} />}
      {!isEditing && musics.length > 0 && (
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
                      fallbackRemoteCover={true}
                      isEditing={isEditing}
                      onToggleFavorite={() => { /* 详情页不直接收藏 */ }}
                      onDelete={() => removeFromPlaylist(music.id)}
                      onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
                      onDownload={downloadOne}
                      extraMenuItems={
                        <Button
                          title="从歌单移除"
                          systemImage="minus.circle"
                          role="destructive"
                          action={() => removeFromPlaylist(music.id)}
                        />
                      }
                      hideDefaultDelete={true}
                      leadingSwipe={[]}
                      trailingSwipe={[
                        <Button key="rm" role="destructive" action={() => removeFromPlaylist(music.id)}>
                          <Label title="移除" systemImage="minus.circle" />
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

/** 详情页 banner 渐变暗角（与专辑/艺人页 SCRIM 同式）。 */
const BANNER_SCRIM = {
  colors: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.34)", "rgba(0,0,0,0.78)"],
  startPoint: "top",
  endPoint: "bottom",
} as any

function formatTotalDuration(secs: number): string {
  if (secs <= 0) return ""
  const h = Math.floor(secs / 3600)
  const m = Math.round((secs % 3600) / 60)
  if (h > 0) return `${h} 小时 ${m} 分钟`
  return `${m} 分钟`
}

function formatUpdatedAt(ts: number): string {
  if (!ts) return ""
  const d = new Date(ts)
  const y = d.getFullYear()
  const mo = (d.getMonth() + 1).toString().padStart(2, "0")
  const da = d.getDate().toString().padStart(2, "0")
  return `${y}-${mo}-${da}`
}

/** 详情页顶部 header：拼图封面 banner + 名称 + 统计 chips。与 AlbumHeader 对齐。 */
function PlaylistHeader({ playlist, musics, coverExists }: { playlist: Playlist, musics: Music[], coverExists: Record<string, boolean> }) {
  const totalDuration = musics.reduce((sum, m) => sum + (m.duration > 0 ? m.duration : 0), 0)
  const hasCover = musics.length > 0

  const chips: { icon: string, text: string }[] = []
  chips.push({ icon: "music.note", text: `${playlist.music_count} 首` })
  const dur = formatTotalDuration(totalDuration)
  if (dur) chips.push({ icon: "clock", text: dur })
  const updated = formatUpdatedAt(playlist.updated_at)
  if (updated) chips.push({ icon: "calendar", text: `更新 ${updated}` })

  const foreground = (
    <VStack spacing={10} padding={{ vertical: 18, horizontal: 16 }}>
      <CoverCollage musics={musics.slice(0, 4)} size={150} cornerRadius={12} />
      <Text font="title2" fontWeight="bold" foregroundStyle={hasCover ? "white" : "label"} lineLimit={2} multilineTextAlignment="center">{playlist.name}</Text>
      <HStack spacing={8}>
        {chips.map((c, i) => (
          <HStack key={i} spacing={4} padding={{ horizontal: 10, vertical: 5 }} background={hasCover ? "rgba(255,255,255,0.18)" : "secondarySystemBackground"} clipShape="capsule">
            <Image systemName={c.icon} font="caption2" foregroundStyle={hasCover ? "white" : "secondaryLabel"} />
            <Text font="caption" fontWeight="medium" foregroundStyle={hasCover ? "white" : "secondaryLabel"} lineLimit={1}>{c.text}</Text>
          </HStack>
        ))}
      </HStack>
    </VStack>
  )

  return (
    <Section listRowInsets={0} listRowSeparator="hidden">
      <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
        {hasCover ? (
          <ZStack frame={{ maxWidth: "infinity", height: 300 }} clipped={true}>
            <CoverCollage musics={musics.slice(0, 4)} size={Device.screen.width} cornerRadius={0} showShadow={false} blur={28} />
            <Rectangle frame={{ maxWidth: "infinity", height: 300 }} fill={BANNER_SCRIM} />
            {foreground}
          </ZStack>
        ) : (
          foreground
        )}
      </VStack>
    </Section>
  )
}

/** 供资料库首页卡片编程式跳转的包装（自带 onDeleted 空实现，调用方可覆盖）。 */
export function PlaylistDetailPage({ playlistId, onDeleted }: { playlistId: string, onDeleted?: () => void }) {
  return <PlaylistDetail playlistId={playlistId} onDeleted={onDeleted ?? (() => { })} />
}
