import { defineSuite, expect, TestSuite } from "./test_runner"
import {
  DownloadSnapshot,
  getDownloadSnapshotInfo,
  putDownloadSnapshot,
  removeDownloadSnapshot,
} from "../class/download_snapshot"

const info = {
  id: "song-1",
  provider: "mp3juice",
  title: "Song",
  artist: "Artist",
  album: "Album",
  duration: 180,
  cover: "https://example.com/cover.jpg",
  source_id: "video-1",
}

export const suite: TestSuite = defineSuite({
  name: "Download Center · recovery snapshot",
  cases: [
    {
      name: "保存未入库任务所需的完整恢复信息",
      fn: () => {
        const snapshot = putDownloadSnapshot({}, info)
        expect(getDownloadSnapshotInfo(snapshot, info.id)).toEqual(info)
      }
    },
    {
      name: "写入不修改旧 snapshot",
      fn: () => {
        const before: DownloadSnapshot = {}
        const after = putDownloadSnapshot(before, info)
        expect(before).toEqual({})
        expect(after === before).toBe(false)
      }
    },
    {
      name: "移除指定任务而保留其他任务",
      fn: () => {
        const other = { ...info, id: "song-2", title: "Other" }
        const snapshot = putDownloadSnapshot(putDownloadSnapshot({}, info), other)
        const after = removeDownloadSnapshot(snapshot, info.id)
        expect(getDownloadSnapshotInfo(after, info.id)).toBeNull()
        expect(getDownloadSnapshotInfo(after, other.id)).toEqual(other)
      }
    },
    {
      name: "非法 key/id 对应关系不恢复",
      fn: () => {
        const snapshot = { wrong: info }
        expect(getDownloadSnapshotInfo(snapshot, "wrong")).toBeNull()
      }
    }
  ]
})
