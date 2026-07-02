# Spec — 资料库首页导航竞态修复（方案 A：声明式 NavigationLink）

- 状态：进行中
- 时间：2026-06-30 22:55 Asia/Shanghai

## Bug 现象
资料库首页「专辑」横向卡片墙：第一次点专辑 A 进详情正常；返回后点专辑 B，详情仍是 A。艺人卡、播放列表卡、顶部快捷宫格同理（同一机制）。从「专辑/艺人」全部列表页（AlbumsView/ArtistsView，标准 NavigationLink）进去则正常。

## 根因
`page/library/index.tsx` 的 `LibraryView` 用**编程式单一 destination**导航：
```
const navPresented = useObservable(false)          // 同步
const [navTarget, setNavTarget] = useState(null)   // 异步
const pushDetail = (el) => { setNavTarget(el); navPresented.setValue(true) }
navigationDestination={navTarget!=null ? { isPresented: navPresented, content: navTarget } : undefined}
```
竞态：`setNavTarget`（useState 异步，下一帧才生效）后立即 `navPresented.setValue(true)`（useObservable 同步触发 push）。第二次点击时 push 发生瞬间 `navTarget` 仍是上一次的值 → 永远晚一拍 / 显示上一个。第一次正确仅因初值 `null` 的 gating 恰好对齐。

注释里说改编程式是「为避免 LazyVGrid 多 NavigationLink 命中区串扰」，但副作用是引入此竞态。

## 方案 A
回到**声明式 NavigationLink**：每个卡片自带独立 destination（与已验证正常的 AlbumsView/ArtistsView 全列表一致）。横向 ScrollView 卡片墙、顶部 LazyVGrid 宫格都直接用 NavigationLink 包裹。每个 destination 独立，无共享 state，无竞态。

### 改动点
1. `page/library/components.tsx`
   - `QuickEntryCard`/`QuickEntryGrid`：去掉 `onSelect`，改 `QuickEntry.destination` 直接用 `NavigationLink destination={entry.destination}` 包裹卡片内容。
   - `ArtistCircleCard`/`AlbumCoverCard`/`PlaylistCollageCard`：把 `onTap: () => void` 改为 `destination: JSX.Element`，内部 `Button action={onTap}` 换成 `NavigationLink destination={destination}`（保留 `buttonStyle="plain"` 等价的链接外观）。
2. `page/library/index.tsx`
   - 删除 `navPresented`/`navTarget`/`setNavTarget`/`pushDetail`/`onSelectEntry` 与 List 上的 `navigationDestination`。
   - 卡片墙改传 `destination={<ArtistDetail .../>}` 等；`QuickEntryGrid` 去掉 `onSelect`。

### 注意
- LazyVGrid（顶部快捷宫格）内放 NavigationLink：当初担心「命中区串扰」。横向卡片墙不是 LazyVGrid，无虞。宫格用 NavigationLink 需 preview 验证点击命中正确、不串扰。若宫格确有串扰，宫格保留 Button+各自独立 navigationDestination（每项一个 observable）或单独处理；卡片墙一定用 NavigationLink。
- NavigationLink 包裹时外观：用 `buttonStyle`/label 包裹，避免出现系统蓝色链接箭头/变色。参考 AlbumsView 现有 NavigationLink 包 RowContent 的写法（无额外箭头）。

## 验收
- `preview_ui` 整链编译通过；横向卡片墙 + 宫格渲染正常。
- 真机：首页专辑卡连续点 A→返回→B，详情正确切换；艺人卡、播放列表卡、快捷宫格同样正确。

## 风险
- 宫格内 NavigationLink 命中串扰（需 preview/真机确认）。
- 卡片外观可能因 NavigationLink 默认样式变化（链接色/箭头）——需保持 plain。

## Change Log
- 2026-06-30 实现完成：
  - `components.tsx`：`QuickEntryCard`/`QuickEntryGrid` 去 `onSelect`，改 `NavigationLink destination={entry.destination}`；`ArtistCircleCard`/`AlbumCoverCard`/`PlaylistCollageCard` 的 `onTap` 参改为 `destination: JSX.Element`，`Button` 换 `NavigationLink`。（`RecentlyAddedCard`/`FavoriteSongRow` 的 `onTap` 是播放动作，保留。）
  - `index.tsx`：删除 `navPresented`/`navTarget`/`pushDetail`/`onSelectEntry` 与 List 的 `navigationDestination`；卡片墙/宫格改传 `destination`；移除未用 `useObservable` import。
  - 验证：`preview_ui` 整链编译通过、无运行时报错。
- 状态：已实现，待真机验收（专辑卡 A→返回→B 正确切换；艺人/播放列表卡/宫格同样正确；点击命中不串扰）。
- 根因修正：原诊断“单一 destination content 被缓存”不准确；真正原因是 `setNavTarget`(useState 异步) + `navPresented.setValue`(useObservable 同步) 的时序竞态——push 发生时 navTarget 还是上一值。声明式 NavigationLink 每项独立 destination，无共享 state，彻底避开。
- 2026-06-30 补修（真机反馈）：顶部快捷宫格是 **LazyVGrid**，内嵌 NavigationLink 会命中区串扰（点一个触发全部）——这正是原注释警告的场景。故 `QuickEntryCard` 回退为 **Button + 每卡独立 `navigationDestination`/`useObservable`**（destination 固定、无共享 state、无竞态、不串扰）。横向卡片墙（非 LazyVGrid）保留 NavigationLink 不变。
  - **通用结论**：LazyVGrid 内用 Button+每项独立 navigationDestination；普通横向/竖向列表用声明式 NavigationLink。两者都避免共享单一 navTarget 的竞态。
