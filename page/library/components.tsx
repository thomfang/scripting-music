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
  useEffect, useObservable, useState,
} from "scripting"
import { Music, Playlist } from "../../class/database"
import { fileManager } from "../../class/file_manager"
import { artistInfo } from "../../class/sources/artist_info"
import { albumInfo } from "../../class/sources/album_info"

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
  // 宫格是 LazyVGrid，内嵌 NavigationLink 会命中区串扰（点一个触发全部）。
  // 改用 Button + 每卡独立的 navigationDestination/observable：destination 固定、无共享 state、无竞态。
  const presented = useObservable(false)
  return (
    <Button
      action={() => presented.setValue(true)}
      buttonStyle="plain"
      navigationDestination={{ isPresented: presented, content: entry.destination }}
    >
      <HStack
        spacing={10}
        padding={{ horizontal: 12, vertical: 13 }}
        background="secondarySystemBackground"
        clipShape={{ type: "rect", cornerRadius: 14 }}
        contentShape={{ type: "rect", cornerRadius: 14 } as any}
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
        <Image systemName="chevron.right" font="caption2" foregroundStyle="tertiaryLabel" />
      </HStack>
    </Button>
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

// ---- 封面拼图（播放列表）----

/** 单格封面：本地优先 → 远程回退 → 占位。size 为该格边长。 */
function CoverTile({ music, size }: { music?: Music, size: number }) {
  const [remoteError, setRemoteError] = useState(false)
  const [localExists, setLocalExists] = useState<boolean | null>(null)

  useEffect(() => {
    let alive = true
    if (!music) { setLocalExists(false); return }
    fileManager.coverExists(music.id)
      .then(e => { if (alive) setLocalExists(e) })
      .catch(() => { if (alive) setLocalExists(false) })
    return () => { alive = false }
  }, [music?.id])

  const showLocal = music && localExists === true
  const showRemote = music && localExists === false && !!music.cover_url && !remoteError

  if (showLocal) {
    return (
      <Image
        filePath={fileManager.getCoverPath(music!.id)}
        resizable={true}
        scaleToFill={true}
        frame={{ width: size, height: size }}
        clipped={true}
      />
    )
  }
  if (showRemote) {
    return (
      <Image
        imageUrl={music!.cover_url!}
        resizable={true}
        scaleToFill={true}
        frame={{ width: size, height: size }}
        clipped={true}
        onError={() => setRemoteError(true)}
        placeholder={<Image systemName="music.note" tint="tertiaryLabel" frame={{ width: size, height: size }} background="secondarySystemBackground" />}
      />
    )
  }
  return (
    <Image
      systemName="music.note"
      font="body"
      tint="tertiaryLabel"
      frame={{ width: size, height: size }}
      background="tertiarySystemBackground"
    />
  )
}

export type CoverCollageProps = {
  /** 已按 position 排序的歌单歌曲（至少传前 4 首即可） */
  musics: Music[]
  /** 整体边长 */
  size: number
  cornerRadius?: number
  shadow?: boolean
  /** 高斯模糊半径（用作模糊 banner 背景时） */
  blur?: number
}

/**
 * 播放列表封面拼图：
 * - ≥4 首 → 2×2 四宫格（前 4 首封面）
 * - 1–3 首 → 单张（第 1 首）
 * - 0 首 → 占位图标
 */
export function CoverCollage({ musics, size, cornerRadius = 12, shadow = true, blur }: CoverCollageProps) {
  const shadowProp = shadow ? { color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 } : undefined
  const clip = { type: "rect", cornerRadius } as any

  if (musics.length === 0) {
    return (
      <Image
        systemName="music.note.list"
        font="largeTitle"
        tint="secondaryLabel"
        frame={{ width: size, height: size }}
        background="secondarySystemBackground"
        clipShape={clip}
        shadow={shadowProp}
        blur={blur}
      />
    )
  }

  if (musics.length < 4) {
    return (
      <ZStack frame={{ width: size, height: size }} clipShape={clip} shadow={shadowProp} blur={blur}>
        <CoverTile music={musics[0]} size={size} />
      </ZStack>
    )
  }

  const half = size / 2
  const four = musics.slice(0, 4)
  return (
    <VStack spacing={0} frame={{ width: size, height: size }} clipShape={clip} shadow={shadowProp} blur={blur}>
      <HStack spacing={0}>
        <CoverTile music={four[0]} size={half} />
        <CoverTile music={four[1]} size={half} />
      </HStack>
      <HStack spacing={0}>
        <CoverTile music={four[2]} size={half} />
        <CoverTile music={four[3]} size={half} />
      </HStack>
    </VStack>
  )
}

// ---- 横向卡片栏容器 ----

/** 统一的横向卡片栏：放在一个 listRowInsets=0 的 Section 内。 */
export function HorizontalCardRail({ children }: { children: (JSX.Element | null)[] | JSX.Element }) {
  // 调用方负责包 ScrollView axes=horizontal（List row 形态由调用处控制）。
  return (
    <HStack spacing={14} padding={{ horizontal: 16, vertical: 6 }}>
      {children}
    </HStack>
  )
}

// ---- 艺人圆形卡 ----

export function ArtistCircleCard({ artist, count, destination }: { artist: string, count: number, destination: JSX.Element }) {
  const [thumb, setThumb] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    artistInfo.fetch(artist).then(info => {
      if (alive && info?.thumb) setThumb(info.thumb)
    }).catch(() => { })
    return () => { alive = false }
  }, [artist])

  const DIAM = 118
  const hasThumb = thumb && !failed
  return (
    <NavigationLink destination={destination}>
      <VStack spacing={7} frame={{ width: DIAM }}>
        {hasThumb ? (
          <Image
            imageUrl={thumb!}
            resizable={true}
            scaleToFill={true}
            frame={{ width: DIAM, height: DIAM }}
            clipShape="capsule"
            shadow={{ color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 }}
            onError={() => setFailed(true)}
            placeholder={<Image systemName="person.circle.fill" font={{ name: "system", size: DIAM }} tint="accentColor" frame={{ width: DIAM, height: DIAM }} />}
          />
        ) : (
          <Image systemName="person.circle.fill" font={{ name: "system", size: DIAM }} foregroundStyle="accentColor" frame={{ width: DIAM, height: DIAM }} />
        )}
        <Text font="subheadline" fontWeight="semibold" lineLimit={1} multilineTextAlignment="center" frame={{ width: DIAM }}>{artist}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{`${count} 首`}</Text>
      </VStack>
    </NavigationLink>
  )
}

