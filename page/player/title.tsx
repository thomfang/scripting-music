import { ScrollView, Text, VStack } from "scripting"
import { usePlayerState } from "../../class/player_state"

export function Title() {
  const { currentMusic } = usePlayerState()
  return (
    <VStack alignment={"leading"} spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <ScrollView lineLimit={1} axes={"horizontal"} showsIndicators={false}>
        <Text font={"title"} fontWeight={"bold"} foregroundStyle={"white"}>
          {currentMusic?.title ?? "未播放"}
        </Text>
      </ScrollView>
      <Text foregroundStyle={"rgba(255,255,255,0.7)"} font={"subheadline"} fontWeight={"medium"}>
        {currentMusic?.artist ?? ""}
      </Text>
    </VStack>
  )
}
