import { Path } from "scripting"
import type { CloudContainerAvailability, CloudReadResult } from "./cloud_user_data_types"

export const CLOUD_USER_DATA_DIRECTORY = "Scripting Music User Data"
export const CLOUD_USER_DATA_VERSION_DIRECTORY = "v1"

export interface CloudFileAdapter {
  isiCloudEnabled(): boolean
  iCloudDocumentsDirectory(): string
  createDirectory(path: string, recursive: boolean): Promise<void>
  exists(path: string): Promise<boolean>
  isFileStoredIniCloud(path: string): boolean
  isiCloudFileDownloaded(path: string): boolean
  downloadFileFromiCloud(path: string): Promise<boolean>
  readAsString(path: string): Promise<string>
  writeAsString(path: string, content: string): Promise<void>
}

const nativeAdapter: CloudFileAdapter = {
  isiCloudEnabled: () => FileManager.isiCloudEnabled,
  iCloudDocumentsDirectory: () => FileManager.iCloudDocumentsDirectory,
  createDirectory: (path, recursive) => FileManager.createDirectory(path, recursive),
  exists: path => FileManager.exists(path),
  isFileStoredIniCloud: path => FileManager.isFileStoredIniCloud(path),
  isiCloudFileDownloaded: path => FileManager.isiCloudFileDownloaded(path),
  downloadFileFromiCloud: path => FileManager.downloadFileFromiCloud(path),
  readAsString: path => FileManager.readAsString(path),
  writeAsString: (path, content) => FileManager.writeAsString(path, content),
}

export class CloudUserDataStore {
  constructor(private readonly files: CloudFileAdapter = nativeAdapter) {}

  /** 只探测账户/容器路径，不创建目录、不写 iCloud。 */
  async containerAvailability(): Promise<CloudContainerAvailability> {
    if (!this.files.isiCloudEnabled()) return { status: "unavailable", reason: "disabled" }
    try {
      const documents = this.files.iCloudDocumentsDirectory()
      return {
        status: "available",
        rootPath: Path.join(documents, CLOUD_USER_DATA_DIRECTORY, CLOUD_USER_DATA_VERSION_DIRECTORY),
      }
    } catch (e) {
      return { status: "unavailable", reason: "containerUnreachable", error: String(e) }
    }
  }

  private async ensureRootForWrite(rootPath: string): Promise<CloudReadResult<never> | null> {
    try {
      await this.files.createDirectory(rootPath, true)
      return null
    } catch (e) {
      return { status: "directoryUnavailable", reason: String(e) }
    }
  }

  async readValidated<T>(path: string, validate: (value: unknown) => T): Promise<CloudReadResult<T>> {
    const availability = await this.containerAvailability()
    if (availability.status === "unavailable") {
      return availability.reason === "directoryUnreachable"
        ? { status: "directoryUnavailable", reason: availability.error ?? availability.reason }
        : { status: "containerUnavailable", reason: availability.error ?? availability.reason }
    }

    try {
      assertPathInsideRoot(path, availability.rootPath)
      if (!(await this.files.exists(path))) return { status: "missing" }
      if (this.files.isFileStoredIniCloud(path) && !this.files.isiCloudFileDownloaded(path)) {
        const downloaded = await this.files.downloadFileFromiCloud(path)
        if (!downloaded) return { status: "downloadFailed", reason: "iCloud file is not available locally" }
      }
      let parsed: unknown
      try {
        parsed = JSON.parse(await this.files.readAsString(path)) as unknown
      } catch (e) {
        return { status: "corrupt", reason: String(e) }
      }
      try {
        return { status: "success", value: validate(parsed) }
      } catch (e) {
        const version = getUnsupportedVersion(e, parsed)
        return version === null
          ? { status: "corrupt", reason: String(e) }
          : { status: "unsupportedVersion", version }
      }
    } catch (e) {
      return { status: "directoryUnavailable", reason: String(e) }
    }
  }

  /**
   * 写入唯一 operation 路径并立即回读校验。
   * 该结果只证明本机 ubiquitous container 写入正确，不代表已上传到其他设备。
   */
  async writeUniqueVerified<T>(path: string, value: T, validate: (value: unknown) => T): Promise<CloudReadResult<T>> {
    const availability = await this.containerAvailability()
    if (availability.status === "unavailable") {
      return availability.reason === "directoryUnreachable"
        ? { status: "directoryUnavailable", reason: availability.error ?? availability.reason }
        : { status: "containerUnavailable", reason: availability.error ?? availability.reason }
    }

    const rootError = await this.ensureRootForWrite(availability.rootPath)
    if (rootError) return rootError
    try {
      assertPathInsideRoot(path, availability.rootPath)
      const parent = Path.dirname(path)
      await this.files.createDirectory(parent, true)
      const encoded = JSON.stringify(value)
      if (await this.files.exists(path)) {
        const existing = await this.readValidated(path, validate)
        if (existing.status !== "success") return existing
        return JSON.stringify(existing.value) === encoded
          ? existing
          : { status: "corrupt", reason: "operationId collision: existing content differs" }
      }
      await this.files.writeAsString(path, encoded)
      return await this.readValidated(path, validate)
    } catch (e) {
      return { status: "directoryUnavailable", reason: String(e) }
    }
  }
}

function assertPathInsideRoot(path: string, rootPath: string): void {
  const normalizedPath = Path.normalize(path)
  const normalizedRoot = Path.normalize(rootPath)
  if (normalizedPath !== normalizedRoot && !normalizedPath.startsWith(normalizedRoot + "/")) {
    throw new Error("cloud path is outside user data root")
  }
}

function getUnsupportedVersion(error: unknown, parsed: unknown): number | null {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes("unsupported schema version")) return null
  if (!parsed || typeof parsed !== "object") return null
  const version = (parsed as Record<string, unknown>).schemaVersion
  return typeof version === "number" ? version : null
}

export const cloudUserDataStore = new CloudUserDataStore()
