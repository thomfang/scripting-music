import {
  useState,
  useEffect,
  List,
  Section,
  HStack,
  VStack,
  Text,
  Image,
  Button,
  Spacer,
  Group,
  Label,
  ProgressView,
  ContentUnavailableView,
} from "scripting"
import { charts, CHART_GENRES, ChartTrack, ChartGenre, ITUNES_PREVIEW_PROVIDER } from "../../class/sources/charts"
import { music } from "../../class/music"
import { player } from "../../class/player"
import { database, Music } from "../../class/database"
import { downloadManager } from "../../class/download_manager"
import { usePlayerState } from "../../class/player_state"
import { PlaylistPickerContent } from "../components/playlist_picker"

const SELECTED_GENRE_KEY = "discover_selected_genre"

function trackToPreviewMusic(t: ChartTrack): Music {
  return {
    id: t.id,
    title: t.title,
    artist: t.artist || "未知艺术家",
    album: t.album || "未知专辑",
    duration: t.duration || 30,
    cover_url: t.cover || "",
    audio_url: t.previewUrl, // 30s 官方 preview 直链，命中 player 直接播分支
    provider: ITUNES_PREVIEW_PROVIDER,
    source_id: t.trackId,
    is_downloaded: false,
    added_at: Date.now(),
    play_count: 0,
    is_favorite: false,
  }
}

export function DiscoverView() {
  const initialGenre = (() => {
    const saved = Storage.get<string>(SELECTED_GENRE_KEY)
    const found = CHART_GENRES.find(g => g.key === saved)
    return found ?? CHART_GENRES[0]
  })()

  const [genre, setGenre] = useState<ChartGenre>(initialGenre)
  const [tracks, setTracks] = useState<ChartTrack[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resolvingId, setResolvingId] = useState<string | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [pendingTrack, setPendingTrack] = useState<ChartTrack | null>(null)
  const playerState = usePlayerState()

  useEffect(() => {
    loadGenre(genre)
  }, [genre.id])

  async function loadGenre(g: ChartGenre) {
    setLoading(true)
    setError(null)
    setTracks(null)
    try {
      const data = await charts.fetchChart(g.id, 40, "us")
      setTracks(data)
    } catch (e) {
      console.error("[发现] 加载榜单失败:", e)
      setError("榜单加载失败，请检查网络后重试")
      setTracks([])
    } finally {
      setLoading(false)
    }
  }

  function selectGenre(g: ChartGenre) {
    if (g.id === genre.id) return
    Storage.set(SELECTED_GENRE_KEY, g.key)
    setGenre(g)
  }

  // 行点击：即时试听（preview 直链）
  async function previewPlay(t: ChartTrack) {
    await player.playNext(trackToPreviewMusic(t))
  }

  // 用 "歌名 艺人" 搜 mp3juice，取首条真实可下载源
  async function resolveReal(t: ChartTrack): Promise<Music | null> {
    const { items } = await music.search(`${t.title} ${t.artist}`)
    const top = items?.[0]
    if (!top) return null
    return {
      id: top.id,
      title: top.title || t.title,
      artist: top.artist || t.artist || "未知艺术家",
      album: top.album || t.album || "未知专辑",
      duration: top.duration || 0,
      cover_url: top.cover || t.cover || "",
      audio_url: "",
      provider: top.provider,
      source_id: (top as any).source_id,
      is_downloaded: false,
      added_at: Date.now(),
      play_count: 0,
      is_favorite: false,
    }
  }

  // 完整播放：走 mp3juice 实时解析
  async function fullPlay(t: ChartTrack) {
    setResolvingId(t.id)
    try {
      const real = await resolveReal(t)
      if (!real) { setError("未找到完整音源"); return }
      await player.playNext(real)
    } catch (e) {
      console.error("[发现] 完整播放失败:", e)
      setError("完整播放失败")
    } finally {
      setResolvingId(null)
    }
  }

  // 下载：走 mp3juice
  async function downloadTrack(t: ChartTrack) {
    setResolvingId(t.id)
    try {
      const real = await resolveReal(t)
      if (!real) { setError("未找到可下载音源"); return }
      const existing = await database.getMusic(real.id)
      if (!existing) {
        await database.addMusic({
          id: real.id, title: real.title, artist: real.artist, album: real.album,
          duration: real.duration, cover_url: real.cover_url ?? "", audio_url: "",
          provider: real.provider, source_id: real.source_id,
          is_downloaded: false, added_at: Date.now(),
        })
      }
      await downloadManager.downloadMusic({
        id: real.id, provider: real.provider!, title: real.title,
        artist: real.artist, album: real.album, duration: real.duration,
        cover: real.cover_url ?? "", source_id: real.source_id,
      })
    } catch (e) {
      console.error("[发现] 下载失败:", e)
      setError("下载失败")
    } finally {
      setResolvingId(null)
    }
  }

  // 加歌单：用 mp3juice 真实源入库
  function openPlaylistPicker(t: ChartTrack) {
    setPendingTrack(t)
    setShowPlaylistPicker(true)
  }

  async function addToPlaylist(playlistId: string) {
    if (!pendingTrack) return
    setResolvingId(pendingTrack.id)
    try {
      const real = await resolveReal(pendingTrack)
      const m = real ?? trackToPreviewMusic(pendingTrack)
      const existing = await database.getMusic(m.id)
      if (!existing) {
        await database.addMusic({
          id: m.id, title: m.title, artist: m.artist, album: m.album,
          duration: m.duration, cover_url: m.cover_url ?? "", audio_url: "",
          provider: m.provider, source_id: m.source_id,
          is_downloaded: false, added_at: Date.now(),
        })
      }
      await database.addMusicToPlaylist(playlistId, m.id)
    } catch (e) {
      console.error("[发现] 加入歌单失败:", e)
    } finally {
      setResolvingId(null)
      setShowPlaylistPicker(false)
      setPendingTrack(null)
    }
  }

  const dismissPlaylistPicker = () => { setShowPlaylistPicker(false); setPendingTrack(null) }

  return (
    <List
      sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) dismissPlaylistPicker() },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={dismissPlaylistPicker} />,
      }}
    >
      {/* 流派分类 chips */}
      <HStack spacing={8} listRowSeparator="hidden">
        {CHART_GENRES.map(g => {
          const active = g.id === genre.id
          return (
            <Button key={g.key} action={() => selectGenre(g)} buttonStyle="plain">
              <Text
                font="footnote"
                fontWeight={active ? "semibold" : "regular"}
                foregroundStyle={active ? "white" : "label"}
                padding={{ horizontal: 10, vertical: 6 }}
                background={active ? "systemPink" : "secondarySystemBackground"}
                clipShape="capsule"
              >
                {`${g.emoji ?? ""} ${g.label}`}
              </Text>
            </Button>
          )
        })}
      </HStack>

      {loading ? (
        <HStack listRowSeparator="hidden">
          <Spacer />
          <ProgressView />
          <Spacer />
        </HStack>
      ) : error && (!tracks || tracks.length === 0) ? (
        <ContentUnavailableView
          title="加载失败"
          systemImage="wifi.exclamationmark"
          description={error}
        />
      ) : tracks && tracks.length === 0 ? (
        <ContentUnavailableView title="暂无榜单" systemImage="music.note.list" />
      ) : (
        <Section
          header={
            <Text>{`${genre.emoji ?? ""} ${genre.label}热门 · 美区 · 试听 30s`}</Text>
          }
        >
          {(tracks ?? []).map((t, idx) => (
            <DiscoverRow
              key={t.id}
              track={t}
              index={idx + 1}
              isPlaying={playerState.currentMusic?.id === t.id}
              isResolving={resolvingId === t.id}
              onPreview={() => previewPlay(t)}
              onFullPlay={() => fullPlay(t)}
              onDownload={() => downloadTrack(t)}
              onAddToPlaylist={() => openPlaylistPicker(t)}
            />
          ))}
        </Section>
      )}
    </List>
  )
}

