import { ScrollView, ScrollViewReader, Text, VStack, useEffect, useState, useMemo } from "scripting"
import { usePlayerState, usePlayerProgress } from "../../class/player_state"
import { player } from "../../class/player"
import { lyrics, LyricLine, LyricsResult } from "../../class/sources/lyrics"
import { fileManager } from "../../class/file_manager"

const DEFAULT_LYRIC_HEIGHT = 150
// 高亮前导补偿（秒）：让歌词行比音频略早亮一点，抵消渲染/感知延迟。
const LYRIC_LEAD = 0.2
// 模块级歌词内存缓存：跨「Lyric 因 key 重挂载」存活，为同一首歌重开播放页时避免闪「加载」、不重复请求。
// 加 LRU 上限，避免长会话无限累积。
const LYRIC_MEM_CACHE_MAX = 60
const lyricMemCache = new Map<string, LyricsResult>()

function lyricCacheGet(id: string): LyricsResult | undefined {
  const v = lyricMemCache.get(id)
  if (v !== undefined) {
    // 命中提升新近度：删后重插到末尾
    lyricMemCache.delete(id)
    lyricMemCache.set(id, v)
  }
  return v
}

function lyricCacheSet(id: string, data: LyricsResult): void {
  if (lyricMemCache.has(id)) lyricMemCache.delete(id)
  lyricMemCache.set(id, data)
  // 超限 → 删除最早插入的 key（Map 迭代序即插入序）
  while (lyricMemCache.size > LYRIC_MEM_CACHE_MAX) {
    const oldest = lyricMemCache.keys().next().value
    if (oldest === undefined) break
    lyricMemCache.delete(oldest)
  }
}

export function Lyric({ height = DEFAULT_LYRIC_HEIGHT, onToggle, animation }: { height?: number; onToggle?: () => void; animation?: any }) {
  const { currentMusic, isPlaying } = usePlayerState()
  const { currentTime: progressTime } = usePlayerProgress()
  // 同一首歌重挂载时，用内存缓存同步初始化 → 不闪「加载歌词…」。
  const [result, setResult] = useState<LyricsResult | null>(
    () => (currentMusic ? lyricCacheGet(currentMusic.id) ?? null : null)
  )
  const [loading, setLoading] = useState(false)
  // 独立高频计时：进度 Provider 只 1s 一跳，会让歌词高亮最多滞后近 1 秒；
  // 这里 250ms 轮询 player.getCurrentTime() 取真实播放时间，同步更紧。
  const [now, setNow] = useState(0)

  // 暂停/seek 时以 Provider 的 currentTime 为准（初始、seek 都会推）
  useEffect(() => { setNow(progressTime) }, [progressTime])
  // 播放时高频轮询真实播放时间（Scripting 无 setInterval，用自递归 setTimeout）
  useEffect(() => {
    if (!isPlaying) return
    let cancelled = false
    let id = 0
    const tick = () => {
      if (cancelled) return
      setNow(player.getCurrentTime())
      id = setTimeout(tick, 250)
    }
    id = setTimeout(tick, 250)
    return () => { cancelled = true; clearTimeout(id) }
  }, [isPlaying, currentMusic?.id])

  // 切歌时拉取歌词（内存缓存 → 本地 → 在线）
  useEffect(() => {
    let alive = true
    if (!currentMusic) { setResult(null); return }
    const musicId = currentMusic.id
    // 内存缓存命中：直接用，不走 loading / 不请求
    const cached = lyricCacheGet(musicId)
    if (cached) { setResult(cached); return }
    setResult(null)
    setLoading(true)
    ;(async () => {
      try {
        // 本地优先：已下载（或之前在线命中已落地）的歌词存于本地
        const local = await fileManager.readLyrics<LyricsResult>(musicId)
        if (local && (local.synced?.length || local.plain)) {
          lyricCacheSet(musicId, local)
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
        lyricCacheSet(musicId, r)
        // 在线命中（有 synced 或 plain）则落地本地，下次优先读本地、不再请求服务器。
        // 空结果不写，避免把「暂无歌词」固化、阻断后续重试。
        if (r.synced?.length || r.plain) {
          fileManager.saveLyrics(musicId, r).catch(e => console.error("[歌词] 落地失败:", e))
        }
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

  // 当前高亮行：最后一个 time <= (now + 前导补偿) 的行
  const activeIndex = useMemo(() => {
    const synced = result?.synced
    if (!synced || synced.length === 0) return -1
    const t = now + LYRIC_LEAD
    let idx = -1
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= t) idx = i
      else break
    }
    return idx
  }, [result?.synced, now])

  if (!currentMusic) {
    return <LyricTapArea onToggle={onToggle} animation={animation}><Placeholder text="暂无播放" height={height} /></LyricTapArea>
  }
  if (loading && !result) {
    return <LyricTapArea onToggle={onToggle} animation={animation}><Placeholder text="加载歌词…" height={height} /></LyricTapArea>
  }
  if (result?.synced && result.synced.length > 0) {
    return <LyricTapArea onToggle={onToggle} animation={animation}><SyncedLyric lines={result.synced} activeIndex={activeIndex} height={height} /></LyricTapArea>
  }
  if (result?.plain) {
    return <LyricTapArea onToggle={onToggle} animation={animation}><PlainLyric text={result.plain} height={height} /></LyricTapArea>
  }
  return <LyricTapArea onToggle={onToggle} animation={animation}><Placeholder text="暂无歌词" height={height} /></LyricTapArea>
}

// 歌词区整体可点击：点击切换「歌词放大 / 封面收起」。contentShape=rect 让透明区也可点。
function LyricTapArea({ children, onToggle, animation }: { children: JSX.Element; onToggle?: () => void; animation?: any }) {
  return (
    <VStack
      frame={{ maxWidth: "infinity" }}
      contentShape={"rect"}
      onTapGesture={onToggle}
      animation={animation}
    >
      {children}
    </VStack>
  )
}

function Placeholder({ text, height }: { text: string; height: number }) {
  return (
    <VStack frame={{ maxWidth: "infinity", height }} alignment="center">
      <Text foregroundStyle="rgba(255,255,255,0.5)" font="subheadline">{text}</Text>
    </VStack>
  )
}

function SyncedLyric({ lines, activeIndex, height }: { lines: LyricLine[]; activeIndex: number; height: number }) {
  return (
    <ScrollViewReader>
      {proxy => <SyncedLyricList proxy={proxy} lines={lines} activeIndex={activeIndex} height={height} />}
    </ScrollViewReader>
  )
}

function SyncedLyricList({
  proxy,
  lines,
  activeIndex,
  height,
}: {
  proxy: { scrollTo: (id: string | number, anchor?: any) => void }
  lines: LyricLine[]
  activeIndex: number
  height: number
}) {
  // 高亮行变化时自动滚动到中间；用 withAnimation 让滚动位移带缓动（scrollTo 本身是瞬时跳）。
  useEffect(() => {
    if (activeIndex >= 0) {
      withAnimation(Animation.easeOut(0.35), () => {
        proxy.scrollTo(activeIndex, "center")
      })
    }
  }, [activeIndex])

  return (
    <ScrollView axes="vertical" scrollContentBackground="hidden" frame={{ maxWidth: "infinity", height }}>
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

function PlainLyric({ text, height }: { text: string; height: number }) {
  const linesArr = useMemo(() => text.split(/\r?\n/), [text])
  return (
    <ScrollView axes="vertical" scrollContentBackground="hidden" frame={{ maxWidth: "infinity", height }}>
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
