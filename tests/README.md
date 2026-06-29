# Tests

## 目录结构

```
tests/
├── test_runner.ts             # 极简测试框架：defineSuite / expect / runSuite
├── runner.tsx                 # 所有 suite 的统一 UI 入口
├── test_setting_migration.ts  # P0-1 存储位置迁移
└── （历史）
    ├── test_database.tsx
    ├── test_file_manager.tsx
    ├── test_download_manager.tsx
    ├── test_fetch_downloader.tsx
    └── test_player_local.tsx
```

新写的测试统一走 `test_runner.ts` 的 `defineSuite` 形式，历史测试等 P2-5 做重构时再迁移。

## 新增 suite 的步骤

1. 在 `tests/` 新建 `test_xxx.ts`，`export const suite: TestSuite = defineSuite({...})`
2. 在 `tests/runner.tsx` 顶部 import，并加入 `ALL_SUITES` 数组

## 运行方式

### ✨ 推荐：命令行一键跑

```sh
cd "/path/to/Scripting Music"
scripting-ts run run_tests.ts --timeout 60
```

`run_tests.ts` 在项目根，汇总所有 suite、打印报告、通过 `Script.exit()` 返回 `OK` / `FAILED` 串。

### 在 app 里跑（带 UI）

临时改项目根 `index.tsx`：

```ts
import("./tests/runner")  // 代替 main()
```

跑完恢复。UI 会逐条显示 ✓/✗ 和错误信息。

## 断言风格

```ts
import { defineSuite, expect, TestSuite } from "./test_runner"

export const suite: TestSuite = defineSuite({
  name: "my feature",
  beforeEach: async () => { /* 清理 */ },
  afterAll:   async () => { /* 清理 */ },
  cases: [
    {
      name: "should add",
      fn: async () => {
        expect(1 + 1).toBe(2)
        expect([1, 2]).toContain(2)
        expect(async () => { throw new Error("bad") }).toThrow("bad")
      }
    }
  ]
})
```
