import {
  useState,
  useEffect,
  List,
  Section,
  FlowLayout,
  ScrollView,
  HStack,
  VStack,
  ZStack,
  Text,
  Image,
  Button,
  Spacer,
  Group,
  Label,
  ProgressView,
  ContentUnavailableView,
} from "scripting"
import { charts, CHART_GENRES, SEED_ARTISTS, NEW_SONGS_GENRE_ID, ChartTrack, ChartGenre, ITUNES_PREVIEW_PROVIDER } from "../../class/sources/charts"
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
  // 为你推荐（种子艺人热门曲，汇总）
  const [recommend, setRecommend] = useState<ChartTrack[] | null>(null)
  const [recoFromDownloads, setRecoFromDownloads] = useState(false)
  const playerState = usePlayerState()

  useEffect(() => {
    loadGenre(genre)
  }, [genre.id])

  // 首屏加载一次推荐：优先基于「已下载艺术家」，不足再补默认种子（失败静默）
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        // 1) 从已下载歌曲提取高频艺术家
        let seeds: { name: string; artistId?: number }[] = []
        try {
          const downloaded = await database.getDownloadedMusic()
          const counter = new Map<string, number>()
          for (const m of downloaded) {
            const name = (m.artist || "").trim()
            if (!name || name === "未知艺术家") continue
            counter.set(name, (counter.get(name) ?? 0) + 1)
          }
          seeds = [...counter.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([name]) => ({ name }))
          if (alive && seeds.length > 0) setRecoFromDownloads(true)
        } catch (e) {
          console.error("[发现] 读已下载艺术家失败:", e)
        }
        // 2) 不足时用默认种子补齐（去重）
        if (seeds.length < 3) {
          const have = new Set(seeds.map(s => s.name.toLowerCase()))
          for (const a of SEED_ARTISTS) {
            if (have.has(a.name.toLowerCase())) continue
            seeds.push(a)
            if (seeds.length >= 3) break
          }
        }
        const lists = await Promise.all(
          seeds.map(a => charts.fetchArtistTop(a, 6, "us").catch(() => []))
        )
        if (!alive) return
        // 交错混合各艺人的曲目，避免扎堆
        const merged: ChartTrack[] = []
        const maxLen = Math.max(0, ...lists.map(l => l.length))
        for (let i = 0; i < maxLen; i++) {
          for (const l of lists) if (l[i]) merged.push(l[i])
        }
        setRecommend(merged)
      } catch {
        if (alive) setRecommend([])
      }
    })()
    return () => { alive = false }
  }, [])

  async function loadGenre(g: ChartGenre) {
    setLoading(true)
    setError(null)
    setTracks(null)
    try {
      const data = g.id === NEW_SONGS_GENRE_ID
        ? await charts.fetchNewSongs(40, "us")
        : await charts.fetchChart(g.id, 40, "us")
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

  // 行点击：把整个栏目设为待播队列，从当前歌开始即时试听
  async function previewPlay(t: ChartTrack) {
    await playFromList(tracks ?? [], t)
  }

  // 推荐卡点击：以推荐列表为队列试听
  async function recommendPlay(t: ChartTrack) {
    await playFromList(recommend ?? [], t)
  }

  // 公用：以某列表为队列，从点击项开始连续试听
  async function playFromList(list: ChartTrack[], t: ChartTrack) {
    const queue = list.map(trackToPreviewMusic)
    const idx = list.findIndex(x => x.id === t.id)
    const start = idx >= 0 ? idx : 0
    player.setQueue(queue, start)
    await player.play(queue[start])
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
      {/* 为你推荐 — 顺顶部横向卡片墙 */}
      {recommend && recommend.length > 0 && (
        <Section
          header={
            <HStack spacing={6} padding={{ top: 2, bottom: 2 }}>
              <Image systemName="sparkles" font="subheadline" foregroundStyle="systemPink" />
              <Text font="title3" fontWeight="bold" foregroundStyle="label">为你推荐</Text>
              <Spacer />
              <Text font="caption" foregroundStyle="tertiaryLabel">{recoFromDownloads ? "基于你下载的艺术家" : "基于你的口味"}</Text>
            </HStack>
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={{ horizontal: 16, vertical: 6 }}>
              {recommend.map(t => (
                <RecommendCard
                  key={t.id}
                  track={t}
                  isPlaying={playerState.currentMusic?.id === t.id}
                  onTap={() => recommendPlay(t)}
                />
              ))}
            </HStack>
          </ScrollView>
        </Section>
      )}

      {/* 流派分类 chips — FlowLayout 自动换行 */}
      <FlowLayout spacing={10}>
        {CHART_GENRES.map(g => {
          const active = g.id === genre.id
          return (
            <Button key={g.key} action={() => selectGenre(g)} buttonStyle="plain">
              <HStack
                spacing={5}
                padding={{ horizontal: 16, vertical: 9 }}
                background={active ? "systemPink" : "secondarySystemBackground"}
                clipShape="capsule"
                shadow={active ? { color: "rgba(255,45,85,0.35)", radius: 8, x: 0, y: 3 } : undefined}
              >
                <Text font={{ name: "system", size: 15 }}>{g.emoji ?? ""}</Text>
                <Text
                  font="subheadline"
                  fontWeight={active ? "bold" : "medium"}
                  foregroundStyle={active ? "white" : "secondaryLabel"}
                >
                  {g.label}
                </Text>
              </HStack>
            </Button>
          )
        })}
      </FlowLayout>

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
            <HStack spacing={6} padding={{ top: 4, bottom: 2 }}>
              <Text font="title3" fontWeight="bold" foregroundStyle="label">
                {`${genre.emoji ?? ""} ${genre.label}`}
              </Text>
              <Text font="subheadline" fontWeight="semibold" foregroundStyle="secondaryLabel">
                {genre.id === NEW_SONGS_GENRE_ID ? "最新发行" : "热门榜"}
              </Text>
              <Spacer />
              <HStack spacing={3}>
                <Image systemName="globe" font="caption2" foregroundStyle="tertiaryLabel" />
                <Text font="caption" foregroundStyle="tertiaryLabel">美区 · 30s 试听</Text>
              </HStack>
            </HStack>
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
  // 金/银/铜 + 其余中性
  const rankColor =
    index === 1 ? "#D4AF37" :
    index === 2 ? "#9CA3AF" :
    index === 3 ? "#B87333" :
    "tertiaryLabel"
  const isTop3 = index <= 3
  return (
    <HStack
      spacing={12}
      padding={{ vertical: 4 }}
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
      {/* 排名 */}
      <Text
        font={isTop3 ? { name: "system", size: 19 } : "footnote"}
        fontWeight={isTop3 ? "heavy" : "semibold"}
        foregroundStyle={rankColor as any}
        frame={{ width: 26, alignment: "center" }}
      >
        {String(index)}
      </Text>

      {/* 封面 */}
      {track.cover && !coverError ? (
        <Image
          imageUrl={track.cover}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 56, height: 56 }}
          clipShape={{ type: "rect", cornerRadius: 10 }}
          shadow={{ color: "rgba(0,0,0,0.18)", radius: 4, x: 0, y: 2 }}
          onError={() => setCoverError(true)}
          placeholder={<Image systemName="music.note" frame={{ width: 56, height: 56 }} />}
        />
      ) : (
        <Image
          systemName="music.note"
          font="title2"
          tint="secondaryLabel"
          frame={{ width: 56, height: 56 }}
          background="secondarySystemBackground"
          clipShape={{ type: "rect", cornerRadius: 10 }}
        />
      )}

      {/* 标题 + 艺人 */}
      <VStack alignment="leading" spacing={3}>
        <Text font="body" fontWeight="semibold" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>
          {track.title}
        </Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {track.artist}
        </Text>
      </VStack>

      <Spacer />

      {/* 状态 */}
      {isResolving ? (
        <ProgressView controlSize="small" />
      ) : isPlaying ? (
        <Image systemName="waveform" font="body" foregroundStyle="systemPink" />
      ) : (
        <Image systemName="play.circle" font="title3" foregroundStyle="tertiaryLabel" />
      )}
    </HStack>
  )
}

// ---- 为你推荐卡片 ----
type RecCardProps = {
  track: ChartTrack
  isPlaying: boolean
  onTap: () => void
}

function RecommendCard({ track, isPlaying, onTap }: RecCardProps) {
  const [coverError, setCoverError] = useState(false)
  return (
    <Button action={onTap} buttonStyle="plain">
      <VStack alignment="leading" spacing={6} frame={{ width: 130 }}>
        <ZStack alignment="bottomTrailing">
          {track.cover && !coverError ? (
            <Image
              imageUrl={track.cover}
              resizable={true}
              scaleToFill={true}
              frame={{ width: 130, height: 130 }}
              clipShape={{ type: "rect", cornerRadius: 14 }}
              shadow={{ color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 }}
              onError={() => setCoverError(true)}
              placeholder={<Image systemName="music.note" frame={{ width: 130, height: 130 }} />}
            />
          ) : (
            <Image
              systemName="music.note"
              font="largeTitle"
              tint="secondaryLabel"
              frame={{ width: 130, height: 130 }}
              background="secondarySystemBackground"
              clipShape={{ type: "rect", cornerRadius: 14 }}
            />
          )}
          {/* 播放角标 */}
          <Image
            systemName={isPlaying ? "waveform.circle.fill" : "play.circle.fill"}
            font="title2"
            foregroundStyle={isPlaying ? "systemPink" : "white"}
            padding={6}
          />
        </ZStack>
        <Text font="subheadline" fontWeight="semibold" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>
          {track.title}
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {track.artist}
        </Text>
      </VStack>
    </Button>
  )
}
