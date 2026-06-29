/**
 * 极简测试框架：只做 describe / it / expect，不做 mock。
 *
 * 设计原则：
 * - 测试文件命名 `test_*.ts`，导出一个 `suite(): TestSuite`
 * - 由 tests/runner.tsx 聚合多个 suite 运行
 * - 所有断言抛 Error 被 runner catch，失败不影响其他用例
 */

export type TestCase = {
  name: string
  fn: () => void | Promise<void>
}

export type TestSuite = {
  name: string
  cases: TestCase[]
  /** 每个 it 之前跑，用来准备 / 清理 */
  beforeEach?: () => void | Promise<void>
  /** 整个 suite 跑完后清理 */
  afterAll?: () => void | Promise<void>
}

export type CaseResult = {
  name: string
  passed: boolean
  error?: string
  duration: number
}

export type SuiteResult = {
  name: string
  cases: CaseResult[]
  passed: number
  failed: number
  duration: number
}

export function defineSuite(suite: TestSuite): TestSuite {
  return suite
}

export async function runSuite(suite: TestSuite): Promise<SuiteResult> {
  const startedAt = Date.now()
  const cases: CaseResult[] = []

  for (const tc of suite.cases) {
    const t0 = Date.now()
    try {
      if (suite.beforeEach) await suite.beforeEach()
      await tc.fn()
      cases.push({ name: tc.name, passed: true, duration: Date.now() - t0 })
    } catch (e) {
      cases.push({
        name: tc.name,
        passed: false,
        error: e instanceof Error ? (e.stack || e.message) : String(e),
        duration: Date.now() - t0
      })
    }
  }

  if (suite.afterAll) {
    try { await suite.afterAll() } catch (e) {
      console.error(`[afterAll] ${suite.name}:`, e)
    }
  }

  return {
    name: suite.name,
    cases,
    passed: cases.filter(c => c.passed).length,
    failed: cases.filter(c => !c.passed).length,
    duration: Date.now() - startedAt
  }
}

// ---------- expect ----------

class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AssertionError"
  }
}

export function expect<T>(actual: T) {
  return {
    toBe(expected: T): void {
      if (actual !== expected) {
        throw new AssertionError(`expected ${format(expected)}, got ${format(actual)}`)
      }
    },
    toEqual(expected: unknown): void {
      if (!deepEqual(actual, expected)) {
        throw new AssertionError(
          `expected ${format(expected)}, got ${format(actual)}`
        )
      }
    },
    toBeTruthy(): void {
      if (!actual) throw new AssertionError(`expected truthy, got ${format(actual)}`)
    },
    toBeFalsy(): void {
      if (actual) throw new AssertionError(`expected falsy, got ${format(actual)}`)
    },
    toBeNull(): void {
      if (actual !== null) throw new AssertionError(`expected null, got ${format(actual)}`)
    },
    toBeDefined(): void {
      if (actual === undefined) throw new AssertionError(`expected defined, got undefined`)
    },
    toBeGreaterThan(n: number): void {
      if (typeof actual !== "number" || !(actual > n)) {
        throw new AssertionError(`expected > ${n}, got ${format(actual)}`)
      }
    },
    toContain(item: unknown): void {
      if (!Array.isArray(actual) || !actual.includes(item as never)) {
        throw new AssertionError(`expected to contain ${format(item)}, got ${format(actual)}`)
      }
    },
    async toThrow(matcher?: string | RegExp): Promise<void> {
      if (typeof actual !== "function") {
        throw new AssertionError("toThrow requires a function")
      }
      let thrown: unknown = null
      try {
        await (actual as () => unknown)()
      } catch (e) {
        thrown = e
      }
      if (!thrown) throw new AssertionError("expected to throw, but did not")
      const msg = thrown instanceof Error ? thrown.message : String(thrown)
      if (matcher) {
        const ok = typeof matcher === "string" ? msg.includes(matcher) : matcher.test(msg)
        if (!ok) throw new AssertionError(`error message "${msg}" does not match ${matcher}`)
      }
    }
  }
}

function format(v: unknown): string {
  if (v === undefined) return "undefined"
  if (typeof v === "string") return JSON.stringify(v)
  try { return JSON.stringify(v) } catch { return String(v) }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  for (const k of ka) {
    if (!deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false
  }
  return true
}
