import { ScrollView, ScrollViewReader, Text, VStack, useEffect, useState, useMemo } from "scripting"
import { usePlayerState, usePlayerProgress } from "../../class/player_state"
import { lyrics, LyricLine, LyricsResult } from "../../class/sources/lyrics"
import { fileManager } from "../../class/file_manager"

const LYRIC_HEIGHT = 150

export function Lyric() {
  const { currentMusic } = usePlayerState()
  const { currentTime } = usePlayerProgress()
  const [result, setResult] = useState<LyricsResult | null>(null)
  const [loading, setLoading] = useState(false)

  // 切歌时拉取歌词
  useEffect(() => {
    let alive = true
    setResult(null)
    if (!currentMusic) return
    setLoading(true)
    const musicId = currentMusic.id
    ;(async () => {
      try {
        // 本地优先：已下载的歌曲歌词与封面同生命周期存于本地
        const local = await fileManager.readLyrics<LyricsResult>(musicId)
        if (local && (local.synced?.length || local.plain)) {
          if (alive) setResult(local)
          return
        }
        // 在线兜底
        const r = await lyrics.fetchLyrics({
          title: currentMusic.title,
          artist: currentMusic.artist ?? "",
          album: currentMusic.album,
          duration: currentMusic.duration,
        })
        if (alive) setResult(r)
      } catch (e) {
        console.error("[歌词] 获取失败:", e)
        if (alive) setResult({ synced: null, plain: null })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [currentMusic?.id])

  // 当前高亮行：最后一个 time <= currentTime 的行
  const activeIndex = useMemo(() => {
    const synced = result?.synced
    if (!synced || synced.length === 0) return -1
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= currentTime) idx = i
      else break
    }
    return idx
  }, [result?.synced, currentTime])

  if (!currentMusic) {
    return <Placeholder text="暂无播放" />
  }
  if (loading && !result) {
    return <Placeholder text="加载歌词…" />
  }
  if (result?.synced && result.synced.length > 0) {
    return <SyncedLyric lines={result.synced} activeIndex={activeIndex} />
  }
  if (result?.plain) {
    return <PlainLyric text={result.plain} />
  }
  return <Placeholder text="暂无歌词" />
}

function Placeholder({ text }: { text: string }) {
  return (
    <VStack frame={{ width: "infinity", height: LYRIC_HEIGHT }} alignment="center">
      <Text foregroundStyle="rgba(255,255,255,0.5)" font="subheadline">{text}</Text>
    </VStack>
  )
}

function SyncedLyric({ lines, activeIndex }: { lines: LyricLine[]; activeIndex: number }) {
  return (
    <ScrollViewReader>
      {proxy => <SyncedLyricList proxy={proxy} lines={lines} activeIndex={activeIndex} />}
    </ScrollViewReader>
  )
}

function SyncedLyricList({
  proxy,
  lines,
  activeIndex,
}: {
  proxy: { scrollTo: (id: string | number, anchor?: any) => void }
  lines: LyricLine[]
  activeIndex: number
}) {
  // 高亮行变化时自动滚动到中间
  useEffect(() => {
    if (activeIndex >= 0) {
      proxy.scrollTo(activeIndex, "center")
    }
  }, [activeIndex])

  return (
    <ScrollView axes="vertical" frame={{ maxWidth: "infinity", height: LYRIC_HEIGHT }}>
      <VStack alignment="center" spacing={10} padding={{ top: 8, bottom: 8 }} frame={{ maxWidth: "infinity" }}>
        {lines.map((line, i) => (
          <LyricRow key={i} index={i} text={line.text} active={i === activeIndex} />
        ))}
      </VStack>
    </ScrollView>
  )
}

// 单行歌词：通过 id 标记供 scrollTo 定位（id 是通用 view 标识，TextProps 类型未列出 → as any）。
// active 变化时用 easeInOut 过渡颜色/字重/缩放，营造流畅的卡拉OK高亮效果。
function LyricRow({ index, text, active }: { index: number; text: string; active: boolean }) {
  const extraProps = {
    id: index,
    scaleEffect: active ? 1.06 : 1,
    animation: { animation: Animation.smooth({ duration: 0.3 }), value: active },
  } as any
  return (
    <Text
      {...extraProps}
      multilineTextAlignment="center"
      frame={{ maxWidth: "infinity" }}
      font={active ? "headline" : "subheadline"}
      fontWeight={active ? "bold" : "regular"}
      foregroundStyle={active ? "white" : "rgba(255,255,255,0.4)"}
    >
      {text || "♪"}
    </Text>
  )
}

function PlainLyric({ text }: { text: string }) {
  const linesArr = useMemo(() => text.split(/\r?\n/), [text])
  return (
    <ScrollView axes="vertical" frame={{ maxWidth: "infinity", height: LYRIC_HEIGHT }}>
      <VStack alignment="center" spacing={8} padding={{ top: 8, bottom: 8 }} frame={{ maxWidth: "infinity" }}>
        {linesArr.map((l, i) => (
          <Text
            key={i}
            multilineTextAlignment="center"
            frame={{ maxWidth: "infinity" }}
            font="subheadline"
            foregroundStyle="rgba(255,255,255,0.6)"
          >
            {l || " "}
          </Text>
        ))}
      </VStack>
    </ScrollView>
  )
}
