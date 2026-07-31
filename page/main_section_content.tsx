import { ZStack } from "scripting"
import { LibraryView } from "./library"
import { DiscoverView } from "./discover"
import { SearchView } from "./search"
import { SettingContent } from "./setting"
import { HomeSection } from "./home_screen_model"

const ALL_HOME_SECTIONS: HomeSection[] = ["library", "discover", "search", "settings"]

function CachedSection({
  section,
  active,
  activeTopInset,
  activeBottomInset,
  inactiveBottomInset,
  showsLibraryToolbarActions,
}: {
  section: HomeSection
  active: boolean
  activeTopInset?: JSX.Element
  activeBottomInset: JSX.Element
  inactiveBottomInset: JSX.Element
  showsLibraryToolbarActions: boolean
}) {
  const safeAreaInset = {
    ...(activeTopInset ? { top: { spacing: 0, content: activeTopInset } } : {}),
    bottom: {
      spacing: 0,
      content: active ? activeBottomInset : inactiveBottomInset,
    },
  }
  const commonProps = {
    opacity: active ? 1 : 0,
    allowsHitTesting: active,
    accessibilityHidden: !active,
    safeAreaInset,
  }

  switch (section) {
    case "library": return <LibraryView {...commonProps} showsToolbarActions={showsLibraryToolbarActions} />
    case "discover": return <DiscoverView {...commonProps} />
    case "search": return <SearchView {...commonProps} />
    case "settings": return <SettingContent {...commonProps} />
  }
}

/**
 * 四个主区域的懒加载常驻容器。
 * 首次访问后保持组件实例，切换时只改变可见性和交互，从而保留滚动位置与页面局部状态。
 */
export function CachedMainSectionContent({
  section,
  visited,
  activeTopInset,
  activeBottomInset,
  inactiveBottomInset,
  showsLibraryToolbarActions = true,
}: {
  section: HomeSection
  visited: HomeSection[]
  activeTopInset?: JSX.Element
  activeBottomInset: JSX.Element
  inactiveBottomInset: JSX.Element
  showsLibraryToolbarActions?: boolean
}) {
  return (
    <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
      {ALL_HOME_SECTIONS.map(candidate => visited.includes(candidate) && (
        <CachedSection
          key={candidate}
          section={candidate}
          active={candidate === section}
          activeTopInset={candidate === section ? activeTopInset : undefined}
          activeBottomInset={activeBottomInset}
          inactiveBottomInset={inactiveBottomInset}
          showsLibraryToolbarActions={showsLibraryToolbarActions}
        />
      ))}
    </ZStack>
  )
}

/** 普通 App 等无需缓存的入口继续使用单页面工厂。 */
export function MainSectionContent({
  section,
  showsLibraryToolbarActions = true,
}: {
  section: HomeSection
  showsLibraryToolbarActions?: boolean
}) {
  switch (section) {
    case "library": return <LibraryView showsToolbarActions={showsLibraryToolbarActions} />
    case "discover": return <DiscoverView />
    case "search": return <SearchView />
    case "settings": return <SettingContent />
  }
}
