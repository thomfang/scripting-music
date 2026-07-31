import {
  Button,
  ContentUnavailableView,
  HStack,
  Image,
  NavigationStack,
  ProgressView,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  useEffect,
  useObservable,
  useState,
  VStack,
} from "scripting"
import { PlayerStateProvider, usePlayerState } from "../../class/player_state"
import { initializeCoreRuntime, initializeDownloadRuntime } from "../../class/app_runtime"
import { PlayerView } from "../player"
import { CachedMainSectionContent } from "../main_section_content"
import { HomeLibraryActionsMenu } from "../library/toolbar_actions"
import { HomeSectionSwitcher } from "./section_switcher"
import { HomeMiniPlayerContainer, HOME_MINI_PLAYER_RESERVED_HEIGHT } from "./mini_player_container"
import {
  HomeSection,
  HOME_SECTION_KEY,
  homeSectionTitle,
  markHomeSectionVisited,
  normalizeHomeSection,
} from "../home_screen_model"

type InitState = "loading" | "ready" | "error"

export function HomeScreenRoot() {
  const [initState, setInitState] = useState<InitState>("loading")
  const [errorMessage, setErrorMessage] = useState("")
  const [downloadWarning, setDownloadWarning] = useState(false)
  const [coreRetryVersion, setCoreRetryVersion] = useState(0)
  const [downloadRetryVersion, setDownloadRetryVersion] = useState(0)
  const [downloadRetrying, setDownloadRetrying] = useState(false)

  useEffect(() => {
    let cancelled = false
    setInitState("loading")
    setErrorMessage("")

    ;(async () => {
      try {
        await initializeCoreRuntime()
        if (!cancelled) setInitState("ready")
      } catch (error) {
        console.error("[Home Screen] 初始化失败:", error)
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : String(error))
          setInitState("error")
        }
      }
    })()

    return () => { cancelled = true }
  }, [coreRetryVersion])

  useEffect(() => {
    if (initState !== "ready") return
    let cancelled = false
    setDownloadRetrying(true)
    ;(async () => {
      try {
        await initializeDownloadRuntime()
        if (!cancelled) setDownloadWarning(false)
      } catch (error) {
        console.error("[Home Screen] 下载中心恢复失败:", error)
        if (!cancelled) setDownloadWarning(true)
      } finally {
        if (!cancelled) setDownloadRetrying(false)
      }
    })()
    return () => { cancelled = true }
  }, [initState, downloadRetryVersion])

  if (initState === "loading") {
    return (
      <NavigationStack>
        <VStack
          spacing={12}
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
          navigationTitle="音乐"
          navigationBarTitleDisplayMode="inline"
          tint="systemPink"
        >
          <ProgressView />
          <Text foregroundStyle="secondaryLabel">正在准备音乐资料库…</Text>
        </VStack>
      </NavigationStack>
    )
  }

  if (initState === "error") {
    return (
      <NavigationStack>
        <VStack
          spacing={16}
          frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}
          navigationTitle="音乐"
          navigationBarTitleDisplayMode="inline"
          tint="systemPink"
        >
          <ContentUnavailableView
            title="音乐资料库无法载入"
            systemImage="exclamationmark.triangle"
            description={errorMessage || "请稍后重试"}
          />
          <Button title="重试" systemImage="arrow.clockwise" action={() => setCoreRetryVersion(v => v + 1)} />
        </VStack>
      </NavigationStack>
    )
  }

  return (
    <PlayerStateProvider>
      <HomeShell
        downloadWarning={downloadWarning}
        downloadRetrying={downloadRetrying}
        onRetryDownloads={() => setDownloadRetryVersion(v => v + 1)}
      />
    </PlayerStateProvider>
  )
}

function HomeShell({
  downloadWarning,
  downloadRetrying,
  onRetryDownloads,
}: {
  downloadWarning: boolean
  downloadRetrying: boolean
  onRetryDownloads: () => void
}) {
  const [section, setSection] = useState<HomeSection>(() =>
    normalizeHomeSection(Storage.get<string>(HOME_SECTION_KEY))
  )
  const [visitedSections, setVisitedSections] = useState<HomeSection[]>(() => [section])
  const [showPlayer, setShowPlayer] = useState(false)
  const navigationPath = useObservable<string[]>([])
  const { currentMusic } = usePlayerState()

  function selectSection(next: HomeSection) {
    if (next === section) return
    navigationPath.setValue([])
    setVisitedSections(visited => markHomeSectionVisited(visited, next))
    setSection(next)
    Storage.set(HOME_SECTION_KEY, next)
  }

  function openPlayer() {
    if (currentMusic) setShowPlayer(true)
  }

  const toolbar = (
    <Toolbar>
      <ToolbarItem placement="principal">
        <HomeSectionSwitcher current={section} onSelect={selectSection} />
      </ToolbarItem>
      <ToolbarItem placement="topBarTrailing">
        <HomeLibraryActionsMenu />
      </ToolbarItem>
    </Toolbar>
  )

  const downloadWarningBar = (
    <HStack spacing={8} padding={{ horizontal: 12, vertical: 8 }} background="secondarySystemBackground">
      <Image systemName="exclamationmark.arrow.triangle.2.circlepath" foregroundStyle="systemOrange" />
      <Text font="caption" foregroundStyle="secondaryLabel">
        {downloadRetrying ? "正在重试下载任务恢复…" : "下载任务恢复失败"}
      </Text>
      <Spacer />
      <Button title="重试" action={onRetryDownloads} buttonStyle="plain" disabled={downloadRetrying} />
    </HStack>
  )

  return (
    <NavigationStack
      path={navigationPath}
      tint="systemPink"
      sheet={{
        isPresented: showPlayer,
        onChanged: (value: boolean) => setShowPlayer(value),
        content: currentMusic ? <PlayerView /> : <VStack />
      }}
    >
      <CachedMainSectionContent
        section={section}
        visited={visitedSections}
        showsLibraryToolbarActions={false}
        activeTopInset={downloadWarning ? downloadWarningBar : undefined}
        activeBottomInset={<HomeMiniPlayerContainer onOpenPlayer={openPlayer} />}
        inactiveBottomInset={<VStack frame={{ height: HOME_MINI_PLAYER_RESERVED_HEIGHT }} />}
        navigationTitle={homeSectionTitle(section)}
        navigationBarTitleDisplayMode="inline"
        toolbar={toolbar}
      />
    </NavigationStack>
  )
}
