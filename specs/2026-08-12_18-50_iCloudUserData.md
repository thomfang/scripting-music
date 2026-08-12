# Spec: 用户歌单与已下载清单独立保存到 iCloud

## Goal

- 要解决什么问题：将用户创建的歌单及“曾下载歌曲”的可恢复元数据清单，从当前与 `music.db`/媒体文件耦合的存储方式中拆出，独立保存到 iCloud；任何云操作前必须先判断 iCloud 可用性。
- 验收结果：形成一套可实施、可降级、可迁移且不误删本地数据的架构方案；本阶段只调研和设计，不修改业务代码。

## Done Contract

- 什么算完成：梳理现有歌单、下载、本地文件、数据库及存储迁移链路，给出 iCloud 数据格式、存储边界、可用性门禁、同步/冲突/迁移策略和分阶段实施计划。
- 由什么证明：当前代码文件与符号证据、Scripting `FileManager` 能力核对、风险与测试矩阵齐全。
- 哪些情况仍算未完成：未解决 iCloud 不可用降级、缺失媒体恢复、多设备写冲突、旧数据迁移与回滚，或把云清单错误映射为本机已下载状态。

## Scope

### In

- 用户创建的普通歌单：歌单元数据、成员顺序、成员恢复快照。
- 已下载歌曲云清单：仅同步可恢复元数据，不同步音频、封面、歌词、断点分片。
- iCloud 可用性、文件未下载、读写失败时的降级行为。
- 当前 SQLite 数据迁移、启动/前台同步、写失败重试、多设备冲突与删除墓碑。
- 兼容现有 UI/调用方的最小 repository/service 边界。

### Out

- 本阶段不实现代码。
- 不同步 MP3/M4A 等音频文件、封面、歌词、`.part`、下载任务、播放队列、播放历史或收藏状态。
- 不把正在写入的 SQLite 作为多设备 iCloud 同步载体。
- 不承诺 FileManager 未公开的严格原子写、文件锁、NSFileCoordinator 或系统冲突版本处理能力。

## Restated Understanding

- 我理解当前任务是：在现有 Scripting Music 代码上，设计“用户歌单 + 已下载歌曲可恢复清单”独立 iCloud 持久化方案，并把 iCloud 可用性判断设为硬前置条件。
- 当前核心目标是：让用户数据可跨设备恢复，同时保持本机下载和播放稳定，云异常不能破坏或清空本地数据。
- 当前边界是：云端保存结构化元数据；本地 SQLite 和本地文件系统继续承担本机资料库与离线媒体。
- 暂不处理：媒体文件云同步、严格实时同步、CloudKit 后端、UI 视觉实现。

## Current Architecture Facts

### 1. 当前根目录与整体迁移

- `class/setting.ts:9-18`：`setting.getBasePath()` 在 App Group 与 iCloud 根之间二选一。
- `class/database.ts:91-96`：`music.db` 位于 `<base>/music.db`。
- `class/file_manager.ts:9-34`：音频、封面、歌词、下载分片均位于同一 `<base>` 下。
- `class/setting.ts:20-40` 与 `class/storage_migration.ts:22-65`：当前切换存储位置会复制整棵目录并清理旧目录。
- 结论：现有“存储到 iCloud”是整库/整媒体迁移，不等于“用户元数据独立同步”，二者必须解耦。

### 2. 当前歌单模型与耦合

- `class/database.ts:24-38`：`Playlist` 与 `PlaylistMusic` 类型。
- `class/database.ts:190-211`：`playlist` 与 `playlist_music` 两张表；成员只保存 `music_id`，依赖本机 `music` 表。
- `class/database.ts:418-500`：七个核心歌单方法集中在 `Database`：
  - `createPlaylist`
  - `getPlaylist`
  - `getAllPlaylists`
  - `addMusicToPlaylist`
  - `removeMusicFromPlaylist`
  - `getPlaylistMusic`
  - `deletePlaylist`
- `getPlaylistMusic` 当前通过 SQL `INNER JOIN music` 解析成员，拆云存储后需要“两阶段读取：云条目 → 本地 Music 映射”。
- 页面、picker、发现页、搜索页、队列、导入导出等十余处直接依赖上述 `database` 方法；不应让这些调用方直接读写 iCloud 文件。

### 3. 当前歌单一致性问题

- `addMusicToPlaylist` 验证歌曲存在，但未验证歌单存在。
- `MAX(position)+1` 与多个 `Promise.all` 批量调用组合，可能产生相同 position。
- `removeMusicFromPlaylist` 即使关联不存在也无条件 `music_count - 1`，可出现负数。
- `deleteMusic` 删除 `playlist_music` 后不重算相关歌单 `music_count`。
- 多步 CRUD 与导入没有显式事务。
- 迁移时不得信任现有 `music_count`；应按真实成员重算并规范化顺序。

### 4. 当前已下载列表的两个事实源

