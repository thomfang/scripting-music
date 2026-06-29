import { defineSuite, expect, TestSuite } from "./test_runner"
import { LRUCache } from "../class/lru_cache"

export const suite: TestSuite = defineSuite({
  name: "P1-4 · LRU Cache",
  cases: [
    {
      name: "基本 get / set / has",
      fn: () => {
        const c = new LRUCache<string, number>(5)
        c.set("a", 1)
        expect(c.get("a")).toBe(1)
        expect(c.has("a")).toBe(true)
        expect(c.has("b")).toBe(false)
        expect(c.get("b")).toBe(undefined)
      }
    },
    {
      name: "超出 maxSize 淘汰最旧",
      fn: () => {
        const c = new LRUCache<string, number>(3)
        c.set("a", 1)
        c.set("b", 2)
        c.set("c", 3)
        c.set("d", 4) // 应淘汰 a
        expect(c.size).toBe(3)
        expect(c.has("a")).toBe(false)
        expect(c.get("b")).toBe(2)
        expect(c.get("d")).toBe(4)
      }
    },
    {
      name: "get 刷新 LRU 顺序",
      fn: () => {
        const c = new LRUCache<string, number>(3)
        c.set("a", 1)
        c.set("b", 2)
        c.set("c", 3)
        c.get("a")    // 刷新 a 到最新
        c.set("d", 4) // 应淘汰 b（最久未访问）
        expect(c.has("a")).toBe(true)
        expect(c.has("b")).toBe(false)
        expect(c.has("c")).toBe(true)
        expect(c.has("d")).toBe(true)
      }
    },
    {
      name: "set 已存在 key 更新值但不增加 size",
      fn: () => {
        const c = new LRUCache<string, number>(3)
        c.set("a", 1)
        c.set("b", 2)
        c.set("a", 10)
        expect(c.size).toBe(2)
        expect(c.get("a")).toBe(10)
      }
    },
    {
      name: "delete",
      fn: () => {
        const c = new LRUCache<string, number>(5)
        c.set("a", 1)
        expect(c.delete("a")).toBe(true)
        expect(c.size).toBe(0)
        expect(c.delete("x")).toBe(false)
      }
    },
    {
      name: "clear",
      fn: () => {
        const c = new LRUCache<string, number>(5)
        c.set("a", 1)
        c.set("b", 2)
        c.clear()
        expect(c.size).toBe(0)
      }
    },
    {
      name: "maxSize=1 只保留最后一个",
      fn: () => {
        const c = new LRUCache<string, number>(1)
        c.set("a", 1)
        c.set("b", 2)
        expect(c.size).toBe(1)
        expect(c.has("a")).toBe(false)
        expect(c.get("b")).toBe(2)
      }
    },
  ]
})
