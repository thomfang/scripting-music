import { Image, ZStack, Rectangle, useState, useEffect } from "scripting"
import { usePlayerState } from "../../class/player_state"

/**
 * 前景专辑封面。播放时放大、暂停时缩小（scaleEffect + smooth 动画），
 * 营造「黑胶/唱片」呼吸感。无封面时回退到 music.note 占位。
 */
export function Cover() {
  const { currentMusic, isPlaying } = usePlayerState()
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  const fallback = (
    <ZStack>
      <Rectangle fill={"rgba(255,255,255,0.06)"} />
      <Image
        systemName="music.note"
        font={64}
        foregroundStyle={"rgba(255,255,255,0.55)"}
        symbolRenderingMode={"monochrome"}
      />
    </ZStack>
  )

  const scale = isPlaying ? 1 : 0.86

  if (currentMusic?.cover_url && !coverError) {
    return (
      <Image
        imageUrl={currentMusic.cover_url}
        resizable={true}
        scaleToFill={true}
        onError={() => setCoverError(true)}
        placeholder={fallback}
        scaleEffect={scale}
        animation={{ animation: Animation.smooth({ duration: 0.45 }), value: isPlaying }}
      />
    )
  }

  return (
    <ZStack
      scaleEffect={scale}
      animation={{ animation: Animation.smooth({ duration: 0.45 }), value: isPlaying }}
    >
      {fallback}
    </ZStack>
  )
}

const FALLBACK_GRADIENT = {
  gradient: {
    colors: ["#3A1530", "#1A0A18", "#000000"],
    startPoint: "top",
    endPoint: "bottom",
  },
} as any

// 自上而下的暗色遮罩，保证前景文字在任意封面上可读
const DARK_OVERLAY = {
  gradient: {
    colors: ["rgba(0,0,0,0.25)", "rgba(0,0,0,0.55)", "rgba(0,0,0,0.92)"],
    startPoint: "top",
    endPoint: "bottom",
  },
} as any

/**
 * 全屏模糊封面背景（Apple Music / Spotify 风格）：
 * 放大的封面 + 重高斯模糊 + 暗色渐变遮罩。无封面时回退到 粉→黑 渐变。
 */
export function CoverBackground() {
  const { currentMusic } = usePlayerState()
  const [coverError, setCoverError] = useState(false)

  useEffect(() => { setCoverError(false) }, [currentMusic?.id])

  if (currentMusic?.cover_url && !coverError) {
    return (
      <ZStack>
        <Image
          imageUrl={currentMusic.cover_url}
          resizable={true}
          scaleToFill={true}
          onError={() => setCoverError(true)}
          placeholder={<Rectangle fill={FALLBACK_GRADIENT} />}
          blur={48}
          scaleEffect={1.5}
        />
        <Rectangle fill={DARK_OVERLAY} />
      </ZStack>
    )
  }

  return (
    <ZStack>
      <Rectangle fill={FALLBACK_GRADIENT} />
      <Rectangle fill={DARK_OVERLAY} />
    </ZStack>
  )
}
