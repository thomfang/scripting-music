# List 编辑多选卡顿排查 Spec

## Restate / Core Goal
用户反馈：各歌曲列表页点击“编辑”并选中歌曲时页面明显卡顿。用户参考 SwiftUI 相关文章，怀疑 List item 中使用 `id` / `key` 包裹会导致性能问题。核心目标是排查 Scripting Music 中歌曲列表编辑态卡顿的真实原因，识别影响范围，并给出修复方案。

## Scope
- 重点页面：所有歌曲、已下载、我喜欢、歌单详情、艺人详情、专辑详情等使用 `List selection` 的歌曲列表。
- 重点组件：`SongRow`、`List`/`Section`/`ForEach` 渲染方式、`key`/identity、`selection` observable 更新。
- 当前轮先排查并给方案；未获批准前不做实现。

## Done Contract
完成条件：给出代码证据支撑的卡顿根因、受影响页面、修复方案和验证方式。
未完成条件：无法区分 `key/id` 问题与其他重渲染/状态订阅问题，或未覆盖各歌曲列表页。

## Findings
- 当前所有可多选歌曲列表都在 `List selection={selected}` 里使用 `ForEach data={filteredItems}`，并在 `ForEach.builder` 返回的 `SongRow` 上再写 `key={music.id}`：`all_songs.tsx`、`download.tsx`、`favorites.tsx`、`playlists.tsx`、`artists.tsx`、`albums.tsx`。
- 这和用户提到的 SwiftUI 性能经验高度吻合：`ForEach.data` 本身已经有稳定 `id`，再给 List 行内容加一层显式 key/id，等价于在 SwiftUI `List` 行里叠加额外 identity，可能破坏 List 的复用/差量更新，使选择态变化时大量行重新 reconcile / remount。
- Scripting 本地 `EditableGlassListPipeline` 的实现提供了更接近推荐的形态：`ForEach data={itemsObservable}` 负责数据 identity；行内容不额外包壳，也不在行内容上手写 `key`，而是把 `tag: item.id` 合并到真实行节点 props，供 `List.selection` 使用（见 `EditableGlassListStore.renderRow`）。
- 当前代码还有一个独立性能热点：每次选中/取消选中都会更新 `selected.value`，组件会重新渲染；每个 `ForEach.builder` 里都执行 `filtered.find(m => m.id === item.id)`。如果列表有 N 首歌，重渲染时是 N 次线性查找，即 O(N²)。歌曲多时，这比单个 key 问题更容易造成“点一下勾选就卡”。
- 每次渲染还会为每行重建多组闭包、swipe action 数组、并在每个 `SongRow` 内调用 `usePlayerState()`。这些是次要放大因素；编辑态下 SongRow 隐藏 menu/swipe/tap，但组件仍然构建了默认 swipe action 数组。
- 因此根因不是单一的“用了 key”，而是：`selection` 变化触发整页重渲染 + 行级额外 identity 可能导致 List 复用变差 + builder 内 O(N²) 查找共同叠加。

## Findings - Round 2: 选中/未选中视觉态慢
- 用户实测：第一阶段后“切换选中页面不会卡顿”，说明整页 JS/TSX 重渲染和 O(N²) 查找已明显缓解；剩余问题集中在单个 `SongRow` 的 SwiftUI 选中/未选中视觉态更新慢。
- 当前 `SongRow` 根节点是一个较重的自定义 `HStack`：封面 `Image(filePath/imageUrl/systemName)`、标题/副标题 `VStack`、下载状态、播放指示、菜单、swipe actions，并且根节点承担 `tag={itemId}`。即使编辑态隐藏了菜单/状态徽标，函数仍会先构造 default swipe action 数组和 tap 闭包。
- `SongRow` 内部每行都调用 `usePlayerState()`；虽然选中态变化不是播放状态变化，但上下文读取会让每个行组件参与更复杂的 reconcile。多选编辑态其实不需要播放高亮、下载徽标、menu、swipe、tap，可使用更轻的编辑态行。
- 多个列表页父组件也存在未使用的 `const state = usePlayerState()`（例如所有歌曲/已下载/我喜欢/艺人/专辑/歌单详情），这会让父页订阅播放状态但没有收益，可清理。
- 如果 Scripting TSX -> SwiftUI 桥接层对 `List(selection:)` 的 checkmark 动画/selection diff 本身较慢，应用侧无法完全消除，但可以通过“编辑态最小化行树”和“减少行内订阅/闭包/动作 props”降低桥接和 SwiftUI diff 的输入复杂度。

