import { useState, useEffect } from "scripting"
import { Music } from "../../class/database"
import { fileManager } from "../../class/file_manager"

/**
 * 统一封面来源解析：mini player（PlayerInfo）与 player 页（Cover/CoverBackground）
 * 必须显示同一张封面。
 *
 * 规则：
 * - 已下载歌曲：优先本地封面文件（下载时 saveCover 写入，与实际音频同源，
 *   可能与 DB cover_url 不同——例如下载走了 findReplacementSource 换源）。
 * - 未下载或本地无图：回退远程 cover_url。
 *
 * 返回 { localImage, remoteUrl }：localImage 存在时优先用它渲染，否则用 remoteUrl。
 */
export function useResolvedCover(music: Music | null): {
  localImage: UIImage | null
  remoteUrl: string | null
} {
  const [localImage, setLocalImage] = useState<UIImage | null>(null)

  useEffect(() => {
    setLocalImage(null)
    if (!music || !music.is_downloaded) return
    let cancelled = false
    const path = fileManager.getCoverPath(music.id)
    FileManager.exists(path).then(exists => {
      if (cancelled || !exists) return
      const img = UIImage.fromFile(path)
      if (!cancelled) setLocalImage(img)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [music?.id, music?.is_downloaded])

  return {
    localImage,
    remoteUrl: music?.cover_url && music.cover_url.length > 0 ? music.cover_url : null,
  }
}
