import type { Music } from "../../class/database"
import type { MusicData } from "../../class/music"

/**
 * 资源修复 · 搜索结果打分工具
 *
 * 目标：对本地一首"缺失远程源"的歌，从 music.search() 返回的候选里挑最匹配的一条。
 * 纯函数、无副作用，方便单测。
 *
 * 打分规则：
 *   - title 归一化后完全相等：+50；包含：+25
 *   - artist 归一化后完全相等：+30；包含：+15
 *   - album  归一化后完全相等：+10
 *   - duration 差 ≤ 3s：+10；差 ≤ 10s：+5
 *   - 候选带 cover：+2（用来打破平分）
 *
 * 阈值：score >= MATCH_THRESHOLD 视为自动匹配成功，否则保留为 uncertain。
 */

export const MATCH_THRESHOLD = 60

export type MatchResult = {
  item: MusicData
  score: number
}

/** 归一化：去空白、转小写、去尾部的常见修饰括号 */
export function normalize(s: string | undefined | null): string {
  if (!s) return ""
  return s
    .toLowerCase()
    .trim()
    // 去成对括号内的修饰词（英文 () 或中文（））
    .replace(/[\(\（][^\)\）]*(live|explicit|remix|acoustic|inst(?:rumental)?|cover|demo|伴奏|现场|翻唱)[^\)\）]*[\)\）]/g, "")
    // 统一空白
    .replace(/\s+/g, "")
}

export function scoreCandidate(local: Pick<Music, "title" | "artist" | "album" | "duration">, cand: MusicData): number {
  let score = 0

  const lt = normalize(local.title)
  const ct = normalize(cand.title)
  if (lt && ct) {
    if (lt === ct) score += 50
    else if (ct.includes(lt) || lt.includes(ct)) score += 25
  }

  const la = normalize(local.artist)
  const ca = normalize(cand.artist)
  if (la && ca) {
    if (la === ca) score += 30
    else if (ca.includes(la) || la.includes(ca)) score += 15
  }

  const lb = normalize(local.album)
  const cb = normalize(cand.album)
  if (lb && cb && lb === cb) score += 10

  const ld = local.duration ?? 0
  const cd = cand.duration ?? 0
  if (ld > 0 && cd > 0) {
    const diff = Math.abs(ld - cd)
    if (diff <= 3) score += 10
    else if (diff <= 10) score += 5
  }

  if (cand.cover) score += 2

  return score
}

/**
 * 从候选列表中挑最高分的一条。返回 null 表示列表为空。
 * 不做阈值判断 —— 由调用方按 MATCH_THRESHOLD 决定"自动匹配 vs 需手选"。
 */
export function pickBestMatch(
  local: Pick<Music, "title" | "artist" | "album" | "duration">,
  items: MusicData[]
): MatchResult | null {
  const ranked = rankCandidates(local, items, 1)
  return ranked.length > 0 ? ranked[0] : null
}

/**
 * 对候选打分并按分数降序返回 top N，用于“换源”场景。
 * 相同 score 时保持原顺序（stable sort）。
 */
export function rankCandidates(
  local: Pick<Music, "title" | "artist" | "album" | "duration">,
  items: MusicData[],
  topN: number = 8,
): MatchResult[] {
  if (!items || items.length === 0) return []
  const scored: MatchResult[] = items.map(it => ({ item: it, score: scoreCandidate(local, it) }))
  // 降序按 score；Array.prototype.sort 在现代引擎上 stable
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN)
}
