# 全局下载中心 + 断点续传 + 修复退出丢状态

- 日期：2026-07-01 08:56
- 深度：deep（跨模块：新增单例 Store + 引擎改造 + 6 调用点 + 启动对账 + UI 入口）

## 背景 / 问题

1. 任意页面点下载后，进度只活在**各页面组件 state**（`downloadingIds` / `isDownloading` + `setTimeout` 轮询 DB）。退出/切页 → 组件卸载 → state 丢，重进又显示成「未下载」，用户体感「退出就取消」。实际引擎 `fetchDownloader`（模块级单例）还在后台跑，只是没有全局 UI 反映。
2. 缺少「不论在哪下载都能统一查看/取消/暂停/恢复」的地方。
3. `pause/resume` 引擎里存在但把 `chunks` 存在 `performDownload` 局部变量，暂停即丢，恢复=从 0 重下（非断点续传）。

## 目标（核心锚点）

- 新增**全局下载中心单例 Store**（模块级，跨页面卸载存活），所有下载统一走它，天然解决「退出丢状态」。
- 资料库首页右上角「播放」按钮**左侧**加下载入口：**仅当有活跃/暂停/失败任务时显示**，否则隐藏。
- 下载中心页面：进度、取消、暂停/恢复、失败重试、清理已完成。
- 断点续传：**同会话 pause/resume** 发 `Range: bytes=<offset>-`，服务端 206 则续、200 则重下（运行时探测，无需预探测）。跨重解析/跨杀进程因 mp3juice 直链临时、安全起见重下。

## 用户决策

1. 无下载则隐藏入口。
2. 服务支持断点就续、不支持就重下（用 Range 运行时探测）。

## 关键事实（已排查）

- `fetchDownloader` 是模块级单例；`downloadMusic` 一旦调用就在单例里跑，React 卸载不会中止；全项目仅 `search_result_card` 手动「取消」调 `cancelDownload`，无页面在卸载时 abort。
- 下载调用点 6 处：`page/library/all_songs.tsx`、`favorites.tsx`、`playlists.tsx`、`page/discover/index.tsx`、`page/search/online_detail.tsx`、`page/search/components/search_result_card.tsx`、`page/player/control.tsx`。
- `database.download_task` 表已存在（status: pending/downloading/paused/cancelled/completed/failed, progress, error, session_id）；有 `getAllDownloadTasks/getDownloadTaskByMusicId`。
- Scripting API：`FileManager.appendData(path, Data)`（增量落盘、自动建文件）、`stat(path).size`（续传偏移）、`fetch(url,{headers:{Range},signal})`；206 partial + `Content-Range: bytes s-e/total`。
- mp3juice 直链每次 `resolveAudioUrl` 都是临时且可能换 CDN → 跨解析用 Range 不安全，必须重下。

## 方案

### A. `class/file_manager.ts` — partial 落盘支持
- 新增 `downloads` 目录（`<root>/downloads`），init 建。
- `getPartPath(id)`=`<downloads>/<id>.part`；`partExists`、`partSize`（stat.size，不存在返回 0）、`appendPart(id,bytes)`（`appendData(Data.fromUint8Array)`，回退 append）、`readPart(id)`、`deletePart(id)`。
- `sumDirSize` 计入 downloads（存储占用可见）。

### B. `class/fetch_downloader.ts` — 断点续传改造
- `DownloadTask` 加 `partUrl?: string`（本 part 文件对应的已解析 URL）。
- `ProgressCallback` status 增加 `"paused"`。
- `performDownload(musicId)` 改为落盘式：
  1. `url = task.musicInfo.audio_url`；`hasPart = partExists && task.partUrl === url`。
  2. `offset = hasPart ? partSize : 0`；若 `!hasPart` 先 `deletePart` 并置 `task.partUrl = url`。
  3. `fetch(url, {headers: offset>0 ? {Range:`bytes=${offset}-`} : {}, signal})`。
  4. 若 `offset>0 && status===200`（服务端忽略 Range）→ `deletePart`、offset=0、重新从头写；`status===206` → 续写；`status===200 && offset===0` → 全新写。
  5. `total` = 206 时从 `Content-Range .../total` 解析，否则 `content-length (+offset)`。
  6. 读流循环：每 chunk `appendPart`；`downloadedBytes = offset + 累计`；progress=downloadedBytes/total；`updateDownloadTask` + `onProgress(...,"downloading")`。
  7. `task.isPaused` → `updateDownloadTask(paused)` + `onProgress(progress,"paused")` + `return`（**保留 part 文件、保留 task、保留 cb**，不 delete）。
  8. done → `readPart` 取全量 bytes → 交 `processDownloadedFile`（复用原 ID3/封面/歌词/入库逻辑），成功后 `deletePart`。