- `class/database.ts:290-294`：产品列表以 `music.is_downloaded=1` 为逻辑来源。
- `page/library/download.tsx:39-45`：已下载页直接调用 `database.getDownloadedMusic()`，只检查封面，不检查音频。
- `class/file_manager.ts:56-74`：本机是否真正可离线播放由 `findAudioPath/audioExists` 决定。
- `class/player.ts` 与 `class/batch_download_helper.ts` 已承认 DB 标志与文件存在性可能不一致。
- 结论：必须把以下状态分开：
  1. 云端“用户曾下载、可恢复”；
  2. 本机“媒体文件实际存在、可离线播放”。

### 5. 下载完成与删除链路

- `class/fetch_downloader.ts:340-445`：下载完成后先写媒体文件，再 `database.addMusic({is_downloaded:true})`，然后发 completed。
- `class/fetch_downloader.ts:599-604`：已有“仅移除本地下载”的 `deleteDownload`，但生产 UI 基本未使用。
- `page/library/download.tsx:71-75,98-104`：已下载页当前“删除”调用 `database.deleteMusic()`，会删除歌曲、媒体和歌单关系，不只是腾出空间。
- `class/database.ts:404-416`：`deleteMusic` 混合了文件副作用、Music DAO 和歌单关联删除。
- 结论：实现云清单前必须区分“移除本机下载”“从本机资料库删除”“从跨设备云清单移除”。

### 6. 当前分享格式不能直接作为云格式

- `class/playlist_share.ts` 的 `.smpl.json` 是交换格式，不是持久化同步格式。
- 当前分享条目缺少 `source_id`、membership `added_at`、revision、writer、tombstone 等同步字段。
- `serializePlaylist` 当前未真正导出 playlist cover（虽类型允许）。
- 云持久化格式应单独版本化，不复用分享格式。

## Confirmed Scripting iCloud Capabilities

### 可用

- `FileManager.isiCloudEnabled`：判断 iCloud 是否启用。
- `FileManager.iCloudDocumentsDirectory`：取得 iCloud Documents；iCloud 不可用时可能抛错。
- `FileManager.isFileStoredIniCloud(path)`。
- `FileManager.isiCloudFileDownloaded(path)`。
- `FileManager.downloadFileFromiCloud(path)`。
- 基本文本/字节读写、目录创建/枚举、复制、重命名、删除、`stat`。

### 不可假设

- 没有公开的上传进度或“其他设备已收到”状态。
- 没有公开严格原子写/原子替换保证。
- 没有公开 `NSFileCoordinator`、文件锁、`NSFileVersion` 或冲突版本枚举/解决 API。
- 因此临时文件、回读校验、revision、备份只能降低风险，不能宣称实现强一致分布式事务。

## Hard iCloud Availability Gate

所有云端入口统一经过一个 gate，业务层禁止直接访问 `FileManager.iCloudDocumentsDirectory`：

```ts
type CloudAvailability =
  | { available: true; rootPath: string }
  | { available: false; reason: "disabled" | "unreachable" | "downloadFailed" | "corrupt" }

async function resolveCloudAvailability(): Promise<CloudAvailability> {
  if (!FileManager.isiCloudEnabled) {
    return { available: false, reason: "disabled" }
  }
  try {
    const rootPath = Path.join(
      FileManager.iCloudDocumentsDirectory,
      "Scripting Music User Data",
      "v1"
    )
    await FileManager.createDirectory(rootPath, true)
    return { available: true, rootPath }
  } catch {
    return { available: false, reason: "unreachable" }
  }
}
```

读取单个云文件时还必须：

1. 判断文件是否存在；
2. 若存于 iCloud 且未下载，调用 `downloadFileFromiCloud`；
3. 下载失败返回“暂不可读”，不是“空数据”；
4. JSON 解析/校验失败返回 corrupt 并保留备份，不覆盖；
5. 任何云失败都不得删除或清空本地 SQLite/媒体。

### 不可用时的产品语义

- App 正常进入，继续使用本地 SQLite 与本地媒体。
- 新建/修改歌单可先写本地 outbox，标记“待同步”，不得因云不可用阻断核心操作。
- 下载完成仍判为成功；云清单写失败进入 outbox 重试。
- UI 可显示“iCloud 未启用/同步暂停”，但不得显示“云端为空”。
- 用户重新启用 iCloud 后，在启动、前台恢复或手动重试时合并 outbox。

## Options Considered

### Option A：独立 iCloud SQLite

- 优点：复用 SQL 与查询。
- 缺点：SQLite/WAL/SHM 在多设备 iCloud 文档同步中风险高；当前 SQLite 无可靠显式 close；冲突文件难合并。
- 结论：不推荐。

### Option B：所有歌单 + 下载清单放一个 JSON

- 优点：实现最简单。
- 缺点：任一小改动重写全量数据；并发写冲突和损坏半径最大。
- 结论：只适合原型，不推荐生产方案。

### Option C：按实体/操作分片的可合并文档（推荐）

