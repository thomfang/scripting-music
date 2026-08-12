import type { Music } from "./database"

export const CLOUD_USER_DATA_SCHEMA_VERSION = 1 as const

export type CloudUnavailableReason =
  | "disabled"
  | "containerUnreachable"
  | "directoryUnreachable"

export type CloudContainerAvailability =
  | { status: "available"; rootPath: string }
  | { status: "unavailable"; reason: CloudUnavailableReason; error?: string }

export type CloudReadResult<T> =
  | { status: "success"; value: T }
  | { status: "missing" }
  | { status: "containerUnavailable"; reason: string }
  | { status: "directoryUnavailable"; reason: string }
  | { status: "downloadFailed"; reason: string }
  | { status: "corrupt"; reason: string }
  | { status: "unsupportedVersion"; version: number }

export type PortableMusicSnapshot = {
  title: string
  artist: string
  album: string
  duration: number
  coverUrl?: string
  provider?: string
  sourceId?: string
}

export type PlaylistOperationKind = "create" | "rename" | "add" | "remove" | "delete"

export type PlaylistOperationV1 = {
  format: "scripting-music-playlist-operation"
  schemaVersion: typeof CLOUD_USER_DATA_SCHEMA_VERSION
  operationId: string
  playlistId: string
  generation: string
  writerId: string
  writerSequence: number
  createdAt: number
  kind: PlaylistOperationKind
  musicId?: string
  afterMusicId?: string
  snapshot?: PortableMusicSnapshot
  name?: string
  observedOperationIds?: string[]
  importSessionId?: string
  batchId?: string
  batchIndex?: number
}

export type DownloadCatalogOperationKind = "catalog" | "remove"
export type DownloadRecoverability = "recoverable" | "metadataOnly"

export type DownloadCatalogOperationV1 = {
  format: "scripting-music-download-operation"
  schemaVersion: typeof CLOUD_USER_DATA_SCHEMA_VERSION
  operationId: string
  musicId: string
  generation: string
  writerId: string
  writerSequence: number
  createdAt: number
  kind: DownloadCatalogOperationKind
  snapshot?: PortableMusicSnapshot
  recoverability?: DownloadRecoverability
  lastKnownFileSize?: number
}

export type CloudUserDataOperation = PlaylistOperationV1 | DownloadCatalogOperationV1

export type ImportPlaylistInput = {
  name: string
  cover?: string
  musics: PortableMusicSnapshotWithId[]
}

export type PortableMusicSnapshotWithId = PortableMusicSnapshot & { id: string }

export function snapshotFromMusic(music: Music): PortableMusicSnapshot {
  return {
    title: music.title,
    artist: music.artist,
    album: music.album,
    duration: music.duration,
    coverUrl: music.cover_url,
    provider: music.provider,
    sourceId: music.source_id,
  }
}

export function validateCloudUserDataOperation(value: unknown): CloudUserDataOperation {
  if (!value || typeof value !== "object") throw new Error("operation must be an object")
  const v = value as Record<string, unknown>
  if (v.schemaVersion !== CLOUD_USER_DATA_SCHEMA_VERSION) {
    if (typeof v.schemaVersion === "number") throw new Error(`unsupported schema version: ${v.schemaVersion}`)
    throw new Error("missing schemaVersion")
  }
  for (const key of ["operationId", "generation", "writerId"]) {
    if (typeof v[key] !== "string" || !(v[key] as string)) throw new Error(`missing ${key}`)
  }
  if (!Number.isSafeInteger(v.writerSequence) || (v.writerSequence as number) < 1) {
    throw new Error("invalid writerSequence")
  }
  if (typeof v.createdAt !== "number" || !Number.isFinite(v.createdAt)) throw new Error("invalid createdAt")

  if (v.format === "scripting-music-playlist-operation") {
    if (typeof v.playlistId !== "string" || !v.playlistId) throw new Error("missing playlistId")
    if (!["create", "rename", "add", "remove", "delete"].includes(String(v.kind))) {
      throw new Error("invalid playlist operation kind")
    }
    if ((v.kind === "add" || v.kind === "remove") && (typeof v.musicId !== "string" || !v.musicId)) {
      throw new Error("membership operation requires musicId")
    }
    if (v.kind === "add") validateSnapshot(v.snapshot)
    if (v.batchIndex !== undefined && (!Number.isSafeInteger(v.batchIndex) || (v.batchIndex as number) < 0)) {
      throw new Error("invalid batchIndex")
    }
    return value as PlaylistOperationV1
  }

  if (v.format === "scripting-music-download-operation") {
    if (typeof v.musicId !== "string" || !v.musicId) throw new Error("missing musicId")
    if (!["catalog", "remove"].includes(String(v.kind))) throw new Error("invalid download operation kind")
    if (v.kind === "catalog") {
      validateSnapshot(v.snapshot)
      if (v.recoverability !== "recoverable" && v.recoverability !== "metadataOnly") {
        throw new Error("catalog operation requires recoverability")
      }
    }
    return value as DownloadCatalogOperationV1
  }

  throw new Error("unknown operation format")
}

function validateSnapshot(value: unknown): asserts value is PortableMusicSnapshot {
  if (!value || typeof value !== "object") throw new Error("missing snapshot")
  const v = value as Record<string, unknown>
  for (const key of ["title", "artist", "album"]) {
    if (typeof v[key] !== "string") throw new Error(`invalid snapshot.${key}`)
  }
  if (typeof v.duration !== "number" || !Number.isFinite(v.duration) || v.duration < 0) {
    throw new Error("invalid snapshot.duration")
  }
}
