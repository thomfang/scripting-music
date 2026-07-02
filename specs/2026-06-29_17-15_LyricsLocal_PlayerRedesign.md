# Spec: 歌词本地化 + 播放页现代化重设计

- 日期: 2026-06-29 17:15
- 模式: standard（多文件，含数据/存储与 UI 重做）
- 项目: Scripting Music (iCloud scripts/Scripting Music)

## 核心目标（Loop Anchor）
1. **歌词随歌本地化**：下载歌曲时把歌词（synced LRC + plain）持久化到本地，与封面同生命周期——删歌时一并删除。播放时优先读本地，缺失再在线 LRCLIB。
2. **播放页重设计**：以专业音乐 App 视角重做播放页视觉，运用 SwiftUI 渐变/动画/现代排版，提升质感。

## 范围与文件

### A. 歌词本地化
- `class/file_manager.ts`：新增 `lyricsDir`（`<root>/lyrics`）、`getLyricsPath(id)`（`.lrc`/`.json`）、`saveLyrics(id, result)`、`readLyrics(id)`、`deleteLyrics(id)`、`lyricsExists(id)`、init 时建目录、`sumDirSize` 计入存储统计、`deleteCover` 同款缓存。
  - 存储格式：JSON `{ synced: LyricLine[]|null, plain: string|null }`，文件 `<id>.json`。
- `class/sources/lyrics.ts`：保持在线获取不变；歌词模块只负责网络，本地落盘由 file_manager + 下载链路负责。
- `class/fetch_downloader.ts`：下载成功保存音频/封面后，**额外** `lyrics.fetchLyrics(...)` 取歌词并 `fileManager.saveLyrics(id, result)`（失败静默，不阻断下载）。注意 id 用 `musicInfo.id`（与封面/音频一致）。
- `class/database.ts deleteMusic` + `class/fetch_downloader.ts deleteDownload`：删除处补 `fileManager.deleteLyrics(id)`。
- `page/player/lyric.tsx`：取歌词逻辑改为「先本地 `fileManager.readLyrics(id)` → 命中直接用；否则在线 `lyrics.fetchLyrics`」。

### B. 播放页重设计
- `page/player/index.tsx`：引入动态渐变背景（基于封面或粉色主题 LinearGradient），重排布局层次与留白。
- `page/player/cover.tsx`：封面加圆角阴影 + 播放/暂停时缩放动画（播放放大、暂停缩小，`scaleEffect`+`animation`）。
- `page/player/title.tsx`：标题排版与渐变/字重优化。
- `page/player/slider.tsx`：进度条更精致（保留拖拽逻辑，调 tint/字体/间距）。
- `page/player/control.tsx`：控制按钮视觉升级（**保留全部既有逻辑**：下载真实源、播放模式、队列），主播放键突出。
- `page/player/lyric.tsx`：高亮行动画（颜色/字重/缩放过渡），自动滚动保留。

## 约束与风险
- **不破坏播放/下载逻辑**：control.tsx 的 resolveRealSource/handleDownloadCurrent、slider 拖拽 seek、player_state hooks 全部保留。
- 二进制写入用既有 `writeBytesCompat`/`writeAsData` 兼容路径（歌词是文本，可用 `FileManager.writeString`，确认 API）。
- 渐变背景取色：UIImage 主色提取在 Scripting 不一定有 API → 降级用固定粉黑主题渐变（先验证有无取色 API，无则固定主题）。
- 动画 API（`animation`/`scaleEffect`/`matchedGeometryEffect`）需逐一确认 Scripting 支持。
- 孤立 TS 诊断假阳性照旧，验证用 preview_ui。

## Done Contract
- 下载一首歌后，本地 `lyrics/<id>.json` 存在；删除该歌后该文件消失；播放页能读到本地歌词且无网时仍显示。
- 播放页 preview_ui 编译通过、视觉为现代渐变+动画风格；既有播放/下载/队列/拖拽功能不回归。
- 未完成判定：任一既有功能回归、写/删歌词未对齐、preview 编译失败。

## Change Log

