import { NavigationStack, VStack, Image, Text, ProgressView, useEffect, useState } from "scripting"
import { database, Music } from "../../class/database"
import { ArtistDetail } from "../library/artists"
import { AlbumDetail } from "../library/albums"

/**
 * 播放页「点艺人/专辑」弹出的详情 sheet 包装。
 *
 * 背景：PlayerView 由 TabView.sheet 弹出，本身不在 NavigationStack 内；
 * 详情页依赖 navigationTitle/toolbar/searchable，必须自带 NavigationStack。
 * 这里负责：实时从本地库取该艺人/专辑下的歌 → loading/空态 → 包 NavigationStack 渲染详情。
 *
 * onClose 传给详情页，在 toolbar 左侧渲染「关闭」按钮（sheet 无系统返回键）。
 */

function CenterState({ icon, text }: { icon: string, text: string }) {
  return (
    <VStack spacing={12} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      <Image systemName={icon} font="largeTitle" foregroundStyle="tertiaryLabel" />
      <Text font="headline" foregroundStyle="secondaryLabel">{text}</Text>
    </VStack>
  )
}

/** 艺人详情 sheet：按当前歌的艺人名取本地库该艺人的全部歌曲。 */
export function PlayerArtistSheet({ artist, onDismiss }: { artist: string, onDismiss: () => void }) {
  const [musics, setMusics] = useState<Music[] | null>(null)

  useEffect(() => {
    let alive = true
    database.getMusicByArtist()
      .then(groups => {
        if (!alive) return
        const hit = groups.find(g => g.artist === artist)
        setMusics(hit?.musics ?? [])
      })
      .catch(() => { if (alive) setMusics([]) })
    return () => { alive = false }
  }, [artist])

  if (musics === null) return <CenterState icon="person.crop.circle" text="加载中..." />
  if (musics.length === 0) {
    return (
      <NavigationStack tint="systemPink">
        <CenterState icon="person.crop.circle.badge.questionmark" text={`库中没有「${artist}」的歌曲`} />
      </NavigationStack>
    )
  }
  return (
    <NavigationStack tint="systemPink">
      <ArtistDetail artist={artist} musics={musics} onClose={onDismiss} />
    </NavigationStack>
  )
}

/** 专辑详情 sheet：按当前歌的专辑+艺人取本地库该专辑的全部歌曲。 */
export function PlayerAlbumSheet({ album, artist, onDismiss }: { album: string, artist: string, onDismiss: () => void }) {
  const [musics, setMusics] = useState<Music[] | null>(null)

  useEffect(() => {
    let alive = true
    database.getMusicByAlbum()
      .then(groups => {
        if (!alive) return
        // 优先精确匹配 album+artist；退而求其次仅匹配 album。
        const hit = groups.find(g => g.album === album && g.artist === artist)
          ?? groups.find(g => g.album === album)
        setMusics(hit?.musics ?? [])
      })
      .catch(() => { if (alive) setMusics([]) })
    return () => { alive = false }
  }, [album, artist])

  if (musics === null) return <CenterState icon="square.stack" text="加载中..." />
  if (musics.length === 0) {
    return (
      <NavigationStack tint="systemPink">
        <CenterState icon="square.stack.3d.up.slash" text={`库中没有「${album}」的歌曲`} />
      </NavigationStack>
    )
  }
  return (
    <NavigationStack tint="systemPink">
      <AlbumDetail album={album} artist={artist} musics={musics} onClose={onDismiss} />
    </NavigationStack>
  )
}
