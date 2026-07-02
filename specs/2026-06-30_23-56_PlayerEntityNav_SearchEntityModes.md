# 播放页艺人/专辑跳转 + 搜索页艺人/专辑搜索

- 日期：2026-06-30 23:56
- 类型：功能增强（导航 + 搜索维度）+ 组件模块化
- 关联：复用已有 `ArtistDetail`/`AlbumDetail`、`artistInfo`/`albumInfo` 数据源

## 1. 背景与目标

现状：
- 播放页 `title.tsx` 只把艺人名渲染成纯文本，专辑名根本不显示；无法从「正在播放」跳到该艺人/专辑。
- 艺人/专辑详情页（`ArtistDetail`/`AlbumDetail`）已存在且导出，但入口只有资料库侧栏。
- 搜索页只有「在线歌曲 / 本地歌曲」两种模式，无法按艺人/专辑维度检索本地库。
- 艺人/专辑「列表行」UI（圆头像行 / 方封面行）是 `artists.tsx`/`albums.tsx` 的模块私有函数，无法复用。

目标：
1. **播放页**：点击艺人名 → 弹出该艺人详情页；补充显示专辑名并点击 → 弹出该专辑详情页。数据来自本地库（"这首歌的艺人/专辑，我库里还有哪些"）。
2. **搜索页**：新增「艺人 / 专辑」两种搜索模式，检索本地库并进入对应详情页。
3. **模块化**：把艺人/专辑列表行抽成共享组件；搜索页按结果类型拆分子组件，避免 `SearchView` 继续膨胀。

## 2. 关键约束 / 数据源

- `PlayerView` 由 `page/index.tsx` 的 `TabView.sheet` 弹出，**本身不在 NavigationStack 内**。
  → 从播放页进详情页须用「**嵌套 sheet**（叠在播放页 sheet 上）+ sheet 内自带 `NavigationStack`」。
- 详情页 `ArtistDetail`/`AlbumDetail` 用 `navigationTitle`/`searchable`/`toolbar`，必须包在 `NavigationStack` 内才正常渲染标题栏。
- `database.getMusicByArtist()` → `{artist,count,musics}[]`（按 count 降序）。
- `database.getMusicByAlbum()` → `{album,artist,count,musics}[]`（key=`album|artist`）。
- `currentMusic`（`Music` 类型）含 `artist`/`album`；占位值 `未知艺术家`/`未知专辑` 不应可点。
- 导航坑（PROJECT_MEMORY）：禁用「共享 navTarget useState + navigationDestination + observable 同步 push」。
  → 本方案播放页用 **`.sheet={{isPresented, content}}`**（content 每次渲染由 state 求值，非命令式 push），无该竞态。
  → 搜索页艺人/专辑行在 NavigationStack 内、是**普通列表**（非 LazyVGrid），用声明式 `NavigationLink destination=` 每项独立。

## 3. 方案

### 3.1 共享列表行组件（模块化）

新建 `page/library/rows.tsx`，导出：
- `ArtistRow({ artist, count })`：圆头像（`artistInfo.fetch` 懒加载，失败/查无降级 `person.circle.fill`）+ 名称 + `N 首歌曲`。
- `AlbumRow({ album, artist, count, musics })`：圆角方封面（本地 `cover_url` 兜底 → `albumInfo.fetch` 覆盖 → 占位 `square.stack.fill`）+ 名称 + `artist · N 首歌曲`。

把 `artists.tsx` 的 `ArtistRowContent`、`albums.tsx` 的 `AlbumRowContent` 替换为 import 这两个共享组件（行为/样式不变）。

### 3.2 详情页增加可选 `onClose`

`ArtistDetail`/`AlbumDetail` 增加可选 prop `onClose?: () => void`：
- 传入时（播放页 sheet 场景，无系统返回键）→ toolbar `topBarLeading` 增加「关闭」按钮（仅 `!isEditing` 时）。
- 不传时（资料库 NavigationLink push 场景）→ 维持系统返回键，无变化。

### 3.3 播放页跳转

**`page/player/title.tsx`**（保持纯展示，加回调）：
- 新增可选 props：`onArtistTap?: () => void`、`onAlbumTap?: () => void`。
- 艺人名：有 `onArtistTap` 且艺人非占位 → 包 `Button`（`buttonStyle="plain"`，按下态可加细微高亮）；否则纯 `Text`（现状）。
- 新增专辑行（仅非 compact）：专辑存在且非占位时显示，带 `rectangle.stack` 小图标；有 `onAlbumTap` → `Button`。
- compact（歌词展开态）：仅标题 + 艺人（可点），不显示专辑，省空间。

**`page/player/entity_sheet.tsx`**（新建，承载详情加载 + NavigationStack 包裹）：
- `PlayerArtistSheet({ artist, onDismiss })`：`database.getMusicByArtist()` 找到该 artist 组（或 `getAllMusic` 过滤）→ loading 态 → `<NavigationStack><ArtistDetail artist musics onClose={onDismiss} /></NavigationStack>`。查无歌曲时显示空态。
- `PlayerAlbumSheet({ album, artist, onDismiss })`：同理用 `getMusicByAlbum()` 匹配 `album|artist`。

