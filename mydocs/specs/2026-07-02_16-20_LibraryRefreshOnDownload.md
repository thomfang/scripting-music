# 下载完成后刷新资料库首页

## 背景 / 问题

资料库首页 `page/library/index.tsx` 的 `LibraryView` 在 `useEffect(() => { load() }, [])`
里**只在挂载时加载一次** DB 派生数据（最近添加、歌曲数、艺人/专辑/播放列表卡片、
最近播放行、各计数）。首页作为 Tab 常驻后台，不会重新 mount。

下载完成后 `fetch_downloader` 会 `addMusic(is_downloaded:true)` 写库，但首页拿到的
`data` 仍是旧快照 → 用户下载完歌回到资料库，「最近添加 / 歌曲数 / 艺人 / 专辑」等
数据不更新，必须杀进程重进才刷新。

首页目前只从 `useDownloadCenter()` 取 `activeCount`（控制下载入口显隐），
并未据此重载 DB 数据。

## 目标

下载**真正完成**（有新歌入库）后，自动触发一次资料库首页数据刷新，且：
- 静默刷新，不闪整屏 loading spinner。
- 批量下载多首时合并（防抖），不要每完成一首就重载一次。

## 方案

### 1. `class/download_center.ts`：新增完成事件通道

- 新增 `private completionSubscribers = new Set<(musicId: string) => void>()`。
- 公开 `onDownloadCompleted(cb): () => void`（仿 `subscribe`，返回退订函数）。
- 私有 `notifyCompleted(musicId)`：遍历回调，try/catch 保护。
- 在 `settle(id, ok)` 内，当 `it.status === "completed"` 时（现有 5s 自清分支同处）
  调 `notifyCompleted(id)`。这一处同时覆盖：
  - `onEngineProgress` 真实下载完成（status==="completed" → settle）；
  - `start` 里 `audioExists` 命中提前完成（已存在文件；重载幂等、无害）。
  - **不覆盖** cancelled（虽然也走 settle(ok=true)，但 status 是 "cancelled"，被 if 挡掉）。

### 2. `page/library/index.tsx`：订阅完成事件 + 静默防抖重载

- `load(silent = false)`：`silent` 时跳过 `setLoading(true/false)`，只 `setData`，
  避免整屏被 ProgressView 替换而闪烁。
- 新增一个 `useEffect`：`downloadCenter.onDownloadCompleted(...)`，回调里用
  800ms 防抖 timer 合并批量完成，触发 `load(true)`。卸载时清 timer + 退订。
- import `downloadCenter`（from `../../class/download_center`）。

## 不做 / 范围外

- 其它 push 型列表页（AllSongs/Artists/Albums 等）随导航重新 mount 自然刷新，不改。
- 不改下载引擎、并发、断点续传逻辑。
- `activeCount` 入口显隐逻辑不变。

## 验证

- TS 诊断 0 error。
- `preview_ui` 首页渲染正常。
- 逻辑推演：下载完成 → settle 完成分支 → notifyCompleted → 首页防抖 load(true)
  → 最近添加/计数刷新，无整屏闪烁；批量下载只重载 1 次（末次完成 +800ms）。
