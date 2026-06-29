/**
 * 资料库主页可复用组件集合。
 *
 * 设计语言对齐「发现」页（page/discover/index.tsx）：
 * - 富 Section header：着色 SF Symbol + title3 bold 主标 + 右侧 caption 副标/操作
 * - 横向卡片墙：130pt 大封面卡（cornerRadius 14 + 柔投影 + 播放角标）
 * - 行：56pt 封面（cornerRadius 10 + 细阴影）+ 标题/艺人 + 状态徽标
 * - 强调色统一 systemPink；本地封面优先，远程 cover_url 回退
 */
import {
  Button, HStack, Image, LazyVGrid, NavigationLink, Spacer, Text, VStack, ZStack,
  useState,
} from "scripting"
import { Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"

// ---- 富 Section 头 ----

export type LibrarySectionHeaderProps = {
  /** SF Symbol 名 */
  icon: string
  /** 图标着色（默认 systemPink） */
  iconColor?: string
  title: string
  /** 右侧副标小字（如「128 首」） */
  subtitle?: string
  /** 右侧「查看全部」目标页（传入则显示箭头链接） */
  seeAllDestination?: JSX.Element
}

export function LibrarySectionHeader({
  icon, iconColor = "systemPink", title, subtitle, seeAllDestination,
}: LibrarySectionHeaderProps) {
  return (
    <HStack spacing={6} padding={{ top: 4, bottom: 2 }}>
      <Image systemName={icon} font="subheadline" foregroundStyle={iconColor as any} />
      <Text font="title3" fontWeight="bold" foregroundStyle="label">{title}</Text>
      <Spacer />
      {subtitle != null && (
        <Text font="caption" foregroundStyle="tertiaryLabel">{subtitle}</Text>
      )}
      {seeAllDestination != null && (
        <NavigationLink destination={seeAllDestination}>
          <Image systemName="chevron.right" font="caption" foregroundStyle="tertiaryLabel" />
        </NavigationLink>
      )}
    </HStack>
  )
}

// ---- 顶部快捷入口宫格 ----

export type QuickEntry = {
  key: string
  label: string
  icon: string
  /** 色块底色（语义色） */
  color: string
  /** 数量徽标（null 时不显示） */
  count: number | null
  destination: JSX.Element
}

function QuickEntryCard({ entry }: { entry: QuickEntry }) {
  return (
    <NavigationLink destination={entry.destination}>
      <HStack
        spacing={10}
        padding={{ horizontal: 12, vertical: 13 }}
        background="secondarySystemBackground"
        clipShape={{ type: "rect", cornerRadius: 14 }}
      >
        {/* 彩色图标块 */}
        <ZStack
          frame={{ width: 38, height: 38 }}
          background={entry.color as any}
          clipShape={{ type: "rect", cornerRadius: 10 }}
          shadow={{ color: "rgba(0,0,0,0.16)", radius: 3, x: 0, y: 2 }}
        >
          <Image systemName={entry.icon} font="body" fontWeight="semibold" foregroundStyle="white" />
        </ZStack>
        <VStack alignment="leading" spacing={1} layoutPriority={1}>
          <Text font="subheadline" fontWeight="semibold" foregroundStyle="label" lineLimit={1} minimumScaleFactor={0.7}>
            {entry.label}
          </Text>
          {entry.count != null && (
            <Text font="caption" foregroundStyle="secondaryLabel">{`${entry.count} 首`}</Text>
          )}
        </VStack>
        <Spacer minLength={0} />
      </HStack>
    </NavigationLink>
  )
}

export function QuickEntryGrid({ entries }: { entries: QuickEntry[] }) {
  return (
    <LazyVGrid
      columns={[
        { size: { type: "flexible" }, spacing: 10 },
        { size: { type: "flexible" }, spacing: 10 },
      ]}
      spacing={10}
    >
      {entries.map(e => <QuickEntryCard key={e.key} entry={e} />)}
    </LazyVGrid>
  )
}

// ---- 最近添加：横向封面卡 ----

export type RecentlyAddedCardProps = {
  music: Music
  /** 本地封面是否存在 */
  coverExists: boolean
  isPlaying: boolean
  onTap: () => void
}

export function RecentlyAddedCard({ music, coverExists, isPlaying, onTap }: RecentlyAddedCardProps) {
  const [remoteError, setRemoteError] = useState(false)
  const showLocal = coverExists
  const showRemote = !coverExists && !!music.cover_url && !remoteError

  return (
    <Button action={onTap} buttonStyle="plain">
      <VStack alignment="leading" spacing={6} frame={{ width: 130 }}>
        <ZStack alignment="bottomTrailing">
          {showLocal ? (
            <Image
              filePath={fileManager.getCoverPath(music.id)}
              resizable={true}
              scaleToFill={true}
              frame={{ width: 130, height: 130 }}
              clipShape={{ type: "rect", cornerRadius: 14 }}
              shadow={{ color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 }}
            />
          ) : showRemote ? (
            <Image
              imageUrl={music.cover_url!}
              resizable={true}
              scaleToFill={true}
              frame={{ width: 130, height: 130 }}
              clipShape={{ type: "rect", cornerRadius: 14 }}
              shadow={{ color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 }}
              onError={() => setRemoteError(true)}
              placeholder={<Image systemName="music.note" frame={{ width: 130, height: 130 }} />}
            />
          ) : (
            <Image
              systemName="music.note"
              font="largeTitle"
              tint="secondaryLabel"
              frame={{ width: 130, height: 130 }}
              background="secondarySystemBackground"
              clipShape={{ type: "rect", cornerRadius: 14 }}
            />
          )}
          <Image
            systemName={isPlaying ? "waveform.circle.fill" : "play.circle.fill"}
            font="title2"
            foregroundStyle={isPlaying ? "systemPink" : "white"}
            padding={6}
          />
        </ZStack>
        <Text font="subheadline" fontWeight="semibold" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>
          {music.title}
        </Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
          {music.artist}
        </Text>
      </VStack>
    </Button>
  )
}

// ---- 最爱歌曲：精简竖向行 ----

export type FavoriteSongRowProps = {
  music: Music
  rank: number
  coverExists: boolean
  isPlaying: boolean
  /** 显示播放次数徽标（最爱 by play_count 时用） */
  showPlayCount?: boolean
  onTap: () => void
}

export function FavoriteSongRow({ music, rank, coverExists, isPlaying, showPlayCount, onTap }: FavoriteSongRowProps) {
  const [remoteError, setRemoteError] = useState(false)
  const showLocal = coverExists
  const showRemote = !coverExists && !!music.cover_url && !remoteError
  return (
    <HStack spacing={12} padding={{ vertical: 4 }} onTapGesture={onTap}>
      {/* 序号 */}
      <Text
        font="footnote"
        fontWeight="semibold"
        foregroundStyle="tertiaryLabel"
        frame={{ width: 20, alignment: "center" }}
      >
        {String(rank)}
      </Text>
      {/* 封面 */}
      {showLocal ? (
        <Image
          filePath={fileManager.getCoverPath(music.id)}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 50, height: 50 }}
          clipShape={{ type: "rect", cornerRadius: 9 }}
          shadow={{ color: "rgba(0,0,0,0.16)", radius: 3, x: 0, y: 2 }}
        />
      ) : showRemote ? (
        <Image
          imageUrl={music.cover_url!}
          resizable={true}
          scaleToFill={true}
          frame={{ width: 50, height: 50 }}
          clipShape={{ type: "rect", cornerRadius: 9 }}
          onError={() => setRemoteError(true)}
          placeholder={<Image systemName="music.note" frame={{ width: 50, height: 50 }} />}
        />
      ) : (
        <Image
          systemName="heart.fill"
          font="title3"
          tint="secondaryLabel"
          frame={{ width: 50, height: 50 }}
          background="secondarySystemBackground"
          clipShape={{ type: "rect", cornerRadius: 9 }}
        />
      )}
      {/* 标题 + 艺人 */}
      <VStack alignment="leading" spacing={3}>
        <Text font="body" fontWeight="semibold" lineLimit={1} foregroundStyle={isPlaying ? "systemPink" : "label"}>
          {music.title}
        </Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
          {music.artist}
        </Text>
      </VStack>
      <Spacer />
      {/* 状态 / 播放次数 */}
      {isPlaying ? (
        <Image systemName="waveform" font="body" foregroundStyle="systemPink" />
      ) : showPlayCount && music.play_count > 0 ? (
        <HStack spacing={3}>
          <Image systemName="play.fill" font="caption2" foregroundStyle="tertiaryLabel" />
          <Text font="caption" foregroundStyle="tertiaryLabel">{String(music.play_count)}</Text>
        </HStack>
      ) : (
        <Image systemName="heart.fill" font="footnote" foregroundStyle="systemPink" />
      )}
    </HStack>
  )
}

// ---- 底部存储信息 ----

export function StorageFooter({ downloadedCount, bytes }: { downloadedCount: number; bytes: number }) {
  const mb = bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : "0 MB"
  return (
    <HStack spacing={5} padding={{ vertical: 6 }}>
      <Spacer />
      <Image systemName="internaldrive" font="caption2" foregroundStyle="tertiaryLabel" />
      <Text font="caption" foregroundStyle="tertiaryLabel">
        {`已下载 ${downloadedCount} 首 · 占用 ${mb}`}
      </Text>
      <Spacer />
    </HStack>
  )
}
