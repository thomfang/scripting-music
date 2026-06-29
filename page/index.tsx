import {
  Button,
  createContext,
  Navigation,
  NavigationStack,
  Script,
  Tab,
  TabView,
  useContext,
  useObservable,
  VStack,
} from "scripting"
import { LibraryView } from "./library"
import { PlayerView } from "./player"
import { SearchView } from "./search"
import { SettingView } from "./setting"
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
    <MiniPlayer
      contentShape={"rect"}
      onTapGesture={() => isPresented.setValue(true)}
    />
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

function MainView() {
  const isPresented = useContext(MiniPlayerContext)
  // const dismiss = Navigation.useDismiss()
  const selection = useObservable<number>(1)
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
          <LibraryView
            navigationTitle={"资料库"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>

      <Tab title="设置" systemImage="gear" value={3}>
        <NavigationStack>
          <SettingView
            navigationTitle={"设置"}
            toolbar={{
              topBarLeading: [<Button title="退出" systemImage="xmark" action={dismiss} />],
            }}
          />
        </NavigationStack>
      </Tab>

      <Tab title="搜索" systemImage="magnifyingglass" role="search" value={0}>
        <NavigationStack>
          <SearchView
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