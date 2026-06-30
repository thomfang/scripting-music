import { HStack, VStack, Text, Image, useEffect, useState } from "scripting"
import { Music } from "../../class/database"
import { artistInfo } from "../../class/sources/artist_info"
import { albumInfo } from "../../class/sources/album_info"

/**
 * 共享的艺人/专辑「列表行」组件。
 *
 * 抽取自 artists.tsx 的 ArtistRowContent / albums.tsx 的 AlbumRowContent，
 * 供资料库列表页与搜索页（艺人/专辑模式）共用，避免样式各处复制。
 *
 * 注意：两者均为「纯展示」组件，点击导航由调用方用 NavigationLink 包裹。
 */

/** 艺人行：圆形真实头像懒加载，查不到/加载失败降级到占位。
 *  subtitle 传入时覆盖默认「N 首歌曲」（在线搜索场景显示流派）。 */
export function ArtistRow({ artist, count, subtitle }: { artist: string, count: number, subtitle?: string }) {
  const [thumb, setThumb] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    artistInfo.fetch(artist).then(info => {
      if (alive && info?.thumb) setThumb(info.thumb)
    }).catch(() => { })
    return () => { alive = false }
  }, [artist])

  return (
    <HStack spacing={12}>
      {thumb && !failed ? (
        <Image
          imageUrl={thumb}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 44, height: 44 }}
          clipShape="capsule"
          onError={() => setFailed(true)}
          placeholder={<Image systemName="person.circle.fill" font="largeTitle" tint="accentColor" frame={{ width: 44, height: 44 }} />}
        />
      ) : (
        <Image systemName="person.circle.fill" font="largeTitle" tint="accentColor" frame={{ width: 44, height: 44 }} />
      )}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1}>{artist}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel">{subtitle ?? `${count} 首歌曲`}</Text>
      </VStack>
    </HStack>
  )
}

/** 专辑行：圆角方形真实封面懒加载，查不到→本地封面回退→占位图标。 */
export function AlbumRow({ album, artist, count, musics }: { album: string, artist: string, count: number, musics: Music[] }) {
  const localCover = musics.find(m => m.cover_url)?.cover_url
  const [thumb, setThumb] = useState<string | null>(localCover ?? null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    albumInfo.fetch(artist, album).then(info => {
      if (alive && info?.thumb) setThumb(info.thumb)
    }).catch(() => { })
    return () => { alive = false }
  }, [album, artist])

  return (
    <HStack spacing={12}>
      {thumb && !failed ? (
        <Image
          imageUrl={thumb}
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
        <Text font="headline" lineLimit={1}>{album}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{artist} · {count} 首歌曲</Text>
      </VStack>
    </HStack>
  )
}
