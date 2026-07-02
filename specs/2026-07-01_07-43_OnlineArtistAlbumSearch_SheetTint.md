# 在线艺人/专辑搜索浏览 + 播放页 sheet tint 修复

- 日期：2026-07-01 07:43
- 类型：功能（在线艺人/专辑浏览）+ 修复（嵌套 sheet tint 丢失）
- 关联：承接 `2026-06-30_23-56_PlayerEntityNav_SearchEntityModes`（本地版搜索 + 播放页跳转）

## 1. 背景与问题

1. **搜索页「艺人/专辑」模式只查本地库** → 库里歌少时基本无结果。需接在线接口浏览全网艺人/专辑。
2. **播放页点艺人/专辑弹出的详情页 tint 丢失（按钮/返回不是 systemPink）**：嵌套 sheet 不继承 TabView 的 `tint="systemPink"`。
   - 经确认：播放页用的是 **sheet modifier**（非 `Navigation.present`），方案保留，只需给 sheet 根元素补 `tint="systemPink"`。

## 2. 接口能力（iTunes Search API，已 node 实测）

UA 必带；`country=US`（欧美口味，与发现页一致）。

| 接口 | 关键返回 | 用途 |
|------|----------|------|
| `search?entity=musicArtist&term=` | `artistName` / `artistId` / `primaryGenreName`（**无图**） | 艺人搜索 |
| `search?entity=album&term=` | `collectionName` / `artistName` / `collectionId` / `artworkUrl100`（封面）/ `releaseDate` / `trackCount` / `primaryGenreName` | 专辑搜索 |
| `lookup?id=<artistId>&entity=album` | 首条 artist + 后续该艺人全部专辑（带封面/年份） | 艺人 → 专辑墙 |
| `lookup?id=<collectionId>&entity=song` | 首条 collection + 后续各 track（`trackName`/`trackNumber`/`trackTimeMillis`/`previewUrl`/`artworkUrl100`） | 专辑 → 曲目 |

- 艺人无官方图：详情页大图/简介继续用 TheAudioDB（`artistInfo`），封面用 iTunes，互补。
- 封面 `100x100` → `600x600`（沿用 `itunes_meta.upscaleCover` 思路）。

## 3. 方案

### 3.1 在线浏览数据源 `class/sources/itunes_browse.ts`（新）

纯数据层，不依赖 UI。导出类型 + 单例 `itunesBrowse`：

```
type ItunesArtist = { artistId: number, name: string, genre?: string }
type ItunesAlbum  = { collectionId: number, album: string, artist: string, artistId?: number,
                      cover?: string, year?: string, trackCount?: number, genre?: string }
type ItunesTrack  = { trackId: number, title: string, artist: string, album: string,
                      cover?: string, duration?: number, trackNumber?: number, previewUrl?: string }
```

方法（均 8s 超时 + UA + try/catch 降级空数组）：
- `searchArtists(q, limit=25): Promise<ItunesArtist[]>`
- `searchAlbums(q, limit=25): Promise<ItunesAlbum[]>`
- `artistAlbums(artistId, limit=50): Promise<ItunesAlbum[]>`（过滤掉首条 artist 行；按 releaseDate 降序）
- `albumTracks(collectionId): Promise<{ album: ItunesAlbum, tracks: ItunesTrack[] }>`（首条 collection 拆出，其余 track 按 trackNumber 升序）
- 轻量内存缓存（Map，key=方法名+参数）减少重复请求。

**ItunesTrack → MusicData 映射**（供播放/下载/加歌单复用 mp3juice 链路）：
- 复用现有 `MusicData`：`{ id: String(trackId), title, artist, album, cover, duration, provider: "mp3juice" }`。
- **id 用 iTunes trackId**（与 mp3juice 的 youtube vid 不同，但播放时 `SearchResultCard.handlePlay` 走的是 `player.playNext(musicData)` → mp3juice 按「标题 艺人」实时搜索解析，不依赖 id 对应真实音频）。确认 `source_id` 不被强依赖：mp3juice resolve 用 title/artist 搜索，不是 id。

### 3.2 在线详情页 `page/search/online_detail.tsx`（新，拆分）

- `OnlineAlbumDetail({ album, artist, collectionId, cover })`：
  - `albumTracks(collectionId)` → loading/空态 → `List`：
    - header：复用专辑封面大图 + 名/艺人/年代 chips（轻量，本地实现，不复用 library 的 TheAudioDB header 以免二次请求；或调用 `albumInfo` 视情况——MVP 先用 iTunes 自带封面/年份）。
    - 「播放全部」：tracks 映射 MusicData 队列 → `player.setQueue` + play。
    - 每曲 `SearchResultCard`（点击 mp3juice 播放、右滑下载、菜单加歌单），与在线搜索结果体验一致。
