import { player } from "./player"
import { downloadManager } from "./download_manager"
import { downloadCenter } from "./download_center"

/** 初始化所有界面和 Intent 共用的播放器/文件/数据库运行时。 */
export async function initializeCoreRuntime(): Promise<void> {
  await player.init()
  await downloadManager.init()
}

/** 恢复下载中心；独立暴露，Home UI 可将失败降级为 warning。 */
export async function initializeDownloadRuntime(): Promise<void> {
  await downloadCenter.init()
}

/** 普通脚本入口的完整初始化流程。 */
export async function initializeAppRuntime(): Promise<void> {
  await initializeCoreRuntime()
  await initializeDownloadRuntime()
}
