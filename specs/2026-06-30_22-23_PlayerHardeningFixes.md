# Spec — 播放页对抗性修复（数据正确性 + 切歌竞态 + 歌词落地 + shuffle 历史）

- 状态：进行中
- 时间：2026-06-30 22:23 Asia/Shanghai

## 背景
对播放页全链路（`page/player/*` + `class/player.ts` + `player_state.tsx` + `lyric.tsx`）做对抗性 review，确认以下问题。用户已全部同意修复，并额外要求：**在线歌词命中后落地本地，下次优先读本地**。

## 修复项

### P0-1：play_count 双重计数（数据脏）
- 现状：`playMusic()` 无条件 `updateMusicPlayCount`（play_count+1），`checkPlayCompletion()` 播到 80% 又 +1（有 `hasCountedPlay` 守卫）。→ 完整听一首 +2；刚点开切歌也 +1。污染「最常播放」排序与推荐加权。
- 设计意图（由 `hasCountedPlay` 推断）：**播到 80% 才算一次播放**。
- 方案：
  - DB 新增 `touchLastPlayed(id)`：仅 `UPDATE music SET last_played_at=? WHERE id=?`（不动 play_count）。
  - `playMusic()` 把 `updateMusicPlayCount` 改为 `touchLastPlayed`（保留「最近播放」即时性）。
  - 计数唯一留在 `checkPlayCompletion()`（≥80%，`hasCountedPlay` 守卫）。

### P0-2：切歌竞态（画面/声音不同步）
- 现状：`playMusic` 先设 currentMusic，再 `await resolveAudioUrl`（mp3juice 联网，数秒）。期间再点别的歌 → 两个 playMusic 并发，旧解析后到会 setSource 旧歌、播旧歌，但 UI 已是新歌。
- 方案：实例加 `private playToken = 0`。`playMusic` 进入即 `const token = ++this.playToken`；每个 `await`（解析、本地查找）之后校验 `if (token !== this.playToken) return`，丢弃过期解析，不 setSource/不计数。

### 歌词落地本地（用户新增需求）
- 现状：仅「下载歌曲」时 `fetch_downloader` 写 `saveLyrics`；在线试听/流播放在线拉到的歌词只进 `lyricMemCache`（重启即失），下次仍请求服务器。
- 方案（`lyric.tsx` 在线分支）：在线 `fetchLyrics` 命中（synced 或 plain 非空）后，`await fileManager.saveLyrics(musicId, r)` 落地（失败静默，不阻断展示）。空结果不写（避免把「暂无歌词」固化、阻断后续重试）。
- 读取链不变：内存缓存 → 本地 `readLyrics` → 在线。落地后下次进入直接命中本地。

### P2：lyricMemCache 无上限
- 模块级 `Map` 只增不删。方案：封装简单 LRU（上限 60）：set 时若超限删除最早 key（Map 迭代序即插入序；命中也可 re-set 提升新近度，简化起见仅 set 时裁剪）。

### P1：shuffle 历史栈（上一首/重播随机）
- 现状：shuffle 时 `getNextIndex/getPreviousIndex` 纯 `Math.random()`，previous 不回上一首、next 可能原地重播。
- 方案：
  - 实例加 `private shuffleHistory: number[] = []`（记录已播 index 顺序）、`private shuffleForward: number[] = []`（被 previous 回退后用于 redo）。
  - `getNextIndex`（shuffle）：优先 `shuffleForward.pop()`；否则在「未在近期历史中的 index」里随机挑（排除当前 index，避免原地重播；若全部播过则重置仅排除当前）。把当前 index push 进 history。
  - `getPreviousIndex`（shuffle）：从 `shuffleHistory.pop()` 取真正的上一首，把当前 index push 进 `shuffleForward`。
  - `setQueue` 时清空 history/forward。模式切走 shuffle 时也清空。
  - 顺序模式逻辑不变。

## 验收
- `preview_ui` 整链编译通过。
- node 自测 shuffle 历史：连续 next 不重复（队列未耗尽前）、previous 能逐步回退到访问序。
- 真机：用户确认 ①完整听一首 play_count 只 +1、刚点开切歌不 +1；②mp3juice 快速切歌不再画声错乱；③在线歌词二次进入秒显（本地命中）；④shuffle 上一首回到刚听的歌。

## 风险
- shuffle 历史在「队列变更」需重置，否则 index 失配；`setQueue` 已统一入口。
- 歌词落地写盘失败静默，不影响展示。

## Change Log
- 2026-06-30 实现完成：
  - `database.ts`：新增 `touchLastPlayed(id)`（仅更 last_played_at）。
  - `player.ts`：加 `playToken/shuffleHistory/shuffleForward` 字段；playMusic 每个 await 后校 token，过期丢弃；尾部计数改 `touchLastPlayed`（play_count+1 只留 checkPlayCompletion ≥80%）；`nextShuffleIndex/prevShuffleIndex/resetShuffleHistory` 实现 shuffle 历史栈，`setQueue`/`setPlayMode` 重置。
  - `lyric.tsx`：`lyricMemCache` 封装 `lyricCacheGet/Set`（LRU 上限 60）；在线 `fetchLyrics` 命中（synced/plain 非空）后 `fileManager.saveLyrics` 落地本地（失败静默，空结果不写）。
  - 验证：`preview_ui` 整链编译通过；node 自测 shuffle 历史——一轮内唯一、无相邻原地重播、previous 逐步回退访问序。
- 状态：已实现，待真机确认 4 项验收。
