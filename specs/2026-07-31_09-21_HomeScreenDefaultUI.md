# Spec: Home Screen Default UI

## Goal
- 为 Scripting Music 增加 Scripting App 官方 Home Tab UI，使用户无需先从 Scripts 列表运行 `index.tsx`，即可在常驻 Home 标签中查看播放器状态并进入资料库、发现、搜索、设置。
- 验收结果：项目根目录存在合法的 `home_screen_default_ui.tsx`；在开启 **Settings → Show Home Tab** 并选择 Scripting Music 后，可稳定加载、播放/暂停、打开完整播放器及进入四个现有功能页。

## Done Contract
- 什么算完成：Home Tab 首次加载有明确初始化态，成功后显示统一 Home Shell；顶部导航栏可在资料库/发现/搜索/设置之间切换，当前页面既有功能可用；底部 MiniPlayer 与完整播放器 sheet 可用；切换 Scripting App 标签后返回，状态保持且不重复初始化/订阅。
- 由什么证明：TypeScript 项目诊断通过；`Preview Home Screen UI` 能渲染成功；人工验证冷启动、切 Tab 返回、播放/暂停、页面导航、错误重试和清除选择。
- 哪些情况仍算未完成：从 `home_screen_default_ui.tsx` 调用 `Navigation.present`/`Script.exit`；直接复用完整 `HomePage` 造成嵌套 TabView；初始化前页面即查 DB 导致假空态；长期驻留产生重复订阅或定时器。

## Scope
- In:
  - 新增根入口 `home_screen_default_ui.tsx`，default-export 函数组件。
  - 新增 Home 专用统一外壳（建议 `page/home_screen/`），顶部 Toolbar 负责主页面导航，中间直接复用现有页面，底部 `safeAreaInset.bottom` 放置 MiniPlayer。
  - 复用 `player`、`downloadManager`、`downloadCenter`、`PlayerStateProvider`、`MiniPlayer`、`PlayerView` 及现有四个页面。
  - 提供初始化、失败、重试、空播放状态和完整播放器 sheet。
- Out:
  - 不替换 `index.tsx` 及现有四 Tab 运行体验。
  - 不重做资料库、发现、搜索、设置页面。
  - 不修改 iOS Home Screen Widget（`widget.tsx` / `widget/*`）。
  - 本轮不重构播放器/下载架构，不引入新的全局 Store。

## Facts / Constraints
- 官方文档定义的是 Scripting App Home 标签能力，不是 Widget：根目录文件必须命名 `home_screen_default_ui.tsx`，必须 default-export 函数组件。
- Home UI 由宿主直接 mount；不得用 `Navigation.present` 展示主视图，也不得调用 `Script.exit()`。
- `Script.env === "home_screen"`；实例在 Home Tab 启用期间常驻，切换标签不会重建，编辑后需手动 Reload。
- Home UI 必须自行决定导航容器；本项目选择 `NavigationStack`，以支持页面 push，并让宿主在右上角注入 Reload / Choose Script / Clear Selection 菜单；无导航栏时仍可长按 Home Tab 图标访问这些操作。
- 当前 `index.tsx` 在展示 UI 前依次初始化 `player`、`downloadManager`、`downloadCenter`；Home UI 必须保持同等初始化顺序。
- `player.init()` 目前只做表面幂等：它在异步初始化成功前就将 `initialized=true`，失败后不会复位，并发调用也不会共享同一 Promise；Home 的错误重试会因此出现“假 ready”。实施时必须改成共享 `initPromise`、成功后置 ready、失败清空状态的可恢复初始化。
- `downloadCenter.init()` 当前无 initialized/Promise guard，重复对账会向 `order` 重复追加；且内部吞掉异常，只写日志。实施时需做并发安全幂等，并明确其失败采用“可降级 ready + 下载恢复警告”，不阻断资料库浏览与播放。
- `Player.dispose()` 当前不会重置 `initialized`，也未显式移除音频中断监听；Home 组件 cleanup 不应直接调用它，实例停止后的资源行为必须以真机验证为准。
- `LibraryView` mount 后立即查询数据库，故不能在初始化完成前直接渲染现有业务页。
- `HomePage` 内含自己的四项 `TabView`、退出/最小化按钮和全局播放器 sheet；直接作为 Home Tab 内容会造成宿主 Tab 内再嵌套 App Tab，且“退出”语义不适用。
- Home UI 是长期驻留页面：组件 effect 的订阅必须返回 cleanup；不应在 render 路径创建 timer/订阅；不应把每秒播放进度提升到整个首页。
- 布局使用有限尺寸；注意 `frame`、`padding`、`background`、`clipShape`、`safeAreaInset` 的 modifier 顺序。

