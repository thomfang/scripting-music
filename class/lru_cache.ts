/**
 * 简单 LRU 缓存。
 *
 * 插入时若超过 maxSize，淘汰最久未访问的条目。
 * get 命中时更新访问顺序。
 *
 * 底层用 Map 的插入顺序 + 删除再插入来维持 LRU 语义，
 * 对于 maxSize ≤ 200 的场景足够高效。
 */
export class LRUCache<K, V> {
  private map = new Map<K, V>()

  constructor(private maxSize: number) {
    if (maxSize < 1) throw new Error("LRUCache maxSize must be >= 1")
  }

  get size(): number {
    return this.map.size
  }

  get(key: K): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      // 刷新顺序
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  has(key: K): boolean {
    return this.map.has(key)
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    }
    this.map.set(key, value)
    // 淘汰最旧
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value as K
      this.map.delete(oldest)
    }
  }

  delete(key: K): boolean {
    return this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }
}
