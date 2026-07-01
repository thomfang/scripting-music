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
  - `efd17fc1` 发现页推荐卡加 contextMenu（试听/完整播放/下载/加歌单 + 解析中角标）
  - `c003ef44` 播放列表列表页重设计：新建/导入收进右上角 + 菜单，加空态
  - `c89e33e2` 播放页对抗性修复：play_count 去重计数 + 切歌竞态 playToken + 歌词在线落地 + LRU + shuffle 历史栈
  - `6708a6f0` fix: playNext/addToQueue 队列变更后重置 shuffle 历史
  - `8d276e03` 资料库首页导航竞态修复：卡片墙改声明式 NavigationLink；快捷宫格(LazyVGrid)用 Button+每卡独立 navigationDestination
  - `3da93621` 播放页点艺人/专辑跳详情页（嵌套 sheet+NavigationStack）+ 搜索页新增艺人/专辑模式；抽共享行组件 rows.tsx、搜索占位/结果区组件
  - `de891b4b` 搜索页艺人/专辑改走在线 iTunes（itunes_browse.ts + online_detail.tsx）+ 播放页详情 sheet 补 tint=systemPink
  - `92e3f1d1` 在线专辑/艺人详情曲目走真实 mp3juice 源(resolve_real.ts；可播放/下载/加歌单+解析态)+统一播放页/mini封面(use_cover.ts；已下载优先本地文件)
  - `e857e5b1` 对抗性 review 修复：在线曲目高亮改包含式 title+artist 匹配（mp3juice title 带噪声不能精确等）；playAll 后台入队加 queueBuildToken 防队列污染；单曲播放 bump token；TrackRow 卸载守卫+timer 清理
  - `ef054b15` 全局下载中心（download_center.ts 单例 Store + 并发队列 + 订阅 + 启动对账）+ 断点续传（part 落盘 + Range 206续/200重下）+ 6+ 下载调用点统一走 center + 库首页工具栏按需显下载入口（播放左侧）+ 修复退出丢下载状态
  - `c89e33e2` 播放页对抗性修复：play_count 去重计数 + 切歌竞态 playToken + 歌词在线落地 + LRU + shuffle 历史栈

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
- `page/player/lyric.tsx`：本地优先 `readLyrics` → 在线 LRCLIB 兜底；模块级 `lyricMemCache`（LRU 上限 60，`lyricCacheGet/Set`）避免重挂载闪 loading/重复拉取。**在线命中（synced/plain 非空）会 `saveLyrics` 落地本地**（未下载的流播歌也能二次秒进）；空结果不写。
- LRCLIB：`/api/get` → `/api/search` + `pickBest`；30min 内存缓存；`parseLrc` 去 `[ar:]` 等 metadata。
- 同步精度：不要依赖 `player_state` 1s tick；歌词高亮独立 250ms `setInterval(()=>player.getCurrentTime())`，`LYRIC_LEAD=0.2s` 前导补偿。

### 播放页设计/坑

- 背景：`CoverBackground` 铺满；有封面=放大模糊封面 + MeshGradient 增色 + SCRIM；无封面=彩色 Mesh。
- MeshGradient 是 `ShapeStyle` 对象（`{width,height,points,colors,smoothsColors}`），直接 `Rectangle fill={mesh as any}`，不是 JSX 组件。
- **MeshGradient 点位历史坑（已随 App 更新修复）**：早期 Scripting 的 MeshGradient 只能渲染「完全规则网格」，任何 point 偏离（哪怕中心 0.5→0.52）整块渲染纯黑；曾误以为是硬约束。开发者已修复，现 preview_ui 实测：位移点位 + 全点漂移均正常渲染并真实形变。
- 现「流动背景」采用**点位形变 + 色相漂移**结合（`cover.tsx`）：
  - `pointsAt(phase)`：四角钉死 0/1；边中点只沿边**切向**滑动（顶/底边只动 x、左/右边只动 y，法向恒 0/1）→ 四条边界始终贴框、**零露边**；中心点自由大幅游走。
  - `colorsAt(phase)`：9 顶点 HSL 色相各自异向连续偏移（`HUE_SPEED`）。
  - 靠 `useFlowPhase` 高频（120ms）setState 驱动；`animation` prop 不会对 fill 内 points/colors 插值，必须自己高频重算。
  - `background` 兜底色保留作保险（边界贴框后其实用不到）。
