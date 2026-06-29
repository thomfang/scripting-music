import { Path } from "scripting"

export type StorageLocation = "appGroup" | "iCloud"

class Setting {
  private LOCATION_KEY = "storage_location"
  location: StorageLocation = (Storage.get(this.LOCATION_KEY) as StorageLocation) || "appGroup"

  getBasePath(): string {
    return this.resolveBasePath(this.location)
  }

  /** 根据目标 location 解析路径（不改变当前 location） */
  resolveBasePath(loc: StorageLocation): string {
    return loc === "iCloud"
      ? Path.join(FileManager.iCloudDocumentsDirectory, "Scripting Music")
      : Path.join(FileManager.appGroupDocumentsDirectory, "Scripting Music")
  }

  /**
   * 把整个基础目录（含 music.db / -wal / -shm / audios / covers / shared …）
   * 从 oldLocation 复制到 newLocation，成功后提交 location 写 Storage。
   *
   * 注意：调用方需要在调用前 close 数据库、调用后 reopen 数据库。
   *      本函数只负责 copy + 切换状态。失败会抛，location 保持不变。
   *
   * @returns 新路径
   */
  async migrateTo(newLocation: StorageLocation): Promise<string> {
    if (this.location === newLocation) return this.getBasePath()

    const oldPath = this.resolveBasePath(this.location)
    const newPath = this.resolveBasePath(newLocation)

    await this.copyTree(oldPath, newPath)

    // copy 成功后再切换状态，保证失败不会让用户指向空目录
    this.location = newLocation
    Storage.set(this.LOCATION_KEY, newLocation)
    return newPath
  }

  /** 清理旧路径（最佳努力），失败只打日志 */
  async cleanupPath(path: string): Promise<void> {
    try {
      if (await FileManager.exists(path)) {
        await FileManager.remove(path)
      }
    } catch (e) {
      console.error("[setting] cleanup path failed:", e)
    }
  }

  /** 强制写 location（不做任何文件操作）。测试辅助。 */
  _forceSetLocation(loc: StorageLocation): void {
    this.location = loc
    Storage.set(this.LOCATION_KEY, loc)
  }

  /** 复制整棵目录树。src 不存在则仅建 dest 空目录 */
  private async copyTree(src: string, dest: string): Promise<void> {
    await FileManager.createDirectory(dest, true)
    if (!(await FileManager.exists(src))) return

    const items = await FileManager.readDirectory(src)
    for (const item of items) {
      const s = Path.join(src, item)
      const d = Path.join(dest, item)
      if (await FileManager.isDirectory(s)) {
        await this.copyTree(s, d)
      } else {
        if (await FileManager.exists(d)) {
          await FileManager.remove(d)
        }
        await FileManager.copyFile(s, d)
      }
    }
  }
}

export const setting = new Setting()
