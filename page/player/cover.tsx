import { Image, ZStack, Rectangle, useState, useEffect, VirtualNode, Color } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { useResolvedCover } from "./use_cover"
import { useCoverPalette, CoverPalette, DEFAULT_PALETTE } from "./cover_palette"

/**
 * 前景专辑封面。
 *
 * 布局兼容：外层是【固定边长的正方形盒子】(`size`×`size`)，内部图片 `scaleToFill` 填满并
 * 被 `clipShape` 圆角矩形裁掉溢出 → 任意比例封面(横图/竖图)都中心裁成正方形，永不横向溢出。
 * （正方形盒子必须给明确边长：aspectRatio 加在无内在尺寸的填充容器上会塌成 0。）
 *
 * 交互：播放时满幅、暂停时收一点（scaleEffect + smooth），营造「黑胶/唱片」呼吸感。
 * Hero：可选 `matchedGeometryEffect` 让大/小封面在展开/收起间平滑缩放位移。
 * 无封面时回退到 music.note 占位。
 *
 * @param size     正方形边长（大封面=屏宽-48；歌词展开小封面=56）。
 * @param cornerRadius 圆角。
 * @param shadow   投影。
 * @param matchedGeometryEffect Hero 动画绑定（{id, namespace}）。
 */
export function Cover({
  size,
  cornerRadius = 14,
  shadow,
  matchedGeometryEffect,
}: {
  size: number
  cornerRadius?: number
  shadow?: { color: Color, radius: number, x?: number, y?: number }
  matchedGeometryEffect?: { id: string | number, namespace: NamespaceID }
} ) {
  const { currentMusic, isPlaying } = usePlayerState()
  const { localImage, remoteUrl } = useResolvedCover(currentMusic)
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  const fallback = (
    <ZStack frame={{ width: size, height: size }}>
      <Rectangle fill={"rgba(255,255,255,0.12)"} />
      <Image
        systemName="music.note"
        font={Math.max(20, size * 0.28)}
        foregroundStyle={"rgba(255,255,255,0.75)"}
        symbolRenderingMode={"monochrome"}
      />
    </ZStack>
  )

  // 播放时满幅，暂停时收一点（更接近 Apple Music 的小幅缩放，而非明显变小）
  const scale = isPlaying ? 1 : 0.92
  const anim = { animation: Animation.smooth({ duration: 0.5 }), value: isPlaying }

  // 内部图层：已下载优先本地图件（与 mini player 一致）→ 远程 → 占位。
  let inner: VirtualNode
  if (localImage) {
    inner = (
      <Image
        image={localImage}
        resizable={true}
        scaleToFill={true}
        frame={{ width: size, height: size }}
      />
    )
  } else if (remoteUrl && !coverError) {
    inner = (
      <Image
        imageUrl={remoteUrl}
        resizable={true}
        scaleToFill={true}
        frame={{ width: size, height: size }}
        onError={() => setCoverError(true)}
        placeholder={fallback}
      />
    )
  } else {
    inner = fallback
  }

  // 正方形盒子：固定边长 → clip 圆角 → 投影 → 呼吸缩放 → Hero 绑定。
  return (
    <ZStack
      frame={{ width: size, height: size }}
      clipShape={{ type: "rect", cornerRadius }}
      shadow={shadow}
      scaleEffect={scale}
      animation={anim}
      matchedGeometryEffect={matchedGeometryEffect}
    >
      {inner}
    </ZStack>
  )
}

// ===== 动态背景 =====
//
// 历史背景：早期 Scripting 的 MeshGradient 桥接只能渲染【完全规整网格】，任何点位
// 偏移都会整块变黑；开发者已修复（经 preview_ui 实测：中心 0.5→0.52 及全点漂移
// 均能正常渲染且真实形变）。因此现在用【点位形变 + 色相漂移】结合方案：
//   • points：9 个顶点各自缓慢、异向地游走（多频正弦叠加）→ 液态形变；
//   • colors：9 个顶点 HSL 色相各自连续偏移 → 换色流动；
// 两者叠加，靠 useFlowPhase 高频（120ms）setState 驱动，得到 Apple Music iOS26 的液态质感。
// 角点内移可能露出网格外区域 → 用 mesh 的 background 兜底填充，杜绝黑边。

// 各顶点色相漂移速度（度/相位单位），正负混合 → 顶点之间异向流动。
const HUE_SPEED = [7, -5, 6, -4, 9, -6, 5, -7, 4]

// 多频正弦叠加：两个不同频率/相位的 sin 叠加（归一化到 ±amp），
// 得到「准周期、看似随机」的有机漂移，而非单一正弦的规律摆动。
function drift(t: number, seed: number, amp: number): number {
  return amp * (0.62 * Math.sin(t * 0.9 + seed) + 0.38 * Math.sin(t * 0.41 + seed * 2.3))
}

