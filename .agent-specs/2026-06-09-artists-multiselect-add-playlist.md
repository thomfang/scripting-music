# 多选歌曲添加歌单异常排查 Spec

## Restate / Core Goal
用户测试发现：`page/library/artists.tsx` 艺人页面多选歌曲后添加到歌单，目标歌单（如 q）显示歌曲数增加，但进入歌单看不到这些歌曲。核心目标是排查根因，判断是否是艺人页单点问题或其他多选添加歌单页面也存在同类问题，并给出修复方案。

## Scope
- 重点文件：`page/library/artists.tsx`
- 相关范围：歌曲多选、添加到歌单 action、playlist 写入/展示读取链路，以及其他页面中复用或复制的多选添加歌单逻辑。
- 当前轮先排查并给方案；未获批准前不做代码实现。

## Done Contract
完成条件：给出可由代码证据支撑的根因、影响范围、修复方案与验证方式。
未完成条件：无法定位写入字段差异、无法说明为什么数量增加但列表不可见，或未横向检查其他页面。

## Findings
- 直接根因：艺人详情页 `List selection={selected}` 的行是 `{filtered.map(music => <SongRow ... />)}` 直接渲染，并没有用 `ForEach`/显式 `data.id` 把 List 行身份绑定为 `music.id`。编辑态勾选后，`selected.value` 很可能拿到的是 List 内部行 key/序号/路径，而不是数据库里的 `music.id`。
- 触发链路：`artists.tsx:54-58` 直接把 `selected.value` 当 musicId 调 `database.addMusicToPlaylist(playlistId, id)`。
- 为什么“歌单歌曲数增加但看不到歌曲”：`database.addMusicToPlaylist` 只检查 `playlist_music` 是否已存在该 `(playlist_id, music_id)`，不检查 `music_id` 是否存在于 `music` 表；插入孤儿 `playlist_music` 后还会 `UPDATE playlist SET music_count = music_count + 1`。但歌单详情读取 `getPlaylistMusic` 使用 `INNER JOIN music m ON m.id = pm.music_id`，孤儿关联无法 join 到真实歌曲，所以列表不可见。
- 横向影响：同样使用 `List selection={selected}` + 直接 `{filtered.map(...)}` 的多选页面也有同类风险：`page/library/albums.tsx`、`page/library/favorites.tsx`。`page/library/all_songs.tsx`、`page/library/download.tsx`、`page/library/playlists.tsx` 使用 `ForEach data={...{id}}`，选择值更可能是真实 id；其中 `download.tsx` 还额外过滤 `validIds`。`smart_playlists.tsx` 和 `search/index.tsx` 当前没有多选批量添加入口，不属于该问题。

## Proposed Fix
- UI 层修复：把 `artists.tsx`、`albums.tsx`、`favorites.tsx` 的歌曲列表从直接 `.map` 改为与 `all_songs/download/playlists` 一致的 `ForEach data={filteredItems}`，并用 `{ id: music.id }` 作为行 identity；必要时补充 `filteredItems` observable/useEffect。
- 业务层防御：抽一个局部 helper 或在每个 `addToPlaylist` 中过滤 `ids`：只允许 `musics.some(m => m.id === id)` 的 id 写入；无有效选择时弹窗提示并 return。这样即使 selection 异常也不会污染歌单计数。
- 数据层兜底（推荐一起做）：`database.addMusicToPlaylist` 在插入前校验 `getMusic(musicId)` 或 SQL `EXISTS(SELECT 1 FROM music WHERE id=?)`；不存在则抛错/return，且不能更新 `music_count`。长期可考虑迁移清理孤儿 `playlist_music` 并重算 `playlist.music_count`，但这属于数据修复/迁移，需单独确认。

## Validation Plan
- 静态验证：TypeScript diagnostics 通过。
- 手工验证：在艺人页多选 2 首添加到歌单 q，返回歌单列表确认 q 数量 +2，进入 q 能看到这 2 首；重复在专辑页、我喜欢页验证。
- 数据一致性验证：添加后 `playlist.music_count` 应等于 `getPlaylistMusic(playlistId).length`；无效 selection 不应新增 `playlist_music` 孤儿行。

## Change Log / Handoff
- 2026-06-09：创建最小 spec；已定位根因：多选 selection 行 identity 不是 music.id + 数据层允许孤儿 playlist_music，导致 count 增加但 JOIN 不显示；影响 `artists/albums/favorites`。
- 2026-06-09：已实施修复：
  - `artists.tsx`、`albums.tsx`、`favorites.tsx` 歌曲列表改为 `ForEach data={filteredItems}`，显式使用 `{ id: music.id }` 作为多选行 identity。
  - `artists.tsx`、`albums.tsx`、`favorites.tsx`、`all_songs.tsx`、`playlists.tsx` 的批量添加歌单逻辑增加 `rawIds -> validIds` 过滤，无有效歌曲时提示并中止。
  - `class/database.ts:addMusicToPlaylist` 插入前校验 `music` 表存在目标 `musicId`，不存在则抛 `Music not found`，不插入 `playlist_music`，不增加 `music_count`。
  - 新增 `tests/test_playlist_integrity.ts` 与 `tests/run_playlist_integrity.ts`，覆盖不存在 musicId、正常写入、重复添加不重复计数。
- Validation：
  - 单文件 diagnostics：`artists.tsx`、`albums.tsx`、`favorites.tsx`、`database.ts`、`test_playlist_integrity.ts` 均无 TypeScript diagnostics。
  - 项目 diagnostics：无 TypeScript diagnostics。
  - `scripting-ts run tests/run_playlist_integrity.ts --timeout 60`：3 passed / 0 failed。
  - `scripting-ts run run_tests.ts --timeout 120`：8 suites，60 cases，60 passed / 0 failed。
- Handoff：当前修复可阻止新增孤儿数据；若已有歌单（如 q）已被旧 bug 污染，仍需单独执行孤儿 `playlist_music` 清理与 `playlist.music_count` 重算。