- 歌单元数据每歌单一个文档；歌单成员变更使用带全局唯一 `operationId` 的 append-only 操作文件，而不是并发覆盖完整 `entries` 数组。
- 已下载目录每首歌一个状态文档，删除/重新加入以同一实体的 generation + 操作记录表达。
- 优点：不同实体写入范围小；并发 add/add 可取操作并集；remove 有明确 tombstone；不依赖单个 manifest 作为真相源。
- 缺点：需要 operation 去重、物化快照、compaction 和长期离线设备水位协议；实现前必须先做规模与性能探针。
- 结论：推荐作为权威布局；首版不引入云端 `manifest/backups`，App Group 物化快照仅作缓存和回滚镜像。

## Recommended Architecture

### 1. 数据职责

| 数据 | 权威位置 | 是否跨设备 |
|---|---|---:|
| 音频、封面、歌词、part | App Group 本地文件 | 否 |
| 本机 Music 资料库、收藏、播放状态 | 本地 SQLite | 否（本次） |
| 用户歌单操作与元数据 | iCloud 独立 `Scripting Music User Data/v1` | 是 |
| 曾下载歌曲目录操作 | iCloud 独立 `Scripting Music User Data/v1` | 是 |
| 本机离线可用状态 | `audioExists` + 本地 DB | 否 |
| 云写失败 outbox | App Group 本地文件/Storage | 否，仅重试用途 |
| UI 快速缓存 | App Group 本地快照 | 否，可重建 |

### 2. 文件布局

```text
<iCloudDocumentsDirectory>/Scripting Music User Data/v1/
├── playlist-meta/
│   └── <playlist-id>.json
├── operations/
│   ├── playlists/<playlist-id>/<operation-id>.json
│   └── downloaded/<music-id>/<operation-id>.json
└── snapshots/           # 仅 compaction 后生成；操作日志仍受水位协议保护
```

**该根目录必须与旧 `<iCloud>/Scripting Music` storage 根完全分离。** 首次云写之前必须先禁用/隔离旧 storage toggle 的递归清理能力；否则 `cleanupPath` 会删除新云数据。文件名使用稳定、安全编码后的 ID。首版不设置云端 manifest 或 backup 作为第二真相源。

### 3. 歌单云模型：元数据 + 操作日志

歌单元数据不再携带并发可编辑的完整 `entries` 数组：

```ts
type CloudPlaylistMetaV1 = {
  format: "scripting-music-cloud-playlist-meta"
  schemaVersion: 1
  id: string
  name: string
  portableCoverUrl?: string
  createdAt: number
  generation: string
}

type PlaylistOperationV1 = {
  format: "scripting-music-playlist-operation"
  schemaVersion: 1
  operationId: string       // writerId + 单调序号/UUID，全球唯一且幂等
  playlistId: string
  generation: string        // 删除后重建不会被旧操作污染
  writerId: string
  writerSequence: number    // 每 writer 单调递增，不依赖墙钟判断因果
  kind: "create" | "rename" | "add" | "remove" | "delete"
  musicId?: string
  afterMusicId?: string     // 顺序意图；物化时确定性求序
  snapshot?: {
    title: string
    artist: string
    album: string
    duration: number
    coverUrl?: string
    provider?: string
    sourceId?: string
  }
  name?: string
  observedOperationIds?: string[]
}
```

合并规则：

- operation 集合按 `operationId` 取并集并去重，add/add 不丢失。
- remove 必须是显式 membership 操作，记录其观察到的 add；不能靠完整数组缺项表达删除。
- 整单 delete 终止当前 generation；同 ID 重建必须使用新 generation。
- `music_count` 从物化后的 active membership 派生。
- 顺序不能依赖两设备各自的 position；使用 `afterMusicId + 确定性 tie-break(operationId)` 物化。
- compaction 前必须定义每 writer/device 的已见水位；不能仅按 90 天删除旧操作，否则长期离线设备会复活数据。首版可不 compact。
- 歌单 cover 只允许可跨设备 URL/预设标识；本地绝对路径不得迁移。

### 4. 已下载云记录

```ts
type CloudDownloadedRecordV1 = {
  format: "scripting-music-cloud-downloaded"
  schemaVersion: 1
  id: string
  title: string
  artist: string
  album: string
  duration: number
  coverUrl?: string
  provider?: string
  sourceId?: string
  downloadedAt: number
  lastUpdatedAt: number
  writerId: string
  revision: number
  recoverability: "recoverable" | "metadataOnly"
  lastKnownFileSize?: number
}
```

关键决策：

- 记录表达“曾成功下载过的目录项”，不表达“本机已有文件”。
- `recoverable` 仅在 provider/sourceId 经验证足以重新解析时使用；历史数据缺字段时标为 `metadataOnly`，不承诺可重新下载。
- 不保存 `audio_url`、本地路径或 `is_downloaded=true`。
- 云记录只进入独立 App Group catalog cache；只有用户主动恢复并且本地音频写入成功后，才进入/更新 Music 为 `is_downloaded=true`。

### 5. 下载目录操作与 generation

下载目录也使用幂等 operation 表达 `catalog` / `remove`，每次用户明确重新加入云目录时生成新 generation。删除不是物理缺失，也不依赖设备墙钟；物化时只接受当前 generation 内按因果/确定性规则胜出的操作。首版不 compact，以避免长期离线设备复活旧记录。

## Repository / Service Boundaries

