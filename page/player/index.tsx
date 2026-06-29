import { Capsule, Spacer, VStack, ZStack, modifiers } from "scripting"
import { Cover, CoverBackground } from "./cover"
import { Title } from "./title"
import { ProgressSlider } from "./slider"
import { Control } from "./control"
import { Lyric } from "./lyric"
import { PlayerProgressProvider, usePlayerState } from "../../class/player_state"

export function PlayerView() {
  return <PlayerProgressProvider><PlayerPage /></PlayerProgressProvider>
}

function PlayerPage() {
  // 用当前歌曲 id 作为 Lyric 的 key：歌曲身份变化时强制重挂载，
  // 确保「播放一段时间后再打开播放页」时歌词按当前歌可靠拉取。
  const { currentMusic } = usePlayerState()
  return (
    <ZStack>
      {/* 全屏动态背景（MeshGradient / 模糊封面） */}
      <CoverBackground
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
      />

      {/* 根 VStack 显式钉在屏幕宽度内。
          重要：sheet 会向内容提出「无限宽」布局，`maxWidth:"infinity"` 并不会把 VStack 钉在屏宽，
          于是长歌词行的 ideal 单行宽会把整列撑宽、左右对称被裁。用显式 `width: 屏宽` 才能钉住。 */}
      <VStack
        spacing={0}
        frame={{ width: Device.screen.width }}
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
        <Lyric key={currentMusic?.id ?? "none"} />
        <Spacer />

        {/* 控制区：传输行 + 工具行 */}
        <Control padding={{ top: 8, bottom: 20 }} />
      </VStack>
    </ZStack>
  )
}
