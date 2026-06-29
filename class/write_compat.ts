/**
 * 跨版本写二进制文件兼容工具。
 *
 * 背景（2026-06-29 实测）：新版 Scripting App 的 `FileManager.writeAsBytes(path, Uint8Array)`
 * 会报 `invalid "Data" argument`（即使传入全新拷贝的 Uint8Array 也失败）；
 * 而 `Data.fromUint8Array(bytes)` + `FileManager.writeAsData(path, Data)` 可正常工作。
 * 老版则相反/两者皆可。
 *
 * 策略：优先走 `Data.fromUint8Array + writeAsData`（新版可用），
 * 失败或 API 不存在时回退到 `writeAsBytes`（老版可用）。
 */
export async function writeBytesCompat(path: string, bytes: Uint8Array): Promise<void> {
  const DataNS = (globalThis as any).Data
  const FM = FileManager as any

  // 新版优先：Data + writeAsData
  if (DataNS?.fromUint8Array && typeof FM.writeAsData === "function") {
    try {
      const data = DataNS.fromUint8Array(bytes)
      if (data) {
        await FM.writeAsData(path, data)
        return
      }
    } catch (e) {
      console.log(`[writeBytesCompat] writeAsData 失败，回退 writeAsBytes: ${e}`)
    }
  }

  // 老版回退：writeAsBytes
  await FileManager.writeAsBytes(path, bytes)
}