### A. 歌词本地化（已完成）
- `class/file_manager.ts`：新增 `lyricsDir`（`<root>/lyrics`）、`getLyricsPath(id)`→`<id>.json`、`saveLyrics(id,data)`（`FileManager.writeAsString(JSON.stringify)`）、`readLyrics<T>(id)`（不存在/解析失败→null）、`lyricsExists(id)`、`deleteLyrics(id)`；`init()` 建 lyrics 目录；`getStorageSize()` 并行 sum 计入 lyricsDir。歌词是文本→直接 `writeAsString`，无需 writeBytesCompat。
- `class/fetch_downloader.ts`：`import { lyrics }`；下载成功 `database.addMusic` 后 `lyrics.fetchLyrics(...)` + `fileManager.saveLyrics(musicInfo.id, result)`，失败静默不阻断下载；`deleteDownload` 补 `fileManager.deleteLyrics(musicId)`。
- `class/database.ts`：`deleteMusic` 的 `is_downloaded` 分支补 `fileManager.deleteLyrics(id)`。
- `page/player/lyric.tsx`：切歌取歌词改为 **本地优先**（`fileManager.readLyrics<LyricsResult>(id)`，命中 synced/plain 直接用）→ 否则在线 `lyrics.fetchLyrics`。

### B. 播放页重设计（已完成）
- `page/player/index.tsx`：根容器改 `ZStack`，底层 `CoverBackground`（`ignoresSafeArea` 铺满），上层 VStack 内容；handle/封面/留白/间距按深色背景重排。
- `page/player/cover.tsx`：新增 `CoverBackground` 导出——放大封面(`scaleEffect=1.5`)+重模糊(`blur=48`)+暗色渐变遮罩(`Rectangle fill={gradient}`)，无封面回退 `#3A1530→#1A0A18→#000000` 渐变。`Cover` 前景加播放/暂停 `scaleEffect`(1↔0.86)+`Animation.smooth(0.45)` 呼吸动画。
- `page/player/title.tsx`：白色大字号 `title` + 0.7 白副标，水平 marquee 保留。
- `page/player/slider.tsx`：tint 改 `white`、时间标签 `rgba(255,255,255,0.6)`，**拖拽/seek 逻辑零改动**。
- `page/player/control.tsx`：全部按钮改白色 tint、上一首/下一首用 `backward.fill`/`forward.fill`(font28)，主播放键 `font64`+播放/暂停 `scaleEffect`+`Animation.smooth(0.3)`，禁用态 `rgba(255,255,255,0.3)`；下载键命中绿色。**handleDownloadCurrent/resolveRealSource/itunes_preview 真实源解析逻辑全部保留**。
- `page/player/lyric.tsx`：高亮行 `scaleEffect`(1.06)+`Animation.smooth(0.3)`+白/0.4白 过渡；plain/placeholder 文字改深底亮色。自动滚动 `scrollTo(idx,"center")` 保留。

### 关键技术点
- **Scripting 无封面取色 API**（UIImage 无 averageColor/dominantColor/像素读取）→ 采用「模糊封面背景」方案，固定粉黑渐变为无封面回退。
- `LinearGradient` 是**类型不是 JSX 组件**→ 渐变通过 `Rectangle fill={{ gradient:{colors,startPoint,endPoint} } as any}` 应用。
- view `animation` prop 需 `Animation` 实例：`{ animation: Animation.smooth({duration}), value }`。`Animation` 是全局类无需 import。
- `id` 不在 TextProps，经 `{...{id:index} as any}` 注入供 scrollTo。

## Validation
- `preview_ui page/player/_preview.tsx`（临时 `export default` 包 `PlayerStateProvider`+`PlayerView`）→ exit 0，整依赖链编译通过、渲染成功；验证后删除临时文件。
- 歌词本地化数据层先前已在 file_manager/downloader/database 落地（Step1/2）。
- 真机交互（下载后 `lyrics/<id>.json` 存在性、删歌消失、无网读本地、动画观感）需用户在 App 内最终确认。

## Resume / Handoff
- 入口：`page/player/`、`class/file_manager.ts`、`class/fetch_downloader.ts`、`class/database.ts`、`class/sources/lyrics.ts`。