### 1. CloudUserDataStore

建议新增统一底层模块：

```ts
type CloudReadResult<T> =
  | { status: "success"; value: T }
  | { status: "missing" }
  | { status: "containerUnavailable"; reason: string }
  | { status: "directoryUnavailable"; reason: string }
  | { status: "downloadFailed"; reason: string }
  | { status: "corrupt"; reason: string }
  | { status: "unsupportedVersion"; version: number }

interface CloudUserDataStore {
  containerAvailability(): Promise<CloudAvailability>
  readValidated<T>(path: string, validate: (v: unknown) => T): Promise<CloudReadResult<T>>
  writeVerified<T>(path: string, value: T): Promise<CloudReadResult<T>>
}
```

职责：分层判断账户/容器、目录枚举、单文件下载与读取、schema 校验及可恢复写；任何 unavailable/corrupt 都不能压成 `null`、`false` 或空数组。`createDirectory` 成功只表示容器路径可写尝试成功，不代表目录内容完整、新鲜或已上传。

### 2. PlaylistRepository

```ts
interface PlaylistRepository {
  init(): Promise<void>
  create(name: string, cover?: string): Promise<string> // 保持现有门面签名
  get(id: string): Promise<Playlist | null>
  list(): Promise<Playlist[]>
  getEntries(id: string): Promise<PlaylistEntry[]>
  addMusic(id: string, music: Music): Promise<void>
  removeMusic(id: string, musicId: string): Promise<void>
  delete(id: string): Promise<void>
  reconcile(): Promise<void>
}
```

最小兼容策略：现有 `database` 单例暂时保留门面；七个歌单方法转发到 repository。这样多数页面和 `playlistShare` 第一阶段无需改调用签名。

`getPlaylistMusic` 兼容实现：

1. repository 物化有序 entries；
2. 批量读取本地 Music（需新增批量 API，避免 N+1）；
3. 本地缺失的 snapshot 只进入独立的 App Group 云缓存，不自动插入 `music` 表，避免污染“所有歌曲/最近添加/艺人/专辑/推荐”；
4. 新增 `getPlaylistEntries` 供 UI 展示缺失/可恢复项；只有用户主动恢复或加入本机资料库时才插入 Music；
5. 播放队列只取当前可解析/可播放的 Music。

### 3. DownloadCatalogRepository

```ts
interface DownloadCatalogRepository {
  readCatalog(): Promise<CloudReadResult<CloudDownloadedRecordV1[]>>
  upsertDownloaded(music: Music): Promise<void>
  removeFromCatalog(musicId: string): Promise<void>
  reconcile(): Promise<void>
}
```

### 4. DownloadLibraryService

```ts
interface DownloadLibraryService {
  commitCompletedDownload(info: DownloadInfo, fileSize: number): Promise<void>
  removeLocalDownload(musicId: string): Promise<void>
  removeFromCloudCatalog(musicId: string): Promise<void>
  deleteMusicEverywhere(musicId: string): Promise<void>
  reconcileAtStartup(): Promise<void>
}
```

语义必须明确：

- `commitCompletedDownload`：媒体文件写成功 → 本地 DB `is_downloaded=true` → 尝试写云；云失败写 outbox，不回滚本地下载。
- `removeLocalDownload`：删本机媒体并设本地 `is_downloaded=false`，保留云记录和歌单关系。
- `removeFromCloudCatalog`：写云 tombstone；默认不自动删除本机媒体，避免远端动作突然释放本机文件。
- `deleteMusicEverywhere`：删除本机 Music/媒体，并对下载云清单写 tombstone；是否移除云歌单 entry 不应隐式发生。

## Import and Cloud Merge

现有 `playlistShare.importFromFile(filePath, { mergeIntoPlaylistId? })` 的两种模式都能进入云同步，但必须经过 `PlaylistRepository`，不能继续直接循环写 SQLite 后再上传完整歌单。

### 1. 导入为新歌单

- 每次用户明确选择“新建”时生成新的 `playlistId`、`generation` 和持久化 `importSessionId`。
- 发出一个 `create` operation，再为导入文件中的去重歌曲发出 `add` operations。
- 同名仍沿用当前 `resolvePlaylistName` 规则生成 `(导入 2)` 等名称；跨设备真正身份以 playlistId 为准，不以名称合并。
- 同一个文件被用户再次明确执行“新建”应创建另一份歌单；但同一次会话因崩溃/重试不得重复创建。

### 2. 合并到现有歌单

- 目标使用现有 playlistId/generation。
- 导入歌曲按 `musicId` 与已物化 membership 去重，保持当前“同一歌曲在同一歌单只出现一次”的语义。
- 每个新增成员生成确定性的 operationId，例如 `hash(importSessionId | targetGeneration | musicId)`；网络失败、App 重启和 outbox 重放都不会重复添加。
- 其他设备同时添加不同歌曲时，operation 集合取并集，双方均保留。
- 其他设备同时 remove 同一歌曲时，按 remove 所观察到的 add operation 处理；导入发生在 remove 之后的新 generation/add 不应被旧 remove 误删。

### 3. 导入顺序

