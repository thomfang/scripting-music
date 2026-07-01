import {
  useState,
  useEffect,
  useRef,
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
import { charts, CHART_GENRES, SEED_ARTISTS, NEW_SONGS_GENRE_ID, NEW_SONG_GENRES, ChartTrack, ChartGenre, ITUNES_PREVIEW_PROVIDER, hashStr, mulberry32, shuffleWith } from "../../class/sources/charts"
import { player } from "../../class/player"
import { database, Music } from "../../class/database"
import { downloadCenter } from "../../class/download_center"
import { usePlayerState } from "../../class/player_state"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { resolveRealMusic } from "../../class/sources/resolve_real"

const SELECTED_GENRE_KEY = "discover_selected_genre"
// 推荐轮换缓存：当日结果 + 最近已推指纹
const RECO_DAILY_KEY = "discover_reco_daily"
const RECO_RECENT_KEY = "discover_reco_recent"
const RECO_NONCE_KEY = "discover_reco_nonce"  // 手动刷新自增，叠加进 seed 旋转出新结果
const RECO_RECENT_DAYS = 3       // 保留最近几天的「已推」指纹
const RECO_TARGET = 24           // 推荐最终条数
const RECO_PER_ARTIST_MAX = 3   // 每个艺人/源最多几首，避免扎堆

/** 本地时区的 YYYY-MM-DD（作为按天 seed 与缓存 day key）。 */
function todayKey(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${m}-${day}`
}

/** 精简 ChartTrack 以便存 Storage（字段全保留，仅用于可序列化快照）。 */
type RecoDaily = { day: string; tracks: ChartTrack[] }
type RecoRecent = { day: string; keys: string[] }

// 曲目归一化指纹（用于推荐去重 / 排除已下载）
function trackKey(title?: string, artist?: string): string {
  return `${(title || "").trim().toLowerCase()}|${(artist || "").trim().toLowerCase()}`
}

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
  const [recoLoading, setRecoLoading] = useState(false)
  const recoMountedRef = useRef(true)
  const recoInflightRef = useRef(false)
  const playerState = usePlayerState()

  useEffect(() => {
    loadGenre(genre)
  }, [genre.id])

  // 首屏推荐（按天轮换）：
  //   ① 加权口味(下载×3+收藏×2+最近×1)取候选艺人 + 扩展默认池 + 1个随机流派源；
  //   ② 各源拉大候选池，按「当天 seed」洗牌随机收敛；
  //   ③ 排除已下载 + 最近 N 天已推过的曲目；
  //   ④ 当日结果缓存：同一天复用、跨天重算（失败静默）。
  //   手动刷新（force=true）：跳过当日缓存，叠加自增 nonce 旋转 seed，强制换一批。
  useEffect(() => {
    recoMountedRef.current = true
    loadRecommend(false)
    return () => { recoMountedRef.current = false }
  }, [])

  async function loadRecommend(force: boolean) {
    if (recoInflightRef.current) return
    recoInflightRef.current = true
    if (force) setRecoLoading(true)
    const alive = () => recoMountedRef.current
    const day = todayKey()
    try {
      // 0) 非强制且命中当日缓存 → 直接复用，不重算、不闪烁
      if (!force) {
        const cached = Storage.get<RecoDaily>(RECO_DAILY_KEY)
        if (cached && cached.day === day && Array.isArray(cached.tracks) && cached.tracks.length > 0) {
          if (alive()) { setRecommend(cached.tracks); setRecoFromDownloads(true) }
          return
        }
      }

      // 1) 加权统计艺人偏好 + 已下载指纹
      let weighted: { name: string; artistId?: number }[] = []
      const ownedKeys = new Set<string>()
      try {
        const [downloaded, favorites, recent] = await Promise.all([
          database.getDownloadedMusic().catch(() => [] as Music[]),
          database.getFavoriteMusic().catch(() => [] as Music[]),
          database.getRecentlyPlayed(30).catch(() => [] as Music[]),
        ])
        const weights: { list: Music[]; w: number }[] = [
          { list: downloaded, w: 3 },
          { list: favorites, w: 2 },
          { list: recent, w: 1 },
        ]
        const counter = new Map<string, number>()
        for (const { list, w } of weights) {
          for (const m of list) {
            const name = (m.artist || "").trim()
            if (name && name !== "未知艺术家") counter.set(name, (counter.get(name) ?? 0) + w)
          }
        }
        for (const m of downloaded) ownedKeys.add(trackKey(m.title, m.artist))
        weighted = [...counter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => ({ name }))
      } catch (e) {
        console.error("[发现] 读偏好数据失败:", e)
      }

      // 2) 按天 seed（叠加库指纹 + nonce）构造 PRNG。
      //    手动刷新自增 nonce → 同一天也能旋转出新结果。
      let nonce = Storage.get<number>(RECO_NONCE_KEY) ?? 0
      if (force) { nonce = nonce + 1; Storage.set<number>(RECO_NONCE_KEY, nonce) }
      const libSig = weighted.map(s => s.name).join(",")
      const seed = hashStr(`${day}|${libSig}|${nonce}`)
      const rand = mulberry32(seed)

      // 3) 选种子艺人：加权候选洗牌取前若干 + 默认池洗牌补齐到 ~4 个
      const picked: { name: string; artistId?: number }[] = []
      const have = new Set<string>()
      const pushSeed = (a: { name: string; artistId?: number }) => {
        const k = a.name.toLowerCase()
        if (have.has(k)) return
        have.add(k); picked.push(a)
      }
      for (const a of shuffleWith(weighted, rand).slice(0, 3)) pushSeed(a)
      if (picked.length > 0) { if (alive()) setRecoFromDownloads(true) }
      for (const a of shuffleWith(SEED_ARTISTS, rand)) {
        if (picked.length >= 4) break
        pushSeed(a)
      }

      // 4) 随机挑 1 个流派榜单作为「新鲜源」掺入
      const genrePick = NEW_SONG_GENRES[Math.floor(rand() * NEW_SONG_GENRES.length)]

      // 5) 并发拉各源候选池
      const [artistLists, genreList] = await Promise.all([
        Promise.all(picked.map(a => charts.fetchArtistTop(a, 25, "us").catch(() => [] as ChartTrack[]))),
        charts.fetchChart(genrePick, 40, "us").catch(() => [] as ChartTrack[]),
      ])
      if (!alive()) return

      // 6) 读最近已推指纹（滚动 N 天）
      const recentReco = (Storage.get<RecoRecent[]>(RECO_RECENT_KEY) ?? []).filter(r => r && Array.isArray(r.keys))
      const recentKeys = new Set<string>()
      for (const r of recentReco) for (const k of r.keys) recentKeys.add(k)

      // 7) 每源洗牌 + 限流（每源≤RECO_PER_ARTIST_MAX 首），合并；排除已下载/已推/重复
      const allSources: ChartTrack[][] = [...artistLists, genreList]
      const buildMerged = (excludeRecent: boolean): ChartTrack[] => {
        const out: ChartTrack[] = []
        const seen = new Set<string>()
        for (const list of allSources) {
          const shuffled = shuffleWith(list, rand)
          let taken = 0
          for (const t of shuffled) {
            if (taken >= RECO_PER_ARTIST_MAX) break
            const k = trackKey(t.title, t.artist)
            if (ownedKeys.has(k) || seen.has(k)) continue
            if (excludeRecent && recentKeys.has(k)) continue
            seen.add(k); out.push(t); taken++
          }
        }
        return shuffleWith(out, rand).slice(0, RECO_TARGET)
      }
      // 优先排除最近已推；若排空到太少（候选枯竭），放宽不排除
      let merged = buildMerged(true)
      if (merged.length < 6) merged = buildMerged(false)

      if (!alive()) return
      setRecommend(merged)

      // 8) 写当日结果缓存 + 滚动更新「最近已推」指纹
      try {
        Storage.set<RecoDaily>(RECO_DAILY_KEY, { day, tracks: merged })
        const todayKeys = merged.map(t => trackKey(t.title, t.artist))
        const nextRecent = [
          { day, keys: todayKeys },
          ...recentReco.filter(r => r.day !== day),
        ].slice(0, RECO_RECENT_DAYS)
        Storage.set<RecoRecent[]>(RECO_RECENT_KEY, nextRecent)
      } catch (e) {
        console.error("[发现] 写推荐缓存失败:", e)
      }
    } catch {
      if (alive() && !force) setRecommend([])
    } finally {
      recoInflightRef.current = false
      if (recoMountedRef.current) setRecoLoading(false)
    }
  }

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

  // 用 "歌名 艺人" 搜 mp3juice，取首条真实可下载源（共用 resolveRealMusic）
  async function resolveReal(t: ChartTrack): Promise<Music | null> {
    return resolveRealMusic({
      title: t.title, artist: t.artist, album: t.album,
      duration: t.duration, cover: t.cover,
    })
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
      // 不预先入库：下载成功后由 downloader 写入（is_downloaded:true）。
      // 否则取消/失败会在「最近添加」留下未下载完的残留。
      await downloadCenter.enqueue({
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
              <Button action={() => { if (!recoLoading) loadRecommend(true) }} buttonStyle="plain">
                {recoLoading
                  ? <ProgressView />
                  : <Image systemName="arrow.clockwise" font="subheadline" fontWeight="semibold" foregroundStyle="systemPink" />}
              </Button>
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
                  isResolving={resolvingId === t.id}
                  onTap={() => recommendPlay(t)}
                  onFullPlay={() => fullPlay(t)}
                  onDownload={() => downloadTrack(t)}
                  onAddToPlaylist={() => openPlaylistPicker(t)}
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
  isResolving: boolean
  onTap: () => void
  onFullPlay: () => void
  onDownload: () => void
  onAddToPlaylist: () => void
}

function RecommendCard({ track, isPlaying, isResolving, onTap, onFullPlay, onDownload, onAddToPlaylist }: RecCardProps) {
  const [coverError, setCoverError] = useState(false)
  return (
    <Button
      action={onTap}
      buttonStyle="plain"
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="试听 30 秒" systemImage="play.circle" action={onTap} />
            <Button title="完整播放" systemImage="play.fill" action={onFullPlay} />
            <Button title="下载" systemImage="arrow.down.circle" action={onDownload} />
            <Button title="添加到播放列表" systemImage="music.note.list" action={onAddToPlaylist} />
          </Group>
        ),
      }}
    >
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
          {/* 播放/解析中角标 */}
          {isResolving ? (
            <ProgressView padding={6} />
          ) : (
            <Image
              systemName={isPlaying ? "waveform.circle.fill" : "play.circle.fill"}
              font="title2"
              foregroundStyle={isPlaying ? "systemPink" : "white"}
              padding={6}
            />
          )}
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
