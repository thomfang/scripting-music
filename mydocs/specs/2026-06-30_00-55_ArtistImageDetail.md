# 艺人图片 + 艺人详情页重设计

- **日期**：2026-06-30 00:55
- **状态**：Draft（待用户审阅）
- **范围**：`page/library/artists.tsx`（列表+详情）、新增 `class/sources/artist_info.ts`、可选 `class/file_manager.ts`（艺人图缓存目录）

## 1. 目标

1. 艺人列表页（`ArtistsView`）每行左侧 `person.circle.fill` 占位 → 替换为该艺人的真实头像（圆形），懒加载、查不到优雅降级回占位。
2. 艺人详情页（`ArtistDetail`）重设计：顶部艺人大图 banner + 艺人名/地区/年代/流派等结构化信息 + 可展开简介，下方保留现有歌曲列表与全部交互（播放/随机/编辑/加歌单/收藏）。

## 2. 数据源调研结论（已用 node 实测）

| 源 | 可达 | 艺人图 | 简介 | 结论 |
|---|---|---|---|---|
| iTunes（现用） | ✅ | ❌ | ❌ | 只有 name/genre/url，给不了图和简介 |
| **TheAudioDB** | ✅ 200 | ✅ 全 | ✅ | **选用**，免 key（测试 key=2） |
| Deezer / Wikipedia / Wikidata | ❌ 超时 | — | — | 本网络环境屏蔽，弃用 |
| MusicBrainz | ⚠️ TLS 间歇 | ❌ | ❌ | 不稳且无图无简介，弃用 |

### TheAudioDB（`https://www.theaudiodb.com/api/v1/json/2/search.php?s=<艺人名>`）
- 返回 `{ artists: [ {...} | null ] }`，取 `artists[0]`。
- **图片**（均 `r2.theaudiodb.com`，实测 200 image/jpeg；URL 加 `/preview` 后缀得 ~16KB 小图）：
  - `strArtistThumb` 方形头像 → **列表行 + 详情主图**
  - `strArtistFanart` 宽幅横图 → **详情页顶部 banner 背景**（可选，缺则用 thumb）
- **简介** `strBiography`（默认英文，Radiohead 2199 字 / Taylor Swift 2382 字）；部分有 `strBiographyCN`（中文，优先用）。
- **结构化**：`intFormedYear`（成立年）/`intBornYear`/`strCountry`（地区）/`strGenre`/`strStyle`/`strMood`/`intMembers`/`strWebsite`。
- **局限**：华语/冷门艺人可能查不到（实测「周杰伦」NO RESULT）→ 必须降级。

## 3. 决策（待用户确认）

- **D1 数据源**：TheAudioDB，免 key。✔ 已实测可达 + 图片域名可达。
- **D2 简介语言**：优先 `strBiographyCN`，无则 `strBiography`（英文）。
- **D3 列表行图**：用 `strArtistThumb`（远程 `<Image imageUrl>`，与发现页一致），圆形 clip；先不落盘缓存图片本身，仅**内存缓存元数据**（艺人元数据 Map<artistKey, info|null>），避免每次进页面重复请求。图片由 Scripting `<Image imageUrl>` 自身的 HTTP 缓存兜底。
  - 备选：落盘缓存到 `covers` 同级 `artists/` 目录（仿歌词同生命周期）。**默认不做**，保持轻量；若你要离线/省流再加。
- **D4 详情页主图**：默认 `strArtistThumb`（方形大图，圆角）；若有 `strArtistFanart` 则作为顶部模糊背景 banner（参考播放页 CoverBackground 思路但简化：直接 `<Image imageUrl=fanart>` + 暗渐变遮罩）。
- **D5 匹配护栏**：`search.php` 返回最接近一条，校验 `strArtist` 与本地 artist 名规整化后吻合（lowercase + trim 完全相等或包含），不吻合则视为未命中 → 降级。
- **D6 降级**：任何失败/未命中/无网 → 列表行回 `person.circle.fill`、详情页不显 banner/简介、只显歌曲列表（与现状一致，零回退风险）。

