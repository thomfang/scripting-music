import {
  List, Section, Button, Label, Group, HStack, VStack, ZStack, Rectangle, Spacer, Text, Image,
  NavigationLink, ProgressView, useEffect, useRef, useState,
} from "scripting"
import { Music, database } from "../../class/database"
import { player } from "../../class/player"
import { downloadCenter } from "../../class/download_center"
import { usePlayerState } from "../../class/player_state"
import { itunesBrowse, ItunesAlbum, ItunesTrack } from "../../class/sources/itunes_browse"
import { resolveRealMusic } from "../../class/sources/resolve_real"
import { PlaylistPickerContent } from "../components/playlist_picker"

/**
 * 在线（iTunes）艺人 / 专辑浏览详情页。
 *
 * - 数据：class/sources/itunes_browse（iTunes Search/Lookup）。
 * - 播放/下载/加歌单：iTunes 曲目只是元数据，trackId 不是 mp3juice/YouTube
 *   的 videoId。必须先 resolveRealMusic（“标题 艺人”搜 mp3juice 取真实源），
 *   再交给 player/downloader。与发现页同一套契约。
 * - 这些页面在搜索 Tab 的 NavigationStack 内，用声明式 NavigationLink push。
 */

const BANNER_SCRIM = {
  colors: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.34)", "rgba(0,0,0,0.78)"],
  startPoint: "top",
  endPoint: "bottom",
} as any

function CenterState({ icon, text }: { icon: string, text: string }) {
  return (
    <Section>
      <VStack spacing={12} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
        <Image systemName={icon} font="largeTitle" foregroundStyle="tertiaryLabel" />
        <Text font="headline" foregroundStyle="secondaryLabel">{text}</Text>
      </VStack>
    </Section>
  )
}

// ---------------- 在线专辑详情 ----------------

/** 归一化标题/艺人用于“正在播放”匹配。 */
function normTitle(s: string | undefined): string {
  return (s || "").trim().toLowerCase()
}

/**
 * 判断当前播放曲目是否为该 iTunes 曲目。
 * 真实源 id 与 iTunes trackId 不同，无法比 id；且真实源 title 是 mp3juice
 * 原始标题（可能含 “艺人 - ” 前缀 / “(Official)” 噪声），iTunes title 是干净标题。
 * 故用包含式 title 匹配 + 富化后 artist 校验（artist 富化后即 iTunes artistName，可靠）。
 */
function isSameTrack(cur: { title?: string, artist?: string } | null | undefined, track: ItunesTrack): boolean {
  if (!cur) return false
  const ct = normTitle(cur.title), tt = normTitle(track.title)
  if (!ct || !tt) return false
  const titleMatch = ct === tt || ct.includes(tt) || tt.includes(ct)
  if (!titleMatch) return false
  const ca = normTitle(cur.artist), ta = normTitle(track.artist)
  // artist 任一缺失则只认 title；否则要求包含式相等，避免同名不同艺人误配。
  return !ca || !ta || ca === ta || ca.includes(ta) || ta.includes(ca)
}

// 队列构建令牌：playAll 后台逐首入队期间，任何新的 playAll / 单曲播放都会
// bump 它，使过期的后台 loop 停止向已被替换的队列继续 addToQueue（防队列污染）。
let queueBuildToken = 0

