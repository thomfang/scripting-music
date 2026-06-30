import { List, Section, Button, Label, HStack, VStack, ZStack, Rectangle, Text, Image, Spacer, useEffect, useMemo, useState, Menu, Toolbar, ToolbarItem, NavigationLink, ForEach, useObservable } from "scripting"
import { database, Music } from "../../class/database"
import { albumInfo, AlbumInfo } from "../../class/sources/album_info"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { LoadingState } from "../components/loading_state"
import { SongRow } from "../components/song_row"
import { AlbumRow } from "./rows"

type SortType = "title" | "added"

/**
 * 专辑详情页。
 * @param onClose 传入时（如播放页 sheet 场景，无系统返回键）在 toolbar 左侧显示「关闭」按钮。
 */
export function AlbumDetail({ album, artist, musics: initialMusics, onClose }: { album: string, artist: string, musics: Music[], onClose?: () => void }) {
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
    if (sortType === "title") sorted.sort((a, b) => a.title.localeCompare(b.title))
    else sorted.sort((a, b) => b.added_at - a.added_at)
    setMusics(sorted)
  }, [sortType])

  async function toggleFavorite(music: Music) {
    await database.toggleFavorite(music.id)
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

  const formatDuration = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`

  return (
    <List
          navigationTitle={album}
          navigationSubtitle={artist}
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
          {isEditing ? (
            <ToolbarItem placement="topBarLeading">
              <Button title={isAllSelected ? "反选" : "全选"} action={() => selected.setValue(isAllSelected ? [] : allIds)} />
            </ToolbarItem>
          ) : onClose ? (
            <ToolbarItem placement="topBarLeading">
              <Button title="关闭" systemImage="xmark" action={onClose} />
            </ToolbarItem>
          ) : null}
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
      {!isEditing && <AlbumHeader album={album} artist={artist} musics={musics} />}
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
                subtitle={music.duration > 0 ? formatDuration(music.duration) : ""}
                isEditing={isEditing}
                onToggleFavorite={toggleFavorite}
                onDelete={() => { /* 专辑页不提供删除入口 */ }}
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

export function AlbumsView() {
  const [albums, setAlbums] = useState<{ album: string, artist: string, count: number, musics: Music[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [searchText, setSearchText] = useState("")

  useEffect(() => {
    database.getMusicByAlbum()
      .then(setAlbums)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <LoadingState message="加载专辑中..." />

  const filtered = searchText
    ? albums.filter(a =>
        a.album.toLowerCase().includes(searchText.toLowerCase()) ||
        a.artist.toLowerCase().includes(searchText.toLowerCase())
      )
    : albums

  return (
    <List navigationTitle="专辑" searchable={{ value: searchText, onChanged: setSearchText }}>
      {filtered.map(item => (
        <NavigationLink
          key={`${item.album}-${item.artist}`}
          destination={<AlbumDetail album={item.album} artist={item.artist} musics={item.musics} />}>
          <AlbumRow album={item.album} artist={item.artist} count={item.count} musics={item.musics} />
        </NavigationLink>
      ))}
    </List>
  )
}

/** 详情页 banner 渐变暗角（顶部轻、底部深，保白字/chips 可读）。与艺人页/播放页 SCRIM 同式。 */
const BANNER_SCRIM = {
  colors: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.34)", "rgba(0,0,0,0.78)"],
  startPoint: "top",
  endPoint: "bottom",
} as any

/** 详情页顶部 header：专辑封面大图 + 信息 chips + 可展开简介。信息全缺失时不渲染。 */
function AlbumHeader({ album, artist, musics }: { album: string, artist: string, musics: Music[] }) {
  const localCover = musics.find(m => m.cover_url)?.cover_url ?? null
  const [info, setInfo] = useState<AlbumInfo | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    albumInfo.fetch(artist, album).then(i => { if (alive) setInfo(i) }).catch(() => { })
    return () => { alive = false }
  }, [album, artist])

  const cover = (info?.thumb ?? localCover) || undefined
  const hasCover = !!cover && !coverFailed
  const description = info?.description

  // 结构化 chips：年代 / 流派 / 厂牌
  const chips: { icon: string, text: string }[] = []
  if (info?.year) chips.push({ icon: "calendar", text: info.year })
  if (info?.genre) chips.push({ icon: "guitars", text: info.genre })
  if (info?.label) chips.push({ icon: "building.2", text: info.label })

  const hasContent = hasCover || !!description || chips.length > 0
  // 首帧/加载中/查无/信息全缺失 → 渲染空 Section（不能返回裸 null，否则 List 子节点报 e.isInternal）。
  if (!hasContent) {
    return <Section listRowInsets={0} listRowSeparator="hidden" />
  }

  const coverImage = hasCover ? (
    <Image
      imageUrl={cover!}
      resizable={true}
      scaleToFill={true}
      frame={{ width: 150, height: 150 }}
      clipShape={{ type: "rect", cornerRadius: 10 }}
      shadow={{ color: "rgba(0,0,0,0.35)", radius: 10, x: 0, y: 5 }}
      onError={() => setCoverFailed(true)}
      placeholder={<Image systemName="square.stack.fill" font={{ name: "system", size: 80 }} tint="white" frame={{ width: 150, height: 150 }} />}
    />
  ) : (
    <Image systemName="square.stack.fill" font={{ name: "system", size: 80 }} foregroundStyle="accentColor" frame={{ width: 150, height: 150 }} />
  )

  const foreground = (
    <VStack spacing={10} padding={{ vertical: 18, horizontal: 16 }}>
      {coverImage}
      <Text font="title2" fontWeight="bold" foregroundStyle={hasCover ? "white" : "label"} lineLimit={2} multilineTextAlignment="center">{info?.album ?? album}</Text>
      <Text font="subheadline" fontWeight="medium" foregroundStyle={hasCover ? "white" : "secondaryLabel"} lineLimit={1} multilineTextAlignment="center">{info?.artist ?? artist}</Text>
      {chips.length > 0 && (
        <HStack spacing={8}>
          {chips.map((c, i) => (
            <HStack key={i} spacing={4} padding={{ horizontal: 10, vertical: 5 }} background={hasCover ? "rgba(255,255,255,0.18)" : "secondarySystemBackground"} clipShape="capsule">
              <Image systemName={c.icon} font="caption2" foregroundStyle={hasCover ? "white" : "secondaryLabel"} />
              <Text font="caption" fontWeight="medium" foregroundStyle={hasCover ? "white" : "secondaryLabel"} lineLimit={1}>{c.text}</Text>
            </HStack>
          ))}
        </HStack>
      )}
    </VStack>
  )

  return (
    <Section listRowInsets={0} listRowSeparator="hidden">
      <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
        {hasCover ? (
          <ZStack frame={{ maxWidth: "infinity" }}>
            <Image
              imageUrl={cover!}
              resizable={true}
              scaleToFill={true}
              frame={{ maxWidth: "infinity", height: 300 }}
              clipped={true}
              onError={() => setCoverFailed(true)}
              blur={28}
            />
            <Rectangle
              frame={{ maxWidth: "infinity", height: 300 }}
              fill={BANNER_SCRIM}
            />
            {foreground}
          </ZStack>
        ) : (
          foreground
        )}

        {description && (
          <Button action={() => setExpanded(e => !e)} buttonStyle="plain">
            <VStack alignment="leading" spacing={6} padding={{ horizontal: 16, top: 14, bottom: 16 }} frame={{ maxWidth: "infinity" }} contentShape="rect">
              <Text font="body" foregroundStyle="secondaryLabel" lineLimit={expanded ? undefined : 3}>{description}</Text>
              <HStack spacing={3}>
                <Text font="caption" fontWeight="semibold" foregroundStyle="systemPink">{expanded ? "收起" : "展开"}</Text>
                <Image systemName={expanded ? "chevron.up" : "chevron.down"} font="caption2" foregroundStyle="systemPink" />
              </HStack>
            </VStack>
          </Button>
        )}
      </VStack>
    </Section>
  )
}