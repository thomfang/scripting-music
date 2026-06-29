import {
  Button, HStack, Image, Label, Menu, ProgressView, Spacer, Text, VStack,
} from "scripting"
import { Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"
import { player } from "../../class/player"
import { usePlayerState } from "../../class/player_state"

/**
 * 统一的歌曲行组件。
 *
 * 设计原则：
 * - 主体样式固定（封面 + 标题/艺人 + 状态徽标 + ⋯ Menu）
 * - 回调由调用方注入（收藏/删除/添加到歌单/下载）
 * - 非必要 UI（下载按钮、额外 Menu 项、swipe 动作）通过 props 扩展
 * - 编辑模式下自动隐藏 Menu + swipe + tap
 *
 * 下载状态优先级：
 *   isDownloading > fileLost > isDownloaded > 未下载
 */
export type SongRowProps = {
  music: Music
  /** 当前可播放队列；不传则需要用 onTap 覆盖点击行为 */
  queue?: Music[]
  /** 封面占位图标（无本地封面时显示） */
  placeholderIcon?: string
  /** 占位图标的 tint */
  placeholderTint?: string
  /** 本地封面文件存在性 map */
  coverExists?: Record<string, boolean>
  /** 本地音频文件存在性 map（用于识别 is_downloaded=1 但文件丢失） */
  audioExists?: Record<string, boolean>
  /** 正在下载的 id 集合（批量 + 单首共用） */
  downloadingIds?: Set<string>
  /** 右侧附加一行小字（例如已下载页的文件大小） */
  trailingMeta?: string
  /** 覆盖副标题（默认 = music.artist）。用于专辑/艺人详情页这类“不提艺人名”场景。 */
  subtitle?: string
  /** 本地无封面时是否回退到 music.cover_url 远程图（专辑/艺人详情页通常需要） */
  fallbackRemoteCover?: boolean
  /** 编辑模式：隐藏 Menu 和 swipe */
  isEditing?: boolean

  /** List/ForEach 行身份：调用方不要直接使用 SwiftUI tag；这里由 SongRow 内部统一映射。 */
  itemId?: string

  /** 必选回调 */
  onToggleFavorite: (m: Music) => void
  onDelete: (m: Music) => void
  onAddToPlaylist: (m: Music) => void
  /** 可选：如果不传则 Menu 里不显示下载项 */
  onDownload?: (m: Music) => void

  /** 自定义整行点击（不传则默认 setQueue(queue) + play） */
  onTap?: () => void

  /** Menu 的额外项（例如"从该歌单移除"） */
  extraMenuItems?: JSX.Element
  /** 隐藏默认的"删除" Menu 项（例如歌单详情页不该直接删除歌曲） */
  hideDefaultDelete?: boolean
  /** 覆盖默认左滑（收藏） */
  leadingSwipe?: JSX.Element[]
  /** 覆盖默认右滑（删除） */
  trailingSwipe?: JSX.Element[]
}

export function SongRow(props: SongRowProps) {
  const {
    music,
    queue,
    placeholderIcon = "music.note",
    placeholderTint = "secondaryLabel",
    coverExists,
    audioExists,
    downloadingIds,
    trailingMeta,
    subtitle,
    fallbackRemoteCover,
    isEditing,
    itemId,
    onToggleFavorite,
    onDelete,
    onAddToPlaylist,
    onDownload,
    onTap,
    extraMenuItems,
    hideDefaultDelete,
    leadingSwipe,
    trailingSwipe,
  } = props

  const state = usePlayerState()
  const isPlaying = state.currentMusic?.id === music.id

  const isDownloading = downloadingIds?.has(music.id) === true
  // is_downloaded=1 时 audioExists[id] 明确 === false 才算"丢失"；未扫描时保持乐观
  const fileLost = music.is_downloaded && audioExists?.[music.id] === false
  const isDownloaded = music.is_downloaded && !fileLost

  const defaultTap = async () => {
    if (!queue) return
    const idx = queue.indexOf(music)
    player.setQueue(queue, idx >= 0 ? idx : 0)
    await player.play(music)
  }

  // 默认 swipe：左滑收藏 / 右滑删除
  const defaultLeading: JSX.Element[] = [
    <Button key="fav" tint="systemPink" action={() => onToggleFavorite(music)}>
      <Label title={music.is_favorite ? "取消" : "收藏"} systemImage="heart.fill" />
    </Button>
  ]
  const defaultTrailing: JSX.Element[] = [
    <Button key="del" role="destructive" action={() => onDelete(music)}>
      <Label title="删除" systemImage="trash" />
    </Button>
  ]

  const leadingActions = leadingSwipe ?? defaultLeading
  const trailingActions = trailingSwipe ?? defaultTrailing

  return (
    <HStack
      tag={itemId}
      spacing={12}
      leadingSwipeActions={isEditing ? undefined : { actions: leadingActions }}
      trailingSwipeActions={isEditing ? undefined : { actions: trailingActions }}
      {...(!isEditing && { onTapGesture: onTap ?? defaultTap })}
    >
      {/* 封面 */}
      {coverExists?.[music.id]
        ? <Image
            filePath={fileManager.getCoverPath(music.id)}
            frame={{ width: 48, height: 48 }}
            resizable={true}
            clipShape={{ type: "rect", cornerRadius: 6 }}
          />
        : (fallbackRemoteCover && music.cover_url)
          ? <Image
              imageUrl={music.cover_url}
              frame={{ width: 48, height: 48 }}
              resizable={true}
              clipShape={{ type: "rect", cornerRadius: 6 }}
            />
          : <Image
              systemName={placeholderIcon}
              font="title2"
              tint={(isPlaying ? "accentColor" : placeholderTint) as any}
              frame={{ width: 48, height: 48 }}
            />
      }

      {/* 标题 + 艺人 */}
      <VStack alignment="leading" spacing={2}>
        <Text font="headline" lineLimit={1} foregroundStyle={isPlaying ? "accentColor" : undefined}>
          {music.title}
        </Text>
        {(() => {
          const sub = subtitle ?? music.artist
          if (!sub && !trailingMeta) return null
          if (trailingMeta) {
            return (
              <HStack spacing={4}>
                {sub ? <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{sub}</Text> : null}
                <Text font="caption" foregroundStyle="tertiaryLabel">{sub ? `• ${trailingMeta}` : trailingMeta}</Text>
              </HStack>
            )
          }
          return (
            <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>{sub}</Text>
          )
        })()}
      </VStack>

      <Spacer />

      {/* 播放指示 */}
      {isPlaying && !isEditing && <Image systemName="waveform" tint="accentColor" />}

      {/* 下载状态徽标 */}
      {!isEditing && (
        isDownloading ? <ProgressView controlSize="small" /> :
        fileLost ? <Image systemName="exclamationmark.triangle.fill" foregroundStyle="systemOrange" /> :
        isDownloaded ? <Image systemName="arrow.down.circle.fill" foregroundStyle="systemGreen" /> :
        null
      )}

      {/* ⋯ Menu */}
      {!isEditing && (
        <Menu
          buttonStyle="plain"
          label={<Image systemName="ellipsis.circle" font="title3" foregroundStyle="secondaryLabel" />}
        >
          <Button
            title={music.is_favorite ? "取消收藏" : "收藏"}
            systemImage={music.is_favorite ? "heart.slash" : "heart"}
            action={() => onToggleFavorite(music)}
          />
          <Button
            title="添加到播放列表"
            systemImage="music.note.list"
            action={() => onAddToPlaylist(music)}
          />
          {onDownload && !isDownloading && (fileLost || !isDownloaded) && (
            <Button
              title={fileLost ? "重新下载" : "下载这首"}
              systemImage="arrow.down.circle"
              action={() => onDownload(music)}
            />
          )}
          {extraMenuItems}
          {!hideDefaultDelete && (
            <Button
              title="删除"
              systemImage="trash"
              role="destructive"
              action={() => onDelete(music)}
            />
          )}
        </Menu>
      )}
    </HStack>
  )
}
