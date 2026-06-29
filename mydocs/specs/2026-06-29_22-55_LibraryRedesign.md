# 资料库页重设计 Spec（参考发现页风格）

- 日期：2026-06-29 22:55
- 任务深度：deep（信息架构 + 视觉系统 + 多文件）
- 协议：sdd-riper-one-light
- 状态：**待用户审阅批准**（No Approval, No Execute）

---

## 0. Restate（我的理解）

当前「资料库」主页（`page/library/index.tsx`）是一个纯 `List + Label` 的**朴素导航菜单**：5 个 Section、9 个文字入口，无封面、无数据预览、无视觉重点，和已经重设计过的「发现」页（横向卡片墙 + 彩色 chips + 富 section header + 排名行）视觉语言完全割裂。

用户要：**以专业设计师视角、参考发现页风格，重做资料库主页**——优化布局、突出展示重点（最近添加、最爱歌曲等）、统一图标、增强细节。

核心目标（Loop Anchor）：**把资料库主页从「文字菜单」升级为「有内容预览、有视觉重点、与发现页同语言」的库首页，且不破坏任何现有子页面与播放/下载逻辑。**

---

## 1. 现状盘点（事实）

### 1.1 现有资料库主页结构
```
List(inset)
├─ Section            歌曲 / 我喜欢 / 已下载
├─ Section 智能播放列表  最近播放 / 最爱精选
├─ Section 播放列表     播放列表
└─ Section 资料库       艺人 / 专辑
```
问题：纯文字、信息密度低、无任何「内容」露出、Label 图标渲染模式不统一（hierarchical/multicolor 混用）、无快捷操作（播放全部/随机）、看不到库规模。

### 1.2 发现页设计语言（参考基准）
- 横向卡片墙：`ScrollView axes=horizontal` + 130pt 大封面卡（cornerRadius 14 + 柔投影 + 角标）。
- 富 Section header：`HStack` + SF Symbol 着色图标 + `title3 bold` 主标 + 右侧 `caption tertiaryLabel` 副标。
- 行：56pt 封面（cornerRadius 10 + 细阴影）+ 标题/艺人 + 状态徽标；正在播放变 `systemPink`。
- 主题色：`systemPink`（选中态/强调）；金银铜排名 `#D4AF37/#9CA3AF/#B87333`。
- chips：`clipShape="capsule"` + emoji + 选中 `systemPink` 背景 + 柔粉 shadow。

### 1.3 可复用资产
- `SongRow`（components/song_row.tsx）：完整歌曲行，props 丰富（queue/coverExists/收藏/删除/加歌单/下载）。
- `EmptyState` / `LoadingState`。
- 数据查询（database.ts）全部就绪：
  - `getAllMusic()` / `getDownloadedMusic()` / `getFavoriteMusic()`
  - `getRecentlyPlayed(limit)` / `getMusicByArtist()` / `getMusicByAlbum()`
  - `getAllPlaylists()`；`play_count`/`added_at`/`last_played_at` 字段齐全。
- `fileManager.coverExists(id)` / `getStorageSize()`。
- 子页面已存在且工作正常：AllSongs / Favorites / Download / RecentlyPlayed / TopPlayed / Playlists / Artists / Albums。

---

## 2. 设计方案（重点）

### 2.1 新信息架构（资料库主页从上到下）

```
List(plain 或 inset，待定见 §4)
│
├─【A 快捷入口宫格】2×3 彩色入口卡（替代原 3 个文字 Section 的核心入口）
│     歌曲 / 我喜欢 / 已下载 / 最近播放 / 最爱精选 / 播放列表
│     每张卡：SF Symbol 着色图标 + 名称 + 数量徽标（如「128 首」）
│
├─【B 最近添加】横向卡片墙（参考发现页「为你推荐」）
│     数据 = getAllMusic() 按 added_at 降序 Top 12
│     卡片：封面 130（无本地封面回退 cover_url）+ 标题 + 艺人 + 播放角标
│     点击 = 以「最近添加」为队列即时播放
│     header：clock.badge.plus 图标 +「最近添加」+ 右「查看全部」
│
├─【C 最爱歌曲】竖向 Top5 行（参考发现页排名行，但用心形/播放次数代替名次）
│     数据 = getFavoriteMusic()（不足则用 play_count Top）
│     行：56 封面 + 标题/艺人 + 播放次数小徽标；复用 SongRow 或精简版
│     header：heart.fill 粉色 +「最爱歌曲」+「查看全部」→ Favorites/TopPlayed
│
├─【D 资料库分类】艺人 / 专辑 / 歌单 入口（带数量）
│     保留为「列表式」入口（这些是层级浏览，不适合卡片墙）
│     统一 Label：filled symbol + hierarchical 渲染 + chevron
│
└─【E 存储信息】底部一行：已下载 N 首 · 占用 XX MB（tertiary 小字）
```