- `cancelDownload`：abort 后 `deletePart`（取消清 part）。
- `resumeDownload`：同一 task 存活 → 重进 `performDownload`（partUrl 命中 → Range 续）。
- 新增 `hasTask(id)`：供 center 判断是否活体 task。
- `AbortError`/failed 分支不删 part（保留以便重试续传；重试若换 URL 会自动重下）。

### C. `class/download_center.ts` — 全局单例 Store + 调度
- `DownloadCenterItem { musicId, info(MusicInfo), progress, status, error? }`，status=`queued|downloading|paused|completed|failed|cancelled`。
- `items: Map`、`order: string[]`（展示序）、`queue: string[]`、`active: Set`、`concurrency=3`、`subscribers: Set<()=>void>`、`awaiters: Map<id,{resolve,reject}>`。
- `subscribe(cb)/getItems()/notify()`。
- `init()`：hydrate——`getAllDownloadTasks` 取非终态(downloading/pending/paused)，`getMusic(music_id)` 能取到且未下载 → 加 `paused` item（跨杀进程可见，可重试；DB 中 downloading 顺手改 paused）。取不到 Music 的丢弃。
- `enqueue(info): Promise<void>`：已有活跃/queued/completed 同 id → 跳过（completed 直接 resolve）；否则建 item=queued、入 order/queue、返回 promise（存 awaiter）、`pump()`。
- `pump()`：`active.size<concurrency && queue` → `start(id)`。
- `start(id)`：item→downloading、`active.add`；`fetchDownloader.onProgress(id, cb)`；`fetchDownloader.downloadMusic(info).catch(()=>{})`（terminal 由 cb 驱动）。cb：
  - downloading→更新 progress；
  - completed→resolve awaiter、free slot、pump；
  - failed→设 error、reject awaiter、free、pump；
  - cancelled→resolve awaiter、free、pump；
  - paused→free slot、pump（item 留 paused，awaiter 继续挂起直到 resume→completed）。
- `pause(id)`：`fetchDownloader.pauseDownload`。
- `resume(id)`：live task → `resumeDownload`；否则（hydrate/killed）→ `start` 走 fresh `downloadMusic`（part 命中则续、换 URL 则重下）。
- `cancel(id)`：`fetchDownloader.cancelDownload` + item→cancelled + 从 order 移除（或标记）。
- `retry(id)`：failed/cancelled → 重新 enqueue。
- `clearFinished()`：移除 completed/cancelled/failed。
- `activeCount()`：queued+downloading+paused+failed 计数（决定入口显隐；completed 不计）。

### D. `class/download_center.tsx` — `useDownloadCenter()`
- `useObservable(getItems())` + `useEffect(subscribe)`；返回 `{items, activeCount}`。

### E. `page/library/download_center.tsx` — 下载中心页
- List：每 item 封面(本地/远程)+标题+艺人；下方 `ProgressView value=progress` + `xx%`/状态文案；trailing 按钮随状态：downloading→暂停+取消；paused→继续+取消；failed→重试+移除；queued→取消；completed→移除。
- 顶部 toolbar：全部暂停/继续、清除已完成。空态 EmptyState。

