import { HStack, VStack, Text, Image, Spacer, Button, Group, Label, ZStack, Circle, ProgressView, fetch } from "scripting"
import { MusicData, music } from "../../../class/music"
import { player } from "../../../class/player"
import { downloadManager } from "../../../class/download_manager"
import { Music, database } from "../../../class/database"
import { fileManager } from "../../../class/file_manager"
import { useState, useEffect } from "scripting"

type Props = {
  info: MusicData
  isPlaying: boolean
  onShowPlaylistPicker?: () => void
}

export function SearchResultCard({ info, isPlaying, onShowPlaylistPicker }: Props) {
  const [isDownloaded, setIsDownloaded] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadError, setDownloadError] = useState(false)
  const [isFavorite, setIsFavorite] = useState(false)
  const [coverError, setCoverError] = useState(false)

  useEffect(() => {
    checkStatus()
  }, [info.id])

  async function checkStatus() {
    const downloaded = await downloadManager.isDownloaded(info.id)
    setIsDownloaded(downloaded)
    const musicData = await database.getMusic(info.id)
    setIsFavorite(musicData?.is_favorite || false)
  }

  async function handlePlay() {
    // mp3juice 短时直链源不预生成 audio_url，由 player 播放时实时解析。
    const musicData: Music = {
      id: info.id,
      title: info.title,
      artist: info.artist || "未知艺术家",
      album: info.album || "未知专辑",
      duration: info.duration || 0,
      cover_url: info.cover || "",
      audio_url: "",
      provider: info.provider,  // 保存 provider
      is_downloaded: false,
      added_at: Date.now(),
      play_count: 0,
      is_favorite: false
    }
    await player.playNext(musicData)
  }

  async function handleDownload() {
    if (isDownloaded || isDownloading) return
    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadError(false)

    // Poll DB for progress every 300ms until terminal state
    let stopPolling = false
    const poll = async () => {
      if (stopPolling) return
      const task = await database.getDownloadTaskByMusicId(info.id)
      // Wait for a fresh "pending" or "downloading" task
      if (!task || task.status === "failed" || task.status === "cancelled") {
        setTimeout(poll, 300)
        return
      }
      if (task.progress > 0) setDownloadProgress(task.progress / 100)
      if (task.status === "completed") {
        stopPolling = true
        setIsDownloaded(true)
        setIsDownloading(false)
      } else {
        setTimeout(poll, 300)
      }
    }
    setTimeout(poll, 300)

    try {
      await downloadManager.downloadMusic({
        id: info.id,
        provider: info.provider,
        title: info.title,
        artist: info.artist || "未知艺术家",
        album: info.album || "未知专辑",
        duration: info.duration || 0,
        cover: info.cover || ""
      })
    } catch {
      stopPolling = true
      setIsDownloading(false)
      setDownloadError(true)
      setTimeout(() => setDownloadError(false), 3000)
    }
  }

  async function handleCancelDownload() {
    await downloadManager.cancelDownload(info.id)
  }

  async function toggleFavorite() {
    try {
      // 先确保歌曲在数据库中
      let musicData = await database.getMusic(info.id)
      if (!musicData) {
        // 歌曲不存在，先添加到数据库
        const newMusic: Omit<Music, "play_count" | "is_favorite"> = {
          id: info.id,
          title: info.title,
          artist: info.artist || "未知艺术家",
          album: info.album || "未知专辑",
          duration: info.duration || 0,
          cover_url: info.cover || "",
          audio_url: "",  // 暂时为空，播放时生成
          provider: info.provider,  // 保存 provider
          is_downloaded: false,
          added_at: Date.now(),
        }
        await database.addMusic(newMusic)

        // 尝试下载封面（异步，不阻塞收藏操作）
        if (info.cover) {
          downloadCoverInBackground(info.id, info.cover)
        }

        // 标记为收藏
        await database.toggleFavorite(info.id)
        setIsFavorite(true)
      } else {
        // 歌曲已存在，切换收藏状态
        await database.toggleFavorite(info.id)
        setIsFavorite(!isFavorite)
      }
    } catch (error) {
      console.error("收藏失败:", error)
    }
  }

  // 在后台下载封面，不阻塞用户操作
  async function downloadCoverInBackground(musicId: string, coverUrl: string) {
    try {
      const response = await fetch(coverUrl)
      if (!response.ok) return
      const coverData = await response.bytes()
      await fileManager.saveCover(musicId, coverData)
      console.log(`[封面] 已下载: ${musicId}`)
    } catch (error) {
      console.log(`[封面] 下载失败: ${error}`)
    }
  }

  return (
    <HStack
      spacing={12}
      contextMenu={{
        menuItems: (
          <Group
          >
            <Button title={isFavorite ? "取消收藏" : "收藏"} action={toggleFavorite} />
            {onShowPlaylistPicker ? (
              <Button title="添加到播放列表" action={onShowPlaylistPicker} />
            ) : null}
            {!isDownloaded ? (
              <Button
                title={isDownloading ? "取消下载" : "下载"}
                action={isDownloading ? handleCancelDownload : handleDownload}
              />
            ) : null}
          </Group>
        )
      }}
      leadingSwipeActions={{
        actions: [
          <Button tint="systemPink" action={toggleFavorite}><Label title={isFavorite ? "取消" : "收藏"} systemImage="heart.fill" />
          </Button>
        ]
      }}
      trailingSwipeActions={!isDownloaded ? {
        actions: [
          <Button tint="systemBlue" action={handleDownload}>
            <Label title="下载" systemImage="arrow.down.circle.fill" />
          </Button>
        ]
      } : undefined}
    >
      {/* 左侧：封面和信息 - 点击播放 */}
      <HStack spacing={12} onTapGesture={handlePlay}>
        {info.cover && !coverError ? (
          <Image
            imageUrl={info.cover}
            resizable={true}
            scaleToFill={true}
            frame={{ height: 56, width: 56 }}
            clipShape={{ type: "rect", cornerRadius: 8 }}
            onError={() => setCoverError(true)}
            placeholder={
              <Image
                systemName="music.note"
                frame={{ height: 56, width: 56 }}
                foregroundStyle="secondaryLabel"
                background="secondarySystemFill"
                clipShape={{ type: "rect", cornerRadius: 8 }}
              />
            }
          />
        ) : (
          <Image
            systemName="music.note"
            frame={{ height: 56, width: 56 }}
            foregroundStyle="secondaryLabel"
            background="secondarySystemFill"
            clipShape={{ type: "rect", cornerRadius: 8 }}
          />
        )}
        <VStack alignment="leading" spacing={4}>
          <Text font="headline" lineLimit={1} foregroundStyle={isPlaying ? "accentColor" : undefined}>
            {info.title}
          </Text>
          <HStack spacing={4}>
            <Text font="subheadline" foregroundStyle="secondaryLabel" lineLimit={1}>
              {info.artist || "未知艺术家"}
            </Text>
            {info.album ? (
              <>
                <Text font="subheadline" foregroundStyle="tertiaryLabel">·</Text>
                <Text font="subheadline" foregroundStyle="tertiaryLabel" lineLimit={1}>
                  {info.album}
                </Text>
              </>
            ) : null}
          </HStack>
        </VStack>
      </HStack>

      <Spacer />

      {/* 右侧：操作按钮区 */}
      <HStack
        spacing={8}
        buttonStyle="plain"
      >
        {/* 播放中指示器 */}
        {isPlaying && (
          <Image systemName="waveform"  font="body" />
        )}

        {/* 收藏按钮 */}
        <Button action={toggleFavorite} frame={{ width: 44, height: 44 }}>
          <Image
            systemName={isFavorite ? "heart.fill" : "heart"}
            foregroundStyle={isFavorite ? "systemPink" : "secondaryLabel"}
            font="title3"
            symbolRenderingMode="hierarchical"
          />
        </Button>

        {/* 下载按钮 */}
        {isDownloading ? (
          <Button 
            action={handleCancelDownload}
            frame={{ width: 44, height: 44 }}
            >
            <ZStack>
              {downloadProgress > 0 ? (
                <>
                  <Circle
                    stroke={{ shapeStyle: "accentColor", strokeStyle: { lineWidth: 2 } }}
                    frame={{ width: 24, height: 24 }}
                    opacity={0.3}
                  />
                  <Circle
                    trim={{ from: 0, to: downloadProgress }}
                    stroke={{ shapeStyle: "accentColor", strokeStyle: { lineWidth: 2 } }}
                    frame={{ width: 24, height: 24 }}
                  />
                  <Text font="caption2" foregroundStyle="accentColor">
                    {Math.round(downloadProgress * 100)}
                  </Text>
                </>
              ) : (
                <ProgressView progressViewStyle="circular" frame={{ width: 24, height: 24 }} />
              )}
            </ZStack>
          </Button>
        ) : (
          <Button action={handleDownload} frame={{ width: 44, height: 44 }} disabled={isDownloaded}>
            <Image
              systemName={downloadError ? "exclamationmark.circle.fill" : isDownloaded ? "checkmark.circle.fill" : "arrow.down.circle"}
              foregroundStyle={downloadError ? "systemRed" : isDownloaded ? "systemGreen" : "accentColor"}
              font="title3"
              symbolRenderingMode="hierarchical"
            />
          </Button>
        )}
      </HStack>
    </HStack>
  )
}