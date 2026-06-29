import {
  Button, ContentUnavailableView, Group, HStack, Image, Label, List, Menu,
  NavigationLink, ProgressView, ScrollView, Section, Spacer, Text, Toolbar,
  ToolbarItem, VStack, useEffect, useState,
} from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { usePlayerState } from "../../class/player_state"
import { DownloadView } from "./download"
import { AllSongsView } from "./all_songs"
import { FavoritesView } from "./favorites"
import { ArtistsView } from "./artists"
import { AlbumsView } from "./albums"
import { PlaylistsView } from "./playlists"
import { RecentlyPlayedView, TopPlayedView } from "./smart_playlists"
import {
  LibrarySectionHeader, QuickEntryGrid, QuickEntry,
  RecentlyAddedCard, FavoriteSongRow, StorageFooter,
} from "./components"

const RECENT_LIMIT = 12
const FAVORITE_LIMIT = 5

type LibraryProps = {
  navigationTitle?: string
  toolbar?: {
    topBarLeading?: JSX.Element[]
    topBarTrailing?: JSX.Element[]
  }
}

type LibraryData = {
  all: Music[]
  favorites: Music[]
  recentlyAdded: Music[]
  favoriteRows: Music[]
  favByPlayCount: boolean
  downloadedCount: number
  recentlyPlayedCount: number
  topPlayedCount: number
  playlistCount: number
  artistCount: number
  albumCount: number
  storageBytes: number
  coverExists: Record<string, boolean>
}

