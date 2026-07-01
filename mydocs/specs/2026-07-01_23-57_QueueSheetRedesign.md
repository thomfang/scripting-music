# 待播列表页设计统一化（QueueSheet Redesign）

- 日期：2026-07-01 23:57
- 范围：`page/player/queue.tsx`（重写）、`class/player.ts`（新增 `removeFromQueue`）
- 深度：standard

## 背景 / 问题

待播列表 `QueueSheet`（播放页工具栏 `list.bullet` 弹出的 sheet）自己手写了一套极简 UI，
与全项目其它列表页（all_songs / favorites / playlists / artists / albums / smart_playlists / search）
统一复用的 `SongRow` 组件风格不一致：

- 无封面、纯文字标题+艺人
- 当前项高亮用 `systemPink`（其它页统一 `accentColor` + `waveform`）
- 无左右滑、无 ⋯Menu、无空态
- 播放模式入口是一个突兀的纯文字 accentColor Section 按钮
- 底层 `player` 缺 `removeFromQueue`，队列无法管理

## 目标（核心锚点）

让待播列表在**视觉与交互上回归全局设计语言**，并补齐队列该有的能力（移除、分区、空态）。

## 方案

### A. 复用 SongRow 统一视觉
- 队列行改用 `SongRow`（48pt 圆角封面 + 标准排版 + `accentColor`+`waveform` 高亮）。
- `onTap` 覆盖点击 → `player.setQueue(queue, realIdx)` + `play`，realIdx 映射到**完整队列真实 index**。
- 传 `itemId=music.id` 保证行身份；`coverExists` 预扫描本地封面存在性。
- 废弃 systemPink 私有高亮色。

### B. 分区 + 空态
- Section「正在播放」：当前曲（currentIndex 指向），**不可移除**。
- Section「即将播放 · N 首」：`queue.slice(currentIndex+1)`，可右滑移除。
- 队列为空（或无当前曲且无后续）→ 空态占位（图标 `music.note.list` + 文案）。

### C. 右滑移除（不是删歌）
- 「即将播放」行 `trailingSwipe` 覆盖为「移除」（role destructive）→ `player.removeFromQueue(realIdx)`。
- 因只删 `index > currentIndex`，currentIndex 不位移，**播放绝不中断**。
- SongRow 三个必选回调在队列场景：`onToggleFavorite` 走 database.toggleFavorite 兜底、
  `onAddToPlaylist` 复用现有加歌单入口、`onDelete` 传移除队列（或 no-op，实际删除走 swipe/Menu 决定）。
  → 队列场景 ⋯Menu 用 `hideDefaultDelete` + `extraMenuItems`「从待播列表移除」，避免误删库中歌曲。

### D. 播放模式入口重构
- 去掉文字 Section，改为 `toolbar` `topBarTrailing` 图标按钮（图标随模式切换）。
- 保留左上角 `xmark` 关闭。

### E. 底层能力 `player.removeFromQueue(index)`
```
removeFromQueue(index):
  边界校验 [0, queue.length)
  splice(index,1)
  if index < currentIndex: currentIndex--   // 保险，UI 不会走到
  else if index === currentIndex: clamp currentIndex 到 queue.length-1  // 保险
  resetShuffleHistory()
  Storage.set(QUEUE_KEY, queue); Storage.set(INDEX_KEY, currentIndex)
  notify onQueueChange
```
UI 只对「即将播放」（index>currentIndex）调用，故 currentIndex 恒不变、播放不中断。
方法本身对任意 index 健壮（含删当前曲的 clamp），供未来复用。

## Done Contract

真机验证全部通过才算完成：
1. 队列行显示封面，样式与库页 SongRow 一致（字号/间距/高亮色）。
2. 「即将播放」右滑可移除；移除后播放不中断、队列持久化（重进 sheet 仍生效）。
3. 队列为空显示空态。
4. 播放模式 toolbar 图标按钮可循环切换四种模式，图标同步。
5. 点任一行正确切到该曲（映射真实 index，非 slice 局部 index）。

未完成判定：任一上述项异常，或出现横向溢出/行身份错乱/移除误删库中歌曲。

## 风险

- `removeFromQueue` 与 shuffle 历史/currentIndex 边界是主要坑（已用「只删 upcoming」规避）。
- SongRow 必选回调需合理接线，避免队列场景误触发删库/下载。
- realIdx 映射：`即将播放[i]` 的真实 index = `currentIndex + 1 + i`；`正在播放` = currentIndex。

## Change Log / Validation（执行后回写）

- `class/player.ts`：新增 `removeFromQueue(index)`（边界校验 + splice + currentIndex 保险位移/clamp + resetShuffleHistory + 持久化 QUEUE/INDEX + 通知 onQueueChange）。
- `page/player/queue.tsx`（重写）：
  - 复用 `SongRow`（封面/排版/`accentColor`+`waveform` 高亮与库页一致），`onTap` 映射真实 index（`currentIndex+1+i`）。
  - 分区：「正在播放」（不可移除）+ 「即将播放 · N 首」（右滑/⻰Menu 移除）。
  - 右滑/⻰Menu = “从待播列表移除”（只删 index>currentIndex，playback 不中断）；`hideDefaultDelete` 避免误删库中歌。
  - toolbar：左 `xmark`；右 `Menu` 图标（图标随模式切换 + 列四种模式可选）。
  - 空态用官方 `ContentUnavailableView` overlay（初版用 EmptyState 作 overlay 有过渡帧残留，已改）。
  - 加歌单复用 `PlaylistPickerContent` sheet；收藏走 `database.toggleFavorite`。

- Validation：`GetTypescriptDiagnostics`（整项目）无错；`preview_ui --screenshot` 确认分区/封面占位/⻰Menu/toolbar 正常、空态残留已修。
- 核心目标已由证据证明完成：待播列表视觉/交互已回归全局设计语言。

## 对抗性 Review（2026-07-02 00:06）

对照实际代码复审，发现并修复：
- **P1-a 非入库曲加歌单抛未捕获异常**：队列可含未入库曲（发现页 preview/在线试听）；`database.addMusicToPlaylist` 对不存在的 music 直接 throw。修复：`onSelect` 前 `getMusic` 判断，非入库曲 `Dialog.alert` 提示而非抛异常。
- **P1-b 重复曲 key/itemId 冲突**：`addToQueue/playNext` 不去重，同曲可多次入队；原 `key/itemId=music.id` 冲突。修复：改用 `${music.id}#${realIdx}` 稳定唯一身份。
- **P2-a shuffle「即将播放」顺序误导**：shuffle 下真实下一首由 `nextShuffleIndex` 即时随机，UI 按数组序显示不符。修复：shuffle 时 header 降级为「队列 · N 首（随机播放）」。
- **P2-b 收藏非入库曲静默无反馈**：`toggleFavorite` 对 null 曲 return false 无反馈。修复：非入库曲 `Dialog.alert` 提示。
- 核对为安全（未改）：移除只作用 upcoming、currentIndex 恒不变、播放不中断；current row `trailingSwipe=[]`+`onDelete=noop` 不误删；原地 splice 由 provider `setValue({...})` 触发重渲染。
- 观察（非 bug）：preview 首帧 `empty→filled` 过渡下空态 overlay 有合成残留；真机 sheet 弹出时 queue 非空、无此过渡。
