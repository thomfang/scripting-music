import { Path } from "scripting"
import { newUUID } from "./id"
import type {
  CloudUserDataOperation,
  DownloadCatalogOperationV1,
  DownloadRecoverability,
  PlaylistOperationKind,
  PlaylistOperationV1,
  PortableMusicSnapshot,
} from "./cloud_user_data_types"

const WRITER_ID_KEY = "cloud_user_data_writer_id"
const WRITER_SEQUENCE_KEY = "cloud_user_data_writer_sequence"

export function getCloudWriterId(): string {
  const existing = Storage.get<string>(WRITER_ID_KEY)
  if (existing) return existing
  const created = `writer_${newUUID()}`
  Storage.set(WRITER_ID_KEY, created)
  return created
}

export function nextCloudWriterSequence(): number {
  const next = (Storage.get<number>(WRITER_SEQUENCE_KEY) ?? 0) + 1
  Storage.set(WRITER_SEQUENCE_KEY, next)
  return next
}

export function newGeneration(entity: "playlist" | "download"): string {
  return `${entity}_generation_${newUUID()}`
}

export function newImportSessionId(): string {
  return `import_${newUUID()}`
}

export function buildPlaylistOperation(input: {
  playlistId: string
  generation: string
  kind: PlaylistOperationKind
  musicId?: string
  afterMusicId?: string
  snapshot?: PortableMusicSnapshot
  name?: string
  observedOperationIds?: string[]
  importSessionId?: string
  batchId?: string
  batchIndex?: number
  operationId?: string
  writerId?: string
  writerSequence?: number
  createdAt?: number
}): PlaylistOperationV1 {
  return {
    format: "scripting-music-playlist-operation",
    schemaVersion: 1,
    operationId: input.operationId ?? `op_${newUUID()}`,
    playlistId: input.playlistId,
    generation: input.generation,
    writerId: input.writerId ?? getCloudWriterId(),
    writerSequence: input.writerSequence ?? nextCloudWriterSequence(),
    createdAt: input.createdAt ?? Date.now(),
    kind: input.kind,
    ...(input.musicId !== undefined ? { musicId: input.musicId } : {}),
    ...(input.afterMusicId !== undefined ? { afterMusicId: input.afterMusicId } : {}),
    ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.observedOperationIds !== undefined ? { observedOperationIds: input.observedOperationIds } : {}),
    ...(input.importSessionId !== undefined ? { importSessionId: input.importSessionId } : {}),
    ...(input.batchId !== undefined ? { batchId: input.batchId } : {}),
    ...(input.batchIndex !== undefined ? { batchIndex: input.batchIndex } : {}),
  }
}

export function buildDownloadCatalogOperation(input: {
  musicId: string
  generation: string
  kind: "catalog" | "remove"
  snapshot?: PortableMusicSnapshot
  recoverability?: DownloadRecoverability
  lastKnownFileSize?: number
  operationId?: string
  writerId?: string
  writerSequence?: number
  createdAt?: number
}): DownloadCatalogOperationV1 {
  return {
    format: "scripting-music-download-operation",
    schemaVersion: 1,
    operationId: input.operationId ?? `op_${newUUID()}`,
    musicId: input.musicId,
    generation: input.generation,
    writerId: input.writerId ?? getCloudWriterId(),
    writerSequence: input.writerSequence ?? nextCloudWriterSequence(),
    createdAt: input.createdAt ?? Date.now(),
    kind: input.kind,
    ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
    ...(input.recoverability !== undefined ? { recoverability: input.recoverability } : {}),
    ...(input.lastKnownFileSize !== undefined ? { lastKnownFileSize: input.lastKnownFileSize } : {}),
  }
}

/** 同一导入会话 + 目标 generation + musicId 始终生成同一安全 operationId。 */
export function importMembershipOperationId(importSessionId: string, generation: string, musicId: string): string {
  const raw = `${importSessionId}\u001f${generation}\u001f${musicId}`
  return `import_add_${stableHash(raw)}`
}

export function operationCloudRelativePath(operation: CloudUserDataOperation): string {
  if (operation.format === "scripting-music-playlist-operation") {
    return Path.join("operations", "playlists", safePathSegment(operation.playlistId), `${safePathSegment(operation.operationId)}.json`)
  }
  return Path.join("operations", "downloaded", safePathSegment(operation.musicId), `${safePathSegment(operation.operationId)}.json`)
}

export function safePathSegment(value: string): string {
  if (!value) throw new Error("empty path segment")
  return encodeURIComponent(value).replace(/\./g, "%2E")
}

function stableHash(value: string): string {
  // 两路 FNV-1a 32-bit，作为 import session 内幂等键；session 本身是 UUID。
  let a = 0x811c9dc5
  let b = 0x9e3779b9
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    a = Math.imul(a ^ c, 0x01000193)
    b = Math.imul(b ^ (c + i), 0x85ebca6b)
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}`
}