## UX / Information Architecture

### 确认方案：统一 Home Shell，最大化复用现有页面
1. 根：一个 `NavigationStack`，由 Home Shell 持有。
2. 初始化态：居中 `ProgressView` + “正在准备音乐资料库…”。
3. 初始化失败：`ContentUnavailableView` + “重试”按钮；错误文案简化，详细错误写 console。
4. 正常态：
   - 顶部使用 `Toolbar`：`principal` 放四段 segmented Picker 作为唯一 Home section 导航；leading/trailing 留给当前业务页面和宿主上下文动作。
   - 中间内容直接渲染现有 `LibraryView` / `DiscoverView` / `SearchView` / 无导航壳的 `SettingContent`，不再额外复制一套 Dashboard 数据和卡片。
   - 底部统一通过 `safeAreaInset.bottom` 放置现有 `MiniPlayer`，由系统为 List/ScrollView 预留空间，避免遮挡最后一行。
   - 点击 MiniPlayer 打开现有 `PlayerView` sheet；不另建第二套播放状态。

### Toolbar 分工
- `topBarLeading`：不放 Home section 导航，也不显示普通脚本运行环境中的“退出”按钮；保留给业务页面的上下文动作。
- `principal`：固定宽度的自定义 `HomeSectionSwitcher`。iOS 26 在整个 HStack 上应用一个圆角矩形 `glassEffect`，四个内部 Button 都是同尺寸 plain 按钮；旧系统使用相同圆角矩形的普通背景降级。选中态只切换图标前景色，不切换按钮样式或尺寸，避免 segmented Picker 滑块及 intrinsic-size 重排造成晃动。
- `topBarTrailing`：Home Screen 始终显示一个固定的“更多” Menu；第一项进入下载中心（含活跃任务数），第二项为嵌套播放 Menu（播放全部/随机播放）。所有 section 的 trailing 宽度稳定，避免切换时跳动。
- 四个 Home section 不再分散到三个 placement；LibraryView 在 Home 环境关闭自身下载/播放 Toolbar，普通 App 环境保持原样。Home 将两项业务能力统一抽到常驻 trailing Menu，避免 iOS 26 自动组合形态不一致和 section 切换跳动。
- 页面级 Toolbar 需要由 Home Shell 统一编排：资料库现有下载/播放动作继续复用，但应抽成可注入的 toolbar 内容，避免根 Shell、子页面和宿主菜单三层重复占用 `topBarTrailing`。

### 页面切换与状态
- Home Shell 持有 `HomeSection = library | discover | search | settings`。
- 切换 section 时不得向 NavigationStack 不断 push 页面，避免形成“资料库→发现→搜索”的伪历史栈；应切换根内容并在切换前回到该 section 的根层级。
- Home section 页面采用懒加载常驻缓存：首次访问才创建，之后四个页面实例都保留在同一个 ZStack；非当前页面使用 `opacity=0`、`allowsHitTesting=false`、`accessibilityHidden=true`，切换时不再卸载，因此保留滚动位置、搜索输入和页面局部 UI state。
- 缓存页面各自持有实际根视图上的 bottom safeAreaInset；活动页显示真实 MiniPlayer，非活动页使用同高透明占位，避免隐藏页面重复渲染播放器并保持布局几何一致。
- 缓存页面的导航环境 modifier 必须跟随活动状态：SearchView 仅在搜索 section 活动时注入 `searchable`、suggestions 和 search submit；离开时显式关闭 presented 状态并移除相关 modifier，避免透明但仍挂载的搜索页把 Search Bar 泄漏到其他 section。
- `initializeCoreRuntime()` 在核心资源初始化后始终重新激活 `MediaPlayer` commands。Now Playing Center handler 属于当前脚本/Home 宿主上下文的易失注册，不受 `AsyncInitializer` 一次性幂等保护；播放前也会防御性重注册。
- Remote Command 覆盖 play / pause / togglePausePlay / next / previous / 前后 15 秒 seek；分发逻辑抽为纯函数并纳入共用测试套件。