// ---- 专辑封面卡 ----

export function AlbumCoverCard({ album, artist, musics, destination }: { album: string, artist: string, musics: Music[], destination: JSX.Element }) {
  const localCover = musics.find(m => m.cover_url)?.cover_url ?? null
  const [thumb, setThumb] = useState<string | null>(localCover)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let alive = true
    albumInfo.fetch(artist, album).then(info => {
      if (alive && info?.thumb) setThumb(info.thumb)
    }).catch(() => { })
    return () => { alive = false }
  }, [album, artist])

  const SIZE = 130
  const clip = { type: "rect", cornerRadius: 14 } as any
  const hasThumb = thumb && !failed
  return (
    <NavigationLink destination={destination}>
      <VStack alignment="leading" spacing={6} frame={{ width: SIZE }}>
        {hasThumb ? (
          <Image
            imageUrl={thumb!}
            resizable={true}
            scaleToFill={true}
            frame={{ width: SIZE, height: SIZE }}
            clipShape={clip}
            shadow={{ color: "rgba(0,0,0,0.22)", radius: 6, x: 0, y: 3 }}
            onError={() => setFailed(true)}
            placeholder={<Image systemName="square.stack.fill" font="largeTitle" tint="secondaryLabel" frame={{ width: SIZE, height: SIZE }} background="secondarySystemBackground" clipShape={clip} />}
          />
        ) : (
          <Image systemName="square.stack.fill" font="largeTitle" tint="secondaryLabel" frame={{ width: SIZE, height: SIZE }} background="secondarySystemBackground" clipShape={clip} />
        )}
        <Text font="subheadline" fontWeight="semibold" lineLimit={1} frame={{ width: SIZE }}>{album}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1} frame={{ width: SIZE }}>{artist}</Text>
      </VStack>
    </NavigationLink>
  )
}

// ---- 播放列表拼图卡 ----

export function PlaylistCollageCard({ playlist, musics, destination }: { playlist: Playlist, musics: Music[], destination: JSX.Element }) {
  const SIZE = 130
  return (
    <NavigationLink destination={destination}>
      <VStack alignment="leading" spacing={6} frame={{ width: SIZE }}>
        <CoverCollage musics={musics} size={SIZE} cornerRadius={14} />
        <Text font="subheadline" fontWeight="semibold" lineLimit={1} frame={{ width: SIZE }}>{playlist.name}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{`${playlist.music_count} 首`}</Text>
      </VStack>
    </NavigationLink>
  )
}
