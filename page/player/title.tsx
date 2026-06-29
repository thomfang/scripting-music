import { ScrollView, Text, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"

export function Title() {
  const { currentMusic } = usePlayerState()
  return (
    <ScrollView lineLimit={1} frame={{ height: 64 }} axes={"horizontal"}>
      <VStack alignment={"leading"} padding={{ top: 8, bottom: 8 }}>
        <Text font={"title2"} fontWeight={"medium"}>
          {currentMusic?.title ?? "未播放"}
        </Text>
        <Text foregroundStyle={"secondaryLabel"} font={"subheadline"}>
          {currentMusic?.artist ?? ""}
        </Text>
      </VStack>
    </ScrollView>
  )
}