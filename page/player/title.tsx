import { Text, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"

export function Title() {
  const { currentMusic } = usePlayerState()
  return (
    <VStack alignment={"leading"} spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text
        font={"title2"}
        fontWeight={"bold"}
        foregroundStyle={"white"}
        lineLimit={1}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {currentMusic?.title ?? "未播放"}
      </Text>
      <Text
        foregroundStyle={"rgba(255,255,255,0.75)"}
        font={"subheadline"}
        fontWeight={"medium"}
        lineLimit={1}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {currentMusic?.artist ?? ""}
      </Text>
    </VStack>
  )
}
