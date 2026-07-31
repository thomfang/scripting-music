import { AsyncInitializer } from "../class/async_initializer"
import { defineSuite, expect, TestSuite } from "./test_runner"

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

export const suite: TestSuite = defineSuite({
  name: "Home Screen · AsyncInitializer",
  cases: [
    {
      name: "并发调用共享同一初始化任务",
      fn: async () => {
        const initializer = new AsyncInitializer()
        const gate = deferred<void>()
        let calls = 0
        const task = async () => { calls++; await gate.promise }

        const first = initializer.run(task)
        const second = initializer.run(task)
        expect(first === second).toBe(true)
        expect(calls).toBe(0)
        await Promise.resolve()
        expect(calls).toBe(1)
        expect(initializer.getState()).toBe("initializing")

        gate.resolve()
        await Promise.all([first, second])
        expect(initializer.getState()).toBe("ready")
      }
    },
    {
      name: "成功后不会重复执行",
      fn: async () => {
        const initializer = new AsyncInitializer()
        let calls = 0
        await initializer.run(async () => { calls++ })
        await initializer.run(async () => { calls++ })
        expect(calls).toBe(1)
        expect(initializer.getState()).toBe("ready")
      }
    },
    {
      name: "失败后下一次调用可以重试",
      fn: async () => {
        const initializer = new AsyncInitializer()
        let calls = 0
        await expect(() => initializer.run(async () => {
          calls++
          throw new Error("init failed")
        })).toThrow("init failed")
        expect(initializer.getState()).toBe("failed")

        await initializer.run(async () => { calls++ })
        expect(calls).toBe(2)
        expect(initializer.getState()).toBe("ready")
      }
    },
    {
      name: "同步抛错也会进入 failed 并可重试",
      fn: async () => {
        const initializer = new AsyncInitializer()
        await expect(() => initializer.run(() => { throw new Error("sync") })).toThrow("sync")
        expect(initializer.getState()).toBe("failed")
        await initializer.run(async () => {})
        expect(initializer.getState()).toBe("ready")
      }
    },
    {
      name: "初始化进行中禁止 reset",
      fn: async () => {
        const initializer = new AsyncInitializer()
        const gate = deferred<void>()
        const running = initializer.run(() => gate.promise)
        await expect(() => initializer.reset()).toThrow("in progress")
        gate.resolve()
        await running
        initializer.reset()
        expect(initializer.getState()).toBe("idle")
      }
    }
  ]
})
