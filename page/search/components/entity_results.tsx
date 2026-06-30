import { Section, Text, HStack, VStack, Image, NavigationLink, useState } from "scripting"
import { ItunesArtist, ItunesAlbum } from "../../../class/sources/itunes_browse"
import { ArtistRow } from "../../library/rows"
import { OnlineArtistDetail, OnlineAlbumDetail } from "../online_detail"

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
