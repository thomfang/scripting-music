import { GlassEffectContainer, VStack } from "scripting"
import { MiniPlayer } from "../components/mini_player"
import { makeConcentricMiniPlayerGeometry, supportsLiquidGlass } from "../home_screen_model"

const HORIZONTAL_MARGIN = 12
const BOTTOM_MARGIN = 10
const GEOMETRY = makeConcentricMiniPlayerGeometry(28, 8)

export const HOME_MINI_PLAYER_RESERVED_HEIGHT = 66

/** Home Tab 专用的悬浮 MiniPlayer 外壳；播放内容继续复用全局 MiniPlayer。 */
export function HomeMiniPlayerContainer({ onOpenPlayer }: { onOpenPlayer: () => void }) {
  const content = (
    <MiniPlayer
      onOpenPlayer={onOpenPlayer}
      contentInset={GEOMETRY.contentInset}
      coverCornerRadius={GEOMETRY.coverRadius}
    />
  )

  const floating = supportsLiquidGlass(Device.systemVersion)
    ? (
      <GlassEffectContainer spacing={8}>
        <VStack
          spacing={0}
          frame={{ maxWidth: "infinity" }}
          glassEffect={{
            glass: UIGlass.regular().interactive(),
            shape: { type: "rect", cornerRadius: GEOMETRY.outerRadius }
          }}
        >
          {content}
        </VStack>
      </GlassEffectContainer>
    )
    : (
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity" }}
        background="secondarySystemBackground"
        clipShape={{ type: "rect", cornerRadius: GEOMETRY.outerRadius }}
        shadow={{ color: "rgba(0,0,0,0.16)", radius: 12, y: 5 }}
      >
        {content}
      </VStack>
    )

  // 外层 padding 最后应用，确保玻璃形状本身先成型，再与屏幕和宿主 Tab Bar 拉开距离。
  return (
    <VStack
      spacing={0}
      tint="systemPink"
      padding={{ horizontal: HORIZONTAL_MARGIN, bottom: BOTTOM_MARGIN }}
    >
      {floating}
    </VStack>
  )
}
