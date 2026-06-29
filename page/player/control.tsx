import { Button, HStack, Image, ProgressView, Spacer, useEffect, useState } from "scripting"
import { usePlayerState } from "../../class/player_state"
import { player } from "../../class/player"
import { PlayMode } from "../../class/player"
import { QueueSheet } from "./queue"
import { Navigation } from "scripting"
import { downloadManager } from "../../class/download_manager"
import { fileManager } from "../../class/file_manager"

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
      await downloadManager.downloadMusic({
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

  return (
    <HStack font={53} tint={"systemPink"} sheet={{isPresented: showQueue,
      onChanged: setShowQueue,
      content: <QueueSheet />
    }}>
      <Button action={cyclePlayMode} font={20} tint={playMode === "sequential" ? "secondaryLabel" : "systemPink"}>
        <Image systemName={PLAY_MODE_ICONS[playMode]} />
      </Button>
      <Spacer />
      <Button action={() => player.previous()} disabled={!hasPrev}>
        <Image systemName="backward.circle.fill" fontWeight={"thin"} symbolRenderingMode={"hierarchical"} />
      </Button>
      <Spacer />
      <Button action={() => { isPlaying ? player.pause() : player.play() }}>
        <Image systemName={isPlaying ? "pause.circle.fill" : "play.circle.fill"} fontWeight={"thin"} symbolRenderingMode={"hierarchical"} />
      </Button>
      <Spacer />
      <Button action={() => player.next()} disabled={!hasNext}>
        <Image systemName="forward.circle.fill" fontWeight={"thin"} symbolRenderingMode={"hierarchical"} />
      </Button>
      <Spacer />
      <Button action={handleDownloadCurrent} font={20} tint={isDownloaded ? "systemGreen" : "systemPink"} disabled={!currentMusic || isDownloaded || isDownloading}>
        {isDownloading
          ? <ProgressView controlSize="small" />
          : <Image systemName={isDownloaded ? "checkmark.circle.fill" : "arrow.down.circle"} />}
      </Button>
      <Spacer />
      <Button action={() => setShowQueue(true)} font={20} tint="systemPink">
        <Image systemName="list.bullet" />
      </Button>
    </HStack>
  )
}