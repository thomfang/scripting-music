# 资料库页面重设计：横向卡片化 + 播放列表拼图封面 + 详情页对齐

- **日期**：2026-06-30 09:50
- **状态**：已批准（Q1 精简 4 格 / Q2 ≥4 才 2×2 / Q3 N首+总时长+更新时间）
- **范围**：`page/library/index.tsx`、`page/library/components.tsx`、`page/library/playlists.tsx`；导出 `ArtistDetail`/`AlbumDetail`（artists.tsx/albums.tsx）供首页卡片跳转。

## 1. 目标（用户诉求拆解）

1. **收敛重复入口**：`播放列表` 当前同时在「快捷宫格」和「资料库分类列表」出现 → 去重。
2. **艺人/专辑/播放列表 横向卡片化**：像「最近添加」一样用横向 ScrollView + 封面图展示，替换现在 D 段的纯文字 NavigationLink 列表。
3. **播放列表封面 = 前几首歌封面拼图**（collage），在首页卡片与播放列表列表行都采用。
4. **播放列表详情页重设计**，与专辑详情页（`AlbumHeader`）视觉对齐：顶部封面拼图大图 + 名称 + 统计 chips + 播放/随机，下方歌曲列表与全部交互零改动。

## 2. 现状（已读代码确认）

- `index.tsx` 段落：A 快捷宫格（6 入口，含播放列表）→ B 最近添加（横向卡，130pt，已是目标形态）→ C 最爱/常听（竖向行）→ D 资料库分类（竖向：艺人/专辑/播放列表，纯图标文字）。
- 首页用**编程式导航** `navPresented(Observable)` + `navTarget`，因 List row 内多 NavigationLink 命中区会串扰。卡片跳转应复用这套（Button + onSelect → 设置 navTarget）。
- `components.tsx` 已有：`LibrarySectionHeader`（含 seeAll 箭头）、`QuickEntryGrid/Card`、`RecentlyAddedCard`（130pt 方封面卡，local→remote→占位）、`FavoriteSongRow`。封面规则：本地 `coverExists` 优先 `filePath`，否则 `cover_url`，再否则占位。
- `playlists.tsx`：`PlaylistsView`（新建/导入 + 列表行 `music.note.list` 图标）、`PlaylistDetail`（无 header，直接 播放全部/随机 + 歌曲列表）。
- 数据：`getMusicByArtist()`/`getMusicByAlbum()` 返回 `{...,count,musics}[]`；`getAllPlaylists()` 返回 `Playlist[]`（有 `music_count`，无歌曲）；`getPlaylistMusic(id)` 按 position 返回 `Music[]`。
- 封面：`fileManager.coverExists(id)`（带 cache）、`getCoverPath(id)`；远程 `music.cover_url`。
- 艺人头像来自 `artistInfo.fetch(name)`（TheAudioDB thumb）；专辑封面 `albumInfo.fetch(artist,album)` 或本地 `musics[0].cover_url`。

## 3. 决策（待用户确认）

### D1 信息架构（首页段落重排）
- **A 快捷宫格**：精简为 4 个「功能型」入口，干净 2×2 → **歌曲、我喜欢、已下载、最近播放**。
  - 移除宫格里的 `播放列表`（改为下方横向卡片墙）与 `最爱精选`（与 C「最爱/常听歌曲」段重复，C 的 seeAll 已可达 TopPlayed）。
- **B 最近添加**：保留（横向卡，130pt）。
- **新增 艺人 横向卡片墙**：圆形头像卡（`artistInfo` thumb，查不到→占位）+ 艺人名 + 「N 首」。seeAll → `ArtistsView`。
- **新增 专辑 横向卡片墙**：方形封面卡（`albumInfo`/本地回退）+ 专辑名 + 艺人。seeAll → `AlbumsView`。
- **新增 播放列表 横向卡片墙**：拼图封面卡 + 列表名 + 「N 首」。seeAll → `PlaylistsView`。
- **C 最爱/常听歌曲**：保留竖向行。
- **删除 D 资料库分类纯文字列表**（被三个卡片墙取代）。
- 段落顺序建议：A 宫格 → B 最近添加 → 艺人 → 专辑 → 播放列表 → C 最爱/常听。
  - 备选 D1'：宫格保留 6 格不动，仅把 D 段换成卡片墙。**默认采用 D1（精简宫格）**，更干净、彻底去重。

### D2 封面拼图（collage）规则（仿 Apple Music / Spotify）
- 取播放列表**前若干首**歌：
  - **≥4 首 → 2×2 拼图**（前 4 首封面）。
  - **1–3 首 → 单张**（第 1 首封面）。
  - **0 首 → 占位图标**（`music.note.list`，柔色底）。
