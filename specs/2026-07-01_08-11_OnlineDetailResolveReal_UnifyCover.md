# 在线详情页曲目下载/播放修复 + 播放页封面统一

- 日期：2026-07-01 08:11
- 状态：实现中

## 背景 / 用户反馈

1. 搜索页「专辑」「艺人」进入的在线详情页，点曲目**无法下载/播放**。
2. mini player（`PlayerInfo`）展示的专辑封面与 player 页（`Cover`/`CoverBackground`）**不是同一张图**。

## Bug 1：在线详情页曲目无法下载/播放

### 根因

- `page/search/online_detail.tsx` 的 `trackToMusic`/`trackToMusicData` 把曲目 `id` 设为 `String(t.trackId)`（iTunes 曲目 ID），`provider:"mp3juice"`，**无 `source_id`**。
- 播放/下载最终走 mp3juice `resolveAudioUrl`：
  ```ts
  youtubeUrl(info) => `https://www.youtube.com/watch?v=${info.source_id ?? info.id}`
  ```
  iTunes trackId 不是 YouTube videoId → 拼出的 URL 无效 → savetube 解析必然失败。
- 下载虽有 `findReplacementSource`（用「歌名 艺人」搜 mp3juice）兜底，但要过 `MATCH_THRESHOLD`，命中不稳。
- **此前 PROJECT_MEMORY 关于「mp3juice 按标题+艺人搜，不依赖 id」的说法是错误假设**：mp3juice 只用 id 拼 YouTube URL，从不按标题搜。

### 正确姿势（发现页已有）

发现页 `resolveReal(t)`：先 `music.search("标题 艺人")` 拿首条真实 mp3juice 源（真实 id + source_id），再 `playNext`/下载/加歌单。

### 修复方案

1. 抽共用工具 `class/sources/resolve_real.ts`：
   - `resolveRealMusic(meta): Promise<Music | null>`——输入 `{ title, artist, album?, duration?, cover? }`，`music.search("标题 艺人")` 取首条映射成完整 `Music`（真实 id/source_id/provider）。
   - 发现页 `resolveReal` 改为调用它（消除重复）。
2. `online_detail.tsx` 的 `OnlineAlbumDetail` 曲目区**不再直接用 `SearchResultCard`**（它假定 `info.id` 即可解析源）。改为自建曲目行 `OnlineTrackRow`：
   - 点击/下载/加歌单前先 `resolveRealMusic` 解析真实源，再交给 player/downloadManager/database。
   - 「播放全部/随机」：先并发/顺序解析队列（至少解析首曲即播，其余后台补齐），或点即解析首曲播放。为简单稳健：播放全部＝解析首曲即播 + 后台解析其余入队。
   - 曲目行加「解析中」态（spinner），解析失败提示。

## Bug 2：mini player 与 player 页封面不一致

### 根因

| 组件 | 已下载 | 未下载 |
|---|---|---|
| `PlayerInfo`（mini） | 本地文件 `UIImage.fromFile(getCoverPath(id))` | `cover_url` 远程 |
| `Cover`/`CoverBackground`（player 页） | `cover_url` 远程（从不读本地） | `cover_url` 远程 |

已下载歌若 DB `cover_url` 与本地 `saveCover` 存的图不同（典型：下载走了 `findReplacementSource` 换源），两处显示不同封面。

### 修复方案

抽共用 hook `page/player/use_cover.ts`（或放 class）：`useResolvedCover(music)` 返回 `{ localImage: UIImage|null, remoteUrl: string|null }`，规则：已下载优先本地文件、否则远程 `cover_url`。`Cover`/`CoverBackground`/`PlayerInfo` 三处统一用它。

- `Cover`：有 localImage 用 `image=` 渲染，否则 `imageUrl=cover_url`。
- `CoverBackground`：模糊 banner 同理，localImage 优先。
- `PlayerInfo`：改用同 hook（当前逻辑等价，收敛即可）。

## 影响文件

- 新增 `class/sources/resolve_real.ts`
- 改 `page/discover/index.tsx`（resolveReal → 共用）
- 改 `page/search/online_detail.tsx`（曲目行走真实源 + 解析态）
- 新增 `page/player/use_cover.ts`
- 改 `page/player/cover.tsx`、`page/components/player_info.tsx`

## 验证

- preview_ui 编译整依赖链无错。
- 真机：搜索专辑→进详情→点曲目播放/下载成功；已下载歌 mini 与 player 页封面一致。

## Change Log

- `92e3f1d1` 实现：
  - 新增 `class/sources/resolve_real.ts`：`resolveRealMusic(meta)`（“标题 艺人”搜 mp3juice 取首条真实源）；发现页 `resolveReal` 改为调用它（删重复，移除未用 `music` import）。
  - `online_detail.tsx`：删除 `trackToMusic/trackToMusicData` 及对 `SearchResultCard` 的误用；新增 `OnlineTrackRow`（点击/下载/加歌单先 `resolveRealMusic` 解析真实源，解析中 spinner、失败红叹号、已下绿勾）；“播放全部/随机”改为解析首曲即播 + 后台逐首解析入队；新增加歌单 sheet（PlaylistPickerContent）。`isPlaying` 改用标题归一化匹配（真实源 id ≠ iTunes trackId）。
  - 新增 `page/player/use_cover.ts`：`useResolvedCover(music)` 返回 `{localImage, remoteUrl}`，已下载优先本地文件。`Cover`/`CoverBackground`/`PlayerInfo` 三处统一用它，修复 mini 与 player 页封面不一致。
- 验证：`preview_ui` 编译整依赖链通过（仅 usePlayerState 无 Provider 的运行时报错，预期）。真机待测。