## Proposed Fix
- 修复方向 1（优先，已完成）：移除 `ForEach.builder` 返回的 `SongRow key={music.id}` / fallback `Text key={item.id}`；`SongRow` 对外新增 `itemId?: string`（不用 `tag` 作为业务 prop 名，避免和 SwiftUI/Scripting 的 `tag` 语义混淆）。组件内部如需给 `List.selection` 提供选择值，可由 `SongRow` 根节点统一透传 `tag={itemId}`；调用方只传 `itemId={music.id}`，不再传 `key`。
- 修复方向 2（已完成）：消除 `filtered.find` O(N²)。每个页面用 `useMemo` 构造 `musicById = new Map(filtered.map(m => [m.id, m]))`，builder 中 `musicById.get(item.id)` O(1) 获取歌曲。
- 修复方向 3（已完成）：把 `selected.value.includes` 的重复线性查找改为 `selectedSet`：`const selectedSet = useMemo(() => new Set(selected.value), [selected.value])`，`isAllSelected = allIds.every(id => selectedSet.has(id))`，批量删除也用 Set。
- 修复方向 4（本轮候选，低风险）：优化 `SongRow` 编辑态分支。进入编辑态时尽早返回轻量行，只保留 `tag/itemId`、封面、标题、副标题/必要 trailingMeta；不构造 menu、swipe actions、tap 闭包、播放指示、下载状态，也不调用 `usePlayerState()`。非编辑态保持原样。
- 修复方向 5（本轮候选，低风险）：清理各歌曲列表父组件中未使用的 `usePlayerState()` import/调用，减少无效订阅。
- 修复方向 6（备选，中风险）：把播放态从 `SongRow` 内部订阅改成父组件传 `currentMusicId` / `isPlayingId`，但这会改所有 SongRow 调用点，范围更大；本轮不优先。
- 修复方向 7（备选，高风险/需 Scripting 层支持）：如果轻量编辑态行仍慢，可能是 Scripting TSX -> SwiftUI 桥接或 SwiftUI `List(selection:)` checkmark 动画本身瓶颈；应用侧可尝试自绘选择态而不使用 `List.selection`，但会影响系统编辑态、多选交互、无障碍和批量选择语义，暂不建议作为第一选择。
- 影响页面：必须改 `all_songs.tsx`、`download.tsx`、`favorites.tsx`、`playlists.tsx`、`artists.tsx`、`albums.tsx`；可选顺手改无多选但也在 List 中写 `key={music.id}` 的 `smart_playlists.tsx`、`search/index.tsx`，避免未来同类问题。

## Validation Plan
- 静态验证：相关 TSX 文件 TypeScript diagnostics 通过。
- 行为验证：进入所有歌曲/已下载/我喜欢/歌单详情/艺人详情/专辑详情，编辑后单选、多选、全选、反选、添加到歌单、批量删除/移除仍正常。
- 性能验证：用包含较多歌曲的列表，在编辑态连续勾选 5-10 首，观察卡顿是否明显下降；重点对比所有歌曲页和艺人/专辑详情页。

## Change Log / Handoff
- 2026-06-10：创建 spec；已完成排查。结论：卡顿由 `selection` 变化触发整页重渲染、List 行内容额外 `key`/identity 影响复用、以及 `ForEach.builder` 内 `filtered.find` 导致 O(N²) 查找叠加造成。用户补充：外部 prop 不使用 `tag` 命名，改用 `itemId` 之类，避免和 SwiftUI/Scripting 特殊语义混淆。已创建 git checkpoint `436ca6ce7e4c17945d4f3470207b6003f27c2523`。
- 2026-06-10：已实施第一阶段修复：
  - `SongRow` 新增外部 prop `itemId?: string`，内部统一映射到根 `HStack tag={itemId}`，调用方不直接使用 `tag`。
  - 多选歌曲页 `all_songs/download/favorites/artists/albums/playlists`：移除 `SongRow key={music.id}` 和 fallback `Text key={item.id}`；使用 `itemId={music.id}`。
  - 多选歌曲页：使用 `musicById: Map` 替代 `filtered.find`，降低 selection 重渲染时的行查找成本。
  - 多选歌曲页：使用 `selectedSet: Set` 替代重复 `selected.value.includes`，优化全选判断与批量删除过滤。
  - 非多选但歌曲行同类 key 用法：`smart_playlists.tsx`、`search/index.tsx` 的 `SongRow key` 改为 `itemId`。
