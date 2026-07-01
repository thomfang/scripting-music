import { Image, ZStack, Rectangle, useState, useEffect } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { useResolvedCover } from "./use_cover"

/**
 * 前景专辑封面。播放时放大、暂停时缩小（scaleEffect + smooth 动画），
 * 营造「黑胶/唱片」呼吸感。无封面时回退到 music.note 占位。
 */
export function Cover() {
  const { currentMusic, isPlaying } = usePlayerState()
  const { localImage, remoteUrl } = useResolvedCover(currentMusic)
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  const fallback = (
    <ZStack>
      <Rectangle fill={"rgba(255,255,255,0.12)"} />
      <Image
        systemName="music.note"
        font={72}
        foregroundStyle={"rgba(255,255,255,0.75)"}
        symbolRenderingMode={"monochrome"}
      />
    </ZStack>
  )

  // 播放时满幅，暂停时收一点（更接近 Apple Music 的小幅缩放，而非明显变小）
  const scale = isPlaying ? 1 : 0.92
  const anim = { animation: Animation.smooth({ duration: 0.5 }), value: isPlaying }

  // 已下载优先本地图件（与 mini player 一致）
  if (localImage) {
    return (
      <Image
        image={localImage}
        resizable={true}
        scaleToFill={true}
        scaleEffect={scale}
        animation={anim}
      />
    )
  }

  if (remoteUrl && !coverError) {
    return (
      <Image
        imageUrl={remoteUrl}
        resizable={true}
        scaleToFill={true}
        onError={() => setCoverError(true)}
        placeholder={fallback}
        scaleEffect={scale}
        animation={anim}
      />
    )
  }

  return (
    <ZStack
      scaleEffect={scale}
      animation={anim}
    >
      {fallback}
    </ZStack>
  )
}

// ===== 动态背景 =====

// MeshGradient 颜色（Apple Music iOS26 的彩色「液态」质感）：紫/品红/暖橙/靛蓝交织。
const MESH_COLORS = [
  "#7B2FF7", "#E0359E", "#FF6F61",
  "#5B6CFF", "#C13EC8", "#FF8A5B",
  "#2E2A7A", "#6E2C8F", "#B23A6E",
]

// 静态网格（暂停/初始态）：3×3 规整网格。
const STATIC_POINTS = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
]

const MESH_FALLBACK = {
  width: 3,
  height: 3,
  points: STATIC_POINTS,
  colors: MESH_COLORS,
  smoothsColors: true,
} as any

// 根据相位计算「流动」网格：四角钉死（避免边缘露背景色），
// 边中点与中心点用不同相位的正弦波轻微游走 → 整体像极光/液体流动。
function meshFromPhase(p: number) {
  const a = 0.16 // 边中点振幅
  const c = 0.12 // 中心点振幅
  return {
    width: 3,
    height: 3,
    points: [
      { x: 0, y: 0 },
      { x: 0.5 + a * Math.sin(p), y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 0.5 + a * Math.sin(p + 1.3) },
      { x: 0.5 + c * Math.sin(p * 0.9 + 0.5), y: 0.5 + c * Math.cos(p * 1.1) },
      { x: 1, y: 0.5 + a * Math.sin(p + 2.6) },
      { x: 0, y: 1 },
      { x: 0.5 + a * Math.sin(p + 3.9), y: 1 },
      { x: 1, y: 1 },
    ],
    colors: MESH_COLORS,
    smoothsColors: true,
  } as any
}

// 播放时持续推进相位，暂停时冻结（停掉 interval，相位保持）。
// 没有播放器音量/电平 API（AVPlayer 不暴露 metering），故用时间驱动的环境流动代替声音反应。
function useFlowPhase(active: boolean): number {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setPhase(p => p + 0.7), 1600)
    return () => clearInterval(timer)
  }, [active])
  return phase
}

// 竖向暗角：顶部轻微变暗(保 handle 可读)，底部明显加深——
// 因为模糊封面可能是亮色(如雪景)，底部白色控件/进度/时间会消失，
// 所以底部加足暗度保证任意封面下控件都清晰。
const SCRIM = {
  colors: [
    "rgba(0,0,0,0.34)",
    "rgba(0,0,0,0.06)",
    "rgba(0,0,0,0.28)",
    "rgba(0,0,0,0.62)",
    "rgba(0,0,0,0.82)",
  ],
  startPoint: "top",
  endPoint: "bottom",
} as any

/**
 * 全屏动态背景（Apple Music iOS26 风格）：
 * - 有封面：放大模糊封面（保留封面真实色彩、明亮）+ 叠一层流动 MeshGradient 增色 + 轻量暗角。
 * - 无封面：流动彩色 MeshGradient。
 * 播放时 Mesh 持续缓慢流动，暂停冻结。
 */
export function CoverBackground() {
  const { currentMusic, isPlaying } = usePlayerState()
  const { localImage, remoteUrl } = useResolvedCover(currentMusic)
  const [coverError, setCoverError] = useState(false)
  const phase = useFlowPhase(isPlaying)
  const mesh = isPlaying ? meshFromPhase(phase) : MESH_FALLBACK
  const meshAnim = { animation: Animation.smooth({ duration: 1.6 }), value: phase }

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  // 已下载优先本地图件（与 mini player / 前景 Cover 一致）
  if (localImage) {
    return (
      <ZStack>
        <Image
          image={localImage}
          resizable={true}
          scaleToFill={true}
          blur={60}
          scaleEffect={1.6}
        />
        <Rectangle fill={mesh} opacity={0.28} animation={meshAnim} />
        <Rectangle fill={SCRIM} />
      </ZStack>
    )
  }

  if (remoteUrl && !coverError) {
    return (
      <ZStack>
        <Image
          imageUrl={remoteUrl}
          resizable={true}
          scaleToFill={true}
          onError={() => setCoverError(true)}
          placeholder={<Rectangle fill={MESH_FALLBACK} />}
          blur={60}
          scaleEffect={1.6}
        />
        {/* 柔和彩色网格叠加，注入 iOS26 的液态光晕（低透明度，随播放流动） */}
        <Rectangle fill={mesh} opacity={0.28} animation={meshAnim} />
        <Rectangle fill={SCRIM} />
      </ZStack>
    )
  }

  return (
    <ZStack>
      <Rectangle fill={mesh} animation={meshAnim} />
      <Rectangle fill={SCRIM} />
    </ZStack>
  )
}
