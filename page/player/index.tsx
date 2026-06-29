import { Capsule, Spacer, VStack, ZStack, modifiers, useState } from "scripting"
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
  // 歌词展开态：点击歌词区切换。展开时收起封面、放大歌词。
  const [lyricExpanded, setLyricExpanded] = useState(false)

  const coverMaxHeight = lyricExpanded ? 0 : 320
  const lyricHeight = lyricExpanded ? Math.round(Device.screen.height * 0.46) : 150
  const expandAnim = { animation: Animation.smooth({ duration: 0.45 }), value: lyricExpanded }

  return (
    <ZStack>
      {/* 全屏动态背景（MeshGradient / 模糊封面） */}
      <CoverBackground
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        ignoresSafeArea={true}
      />

      {/* 根 VStack 显式钉在「屏宽 - 左右24*2」的宽度，在 ZStack 里居中 → 自动左右各 24pt 边距。
          （不用 padding：sheet 提无限宽时 frame+padding 的 modifier 顺序会让 padding 加在外侧被裁，
          直接收窄 width 最可靠，标题/进度条不再贴容器边缘。） */}
      <VStack
        spacing={0}
        frame={{ width: Device.screen.width - 48 }}
        modifiers={modifiers().padding({ top: 8 })}
      >
        <Capsule
          fill={"rgba(255,255,255,0.5)"}
          frame={{ width: 38, height: 5 }}
          padding={{ top: 10, bottom: 20 }}
        />

        {/* 专辑封面：大尺寸方形 + 柔和投影；歌词展开时收起（高度→0 + 淡出） */}
        <Cover
          frame={{ maxWidth: "infinity", maxHeight: coverMaxHeight }}
          aspectRatio={{ value: 1, contentMode: "fit" }}
          clipShape={{ type: "rect", cornerRadius: 14 }}
          shadow={{ color: "rgba(0,0,0,0.45)", radius: 30, y: 14 }}
          opacity={lyricExpanded ? 0 : 1}
          animation={expandAnim}
        />

        {/* 标题 + 进度条（紧跟封面，如 Apple Music） */}
        <Title padding={{ top: lyricExpanded ? 8 : 24 }} animation={expandAnim} />
        <ProgressSlider padding={{ top: 14 }} />

        {/* 歌词占据弹性中间区，点击切换放大/收起 */}
        <Spacer />
        <Lyric
          key={currentMusic?.id ?? "none"}
          height={lyricHeight}
          onToggle={() => setLyricExpanded(v => !v)}
          animation={expandAnim}
        />
        <Spacer />

        {/* 控制区：传输行 + 工具行 */}
        <Control padding={{ top: 8, bottom: 20 }} />
      </VStack>
    </ZStack>
  )
}