- Validation：
  - 单文件 diagnostics：`song_row.tsx`、6 个多选歌曲页、`smart_playlists.tsx`、`search/index.tsx` 均无 TypeScript diagnostics。
  - 项目 diagnostics：无 TypeScript diagnostics。
  - `scripting-ts run run_tests.ts --timeout 120`：8 suites，60 cases，60 passed / 0 failed。
- Handoff：当前已提交前 checkpoint，待提交本次修复 commit。若用户仍感到编辑态卡顿，下一阶段建议优化 `SongRow` 内部每行 `usePlayerState()` 订阅和编辑态 swipe action 构造。
- 2026-06-10 Round 2：用户实测第一阶段后页面切换选中不再卡顿，但 `SongRow` 选中/未选中视觉态渲染仍慢。已补充候选方案：优先做 `SongRow` 编辑态轻量渲染分支 + 清理父列表无效 `usePlayerState()` 订阅；若仍慢，再考虑自绘 selection 或反馈/调整 Scripting SwiftUI 桥接层。当前轮未执行代码改动，等待批准。
- 2026-06-10 Round 2 执行后已撤销：用户反馈编辑态轻量行版本体感反而更卡，随后恢复到 checkpoint `4afd5666d3c5f594eea7834824a6d3fbd2882734`；恢复后用户反馈效果与撤销前差不多。结论：`SongRow` 行树重量/行内 `usePlayerState()` 不是剩余选中视觉态慢的主要瓶颈；更可能是 Scripting TSX -> SwiftUI 桥接或 SwiftUI `List(selection:)` 原生 selection/checkmark 更新路径。
- 下一轮候选应改为实验性验证，而不是继续微调 `SongRow`：优先在单个页面做 A/B 开关或分支，比较 native `List selection` 与自绘选择态；避免一次性改全页面。
- 2026-06-10 图片路径补充排查：用户自测 `List selection` + 纯 `Text` 不卡，说明原生 selection 本身不是瓶颈。`SongRow` 的封面路径为 `Image filePath={fileManager.getCoverPath(music.id)}` 或远程 fallback `Image imageUrl={music.cover_url}`，渲染目标只有 48x48，但当前 covers 目录样本中有 208 张 jpg，平均约 158KB，最大约 1.1MB，多张为 800x800 原图。Scripting `Image(filePath)` API 只暴露本地路径加载，没有缓存/预解码/缩略图参数；`UIImage` API 支持 `fromData/fromFile`、`preparingThumbnail(size)`、`toJPEGData`。下一步更合理的验证是：单页 A/B 隐藏封面或使用预生成 96/128px thumbnail，而不是继续改 selection。
- 2026-06-10 图片实验执行：已创建 checkpoint `530d491d99e4eed669ddff7620db82a4a24eb0ee`（`checkpoint: before cover rendering experiment`）。新增 `SongRowProps.usePlaceholderCover?: boolean`，开启时跳过 `Image(filePath)` / `Image(imageUrl)`，强制走 system placeholder；仅在 `all_songs.tsx` 的编辑态传 `usePlaceholderCover={isEditing}`，其他页面不变。验证：`song_row.tsx`、`all_songs.tsx`、项目整体 TypeScript diagnostics 均无错误。用户实测：所有歌曲页编辑态禁用真实封面后仍然一样卡，结论：封面 `Image(filePath/imageUrl)` 不是剩余选中视觉态慢的主因。下一步应撤销该实验，并改做行结构矩阵实验：Text-only / HStack+Text / HStack+systemImage+Text / SongRow，定位是否为自定义 HStack 行树、row actions/tag、或页面 selection 重渲染导致。