### MiniPlayer
- `safeAreaInset.bottom` 直接挂在 `MainSectionContent` 上；Scripting 会把 view props 应用到函数组件返回的实际根视图，因此最终 inset 落在 Library/Discover/Search/Setting 的根 List/ScrollView，而不是依赖 ZStack 或 NavigationStack 跨容器传播。
- 真机反馈：MiniPlayer 外层 `22pt` 与封面 `6pt` 圆角不构成同心圆。最终采用外层半径 `28pt`、内容等距 inset `8pt`、封面半径 `20pt`（`outerRadius - inset`），占位图/本地封面/远程封面统一使用该半径；普通 App 仍保留原 `6pt` 默认值。
- 真机反馈：将 `safeAreaInset` 放在 NavigationStack 外层 ZStack 或 NavigationStack 自身时，缩减后的 safe area 均未正确传递到内部 List/ScrollView，导致 MiniPlayer 遮挡页面底部。最终按用户审查意见直接把 inset 作为 view prop 挂在 `MainSectionContent`，落到实际业务根视图。
- iOS 26 使用官方 `GlassEffectContainer`（用户口述 GlassContainer）组织 Liquid Glass，MiniPlayer 内容本身应用 `glassEffect={UIGlass.regular().interactive()}`；iOS 26 以下保留普通圆角材质降级。
- Home Screen 最外层容器统一设置 `tint="systemPink"`，通过环境继承覆盖 Toolbar、NavigationLink、表单控件和状态按钮；`safeAreaInset` 可能形成独立环境边界，因此 `HomeMiniPlayerContainer` 也显式设置同一 tint。共享 MiniPlayer 与普通四 Tab App 不受影响。
- Glass 包装抽为独立可复用组件，Home Shell 只负责拼装，不把样式细节继续堆在根页面。
- MiniPlayer 保持当前空态能力；有无歌曲都可占据统一底栏，避免页面切换时底部布局跳变。
- 需验证内部播放/下一首按钮是否会冒泡触发外层“打开 PlayerView”手势；若会，给 MiniPlayer 增加显式 `onOpenPlayer` 与按钮交互边界。

### 视觉原则
- 延续项目的 `systemPink` 强调色与 iOS 原生 `List/Section/NavigationStack` 语言。
- Home UI 以“统一导航壳 + 原页面内容”为主，不重复资料库/发现的数据查询与视觉组件。
- 顶部自定义 Tab Bar 最终尺寸：整体宽 204、内边距 6、按钮间距 6、单按钮 42×36、图标 22、外圆角 22；保持所有 section 下尺寸恒定。

## Architecture

### 文件建议
- `home_screen_default_ui.tsx`
  - 唯一职责：default export Home 根组件。
  - 不运行顶层异步任务，不调用 `Navigation.present` / `Script.exit`。
- `page/home_screen/index.tsx`
  - `HomeScreenRoot`：初始化状态机、单一 `NavigationStack`、section selection、统一 Toolbar、Provider、MiniPlayer safe-area inset 与 Player sheet。
- `page/home_screen/toolbar.tsx`（可选；首版也可合并在 `index.tsx`）
  - 主 section 选择器和按当前页面变化的 leading/trailing actions。
- 不新增 Dashboard 数据层；直接复用现有四个主页面内容。
- 现有文件需要最小拆分：`SettingView` 的导航壳与内容；资料库 Toolbar 动作与页面内容；可能为 `MiniPlayer` 增加明确的 `onOpenPlayer`/样式 props，但不能改变现有 `TabView.tabViewBottomAccessory` 行为。

### 初始化与状态流
```text
HomeScreenDefaultExport mount
  → useEffect once
  → player.init()
  → downloadManager.init()
  → downloadCenter.init()
  → ready
  → mount PlayerStateProvider + Home Shell
  → Toolbar 切换当前 section
  → safeAreaInset.bottom 挂载 MiniPlayer
```
- 初始化采用共享 Promise 和 `idle | initializing | ready | failed` 状态，effect 使用 cancelled 标记，异步返回时先判断组件是否仍存活；连续点击重试不得并发创建初始化链。
- 核心初始化：`player`（含 file/database/audio）失败则阻止进入业务页面并展示错误重试。
- 可降级初始化：`downloadManager` 目前仅日志；`downloadCenter` 对账失败不阻断 ready，但记录 warning，并在下载入口展示恢复异常/单独重试。
- 服务层修正：
  1. `Player.init()` 共享同一 `initPromise`；仅成功后标记 ready，失败清空 Promise/状态。
  2. `DownloadCenter.init()` 共享 Promise、成功幂等；对账先清理/去重恢复快照；暴露成功/失败结果而非静默吞错。

