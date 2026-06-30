# Scripting Music / PROJECT_MEMORY.md

项目级记忆。workspace memory 只保留本文件位置；后续 Scripting Music 相关长期信息写这里。

## 项目位置与 Git

- 项目根目录：`/private/var/mobile/Library/Mobile Documents/iCloud~com~thomfang~Scripting/Documents/scripts/Scripting Music/`
- git repoName：`scripting-music`；`.git` 在 App Group `git-repos/scripting-music`（由 isomorphic-git skill 管理）。
- 常用命令：`scripting-ts project "Scripting Music"`；UI 验证用临时 `_preview.tsx` + `scripting-ts preview_ui <file>`，验后删除。
- 关键 commits：
  - `caeb8aae` 基线
  - `e5c83e5f` MP3Juice 集成
  - `cd6ffe2f` 移除 001co + iTunes 富化
  - `fdb50907` 下载二进制兼容修复
  - `5bd6403d` 发现 Tab
  - `73743c92` 歌词本地化 + 播放页重设计
  - `6e4622b0` 播放页 Apple Music/iOS26 风格
  - `8ea47034` 播放页横向溢出+歌词不加载修复
  - `c4d0f3a7` 播放页横向边距修复
  - `cb8d5691` 歌词缓存+同步偏差修复
  - `df4bf195` 展开歌词时封面缩到标题左侧
  - `9ec78771` 资料库首页重设计
  - `49bd7596` 资料库宫格导航点击冲突修复
  - `b9e459bb` 艺人列表头像 + 详情 header
  - `87241920` 艺人 banner header padding 修复
  - `acf9107a` 专辑封面 + 专辑详情页 header（TheAudioDB album 源）
  - `bc27132f` 资料库重设计：横向卡片墙 + 播放列表拼图封面 + 详情页 header + 入口收敛
  - `6846d19c` 资料库首页去重：底部改最近播放、宫格改最常播放
  - `fc2106cd` 发现页推荐改为按天轮换（seed PRNG + 扩种子池 + 随机收敛 + 排除最近已推）
  - `51c7686b` 发现页推荐加手动刷新按钮（force 跳当日缓存 + nonce 旋转 seed）

## 音源架构

### MP3Juice（唯一完整音源）

- `class/sources/`：`source.ts`(`MusicSource`/`ResolveInput`)、`source_mp3juice.ts`、`aes_cbc.ts`、`itunes_meta.ts`。
- `music.ts`：`search(query)` 固定走 mp3juice；`resolveAudioUrl/resolveVideoUrl` 异步实时解析；`SUPPORTED_PROVIDERS=["mp3juice"]`。
- 短时直链不入库：`audio_url` 存空，播放/下载时实时 resolve。
- 001co 已完全删除（上游 404）。搜索页无源 Picker，缓存 key 为纯 query。
- mp3juice 流程：
  1. POST `mp3juice3.ninja/api/yt-data {query}` → items（无分页，固定约 20 条）
  2. GET `media.savetube.vip/api/random-cdn`
  3. POST `https://<cdn>/v2/info {url}` → AES-CBC 密文 base64
  4. 解密拿 key
  5. MP3：POST `https://<cdn>/download {downloadType:audio, quality:128, key}` → `downloadUrl`
  6. MP4：取解密 info 的 `video_formats[].url`
- AES-CBC：Scripting WebCrypto/原生 Crypto 都不支持 AES-CBC，必须用 `aes_cbc.ts`（纯 JS；过 NIST FIPS-197 + SP800-38A）。savetube key：`C5D58EF67A7584E4A29F6C35BBC4EB12`（IV 前 16 字节）。

### iTunes 富化

- `itunes_meta.ts`：搜索结果末尾并发富化（`enrichBatch` 限流 4）补 artist/album/封面/时长。
- iTunes Search API 必须带 User-Agent，否则会报「不支持的URL」。
- `country=CN` 保留中文歌原名。
- 置信度护栏：`matchScore = track*0.6 + artist*0.4`，>=0.5 才注入。
- 封面 100x100 → 600x600。
- `cleanTitle`：英文噪声括号整删；`【】「」` 内是 CJK 歌名时只去括号留内容。

### 下载链路兼容

- 新版 Scripting 二进制 API 变更见 global memory。
- 下载/写文件使用 `class/write_compat.ts`：流读取 `dataStream ?? body` + chunk 归一化；写文件用 `Data.fromUint8Array + writeAsData`，回退 `writeAsBytes`。
- 用于 `file_manager.saveAudio/saveCover` 与 downloader 最终写入。