**`page/player/index.tsx`**（PlayerPage 管理 sheet 状态）：
- 新增 state `entityNav: { kind:"artist", artist } | { kind:"album", album, artist } | null`。
- `Title` 传入 `onArtistTap`/`onAlbumTap`（读 `currentMusic` 设置 `entityNav`）。
- 在根 ZStack 上挂 `.sheet={{ isPresented: !!entityNav, onChanged, content: entityNav ? <PlayerXSheet…/> : null }}`。

### 3.4 搜索页扩展 + 拆分

**模式**：`SearchMode = "online" | "local" | "artist" | "album"`，Picker 增加两段。

**`SearchView`（`page/search/index.tsx`）**：
- 新增 state：`artistResults: {artist,count,musics}[] | null`、`albumResults: {album,artist,count,musics}[] | null`。
- `doSearch` 按 mode 分派；新增 `doArtistSearch(q)`（`getMusicByArtist()` 过滤 artist 含 q）、`doAlbumSearch(q)`（`getMusicByAlbum()` 过滤 album/artist 含 q）。
- 渲染分支抽到子组件，降低主组件体积。

**`page/search/components/entity_results.tsx`**（新建）：
- `ArtistResultsSection({ artists, query })`：`NavigationLink destination={<ArtistDetail …/>}` 包 `ArtistRow`。
- `AlbumResultsSection({ albums, query })`：`NavigationLink destination={<AlbumDetail …/>}` 包 `AlbumRow`。

**`page/search/components/search_placeholder.tsx`**（新建，复用收敛）：
- `SearchPlaceholder({ state })`：把「正在搜索 / 失败 / 空 / 最近搜索」四类占位收进一个组件（props 驱动），主组件只判分支。
- （历史记录区因含 clearHistory 交互，可保留在主组件，或以回调传入；实现时择优。）

## 4. 影响文件

- 改：`page/player/title.tsx`、`page/player/index.tsx`、`page/library/artists.tsx`、`page/library/albums.tsx`、`page/search/index.tsx`
- 新：`page/player/entity_sheet.tsx`、`page/library/rows.tsx`、`page/search/components/entity_results.tsx`、（可选）`page/search/components/search_placeholder.tsx`

## 5. 验证

- `scripting-ts preview_ui` 各改动文件（含 `default export` wrapper）编译通过（运行期 DB/Context 报错在 preview 下属预期）。
- 真机：播放页点艺人/专辑分别弹对应详情页且数据正确；搜索页四模式切换、艺人/专辑结果点击进入详情；资料库原艺人/专辑列表行外观不变。

## 6. Change Log

### 2026-06-30 实现完成

**模块化基础件**
- 新建 `page/library/rows.tsx`：导出 `ArtistRow`（圆头像懒加载 + 名称 + N 首）、`AlbumRow`（方封面本地兜底→远程覆盖 + 名称 + artist·N 首）。
- `artists.tsx`：删除私有 `ArtistRowContent`，列表行改用 `ArtistRow`；`ArtistDetail` 增加 `onClose?` prop，toolbar 左侧在 `!isEditing && onClose` 时渲染「关闭」按钮。
- `albums.tsx`：同上，删除 `AlbumRowContent` 改用 `AlbumRow`；`AlbumDetail` 增加 `onClose?`。

**播放页跳转**
- `title.tsx`：纯展示改为支持回调。新增 props `onArtistTap`/`onAlbumTap`/`padding`。艺人名非占位（≠「未知艺术家」）且有回调时包 `Button`（plain + chevron）；新增专辑行（仅非 compact、非「未知专辑」），有回调时可点。compact 态仅标题+艺人。
- 新建 `page/player/entity_sheet.tsx`：`PlayerArtistSheet`/`PlayerAlbumSheet`，实时 `getMusicByArtist`/`getMusicByAlbum` 取本地库该艺人/专辑歌曲 → loading/空态 → `<NavigationStack>` 包 `ArtistDetail`/`AlbumDetail`（传 `onClose`）。专辑用 album+artist 精确匹配，退化仅 album。
- `index.tsx`：`PlayerPage` 加 `entityNav` state；根 `ZStack` 挂 `.sheet`（content 由 state 求值，无命令式 push 竞态）；Title 接入 `openArtist`/`openAlbum`。

**搜索页扩展**
- `SearchMode` 扩为 `online|local|artist|album`；Picker 增「艺人」「专辑」两段；prompt 文案按模式切换。
- 新增 state `artistResults`/`albumResults` + `doArtistSearch`/`doAlbumSearch`（`getMusicBy*` 过滤）；`showEmpty`/`has*Results` 覆盖四模式。
- 新建 `page/search/components/entity_results.tsx`：`ArtistResultsSection`/`AlbumResultsSection`（普通列表 + 声明式 `NavigationLink`，复用 `ArtistRow`/`AlbumRow`）。
- 新建 `page/search/components/search_placeholder.tsx`：`SearchPlaceholder`（searching/error/empty），主组件三处占位 JSX 收敛为一行调用。

**验证**
- 临时 `_preview_probe.tsx` 引用全部新/改导出，`preview_ui` 编译整依赖链通过（exit 0），已删除 probe。
- 真机交互待用户验证。
