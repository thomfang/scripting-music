import { Button, Label, List, NavigationLink, Section } from "scripting"
import { DownloadView } from "./download"
import { AllSongsView } from "./all_songs"
import { FavoritesView } from "./favorites"
import { ArtistsView } from "./artists"
import { AlbumsView } from "./albums"
import { PlaylistsView } from "./playlists"
import { RecentlyPlayedView, TopPlayedView } from "./smart_playlists"

export function LibraryView() {
  return (
    <List listStyle="inset">
      <Section>
        <NavigationLink destination={<AllSongsView />}>
          <Label
            title="歌曲"
            systemImage="music.note.list"
            symbolRenderingMode="hierarchical"
          />
        </NavigationLink>
        <NavigationLink destination={<FavoritesView />}>
          <Label
            title="我喜欢"
            systemImage="heart.fill"
            symbolRenderingMode="multicolor"
          />
        </NavigationLink>
        <NavigationLink destination={<DownloadView />}>
          <Label
            title="已下载"
            systemImage="arrow.down.circle.fill"
            symbolRenderingMode="hierarchical"
          />
        </NavigationLink>
      </Section>
      <Section title="智能播放列表">
        <NavigationLink destination={<RecentlyPlayedView />}>
          <Label
            title="最近播放"
            systemImage="clock.fill"
          />
        </NavigationLink>
        <NavigationLink destination={<TopPlayedView />}>
          <Label
            title="最爱精选"
            systemImage="star.fill"
          />
        </NavigationLink>
      </Section>
      <Section title="播放列表">
        <NavigationLink destination={<PlaylistsView />}>
          <Label
            title="播放列表"
            systemImage="music.note.list"
          />
        </NavigationLink>
      </Section>
      <Section title="资料库">
        <NavigationLink destination={<ArtistsView />}>
          <Label
            title="艺人"
            systemImage="person.2.fill"
          />
        </NavigationLink>
        <NavigationLink destination={<AlbumsView />}>
          <Label
            title="专辑"
            systemImage="square.stack.fill"
          />
        </NavigationLink>
      </Section>
    </List>
  )
}
