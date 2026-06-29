import { defineSuite, expect, TestSuite } from "./test_runner"
import { newUUID, prefixedId, id } from "../class/id"

/**
 * P0-3 回归：id 工具唯一性与格式。
 *
 * UUID v4 格式：xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 *   - 8-4-4-4-12 hex
 *   - 第 13 位 = '4'
 *   - 第 17 位 ∈ {8, 9, a, b}
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const suite: TestSuite = defineSuite({
  name: "P0-3 · id 工具",
  cases: [
    {
      name: "newUUID 返回 UUID v4 格式",
      fn: () => {
        const u = newUUID()
        expect(typeof u).toBe("string")
        expect(UUID_V4.test(u)).toBe(true)
      }
    },
    {
      name: "newUUID 连续生成 1000 次无重复",
      fn: () => {
        const set = new Set<string>()
        for (let i = 0; i < 1000; i++) set.add(newUUID())
        expect(set.size).toBe(1000)
      }
    },
    {
      name: "prefixedId 带下划线前缀",
      fn: () => {
        const v = prefixedId("foo")
        expect(v.startsWith("foo_")).toBe(true)
        const raw = v.slice(4)
        expect(UUID_V4.test(raw)).toBe(true)
      }
    },
    {
      name: "id.playlist / id.search / id.download 前缀正确",
      fn: () => {
        expect(id.playlist().startsWith("playlist_")).toBe(true)
        expect(id.search().startsWith("search_")).toBe(true)
        expect(id.download().startsWith("download_")).toBe(true)
      }
    },
    {
      name: "同类前缀在短时间内也不冲突",
      fn: () => {
        const list: string[] = []
        for (let i = 0; i < 500; i++) list.push(id.playlist())
        expect(new Set(list).size).toBe(500)
      }
    },
  ]
})
