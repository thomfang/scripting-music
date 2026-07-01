import {
  Button, ContentUnavailableView, HStack, Image, Label, List, Menu,
  NavigationLink, ProgressView, ScrollView, Section, Spacer, Toolbar,
  ToolbarItem, useEffect, useState, Text,
  ToolbarSpacer,
} from "scripting"
import { database, Music, Playlist } from "../../class/database"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { usePlayerState } from "../../class/player_state"
import { DownloadView } from "./download"
import { AllSongsView } from "./all_songs"
import { FavoritesView } from "./favorites"
import { ArtistsView, ArtistDetail } from "./artists"
import { AlbumsView, AlbumDetail } from "./albums"
import { PlaylistsView, PlaylistDetailPage } from "./playlists"
import { RecentlyPlayedView, TopPlayedView, RecentlyAddedView } from "./smart_playlists"
import { DownloadCenterView } from "./download_center"
import { useDownloadCenter } from "../../class/use_download_center"
import {
  LibrarySectionHeader, QuickEntryGrid, QuickEntry,
  RecentlyAddedCard, FavoriteSongRow,
  ArtistCircleCard, AlbumCoverCard, PlaylistCollageCard, HorizontalCardRail,
} from "./components"

const RECENT_LIMIT = 12
const FAVORITE_LIMIT = 5
const CARD_LIMIT = 12
const PLAYLIST_CARD_LIMIT = 10

type ArtistCard = { artist: string, count: number, musics: Music[] }
type AlbumCard = { album: string, artist: string, count: number, musics: Music[] }
type PlaylistCard = { playlist: Playlist, musics: Music[] }

type LibraryData = {
  all: Music[]
  favorites: Music[]
  recentlyAdded: Music[]
  recentlyPlayedRows: Music[]
  downloadedCount: number
  recentlyPlayedCount: number
  topPlayedCount: number
  playlistCount: number
  artistCount: number
  albumCount: number
  artistCards: ArtistCard[]
  albumCards: AlbumCard[]
  playlistCards: PlaylistCard[]
  coverExists: Record<string, boolean>
}

