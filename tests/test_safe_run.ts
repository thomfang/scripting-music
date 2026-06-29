import { defineSuite, expect, TestSuite } from "./test_runner"
import { safeRun, safeAction } from "../class/safe_run"

/**
 * P0-4 · safeRun / safeAction 行为契约
 *
 * 覆盖：
 *  - 成功返回值
 *  - 失败返回 undefined 且吞错
 *  - onError 回调
 *  - silent 不打日志（手工观察 console，测试中仅确认不抛）
 *  - safeAction 工厂包装 + 永远 resolve void
 */

export const suite: TestSuite = defineSuite({
  name: "P0-4 · safeRun",
  cases: [
    {
      name: "成功时返回 fn 的结果",
      fn: async () => {
        const r = await safeRun(async () => 42, { silent: true })
        expect(r).toBe(42)
      }
    },
    {
      name: "同步 fn 也能执行",
      fn: async () => {
        const r = await safeRun(() => "ok", { silent: true })
        expect(r).toBe("ok")
      }
    },
    {
      name: "失败时返回 undefined 且不抛",
      fn: async () => {
        let threw = false
        try {
          const r = await safeRun(async () => { throw new Error("boom") }, { silent: true })
          expect(r).toBe(undefined)
        } catch {
          threw = true
        }
        expect(threw).toBe(false)
      }
    },
    {
      name: "onError 在失败时被调用，携带原始 error",
      fn: async () => {
        let captured: unknown = null
        await safeRun(async () => { throw new Error("x") }, {
          silent: true,
          onError: (e) => { captured = e }
        })
        expect(captured instanceof Error).toBe(true)
        expect((captured as Error).message).toBe("x")
      }
    },
    {
      name: "onError 在成功时不调用",
      fn: async () => {
        let called = false
        await safeRun(async () => 1, {
          silent: true,
          onError: () => { called = true }
        })
        expect(called).toBe(false)
      }
    },
    {
      name: "safeAction 返回一个永远 resolve void 的函数",
      fn: async () => {
        const handler = safeAction(async () => { throw new Error("x") }, { silent: true })
        const r = await handler()
        expect(r).toBe(undefined)
      }
    },
    {
      name: "safeAction 包装的成功任务不报错",
      fn: async () => {
        let ran = 0
        const handler = safeAction(async () => { ran++ }, { silent: true })
        await handler()
        await handler()
        expect(ran).toBe(2)
      }
    },
    {
      name: "无 title 时不弹窗也不会报错",
      fn: async () => {
        // 不加 silent，但不给 title：按实现仅 console.error，不弹窗
        // 这里只验证不抛
        const r = await safeRun(async () => { throw new Error("quiet") })
        expect(r).toBe(undefined)
      }
    },
  ]
})
