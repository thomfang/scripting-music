import { cloudOperationOutbox } from "./cloud_operation_outbox"
import { cloudUserDataStore } from "./cloud_user_data_store"
import type { CloudContainerAvailability } from "./cloud_user_data_types"
import { setting } from "./setting"

export type CloudUserDataRuntimeState = {
  initialized: boolean
  availability: CloudContainerAvailability
  pendingOperations: number
  legacyStorageNeedsMigration: boolean
}

let state: CloudUserDataRuntimeState | null = null

/**
 * 非破坏性初始化：只检查独立云根和本地 outbox，不迁移数据、不切换读取权威源。
 * 旧整库存于 iCloud 时明确阻止新云写，等待后续受控迁移实现。
 */
export async function initializeCloudUserDataFoundation(): Promise<CloudUserDataRuntimeState> {
  const pendingOperations = (await cloudOperationOutbox.listPending()).length
  const legacyStorageNeedsMigration = setting.location === "iCloud"
  const availability = legacyStorageNeedsMigration
    ? ({ status: "unavailable", reason: "containerUnreachable", error: "legacy iCloud storage must be migrated before cloud user data is enabled" } as const)
    : await cloudUserDataStore.containerAvailability()

  state = {
    initialized: true,
    availability,
    pendingOperations,
    legacyStorageNeedsMigration,
  }
  return state
}

export function getCloudUserDataRuntimeState(): CloudUserDataRuntimeState | null {
  return state
}
