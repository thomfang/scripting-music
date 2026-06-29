import { database } from "./database"
import { fileManager } from "./file_manager"
import { setting, StorageLocation } from "./setting"

/**
 * 切换存储位置（appGroup ↔ iCloud）的完整编排：
 *
 *   1. 关闭数据库句柄（释放 SQLite WAL）
 *   2. 把整个基础目录从旧路径复制到新路径（包含 music.db / audios / covers / …）
 *   3. 成功后写入新的 Storage key，并重新打开数据库
 *   4. 清理旧路径
 *   5. 重新 init fileManager（确保 audios / covers 目录存在）
 *
 * 失败自动回滚：重新按旧 location 打开数据库，保证应用继续可用。
 */
export async function switchStorageLocation(newLocation: StorageLocation): Promise<void> {
  if (setting.location === newLocation) return

  const oldLocation = setting.location
  const oldPath = setting.resolveBasePath(oldLocation)

  // 1) close db
  const wasOpen = database.isOpen()
  if (wasOpen) database.close()

  let migrated = false
  try {
    // 2) copy + 切 location
    await setting.migrateTo(newLocation)
    migrated = true

    // 3) 重开 db（此时 setting.getBasePath() 已返回新路径）
    await database.reopen()

    // 4) 初始化目录
    await fileManager.init()
  } catch (e) {
    console.error("[switchStorageLocation] failed:", e)
    // 回滚 location
    if (migrated) {
      setting._forceSetLocation(oldLocation)
    }
    try {
      if (wasOpen) await database.reopen()
    } catch (ee) {
      console.error("[switchStorageLocation] rollback reopen failed:", ee)
    }
    throw e
  }

  // 5) 最佳努力清理旧目录
  await setting.cleanupPath(oldPath)
}
