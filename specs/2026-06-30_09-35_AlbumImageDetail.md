# 专辑封面 + 专辑详情页信息补充

- **日期**：2026-06-30 09:35
- **状态**：已实现（用户同意按默认决策推进）
- **范围**：`page/library/albums.tsx`（列表+详情）、新增 `class/sources/album_info.ts`。与艺人页同语言、复用同套坑位经验。

## 1. 目标

1. 专辑列表页（`AlbumsView`）每行左侧 `square.stack.fill` 占位 → 替换为该专辑真实封面（圆角方图），懒加载，查不到优雅降级回占位图标。
2. 专辑详情页（`AlbumDetail`）顶部新增 header：专辑封面大图 + 专辑名/艺人/年代/流派/厂牌等结构化信息 chips + 可展开简介（如有），下方保留现有歌曲列表与全部交互（播放/随机/排序/编辑/加歌单/收藏）零改动。

## 2. 数据源调研结论（已用 node 实测）

TheAudioDB 专辑端点：`GET https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=<艺人名>&a=<专辑名>`

| 用例 | 结果 |
|---|---|
| Radiohead / OK Computer | ✅ 全字段（封面+HQ封面+英文简介+年代/流派/厂牌/评分/心情） |
| Cigarettes After Sex / 同名 | ✅ 封面 + 法语简介（无英文 `strDescription`，有 `strDescriptionFR`） |
| Novo Amor / Birthplace | ✅ 封面 + 年代/厂牌，但**无简介** |
| 周杰伦 / 范特西 | ❌ `{album:null}` → 必须降级 |

- 返回 `{ album: [ {...} | null ] }`，取 `album[0]`。
- **封面**（均 `r2.theaudiodb.com`，与艺人图同域，已知可达）：
  - `strAlbumThumb` 方形封面 → **列表行 + 详情主图**
  - `strAlbumThumbHQ` 高清封面（部分专辑才有）→ 详情主图优先，无则回 `strAlbumThumb`
  - 另有 back/cdart/spine/3d* 等多种，本期不用。
- **简介**：`strDescription`（默认英文，OK Computer 较长）。**无中文 `strDescriptionCN`**；部分专辑只有 `strDescriptionFR/ES/PT/SE` 等非英文，部分专辑完全无简介。
- **结构化**：`intYearReleased`（年代）/`strGenre`/`strStyle`/`strLabel`（厂牌）/`strReleaseFormat`/`strMood`/`intScore`(评分0-10)/`intScoreVotes`。
- **局限**：华语/冷门专辑查不到 → 降级到「仅封面回退本地 + 无简介」。

## 3. 决策（待用户确认）

- **D1 数据源**：TheAudioDB `searchalbum.php`，免 key（测试 key=2），与艺人页同源同域。✔
- **D2 简介语言**：取 `strDescription`（英文）；若英文缺失则**不显示简介**（不强行塞外语；与艺人页「CN 优先」对齐的等价做法，因专辑无 CN）。
  - 备选 D2': 英文缺失时回退第一个可用的 `strDescriptionFR/ES/PT/SE`。**默认不做**，避免界面突然冒法语。
- **D3 列表行封面**：优先 album_info 的 `strAlbumThumb`（远程 `<Image imageUrl>`）；**网络查不到时回退到该专辑第一首歌的本地 `cover_url`**（`musics[0].cover_url`，发现/iTunes 富化已有），再不行回退 `square.stack.fill` 图标。仅内存缓存元数据，不落盘图片。
- **D4 详情页主图样式（与艺人页统一但适配方形封面）**：
  - 专辑封面是方图、**无 fanart 宽图**。为对齐艺人页的「模糊 banner」观感：用**同一张封面**做底——`<Image imageUrl=cover>` 放大 + `blur` + 暗渐变 SCRIM 作背景 banner（参考播放页 CoverBackground 思路，简化），前景叠**清晰的圆角方形封面**（非圆形，专辑用 `clipShape` 圆角矩形/`concentricRect`）+ 专辑名 + 艺人 + chips。
  - 封面缺失（仅本地回退也没有）→ 不显 banner，header 只显文字信息；若文字也基本为空则整段不渲染。
- **D5 匹配护栏**：`searchalbum.php` 同时带 artist+album。校验返回 `strAlbum` 与本地 album 名、`strArtist` 与本地 artist 名规整化后吻合（lowercase+trim，相等或互相包含），任一不吻合 → 视为未命中降级。
- **D6 降级**：任何失败/未命中/无网 → 列表行回退本地封面或图标、详情页 header 退化（封面用本地回退、无简介）或不渲染，歌曲列表与交互保持现状，零回退风险。

## 4. 实现设计

### 4.1 `class/sources/album_info.ts`（新增，仿 `artist_info.ts`）
```
export interface AlbumInfo {
  album: string
  artist: string
  thumb?: string        // strAlbumThumbHQ || strAlbumThumb
  description?: string   // strDescription（英文），无则 undefined
  year?: string          // intYearReleased
  genre?: string         // strGenre
  style?: string         // strStyle
  label?: string         // strLabel
  format?: string        // strReleaseFormat
  mood?: string          // strMood
  score?: string         // intScore
}
class AlbumInfoSource {
  private cache = new Map<string, AlbumInfo | null>()     // key=normalize(artist)+'|'+normalize(album)
  private inflight = new Map<string, Promise<AlbumInfo|null>>()
  async fetch(artist: string, album: string): Promise<AlbumInfo | null>
}
export const albumInfo = new AlbumInfoSource()
```
- 请求带 `User-Agent` + AbortController 8s 超时。
- key=`normalize(artist)|normalize(album)`；护栏：返回的 `strArtist`、`strAlbum` 双双 normalize 吻合（相等/互包含）。
- 查无/护栏不过 → 缓存 null；网络失败 → 不缓存（可重试）。
- description 取 `strDescriptionHQ`无此字段，直接 `strDescription`；空串视为无。