## 歌词与播放页

### 歌词本地化

- 歌词与封面同生命周期。
- `class/file_manager.ts`：`lyricsDir(<root>/lyrics)`、`getLyricsPath(<id>.json)`、`saveLyrics`、`readLyrics<T>`、`lyricsExists`、`deleteLyrics`；init 建目录；`getStorageSize` 计入。
- `fetch_downloader.ts`：下载成功后 `lyrics.fetchLyrics` + `saveLyrics`，失败静默；`deleteDownload` 删除歌词。
- `database.deleteMusic`：已下载分支删除歌词。
- `page/player/lyric.tsx`：本地优先 `readLyrics` → 在线 LRCLIB 兜底；模块级 `lyricMemCache = Map<id,LyricsResult>`，避免重挂载闪 loading/重复拉取。
- LRCLIB：`/api/get` → `/api/search` + `pickBest`；30min 内存缓存；`parseLrc` 去 `[ar:]` 等 metadata。
- 同步精度：不要依赖 `player_state` 1s tick；歌词高亮独立 250ms `setInterval(()=>player.getCurrentTime())`，`LYRIC_LEAD=0.2s` 前导补偿。

### 播放页设计/坑

- 背景：`CoverBackground` 铺满；有封面=放大模糊封面 + MeshGradient 增色 + SCRIM；无封面=彩色 Mesh。
- MeshGradient 是 `ShapeStyle` 对象（`{width,height,points,colors,smoothsColors}`），直接 `Rectangle fill={mesh as any}`，不是 JSX 组件。
- `Animation` prop 要给实例：`{animation: Animation.smooth({duration}), value}`。
- `AVPlayer` 无播放流 metering/level/power；`onLevelUpdate`/`averagePower`/`peakPower` 只在录音/离线分析侧。因此背景只能时间驱动流动，不能跟真实音量。
- Scripting 无封面取色 API（UIImage 无 average/dominant/pixel read），用模糊封面/mesh 方案。
- 横向溢出核心坑：sheet/父视图可能给无限宽，`maxWidth:"infinity"` 不能限制到屏宽；长歌词会撑爆。需显式有限 `width`。
- 播放页最终用 `Device.screen.width - 48` 收窄根 VStack，保证左右 24pt；不要「先 frame 全屏再外侧 padding」，会被裁。
- 展开歌词：`lyricExpanded` 时小封面 56pt 收到歌名左侧，Title `compact`；未展开大封面在上。

## 发现 Tab

- 用户口味：欧美另类/独立（Radiohead/Novo Amor/Cigarettes After Sex），不要国区榜。
- `class/sources/charts.ts`：Apple iTunes RSS `itunes.apple.com/<country>/rss/topsongs/limit=N/genre=ID/json`（免 key，必带 UA，默认 `us`）。
- 每条 RSS entry 自带 30s preview（`link[].rel=enclosure`）、歌名/艺人/专辑/封面/trackId；`feed.entry` 单条可能是对象，需归一化。
- `CHART_GENRES`：另类20、唱作人10、电子7、摇滚21、流行14；另有 `NEW_SONGS_GENRE_ID=-1` 作为「新歌」。
- `rss.applemarketingtools.com/.../most-played/` 国区倾向明显，已弃用。
- 两级播放：行点=即时试听（`provider:"itunes_preview"` + `audio_url=previewUrl`，player 直接播）；contextMenu/右滑=完整播放/下载/加歌单，用 `"歌名 艺人"` 搜 mp3juice。
- 试听整栏目入队：当前流派 tracks 映射为 preview Music 队列，`player.setQueue(queue, idx)` + `player.play(queue[idx])`。
- 新歌接口修复：iTunes Search 按相关性/热度，捞不到真正新歌；应跨口味流派拉 topsongs RSS limit=100，用 `im:releaseDate.label` 过滤近 9 个月，再按 releaseDate 降序去重。
- 推荐种子：加权【下载×3 + 收藏×2 + 最近播放×1】统计 artist 偏好；推荐曲排除已下载与重复。
- **推荐轮换算法**（`2026-06-30_19-45_DiscoverRecoRotation` spec）：原算法「无变化因子」恒定输出，已改为按天轮换。`charts.ts` 导出 `hashStr/mulberry32/shuffleWith` 纯函数 PRNG，`SEED_ARTISTS` 扩到 12 个，`NEW_SONG_GENRES` 导出，`fetchArtistTop` 默认 limit=25。`index.tsx`：seed=`hashStr(YYYY-MM-DD|库指纹|nonce)`→加权Top6洗牌取3 + 默认池补到4 + 随机1流派源；各源候选洗牌、每源≤3首、排除已下载+最近3天已推、最终洗牌取24。Storage：`discover_reco_daily`(同日复用/跨天重算)、`discover_reco_recent`(滚动3天已推)、`discover_reco_nonce`(手动刷新自增)。计算抽为 `loadRecommend(force)`；header 右侧 `arrow.clockwise` 手动刷新按钮（force 跳缓存 + 旋转 nonce）。
- DB 未 init（preview_ui）时静默降级默认池随机。