### 2.2 顶部「快捷入口宫格」细节（A）
- 用 `LazyVGrid`（columns=2 或 3）或 `FlowLayout`；每卡：
  - `VStack`：顶部圆角矩形色块内放 SF Symbol（白色 large），下方名称 + 数量。
  - 或 `HStack` 紧凑胶囊：色块图标 + 文字 + 数量。
- 配色：每类一个语义色（歌曲=蓝 / 我喜欢=粉 / 已下载=绿 / 最近播放=橙 / 最爱=黄 / 歌单=紫），统一 `fill` symbol + 白色图标在彩色圆角块上。
- 数量徽标实时来自各 query 的 `.length`（首屏并发拉一次）。

### 2.3 图标统一规范
- 全部用 **filled** 变体 + `symbolRenderingMode="hierarchical"`（除「我喜欢/最爱」用语义多色 heart/star）。
- 入口图标映射：
  - 歌曲 `music.note.list` / 我喜欢 `heart.fill` / 已下载 `arrow.down.circle.fill`
  - 最近播放 `clock.fill` / 最爱精选 `star.fill` / 播放列表 `music.note.list`（改 `square.stack.3d.up.fill` 区分）
  - 艺人 `music.mic` / 专辑 `square.stack.fill`
- 强调色统一 `systemPink`，与发现页一致。

### 2.4 交互
- 卡片墙/最爱行点击 = 即时播放（`player.setQueue` + `play`），与发现页一致。
- 「查看全部」/分类入口 = `NavigationLink` 进既有子页面（零改动子页面）。
- 顶部 Toolbar 可加「播放全部/随机播放整库」（可选，见开放问题）。

---

## 3. 影响面 / 文件

| 文件 | 改动 |
|---|---|
| `page/library/index.tsx` | **重写主体**：宫格 + 最近添加卡片墙 + 最爱 Top5 + 分类入口 + 存储行；首屏并发拉数据 |
| `page/library/*.tsx`（子页面） | **不改**（仅作为 NavigationLink 目标） |
| `page/components/song_row.tsx` | **不改**（复用）；如需「最爱」精简行可内联小组件 |
| `class/database.ts` | **不改**（query 已够用） |

新增可能：一个内部 `LibraryQuickCard` / `RecentCard` / `FavoriteRow` 小组件（写在 index.tsx 内或拆 `library/components.tsx`）。

---

## 4. 已拍板决策（用户 2026-06-29 23:00 批准）

1. **List 风格** = 同发现页：`List` + `Section`（自带分隔/惯性滚动）。✅
2. **顶部入口** = **2 列大色块宫格**（LazyVGrid，更 Apple Music）。✅
3. **「最爱歌曲」** = 优先 `is_favorite`；不足 5 首时用 `play_count>0` Top 补齐，标题相应切换「最爱歌曲」/「常听」。✅
4. **整库「播放全部/随机」** = 放 Toolbar `topBarTrailing`（Menu：播放全部 / 随机播放）。✅
5. **新建 `page/library/components.tsx`** 收纳所有可复用组件。✅「所有可复用的都应拆成组件」。

### 实现要点（补充事实）
- `LibraryView` 当前**未接收** `page/index.tsx` 传入的 `navigationTitle`/`toolbar` props（被静默丢）→ 重写时接收 `{ navigationTitle?, toolbar? }` 转发给 `List`，并把「播放全部/随机」Menu 合并进 `topBarTrailing`（保留外部传入的「退出」于 topBarLeading）。
- 数据：`getAllMusic()` 已按 `added_at DESC` → 直接取前 12 即「最近添加」。`getFavoriteMusic()`/`getRecentlyPlayed()`/`getDownloadedMusic()` 现成。数量徽标取各 query 的 `.length`。
- 存储：`fileManager.getStorageSize(): Promise<number>` 返回字节；格式化 `(bytes/(1024*1024)).toFixed(1)+" MB"`（沿用 download.tsx 写法）。
- `Music` 字段：`id/title/artist/album/duration/cover_url?/play_count/is_favorite/is_downloaded/added_at/last_played_at?`。
- 卡片墙横向溢出风险：`ScrollView axes=horizontal` 内层 `HStack` 固定卡宽（130），与发现页 RecommendCard 同构，已验证安全。