- 导入文件中 `musics[]` 的数组顺序是其唯一顺序信息。
- 第一首使用当前尾部作为 anchor，后续每条 add 以前一首导入歌曲作为 `afterMusicId`，形成稳定链。
- 与另一设备并发插入到同一 anchor 时，用 operationId 作确定性 tie-break，保证所有设备最终顺序一致；不承诺并发导入之间维持“整块绝不穿插”，若产品要求整块连续需增加 `batchId + batchIndex` 物化规则。
- 推荐增加 `batchId=importSessionId` 与 `batchIndex`，使同一次导入在物化时优先保持连续块。

### 4. 歌曲元数据

- 当前分享格式缺少 `source_id`；导入后若本机已有 Music，优先用本机完整 `provider/source_id` 构造 snapshot。
- 本机不存在时使用分享文件元数据创建云 snapshot；只有用户选择加入本机资料库时才写 `music` 表。
- 分享文件只有 `provider` 而无可靠 sourceId 的条目标记为 `metadataOnly` 或后续按标题/艺人重新解析，不承诺直接恢复播放。

### 5. iCloud 不可用与失败恢复

- 导入开始前仍先检查 iCloud gate，但 unavailable 不阻断本地导入。
- 在修改本地物化歌单前，先将完整导入会话和 operations 写入 App Group outbox。
- iCloud 不可用时显示“已导入，等待同步”；恢复后逐 operation 幂等上传。
- 导入中途崩溃后按 importSessionId 继续未完成 operations，而不是创建第二个歌单。
- 只有本地物化结果通过条目数、成员集合及顺序校验后，UI 才报告本地导入成功；云同步状态单独报告。

### 6. 批量规模与兼容门面

- 为避免数千首歌逐条 UI await，可新增 repository 批量入口，但底层仍生成可独立去重的 operations：

```ts
interface PlaylistRepository {
  importAsNew(input: ImportPlaylistInput, sessionId: string): Promise<ImportStats>
  importInto(playlistId: string, input: ImportPlaylistInput, sessionId: string): Promise<ImportStats>
}
```

- `playlistShare.importFromFile` 继续作为解析/校验门面，解析成功后一次性交给 repository；页面调用方式可基本保持不变。
- `ImportStats` 增加 `pendingCloudSync` 与 `metadataOnly`，区分本地导入结果和云同步状态。

## Reconciliation Rules

### 1. 下载清单三方对账

输入：云 downloaded records、本地 SQLite、本地 `audioExists`。

| 云记录 | 本地 Music | 本地音频 | 处理 |
|---|---|---|---|
| 有 | 无 | 无 | 写入独立 catalog cache，不自动插入 `music`；UI 显示 recoverable/metadataOnly |
| 有 | 有 | 无 | 保留 Music 元数据，显式修正本地 `is_downloaded=false` |
| 有 | 有 | 有 | 本地 `is_downloaded=true` |
| 云目录无此项且状态确定 available | DB 标已下载 | 有 | 首次迁移/本机新下载：生成 catalog operation |
| 云目录无此项且状态确定 available | DB 标已下载 | 无 | 修正本地 `is_downloaded=false`，不上传错误状态 |
| remove operation 胜出 | 本地有文件 | 有 | 不自动删本机媒体；仅标云目录已移除 |
| remove operation 胜出 | 仅 catalog cache | 无 | 从 active catalog 视图隐藏；保留操作历史 |

P0 规则：**绝不能因为云记录存在就把本机 `is_downloaded` 设为 true。**

### 2. 歌单对账

- 云歌单是跨设备权威；App Group 只保留最后成功快照供离线读和 outbox。
- 云不可读时从本地快照展示，并允许产生待同步操作。
- 云恢复后按 operation/entry 合并，不以“本地整单覆盖云整单”。
- 删除本地歌曲默认保留云歌单 entry/snapshot，使其他设备和未来恢复仍可见；这与当前 `deleteMusic` 自动删除所有关系的语义不同，需要产品确认。

### 3. 同步触发点

- 启动前置：若 `setting.location === "iCloud"`，先执行“旧整库存储迁回 App Group”的受控迁移与完整性验证；未成功前不得启用新云层，也不能承诺离线降级。
- 运行时顺序：`player.init()`（含 fileManager/database）→ 下载目录/歌单 reconcile → `downloadManager.init()` → `downloadCenter.init()`；实际顺序需由 Phase 0 探针确认是否会影响 download task 恢复。
- 前台恢复：当前 `index.tsx` 的 `Script.onResume` 为空；建议节流 reconcile，但先以 100/1000/10000 文件规模探针确定成本。
- 歌单 create/add/remove/delete 后：先持久化单个 operation 到 App Group outbox，再更新同一日志派生的本地物化快照，随后尝试上传 operation。
- 下载完成后：本地提交成功后写 catalog operation。
- 手动入口：设置页提供“立即同步/重试”和最近错误状态。

## Outbox and Rollback Protocol

