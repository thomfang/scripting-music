import { Button, HStack, Image, Text, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"

const PLACEHOLDER_ARTIST = "未知艺术家"
const PLACEHOLDER_ALBUM = "未知专辑"

function isRealValue(v: string | undefined | null, placeholder: string): v is string {
  const s = (v ?? "").trim()
  return !!s && s !== placeholder
}

/**
 * 播放页标题区（纯展示 + 可选跳转回调）。
 *
 * @param compact     歌词展开态：仅标题 + 艺人，省略专辑行，缩小字号。
 * @param onArtistTap 传入且艺人名非占位时，艺人名变可点（跳该艺人详情页）。
 * @param onAlbumTap  传入且专辑名非占位时，显示并点击专辑名（跳该专辑详情页）。
 */
export function Title({
  compact = false,
  onArtistTap,
  onAlbumTap,
  padding,
}: {
  compact?: boolean
  onArtistTap?: () => void
  onAlbumTap?: () => void
  padding?: { top?: number, bottom?: number, leading?: number, trailing?: number, horizontal?: number, vertical?: number }
} = {}) {
  const { currentMusic } = usePlayerState()
  const artist = currentMusic?.artist
  const album = currentMusic?.album
  const artistTappable = !!onArtistTap && isRealValue(artist, PLACEHOLDER_ARTIST)
  const albumTappable = !!onAlbumTap && isRealValue(album, PLACEHOLDER_ALBUM)
  const showAlbum = !compact && isRealValue(album, PLACEHOLDER_ALBUM)

  const artistText = (
    <Text
      foregroundStyle={artistTappable ? "white" : "rgba(255,255,255,0.75)"}
      font={compact ? "footnote" : "subheadline"}
      fontWeight={"medium"}
      lineLimit={1}
      frame={{ maxWidth: "infinity", alignment: "leading" }}
    >
      {artist ?? ""}
    </Text>
  )

  return (
    <VStack alignment={"leading"} spacing={compact ? 2 : 4} frame={{ maxWidth: "infinity", alignment: "leading" }} padding={padding}>
      <Text
        font={compact ? "headline" : "title2"}
        fontWeight={"bold"}
        foregroundStyle={"white"}
        lineLimit={1}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {currentMusic?.title ?? "未播放"}
      </Text>

      {/* 艺人：可点则包 Button，否则纯文本（保留原样式） */}
      {artistTappable ? (
        <Button action={onArtistTap!} buttonStyle="plain">
          <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }} contentShape="rect">
            {artistText}
            <Image systemName="chevron.right" font="caption2" foregroundStyle="rgba(255,255,255,0.55)" />
          </HStack>
        </Button>
      ) : (
        artistText
      )}

      {/* 专辑：仅非 compact 且非占位时显示，可点则包 Button */}
      {showAlbum && (
        albumTappable ? (
          <Button action={onAlbumTap!} buttonStyle="plain">
            <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }} contentShape="rect">
              <Image systemName="square.stack" font="caption2" foregroundStyle="rgba(255,255,255,0.6)" />
              <Text font="footnote" fontWeight="medium" foregroundStyle="rgba(255,255,255,0.7)" lineLimit={1}>
                {album}
              </Text>
              <Image systemName="chevron.right" font="caption2" foregroundStyle="rgba(255,255,255,0.5)" />
            </HStack>
          </Button>
        ) : (
          <HStack spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
            <Image systemName="square.stack" font="caption2" foregroundStyle="rgba(255,255,255,0.6)" />
            <Text font="footnote" fontWeight="medium" foregroundStyle="rgba(255,255,255,0.7)" lineLimit={1}>
              {album}
            </Text>
          </HStack>
        )
      )}
    </VStack>
  )
}