- `Animation` prop 要给实例：`{animation: Animation.smooth({duration}), value}`。
- `AVPlayer` 无播放流 metering/level/power；`onLevelUpdate`/`averagePower`/`peakPower` 只在录音/离线分析侧。因此背景只能时间驱动流动，不能跟真实音量。
- Scripting 无封面取色 API（UIImage 无 average/dominant/pixel read），用模糊封面/mesh 方案。
- 横向溢出核心坑：sheet/父视图可能给无限宽，`maxWidth:"infinity"` 不能限制到屏宽；长歌词会撑爆。需显式有限 `width`。
- 播放页最终用 `Device.screen.width - 48` 收窄根 VStack，保证左右 24pt；不要「先 frame 全屏再外侧 padding」，会被裁。
- 展开歌词：`lyricExpanded` 时小封面 56pt 收到歌名左侧，Title `compact`；未展开大封面在上。
- **封面正方形兼容（2026-07-01）**：`Cover` 接收 `{size, cornerRadius?, shadow?, matchedGeometryEffect?}`；结构=**固定边长正方盒**(`ZStack width=height=size`)→`clipShape` 圆角→`shadow`→`scaleEffect` 呼吸→内部 `Image scaleToFill + frame size×size` 填满被裁。任意比例封面(横/竖图)中心裁成正方形，**永不横向溢出**。大封面 `size=Device.screen.width-48`，展开小封面 `size=56`。⚠️ 正方盒必须给**明确边长**——`aspectRatio` 加在无内在尺寸的填充容器上会塌成 0（踩过：大封面 `maxWidth:infinity`+`aspectRatio` 高度塌 0 全空白）。
- **`matchedGeometryEffect` 跨条件分支不可用**：想用 Hero 让大/小封面在展开/收起间形变，但 `matchedGeometryEffect` 在**条件分支**(`lyricExpanded ? <HStack> : <VStack>`)间会把视图整棵移除/重建，导致封面+标题**全空白**。已放弃 Hero，改用 `withAnimation(Animation.smooth(0.45))` + 容器 `animation` prop 做简单缩放/淡入过渡。`Cover` 的 `matchedGeometryEffect` 保留为可选 prop（不传即忽略）。
- **`padding={undefined}` 致组件静默崩溃（重要通用坑，2026-07-01）**：`Title` 根 `VStack` 写 `padding={padding}`，当 `padding` 为 `undefined` 时 Scripting 的 `VStack` 渲染失败、**整个组件静默返回空**（连背景色盒都不出现，非 0 宽/布局问题）。现象：展开态 `<Title compact/>` 没传 padding→歌名/艺人空白；收起态传了 `padding={{top:24}}`→正常。修复：`{...(padding ? { padding } : {})}` 条件展开，undefined 时不传该 prop。**教训**：可选布局 prop（padding/frame 等）为 undefined 时不要直接透传给底层组件，用条件展开。二分定位靠隔离 preview（纯 mock 正常→真实组件空→套背景色确认抛错→逐 prop 试）。

### 播放器核心逻辑（`class/player.ts`，2026-06-30 对抗性修复）

