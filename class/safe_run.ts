/**
 * safeRun：统一的 async 错误处理。
 *
 * 设计目的：
 * - 满足 rules.md"所有异步操作必须有 try-catch"的规则
 * - 把"打印 + 弹窗"的重复样板抽掉
 * - 失败不 throw，调用方不用再层层 try
 *
 * 使用示例：
 *
 *   await safeRun(() => database.addMusic(m), { title: "添加失败" })
 *
 *   <Button action={safeAction(async () => {
 *     await database.deletePlaylist(id)
 *     onDeleted()
 *   }, { title: "删除失败" })} />
 */

export type SafeRunOptions = {
  /** 弹窗标题，为空则不弹窗（仅打日志） */
  title?: string
  /** 弹窗消息前缀，默认使用 error.message */
  messagePrefix?: string
  /** 完全静默：不弹窗也不打日志 */
  silent?: boolean
  /** 额外的日志标签，便于在 console 里 grep */
  tag?: string
  /** 失败回调 */
  onError?: (error: unknown) => void
}

function formatError(e: unknown): string {
  if (e instanceof Error) return e.message
  if (typeof e === "string") return e
  try { return JSON.stringify(e) } catch { return String(e) }
}

/**
 * 运行一段 async 逻辑，吞掉错误并可选弹窗。
 * @returns 成功 → fn 的返回值；失败 → undefined
 */
export async function safeRun<T>(
  fn: () => Promise<T> | T,
  options: SafeRunOptions = {}
): Promise<T | undefined> {
  try {
    return await fn()
  } catch (e) {
    if (!options.silent) {
      const tag = options.tag ? `[${options.tag}]` : "[safeRun]"
      console.error(`${tag}`, e)
    }
    options.onError?.(e)
    if (!options.silent && options.title) {
      const msg = options.messagePrefix
        ? `${options.messagePrefix}\n${formatError(e)}`
        : formatError(e)
      try {
        await Dialog.alert({ title: options.title, message: msg })
      } catch (alertErr) {
        console.error("[safeRun] Dialog.alert failed:", alertErr)
      }
    }
    return undefined
  }
}

/**
 * 工厂：把一段 async 包装成一个无参 handler（Button.action 等地方用）。
 * 返回的函数签名是 `() => Promise<void>`，无论 fn 是否返回值。
 */
export function safeAction(
  fn: () => Promise<unknown> | unknown,
  options: SafeRunOptions = {}
): () => Promise<void> {
  return async () => {
    await safeRun(fn, options)
  }
}
