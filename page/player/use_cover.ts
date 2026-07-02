import { useState, useEffect } from "scripting"
import { Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"
import { player } from "../../class/player"

/**
 * 统一封面来源解析：mini player（PlayerInfo）与 player 页（Cover/CoverBackground）
 * 必须显示同一张封面。
 *
 * 规则：
 * - 优先本地封面文件（下载时 saveCover 写入；播放时 patchCoverIfMissing 自动补下）。
 * - 本地无图：回退远程 cover_url。
 *
 * 返回 { localImage, remoteUrl }：localImage 存在时优先用它渲染，否则用 remoteUrl。
 *
 * 注：不再限制 is_downloaded —— patchCoverIfMissing 会为流式播放的歌也补下封面文件。
 * coverVersion 在 player 补封面完成（onCoverPatched）时自增，触发 effect 重读本地文件。
 */
export function useResolvedCover(music: Music | null): {
  localImage: UIImage | null
  remoteUrl: string | null
} {
  const [localImage, setLocalImage] = useState<UIImage | null>(null)
  const [coverVersion, setCoverVersion] = useState(0)

  // 订阅 player 的封面补完事件，当前歌曲补完后 bump version 触发重读
  useEffect(() => {
    if (!music) return
    return player.on({
      onCoverPatched: (id: string) => {
        if (id === music.id) setCoverVersion(v => v + 1)
      },
    })
  }, [music?.id])

  // 读本地封面文件；coverVersion 变化时重新检查
  useEffect(() => {
    setLocalImage(null)
    if (!music) return
    let cancelled = false
    const path = fileManager.getCoverPath(music.id)
    FileManager.exists(path).then(exists => {
      if (cancelled || !exists) return
      const img = UIImage.fromFile(path)
      if (!cancelled) setLocalImage(img)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [music?.id, coverVersion])

  return {
    localImage,
    remoteUrl: music?.cover_url && music.cover_url.length > 0 ? music.cover_url : null,
  }
}