## 资料库页

- 首页（`index.tsx`，`bc27132f` 重设计）段落：A 快捷宫格（**精简 4 格**：歌曲/我喜欢/已下载/**最常播放**）→ B 最近添加（横向 130pt 卡）→ 艺人横滑（圆头像）→ 专辑横滑（方封面）→ 播放列表横滑（拼图）→ C **最近播放**行。**原 D 段纯文字分类已删**（去重）。
- 维度去重原则（用户反馈后定型）：收藏=宫格「我喜欢」、频次=宫格「最常播放」(TopPlayedView)、时间=底部「最近播放」(RecentlyPlayedView)，三者不同维度各出现一次。`recentlyPlayedRows` 按 `last_played_at` 倒序。
- `components.tsx` 组件：`LibrarySectionHeader`、`QuickEntryGrid/Card`、`RecentlyAddedCard`、`FavoriteSongRow`、`CoverTile`/`CoverCollage`、`ArtistCircleCard`、`AlbumCoverCard`、`PlaylistCollageCard`、`HorizontalCardRail`。
- **封面拼图 `CoverCollage`**：≥4 首 → 2×2，1–3 → 单张，0 → 占位；`blur` prop 可作模糊 banner；banner 背景需 `size={Device.screen.width}` + 外层 `ZStack frame maxWidth:infinity height:300 clipped` 才能填满屏宽（固定方图会两侧留白）。`CoverTile` 自查 coverExists→远程→占位。
- 播放列表（`playlists.tsx`）：`PlaylistsView` 列表行用 `CoverCollage`（50pt）；`PlaylistDetail` 顶部 `PlaylistHeader`（拼图模糊 banner + 前景 150pt 拼图 + 名 + chips「N 首/总时长/更新时间」），与 AlbumHeader 对齐；导出 `PlaylistDetailPage` 供首页卡片跳转。
- `ArtistDetail`/`AlbumDetail` 已 `export`，供首页卡片编程式 push。
- 顾层页 `navigationTitle`/`toolbar` 由框架自动注入组件根视图；组件不要手动消费重渲染，否则退出按钮重复。
- `LazyVGrid` columns 的 `size` 必填；`Label badge={n}` 在行尾 chevron 左侧，`badge=0` 自动隐藏。
- List row 内多 `NavigationLink` 命中区串扰；首页卡片/宫格用 Button + `navTarget`/`navigationDestination` 编程式 push。
- 收藏区 fallback：（已废弃）原「最爱/常听」回退逻辑随 C 段改为「最近播放」后不再使用。

## 艺人列表/详情页

### 数据源

- TheAudioDB 是当前唯一可用且同时有艺人图/简介的数据源。
- Endpoint：`GET https://www.theaudiodb.com/api/v1/json/2/search.php?s=<name>`。
- 字段：`strArtistThumb`（方头像）、`strArtistFanart`（宽 banner）、`strBiography`/`strBiographyCN`、`intFormedYear`/`intBornYear`/`strCountry`/`strGenre`/`strStyle`/`intMembers`/`strWebsite`。
- 图片域 `r2.theaudiodb.com` 可达；`<thumbUrl>/preview` 可得小图。
- iTunes 无艺人图/简介；Deezer/Wikipedia/Wikidata 在当前网络超时；MusicBrainz TLS 间歇且无图/简介。
- 华语/冷门可能查无（周杰伦测试 NO RESULT），必须优雅降级。

### 实现

- `class/sources/artist_info.ts`：`artistInfo.fetch(name)`，内存缓存 `Map<normalize(name), ArtistInfo|null>` + inflight 去重；名称护栏（normalize 后相等/互包含）；8s 超时；UA；查无/护栏不过缓存 null，网络失败不缓存；bio=`strBiographyCN || strBiography`。
- `page/library/artists.tsx`：
  - 列表行 `ArtistRowContent`：44pt 圆形头像，`Image imageUrl` + `clipShape="capsule"`；onError/查无降级 `person.circle.fill`。
  - 详情 `ArtistHeader`：banner fanart + SCRIM + 96pt 圆头像 + 地区/成立年/流派 chips + 可展开简介；插在「播放全部/随机」Section 前；编辑态隐藏。
- `clipShape` 不支持 `{type:"circle"}`；正方形 frame 上用 `clipShape="capsule"` 即圆。
- `Rectangle` 渐变 fill 不要包 `gradient` 层，直接 `{colors,startPoint:"top",endPoint:"bottom"} as any`。
- 函数组件作为 List 直接子节点时，首帧不要 `return null`，否则报 `e.isInternal`；返回空 `<Section listRowInsets={0} listRowSeparator="hidden"/>`。
- banner 内 padding 修复 `87241920`：`foreground` VStack 不要同层 `padding + frame maxWidth:"infinity"`，会水平 padding 被裁；去掉 `frame`，让 ZStack 默认居中，banner 满宽由底层 Rectangle 撑。
- 待办：用户反馈「简介展开后顶部一直多一截 padding」；静态 repro 未复现，需继续排查真实 state 切换/List row 高度重算。

## 专辑列表/详情页

### 数据源

- TheAudioDB 专辑端点：`GET https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=<artist>&a=<album>`，返回 `{album:[{...}|null]}` 取 `album[0]`。
- 封面（`r2.theaudiodb.com`）：`strAlbumThumbHQ`（高清，部分才有）→ `strAlbumThumb`（方形）。
- 简介 `strDescription`（英文）；**无 CN 字段**，部分专辑只有 FR/ES/PT/SE 或完全无。结构化：`intYearReleased`/`strGenre`/`strStyle`/`strLabel`/`strReleaseFormat`/`strMood`/`intScore`。
- 华语/冷门专辑查无（实测「周杰伦/范特西」NO RESULT）→ 降级。

### 实现

- `class/sources/album_info.ts`：`albumInfo.fetch(artist, album)`，内存缓存 `Map<artist|album, AlbumInfo|null>` + inflight 去重；**双字段护栏**（artist+album 规整后相等/互包含）；8s 超时；查无/护栏不过缓存 null，网络失败不缓存；thumb=`strAlbumThumbHQ||strAlbumThumb`，description=`strDescription`。
- `page/library/albums.tsx`：
  - 列表行 `AlbumRowContent`：44pt 圆角方形封面，**先用本地 `musics.find(cover_url)` 兜底，再异步覆盖为远程封面**；onError/查无降级 `square.stack.fill`。
  - 详情 `AlbumHeader`：同封面放大 `blur(28)` 模糊 banner + `BANNER_SCRIM` + 前景 150pt 圆角清晰封面 + 专辑名/艺人 + 年代/流派/厂牌 chips + 可展开英文简介；插在「播放全部/随机」前；编辑态隐藏；无内容返回空 `<Section/>`。
- 方形圆角封面用 `clipShape={{type:"rect",cornerRadius}}`（艺人圆头像用 `capsule`）。
- 决策：简介英文缺失则不显示（无 CN/不回退外语）；仅内存缓存元数据不落盘；`BANNER_SCRIM` 与艺人页同式（各文件本地声明一份）。

## 全局/常见 Scripting UI 坑（项目内复用）

- modifier 顺序影响布局：`frame`、`padding`、`background`、`clipShape`、`buttonStyle`、`contentMargins` 等组合必须看顺序。
- `frame(maxWidth:"infinity")` + 同层 horizontal padding 常导致 padding 落在外侧被裁；要么不钉满宽，要么显式收窄有限宽度。
- `maxWidth:"infinity"` 不等于限制在父宽；父给无限宽时会被子内容 ideal 宽撑爆。
- JSX props 不支持的字段可能被静默丢或引发奇怪 build 错；临时 preview 需建 default-export wrapper。
- 孤立 TS 诊断会对单文件相对导入报假阳性；以 `preview_ui` 编译整依赖链为准。

## Specs

- `mydocs/specs/2026-06-29_12-55_MP3JuiceSource.md`
- `mydocs/specs/2026-06-29_17-15_LyricsLocal_PlayerRedesign.md`
- `mydocs/specs/2026-06-29_19-49_PlayerLyricOverflowFix.md`
- `mydocs/specs/2026-06-29_22-55_LibraryRedesign.md`
- `mydocs/specs/2026-06-30_00-55_ArtistImageDetail.md`
- `mydocs/specs/2026-06-30_09-35_AlbumImageDetail.md`
- `mydocs/specs/2026-06-30_09-50_LibraryCardsRedesign.md`
