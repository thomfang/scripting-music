# Spec — 发现页「为你推荐」轮换算法

- 状态：进行中
- 时间：2026-06-30 19:45 Asia/Shanghai

## 1. 背景 / 问题

「为你推荐」横向卡片墙看起来「永远不变」。根因不是 10min 缓存，而是**算法本身无变化因子**：
1. 种子艺人 = 加权 Top4，库不变则恒定（库空退化为 3 个硬编码艺人）。
2. `fetchArtistTop(limit=8)` 从 iTunes lookup 取**固定排序**前 8 首，无随机/无时间窗。
3. 交错混合 + 去重均为确定操作 → 相同输入恒定输出。

## 2. 目标（四方向组合）

1. **加随机/轮换**：每个种子艺人 lookup 拉更大候选池（limit 25），再随机取样 → 不再恒取同 8 首。
2. **扩种子池**：除加权 Top 艺人外，掺入更大的口味默认池 + 随机几个流派榜单曲，提高新鲜度与覆盖面。
3. **按天 seed**：用「日期 + 用户库指纹」做随机种子，保证**一天一换**（同一天多次打开稳定），而非每次打开都跳。
4. **排除最近已推**：持久化最近 N 天展示过的曲目指纹，新一轮优先避开，逼出新内容。

## 3. 设计

### 3.1 charts.ts 改动
- `SEED_ARTISTS` 扩为更大的口味默认池（~10 个欧美另类/独立艺人），供库空/不足时随机抽取，而非固定头三个。
- `fetchArtistTop` 默认 `limit` 提到 25（候选池），调用方负责随机收敛。保持 10min 缓存不变（候选池稳定、收敛在上层随机）。
- 新增导出 `mulberry32(seed)`（确定性 PRNG）与 `hashStr(s)`（字符串→uint32），供页面做「按天 seed 随机」。无网络依赖、纯函数。

### 3.2 index.tsx 推荐 effect 重写
- **dayKey**：`YYYY-MM-DD`（本地时区）。
- **种子选择**：
  - 加权 Top（下载×3+收藏×2+最近×1）取 Top6 候选，用按天 seed 的 PRNG **洗牌后取前 N(=3~4)**。
  - 不足或为空 → 从扩展默认池按同一 seed 洗牌补齐。
  - 额外掺 1 个「随机流派榜单」种子源（从 NEW_SONG_GENRES 里按 seed 选 1 个流派，fetchChart 取候选）。
- **候选拉取**：各种子 `fetchArtistTop(25)`，流派源 `fetchChart(genre, 40)`。
- **收敛**：合并全部候选 → 排除已下载指纹 → 排除「最近已推指纹」→ 用按天 seed PRNG 洗牌 → 交错限流每艺人≤3首避免扎堆 → 取前 ~24 首。
- **每日缓存**：`Storage` 存 `{day, ids}`；同一天直接复用已算结果（命中则不重算、不闪烁），跨天重算。
- **已推记录**：`Storage` 存最近 3 天的曲目指纹集合（带 day 标签，滚动淘汰），每次出新结果后并入。
- 降级：任何步骤失败静默，回退到「不排除已推 + 默认池」最小可用集。

### 3.3 Storage keys
- `discover_reco_daily`：`{ day:string, ids:string[] }`（当日结果，ids 为 ChartTrack.id；实际仍需重拉候选再按 id 过滤组装，或直接缓存精简 track 字段）。
  - 决策：缓存**精简 track 对象数组**（id/title/artist/album/cover/previewUrl/duration），避免跨天前重复网络请求。
- `discover_reco_recent`：`{ day:string, keys:string[] }[]`，仅保留最近 3 天。

## 4. 验收

- `preview_ui` 渲染发现页：推荐区有内容、无运行时错误。
- 逻辑自检（node 或运行）：同一 dayKey 两次计算 → 结果一致；不同 dayKey → 结果不同（洗牌种子不同）。
- 真机：用户确认「换天/清缓存后推荐有变化、同日内稳定」。

## 5. 风险

- 候选池增大 + 流派源 → 首屏多 1~N 个请求；靠 10min 缓存 + 每日结果缓存兜底，仅每天首개算一次。
- preview_ui DB 未 init → 走默认池随机，不阻塞。

## Change Log
- 2026-06-30：实现完成。
  - `charts.ts`：`SEED_ARTISTS` 由 3 个扩为 12 个欧美另类/独立艺人池；新增导出 `hashStr`(FNV-1a)、`mulberry32`(确定性 PRNG)、`shuffleWith`(Fisher–Yates)；`NEW_SONG_GENRES` 改 `export`；`fetchArtistTop` 默认 limit 12→25（候选池）。
  - `index.tsx`：推荐 effect 重写为按天轮换——`todayKey()` 取本地 YYYY-MM-DD；seed=`hashStr(day|库指纹)`；加权 Top6 洗牌取3 + 默认池洗牌补到4 + 随机 1 个流派榜单源掺入；各源 fetchArtistTop(25)/fetchChart(40) 候选；每源洗牌限流≤3首；排除已下载 + 最近3天已推指纹；最终洗牌取24。`Storage` 加 `discover_reco_daily`(当日结果，同日复用跨天重算) 与 `discover_reco_recent`(滚动3天已推指纹)。任何步骤失败静默降级。
  - 验证：`preview_ui` 整链编译通过（仅预览环境缺 player Context 的运行时告警，与本改动无关）；node 自检确认同日 seed 结果一致、跨天结果不同。
- 状态：已实现，待真机确认「同日稳定、跨天/清缓存后有变化」。
- 2026-06-30 追加：手动刷新按钮。推荐计算抽为 `loadRecommend(force)`；「为你推荐」header 右侧加 `arrow.clockwise` 按钮（加载中显 ProgressView）。`force=true` 跳过当日缓存、自增 `discover_reco_nonce` 叠加进 seed（`day|libSig|nonce`）旋转出新一批，仍受「最近3天已推」排除约束。`recoInflightRef` 防重入，`recoMountedRef` 防卸载后 setState。`preview_ui` 编译通过。