### 新建组件清单（`page/library/components.tsx`）
- `LibrarySectionHeader`（图标+主标+右副标/操作）——对齐发现页 header。
- `QuickEntryGrid` + `QuickEntryCard`（2 列宫格色块卡，props: icon/label/count/color/destination）。
- `RecentlyAddedCard`（130 封面卡，复刻 RecommendCard，本地封面优先 + 远程回退）。
- `FavoriteSongRow`（精简最爱行：封面+标题/艺人+播放次数/心形徽标）。
- `StorageFooter`（已下载 N 首 · XX MB）。
- 本地封面读取走 `fileManager.coverExists` map + `getCoverPath`，无则回退 `cover_url`。

---

## 5. Done Contract

- **完成 =**：资料库主页呈现「快捷宫格 + 最近添加卡片墙 + 最爱 Top5 + 分类入口 + 存储行」，视觉与发现页统一；`preview_ui` 编译 exit 0；真机截图核对布局；所有原入口仍可达、子页面与播放逻辑零回归。
- **未完成 =**：编译失败 / 任一原入口丢失 / 卡片墙点击不播放 / 数量徽标错乱 / 横向溢出。
- **证据**：`preview_ui --screenshot` + 用户真机确认。

---

## 6. Change Log / Validation

### Change Log（执行完成）
- **新建** `page/library/components.tsx`：`LibrarySectionHeader`（富 header）/ `QuickEntryGrid`+`QuickEntryCard`（2 列 LazyVGrid 色块卡）/ `RecentlyAddedCard`（130 封面卡，本地优先+远程回退）/ `FavoriteSongRow`（精简最爱行，序号+封面+播放次数/心形徽标）/ `StorageFooter`。
- **重写** `page/library/index.tsx`：`LibraryView` 接收 `{navigationTitle?, toolbar?}` 并转发给 List；首屏 `Promise.all` 并发拉 all/favorites/playlists/artists/albums/storageBytes；本地封面存在性只扫卡片墙+最爱涉及曲目。结构：A 快捷宫格 6 入口（实时数量）→ B 最近添加横向卡片墙（added_at Top12）→ C 最爱歌曲 Top5（is_favorite 优先，不足用 play_count Top 补并切「常听歌曲」标题）→ D 资料库分类（艺人/专辑/歌单带数量）→ 空库 ContentUnavailableView → E StorageFooter（downloadedCount>0 才显示）。Toolbar topBarTrailing 加「播放全部/随机播放」Menu，保留外部传入的「退出」于 topBarLeading。
- 子页面/database/SongRow/player **零改动**。

### 关键坑
- **LazyVGrid columns 的 `size` 必填**：`GridItem = {alignment?, spacing?, size: GridSize}`，2 列等宽用 `{ size: { type: "flexible" }, spacing: 10 }`。
- **List 里 NavigationLink 自带 disclosure chevron**：宫格卡里再手加 `chevron.right` 会出现**双箭头** → 删除手加的，靠 NavigationLink 自带。
- **宫格标签截断**：CJK 长标签（最近播放/最爱精选/播放列表）在窄列里被截成「最近...」→ Text 加 `lineLimit={1} minimumScaleFactor={0.7}` + VStack `layoutPriority={1}` + `Spacer minLength={0}`，截图验证完整显示。
- **LibraryView 原未接收 props**：`page/index.tsx` 一直传 `navigationTitle`/`toolbar` 但旧 LibraryView 没接 → 被静默丢；新版显式接收转发。

### Validation
- `preview_ui` 编译 exit 0（含完整依赖链）。
- `--screenshot` 截图核对：2×3 彩色宫格、分类区数量、空库引导、右上播放 Menu、单 chevron、标签完整——均正确。
- 预览环境 DB 未 init → 各 query catch 降级空数组，数量显示 0、最近添加/最爱区条件隐藏（符合预期）。
- **待用户真机确认**：有数据时最近添加卡片墙/最爱 Top5 的封面（本地+远程）、点击即时播放、数量徽标准确性、横向不溢出。

## 7. Resume / Handoff
- 已完成实现+编译+截图验证，待 commit + 回写 memory。
- 后续可选微调：宫格色块配色、最爱区 Top5 数量、卡片墙曲目数（现 12）、是否给最近添加卡也加 contextMenu（下载/加歌单）。
