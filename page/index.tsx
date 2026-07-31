import {
  Button,
  createContext,
  Navigation,
  NavigationStack,
  Script,
  Tab,
  TabView,
  useContext,
  useEffect,
  useObservable,
  VStack,
} from "scripting"
import { PlayerView } from "./player"
import { MainSectionContent } from "./main_section_content"
import { PlayerStateProvider } from "../class/player_state"
import { MiniPlayer } from "./components/mini_player"


const MiniPlayerContext = createContext<Observable<boolean>>()

function MiniPlayerProvider({ children }: { children: JSX.Element }) {
  const isPresented = useObservable<boolean>(false)
  return <MiniPlayerContext.Provider value={isPresented}>{children}</MiniPlayerContext.Provider>
}

function MiniPlayerAccessory() {
  const isPresented = useContext(MiniPlayerContext)
  return (
    <MiniPlayer onOpenPlayer={() => isPresented.setValue(true)} />
  )
}

export function HomePage() {
  return (
    <PlayerStateProvider>
      <MiniPlayerProvider>
        <MainView />
      </MiniPlayerProvider>
    </PlayerStateProvider>
  )
}

const HOME_TAB_KEY = "home_selected_tab"
const VALID_TABS = [0, 1, 2, 3]

function MainView() {
  const isPresented = useContext(MiniPlayerContext)
  // const dismiss = Navigation.useDismiss()
  const selection = useObservable<number>(() => {
    const saved = Storage.get<number>(HOME_TAB_KEY)
    return (saved !== null && VALID_TABS.includes(saved)) ? saved : 1
  })
  // 持久化上次停留的 Tab，下次启动恢复
  useEffect(() => {
    const cb = (v: number) => Storage.set(HOME_TAB_KEY, v)
    selection.subscribe(cb)
    return () => selection.unsubscribe(cb)
  }, [])
  const dismiss = () => {
    Script.minimize()
  }
  return (
    <TabView
      selection={selection}
      tint={"systemPink"}
      tabViewStyle={"sidebarAdaptable"}
      tabBarMinimizeBehavior={"onScrollDown"}
      tabViewBottomAccessory={<MiniPlayerAccessory />}
      sheet={{
        isPresented: isPresented,
        content: <PlayerView />
      }}>
      <Tab title="资料库" systemImage="music.note.square.stack" value={1}>
        <NavigationStack>
          <MainSectionContent
            section="library"
            navigationTitle={"资料库"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>

      <Tab title="发现" systemImage="sparkles" value={2}>
        <NavigationStack>
          <MainSectionContent
            section="discover"
            navigationTitle={"发现"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>

      <Tab title="设置" systemImage="gear" value={3}>
        <NavigationStack>
          <MainSectionContent
            section="settings"
            navigationTitle={"设置"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>

      <Tab title="搜索" systemImage="magnifyingglass" role="search" value={0}>
        <NavigationStack>
          <MainSectionContent
            section="search"
            navigationTitle={"搜索"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>
    </TabView>
  )
}