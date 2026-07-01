import { Button, HStack, VStack, Image, ProgressView, Spacer, useEffect, useState } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player } from "../../class/player"
import { PlayMode } from "../../class/player"
import { QueueSheet } from "./queue"
import { Navigation } from "scripting"
import { downloadCenter } from "../../class/download_center"
import { fileManager } from "../../class/file_manager"
import { music } from "../../class/music"
import { ITUNES_PREVIEW_PROVIDER } from "../../class/sources/charts"

const PLAY_MODE_ICONS: Record<PlayMode, string> = {
  "sequential": "arrow.right",
  "repeat-all": "repeat",
  "repeat-one": "repeat.1",
  "shuffle": "shuffle",
}

const PLAY_MODE_ORDER: PlayMode[] = ["sequential", "repeat-all", "repeat-one", "shuffle"]

export function Control() {
  const { isPlaying, playMode, queue, currentIndex, currentMusic } = usePlayerState()
  const [showQueue, setShowQueue] = useState(false)
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const loops = playMode === "repeat-all" || playMode === "shuffle"
  const hasPrev = loops || currentIndex > 0
  const hasNext = loops || currentIndex < queue.length - 1

  useEffect(() => {
    let cancelled = false
    setIsDownloading(false)
    async function refresh() {
      if (!currentMusic) {
        if (!cancelled) setIsDownloaded(false)
        return
      }
      const exists = await fileManager.audioExists(currentMusic.id)
      if (!cancelled) setIsDownloaded(exists)
    }
    refresh()
    return () => { cancelled = true }
  }, [currentMusic?.id])

  function cyclePlayMode() {
    const idx = PLAY_MODE_ORDER.indexOf(playMode)
    player.setPlayMode(PLAY_MODE_ORDER[(idx + 1) % PLAY_MODE_ORDER.length])
  }

  async function handleDownloadCurrent() {
    if (!currentMusic || isDownloaded || isDownloading) return
    setIsDownloading(true)
    try {
      // 试听曲（itunes_preview）不能直接下 30s 试听文件：
      // 先用「歌名 艺人」搜 mp3juice 取首条真实源，再走正常下载链路。
      if (currentMusic.provider === ITUNES_PREVIEW_PROVIDER) {
        const real = await resolveRealSource(currentMusic.title, currentMusic.artist)
        if (!real) {
          // 找不到真实源，不下载 30s 试听，直接放弃
          return
        }
        await downloadCenter.enqueue({
          id: real.id,
          provider: real.provider,
          title: real.title || currentMusic.title,
          artist: real.artist || currentMusic.artist,
          album: real.album || currentMusic.album,
          duration: real.duration || currentMusic.duration,
          cover: real.cover || currentMusic.cover_url || "",
          // 不传 audio_url，让下载链路实时 resolve 真实可下载直链
          source_id: real.source_id,
        })
        setIsDownloaded(true)
        return
      }
      await downloadCenter.enqueue({
        id: currentMusic.id,
        provider: currentMusic.provider ?? "",
        title: currentMusic.title,
        artist: currentMusic.artist,
        album: currentMusic.album,
        duration: currentMusic.duration,
        cover: currentMusic.cover_url ?? "",
        audio_url: currentMusic.audio_url,
        source_id: currentMusic.source_id,
      })
      setIsDownloaded(true)
    } finally {
      setIsDownloading(false)
    }
  }

  // 用「歌名 艺人」搜 mp3juice，取首条真实可下载源
  async function resolveRealSource(title: string, artist: string) {
    try {
      const q = artist ? `${title} ${artist}` : title
      const { items } = await music.search(q)
      const top = items?.[0]
      if (!top) return null
      return {
        id: top.id,
        title: top.title,
        artist: top.artist ?? "",
        album: top.album ?? "",
        duration: top.duration ?? 0,
        cover: top.cover ?? "",
        provider: top.provider,
        // mp3juice 的 source_id 即 id（下载链路会用它实时 resolve 真实直链）
        source_id: top.id,
      }
    } catch (e) {
      console.error("[播放页] 解析真实下载源失败:", e)
      return null
    }
  }

  return (
    <VStack
      spacing={26}
      sheet={{
        isPresented: showQueue,
        onChanged: setShowQueue,
        content: <QueueSheet />,
      }}
    >
      {/* 传输行：上一首 / 播放暂停（主）/ 下一首 */}
      <HStack tint={"white"} frame={{ maxWidth: "infinity" }}>
        <Spacer />
        <Button action={() => player.previous()} disabled={!hasPrev} tint={hasPrev ? "white" : "rgba(255,255,255,0.5)"}>
          <Image systemName="backward.fill" font={32} />
        </Button>
        <Spacer />
        <Button action={() => { isPlaying ? player.pause() : player.play() }} tint={"white"}>
          <Image
            systemName={isPlaying ? "pause.fill" : "play.fill"}
            font={46}
            frame={{ width: 60, height: 60 }}
            scaleEffect={isPlaying ? 1 : 0.92}
            animation={{ animation: Animation.smooth({ duration: 0.3 }), value: isPlaying }}
          />
        </Button>
        <Spacer />
        <Button action={() => player.next()} disabled={!hasNext} tint={hasNext ? "white" : "rgba(255,255,255,0.5)"}>
          <Image systemName="forward.fill" font={32} />
        </Button>
        <Spacer />
      </HStack>

      {/* 工具行：播放模式 / 下载 / 队列 */}
      <HStack font={22} frame={{ maxWidth: "infinity" }}>
        <Spacer />
        <Button action={cyclePlayMode} tint={playMode === "sequential" ? "rgba(255,255,255,0.7)" : "white"}>
          <Image systemName={PLAY_MODE_ICONS[playMode]} />
        </Button>
        <Spacer />
        <Button action={handleDownloadCurrent} tint={isDownloaded ? "systemGreen" : "white"} disabled={!currentMusic || isDownloaded || isDownloading}>
          {isDownloading
            ? <ProgressView controlSize="small" />
            : <Image systemName={isDownloaded ? "checkmark.circle.fill" : "arrow.down.circle"} />}
        </Button>
        <Spacer />
        <Button action={() => setShowQueue(true)} tint="white">
          <Image systemName="list.bullet" />
        </Button>
        <Spacer />
      </HStack>
    </VStack>
  )
}