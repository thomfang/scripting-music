import { Text, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"

export function Title({ compact = false }: { compact?: boolean } = {}) {
  const { currentMusic } = usePlayerState()
  return (
    <VStack alignment={"leading"} spacing={compact ? 2 : 4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text
        font={compact ? "headline" : "title2"}
        fontWeight={"bold"}
        foregroundStyle={"white"}
        lineLimit={1}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {currentMusic?.title ?? "未播放"}
      </Text>
      <Text
        foregroundStyle={"rgba(255,255,255,0.75)"}
        font={compact ? "footnote" : "subheadline"}
        fontWeight={"medium"}
        lineLimit={1}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {currentMusic?.artist ?? ""}
      </Text>
    </VStack>
  )
}
