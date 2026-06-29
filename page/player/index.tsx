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
      {/* 全屏动态背景（MeshGradient / 模糊封面） */}
      <CoverBackground
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
      />

      <VStack
        spacing={0}
        modifiers={modifiers().padding({ leading: 24, trailing: 24 })}
      >
        <Capsule
          fill={"rgba(255,255,255,0.5)"}
          frame={{ width: 38, height: 5 }}
          padding={{ top: 10, bottom: 20 }}
        />

        {/* 专辑封面：大尺寸方形 + 柔和投影 */}
        <Cover
          frame={{ maxWidth: "infinity", maxHeight: 320 }}
          aspectRatio={{ value: 1, contentMode: "fit" }}
          clipShape={{ type: "rect", cornerRadius: 14 }}
          shadow={{ color: "rgba(0,0,0,0.45)", radius: 30, y: 14 }}
        />

        {/* 标题 + 进度条（紧跟封面，如 Apple Music） */}
        <Title padding={{ top: 24 }} />
        <ProgressSlider padding={{ top: 14 }} />

        {/* 歌词占据弹性中间区 */}
        <Spacer />
        <Lyric />
        <Spacer />

        {/* 控制区：传输行 + 工具行 */}
        <Control padding={{ top: 8, bottom: 20 }} />
      </VStack>
    </ZStack>
  )
}
