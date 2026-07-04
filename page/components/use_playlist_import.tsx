import { useState } from "scripting"
import { database } from "../../class/database"
import { playlistShare } from "../../class/playlist_share"
import { safeRun } from "../../class/safe_run"
import { PlaylistPickerContent } from "./playlist_picker"

type SheetConfig = {
  isPresented: boolean
  onChanged: (v: boolean) => void
  content: JSX.Element
}

/**
 * 歌单导入共享逻辑。
 *
 * 把「选文件 → 选择新建/合并 → （合并时）弹歌单 picker → 执行导入 → 结果提示」
 * 这一整套从 PlaylistsView 抽出，供播放列表页与资料库首页空态 CTA 共用。
 *
 * 用法：
 *   const { startImport, importSheet } = usePlaylistImport({ onImported: reload })
 *   <List sheet={importSheet} ...>
 *   <Button action={startImport} />
 *
 * onImported 在导入/合并成功后触发，供宿主页刷新数据。
 */
export function usePlaylistImport({ onImported }: { onImported?: () => void | Promise<void> } = {}) {
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [pendingImportFile, setPendingImportFile] = useState<string | null>(null)

  async function startImport() {
    await safeRun(async () => {
      const files = await DocumentPicker.pickFiles({ allowsMultipleSelection: false })
      if (!files || files.length === 0) return
      const filePath = files[0]

      // 0 = 新建歌单，1 = 合并到已有歌单，null = 取消
      const choice = await Dialog.actionSheet({
        title: "导入歌单",
        message: "选择导入方式",
        actions: [
          { label: "新建歌单" },
          { label: "合并到已有歌单" },
        ],
      })

      if (choice == null) {
        DocumentPicker.stopAcessingSecurityScopedResources()
        return
      }

      if (choice === 1) {
        const existing = await database.getAllPlaylists()
        if (existing.length === 0) {
          DocumentPicker.stopAcessingSecurityScopedResources()
          await Dialog.alert({ title: "暂无歌单", message: "请先创建一个歌单后再选择合并" })
          return
        }
        setPendingImportFile(filePath)
        setShowImportPicker(true)
        return
      }

      // 新建歌单
      const stats = await playlistShare.importFromFile(filePath)
      DocumentPicker.stopAcessingSecurityScopedResources()
      await onImported?.()
      await Dialog.alert({
        title: "导入完成",
        message: `歌单：${stats.playlistName}\n共 ${stats.total} 首\n新增歌曲：${stats.newMusics}\n已存在：${stats.existedMusics}\n加入歌单：${stats.addedToPlaylist}\n已在歌单：${stats.alreadyInPlaylist}`
      })
    }, { title: "导入失败", tag: "playlists.import" })
  }

  async function handleMergeSelect(targetPlaylistId: string) {
    setShowImportPicker(false)
    const filePath = pendingImportFile
    setPendingImportFile(null)
    if (!filePath) return

    await safeRun(async () => {
      const stats = await playlistShare.importFromFile(filePath, { mergeIntoPlaylistId: targetPlaylistId })
      DocumentPicker.stopAcessingSecurityScopedResources()
      await onImported?.()
      await Dialog.alert({
        title: "导入完成",
        message: `已合并到：${stats.playlistName}\n共 ${stats.total} 首\n新增歌曲：${stats.newMusics}\n已存在：${stats.existedMusics}\n加入歌单：${stats.addedToPlaylist}\n已在歌单：${stats.alreadyInPlaylist}`
      })
    }, { title: "合并失败", tag: "playlists.merge" })
  }

  function handleImportPickerDismiss() {
    setShowImportPicker(false)
    setPendingImportFile(null)
    DocumentPicker.stopAcessingSecurityScopedResources()
  }

  const importSheet: SheetConfig = {
    isPresented: showImportPicker,
    onChanged: (v: boolean) => { if (!v) handleImportPickerDismiss() },
    content: <PlaylistPickerContent onSelect={handleMergeSelect} onDismiss={handleImportPickerDismiss} />
  }

  return { startImport, importSheet }
}
