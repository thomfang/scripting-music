import { defineSuite, expect, TestSuite } from "./test_runner"
import { CloudFileAdapter, CloudUserDataStore, CLOUD_USER_DATA_DIRECTORY } from "../class/cloud_user_data_store"
import { validateCloudUserDataOperation } from "../class/cloud_user_data_types"
import { buildPlaylistOperation } from "../class/cloud_operations"

type MemoryState = {
  enabled: boolean
  documentsThrows?: boolean
  createThrows?: boolean
  downloadResult?: boolean
  storedInCloud?: boolean
  downloaded?: boolean
  files: Map<string, string>
}

function adapter(state: MemoryState): CloudFileAdapter {
  return {
    isiCloudEnabled: () => state.enabled,
    iCloudDocumentsDirectory: () => {
      if (state.documentsThrows) throw new Error("container unavailable")
      return "/icloud"
    },
    createDirectory: async () => {
      if (state.createThrows) throw new Error("directory unavailable")
    },
    exists: async path => state.files.has(path),
    isFileStoredIniCloud: () => state.storedInCloud ?? true,
    isiCloudFileDownloaded: () => state.downloaded ?? true,
    downloadFileFromiCloud: async () => state.downloadResult ?? false,
    readAsString: async path => {
      const value = state.files.get(path)
      if (value === undefined) throw new Error("missing")
      return value
    },
    writeAsString: async (path, content) => { state.files.set(path, content) },
  }
}

function operation() {
  return buildPlaylistOperation({
    playlistId: "playlist_test",
    generation: "generation_test",
    kind: "add",
    musicId: "song_test",
    snapshot: { title: "Song", artist: "Artist", album: "Album", duration: 1 },
    operationId: "operation_test",
    writerId: "writer_test",
    writerSequence: 1,
    createdAt: 1,
  })
}

export const suite: TestSuite = defineSuite({
  name: "iCloud 用户数据门禁与校验",
  cases: [
    {
      name: "iCloud disabled 返回 unavailable，不触碰 documents getter",
      fn: async () => {
        const state: MemoryState = { enabled: false, documentsThrows: true, files: new Map() }
        const result = await new CloudUserDataStore(adapter(state)).containerAvailability()
        expect(result).toEqual({ status: "unavailable", reason: "disabled" })
      }
    },
    {
      name: "独立云根不位于旧 Scripting Music storage 根",
      fn: async () => {
        const state: MemoryState = { enabled: true, files: new Map() }
        const result = await new CloudUserDataStore(adapter(state)).containerAvailability()
        expect(result.status).toBe("available")
        if (result.status === "available") {
          expect(result.rootPath.includes(`/${CLOUD_USER_DATA_DIRECTORY}/v1`)).toBe(true)
          expect(result.rootPath.includes("/Scripting Music/")).toBe(false)
        }
      }
    },
    {
      name: "云文件未下载且下载失败不能返回 missing/空数据",
      fn: async () => {
        const path = "/icloud/Scripting Music User Data/v1/op.json"
        const state: MemoryState = {
          enabled: true, files: new Map([[path, JSON.stringify(operation())]]),
          storedInCloud: true, downloaded: false, downloadResult: false,
        }
        const result = await new CloudUserDataStore(adapter(state)).readValidated(path, validateCloudUserDataOperation)
        expect(result.status).toBe("downloadFailed")
      }
    },
    {
      name: "损坏 JSON 与 missing 明确区分",
      fn: async () => {
        const badPath = "/icloud/Scripting Music User Data/v1/bad.json"
        const missingPath = "/icloud/Scripting Music User Data/v1/missing.json"
        const state: MemoryState = { enabled: true, files: new Map([[badPath, "{"]]) }
        const store = new CloudUserDataStore(adapter(state))
        expect((await store.readValidated(missingPath, validateCloudUserDataOperation)).status).toBe("missing")
        expect((await store.readValidated(badPath, validateCloudUserDataOperation)).status).toBe("corrupt")
      }
    },
    {
      name: "相同 operationId 同内容幂等，不同内容报 collision",
      fn: async () => {
        const state: MemoryState = { enabled: true, files: new Map() }
        const store = new CloudUserDataStore(adapter(state))
        const path = "/icloud/Scripting Music User Data/v1/operations/op.json"
        const op = operation()
        expect((await store.writeUniqueVerified(path, op, validateCloudUserDataOperation)).status).toBe("success")
        expect((await store.writeUniqueVerified(path, op, validateCloudUserDataOperation)).status).toBe("success")
        const changed = { ...op, musicId: "other" }
        expect((await store.writeUniqueVerified(path, changed, validateCloudUserDataOperation)).status).toBe("corrupt")
      }
    },
  ]
})