### Provider 与高频状态
- Home 根只挂一个 `PlayerStateProvider`；Provider 在 ready 后挂载，并从 `player` 主动同步已恢复的 current music/queue。
- 各 section 继续读取现有低频 `PlayerStateData`；不在 Home Shell 挂 `PlayerProgressProvider`。
- `PlayerView` 内继续按现状独立挂载进度 Provider，避免每秒刷新整个 Home。
- 下载完整 items 订阅仍仅存在于需要它的资料库/下载页面；Home Shell 本身不新增下载聚合订阅。

### 导航
- Home 根拥有一个 `NavigationStack` 和一份 section selection；Toolbar 切换的是根内容，不连续 push 主 section。
- `LibraryView` / `DiscoverView` / `SearchView` 直接作为当前根内容；`SettingView` 拆为“导航壳 + 导出的无壳 `SettingContent`”，现有 App Tab 保持原行为，Home 使用无壳内容。
- 页面内部已有 `NavigationLink` 继续在 Home 根 NavigationStack 上 push；切换主 section 时必须处理已进入详情页的返回/重置语义。
- Home 环境不注入“退出”按钮。
- `PlayerView` 继续作为 sheet，不作为 Navigation push，保持现有播放页结构和嵌套实体 sheet 行为；无当前歌曲时 MiniPlayer 可显示“未在播放”，但不打开空 PlayerView。

## Alternatives Considered
1. **直接 `return <HomePage />`**：会出现宿主 Home Tab + 内层四 Tab 双层导航及错误退出语义，否决。
2. **独立 Dashboard + 页面入口**：结构清晰，但仍新增一层首页和重复入口，复用率不如统一 Shell；已被用户提出的 Toolbar Shell 方案取代。
3. **统一 Toolbar Shell + 现有页面内容**：复用现有页面、播放器和内部导航最多，推荐并确认。
4. **复制完整资料库聚合卡片到 Home**：重复查询、封面 I/O 和维护逻辑，否决。

## Open Questions
- [x] MiniPlayer 使用统一 Home Shell 的 `safeAreaInset.bottom` 放置。
- [x] 允许本轮同时修正已发现的 `Player.init()`、`DownloadCenter.init()` 等现存问题。
- [ ] `principal` 主导航最终采用四图标紧凑控件还是带文字 Picker？建议先以真机可用宽度 preview 决定。
- [ ] section 切换时搜索输入是否必须保留？建议保留；若需要大范围提取 Search model，再单独评估。
- [ ] Home 标题使用“音乐”还是让 principal 完全承担标题/导航？Toolbar Shell 下建议 principal 承担导航，不再显示重复大标题。

## Restated Understanding
- 我理解当前任务是：基于当前项目和 Scripting 官方文档，为新增 `home_screen_default_ui.tsx` 先形成可评审方案，不立即编码。
- 当前核心目标是：让 Scripting Music 能安全、轻量、长期驻留地运行在 Scripting App 的 Home Tab，同时复用现有播放和页面能力。
- 当前边界是：新增 Home Tab UI，不是重做 App 内四 Tab，也不是修改 iOS Widget。
- 暂不处理：播放器/下载大重构、Widget 改版、首次授权流程。

## Goal Alignment Check
- 当前方案直接服务于官方 Home Screen UI 能力，并通过统一 Toolbar Shell 最大化复用现有四个主页面和播放器结构。
- 用户已确认 MiniPlayer 使用 `safeAreaInset.bottom`，并允许同步修正现存初始化等问题；实现前仅剩 principal 导航样式与 section 状态保留程度需要在 preview 中定稿。