- 每格封面解析：本地 `coverExists`→`filePath`；否则 `cover_url`（onError 占位）；否则 `music.note` 占位格。
- 抽 `CoverCollage({ musics, size, cornerRadius })` 复用组件（首页卡 130pt、列表行 50pt、详情 header 大图共用）。

### D3 艺人卡片图形
- 圆形头像（与艺人列表行/详情一致，`clipShape="capsule"`），约 110–120pt 直径；查不到/失败→ `person.circle.fill` 占位。懒加载（每卡自 `artistInfo.fetch`，内存缓存去重）。

### D4 播放列表详情页 header（对齐 AlbumHeader）
- 顶部：拼图封面放大 `blur` + 暗渐变 SCRIM 作 banner；前景清晰拼图封面（约 150pt，圆角）+ 列表名（白、bold）+ 统计 chips（`N 首`、总时长）+（可选）创建时间。
- header 之下保留现有「播放全部/随机」Section + 歌曲列表 Section + 编辑/批量/下载/分享全部交互，**零改动**。
- 编辑态隐藏 header（与艺人/专辑页一致）。
- 空列表（0 首）：header 用占位封面、仅显示名称与「0 首」，或退化为无 banner 文字头。

### D5 卡片跳转
- 导出 `ArtistDetail`（artists.tsx）、`AlbumDetail`（albums.tsx）；新增导出 `PlaylistDetailPage`（playlists.tsx 包装 `PlaylistDetail`，`onDeleted` 回首页 reload）。
- 首页卡片 onTap → 复用 `navTarget`/`navPresented` 编程式 push 到对应 detail。

### D6 数据加载与性能
- 首页 `load()` 增量：
  - 艺人/专辑：已在 load 中取到 `getMusicByArtist/Album`，各取前 **N（建议 12）** 做卡。
  - 播放列表：`getAllPlaylists()` 后，对**展示的前 N（建议 10）个**播放列表各 `getPlaylistMusic(id)` 取**前 4 首**（用于拼图）。并发 + 限制数量，避免一次性全量查询。
  - 拼图所需 `coverExists`：把这些封面目标并入现有 `coverExists` 预查 Map。
- 卡片墙均 `data.xxx.length>0` 才渲染；空态回到现状（宫格 + 空库引导）。

## 4. 实现设计

### 4.1 `components.tsx` 新增
- `CoverTile({ music, size, cornerRadius })`：单格封面，自查 `coverExists`，local→remote→占位。
- `CoverCollage({ musics, size, cornerRadius })`：按 D2 规则 2×2 / 单张 / 占位。
- `ArtistCircleCard({ artist, count, onTap })`：圆头像（懒加载 `artistInfo`）+ 名 + 「N 首」。
- `AlbumCoverCard({ album, artist, musics, onTap })`：方封面（`albumInfo`/本地回退，仿 RecentlyAddedCard）+ 专辑 + 艺人。
- `PlaylistCollageCard({ playlist, musics, onTap })`：`CoverCollage` 130pt + 名 + 「N 首」。
- （可选）`HorizontalCardRail`：统一 `ScrollView axes="horizontal"` + `HStack spacing padding` 包装，减少重复。

### 4.2 `index.tsx`
- `LibraryData` 增 `artistsCards/albumsCards/playlistsCards`（含各自 musics 子集 + count）。
- `quickEntries` 砍到 4 个。
- 段落按 D1 顺序重排；三个新卡片墙用 `LibrarySectionHeader`（带 seeAll）+ 横向 ScrollView + 卡片。
- 卡片 onTap → `setNavTarget(<XxxDetail .../>)` + `navPresented.setValue(true)`。

### 4.3 `playlists.tsx`
- `PlaylistsView` 列表行：`music.note.list` 图标 → `CoverCollage`（50pt）。
- `PlaylistDetail`：插入 `PlaylistHeader`（拼图 banner + 名 + chips），编辑态隐藏；其余零改动。
- 导出 `PlaylistDetailPage` 包装。

### 4.4 `artists.tsx` / `albums.tsx`
- `export` 现有 `ArtistDetail` / `AlbumDetail`（仅加 export，无逻辑改动）。

## 5. 不改动
- `database.ts` / `SongRow` / `player` / `file_manager` 逻辑零改动（仅多调用既有只读方法）。
- 各详情页搜索/排序/编辑/批量/下载/分享/加歌单逻辑全保留。

