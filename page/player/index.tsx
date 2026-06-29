import { Capsule, Spacer, VStack, modifiers } from "scripting"
import { Cover } from "./cover"
import { Title } from "./title"
import { ProgressSlider } from "./slider"
import { Control } from "./control"
import { Lyric } from "./lyric"
import { PlayerProgressProvider } from "../../class/player_state"

export function PlayerView() {
  return <PlayerProgressProvider><PlayerPage /></PlayerProgressProvider>
}

function PlayerPage() {
  return (
    <VStack
      modifiers={modifiers().padding({ leading: true, trailing: true })}
    >
      <Capsule
        fill={"tertiaryLabel"}
        frame={{ width: 40, height: 5 }}
        padding={{ top: 9, bottom: 16 }}
      />

      <Cover
        frame={{ maxWidth: "infinity", maxHeight: 320 }}
        clipShape={{ type: "rect", cornerRadius: 16 }}
        shadow={{ color: "gray", radius: 4, y: 1 }}
        padding={{ bottom: 24 }}
      />

      <Title />

      <Spacer /><Lyric padding={{ top: 8, bottom: 8 }} /><Spacer />

      <VStack padding={{ bottom: true }}>
        <ProgressSlider />
        <Control padding={{ top: true, bottom: true }} />
      </VStack>
    </VStack>
  )
}