- `OnlineArtistDetail({ artistId, name })`：
  - `artistAlbums(artistId)` → 专辑墙（`List` + `NavigationLink destination={<OnlineAlbumDetail .../>}`，复用 `AlbumRow` 风格或简单行）。
  - 可选顶部 TheAudioDB 简介（`artistInfo.fetch(name)`，已有组件思路）——MVP 先放艺人名 + 专辑列表，简介后续增量。

> 这些详情页在搜索 Tab 的 NavigationStack 内，用声明式 `NavigationLink` push，无嵌套 sheet 问题。

### 3.3 搜索页 `page/search/index.tsx` 改造

- `doArtistSearch`/`doAlbumSearch` 从查本地库改为 `itunesBrowse.searchArtists/searchAlbums`。
- state 类型换成 `ItunesArtist[]` / `ItunesAlbum[]`。
- 结果区 `entity_results.tsx`：
  - 艺人行 → `NavigationLink destination={<OnlineArtistDetail .../>}`（用 `ArtistRow`：仍可用 `artistInfo` 拉头像，行内懒加载不变）。
  - 专辑行 → `NavigationLink destination={<OnlineAlbumDetail .../>}`（行直接用 iTunes 封面，新建轻量 `OnlineAlbumRow` 或给 `AlbumRow` 加 `coverUrl` 直供 prop 避免再请求 TheAudioDB）。

### 3.4 播放页 sheet tint 修复

`page/player/index.tsx` 的 `ZStack sheet.content`：给 `PlayerArtistSheet`/`PlayerAlbumSheet` 渲染的根 `NavigationStack` 补 `tint="systemPink"`（在 `entity_sheet.tsx` 的 NavigationStack 上加，或在 index.tsx content 外层包裹）。统一在 `entity_sheet.tsx` 改：每个 `NavigationStack` 加 `tint="systemPink"`。

## 4. 影响文件

- 新：`class/sources/itunes_browse.ts`、`page/search/online_detail.tsx`
- 改：`page/search/index.tsx`、`page/search/components/entity_results.tsx`、`page/player/entity_sheet.tsx`、（可能）`page/library/rows.tsx`（AlbumRow 加可选直供封面 prop）

## 5. 验证

- node 实测 4 个 iTunes 接口（已完成，均 200 + 字段齐全）。
- `preview_ui` 编译整依赖链（probe 引用全部新导出）。
- 真机：搜索「Radiohead」艺人/专辑出在线结果 → 点专辑看曲目 → 点曲目 mp3juice 播放；播放页点艺人/专辑详情按钮/返回为 systemPink。

## 6. Change Log

### 2026-07-01 实现完成

**修复：播放页 sheet tint**
- `entity_sheet.tsx`：`PlayerArtistSheet`/`PlayerAlbumSheet` 的每个 `NavigationStack`（含空态）都加 `tint="systemPink"`。原因：嵌套 sheet 不继承 TabView 的 tint。确认播放页用的是 sheet modifier（非 Navigation.present），方案保留。

**在线数据源 `class/sources/itunes_browse.ts`（新）**
- 单例 `itunesBrowse`：`searchArtists`/`searchAlbums`/`artistAlbums`/`albumTracks`。均 8s 超时 + UA + country=US + try/catch 降级空；轻量内存缓存。封面 100→600。类型 `ItunesArtist`/`ItunesAlbum`/`ItunesTrack`。

**在线详情页 `page/search/online_detail.tsx`（新）**
- `OnlineAlbumDetail`：`albumTracks` → 模糊封面 banner header（封面/名/艺人/年代·流派·曲数 chips）+ 「播放全部/随机」+ 逐曲 `SearchResultCard`。`trackToMusic`（完整 Music，cover_url）给 player.setQueue/play；`trackToMusicData`（MusicData）给 SearchResultCard。播放走 mp3juice 实时解析（不依赖 trackId 对应真实音频）。
- `OnlineArtistDetail`：`artistAlbums` → 专辑墙（`NavigationLink` → `OnlineAlbumDetail`），行 `OnlineAlbumRow`（iTunes 封面，不二次请求 TheAudioDB）。

**搜索页接线**
- `index.tsx`：`doArtistSearch`/`doAlbumSearch` 改走 `itunesBrowse.searchArtists/searchAlbums`；state 类型换 `ItunesArtist[]`/`ItunesAlbum[]`；prompt 文案改「搜索艺人/专辑（在线）」。
- `components/entity_results.tsx`：重写为在线版。艺人行复用 `ArtistRow`（加可选 `subtitle` 显示 genre）→ `OnlineArtistDetail`；专辑行 `OnlineAlbumResultRow`（iTunes 封面）→ `OnlineAlbumDetail`。
- `library/rows.tsx`：`ArtistRow` 加可选 `subtitle` prop（覆盖「N 首歌曲」）。

**验证**
- node 实测 4 个 iTunes 接口（searchArtists/searchAlbums/lookup album/lookup song）均 200 + 字段齐。
- `_preview_probe.tsx` 引用全部新导出，`preview_ui` 编译整依赖链通过（exit 0），已删 probe。
- 真机交互待验证。