- **play_count 计数唯一化**：`playMusic` 开始播放只调 `database.touchLastPlayed`（仅更 last_played_at）；`play_count+1` 只由 `checkPlayCompletion` 在 ≥80% 时一次（`hasCountedPlay` 守卫）。**不要在 playMusic 里 +1**（会导致双计数，污染最常播放/推荐权重）。
- **切歌竞态**：`playToken`，playMusic 进入 `++this.playToken`，每个 await（findAudioPath/resolveAudioUrl）后 `if(token!==this.playToken)return`，丢弃过期解析，避免「画面新歌、声音旧歌」。
- **shuffle 历史栈**：`shuffleHistory`(访问序)/`shuffleForward`(redo)。`nextShuffleIndex` 优先 forward.pop，否则在未播过且非当前首中随机（一轮播完重置）；`prevShuffleIndex` 从 history.pop 回真正上一首。`setQueue`/`setPlayMode`(变更时) 调 `resetShuffleHistory`。

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
- 导航坑（**2026-06-30 修正，重要**）：
  - **LazyVGrid 内**多 NavigationLink 会命中区串扰（点一个触发全部）→ 必须用 `Button + 每项独立 navigationDestination/useObservable`（每卡一个 observable，content 固定）。
  - **普通横向/竖向列表**（非 LazyVGrid，如横向卡片墙）直接用声明式 `NavigationLink destination=`，每项独立、正常。
  - **禁止**用「单一共享 `navTarget` state + 一个 navigationDestination + pushDetail(setNavTarget+observable.setValue)」的编程式方案：`setNavTarget`(useState 异步) 与 `observable.setValue`(同步触发 push) 存在时序竞态，push 时 navTarget 还是上一次值 → 详情页永远显示上一个/第一个。资料库首页专辑卡曾因此 bug。
- 收藏区 fallback：（已废弃）原「最爱/常听」回退逻辑随 C 段改为「最近播放」后不再使用。

## 播放页艺人/专辑跳转 + 搜索页艺人/专辑模式（`3da93621`）

- **入口**：播放页 `title.tsx` 艺人名/专辑名可点（占位「未知艺术家/未知专辑」不可点）；搜索页 Picker 新增「艺人」「专辑」两段。
- **播放页跳转架构**：`PlayerView` 由 TabView.sheet 弹出、**不在 NavigationStack 内**，故详情页须用「嵌套 sheet + sheet 内自带 NavigationStack」。封装在 `page/player/entity_sheet.tsx`（`PlayerArtistSheet`/`PlayerAlbumSheet`：实时 `getMusicBy*` 取库内该艺人/专辑歌曲 → loading/空态 → NavigationStack 包 `ArtistDetail`/`AlbumDetail`）。`index.tsx` 用 `entityNav` state + 根 ZStack `.sheet`（content 由 state 求值，**无命令式 push 竞态**）。
- **详情页 onClose**：`ArtistDetail`/`AlbumDetail` 加可选 `onClose?`，sheet 场景下 toolbar 左侧渲染「关闭」（`!isEditing && onClose`）；NavigationLink push 场景不传，保留系统返回键。
- **模块化**：艺人/专辑列表行抽到 `page/library/rows.tsx`（`ArtistRow`/`AlbumRow`），资料库列表页与搜索结果区共用（删除原私有 `ArtistRowContent`/`AlbumRowContent`）。搜索页拆 `components/entity_results.tsx`（`ArtistResultsSection`/`AlbumResultsSection`，普通列表声明式 NavigationLink）、`components/search_placeholder.tsx`（searching/error/empty 占位收敛）。
- **搜索逻辑**：`SearchMode=online|local|artist|album`；`doArtistSearch`/`doAlbumSearch` 走 `database.getMusicByArtist/getMusicByAlbum` 过滤；`showEmpty`/`has*Results` 覆盖四模式。

## 在线艺人/专辑搜索浏览 + 播放页 sheet tint（spec `2026-07-01_07-43`）

- **接口（iTunes Search/Lookup，必带 UA，country=US）**：
  - `search?entity=musicArtist` → 艺人（artistName/artistId/genre，**无图**）
  - `search?entity=album` → 专辑（collectionName/artistName/collectionId/封面/年份/曲数）
  - `lookup?id=<artistId>&entity=album` → 首条 artist + 该艺人全部专辑
  - `lookup?id=<collectionId>&entity=song` → 首条 collection + 各 track（trackName/trackNumber/duration/previewUrl）