## 6. 复用已验证的坑
- `clipShape={{type:"rect",cornerRadius}}` 方形圆角；圆形用 `capsule`。
- `Rectangle` 渐变 fill 直接 `{colors,startPoint,endPoint} as any`（复用 `BANNER_SCRIM`）。
- 函数组件作 List 直接子节点首帧不要裸 `return null` → 空 `<Section/>`。
- banner 前景 VStack 不要同层 `padding + frame(maxWidth:"infinity")`，去 `frame` 让 ZStack 居中、底层 Rectangle 撑满（commit `87241920`）。
- List row 内多 NavigationLink 命中区串扰 → 首页卡片走编程式 `navTarget`/Button。
- 横向 ScrollView 作 List row：`listRowInsets={0}` + `listRowSeparator="hidden"`，内层 `HStack padding`（现状 B 段写法）。

## 7. 验证计划
- node 侧：无新数据源（复用 artist_info/album_info，已验证）。
- Scripting 侧：临时 `_preview.tsx`（PlayerStateProvider + NavigationStack + LibraryView）`preview_ui --screenshot`；DB 未 init → 走 catch 空态，主要验证编译 + 不崩。拼图/详情 header 另建带 mock musics 的 `_preview_xx.tsx` 真实截图验证布局。
- 真机：卡片墙加载、拼图封面、详情 header、跳转、空态/降级待用户 App 内确认。

## 8. Open Questions（已拍板）
- Q1：✔ 宫格精简为 4 格（歌曲/我喜欢/已下载/最近播放），移除「最爱精选」「播放列表」。
- Q2：✔ 拼图规则 ≥4 才 2×2，1–3 单张，0 占位。
- Q3：✔ 详情页 chips = 「N 首 + 总时长 + 更新时间」。

## 9. Change Log
- 2026-06-30：实现完成。
  - `components.tsx` 新增：`CoverTile`（单格封面，本地 coverExists→远程 cover_url→占位）、`CoverCollage`（≥4 → 2×2，1–3 → 单张，0 → 占位，支持 `blur` 作模糊 banner）、`ArtistCircleCard`（118pt 圆头像懒加载 artistInfo）、`AlbumCoverCard`（130pt 方封面，albumInfo/本地回退）、`PlaylistCollageCard`（130pt 拼图）、`HorizontalCardRail`。
  - `index.tsx`：宫格精简为 4 格（歌曲/我喜欢/已下载/最近播放）；段落重排为 A 宫格 → B 最近添加 → 艺人横滑 → 专辑横滑 → 播放列表横滑 → C 最爱/常听；删除 D 段纯文字分类（去重）；load 增量加载 artistCards/albumCards/playlistCards（各限 12/12/10，播放列表并发拉前 4 首做拼图）；卡片点击走现有编程式 `navTarget`/`pushDetail` push 到各 detail。
  - `playlists.tsx`：`PlaylistsView` 列表行图标 → `CoverCollage`（50pt），load 并发拉各歌单前 4 首；新增 `PlaylistHeader`（拼图放大 blur(28) 模糊 banner + SCRIM + 前景 150pt 拼图 + 名称 + chips「N 首/总时长/更新时间」）插在「播放全部/随机」前，编辑态隐藏，歌曲列表与全部交互零改动；导出 `PlaylistDetailPage` 包装。
  - `artists.tsx`/`albums.tsx`：`export` 现有 `ArtistDetail`/`AlbumDetail`（仅加 export）。
  - preview_ui 验证：首页编译通过；mock 数据截图确认 PlaylistHeader（模糊 banner+前景拼图+3 chips 含更新时间）、卡片墙、列表行 50pt 拼图（四宫格/单图/占位）布局正确。

### 踩坑
- 拼图 banner 背景需填满屏宽：用 `CoverCollage size={Device.screen.width}` + 外层 `ZStack frame maxWidth:infinity height:300 clipped` 裁出，不用固定 300 方图（否则两侧留白）。

### 跟进调整（2026-06-30 10:45，用户反馈去重）
- 底部 C 段「最爱歌曲」与顶部宫格「我喜欢」同维度重复 → C 段改为 **最近播放**（`last_played_at` 倒序，seeAll → RecentlyPlayedView）。
- 为避免与 C 段再重复，顶部宫格「最近播放」→ **最常播放**（`flame.fill`，play_count，TopPlayedView）。最终维度无重复：歌曲/我喜欢/已下载/最常播放（宫格）+ 最近播放（底部行）。
- `LibraryData` 移除 `favoriteRows`/`favByPlayCount`，新增 `recentlyPlayedRows`。
