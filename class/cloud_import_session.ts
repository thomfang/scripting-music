import { Path } from "scripting"
import { newUUID } from "./id"
import type { ImportOperationBatch } from "./cloud_import_operations"
import { validateCloudUserDataOperation } from "./cloud_user_data_types"

export type PersistedImportSession = {
  schemaVersion: 1
  importSessionId: string
  createdAt: number
  batch: ImportOperationBatch
}

/**
 * 导入开始时持久化完整 operations；崩溃恢复必须读取本文件，禁止重新分配 sequence/time。
 */
export class CloudImportSessionStore {
  constructor(private readonly rootPath: string = Path.join(FileManager.appGroupDocumentsDirectory, "Scripting Music", "cloud-user-data", "import-sessions-v1")) {}

  async save(batch: ImportOperationBatch, createdAt: number = Date.now()): Promise<PersistedImportSession> {
    await FileManager.createDirectory(this.rootPath, true)
    const path = this.path(batch.importSessionId)
    if (await FileManager.exists(path)) {
      const existing = await this.load(batch.importSessionId)
      if (!existing) throw new Error("import session disappeared")
      if (JSON.stringify(existing.batch) !== JSON.stringify(batch)) throw new Error("import session collision")
      return existing
    }
    const session: PersistedImportSession = { schemaVersion: 1, importSessionId: batch.importSessionId, createdAt, batch }
    const temp = `${path}.tmp.${newUUID()}`
    await FileManager.writeAsString(temp, JSON.stringify(session))
    const checked = await this.read(temp)
    if (checked.importSessionId !== batch.importSessionId) throw new Error("import session verification failed")
    await FileManager.rename(temp, path)
    return checked
  }

  async load(importSessionId: string): Promise<PersistedImportSession | null> {
    const path = this.path(importSessionId)
    if (!(await FileManager.exists(path))) return null
    return await this.read(path)
  }

  private path(importSessionId: string): string {
    return Path.join(this.rootPath, `${encodeURIComponent(importSessionId).replace(/\./g, "%2E")}.json`)
  }

  private async read(path: string): Promise<PersistedImportSession> {
    const parsed = JSON.parse(await FileManager.readAsString(path)) as unknown
    if (!parsed || typeof parsed !== "object") throw new Error("invalid import session")
    const v = parsed as Record<string, unknown>
    if (v.schemaVersion !== 1 || typeof v.importSessionId !== "string" || typeof v.createdAt !== "number") {
      throw new Error("invalid import session header")
    }
    if (!v.batch || typeof v.batch !== "object") throw new Error("invalid import batch")
    const batch = v.batch as Record<string, unknown>
    if (batch.importSessionId !== v.importSessionId || !Array.isArray(batch.operations)) throw new Error("invalid import batch identity")
    const operations = batch.operations.map(validateCloudUserDataOperation)
    if (!operations.every(op => op.format === "scripting-music-playlist-operation")) throw new Error("invalid import operation type")
    return {
      schemaVersion: 1,
      importSessionId: v.importSessionId,
      createdAt: v.createdAt,
      batch: {
        importSessionId: batch.importSessionId as string,
        batchId: String(batch.batchId),
        operations: operations as ImportOperationBatch["operations"],
        duplicateMusicIds: Array.isArray(batch.duplicateMusicIds)
          ? batch.duplicateMusicIds.filter((id): id is string => typeof id === "string")
          : [],
      }
    }
  }
}

export const cloudImportSessionStore = new CloudImportSessionStore()
