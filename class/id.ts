/**
 * 统一 id 生成工具。
 *
 * 设计目标：
 * - 避免冲突：底层依赖 Scripting 的 `UUID.string()` 原生 UUID v4
 * - 可读性：prefix 便于调试（`playlist_xxxxxxxx-...`）
 * - 兼容降级：若 UUID.string 不可用，回退到 `Date.now + 随机`
 *
 * 不使用 `Math.random().substr(2, 9)`：`substr` 已废弃；9 位随机冲突概率在
 * 高频场景（如搜索历史/下载任务）非常可观。
 */

/** 生成一个原始 UUID 字符串 */
export function newUUID(): string {
  try {
    // Scripting 原生 UUID，返回 36 字符带连字符的 v4
    return UUID.string()
  } catch {
    // 极端兜底（不应发生）：时间戳 + 20 位随机
    const r = () => Math.random().toString(36).slice(2, 12)
    return `${Date.now().toString(36)}-${r()}${r()}`
  }
}

/** 带前缀的 id，前缀语义化，便于日志排查。例如 `playlist_<uuid>` */
export function prefixedId(prefix: string): string {
  return `${prefix}_${newUUID()}`
}

/** 常用 id 快捷生成 */
export const id = {
  playlist: () => prefixedId("playlist"),
  search: () => prefixedId("search"),
  download: () => prefixedId("download"),
}
