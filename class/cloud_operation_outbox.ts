import { Path } from "scripting"
import { newUUID } from "./id"
import { cloudUserDataStore } from "./cloud_user_data_store"
import { operationCloudRelativePath } from "./cloud_operations"
import {
  CloudReadResult,
  CloudUserDataOperation,
  validateCloudUserDataOperation,
} from "./cloud_user_data_types"

export type OutboxState = "pending" | "acknowledged"

export type OutboxEntry = {
  state: OutboxState
  operation: CloudUserDataOperation
  createdAt: number
  acknowledgedAt?: number
  lastError?: string
}

export class CloudOperationOutbox {
  private readonly rootPath: string

  constructor(rootPath: string = Path.join(FileManager.appGroupDocumentsDirectory, "Scripting Music", "cloud-user-data", "outbox-v1")) {
    this.rootPath = rootPath
  }

  async enqueue(operation: CloudUserDataOperation): Promise<OutboxEntry> {
    validateCloudUserDataOperation(operation)
    await FileManager.createDirectory(this.rootPath, true)
    const path = this.entryPath(operation.operationId)
    if (await FileManager.exists(path)) {
      const existing = await this.readEntry(path)
      if (JSON.stringify(existing.operation) !== JSON.stringify(operation)) {
        throw new Error(`operationId collision in outbox: ${operation.operationId}`)
      }
      return existing
    }
    const entry: OutboxEntry = { state: "pending", operation, createdAt: Date.now() }
    await this.writeAndVerify(path, entry)
    return entry
  }

  async list(): Promise<OutboxEntry[]> {
    if (!(await FileManager.exists(this.rootPath))) return []
    const names = (await FileManager.readDirectory(this.rootPath)).filter(name => name.endsWith(".json")).sort()
    const entries: OutboxEntry[] = []
    for (const name of names) {
      try {
        entries.push(await this.readEntry(Path.join(this.rootPath, name)))
      } catch (e) {
        console.error(`[cloud-outbox] ignored corrupt entry ${name}:`, e)
      }
    }
    return entries
  }

  async listPending(): Promise<OutboxEntry[]> {
    return (await this.list()).filter(entry => entry.state === "pending")
  }

  async markAcknowledged(operationId: string): Promise<void> {
    const path = this.entryPath(operationId)
    if (!(await FileManager.exists(path))) throw new Error(`outbox operation not found: ${operationId}`)
    const entry = await this.readEntry(path)
    await this.writeAndVerify(path, { ...entry, state: "acknowledged", acknowledgedAt: Date.now(), lastError: undefined })
  }

  async recordError(operationId: string, error: unknown): Promise<void> {
    const path = this.entryPath(operationId)
    if (!(await FileManager.exists(path))) return
    const entry = await this.readEntry(path)
    // ack 是单调状态；晚到的上传错误不得把已确认操作降回 pending。
    if (entry.state === "acknowledged") return
    await this.writeAndVerify(path, { ...entry, lastError: String(error) })
  }

  /** 仅允许上传已持久化到 outbox 的 operation。 */
  async tryUpload(operationId: string): Promise<CloudReadResult<CloudUserDataOperation>> {
    const entryPath = this.entryPath(operationId)
    if (!(await FileManager.exists(entryPath))) {
      return { status: "corrupt", reason: `operation is not persisted in outbox: ${operationId}` }
    }
    const entry = await this.readEntry(entryPath)
    const operation = entry.operation
    const availability = await cloudUserDataStore.containerAvailability()
    if (availability.status === "unavailable") {
      const result: CloudReadResult<CloudUserDataOperation> = availability.reason === "directoryUnreachable"
        ? { status: "directoryUnavailable", reason: availability.error ?? availability.reason }
        : { status: "containerUnavailable", reason: availability.error ?? availability.reason }
      await this.recordError(operation.operationId, result.reason)
      return result
    }
    const path = Path.join(availability.rootPath, operationCloudRelativePath(operation))
    const result = await cloudUserDataStore.writeUniqueVerified(path, operation, validateCloudUserDataOperation)
    if (result.status !== "success") await this.recordError(operation.operationId, result)
    return result
  }

  getRootPath(): string {
    return this.rootPath
  }

  private entryPath(operationId: string): string {
    return Path.join(this.rootPath, `${encodeURIComponent(operationId).replace(/\./g, "%2E")}.json`)
  }

  private async readEntry(path: string): Promise<OutboxEntry> {
    const parsed = JSON.parse(await FileManager.readAsString(path)) as unknown
    if (!parsed || typeof parsed !== "object") throw new Error("invalid outbox entry")
    const value = parsed as Record<string, unknown>
    if (value.state !== "pending" && value.state !== "acknowledged") throw new Error("invalid outbox state")
    const operation = validateCloudUserDataOperation(value.operation)
    if (typeof value.createdAt !== "number") throw new Error("invalid outbox createdAt")
    return { ...value, operation } as OutboxEntry
  }

  private async writeAndVerify(path: string, value: OutboxEntry): Promise<void> {
    const tempPath = `${path}.tmp.${newUUID()}`
    await FileManager.writeAsString(tempPath, JSON.stringify(value))
    try {
      const tempChecked = await this.readEntry(tempPath)
      if (tempChecked.operation.operationId !== value.operation.operationId || tempChecked.state !== value.state) {
        throw new Error("outbox temp write verification failed")
      }
      // 当前 Scripting 未公开原子 replace。保留旧 final 备份，替换失败可恢复。
      const backupPath = `${path}.bak`
      if (await FileManager.exists(backupPath)) await FileManager.remove(backupPath)
      if (await FileManager.exists(path)) await FileManager.copyFile(path, backupPath)
      try {
        if (await FileManager.exists(path)) await FileManager.remove(path)
        await FileManager.rename(tempPath, path)
        const checked = await this.readEntry(path)
        if (checked.operation.operationId !== value.operation.operationId || checked.state !== value.state) {
          throw new Error("outbox write verification failed")
        }
        if (await FileManager.exists(backupPath)) await FileManager.remove(backupPath)
      } catch (e) {
        if (await FileManager.exists(path)) await FileManager.remove(path)
        if (await FileManager.exists(backupPath)) await FileManager.rename(backupPath, path)
        throw e
      }
    } finally {
      if (await FileManager.exists(tempPath)) await FileManager.remove(tempPath)
    }
  }
}

export const cloudOperationOutbox = new CloudOperationOutbox()
