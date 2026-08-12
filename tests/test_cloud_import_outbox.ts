import { Path } from "scripting"
import { defineSuite, expect, TestSuite } from "./test_runner"
import { buildImportOperations } from "../class/cloud_import_operations"
import { CloudOperationOutbox } from "../class/cloud_operation_outbox"
import { CloudImportSessionStore } from "../class/cloud_import_session"

const ROOT = Path.join(FileManager.appGroupDocumentsDirectory, "__scripting_music_cloud_outbox_test__")

async function cleanup(): Promise<void> {
  if (await FileManager.exists(ROOT)) await FileManager.remove(ROOT)
}

function input() {
  return {
    playlistId: "playlist_import_test",
    generation: "generation_import_test",
    importSessionId: "import_session_test",
    playlist: {
      name: "Imported",
      musics: [
        { id: "a", title: "A", artist: "Artist", album: "Album", duration: 1 },
        { id: "b", title: "B", artist: "Artist", album: "Album", duration: 2 },
        { id: "a", title: "A duplicate", artist: "Artist", album: "Album", duration: 1 },
      ]
    },
    mode: "new" as const,
    writerId: "writer_test",
    startingWriterSequence: 1,
    createdAt: 100,
  }
}

export const suite: TestSuite = defineSuite({
  name: "云导入操作与本地 outbox",
  beforeEach: cleanup,
  afterAll: cleanup,
  cases: [
    {
      name: "同一 importSession 重建得到相同 membership operationId",
      fn: () => {
        const first = buildImportOperations(input())
        const second = buildImportOperations(input())
        expect(first.operations.map(op => op.operationId)).toEqual(second.operations.map(op => op.operationId))
        expect(first.operations.map(op => op.kind)).toEqual(["create", "add", "add"])
        expect(first.duplicateMusicIds).toEqual(["a"])
      }
    },
    {
      name: "合并导入跳过已有成员并保持 batch 顺序链",
      fn: () => {
        const batch = buildImportOperations({
          ...input(),
          mode: "merge",
          existingMusicIds: ["a"],
          tailMusicId: "tail",
        })
        expect(batch.operations.length).toBe(1)
        expect(batch.operations[0].musicId).toBe("b")
        expect(batch.operations[0].afterMusicId).toBe("tail")
        expect(batch.operations[0].batchIndex).toBe(0)
      }
    },
    {
      name: "导入 session 持久化完整 operations，重启后不重新分配序号",
      fn: async () => {
        const sessionStore = new CloudImportSessionStore(Path.join(ROOT, "sessions"))
        const batch = buildImportOperations(input())
        await sessionStore.save(batch, 100)
        const restored = await sessionStore.load(batch.importSessionId)
        expect(restored!.batch.operations).toEqual(batch.operations)
        expect(restored!.createdAt).toBe(100)
      }
    },
    {
      name: "outbox 重复 enqueue 同一 operation 幂等",
      fn: async () => {
        const outbox = new CloudOperationOutbox(ROOT)
        const operation = buildImportOperations(input()).operations[0]
        await outbox.enqueue(operation)
        await outbox.enqueue(operation)
        expect((await outbox.listPending()).length).toBe(1)
      }
    },
    {
      name: "outbox 相同 operationId 不同内容拒绝覆盖",
      fn: async () => {
        const outbox = new CloudOperationOutbox(ROOT)
        const operation = buildImportOperations(input()).operations[1]
        await outbox.enqueue(operation)
        await expect(async () => {
          await outbox.enqueue({ ...operation, musicId: "changed" })
        }).toThrow("operationId collision")
      }
    },
    {
      name: "tryUpload 拒绝未先写入 outbox 的 operation",
      fn: async () => {
        const outbox = new CloudOperationOutbox(ROOT)
        const result = await outbox.tryUpload("not_persisted")
        expect(result.status).toBe("corrupt")
      }
    },
    {
      name: "acknowledged 不物理删除 journal entry",
      fn: async () => {
        const outbox = new CloudOperationOutbox(ROOT)
        const operation = buildImportOperations(input()).operations[0]
        await outbox.enqueue(operation)
        await outbox.markAcknowledged(operation.operationId)
        expect((await outbox.listPending()).length).toBe(0)
        const all = await outbox.list()
        expect(all.length).toBe(1)
        expect(all[0].state).toBe("acknowledged")
      }
    },
  ]
})
