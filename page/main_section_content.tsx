import { LibraryView } from "./library"
import { DiscoverView } from "./discover"
import { SearchView } from "./search"
import { SettingContent } from "./setting"
import { HomeSection } from "./home_screen_model"

/**
 * 四个主区域的共享内容工厂。
 * Home Screen 与其他需要无 Tab 壳复用主页面的入口统一从这里取内容。
 */
export function MainSectionContent({ section }: { section: HomeSection }) {
  switch (section) {
    case "library": return <LibraryView />
    case "discover": return <DiscoverView />
    case "search": return <SearchView />
    case "settings": return <SettingContent />
  }
}
