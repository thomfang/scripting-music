import { Capsule, Spacer, VStack, ZStack, modifiers } from "scripting"
import { Cover, CoverBackground } from "./cover"
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
    <ZStack>
      {/* 模糊封面动态背景，铺满整个播放页 */}
      <CoverBackground
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
      />

      <VStack
        modifiers={modifiers().padding({ leading: true, trailing: true })}
      >
        <Capsule
          fill={"rgba(255,255,255,0.4)"}
          frame={{ width: 40, height: 5 }}
          padding={{ top: 9, bottom: 20 }}
        />

        <Cover
          frame={{ maxWidth: "infinity", maxHeight: 300 }}
          clipShape={{ type: "rect", cornerRadius: 18 }}
          shadow={{ color: "rgba(0,0,0,0.5)", radius: 24, y: 10 }}
          padding={{ bottom: 28 }}
        />

        <Title />

        <Spacer /><Lyric padding={{ top: 8, bottom: 8 }} /><Spacer />

        <VStack padding={{ bottom: true }} spacing={6}>
          <ProgressSlider />
          <Control padding={{ top: true, bottom: true }} />
        </VStack>
      </VStack>
    </ZStack>
  )
}
