import {
  List, Section, Button, Label, HStack, VStack, ZStack, Rectangle, Text, Image,
  NavigationLink, ProgressView, useEffect, useState,
} from "scripting"
import { MusicData } from "../../class/music"
import { Music } from "../../class/database"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"
import { itunesBrowse, ItunesAlbum, ItunesTrack } from "../../class/sources/itunes_browse"
import { SearchResultCard } from "./components/search_result_card"

/**
 * 在线（iTunes）艺人 / 专辑浏览详情页。
 *
 * - 数据：class/sources/itunes_browse（iTunes Search/Lookup）。
 * - 播放/下载/加歌单：曲目映射成 MusicData，复用 SearchResultCard（走 mp3juice 实时解析）。
 * - 这些页面在搜索 Tab 的 NavigationStack 内，用声明式 NavigationLink push。
 */

const BANNER_SCRIM = {
  colors: ["rgba(0,0,0,0.12)", "rgba(0,0,0,0.34)", "rgba(0,0,0,0.78)"],
  startPoint: "top",
  endPoint: "bottom",
} as any

/** iTunes 曲目 → MusicData（播放时 mp3juice 按「标题 艺人」实时搜索，不依赖 id 对应真实音频）。 */
function trackToMusicData(t: ItunesTrack, fallbackCover?: string): MusicData {
  return {
    id: String(t.trackId),
    title: t.title,
    artist: t.artist || "未知艺术家",
    album: t.album || "未知专辑",
    duration: t.duration,
    cover: t.cover ?? fallbackCover,
    provider: "mp3juice",
  }
}

/** iTunes 曲目 → 完整 Music（供 player.setQueue/play 用；cover_url 字段）。 */
function trackToMusic(t: ItunesTrack, fallbackCover?: string): Music {
  return {
    id: String(t.trackId),
    title: t.title,
    artist: t.artist || "未知艺术家",
    album: t.album || "未知专辑",
    duration: t.duration ?? 0,
    cover_url: t.cover ?? fallbackCover ?? "",
    audio_url: "",
    provider: "mp3juice",
    is_downloaded: false,
    added_at: Date.now(),
    play_count: 0,
    is_favorite: false,
  }
}

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

export function OnlineAlbumDetail({ album, artist, collectionId, cover }: {
  album: string, artist: string, collectionId: number, cover?: string
}) {
  const state = usePlayerState()
  const [data, setData] = useState<{ album: ItunesAlbum | null, tracks: ItunesTrack[] } | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)

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
  const queue: Music[] = tracks.map(t => trackToMusic(t, effectiveCover))

  const chips: { icon: string, text: string }[] = []
  if (info?.year) chips.push({ icon: "calendar", text: info.year })
  if (info?.genre) chips.push({ icon: "guitars", text: info.genre })
  if (info?.trackCount) chips.push({ icon: "music.note.list", text: `${info.trackCount} 首` })

  return (
    <List navigationTitle={album} navigationSubtitle={artist}>
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
            <Button action={async () => { if (queue.length === 0) return; player.setQueue(queue, 0); await player.play(queue[0]) }}>
              <Label title="播放全部" systemImage="play.fill" tint="systemPink" />
            </Button>
            <Button action={async () => { if (queue.length === 0) return; const s = [...queue].sort(() => Math.random() - 0.5); player.setQueue(s, 0); await player.play(s[0]) }}>
              <Label title="随机播放" systemImage="shuffle" tint="systemPink" />
            </Button>
          </Section>
          <Section header={<Text>{`${tracks.length} 首曲目`}</Text>}>
            {tracks.map(t => (
              <SearchResultCard
                key={String(t.trackId)}
                info={trackToMusicData(t, effectiveCover)}
                isPlaying={state.currentMusic?.id === String(t.trackId)}
              />
            ))}
          </Section>
        </>
      )}
    </List>
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