- **数据层** `class/sources/itunes_browse.ts`：单例 `itunesBrowse`，4 方法 + 8s 超时 + 轻量缓存 + 降级空；封面 100→600。与 `itunes_meta.ts`（搜索结果富化）区分。
- **在线详情页** `page/search/online_detail.tsx`：`OnlineAlbumDetail`、`OnlineArtistDetail`（专辑墙）。⚠️ **曲目播放/下载不能直接用 iTunes trackId 当 mp3juice 源**（已修，见下方 `92e3f1d1` 章节）：必须 `resolveRealMusic` 先搜真实源。
- **艺人无官方图**：详情页头像/简介仍靠 TheAudioDB `artistInfo`，封面靠 iTunes，互补。
- **搜索页**：艺人/专辑模式从查本地改为 `itunesBrowse.searchArtists/searchAlbums`；`entity_results.tsx` 重写为在线版（艺人行 `ArtistRow`+可选 subtitle 显 genre，专辑行 iTunes 封面）。本地/在线歌曲模式不变。
- **在线详情页曲目播放/下载/加歌单**（`92e3f1d1`，spec `2026-07-01_08-11`）：
  - **关键纠错**：mp3juice `resolveAudioUrl` 只用 `source_id ?? id` 拼 `youtube.com/watch?v=<id>`，**从不按标题搜**。iTunes trackId ≠ YouTube videoId，故 iTunes 曲目**不能**直接当 mp3juice 源播放/下载（此前 online_detail 的 `trackToMusic`+SearchResultCard 就是这个 bug，全部失败）。
  - 正确姿势：`class/sources/resolve_real.ts` 的 `resolveRealMusic({title,artist,...})` 先 `music.search("标题 艺人")` 取首条真实 mp3juice 源（真实 id/source_id），再交 player/downloader。发现页 `resolveReal` 与在线详情页共用。
  - **高亮匹配坑**（`e857e5b1`）：真实源 `currentMusic.title` 是 mp3juice 原始标题（常带 “艺人 - ”/“(Official Video)”），与 iTunes 干净 `track.title` **无法精确等**（富化只改 artist/album/cover/duration，不改 title）。用 `isSameTrack`：包含式 title 匹配 + artist 校验。
  - **playAll 队列污染竞态**（`e857e5b1`）：首曲即播 + fire-and-forget 后台逐首 `addToQueue`；若期间用户另点专辑/单曲，旧 loop 会污染新队列。模块级 `queueBuildToken`：playAll 入口 `++token`，后台每次 `addToQueue` 前校验；单曲播放也 `token++` 断旧 loop。
- **播放页/mini 封面统一**（同 commit）：`page/player/use_cover.ts` 的 `useResolvedCover(music)→{localImage,remoteUrl}`，**已下载优先本地封面文件**（`getCoverPath`，与实际音频同源；下载若走 `findReplacementSource` 换源，本地图会与 DB `cover_url` 不同），否则远程 `cover_url`。`Cover`/`CoverBackground`/`PlayerInfo` 三处统一用它，修复 mini 与 player 页显示两张不同封面。

## 全局下载中心 + 断点续传（`ef054b15`，spec `2026-07-01_08-56`）