export function LibraryView() {
  // 注：page/index.tsx 传入的 navigationTitle / toolbar(退出按钮)由框架自动
  // 应用到本组件根视图，无需也不能手动再渲染一遍（否则退出按钮会重复）。
  // 本组件只负责补一个「播放全部/随机」Menu，SwiftUI 会与框架的 toolbar 合并。
  const [data, setData] = useState<LibraryData | null>(null)
  const [loading, setLoading] = useState(true)
  const playerState = usePlayerState()
  const { activeCount } = useDownloadCenter()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [all, favorites, playlists, artists, albums] = await Promise.all([
        database.getAllMusic().catch(() => [] as Music[]),
        database.getFavoriteMusic().catch(() => [] as Music[]),
        database.getAllPlaylists().catch(() => [] as any[]),
        database.getMusicByArtist().catch(() => [] as any[]),
        database.getMusicByAlbum().catch(() => [] as any[]),
      ])

      // 最近添加 = getAllMusic 已按 added_at DESC，取前 N
      const recentlyAdded = all.slice(0, RECENT_LIMIT)

      // 最近播放：有 last_played_at 的按时间倒序取前 N（与顶部「最常播放」频次维度区分）。
      const recentlyPlayedRows = [...all]
        .filter(m => m.last_played_at)
        .sort((a, b) => (b.last_played_at ?? 0) - (a.last_played_at ?? 0))
        .slice(0, FAVORITE_LIMIT)

      const downloadedCount = all.filter(m => m.is_downloaded).length
      const recentlyPlayedCount = all.filter(m => m.last_played_at).length
      const topPlayedCount = all.filter(m => m.play_count > 0).length

      // 卡片数据：艺人/专辑取前 N；播放列表取前 N 个并拉前 4 首做拼图
      const artistCards: ArtistCard[] = artists.slice(0, CARD_LIMIT)
      const albumCards: AlbumCard[] = albums.slice(0, CARD_LIMIT)
      const playlistCards: PlaylistCard[] = await Promise.all(
        playlists.slice(0, PLAYLIST_CARD_LIMIT).map(async (p: Playlist) => {
          const m = await database.getPlaylistMusic(p.id).catch(() => [] as Music[])
          return { playlist: p, musics: m.slice(0, 4) }
        })
      )

      // 本地封面存在性（卡片墙 + 最近播放行 + 拼图涉及的曲目）
      const coverTargets = new Map<string, Music>()
      for (const m of recentlyAdded) coverTargets.set(m.id, m)
      for (const m of recentlyPlayedRows) coverTargets.set(m.id, m)
      for (const c of albumCards) if (c.musics[0]) coverTargets.set(c.musics[0].id, c.musics[0])
      for (const c of playlistCards) for (const m of c.musics) coverTargets.set(m.id, m)
      const coverExists: Record<string, boolean> = {}
      await Promise.all([...coverTargets.values()].map(async m => {
        coverExists[m.id] = await fileManager.coverExists(m.id).catch(() => false)
      }))

      setData({
        all, favorites, recentlyAdded, recentlyPlayedRows,
        downloadedCount, recentlyPlayedCount, topPlayedCount,
        playlistCount: playlists.length,
        artistCount: artists.length,
        albumCount: albums.length,
        artistCards, albumCards, playlistCards,
        coverExists,
      })
    } catch (e) {
      console.error("[资料库] 加载失败:", e)
    } finally {
      setLoading(false)
    }
  }

  // 以某列表为队列，从点击项开始播放
  async function playFromList(list: Music[], m: Music) {
    const idx = list.findIndex(x => x.id === m.id)
    const start = idx >= 0 ? idx : 0
    player.setQueue(list, start)
    await player.play(list[start])
  }

  async function playAll(shuffle: boolean) {
    const list = data?.all ?? []
    if (list.length === 0) return
    const queue = shuffle ? [...list].sort(() => Math.random() - 0.5) : list
    player.setQueue(queue, 0)
    await player.play(queue[0])
  }

  const quickEntries: QuickEntry[] = data ? [
    { key: "songs", label: "歌曲", icon: "music.note", color: "systemBlue", count: data.all.length, destination: <AllSongsView /> },
    { key: "favorites", label: "我喜欢", icon: "heart.fill", color: "systemPink", count: data.favorites.length, destination: <FavoritesView /> },
    { key: "downloaded", label: "已下载", icon: "arrow.down.circle.fill", color: "systemGreen", count: data.downloadedCount, destination: <DownloadView /> },
    { key: "top", label: "最常播放", icon: "flame.fill", color: "systemOrange", count: data.topPlayedCount, destination: <TopPlayedView /> },
  ] : []

  const toolbarEl = (
    <Toolbar>
      <ToolbarItem placement="topBarTrailing">
        <NavigationLink destination={<DownloadCenterView />}>
          <HStack spacing={3}>
            <Image systemName="arrow.down.circle" />
            {activeCount > 0 && (
              <Text font="footnote" fontWeight="semibold" foregroundStyle="systemPink">{String(activeCount)}</Text>
            )}
          </HStack>
        </NavigationLink>
      </ToolbarItem>

      <ToolbarItem placement="topBarTrailing">
        <Menu label={<Image systemName="play.circle" />}>
          <Button title="播放全部" systemImage="play.fill" action={() => playAll(false)} />
          <Button title="随机播放" systemImage="shuffle" action={() => playAll(true)} />
        </Menu>
      </ToolbarItem>
    </Toolbar>
  )

  if (loading) {
    return (
      <List toolbar={toolbarEl}>
        <HStack listRowSeparator="hidden" padding={{ vertical: 40 }}>
          <Spacer /><ProgressView /><Spacer />
        </HStack>
      </List>
    )
  }

  const hasContent = (data?.all.length ?? 0) > 0

  return (
    <List
      toolbar={toolbarEl}
    >
      {/* A — 快捷入口宫格 */}
      <Section listRowInsets={16 as any} listRowSeparator="hidden">
        <QuickEntryGrid entries={quickEntries} />
      </Section>

      {/* B — 最近添加 */}
      {data && data.recentlyAdded.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon="clock.badge.plus"
              title="最近添加"
              subtitle={`${data.all.length} 首`}
              seeAllDestination={<RecentlyAddedView />}
            />
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={16}>
              {data.recentlyAdded.map(m => (
                <RecentlyAddedCard
                  key={m.id}
                  music={m}
                  coverExists={data.coverExists[m.id] === true}
                  isPlaying={playerState.currentMusic?.id === m.id}
                  onTap={() => playFromList(data.recentlyAdded, m)}
                />
              ))}
            </HStack>
          </ScrollView>
        </Section>
      )}

      {/* 艺人 — 横向圆形卡 */}
      {data && data.artistCards.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon="music.mic"
              title="艺人"
              subtitle={`${data.artistCount} 位`}
              seeAllDestination={<ArtistsView />}
            />
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={16}>
              {data.artistCards.map(c => (
                <ArtistCircleCard
                  key={c.artist}
                  artist={c.artist}
                  count={c.count}
                  destination={<ArtistDetail artist={c.artist} musics={c.musics} />}
                />
              ))}
            </HStack>
          </ScrollView>
        </Section>
      )}

      {/* 专辑 — 横向封面卡 */}
      {data && data.albumCards.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon="square.stack.fill"
              title="专辑"
              subtitle={`${data.albumCount} 张`}
              seeAllDestination={<AlbumsView />}
            />
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={16}>
              {data.albumCards.map(c => (
                <AlbumCoverCard
                  key={`${c.album}-${c.artist}`}
                  album={c.album}
                  artist={c.artist}
                  musics={c.musics}
                  destination={<AlbumDetail album={c.album} artist={c.artist} musics={c.musics} />}
                />
              ))}
            </HStack>
          </ScrollView>
        </Section>
      )}

      {/* 播放列表 — 横向拼图卡 */}
      {data && data.playlistCards.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon="square.stack.3d.up.fill"
              title="播放列表"
              subtitle={`${data.playlistCount} 个`}
              seeAllDestination={<PlaylistsView />}
            />
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={16}>
              {data.playlistCards.map(c => (
                <PlaylistCollageCard
                  key={c.playlist.id}
                  playlist={c.playlist}
                  musics={c.musics}
                  destination={<PlaylistDetailPage playlistId={c.playlist.id} onDeleted={load} />}
                />
              ))}
            </HStack>
          </ScrollView>
        </Section>
      )}

      {/* C — 最近播放 */}
      {data && data.recentlyPlayedRows.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon="clock.arrow.circlepath"
              title="最近播放"
              seeAllDestination={<RecentlyPlayedView />}
            />
          }
        >
          {data.recentlyPlayedRows.map((m, idx) => (
            <FavoriteSongRow
              key={m.id}
              music={m}
              rank={idx + 1}
              coverExists={data.coverExists[m.id] === true}
              isPlaying={playerState.currentMusic?.id === m.id}
              showPlayCount={false}
              onTap={() => playFromList(data.recentlyPlayedRows, m)}
            />
          ))}
        </Section>
      )}

      {/* 空库引导 */}
      {!hasContent && (
        <ContentUnavailableView
          title="资料库还是空的"
          systemImage="music.note.list"
          description="去「搜索」或「发现」添加歌曲，它们会出现在这里"
        />
      )}
    </List>
  )
}