- outbox 使用 App Group 中 append-only NDJSON/逐操作文件；每条操作先以唯一 `operationId` 落盘成功，再更新物化快照，避免“两份状态谁先写”的歧义。
- 重试按 operationId 幂等；同一 writer 的 `writerSequence` 保序；上传后不能仅凭写后立即回读就删除 outbox，因为这不证明已上传或其他设备已见。
- 首版采用保守确认：operation 在后续独立 reconcile 中从云目录重新枚举并读回后才标记 acknowledged；ack 记录也保留可重建水位。
- crash 后以 outbox 重放重建物化快照；临时/未知文件名不参与实体扫描。
- “代码回滚”与“数据回滚”分开：切云读路径后仍持续维护 App Group 物化镜像和完整 operation journal。回滚前必须把已确认云操作 + 未提交 outbox 物化回旧 SQLite 两表并对账，成功后才能切回；云不可读时不得用陈旧 SQLite 覆盖较新云数据。
- 旧 SQLite 表仅是初始迁移源，不单独构成数据回滚能力。

## Migration Marker Semantics

- 本地 marker：每设备记录旧数据是否已导出、导出水位和校验报告；不能因为别的设备已迁移而跳过本机独有数据。
- 云端不设单一“全账户迁移完成”开关；每个迁移 operation 带稳定 sourceDeviceId/sourceRowKey，重复上传幂等。
- schema 版本与设备数据迁移状态分开；目录不可枚举或任一文件 unavailable 时不得提交本地完成 marker。

## Safe Write Strategy

operation 文件以不可变 `operationId` 命名，避免“覆盖共享完整文档”：

1. 在 App Group outbox 写完整 operation 并回读校验；
2. 检查云端同名 operation：存在且内容一致视为幂等成功，存在但内容不同视为 corrupt/ID 冲突；
3. 不存在则直接写该唯一最终路径；由于 FileManager 无 create-if-absent/CAS 保证，operationId 必须由足够强的 UUID/设备序列确保不碰撞；
4. 写后回读仅证明本机 ubiquitous container 内容正确，不作为上传/多设备可见确认；
5. 在后续独立 reconcile 重新枚举并读到一致 operation 后才记 ack；outbox/journal 在首版不物理清除，只标 acknowledged；
6. 元数据物化文件与 snapshots 都可由 operation 重建，不作为唯一真相源。

该策略仍不承诺实时上传或强一致，但并发设备写不同 operation 文件时可通过集合并集保留双方修改，不再依赖 rename 覆盖共享 JSON。

## Migration Plan

### Phase 0：安全前置、语义与探针

- **先于任何新云写**：将新云根固定为 `<iCloud>/Scripting Music User Data/v1`，与旧 `<iCloud>/Scripting Music` 完全分离；禁用或改造旧 toggle 的递归父目录清理。
- 对 `setting.location === "iCloud"` 的用户，先设计并验证迁回 App Group：SQLite 无真实 close，必须探针 WAL/SHM、迁移后执行数据库完整性与数据行校验；失败保持旧模式且不启用新云层。
- 确认“已下载列表存 iCloud”指元数据目录，不是媒体文件。
- 隔离测试：iCloud disabled、容器/目录/文件各级不可达、云文件未下载、`rename` 覆盖、写后回读，以及 100/1000/10000 文件枚举成本。
- 固化 operation/outbox/ack/generation/rollback 协议和 schema validator；不切权威源。

### Phase 1：建立独立云层，写操作日志但不切读

- 前提：Phase 0 的旧 toggle 隔离和旧 iCloud storage 用户迁回路径已由测试证明。
- 新增 `CloudUserDataStore`、operation-based `PlaylistRepository`、`DownloadCatalogRepository` 与 outbox。
- 当前 SQLite 仍为歌单读取权威，并持续作为物化镜像更新，保证真实数据回滚。
- 歌单和下载成功后写本地 operation/outbox，再尝试上传；iCloud 不可用时只排队。
- 只有在后续独立 reconcile 从云端重新读到 operation 后才 ack，不以本次 write/read-back 当上传确认。
- 验证并发 add/add、add/remove、删除后重建、崩溃重放与双设备基础行为。

### Phase 2：一次性迁移与校验

歌单迁移：

1. 读取所有 SQLite playlist；
2. 读取各自 `playlist_music`，不要信任 `music_count`；
3. 清理不存在 playlist 的孤儿关系；
4. position 按现有顺序稳定排序后规范为 `0...n-1`；
5. 为每个 entry 写 Music snapshot（含 `source_id`）；
6. 写入临时云目录并完整回读；
7. 比对歌单 ID、名称、条目数、成员集合和顺序；
8. 记录本设备 migration marker；SQLite 表继续作为 operation 物化镜像更新，至少一个版本周期不 DROP。

下载清单迁移：

1. 读取 `is_downloaded=1` 的 Music；
2. 对每条调用 `audioExists`；
3. 只有真实音频存在的条目进入云目录；按 provider/sourceId 可验证性标记 `recoverable` 或 `metadataOnly`；
4. 缺文件的 DB 标志修正为 false，不上传；
5. 写云后回读验证 ID、provider/sourceId 与记录数。

### Phase 3：切歌单读路径

