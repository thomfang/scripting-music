# Spec: resolveRealMusic 按艺人匹配打分选源

Date: 2026-07-02
Status: IN_PROGRESS

## 背景 / 根因

搜索页在线模式走 iTunes（`searchSongs`，元数据精确）。点下载 → `resolveRealMusic(meta)` 用「标题 艺人」搜 mp3juice（YouTube 底座）取真实音源，**但直接 `items[0]` 盲取**，不校验艺人。YouTube 同名歌众多（原唱/翻唱/卡拉OK/别的歌手），排序把谁排第一就下谁 → 下到其他歌手的同名曲。

对比：下载器 `findReplacementSource` 已用 `match_utils.rankCandidates/pickBestMatch` 打分，唯独 `resolveRealMusic` 主路径在裸取首条。

## 决策

- query 保持「标题 艺人」（mp3juice=YouTube，标题不含专辑名，加专辑会伤召回）
- 用 `match_utils.rankCandidates` 对返回候选按 **title50 + artist30 + album10 + duration10** 打分，取最高者
- 分数全 0（无任何重叠）时回退 `items[0]` 保底（避免完全无结果）

## Done Contract

- `resolveRealMusic` 不再盲取 `items[0]`，改按打分选最佳
- `meta.album` / `meta.duration` 参与打分
- TS 诊断 0 error
- 发现页 + 在线详情页共用，一并受益

## 涉及文件

| 文件 | 操作 |
|---|---|
| `class/sources/resolve_real.ts` | 引入 rankCandidates，打分选源 + 保底回退 |

## 实测发现（Goth Babe - Afterglow）

测试暴露更深根因：单靠打分选取不够。Coldplay 的同名名曲被 iTunes 成功富化（artist=Coldplay，title 精确等 +50），
而 Goth Babe 版 YouTube 标题带噪声富化失败（artist=""，title 只 +25）。旧打分只看 cand.artist 字段 → 误选 Coldplay。

修复（match_utils.ts scoreCandidate）：
- **artistScore**：cand.artist 精确等 +30 / 互含 +15 / 本地艺人名在候选标题里（YouTube "Artist - Song" 惯例）+20 / 候选明确是别的歌手 -30
- **variantPenalty**：现场 -15 / 翻唱伴奏 -12 / slowed变速混音 -8，让干净 studio 版优先

测试结果：旧选 Coldplay → 新选 Goth Babe。单测 18 用例全 PASS。
局限：该歌 mp3juice 未返回干净 studio 原版（16 条全是现场/变速变体），属数据源局限，非打分可解。

## Change Log

- [done] resolve_real.ts 改打分选源
- [done] match_utils.ts 改进 artistScore + variantPenalty
- [done] 单测同步更新 + 新增用例（18 PASS）
- [done] TS 诊断 0 error
