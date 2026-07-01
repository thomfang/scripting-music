import {
  Button, ContentUnavailableView, Image, List, Menu, Navigation, NavigationStack, Section,
  Text, Toolbar, ToolbarItem, useEffect, useState,
} from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player, PlayMode } from "../../class/player"
import { database, Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"
import { SongRow } from "../components/song_row"
import { PlaylistPickerContent } from "../components/playlist_picker"

const PLAY_MODE_ICONS: Record<PlayMode, string> = {
  "sequential": "arrow.right",
  "repeat-all": "repeat",
  "repeat-one": "repeat.1",
  "shuffle": "shuffle",
}

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  "sequential": "顺序播放",
  "repeat-all": "列表循环",
  "repeat-one": "单曲循环",
  "shuffle": "随机播放",
}

const PLAY_MODE_ORDER: PlayMode[] = ["sequential", "repeat-all", "repeat-one", "shuffle"]

export function QueueSheet() {
  const { queue, currentIndex, playMode } = usePlayerState()
  const dismiss = Navigation.useDismiss()

  const [coverExists, setCoverExists] = useState<Record<string, boolean>>({})
  const [audioExists, setAudioExists] = useState<Record<string, boolean>>({})
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)

  // 预扫描当前队列的本地封面 / 音频文件存在性（与库页 SongRow 一致）
  useEffect(() => {
    let cancelled = false
      ; (async () => {
        const covers: Record<string, boolean> = {}
        const audios: Record<string, boolean> = {}
        await Promise.all(queue.map(async (m) => {
          covers[m.id] = await fileManager.coverExists(m.id)
          audios[m.id] = await fileManager.audioExists(m.id)
        }))
        if (!cancelled) { setCoverExists(covers); setAudioExists(audios) }
      })()
    return () => { cancelled = true }
  }, [queue])

  async function toggleFavorite(m: Music) {
    // 队列可能含未入库曲（发现页试听/在线曲）：入库曲才能收藏，否则给明确提示（不抛异常、不污染库）。
    const inLib = await database.getMusic(m.id)
    if (!inLib) {
      await Dialog.alert({ title: "无法收藏", message: "试听 / 在线曲目需完整播放或下载入库后才能收藏" })
      return
    }
    await database.toggleFavorite(m.id)
  }

  const hasCurrent = currentIndex >= 0 && currentIndex < queue.length
  const current = hasCurrent ? queue[currentIndex] : undefined
  // 「即将播放」= 当前曲之后的所有曲；真实 index = currentIndex + 1 + i
  const upcomingStart = hasCurrent ? currentIndex + 1 : 0
  const upcoming = queue.slice(upcomingStart)

  const isEmpty = queue.length === 0

  function rowFor(music: Music, realIdx: number, opts: { removable: boolean }) {
    const removeAction = () => player.removeFromQueue(realIdx)
    // 队列允许同一首歌重复出现；用 realIdx 掺入身份，避免重复曲 key/itemId 冲突。
    const rowKey = `${music.id}#${realIdx}`
    return (
      <SongRow
        key={rowKey}
        itemId={rowKey}
        music={music}
        coverExists={coverExists}
        audioExists={audioExists}
        fallbackRemoteCover={true}
        onTap={async () => {
          player.setQueue(queue, realIdx)
          await player.play(music)
        }}
        onToggleFavorite={toggleFavorite}
        // 队列场景不删库中歌曲：删除回调仅用于移除出队列
        onDelete={opts.removable ? removeAction : () => { }}
        onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
        hideDefaultDelete={true}
        extraMenuItems={opts.removable ? (
          <Button
            title="从待播列表移除"
            systemImage="minus.circle"
            role="destructive"
            action={removeAction}
          />
        ) : undefined}
        trailingSwipe={opts.removable ? [
          <Button key="remove" role="destructive" action={removeAction}>
            <Image systemName="minus.circle" />
          </Button>
        ] : []}
      />
    )
  }

  return (
    <NavigationStack>
      <List
        tint="systemPink"
        navigationTitle="待播列表"
        overlay={isEmpty
          ? <ContentUnavailableView
            title="待播列表为空"
            systemImage="music.note.list"
            description="播放歌曲后，接下来要播放的曲目会显示在这里"
          />
          : undefined
        }
        toolbar={
          <Toolbar>
            <ToolbarItem placement="topBarLeading">
              <Button action={() => dismiss()}>
                <Image systemName="xmark" />
              </Button>
            </ToolbarItem>
            <ToolbarItem placement="topBarTrailing">
              <Menu
                label={<Image systemName={PLAY_MODE_ICONS[playMode]} />}
              >
                {PLAY_MODE_ORDER.map((mode) => (
                  <Button
                    key={mode}
                    title={PLAY_MODE_LABELS[mode]}
                    systemImage={PLAY_MODE_ICONS[mode]}
                    action={() => player.setPlayMode(mode)}
                  />
                ))}
              </Menu>
            </ToolbarItem>
          </Toolbar>
        }
        sheet={{
          isPresented: showPlaylistPicker,
          onChanged: setShowPlaylistPicker,
          content: (
            <PlaylistPickerContent
              onDismiss={() => { setShowPlaylistPicker(false); setSelectedMusic(null) }}
              onSelect={async (playlistId) => {
                if (selectedMusic) {
                  // 未入库曲（试听/在线）不能加歌单：database.addMusicToPlaylist 会对不存在的 music 抛异常。
                  const inLib = await database.getMusic(selectedMusic.id)
                  if (!inLib) {
                    setShowPlaylistPicker(false)
                    setSelectedMusic(null)
                    await Dialog.alert({ title: "无法添加", message: "试听 / 在线曲目需完整播放或下载入库后才能加入播放列表" })
                    return
                  }
                  await database.addMusicToPlaylist(playlistId, selectedMusic.id)
                }
                setShowPlaylistPicker(false)
                setSelectedMusic(null)
              }}
            />
          ),
        }}
      >
        {!isEmpty && current && (
          <Section header={<Text>正在播放</Text>}>
            {rowFor(current, currentIndex, { removable: false })}
          </Section>
        )}
        {upcoming.length > 0 && (
          <Section header={<Text>{playMode === "shuffle" ? `队列 · ${upcoming.length} 首（随机播放）` : `即将播放 · ${upcoming.length} 首`}</Text>}>
            {upcoming.map((music, i) => rowFor(music, upcomingStart + i, { removable: true }))}
          </Section>
        )}
      </List>
    </NavigationStack>
  )
}