export function OnlineAlbumDetail({ album, artist, collectionId, cover }: {
  album: string, artist: string, collectionId: number, cover?: string
}) {
  const state = usePlayerState()
  const [data, setData] = useState<{ album: ItunesAlbum | null, tracks: ItunesTrack[] } | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [pendingTrack, setPendingTrack] = useState<ItunesTrack | null>(null)
  const [busyAll, setBusyAll] = useState(false)

  useEffect(() => {
    let alive = true
    itunesBrowse.albumTracks(collectionId)
      .then(d => { if (alive) setData(d) })
      .catch(() => { if (alive) setData({ album: null, tracks: [] }) })
    return () => { alive = false }
  }, [collectionId])

  const info = data?.album
  const effectiveCover = info?.cover ?? cover
  const tracks = data?.tracks ?? []

  // 播放全部/随机：先解析首曲即播，其余后台解析逐步入队（避免一次性阻塞）。
  async function playAll(shuffle: boolean) {
    if (busyAll || tracks.length === 0) return
    setBusyAll(true)
    // 本次队列构建的身份；后台 loop 每次 addToQueue 前校验，过期则停止。
    const myToken = ++queueBuildToken
    try {
      const order = shuffle ? [...tracks].sort(() => Math.random() - 0.5) : tracks
      const first = await resolveRealMusic({
        title: order[0].title, artist: order[0].artist, album: order[0].album,
        duration: order[0].duration, cover: order[0].cover ?? effectiveCover,
      })
      if (myToken !== queueBuildToken) return // 解析首曲期间已被新操作接管
      if (!first) return
      player.setQueue([first], 0)
      await player.play(first)
      // 后台解析其余曲目，逐首入队（校验 token，防队列污染）
      ;(async () => {
        for (let i = 1; i < order.length; i++) {
          if (myToken !== queueBuildToken) return
          const m = await resolveRealMusic({
            title: order[i].title, artist: order[i].artist, album: order[i].album,
            duration: order[i].duration, cover: order[i].cover ?? effectiveCover,
          })
          if (myToken !== queueBuildToken) return
          if (m) player.addToQueue(m)
        }
      })()
    } finally {
      setBusyAll(false)
    }
  }

  const chips: { icon: string, text: string }[] = []
  if (info?.year) chips.push({ icon: "calendar", text: info.year })
  if (info?.genre) chips.push({ icon: "guitars", text: info.genre })
  if (info?.trackCount) chips.push({ icon: "music.note.list", text: `${info.trackCount} 首` })

  return (
    <List navigationTitle={album} navigationSubtitle={artist} sheet={{
      isPresented: showPlaylistPicker,
      onChanged: (v: boolean) => { if (!v) { setShowPlaylistPicker(false); setPendingTrack(null) } },
      content: (
        <PlaylistPickerContent
          onDismiss={() => { setShowPlaylistPicker(false); setPendingTrack(null) }}
          onSelect={async (playlistId) => {
            const t = pendingTrack
            setShowPlaylistPicker(false)
            setPendingTrack(null)
            if (!t) return
            const real = await resolveRealMusic({
              title: t.title, artist: t.artist, album: t.album,
              duration: t.duration, cover: t.cover ?? effectiveCover,
            })
            if (!real) return
            const existing = await database.getMusic(real.id)
            if (!existing) {
              await database.addMusic({
                id: real.id, title: real.title, artist: real.artist, album: real.album,
                duration: real.duration, cover_url: real.cover_url ?? "", audio_url: "",
                provider: real.provider, source_id: real.source_id,
                is_downloaded: false, added_at: Date.now(),
              })
            }
            await database.addMusicToPlaylist(playlistId, real.id)
          }}
        />
      ),
    }}>
      {/* header */}
      <Section listRowInsets={0} listRowSeparator="hidden">
        <ZStack frame={{ maxWidth: "infinity" }}>
          {effectiveCover ? (
            <>
              <Image imageUrl={effectiveCover} resizable={true} scaleToFill={true} frame={{ maxWidth: "infinity", height: 300 }} clipped={true} blur={28} />
              <Rectangle frame={{ maxWidth: "infinity", height: 300 }} fill={BANNER_SCRIM} />
            </>
          ) : null}
          <VStack spacing={10} padding={{ vertical: 18, horizontal: 16 }}>
            {effectiveCover ? (
              <Image imageUrl={effectiveCover} resizable={true} scaleToFill={true} frame={{ width: 150, height: 150 }} clipShape={{ type: "rect", cornerRadius: 10 }} shadow={{ color: "rgba(0,0,0,0.35)", radius: 10, y: 5 }} />
            ) : (
              <Image systemName="square.stack.fill" font={{ name: "system", size: 80 }} foregroundStyle="accentColor" frame={{ width: 150, height: 150 }} />
            )}
            <Text font="title2" fontWeight="bold" foregroundStyle={effectiveCover ? "white" : "label"} lineLimit={2} multilineTextAlignment="center">{info?.album ?? album}</Text>
            <Text font="subheadline" fontWeight="medium" foregroundStyle={effectiveCover ? "white" : "secondaryLabel"} lineLimit={1} multilineTextAlignment="center">{info?.artist ?? artist}</Text>
            {chips.length > 0 && (
              <HStack spacing={8}>
                {chips.map((c, i) => (
                  <HStack key={i} spacing={4} padding={{ horizontal: 10, vertical: 5 }} background={effectiveCover ? "rgba(255,255,255,0.18)" : "secondarySystemBackground"} clipShape="capsule">
                    <Image systemName={c.icon} font="caption2" foregroundStyle={effectiveCover ? "white" : "secondaryLabel"} />
                    <Text font="caption" fontWeight="medium" foregroundStyle={effectiveCover ? "white" : "secondaryLabel"} lineLimit={1}>{c.text}</Text>
                  </HStack>
                ))}
              </HStack>
            )}
          </VStack>
        </ZStack>
      </Section>

      {data === null ? (
        <CenterState icon="square.stack" text="加载曲目中..." />
      ) : tracks.length === 0 ? (
        <CenterState icon="square.stack.3d.up.slash" text="该专辑暂无曲目" />
      ) : (
        <>
          <Section>
            <Button action={() => playAll(false)} disabled={busyAll}>
              <Label title={busyAll ? "解析中..." : "播放全部"} systemImage="play.fill" tint="systemPink" />
            </Button>
            <Button action={() => playAll(true)} disabled={busyAll}>
              <Label title="随机播放" systemImage="shuffle" tint="systemPink" />
            </Button>
          </Section>
          <Section header={<Text>{`${tracks.length} 首曲目`}</Text>}>
            {tracks.map(t => (
              <OnlineTrackRow
                key={String(t.trackId)}
                track={t}
                fallbackCover={effectiveCover}
                isPlaying={isSameTrack(state.currentMusic, t)}
                onAddToPlaylist={() => { setPendingTrack(t); setShowPlaylistPicker(true) }}
              />
            ))}
          </Section>
        </>
      )}
    </List>
  )
}

