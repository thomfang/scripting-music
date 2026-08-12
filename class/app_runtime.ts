import { player } from "./player"
import { downloadManager } from "./download_manager"
import { downloadCenter } from "./download_center"
import { initializeCloudUserDataFoundation } from "./cloud_user_data_runtime"

/** 初始化所有界面和 Intent 共用的播放器/文件/数据库运行时。 */
export async function initializeCoreRuntime(): Promise<void> {
  await player.init()
  // MediaPlayer command handler 绑定当前宿主上下文；即使核心资源已初始化也要重新激活。
  player.activateMediaPlayerCommands()
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
  // Phase 0/1：只读探测与本地 outbox 统计不阻塞首页/下载恢复；不创建云目录、不上传。
  initializeCloudUserDataFoundation().catch(e => {
    console.error("[cloud-user-data] foundation init failed:", e)
  })
}