- 七个歌单门面切到 `PlaylistRepository`。
- `getPlaylistMusic` 改为 operation 物化 entry + 本地批量映射；云 snapshot 不自动插入 Music 表。
- 云不可用时读 App Group 物化快照；UI 显示同步状态。
- 旧 SQLite 歌单表继续由物化镜像维护，直到“云+outbox → SQLite”回滚演练通过并经过稳定期，不得立即停止写入。

### Phase 4：下载清单 UI 与领域语义

- “已下载”页展示两类状态：
  - 本机已下载；
  - iCloud 可恢复（本机未下载）。
- 删除菜单拆分：
  - 移除本机下载；
  - 从 iCloud 可恢复清单移除；
  - 从资料库删除。
- 首页数量需明确：建议标题仍显示本机离线数量，详情页另显示“iCloud 可恢复 N 首”，避免原有语义静默变化。

### Phase 5：重定义设置开关与收尾

- 旧 toggle 的危险清理能力已在 Phase 0 前置处理；本阶段只完成产品 UI 重命名和遗留兼容收尾。
- 数据库/媒体固定到 App Group；设置页开关改成“iCloud 同步用户数据”。
- `cleanupPath` 只允许白名单清理旧业务子项，永远不得递归删除新独立云根。

## Risks and Mitigations

### P0

1. **iCloud 不可用/不可读被误判为空**
   - 以判别联合区分 container、directory、file、download、corrupt；禁止 unavailable 参与空集合合并。
2. **云下载记录错误设为本机已下载**
   - `is_downloaded` 只由本机 `audioExists`/下载提交决定。
3. **多设备歌单修改丢失**
   - 不覆盖完整 entries；使用 operationId 幂等操作并集、membership remove、generation 与首版不 compact。
4. **旧存储清理误删独立云数据**
   - 独立顶层目录；首次云写前完成 toggle 隔离和旧 iCloud 用户迁回验证。
5. **回滚丢失切读后的修改**
   - 持续维护 operation journal + App Group/SQLite 物化镜像；回滚前强制物化和对账。

### P1

1. **歌单引用本机不存在歌曲**
   - entry 保存恢复 snapshot；UI 能显示可恢复状态。
2. **删除语义跨设备破坏歌单**
   - 删除本机 Music 不默认删除云歌单 entry。
3. **本地成功、云写失败的部分完成**
   - 本地优先、outbox 重试；云失败不回滚核心操作。
4. **当前歌单计数/顺序脏数据迁入云**
   - 迁移时重算 count、规范化 order、记录异常报告。

### P2

1. `DownloadView` 当前不检查音频文件；切换前需统一 availability。
2. 多个 UI 直接 `database.deleteMusic()`，以及智能列表重复直接删 `.mp3`；后续应收口 service。
3. 分享格式缺 `source_id` 和 cover 实际导出问题可单独修，但不阻塞云格式。

## Validation Plan

### Static / Unit

- schema validator：合法、未知版本、缺字段、重复 ID、非法路径 ID、超大数组。
- availability gate：disabled、getter 抛错、目录创建失败。
- merge：并发 add/add、add/delete、旧 active 与新 tombstone、同 revision 不同 writer。
- outbox：写失败保留、重复执行幂等、成功后清理。
- 歌单：重复添加幂等、remove 不存在条目幂等、顺序稳定、count 派生。
- 下载：云恢复不能置 `is_downloaded=true`；缺文件修正 false；真实文件补写云记录。

### Integration / Fault Injection

- 飞行模式、退出 iCloud、iCloud Drive 关闭。
- 云文件存在但尚未下载；下载返回 false。
- JSON 截断/损坏/版本过高。
- 写临时文件成功、替换失败；替换成功、回读失败。
- App 在写入各阶段被终止后重启恢复。
- 两设备分别添加不同歌曲后合并；一端删除、一端离线旧写后不复活。
- 现有 App Group 与现有整库 iCloud 两种用户路径分别迁移、回滚。

### Migration Evidence

- 迁移前后：歌单数、每单成员集合、顺序、名称、创建/更新时间对比报告。
- 下载清单：云记录数必须等于迁移时真实 `audioExists=true` 的下载记录数。
- 旧 SQLite 表在切读后仍可回滚，直到人工确认稳定。

### Runtime / UI

- iCloud 不可用时 App、播放、下载、歌单本地操作仍可用。
- 同步失败可见但不弹窗轰炸；提供手动重试。
- 新设备能看到歌单条目和可恢复下载记录，但不会显示为本机离线可用。
- “移除本机下载”不会移出歌单或删除云恢复记录。

## Open Questions / Product Decisions