// ---------------- 在线曲目行 ----------------

/**
 * 在线专辑曲目行：点击/下载/加歌单前先 resolveRealMusic 解析真实 mp3juice 源。
 * 解析中显 spinner。
 */
function OnlineTrackRow({ track, fallbackCover, isPlaying, onAddToPlaylist }: {
  track: ItunesTrack, fallbackCover?: string, isPlaying: boolean, onAddToPlaylist: () => void
}) {
  const [resolving, setResolving] = useState(false)
  const [downloaded, setDownloaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [coverError, setCoverError] = useState(false)
  const mounted = useRef(true)
  const failTimer = useRef<number | null>(null)
  useEffect(() => () => {
    mounted.current = false
    if (failTimer.current != null) clearTimeout(failTimer.current)
  }, [])
  const cover = track.cover ?? fallbackCover

  const meta = {
    title: track.title, artist: track.artist, album: track.album,
    duration: track.duration, cover,
  }

  function flagFailed() {
    if (!mounted.current) return
    setFailed(true)
    if (failTimer.current != null) clearTimeout(failTimer.current)
    failTimer.current = setTimeout(() => { if (mounted.current) setFailed(false) }, 2500) as unknown as number
  }

  async function withResolve<T>(fn: (m: Music) => Promise<T>) {
    if (resolving) return
    setResolving(true)
    setFailed(false)
    try {
      const real = await resolveRealMusic(meta)
      if (!real) { flagFailed(); return }
      await fn(real)
    } catch (e) {
      console.error("[在线曲目] 操作失败:", e)
      flagFailed()
    } finally {
      if (mounted.current) setResolving(false)
    }
  }

  // 单曲播放：插队播放；bump 队列令牌，阻止旧 playAll 后台 loop 继续污染队列。
  const play = () => withResolve(async (real) => { queueBuildToken++; await player.playNext(real) })

  const download = () => withResolve(async (real) => {
    const existing = await database.getMusic(real.id)
    if (!existing) {
      await database.addMusic({
        id: real.id, title: real.title, artist: real.artist, album: real.album,
        duration: real.duration, cover_url: real.cover_url ?? "", audio_url: "",
        provider: real.provider, source_id: real.source_id,
        is_downloaded: false, added_at: Date.now(),
      })
    }
    await downloadCenter.enqueue({
      id: real.id, provider: real.provider!, title: real.title,
      artist: real.artist, album: real.album, duration: real.duration,
      cover: real.cover_url ?? "", source_id: real.source_id,
    })
    if (mounted.current) setDownloaded(true)
  })

  return (
    <HStack
      spacing={12}
      onTapGesture={play}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="播放" systemImage="play.fill" action={play} />
            <Button title="下载" systemImage="arrow.down.circle" action={download} />
            <Button title="添加到播放列表" systemImage="music.note.list" action={onAddToPlaylist} />
          </Group>
        ),
      }}
      trailingSwipeActions={{
        actions: [
          <Button tint="systemBlue" action={download}>
            <Label title="下载" systemImage="arrow.down.circle.fill" />
          </Button>,
        ],
      }}
    >
      <Text font="footnote" fontWeight="medium" foregroundStyle="tertiaryLabel" frame={{ width: 24, alignment: "center" }}>
        {track.trackNumber ? String(track.trackNumber) : "–"}
      </Text>
      {cover && !coverError ? (
        <Image imageUrl={cover} resizable={true} scaleToFill={true} frame={{ width: 44, height: 44 }} clipShape={{ type: "rect", cornerRadius: 6 }} onError={() => setCoverError(true)} placeholder={<Image systemName="music.note" frame={{ width: 44, height: 44 }} />} />
      ) : (
        <Image systemName="music.note" font="title3" foregroundStyle="secondaryLabel" frame={{ width: 44, height: 44 }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 6 }} />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>{track.title}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{track.artist}</Text>
      </VStack>
      <Spacer />
      {resolving ? (
        <ProgressView controlSize="small" />
      ) : failed ? (
        <Image systemName="exclamationmark.circle.fill" font="title3" foregroundStyle="systemRed" />
      ) : downloaded ? (
        <Image systemName="checkmark.circle.fill" font="title3" foregroundStyle="systemGreen" />
      ) : isPlaying ? (
        <Image systemName="waveform" font="body" foregroundStyle="systemPink" />
      ) : (
        <Image systemName="play.circle" font="title3" foregroundStyle="tertiaryLabel" />
      )}
    </HStack>
  )
}