type RowProps = {
  track: ChartTrack
  index: number
  isPlaying: boolean
  isResolving: boolean
  onPreview: () => void
  onFullPlay: () => void
  onDownload: () => void
  onAddToPlaylist: () => void
}

function DiscoverRow({
  track, index, isPlaying, isResolving,
  onPreview, onFullPlay, onDownload, onAddToPlaylist,
}: RowProps) {
  const [coverError, setCoverError] = useState(false)
  return (
    <HStack
      spacing={12}
      onTapGesture={onPreview}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="试听 30 秒" systemImage="play.circle" action={onPreview} />
            <Button title="完整播放" systemImage="play.fill" action={onFullPlay} />
            <Button title="下载" systemImage="arrow.down.circle" action={onDownload} />
            <Button title="添加到播放列表" systemImage="music.note.list" action={onAddToPlaylist} />
          </Group>
        ),
      }}
      trailingSwipeActions={{
        actions: [
          <Button tint="systemBlue" action={onDownload}>
            <Label title="下载" systemImage="arrow.down.circle.fill" />
          </Button>,
          <Button tint="systemIndigo" action={onFullPlay}>
            <Label title="完整" systemImage="play.fill" />
          </Button>,
        ],
      }}
    >
      <Text
        font="footnote"
        foregroundStyle="secondaryLabel"
        frame={{ width: 22, alignment: "center" }}
      >
        {String(index)}
      </Text>

      {track.cover && !coverError ? (
        <Image
          imageUrl={track.cover}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 52, height: 52 }}
          clipShape={{ type: "rect", cornerRadius: 8 }}
          onError={() => setCoverError(true)}
          placeholder={<Image systemName="music.note" frame={{ width: 52, height: 52 }} />}
        />
      ) : (
        <Image
          systemName="music.note"
          font="title2"
          tint="secondaryLabel"
          frame={{ width: 52, height: 52 }}
        />
      )}

      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1} foregroundStyle={isPlaying ? "accentColor" : undefined}>
          {track.title}
        </Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {track.artist}
        </Text>
      </VStack>

      <Spacer />

      {isPlaying && <Image systemName="waveform" tint="accentColor" />}
      {isResolving && <ProgressView controlSize="small" />}
    </HStack>
  )
}