## 4. 实现设计

### 4.1 `class/sources/artist_info.ts`（新增）
```
export interface ArtistInfo {
  name: string
  thumb?: string      // strArtistThumb
  fanart?: string     // strArtistFanart
  biography?: string  // CN 优先，回退 EN
  formedYear?: string
  country?: string
  genre?: string
  style?: string
  members?: string
  website?: string
}
class ArtistInfoSource {
  private cache = new Map<string, ArtistInfo | null>()   // key=normalize(name)，null=已查无
  async fetch(name: string): Promise<ArtistInfo | null>  // 命中缓存直接返回；护栏校验；失败返回 null 并缓存 null
}
export const artistInfo = new ArtistInfoSource()
```
- 请求带 `User-Agent`（与项目其它源一致）+ AbortController 8s 超时。
- normalize：`name.trim().toLowerCase()`。
- 护栏：`normalize(result.strArtist) === key || 包含`，否则返回 null。
- biography 取 `strBiographyCN || strBiography`。
- 缓存 null 也存（避免对查不到的艺人反复请求）。

### 4.2 `page/library/artists.tsx` 列表行
- 抽 `ArtistRow({ item })`：`useState<ArtistInfo|null>`，`useEffect` 调 `artistInfo.fetch(item.artist)`。
- 有 `info.thumb` → `<Image imageUrl resizable scaleToFill frame 40x40 clipShape={{type:"circle"}} onError→回占位 placeholder=person.circle.fill>`；否则 `person.circle.fill`。
- 其余（名称/「N 首歌曲」副标/NavigationLink destination）不变。
- **懒加载注意**：`filtered.map` 直接渲染所有行会并发请求全部艺人。**护栏：仅在行可见时请求**——但 List 不易拿可见性。折中：每行各自 effect 请求（TheAudioDB 无明显限流，内存缓存去重）；若艺人很多可加请求并发闸（如 p-limit 4）。默认每行自请求 + 缓存。

### 4.3 `page/library/artists.tsx` 详情页 `ArtistDetail`
- 顶部新增 header（List 第一个 Section，无分隔）：
  - 有 fanart：ZStack 背景 `<Image imageUrl=fanart>` blur + 暗渐变；前景圆形 thumb + 名称 + 元信息 chips（地区·成立年·流派）。
  - 无 fanart 有 thumb：居中圆形 thumb（96pt）+ 名称 + chips。
  - 简介：`Text lineLimit` 折叠（默认 3 行）+「展开/收起」点击切换（`useState expanded`）。
  - 全部信息缺失 → header 整段不渲染，回到纯歌曲列表（现状）。
- header 之下保留现有「播放全部/随机」Section + 歌曲列表 Section，**零改动**。
- header 数据：`ArtistDetail` 加 `useEffect` 调 `artistInfo.fetch(artist)`。

## 5. 不改动
- `database.ts` / `SongRow` / `player` / `file_manager`（D3 默认不落盘）零改动。
- 列表/详情的搜索、编辑模式、批量删除、加歌单逻辑全保留。

## 6. 验证计划
- node 侧：数据源/图片域名可达已验证 ✔。
- Scripting 侧：临时 `_preview.tsx`（PlayerStateProvider + NavigationStack + ArtistsView）跑 `preview_ui --screenshot`；preview DB 未 init → getMusicByArtist 走 catch 空列表，主要验证编译通过 + 不崩。
- 真机：列表头像加载/详情 banner/简介展开/降级（冷门艺人）待用户 App 内确认。

## 7. Change Log
- （待实现后回填）

## 8. Open Questions（待用户拍板）
- Q1：列表行头像是否需要**落盘缓存**（离线可见 / 省流）？默认否（仅内存元数据缓存 + Image HTTP 缓存）。
- Q2：详情页是否要 fanart 模糊大 banner？还是简洁居中圆头像即可？默认「有 fanart 用 banner，无则圆头像」。
- Q3：简介只有英文时是否接受（华语用户）？默认接受（CN 优先，无则 EN 原文）。
