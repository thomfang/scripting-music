# 播放页横向溢出 + 歌词不加载 修复

日期：2026-06-29 19:49
模式：fast（micro-spec）

## 目标
1. 修复播放页「横向超了」——歌词长行撑宽整页。
2. 修复「打开播放页时歌词不加载」，尤其播放一段时间后再点开播放页。

## 根因
- **横向溢出**：`page/player/lyric.tsx` 歌词 `Text` 无 `maxWidth`/`lineLimit`，外层 `VStack` 无 `maxWidth`，垂直 ScrollView 不约束横向 → 长句按 intrinsic 单行宽撑开 → 整页横向溢出。只有词真正加载且有长句时才出现，符合「播一会儿才超」。
- **歌词不加载**：`Lyric` 拉词 effect 依赖 `[currentMusic?.id]`。播放页挂在 sheet（`page/index.tsx` sheet.content=`<PlayerView/>`）。sheet 子树可能在 currentMusic 还是 null 时就构建，effect 提前 return；之后 id 变化时未呈现的子树不一定重跑 effect → 看到的是从未拉词的实例。

## 方案
- A（lyric.tsx）：歌词 `Text` 加 `frame={{maxWidth:"infinity"}}` + `multilineTextAlignment` 保留居中；外层 VStack 加 `frame={{maxWidth:"infinity"}}`；Placeholder/PlainLyric 同样约束。彻底消除横向溢出。
- B（lyric.tsx）：把拉词逻辑对 currentMusic.id 更鲁棒——effect 在 id 变化时无条件重置并拉取；并在 `page/player/index.tsx` 给 `Lyric` 设 `key={currentMusic?.id}` 强制每次身份变化重挂载，确保打开播放页时按当前歌拉词。

## Done Contract
- 真机：播放含长句歌词的歌，页面不再横向溢出。
- 真机：播放一段时间后点开播放页，歌词能正确加载/高亮滚动。
- preview_ui 编译通过（exit 0）。

## Change Log
- A（lyric.tsx）：`SyncedLyricList`/`PlainLyric` 的 ScrollView 加 `frame.maxWidth:"infinity"`；内部 VStack 加 `frame.maxWidth:"infinity"`；`LyricRow` 的 Text 与 PlainLyric 每行 Text 加 `frame.maxWidth:"infinity"`；Placeholder VStack 加 `width:"infinity"`。长句自动换行不再撑宽整页。
- B（player/index.tsx）：`PlayerPage` 引入 `usePlayerState()` 取 `currentMusic`，给 `<Lyric key={currentMusic?.id ?? "none"} />` —— 歌曲身份变化强制重挂载，拉词 effect 必然重跑，修「播一段时间后再点开播放页歌词不加载」。

## Validation
- preview_ui 编译通过（exit 0），临时 `_preview.tsx` 已删。
- 真机交互（长句歌不再横向溢出 / 播放一段后点开播放页歌词正确加载滚动）待用户在 App 内确认。

## 补充修复 C（真正根因，2026-06-29 19:57）
- 现象：B 生效后歌词能加载，但整页（封面/标题/控件）比 sheet 宽、左右对称被截。
- 根因：`page/player/index.tsx` 根 `VStack` 无显式宽度。**sheet 向内容提出「无限宽」布局**，`maxWidth:"infinity"` 并不能把 VStack 钉在屏宽 → 最宽子（长歌词行的 ideal 单行宽）把整列撑超屏幕，居中后两边裁。
- 证据：`_repro.tsx` 对照截图——仅 `maxWidth:"infinity"` 仍裁；改 `frame={{ width: Device.screen.width }}` 后成功钉在屏宽内。
- 修法：根 VStack 加 `frame={{ width: Device.screen.width }}`（保留原 leading/trailing 24 padding）。
- 教训：**Scripting 里 `maxWidth:"infinity"` 不等于「限在父宽」**；当父（如 sheet）提出无限宽时，只有显式有限 `width` 能防止子内容 ideal 宽撑爆容器。