// ---------------- 在线艺人详情 ----------------

export function OnlineArtistDetail({ artistId, name }: { artistId: number, name: string }) {
  const [albums, setAlbums] = useState<ItunesAlbum[] | null>(null)

  useEffect(() => {
    let alive = true
    itunesBrowse.artistAlbums(artistId)
      .then(a => { if (alive) setAlbums(a) })
      .catch(() => { if (alive) setAlbums([]) })
    return () => { alive = false }
  }, [artistId])

  return (
    <List navigationTitle={name}>
      {albums === null ? (
        <CenterState icon="person.crop.circle" text="加载专辑中..." />
      ) : albums.length === 0 ? (
        <CenterState icon="person.crop.circle.badge.questionmark" text="未找到该艺人的专辑" />
      ) : (
        <Section header={<Text>{`${albums.length} 张专辑`}</Text>}>
          {albums.map(al => (
            <NavigationLink
              key={String(al.collectionId)}
              destination={<OnlineAlbumDetail album={al.album} artist={al.artist} collectionId={al.collectionId} cover={al.cover} />}>
              <OnlineAlbumRow album={al} />
            </NavigationLink>
          ))}
        </Section>
      )}
    </List>
  )
}

/** 专辑墙行：直接用 iTunes 封面（不再二次请求 TheAudioDB）。 */
function OnlineAlbumRow({ album }: { album: ItunesAlbum }) {
  const [failed, setFailed] = useState(false)
  return (
    <HStack spacing={12}>
      {album.cover && !failed ? (
        <Image
          imageUrl={album.cover}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 44, height: 44 }}
          clipShape={{ type: "rect", cornerRadius: 6 }}
          onError={() => setFailed(true)}
          placeholder={<Image systemName="square.stack.fill" font="largeTitle" tint="accentColor" frame={{ width: 44, height: 44 }} />}
        />
      ) : (
        <Image systemName="square.stack.fill" font="largeTitle" tint="accentColor" frame={{ width: 40, height: 40 }} />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1}>{album.album}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {[album.year, album.trackCount ? `${album.trackCount} 首` : null].filter(Boolean).join(" · ")}
        </Text>
      </VStack>
    </HStack>
  )
}
