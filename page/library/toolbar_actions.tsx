import { Button, Image, Label, Menu, NavigationLink } from "scripting"
import { database, Music } from "../../class/database"
import { player } from "../../class/player"
import { useDownloadCenter } from "../../class/use_download_center"
import { DownloadCenterView } from "./download_center"

export async function playLibrary(shuffle: boolean, musics?: Music[]): Promise<void> {
  const list = musics ?? await database.getAllMusic().catch(() => [] as Music[])
  if (list.length === 0) return
  const queue = shuffle ? [...list].sort(() => Math.random() - 0.5) : list
  player.setQueue(queue, 0)
  await player.play(queue[0])
}

/** Home Screen 常驻业务菜单：保持所有 section 的 trailing Toolbar 宽度稳定。 */
export function HomeLibraryActionsMenu() {
  const { activeCount } = useDownloadCenter()

  return (
    <Menu label={<Image systemName="ellipsis" />}>
      <NavigationLink destination={<DownloadCenterView />}>
        <Label
          title={activeCount > 0 ? `下载中心（${activeCount}）` : "下载中心"}
          systemImage="arrow.down.circle"
        />
      </NavigationLink>
      <Menu title="播放" systemImage="play.circle">
        <Button title="播放全部" systemImage="play.fill" action={() => playLibrary(false)} />
        <Button title="随机播放" systemImage="shuffle" action={() => playLibrary(true)} />
      </Menu>
    </Menu>
  )
}
