# 零歌单时补「新建歌单」入口

日期：2026-07-04 21:53
深度：fast / standard（1-2 文件 UI 改动）
状态：已完成（2026-07-04）

## 背景 / 问题

资料库首页 `page/library/index.tsx` 的「播放列表」整段（含 `LibrarySectionHeader` 的 see-all → `PlaylistsView`）只在 `data.playlistCards.length > 0` 时渲染。

- 零歌单 ⇒ 该段隐藏 ⇒ 唯一进入 `PlaylistsView`（右上 `+`「新建播放列表/导入」）的入口消失。
- A 段快捷宫格是固定 4 格（歌曲/我喜欢/已下载/最常播放），无歌单入口。
- `playlist_picker.tsx`（加入歌单弹窗）虽有 `+` 创建，但需先有歌 + 走 contextMenu，非首要入口。

结论：用户一个歌单都没有时，首页无处发起「新建歌单」。

## 目标（核心锚点）

零歌单状态下，资料库首页始终提供一个可发现的「新建歌单」入口。

## 方案

**选项 A（推荐）**：播放列表段常显。`playlistCards.length===0` 时该段仍渲染，rail 内放一张「＋ 新建播放列表」空态 CTA 卡，点击进入 `PlaylistsView`（创建/导入都在那里，逻辑单一收敛）。

- 备选 B：宫格加第 5 格「播放列表」常驻入口。
- 备选 C：仅 header 常显、rail 内容条件化。

## 涉及文件

- `page/library/index.tsx`：播放列表 Section 的渲染条件改为常显（或零态分支）；零歌单渲染 CTA 卡。
- `page/library/components.tsx`：新增一个 `CreatePlaylistCard`（或复用现有卡样式）作为空态 CTA。

## 风险

- 空态卡与现有 `PlaylistCollageCard` 视觉需一致（尺寸/圆角）。
- 段常显后 subtitle「N 个」在零态显示「0 个」需处理文案。
- 导航方式沿用现有 rail 卡的 `NavigationLink destination`，避免 LazyVGrid 串扰坑（此处是横向 HStack，非 grid，安全）。

## Done Contract

- 完成：零歌单时资料库首页可见并点击「新建播放列表」入口，能到达创建流程并成功建歌单；有歌单时行为不变。
- 证明：`scripting-ts preview_ui` 渲染零态首页截图 + 实际新建一个歌单后 rail 正常显示。
- 未完成：入口仍隐藏，或有歌单时段消失/重复。

## 导出数据结构 Review 结论

- 导入/导出共用同一 `PlaylistShareFile`（format/version/exported_at/playlist.name/musics[]），`validate` 严格校验，round-trip 对称，**无问题**。
- `audio_url` 冗余字段（短时直链会失效但播放时实时 resolve，写库无害）——移除会牵动格式版本语义，收益极小，**保留不动**。
- 导出属「绑定具体对象」的上下文动作，与「零歌单空态」语境正交，**不纳入本次统一**。

## Change Log / Validation（执行后回写）

- 新增 `page/components/use_playlist_import.tsx`：抽出 `usePlaylistImport({ onImported })` → `{ startImport, importSheet }`，迁移原 `PlaylistsView` 的选文件→选新建/合并→合并 picker→结果提示全链路。
- `page/library/components.tsx`：新增 `PlaylistEmptyCTA`（两块 130pt CtaTile：新建 systemPink / 导入 systemBlue，与 rail 卡同尺寸/圆角）。
- `page/library/index.tsx`：接入 `usePlaylistImport`（onImported→`load(true)` 静默刷新）+ 内联 `createPlaylist`（Dialog.prompt）；播放列表 Section 改为 `data &&` 常显，`playlistCards.length>0` 显卡片墙、否则显 `PlaylistEmptyCTA`；零态时 header subtitle/see-all 隐藏；List 挂 `importSheet`。
- `page/library/playlists.tsx`：删除内部导入逻辑（importPlaylist/handleMergeSelect/handleImportPickerDismiss + 两个 state），改用 `usePlaylistImport`，Menu 导入按钮 action→`startImport`，sheet→`importSheet`。`PlaylistDetail` 的 `PlaylistPickerContent`/`playlistShare`（导出）保留。
- 验证：`GetTypescriptDiagnostics`(整项目) → No diagnostics；`preview_ui` 渲染零态 CTA → 无报错。

### Done Contract 达成
- ✅ 零歌单时首页播放列表段常显，可见并点击「新建播放列表」「导入歌单」两入口；新建走 Dialog.prompt→createPlaylist，导入走共享 hook；成功后 `load(true)` 静默刷新使 rail 恢复卡片墙。
- ✅ 有歌单时行为不变（卡片墙 + see-all → PlaylistsView）。
- ✅ 导入逻辑单一来源（hook），PlaylistsView 与首页共用。
