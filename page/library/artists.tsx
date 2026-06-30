import { List, Section, Button, Label, HStack, VStack, ZStack, Rectangle, Text, Image, Spacer, useEffect, useMemo, useState, Menu, Toolbar, ToolbarItem, NavigationLink, ForEach, useObservable } from "scripting"
import { database, Music } from "../../class/database"
import { artistInfo, ArtistInfo } from "../../class/sources/artist_info"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { fileManager } from "../../class/file_manager"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { LoadingState } from "../components/loading_state"
import { SongRow } from "../components/song_row"
import { ArtistRow } from "./rows"

type SortType = "title" | "artist" | "added"

/**
 * 艺人详情页。
 * @param onClose 传入时（如播放页 sheet 场景，无系统返回键）在 toolbar 左侧显示「关闭」按钮。
 */
export function ArtistDetail({ artist, musics: initialMusics, onClose }: { artist: string, musics: Music[], onClose?: () => void }) {
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
      {!isEditing && <ArtistHeader artist={artist} />}
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
          <ArtistRow artist={item.artist} count={item.count} />
        </NavigationLink>
      ))}
    </List>
  )
}

/** 详情页 banner 渐变暗角（顶部轻、底部深，保白字/chips 可读）。与播放页 SCRIM 同式。 */
const BANNER_SCRIM = {
  colors: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.34)", "rgba(0,0,0,0.78)"],
  startPoint: "top",
  endPoint: "bottom",
} as any

/** 详情页顶部 header：艺人大图 + 信息 chips + 可展开简介。信息全缺失时不渲染。 */
function ArtistHeader({ artist }: { artist: string }) {
  const [info, setInfo] = useState<ArtistInfo | null>(null)
  const [bannerFailed, setBannerFailed] = useState(false)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let alive = true
    artistInfo.fetch(artist).then(i => { if (alive) setInfo(i) }).catch(() => { })
    return () => { alive = false }
  }, [artist])

  const hasContent = !!info && (!!(info.thumb && !thumbFailed) || !!info.biography || !!info.genre || !!info.country || !!info.formedYear)
  const hasThumb = !!info?.thumb && !thumbFailed
  const hasBanner = !!info?.fanart && !bannerFailed

  // 首帧/加载中/查无/信息全缺失 → 渲染空 Section（不能返回裸 null，否则 List 子节点报错）。
  if (!info || !hasContent) {
    return <Section listRowInsets={0} listRowSeparator="hidden" />
  }

  // 结构化 chips：地区 / 成立年(或出生年) / 流派
  const chips: { icon: string, text: string }[] = []
  if (info.country) chips.push({ icon: "mappin.and.ellipse", text: info.country })
  if (info.formedYear) chips.push({ icon: "calendar", text: `成立 ${info.formedYear}` })
  else if (info.bornYear) chips.push({ icon: "calendar", text: info.bornYear })
  if (info.genre) chips.push({ icon: "guitars", text: info.genre })

  const avatar = hasThumb ? (
    <Image
      imageUrl={info.thumb!}
      resizable={true}
      scaleToFill={true}
      frame={{ width: 96, height: 96 }}
      clipShape="capsule"
      shadow={{ color: "rgba(0,0,0,0.3)", radius: 8, x: 0, y: 4 }}
      onError={() => setThumbFailed(true)}
      placeholder={<Image systemName="person.circle.fill" font={{ name: "system", size: 96 }} tint="white" frame={{ width: 96, height: 96 }} />}
    />
  ) : (
    <Image systemName="person.circle.fill" font={{ name: "system", size: 88 }} foregroundStyle={hasBanner ? "white" : "accentColor"} frame={{ width: 96, height: 96 }} />
  )

  const foreground = (
    <VStack spacing={10} padding={{ vertical: 18, horizontal: 16 }}>
      {avatar}
      <Text font="title2" fontWeight="bold" foregroundStyle={hasBanner ? "white" : "label"} lineLimit={2} multilineTextAlignment="center">{info.name}</Text>
      {chips.length > 0 && (
        <HStack spacing={8}>
          {chips.map((c, i) => (
            <HStack key={i} spacing={4} padding={{ horizontal: 10, vertical: 5 }} background={hasBanner ? "rgba(255,255,255,0.18)" : "secondarySystemBackground"} clipShape="capsule">
              <Image systemName={c.icon} font="caption2" foregroundStyle={hasBanner ? "white" : "secondaryLabel"} />
              <Text font="caption" fontWeight="medium" foregroundStyle={hasBanner ? "white" : "secondaryLabel"} lineLimit={1}>{c.text}</Text>
            </HStack>
          ))}
        </HStack>
      )}
    </VStack>
  )

  return (
    <Section listRowInsets={0} listRowSeparator="hidden">
      <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
        {hasBanner ? (
          <ZStack frame={{ maxWidth: "infinity" }}>
            <Image
              imageUrl={info.fanart!}
              resizable={true}
              scaleToFill={true}
              frame={{ maxWidth: "infinity", height: 240 }}
              clipped={true}
              onError={() => setBannerFailed(true)}
              blur={2}
            />
            <Rectangle
              frame={{ maxWidth: "infinity", height: 240 }}
              fill={BANNER_SCRIM}
            />
            {foreground}
          </ZStack>
        ) : (
          foreground
        )}

        {!!info.biography && (
          <Button action={() => setExpanded(e => !e)} buttonStyle="plain">
            <VStack alignment="leading" spacing={6} padding={{ horizontal: 16, top: 14, bottom: 16 }} contentShape="rect">
              <Text font="body" foregroundStyle="secondaryLabel" lineLimit={expanded ? undefined : 3}>{info.biography}</Text>
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