import {
  Section, Text, HStack, VStack, Image, NavigationLink, Spacer, Button, Group, Label,
  ProgressView, useState, useRef, useEffect,
} from "scripting"
import { ItunesArtist, ItunesAlbum, ItunesTrack } from "../../../class/sources/itunes_browse"
import { ArtistRow } from "../../library/rows"
import { OnlineArtistDetail, OnlineAlbumDetail } from "../online_detail"
import { Music, database } from "../../../class/database"
import { player } from "../../../class/player"
import { downloadCenter } from "../../../class/download_center"
import { resolveRealMusic } from "../../../class/sources/resolve_real"

/**
 * 搜索页「艺人 / 专辑」模式（在线 iTunes）的结果区。
 *
 * 普通列表（非 LazyVGrid）+ 声明式 NavigationLink：每项独立 push，无串扰。
 * 艺人行复用 library/rows 的 ArtistRow（TheAudioDB 头像懒加载）；
 * 专辑行直接用 iTunes 封面（OnlineAlbumResultRow），不二次请求 TheAudioDB。
 */

/** 艺人结果区：点击进入在线艺人详情页（专辑墙）。 */
export function ArtistResultsSection({ artists, query }: { artists: ItunesArtist[], query: string }) {
  return (
    <Section header={<Text>{`"${query}" 的艺人`}</Text>}>
      {artists.map(a => (
        <NavigationLink
          key={String(a.artistId)}
          destination={<OnlineArtistDetail artistId={a.artistId} name={a.name} />}>
          <ArtistRow artist={a.name} count={0} subtitle={a.genre} />
        </NavigationLink>
      ))}
    </Section>
  )
}

/** 专辑结果区：点击进入在线专辑详情页（曲目）。 */
export function AlbumResultsSection({ albums, query }: { albums: ItunesAlbum[], query: string }) {
  return (
    <Section header={<Text>{`"${query}" 的专辑`}</Text>}>
      {albums.map(al => (
        <NavigationLink
          key={String(al.collectionId)}
          destination={<OnlineAlbumDetail album={al.album} artist={al.artist} collectionId={al.collectionId} cover={al.cover} />}>
          <OnlineAlbumResultRow album={al} />
        </NavigationLink>
      ))}
    </Section>
  )
}

/** 专辑结果行：iTunes 封面 + 专辑名 + 艺人·年份。 */
function OnlineAlbumResultRow({ album }: { album: ItunesAlbum }) {
  const [failed, setFailed] = useState(false)
  const sub = [album.artist, album.year].filter(Boolean).join(" · ")
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
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{sub}</Text>
      </VStack>
    </HStack>
  )
}

// ---------------- 在线歌曲（iTunes）搜索结果 ----------------

/** 归一化标题/艺人用于“正在播放”匹配。 */
function normTitle(s: string | undefined): string {
  return (s || "").trim().toLowerCase()
}

/**
 * 判断当前播放曲目是否为该 iTunes 曲目。
 * 真实源 id 与 iTunes trackId 不同，无法比 id；且真实源 title 是 mp3juice
 * 原始标题（可能含 “艺人 - ”前缀 / “(Official)” 噪声）。故用包含式 title 匹配 + artist 校验。
 * （与 online_detail.tsx 的 isSameTrack 保持一致。）
 */
function isSameTrack(cur: { title?: string, artist?: string } | null | undefined, track: ItunesTrack): boolean {
  if (!cur) return false
  const ct = normTitle(cur.title), tt = normTitle(track.title)
  if (!ct || !tt) return false
  const titleMatch = ct === tt || ct.includes(tt) || tt.includes(ct)
  if (!titleMatch) return false
  const ca = normTitle(cur.artist), ta = normTitle(track.artist)
  return !ca || !ta || ca === ta || ca.includes(ta) || ta.includes(ca)
}

// 队列构建令牌：单曲插队播放时 bump，与 online_detail 共享同一语义（阻旧 playAll 后台 loop 污染）。
let queueBuildToken = 0

/** 在线歌曲结果区：行点击=resolveReal 全曲播放；下载/加歌单同样先解析真实 mp3juice 源。 */
export function ItunesSongResultsSection({ tracks, query, currentMusic, onAddToPlaylist }: {
  tracks: ItunesTrack[]
  query: string
  currentMusic: { title?: string, artist?: string } | null | undefined
  onAddToPlaylist: (music: Music) => void
}) {
  return (
    <Section header={<Text>{`"${query}" 的搜索结果`}</Text>}>
      {tracks.map(t => (
        <ItunesSongResultCard
          key={String(t.trackId)}
          track={t}
          isPlaying={isSameTrack(currentMusic, t)}
          onAddToPlaylist={onAddToPlaylist}
        />
      ))}
    </Section>
  )
}

/**
 * 在线歌曲行：点击/下载/加歌单前先 resolveRealMusic 解析真实 mp3juice 源。
 * 解析中显 spinner；失败短暂显错误图标。
 */
function ItunesSongResultCard({ track, isPlaying, onAddToPlaylist }: {
  track: ItunesTrack
  isPlaying: boolean
  onAddToPlaylist: (music: Music) => void
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

  const cover = track.cover
  const meta = { title: track.title, artist: track.artist, album: track.album, duration: track.duration, cover }

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
      console.error("[在线歌曲] 操作失败:", e)
      flagFailed()
    } finally {
      if (mounted.current) setResolving(false)
    }
  }

  const play = () => withResolve(async (real) => { queueBuildToken++; await player.playNext(real) })

  const download = () => withResolve(async (real) => {
    await downloadCenter.enqueue({
      id: real.id, provider: real.provider!, title: real.title,
      artist: real.artist, album: real.album, duration: real.duration,
      cover: real.cover_url ?? "", source_id: real.source_id,
    })
    // enqueue resolve = 到达 terminal（completed 或 cancelled，只有 failed 才 reject）。
    // 必须查 DB 确认真的下载成功，否则用户在下载中心取消后会误显绿勾。
    const saved = await database.getMusic(real.id).catch(() => null)
    if (mounted.current) setDownloaded(!!saved?.is_downloaded)
  })

  const addToPlaylist = () => withResolve(async (real) => { onAddToPlaylist(real) })

  return (
    <HStack
      spacing={12}
      onTapGesture={play}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="播放" systemImage="play.fill" action={play} />
            <Button title="下载" systemImage="arrow.down.circle" action={download} />
            <Button title="添加到播放列表" systemImage="music.note.list" action={addToPlaylist} />
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
      {cover && !coverError ? (
        <Image imageUrl={cover} resizable={true} scaleToFill={true} frame={{ width: 56, height: 56 }} clipShape={{ type: "rect", cornerRadius: 8 }} onError={() => setCoverError(true)} placeholder={<Image systemName="music.note" frame={{ width: 56, height: 56 }} />} />
      ) : (
        <Image systemName="music.note" font="title3" foregroundStyle="secondaryLabel" frame={{ width: 56, height: 56 }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 8 }} />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>{track.title}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{[track.artist, track.album].filter(Boolean).join(" · ")}</Text>
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
