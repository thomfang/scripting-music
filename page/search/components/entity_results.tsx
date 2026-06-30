import { Section, Text, NavigationLink } from "scripting"
import { Music } from "../../../class/database"
import { ArtistDetail } from "../../library/artists"
import { AlbumDetail } from "../../library/albums"
import { ArtistRow, AlbumRow } from "../../library/rows"

/**
 * 搜索页「艺人 / 专辑」模式的结果区。
 *
 * 普通列表（非 LazyVGrid）+ 声明式 NavigationLink：每项独立 push，无串扰。
 * 行 UI 复用 library/rows 的共享组件，与资料库列表页一致。
 */

type ArtistGroup = { artist: string, count: number, musics: Music[] }
type AlbumGroup = { album: string, artist: string, count: number, musics: Music[] }

/** 艺人结果区：点击进入该艺人详情页。 */
export function ArtistResultsSection({ artists, query }: { artists: ArtistGroup[], query: string }) {
  return (
    <Section header={<Text>{`"${query}" 的艺人`}</Text>}>
      {artists.map(item => (
        <NavigationLink
          key={item.artist}
          destination={<ArtistDetail artist={item.artist} musics={item.musics} />}>
          <ArtistRow artist={item.artist} count={item.count} />
        </NavigationLink>
      ))}
    </Section>
  )
}

/** 专辑结果区：点击进入该专辑详情页。 */
export function AlbumResultsSection({ albums, query }: { albums: AlbumGroup[], query: string }) {
  return (
    <Section header={<Text>{`"${query}" 的专辑`}</Text>}>
      {albums.map(item => (
        <NavigationLink
          key={`${item.album}-${item.artist}`}
          destination={<AlbumDetail album={item.album} artist={item.artist} musics={item.musics} />}>
          <AlbumRow album={item.album} artist={item.artist} count={item.count} musics={item.musics} />
        </NavigationLink>
      ))}
    </Section>
  )
}