### F. 调用点统一走 center
- 6+ 处 `downloadManager.downloadMusic(info)` → `downloadCenter.enqueue(info)`（enqueue 返回 terminal promise，`await` 处行为不变：完成后仍 `loadMusics`；非 await 处 fire-and-forget）。保留各页现有行内指示（DB 轮询仍有效，因引擎是同一单例）。

### G. `page/library/index.tsx` — 入口
- `useDownloadCenter()` 取 activeCount；`activeCount>0` 时在 toolbar `topBarTrailing` 用 HStack：`[下载入口 NavigationLink(arrow.down.circle + badge count)] [播放 Menu]`（下载在左）。为 0 隐藏。

### H. `index.tsx`（app 根）
- `downloadManager.init()` 后 `await downloadCenter.init()`（hydrate）。

## Done Contract

- 任意页面发起的下载，都能在资料库右上角入口进下载中心看到并可取消/暂停/继续/重试。
- 切 Tab / 退出详情页后回来，进度仍在、不丢、不被误取消（由模块级单例保证）。
- pause 后 resume：服务端支持 Range → 从断点续；不支持 → 自动重下；均能最终完成。
- 无任务时入口隐藏。
- 真机验证：最小化后下载继续；被杀重进能看到中断任务（paused）并可重试/续传。
- 未完成判据：入口在无任务时仍显示；退出页面后进度丢失；resume 报错或永远从 0。

## Change Log

- `class/file_manager.ts`：新增 `downloads/` 目录 + `getPartPath/partExists/partSize/appendPart/readPart/deletePart`；`getStorageSize` 计入 part。
- `class/fetch_downloader.ts`：`DownloadTask` 加 `partUrl`；`ProgressCallback` 加 `"paused"`；`performDownload` 改落盘式 + Range 续传（206续/200重下，Content-Range 解析 total）；暂停保留 part/task/cb；`cancelDownload` 处理暂停态与无活体 task 并清 part；失败不删 part（便于重试续）；新增 `hasTask`。
- `class/download_center.ts`（新）：全局单例 Store，`enqueue/pause/resume/cancel/retry/remove/clearFinished/pauseAll/resumeAll`；并发上限 3 + 等待队列 + 订阅通知 + `activeCount`；`init()` 启动对账把上次会话卡死任务恢复为 paused（可重试/续传）；`start` 先探测 `audioExists` 防已下载任务卡死；单一桥 `onEngineProgress`。
- `class/use_download_center.ts`（新）：`useDownloadCenter()` 订阅返回 `{items, activeCount}`。
- `page/library/download_center.tsx`（新）：下载中心页；行内进度条 + 暂停/继续/取消/重试/移除；toolbar 全部暂停/继续/清除已完成；空态。
- 调用点统一走 center：`all_songs/favorites/playlists/discover/online_detail/search_result_card/player/control` + `batch_download_helper.runBatchDownload`（改为 center.enqueue 并发聚合）。
- `page/library/index.tsx`：`useDownloadCenter`，`activeCount>0` 时工具栏「播放」左侧显下载入口（图标+数字 NavigationLink），为 0 隐藏。
- `index.tsx`（根）：`downloadCenter.init()`（在 player/downloadManager init 后，DB 已就绪）。

## Validation

- `preview_ui` 编译整依赖链通过：download_center / library index / all_songs（+batch helper）/ search+discover+player 均 render 成功（DB not initialized 属预览预期）。
- 孤立 TS 诊断仅剩相对导入假阳性 + 既有 `implicitly any`（非本次改动行）。
- 待真机验证：见 Done Contract；重点 pause→resume 的 206/200 分支、最小化续传、被杀重进 paused 可续。

## Resume / Handoff

- 断点续传仅在「part 文件存在 且 partUrl === 当前解析 URL」时用 Range；mp3juice 直链每次 resolve 可能换 CDN，换 URL 自动重下（安全）。
- 后台保活沿用既有策略（播放中跳过 keepAlive，靠音频会话；否则 keepAlive）；paused 任务保留 keeper 有利续传。
- 真机若发现暂停后进度条不动/awaiter 卡住，查 `onEngineProgress` 的 paused 分支与 `freeSlot`。