### 4.2 `page/library/albums.tsx` 列表行
- 现状是内联 `<NavigationLink>`，行内容是 `square.stack.fill` 图标 + 文本。抽 `AlbumRowContent({ album, artist, count, musics })`。
- `useState<string|null> thumb`；`useEffect` 调 `albumInfo.fetch(artist, album)`；命中用 `info.thumb`，否则用 `musics[0]?.cover_url`（本地回退）。
- 渲染：有图 → `<Image imageUrl resizable scaleToFill frame 44x44 clipShape 圆角 onError→回退>`；否则 `square.stack.fill` 图标占位。
- 文本/`count 首歌曲`/NavigationLink destination 不变。

### 4.3 `page/library/albums.tsx` 详情页 `AlbumDetail`
- 顶部新增 `AlbumHeader({ album, artist, musics })`（List 首个 Section，`listRowInsets=0`、`listRowSeparator="hidden"`）：
  - `useEffect` 调 `albumInfo.fetch`；封面候选：`info?.thumb ?? musics[0]?.cover_url`。
  - 有封面：ZStack 背景同封面放大 `blur(2)` + `BANNER_SCRIM` 暗渐变（复用艺人页同款常量）；前景：清晰圆角方形封面（约 150pt）+ 专辑名（白、bold）+ 艺人名 + chips（年代·流派·厂牌）。
  - 无封面：纯文字 header；文字也基本为空（无 info 且仅本地）→ 返回空 `<Section/>`（**不可裸 return null**，会报 `e.isInternal`）。
  - 简介：有 `description` 时 `Text lineLimit={expanded?undefined:3}` + 「展开/收起」点击切换（`useState expanded`），systemPink，与艺人页一致。
- header 之下保留现有「播放全部/随机」Section + 歌曲列表 Section，零改动。

## 5. 不改动
- `database.ts` / `SongRow` / `player` / `file_manager` 零改动（不落盘专辑图）。
- 列表/详情的搜索、排序、编辑模式、批量删除、加歌单逻辑全保留。

## 6. 复用艺人页已验证的坑
- `clipShape` 仅 `rect|capsule|concentricRect`；方形封面圆角用 `clipShape="rect"`（配 `cornerRadius`）或直接圆角处理。
- `Rectangle` 渐变 fill 不包 `gradient` 层，直接 `{colors,startPoint,endPoint} as any`（复用 `BANNER_SCRIM`）。
- 函数组件作 List 直接子节点首帧不要裸 `return null` → 返回空 `<Section/>`。
- banner 前景 VStack 不要同层 `padding + frame(maxWidth:"infinity")`，会裁掉水平 padding；去 `frame`，让 ZStack 居中、底层 Rectangle 撑满宽（commit `87241920` 教训）。

## 7. 验证计划
- node 侧：专辑端点 + 4 用例（含降级）已验证 ✔。
- Scripting 侧：临时 `_preview.tsx`（PlayerStateProvider + NavigationStack + AlbumsView）跑 `preview_ui`；preview DB 未 init → 走 catch 空列表，主要验证编译通过 + 不崩。
- 真机：列表封面加载/详情 banner/简介展开/降级（冷门专辑、本地回退）待用户 App 内确认。

## 8. Open Questions（已按默认拍板）
- Q1：简介英文缺失 → **不显示**（D2 默认）。
- Q2：详情页主图 → 「模糊同封面 banner + 前景清晰圆角封面」（D4 默认）。
- Q3：仅内存缓存元数据、不落盘图片（与艺人页一致）。

## 9. Change Log
- 2026-06-30：实现完成。
  - 新增 `class/sources/album_info.ts`：TheAudioDB `searchalbum.php?s=<artist>&a=<album>` 拉取，内存缓存 `Map<artist|album, AlbumInfo|null>` + inflight 去重，双字段护栏（artist+album 规整后相等/互包含），8s 超时；查无/护栏不过缓存 null，网络失败不缓存（可重试）。thumb=`strAlbumThumbHQ || strAlbumThumb`，description=`strDescription`（空串视为无）。
  - `page/library/albums.tsx`：列表行抽 `AlbumRowContent`（44pt 圆角方形封面，先用本地 `musics.find(cover_url)` 兜底，再异步覆盖为 album_info 远程封面，onError/查无降级 `square.stack.fill`）；详情页新增 `AlbumHeader`（同封面放大 `blur(28)` 模糊 banner + `BANNER_SCRIM` + 前景 150pt 圆角清晰封面 + 专辑名/艺人 + 年代/流派/厂牌 chips + 可展开英文简介）插在「播放全部/随机」Section 前；歌曲列表与全部交互（排序/编辑/批量删/加歌单/收藏）零改动。
  - 复用艺人页常量 `BANNER_SCRIM`（同式重声明于本文件）；`clipShape={{type:"rect",cornerRadius}}` 实现方形圆角；首帧无内容返回空 `<Section/>` 而非裸 null。
  - preview_ui 验证（OK Computer 真实数据）：模糊封面 banner、前景清晰封面、白字标题/艺人、chips（1997/Alternative Rock/XL Recordings）、可展开简介均正确渲染。