// 顶点色相：以调色板的 9 个基准色相为起点，HSL 色相随相位连续偏移（围绕各自基准色小幅摆动）。
// 调色板来自封面取色（useCoverPalette）；无封面时为 DEFAULT_PALETTE。
function colorsAt(p: number, pal: CoverPalette): string[] {
  return pal.hues.map((h, i) => {
    // 色相在基准值附近 ±18° 摆动（不跨色系，保持封面色调），而非环绕整个色相环。
    const hue = ((h + 18 * Math.sin(p * (HUE_SPEED[i] / 7) * 0.5 + i)) % 360 + 360) % 360
    const sat = pal.sat + 14 * Math.sin(p * 0.5 + i)
    const lig = pal.lig + 11 * Math.sin(p * 0.7 + i * 1.3)
    return `hsl(${hue.toFixed(1)}, ${clampPct(sat).toFixed(1)}%, ${clampPct(lig).toFixed(1)}%)`
  })
}

function clampPct(v: number) { return Math.max(6, Math.min(96, v)) }

// 顶点点位：【边界点钉在画框边上、只沿边切向滑动，中心点自由大幅游走】。
// 关键：四角 x/y 分别钉死在 0/1；边中点只动“沿边”那个分量（顶/底边只动 x，左/右边只动 y），
// 法向分量恒为 0/1 → mesh 四条边界始终紧贴画框，永不把内部拉进来露出兜底色。
// 形变由中心点（大幅）+ 边中点切向滑动共同制造，依然生动且零露边。
function pointsAt(p: number) {
  const a = 0.36 // 边中点切向振幅（加大，形变更明显）
  const c = 0.42 // 中心点振幅（最大游走）
  return [
    { x: 0, y: 0 },                                   // 左上角（钉死）
    { x: 0.5 + drift(p, 0.0, a), y: 0 },              // 上边中点：只沿 x
    { x: 1, y: 0 },                                   // 右上角（钉死）
    { x: 0, y: 0.5 + drift(p, 1.3, a) },             // 左边中点：只沿 y
    { x: 0.5 + drift(p, 2.1, c), y: 0.5 + drift(p, 4.7, c) }, // 中心：自由
    { x: 1, y: 0.5 + drift(p, 2.6, a) },             // 右边中点：只沿 y
    { x: 0, y: 1 },                                   // 左下角（钉死）
    { x: 0.5 + drift(p, 3.9, a), y: 1 },             // 下边中点：只沿 x
    { x: 1, y: 1 },                                   // 右下角（钉死）
  ]
}

// 规整 3×3 网格（暂停/初始静止态）。
const STATIC_POINTS = [
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 0, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
]

// 静止回退网格（暂停/初始态）。用默认调色板的 phase=0 配色（无封面时的观感）。
const MESH_FALLBACK = {
  width: 3,
  height: 3,
  points: STATIC_POINTS,
  colors: colorsAt(0, DEFAULT_PALETTE),
  smoothsColors: true,
} as any

// 根据相位 + 调色板计算「流动」网格：points 形变 + colors 换色 双重叠加。
function meshFromPhase(p: number, pal: CoverPalette) {
  const colors = colorsAt(p, pal)
  return {
    width: 3,
    height: 3,
    points: pointsAt(p),
    colors,
    // 角点内移露出的网格外区域用中心附近色兜底，杜绝黑边/漏底。
    background: colors[4],
    smoothsColors: true,
  } as any
}

// 播放时持续推进相位，暂停时冻结（停掉循环，相位保持）。
// 没有播放器音量/电平 API（AVPlayer 不暴露 metering），故用时间驱动的环境流动代替声音反应。
//
// 高频小步推进：每 FLOW_TICK_MS 重算一次 mesh（点位+色相），靠密集重绘形成连续平滑的液态流动。
const FLOW_TICK_MS = 120
const FLOW_STEP = 0.11 // 每 tick 相位推进量（提高流动速度，更明显）
function useFlowPhase(active: boolean): number {
  const [phase, setPhase] = useState(0)
  useEffect(() => {
    if (!active) return
    let cancelled = false
    let timer = 0
    const tick = () => {
      if (cancelled) return
      setPhase(p => p + FLOW_STEP)
      timer = setTimeout(tick, FLOW_TICK_MS)
    }
    timer = setTimeout(tick, FLOW_TICK_MS)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [active])
  return phase
}

/**
 * 流动 Mesh 层（独立组件）。
 * 把高频 phase setState 隔离在这里——只重渲染这一个 Rectangle，
 * 不触发父级 CoverBackground 里昂贵的模糊封面 Image 重建（blur=60/scale=1.6）。
 * 播放：每 120ms 重算点位形成连续流动；暂停：冻结在规整网格。
 */
function FlowingMesh({ active, opacity, palette }: { active: boolean, opacity: number, palette: CoverPalette }) {
  const phase = useFlowPhase(active)
  const mesh = active ? meshFromPhase(phase, palette) : meshFromPhase(0, palette)
  return <Rectangle fill={mesh} opacity={opacity} />
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
  const palette = useCoverPalette(currentMusic)
  const [coverError, setCoverError] = useState(false)

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
        <FlowingMesh active={isPlaying} opacity={0.52} palette={palette} />
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
        {/* 柔和彩色网格叠加，注入 iOS26 的液态光晕（随播放流动） */}
        <FlowingMesh active={isPlaying} opacity={0.52} palette={palette} />
        <Rectangle fill={SCRIM} />
      </ZStack>
    )
  }

  return (
    <ZStack>
      <FlowingMesh active={isPlaying} opacity={1} palette={palette} />
      <Rectangle fill={SCRIM} />
    </ZStack>
  )
}
