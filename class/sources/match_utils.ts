import type { Music } from "../database"
import type { MusicData } from "../music"

/**
 * 音源匹配打分工具（下载重试换源 + resolveRealMusic 选源共用）
 *
 * 打分规则：
 *   - title 归一化后完全相等：+50；包含：+25
 *   - 艺人（artistScore，见下）：+30/+15/+20/0/-30
 *   - album  归一化后完全相等：+10
 *   - duration 差 ≤ 3s：+10；差 ≤ 10s：+5
 *   - 候选带 cover：+2（用来打破平分）
 *
 * 阈值：score >= MATCH_THRESHOLD 视为自动匹配成功。
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
    .replace(/[\(\（][^\)\）]*(live|explicit|remix|acoustic|inst(?:rumental)?|cover|demo|伴奏|现场|翻唱)[^\)\）]*[\)\）]/g, "")
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

  // 艺人匹配：mp3juice=YouTube，同名歌众多；富化失败时 cand.artist 为空但艺人名
  // 常在标题里（"Artist - Song"）。artistScore 兼顾这点并惩罚"明确的其他歌手"。
  score += artistScore(local.artist, cand, ct)

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

  // 变体降权：现场/翻唱/变速变调版通常不是用户想要的原曲，让干净 studio 版优先。
  score += variantPenalty(cand.title)

  return score
}

/**
 * 变体惩罚（基于原始标题，因 normalize 会删括号/空格）：
 *   - 现场版（live/现场/concert/amphitheater/@）：-15（音质与完整度通常最差）
 *   - 翻唱/伴奏/纯音乐：-12
 *   - 变速/变调/混音变体（slowed/sped up/reverb/nightcore/8d/remix）：-8
 */
function variantPenalty(title: string): number {
  const t = (title || "").toLowerCase()
  let p = 0
  if (/\blive\b|现场|concert|amphitheater|@\s/.test(t)) p -= 15
  if (/\bcover\b|karaoke|卡拉|伴奏|instrumental/.test(t)) p -= 12
  if (/slowed|sped\s*up|reverb|nightcore|8d\s*audio|\bremix\b/.test(t)) p -= 8
  return p
}

/**
 * 艺人匹配打分（含 YouTube "Artist - Song" 标题回退 + 选错人惩罚）：
 *   - 候选 artist 字段精确等 +30 / 互相包含 +15
 *   - 否则本地艺人名出现在候选标题里（YouTube 惯例）+20
 *   - 否则候选有明确 artist 但与本地不符 → -30（确信是别的歌手，如同名曲）
 *   - 否则（候选无 artist 且标题无艺人名）0（信息不足，中性）
 * 本地无艺人信息时返回 0（无从判断）。
 */
function artistScore(
  localArtist: string | undefined,
  cand: MusicData,
  normalizedCandTitle?: string,
): number {
  const la = normalize(localArtist)
  if (!la) return 0
  const ca = normalize(cand.artist)
  const ct = normalizedCandTitle ?? normalize(cand.title)

  if (ca) {
    if (la === ca) return 30
    if (ca.includes(la) || la.includes(ca)) return 15
  }
  if (ct.includes(la)) return 20
  if (ca) return -30  // 候选是明确的其他歌手（同名曲）
  return 0
}

/**
 * 从候选列表中挑最高分的一条。返回 null 表示列表为空。
 */
export function pickBestMatch(
  local: Pick<Music, "title" | "artist" | "album" | "duration">,
  items: MusicData[]
): MatchResult | null {
  const ranked = rankCandidates(local, items, 1)
  return ranked.length > 0 ? ranked[0] : null
}

/**
 * 对候选打分并按分数降序返回 top N。
 */
export function rankCandidates(
  local: Pick<Music, "title" | "artist" | "album" | "duration">,
  items: MusicData[],
  topN: number = 8,
): MatchResult[] {
  if (!items || items.length === 0) return []
  const scored: MatchResult[] = items.map(it => ({ item: it, score: scoreCandidate(local, it) }))
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, topN)
}
