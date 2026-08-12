import {
  buildPlaylistOperation,
  importMembershipOperationId,
} from "./cloud_operations"
import type {
  ImportPlaylistInput,
  PlaylistOperationV1,
} from "./cloud_user_data_types"

export type ImportOperationBatch = {
  importSessionId: string
  batchId: string
  operations: PlaylistOperationV1[]
  duplicateMusicIds: string[]
}

/**
 * 把导入文件建模成可幂等重放的 operation batch。
 * 这是纯建模层；当前 playlistShare 尚未切换写路径，避免本轮改动真实用户数据权威源。
 */
export function buildImportOperations(input: {
  playlistId: string
  generation: string
  importSessionId: string
  playlist: ImportPlaylistInput
  mode: "new" | "merge"
  existingMusicIds?: Iterable<string>
  tailMusicId?: string
  writerId: string
  startingWriterSequence: number
  createdAt?: number
}): ImportOperationBatch {
  const batchId = input.importSessionId
  const existing = new Set(input.existingMusicIds ?? [])
  const seen = new Set<string>()
  const duplicateMusicIds: string[] = []
  const unique = input.playlist.musics.filter(music => {
    if (seen.has(music.id) || existing.has(music.id)) {
      duplicateMusicIds.push(music.id)
      return false
    }
    seen.add(music.id)
    return true
  })

  let sequence = input.startingWriterSequence
  const createdAt = input.createdAt ?? Date.now()
  const operations: PlaylistOperationV1[] = []
  if (input.mode === "new") {
    operations.push(buildPlaylistOperation({
      playlistId: input.playlistId,
      generation: input.generation,
      kind: "create",
      name: input.playlist.name,
      importSessionId: input.importSessionId,
      batchId,
      operationId: `${input.importSessionId}_create`,
      writerId: input.writerId,
      writerSequence: sequence++,
      createdAt,
    }))
  }

  let afterMusicId = input.tailMusicId
  unique.forEach((music, batchIndex) => {
    operations.push(buildPlaylistOperation({
      playlistId: input.playlistId,
      generation: input.generation,
      kind: "add",
      musicId: music.id,
      afterMusicId,
      snapshot: {
        title: music.title,
        artist: music.artist,
        album: music.album,
        duration: music.duration,
        ...(music.coverUrl !== undefined ? { coverUrl: music.coverUrl } : {}),
        ...(music.provider !== undefined ? { provider: music.provider } : {}),
        ...(music.sourceId !== undefined ? { sourceId: music.sourceId } : {}),
      },
      importSessionId: input.importSessionId,
      batchId,
      batchIndex,
      operationId: importMembershipOperationId(input.importSessionId, input.generation, music.id),
      writerId: input.writerId,
      writerSequence: sequence++,
      createdAt,
    }))
    afterMusicId = music.id
  })

  return { importSessionId: input.importSessionId, batchId, operations, duplicateMusicIds }
}