- [ ] 并发导入的歌曲块是否必须保持整体连续？推荐使用 `batchId + batchIndex` 保持单次导入连续，并以 batch operationId 排并发块。
- [ ] 用户再次明确“新建导入”同一个文件时，是否允许创建副本？推荐允许；仅同一 importSession 的故障重试幂等。
- [ ] 历史下载缺少 provider/sourceId 时按 `recoverable` 还是 `metadataOnly` 展示？推荐显式分级，不承诺一定可重新下载。
- [ ] “删除本机歌曲”后，是否仍保留云歌单 membership？推荐保留，以支持跨设备与未来恢复。
- [ ] “已下载”页是否同时展示云端目录项？推荐展示 `localAvailable / recoverable / metadataOnly / cloudUnknown / pendingSync` 状态。
- [ ] 首页“已下载 N 首”统计本机离线数还是云目录数？推荐保持本机离线数，另显示云目录数。
- [ ] 用户是否允许关闭云同步后继续本地编辑并稍后合并？推荐允许，使用 operation outbox。
- [ ] operation compaction 水位协议何时实现？推荐首版不 compact。
- [ ] 是否把整体“存储到 iCloud”开关迁移为“同步用户数据”？推荐是；危险清理隔离必须在首次云写前完成。

## Goal Alignment Check

- 当前动作是否仍服务于核心目标：是；方案始终围绕独立 iCloud 用户数据、下载元数据清单和可用性门禁。
- 若否，偏差在哪里：无。
- 是否需要调整本轮目标或范围：已按用户补充将“已下载歌曲可恢复清单”纳入；媒体文件明确排除。

## Checkpoint Summary

- 当前任务理解：先产出可评审方案，不立即实现。
- 当前核心目标：用户歌单和曾下载清单独立持久化到 iCloud，云不可用时安全降级。
- 当前进度：代码链路、平台能力、推荐架构、迁移和验证方案已完成。
- 下一步 1：用户确认 Open Questions 中的产品语义。
- 下一步 2：批准后先实施 Phase 0 探针与 Phase 1 双写基础层，不直接切换权威源。
- 涉及文件 / 模块：`class/database.ts`、`class/setting.ts`、`class/storage_migration.ts`、`class/file_manager.ts`、`class/fetch_downloader.ts`、`class/app_runtime.ts`、`class/playlist_share.ts`、下载/歌单 UI 与测试。
- 风险：数据迁移、iCloud 并发覆盖、删除语义、旧整体存储开关误删。
- 验证方式：单测、故障注入、双设备合并测试、迁移前后对账、保留回滚源。
- Execution Approval: `Approved (2026-08-12 19:10, scope: Phase 0 safety prerequisites + Phase 1 foundation; no authority-source switch)`

## Change Log

- 2026-08-12：完成现状调研；确认每歌单独立 iCloud JSON 可行，但 FileManager 不提供强原子/系统冲突解决保证。
- 2026-08-12：按用户补充加入“已下载歌曲元数据可恢复清单”；明确媒体文件不入云、iCloud availability 为硬门禁。
- 2026-08-12：补充导入同步：新建与合并导入均转换为带 importSessionId/batchId 的幂等 operations；支持离线 outbox、并发并集、稳定顺序和崩溃续传。
- 2026-08-12：完成 Phase 0/1 基础实现：新增 iCloud gate/operation/outbox/import session/runtime 模块；新云根不在旧 storage 根下；启动只读探测且不阻塞下载恢复；全项目诊断通过，95/95 测试通过。

- 2026-08-12：用户明确批准开始实施；本轮边界固定为 Phase 0 安全前置与 Phase 1 基础层，不迁移真实用户数据、不切换歌单读取权威源。

## Validation

- Self-check：已覆盖目标、范围、事实、方案比较、推荐架构、迁移、降级、冲突、风险和测试。
- Static checks：TypeScript 全项目诊断 0 errors。
- Runtime / Test：`scripting-ts run tests/run_tests.ts`：14 suites / 95 cases，95 passed、0 failed；项目入口完成核心初始化与下载中心对账，随后因 UI 持续展示在 20s CLI 窗口超时，未出现初始化异常。
- Human confirmation：用户已批准 Phase 0 安全前置与 Phase 1 基础层实现。
- 结果汇总：已完成独立云根、只读 iCloud gate、显式错误结果、operation schema、App Group outbox、导入 session/批次建模、旧 cleanup 防护与非阻塞启动检查；未切换真实歌单权威源，也未接入真实云上传。
- 核心目标是否已由证据证明完成：本轮 Phase 0/1 基础层目标已由诊断与 95 项测试证明；完整跨设备同步功能尚未完成。
- 若未完成，当前剩余差距：严格补全远端 schema validator、实现云目录枚举/reconcile/ack、受控旧 iCloud 整库迁回、再接入歌单/下载/导入生产写路径。
- 剩余风险：FileManager 无上传完成/CAS/严格原子替换；集合 missing 必须以父目录成功枚举为前提；真实双设备行为尚未验证。

## Resume / Handoff

- 当前状态：Phase 0 安全前置与 Phase 1 基础层完成并通过测试；真实数据权威仍是现有 SQLite。
- 当前卡点：进入生产双写前需实现远端 operation 枚举/reconcile 与受控旧 iCloud 整库迁回。
- 下一步唯一动作：设计并实现只读云 operation 扫描、父目录枚举状态和 ack reconcile，不接生产写路径。
- 下一轮核心目标：用隔离与双设备证据证明 operation 并集、remove/generation 和 unavailable 降级，再批准生产双写。
