import { HStack, VStack, Text, Image } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { useResolvedCover } from "../player/use_cover"

export function PlayerInfo() {
  const { currentMusic } = usePlayerState()
  const { localImage, remoteUrl } = useResolvedCover(currentMusic)

  const placeholder = (
    <Image
      systemName="music.note"
      frame={{ width: 40, height: 40 }}
      foregroundStyle="secondaryLabel"
      background="secondarySystemFill"
      clipShape={{ type: "rect", cornerRadius: 6 }}
    />
  )

  if (!currentMusic) return (
    <HStack spacing={10}>
      {placeholder}
      <Text font="subheadline" foregroundStyle="secondaryLabel">未在播放</Text>
    </HStack>
  )

  let coverView: JSX.Element
  if (localImage) {
    coverView = (
      <Image
        image={localImage}
        resizable={true}
        frame={{ width: 40, height: 40 }}
        clipShape={{ type: "rect", cornerRadius: 6 }}
      />
    )
  } else if (remoteUrl) {
    coverView = (
      <Image
        key={remoteUrl}
        imageUrl={remoteUrl}
        resizable={true}
        frame={{ width: 40, height: 40 }}
        clipShape={{ type: "rect", cornerRadius: 6 }}
        placeholder={placeholder}
      />
    )
  } else {
    coverView = placeholder
  }

  return (
    <HStack spacing={10}>
      {coverView}
      <VStack alignment="leading" spacing={2}>
        <Text font="subheadline" bold={true} lineLimit={1}>{currentMusic.title}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{currentMusic.artist}</Text>
      </VStack>
    </HStack>
  )
}