- **问题**：下载进度原本只活在各页面组件 state（`downloadingIds`/`isDownloading`+setTimeout 轮询 DB），退出/切页即丢，用户体感「退出就取消」。实际引擎 `fetchDownloader`（模块级单例）还在后台跑，只是无全局 UI 反映。
- **`class/download_center.ts`（单例 Store）**：所有下载统一 `downloadCenter.enqueue(info)`。内部 `Map<id,item>` + order + queue + active，**并发上限 3**，订阅通知（仿 player.on）。`enqueue` 返回 terminal（completed/cancelled resolve、failed reject）promise，保持 await 处「下完刷新」语义。`pause/resume/cancel/retry/remove/clearFinished/pauseAll/resumeAll`。`activeCount()`=queued+downloading+paused+failed（决定入口显隐，completed 不计）。`init()` 启动对账：把 DB 里上次会话卡在 downloading/pending/paused 且未下完的任务恢复为 paused（可重试/续传）。**坑**：`fetchDownloader.downloadMusic` 在已下载/已在队列时静默早退不触发 onProgress → center `start` 必须先探测 `audioExists` 否则 item 卡死 downloading、awaiter 永不结算。进度桥统一走 `onEngineProgress`。
- **`class/use_download_center.ts`**：`useDownloadCenter()→{items,activeCount}`，模块级单例直接订阅（不用 Context）。
- **`page/library/download_center.tsx`**：下载中心页；行内 `ProgressView value` + 状态文案 + 暂停/继续/取消/重试/移除；toolbar 全部暂停/继续/清除已完成；空态。
- **入口**：`page/library/index.tsx` 工具栏 `topBarTrailing` HStack，`activeCount>0` 时在「播放」Menu **左侧**显 `arrow.down.circle`+数字的 NavigationLink 进下载中心；为 0 隐藏。
- **断点续传（`fetch_downloader.ts` + `file_manager.ts`）**：新增 `<root>/downloads/<id>.part` 落盘（`appendPart` 用 `FileManager.appendData(Data.fromUint8Array)`，回退读+拼+写）。`performDownload` 改落盘式：part 存在且 `partUrl===当前解析URL` → 发 `Range: bytes=<offset>-`；**206** 续写（total 从 `Content-Range .../total` 解析）、**offset>0 但返回 200**（服务端忽略 Range）→ 删 part 从头重下。暂停保留 part/task/cb（不删）；`resume` 同会话走 `resumeDownload`（part 命中续），跨对账/被杀走 fresh `enqueue`/`start`（换 URL 自动重下）。取消删 part；失败**不删** part（便于重试续）。mp3juice 直链每次 resolve 可能换 CDN，换 URL 即重下（安全）。
- **调用点**：`all_songs/favorites/playlists/discover/online_detail/search_result_card/player/control` + `batch_download_helper.runBatchDownload`（改 center.enqueue 并发聚合）全部统一走 center；`download_manager.ts`（=fetchDownloader 别名）仍被 search_result_card `isDownloaded` 等只读用。
- **根 init**：`index.tsx` 在 `player.init()`(内含 database.init)+`downloadManager.init()` 后 `await downloadCenter.init()`。
- **迭代修复**（127e6670/66c6285f/7c05fb5d/f8d2a118/a2d275d4）：
  - 入口改常显（不再随任务数隐藏，防完成后页面空白）；数字徒随 activeCount 显隐。
  - 进度回调带字节数（received/total）；直链无 content-length 时显示已下 MB + 不确定进度条，解析阶段显「准备中」。完成项 5s 自清。
  - **进度不刷新坑**：`getItems()` 必须返回浅拷贝（store 原地改属性，同引用会被 React diff 跳过）。
  - **取消坑**：abort 信号在部分环境不能中断已开始的 body 流 → 取消改用循环内 `isCancelled` 标志（与暂停同机制）+ 流末入库前守卫；abort 保留作双保险。
  - **不预入库**（discover/online_detail 下载路径）：歌只在 `processDownloadedFile` 成功时 `addMusic(is_downloaded:true)`，取消/失败不在「最近添加」留残；加歌单路径仍预入库但都有 `if(!existing)` 守卫。
  - 新增 `RecentlyAddedView`（smart_playlists.tsx，getAllMusic 前50）；首页「最近添加」see-all 指向它（原误指全部歌曲）。
  - **对抗性 review 修复 a2d275d4**：P1-A `download_task` 行不再只增不减——`createDownloadTask` 先删同 musicId 旧行（幂等）+ terminal(完成/取消/abort/暂停态取消) 删 DB 行；`search_result_card` 终态改用 `enqueue` promise + `isDownloaded` 判定（不再靠 DB 行，因终态行已删）。P2-A `enqueue` 多调用方共享同一 terminal（awaiters 改数组，addAwaiter/settleAwaiters），不再误 resolve 旧 awaiter。P3-A `resume` 受 concurrency 约束（满则回队）；`runEngine` 对引擎已有活体 task 改调 `resumeDownload`（防 `downloadMusic` 因 `tasks.has` 静默早退导致 item 卡死）；启动清理孤儿 `.part`（`fileManager.listPartIds`）。P3-B `database.addMusic` upsert 用 `is_downloaded=MAX(...)` + `file_size=CASE WHEN excluded.is_downloaded=1` 防降级。


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
- `mydocs/specs/2026-06-30_23-56_PlayerEntityNav_SearchEntityModes.md`
- `mydocs/specs/2026-07-01_07-43_OnlineArtistAlbumSearch_SheetTint.md`
- `mydocs/specs/2026-07-01_08-56_DownloadCenter.md`