## Implementation Plan
1. 修正 `Player.init()` 与 `DownloadCenter.init()` 的并发安全、失败可恢复幂等。
2. 拆出统一 Home Shell、无导航壳 `SettingContent`，并将资料库 Toolbar 动作改造成可在普通 App 和 Home Shell 中复用的结构。
3. 新增 Home Screen 根入口，接好 section selection、`topBarLeading` / `principal` / `topBarTrailing` Toolbar。
4. 使用 `safeAreaInset.bottom` 接入现有 MiniPlayer，并复用完整 `PlayerView` sheet。
5. 做静态诊断、Home Screen Preview 和真机验证：Toolbar 窄屏布局、宿主菜单合并、section 切换及详情栈、搜索状态、MiniPlayer safe area/键盘/内部按钮手势、冷启动与恢复、Clear Selection/关闭 Show Home Tab/切换脚本后的停止与重新选择、`index.tsx`/App Intent 入口隔离、初始化失败与快速重试；结果回写本 spec。

## Checkpoint Summary
- 当前任务理解：输出 Home Screen Default UI 设计与实施方案。
- 当前核心目标：官方 Home Tab 中提供稳定、轻量且完整可达的音乐入口。
- 当前进度：用户已确认统一 Toolbar Shell 方向、MiniPlayer safe-area inset 与同步修正现存问题；尚未实施。
- 下一步 1：按推荐默认值确定 principal 导航控件并进入实现 checkpoint。
- 下一步 2：获批后按 Implementation Plan 编码和验证。
- 涉及文件 / 模块：新增 `home_screen_default_ui.tsx`、`page/home_screen/*`；修改 `class/player.ts`、`class/download_center.ts`、`page/setting/index.tsx`、`page/library/index.tsx`，可能扩展 `page/components/mini_player.tsx`。
- 风险：长期驻留资源、初始化竞态/失败重入、Toolbar 与宿主/页面 action 冲突、section 切换时导航栈和页面状态、底部 inset 与按钮手势。
- 验证方式：TS diagnostics + Preview Home Screen UI + 真机 Home Tab 生命周期/导航/播放/下载场景矩阵 + 初始化故障注入。
- Execution Approval: `Approved`（2026-07-31，用户明确同意方案并要求开始实施、补齐可覆盖单测及做好版本管理）

## Validation
- Self-check: 已逐项对照官方 `Home Screen UI` 文档；Home 入口只 default-export 组件，不调用 `Navigation.present` / `Script.exit`。Home Shell 复用现有四个主页面、PlayerStateProvider、MiniPlayer、PlayerView 和共享运行时模块。
- Static checks: 整个 `Scripting Music` 项目 TypeScript diagnostics 0 项。
- Runtime / Test: `scripting-ts preview_ui home_screen_default_ui.tsx --screenshot` 成功；完整测试 12 suites / 83 cases 全部通过。顶部统一 Glass Tab Bar、常驻 trailing Menu、页面懒加载缓存、条件 searchable、Now Playing Center commands 及状态保留均已通过 Home Tab 真机测试。
- Human confirmation: 2026-07-31 用户明确批准统一 Toolbar Home Shell、safeAreaInset MiniPlayer、现存问题修复、单测覆盖与 Git 版本管理；真机 Home Tab 的宿主菜单拥挤度与长驻交互仍需用户体验反馈。
- 结果汇总：代码实现、自动化测试、项目诊断和 Preview 均通过；已完成两轮独立对抗性 review，并修复全局 MiniPlayer 壳层、下载重试卸载、未入库下载恢复、存储迁移互斥及 Glass 容器误导性参数等问题。
- 核心目标是否已由证据证明完成：自动化与 Preview 范围内已完成；Home Tab 停止实例及不同字号/窄屏 Toolbar 仍需真机人工确认。
- 若未完成，当前剩余差距：开启 Settings → Show Home Tab，选择 Scripting Music，验证宿主菜单、主区域切换、详情页全局 MiniPlayer、键盘和 Clear Selection 生命周期。
- 剩余风险：`principal` + 资料库业务 actions + 宿主菜单在极窄屏/超大字体下可能折叠；SQLite API 无显式 close，数据库失败回滚只能丢弃半初始化句柄。