export function LibraryView({ navigationTitle, toolbar }: LibraryProps = {}) {
  const [data, setData] = useState<LibraryData | null>(null)
  const [loading, setLoading] = useState(true)
  const playerState = usePlayerState()

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [all, favorites, playlists, artists, albums, storageBytes] = await Promise.all([
        database.getAllMusic().catch(() => [] as Music[]),
        database.getFavoriteMusic().catch(() => [] as Music[]),
        database.getAllPlaylists().catch(() => [] as any[]),
        database.getMusicByArtist().catch(() => [] as any[]),
        database.getMusicByAlbum().catch(() => [] as any[]),
        fileManager.getStorageSize().catch(() => 0),
      ])

      // 最近添加 = getAllMusic 已按 added_at DESC，取前 N
      const recentlyAdded = all.slice(0, RECENT_LIMIT)

      // 最爱歌曲：优先收藏，不足用 play_count Top 补
      const favByPlayCount = favorites.length < FAVORITE_LIMIT
      const favoriteRows = favByPlayCount
        ? [...all].filter(m => m.play_count > 0).sort((a, b) => b.play_count - a.play_count).slice(0, FAVORITE_LIMIT)
        : favorites.slice(0, FAVORITE_LIMIT)

      const downloadedCount = all.filter(m => m.is_downloaded).length
      const recentlyPlayedCount = all.filter(m => m.last_played_at).length
      const topPlayedCount = all.filter(m => m.play_count > 0).length

      // 本地封面存在性（仅卡片墙 + 最爱行涉及的曲目）
      const coverTargets = new Map<string, Music>()
      for (const m of recentlyAdded) coverTargets.set(m.id, m)
      for (const m of favoriteRows) coverTargets.set(m.id, m)
      const coverExists: Record<string, boolean> = {}
      await Promise.all([...coverTargets.values()].map(async m => {
        coverExists[m.id] = await fileManager.coverExists(m.id).catch(() => false)
      }))

      setData({
        all, favorites, recentlyAdded, favoriteRows, favByPlayCount,
        downloadedCount, recentlyPlayedCount, topPlayedCount,
        playlistCount: playlists.length,
        artistCount: artists.length,
        albumCount: albums.length,
        storageBytes, coverExists,
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
    { key: "recent", label: "最近播放", icon: "clock.fill", color: "systemOrange", count: data.recentlyPlayedCount, destination: <RecentlyPlayedView /> },
    { key: "top", label: "最爱精选", icon: "star.fill", color: "systemYellow", count: data.topPlayedCount, destination: <TopPlayedView /> },
    { key: "playlists", label: "播放列表", icon: "square.stack.3d.up.fill", color: "systemPurple", count: data.playlistCount, destination: <PlaylistsView /> },
  ] : []

  const toolbarEl = (
    <Toolbar>
      {(toolbar?.topBarLeading ?? []).map((el, i) => (
        <ToolbarItem key={`lead-${i}`} placement="topBarLeading">{el}</ToolbarItem>
      ))}
      {(toolbar?.topBarTrailing ?? []).map((el, i) => (
        <ToolbarItem key={`trail-${i}`} placement="topBarTrailing">{el}</ToolbarItem>
      ))}
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
      <List navigationTitle={navigationTitle} toolbar={toolbarEl}>
        <HStack listRowSeparator="hidden" padding={{ vertical: 40 }}>
          <Spacer /><ProgressView /><Spacer />
        </HStack>
      </List>
    )
  }

  const hasContent = (data?.all.length ?? 0) > 0

  return (
    <List navigationTitle={navigationTitle} toolbar={toolbarEl}>
      {/* A — 快捷入口宫格 */}
      <Section listRowInsets={{ horizontal: 16, vertical: 6 } as any} listRowSeparator="hidden">
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
              seeAllDestination={<AllSongsView />}
            />
          }
        >
          <ScrollView axes="horizontal" listRowInsets={0} listRowSeparator="hidden">
            <HStack spacing={14} padding={{ horizontal: 16, vertical: 6 }}>
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

      {/* C — 最爱歌曲 */}
      {data && data.favoriteRows.length > 0 && (
        <Section
          header={
            <LibrarySectionHeader
              icon={data.favByPlayCount ? "flame.fill" : "heart.fill"}
              title={data.favByPlayCount ? "常听歌曲" : "最爱歌曲"}
              seeAllDestination={data.favByPlayCount ? <TopPlayedView /> : <FavoritesView />}
            />
          }
        >
          {data.favoriteRows.map((m, idx) => (
            <FavoriteSongRow
              key={m.id}
              music={m}
              rank={idx + 1}
              coverExists={data.coverExists[m.id] === true}
              isPlaying={playerState.currentMusic?.id === m.id}
              showPlayCount={data.favByPlayCount}
              onTap={() => playFromList(data.favoriteRows, m)}
            />
          ))}
        </Section>
      )}

      {/* D — 资料库分类 */}
      <Section header={<LibrarySectionHeader icon="square.grid.2x2.fill" iconColor="secondaryLabel" title="资料库" />}>
        <NavigationLink destination={<ArtistsView />}>
          <Label title={`艺人${data ? ` · ${data.artistCount}` : ""}`} systemImage="music.mic" symbolRenderingMode="hierarchical" />
        </NavigationLink>
        <NavigationLink destination={<AlbumsView />}>
          <Label title={`专辑${data ? ` · ${data.albumCount}` : ""}`} systemImage="square.stack.fill" symbolRenderingMode="hierarchical" />
        </NavigationLink>
        <NavigationLink destination={<PlaylistsView />}>
          <Label title={`播放列表${data ? ` · ${data.playlistCount}` : ""}`} systemImage="square.stack.3d.up.fill" symbolRenderingMode="hierarchical" />
        </NavigationLink>
      </Section>

      {/* 空库引导 */}
      {!hasContent && (
        <ContentUnavailableView
          title="资料库还是空的"
          systemImage="music.note.list"
          description="去「搜索」或「发现」添加歌曲，它们会出现在这里"
        />
      )}

      {/* E — 存储信息 */}
      {data && data.downloadedCount > 0 && (
        <Section listRowSeparator="hidden">
          <StorageFooter downloadedCount={data.downloadedCount} bytes={data.storageBytes} />
        </Section>
      )}
    </List>
  )
}