## Change Log
- 2026-07-31: 用户确认改用统一 Toolbar Home Shell，顶部使用 `topBarLeading` / `principal` / `topBarTrailing`，底部使用 `safeAreaInset.bottom` MiniPlayer，并允许同步修正现存问题。
- 2026-07-31: 完成实现。新增官方 Home 入口和共享主页面内容工厂；普通 App/Home/App Intent 共用运行时初始化；Player/DownloadCenter 初始化并发安全且失败可重试；全局 MiniPlayer/sheet 覆盖整个导航栈；未入库下载通过完整快照跨会话恢复；存储迁移增加互斥与活动下载保护；新增 14 个相关测试断言。
- 2026-07-31: 真机反馈 Home MiniPlayer 贴近屏幕与 Tab Bar，新增悬浮间距要求，并改用 iOS 26 `GlassEffectContainer` + `glassEffect` 统一 Liquid Glass 视觉；旧系统保留降级容器。
- 2026-07-31: 真机反馈 Home Screen 仍使用系统默认 accent color；在 Home 根容器统一设置 `tint="systemPink"`，加载/错误态根容器同步设置，子页面通过环境继承。
- 2026-07-31: 真机反馈 safeAreaInset MiniPlayer 仍可能未继承根 tint；在 `HomeMiniPlayerContainer` 外层显式补 `tint="systemPink"`，不修改共享 MiniPlayer。
- 2026-07-31: 真机发现 MiniPlayer 圆角不够且封面不满足 Apple 同心圆关系；改为外 28 / inset 8 / 封面 20。safeAreaInset 先后挂在 ZStack/NavigationStack 都仍遮挡，最终移除冗余 ZStack/VStack，并直接挂在 `MainSectionContent` 返回的实际页面根视图。
- 2026-07-31: 真机截图发现 Home section 按钮分散在 leading/principal/trailing 后，与资料库业务 actions 被 iOS 26 自动组成圆形、无背景、胶囊等不统一形态。曾尝试 principal segmented Picker，后因切换动画改为固定尺寸自定义按钮组。
- 2026-07-31: 真机进一步发现 Library 独有下载/播放 actions 导致 section 切换时 Toolbar 宽度跳动。Home 环境关闭 Library 局部 Toolbar，并在 topBarTrailing 常驻一个 Menu，统一提供下载中心与嵌套播放操作；普通 App 保留原 Toolbar。真机测试通过。
- 2026-07-31: segmented Picker 真机切换时出现 Toolbar 动画晃动，推断来自系统选中滑块动画与 section 导致的 principal 重排；因此改为固定尺寸自定义按钮组。
- 2026-07-31: 用户修正视觉要求：不是四个独立 glass Button，也不使用 GlassEffectContainer；改为整个固定尺寸 HStack 共用一个圆角矩形背景与 glassEffect，内部四个按钮使用 plain。
- 2026-07-31: 用户发现自定义顶部导航切换时页面会销毁重建。新增 visitedSections 懒加载集合与 CachedMainSectionContent，访问过的四个页面保持挂载，仅切换可见性/交互；新增访问去重单测。顶部 Tab Bar 同步放大至 204pt，并增加按钮尺寸与间距。真机测试通过。
- 2026-07-31: 真机发现搜索页缓存后，切到其他 section 仍残留 Search Bar。根因是 `opacity=0` 不会注销 searchable 的 NavigationStack 环境配置；SearchView 新增 searchableEnabled/presented 控制，非活动时移除 searchable、suggestions、submit 并显式 dismiss，同时保留页面状态。真机复测通过。
- 2026-07-31: 真机发现 Home Screen 播放时 Now Playing Center command 不可用。根因是 command 注册被放入 Player 的一次性 AsyncInitializer；宿主上下文重建后 `player.init()` 因 ready 直接返回，不会恢复易失 handler。现从一次性初始化解耦，initializeCoreRuntime 和 play 都幂等重注册，并补齐此前声明但未处理的 togglePausePlay。真机复测通过。

## Resume / Handoff
- 当前状态：Glass MiniPlayer 样式迭代、自动验证和截图预览完成，待 Home Tab 真机最终间距确认。
- 当前卡点：自动化无阻断；旧于 iOS 26 的模块 availability 以及宿主 Tab Bar 实际间距仍需对应系统真机证明。
- 下一步唯一动作：在 Home Tab Reload 后确认左右 12pt、底部 10pt 与 Glass 视觉；如间距不合适仅调整容器常量。
- 下一轮核心目标：依据真机视觉反馈定稿 Glass MiniPlayer 间距并提交发布。
