import {
  useEffect,
  useMemo,
  useState,
  List,
  Section,
  Text,
  VStack,
  HStack,
  Image,
  Button,
  Spacer,
  Menu,
  Toolbar,
  ToolbarItem,
  Picker,
  Group,
  Label,
} from "scripting"
import { MusicData, music, SourceId } from "../../class/music"
import { Music, database } from "../../class/database"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { SearchResultCard } from "./components/search_result_card"
import { SongRow } from "../components/song_row"
import { addToHistory, getHistory, clearHistory } from "./components/search_history"
import { usePlayerState } from "../../class/player_state"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { LRUCache } from "../../class/lru_cache"

type CacheEntry = { data: MusicData[], timestamp: number }
type SortType = "relevance" | "title" | "artist"
type SearchMode = "online" | "local"

const searchCache = new LRUCache<string, CacheEntry>(50)
const CACHE_DURATION = 5 * 60 * 1000

export function SearchView() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchMode>("online")
  const [source, setSource] = useState<SourceId>("001co")
  const [results, setResults] = useState<MusicData[] | null>(null)
  const [localResults, setLocalResults] = useState<Music[] | null>(null)
  const [localCoverExists, setLocalCoverExists] = useState<Record<string, boolean>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortType, setSortType] = useState<SortType>("relevance")
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<MusicData | Music | null>(null)
  const [historyVersion, setHistoryVersion] = useState(0)
  const playerState = usePlayerState()

  const history = useMemo(() => getHistory(), [historyVersion])

  useEffect(() => {
    const trimmed = inputValue.trim()
    if (trimmed && history.includes(trimmed) && trimmed !== query) {
      doSearch(trimmed)
    }
  }, [inputValue])

  // Re-run search when mode changes (if there's an active query)
  useEffect(() => {
    if (query) doSearch(query)
  }, [mode])

  // Re-run online search when source changes
  useEffect(() => {
    if (query && mode === "online") doSearch(query)
  }, [source])

  function sortResults(data: MusicData[], type: SortType): MusicData[] {
      const sorted = [...data]
      switch (type) {
        case "title": sorted.sort((a, b) => a.title.localeCompare(b.title)); break
        case "artist": sorted.sort((a, b) => (a.artist || "").localeCompare(b.artist || "")); break
        default: break
      }
      // Prioritize items with cover art
      return sorted.sort((a, b) => (b.cover ? 1 : 0) - (a.cover ? 1 : 0))
    }

  async function doSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setQuery(trimmed)
    addToHistory(trimmed)
    setHistoryVersion(v => v + 1)

    if (mode === "local") {
      await doLocalSearch(trimmed)
    } else {
      await doOnlineSearch(trimmed)
    }
  }

  async function doLocalSearch(q: string) {
    setIsSearching(true)
    setLocalResults(null)
    setError(null)
    try {
      const all = await database.getAllMusic()
      const lower = q.toLowerCase()
      const filtered = all.filter(m =>
        m.title.toLowerCase().includes(lower) ||
        m.artist.toLowerCase().includes(lower) ||
        m.album.toLowerCase().includes(lower)
      )
      setLocalResults(filtered)
      const exists: Record<string, boolean> = {}
      await Promise.all(filtered.map(async m => { exists[m.id] = await fileManager.coverExists(m.id) }))
      setLocalCoverExists(exists)
    } catch {
      setError("搜索失败")
      setLocalResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function doOnlineSearch(q: string) {
    const cacheKey = `${source}::${q}`
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setResults(sortResults(cached.data, sortType))
      setError(null)
      return
    }
    setIsSearching(true)
    setResults(null)
    setError(null)
    try {
      const { items } = await music.search(q, source)
      setResults(sortResults(items, sortType))
      searchCache.set(cacheKey, { data: items, timestamp: Date.now() })
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    if (results && results.length > 0) {
      setResults(prev => sortResults(prev!, sortType))
    }
  }, [sortType])

  async function addToPlaylist(playlistId: string) {
    if (!selectedMusic) return
    try {
      const existing = await database.getMusic(selectedMusic.id)
      if (!existing) {
        await database.addMusic({
          id: selectedMusic.id,
          title: selectedMusic.title,
          artist: selectedMusic.artist || "未知艺术家",
          album: selectedMusic.album || "未知专辑",
          duration: selectedMusic.duration || 0,
          cover_url: (selectedMusic as any).cover ?? (selectedMusic as any).cover_url ?? "",
          audio_url: "audio_url" in selectedMusic ? selectedMusic.audio_url || "" : (selectedMusic.provider === "mp3juice" ? "" : music.getAudioUrl(selectedMusic.id, selectedMusic.provider as any)),
          provider: selectedMusic.provider,
          is_downloaded: false,
          added_at: Date.now(),
        })
      }
      await database.addMusicToPlaylist(playlistId, selectedMusic.id)
      setShowPlaylistPicker(false)
      setSelectedMusic(null)
    } catch (e) {
      console.error(e)
    }
  }

  async function deleteLocalMusic(m: Music) {
    try {
      await database.deleteMusic(m.id)
      setLocalResults(prev => prev ? prev.filter(x => x.id !== m.id) : prev)
    } catch (e) {
      console.error(e)
    }
  }

  async function playLocal(m: Music, list: Music[]) {
    const idx = list.indexOf(m)
    player.setQueue(list, idx)
    await player.play(m)
  }

  const dismissPlaylistPicker = () => { setShowPlaylistPicker(false); setSelectedMusic(null) }

  const hasOnlineResults = results !== null && results.length > 0
  const hasLocalResults = localResults !== null && localResults.length > 0
  const showEmpty = mode === "online"
    ? (results !== null && results.length === 0)
    : (localResults !== null && localResults.length === 0)

  return (
    <List
      sheet={{
        isPresented: showPlaylistPicker,
        onChanged: (v: boolean) => { if (!v) dismissPlaylistPicker() },
        content: <PlaylistPickerContent onSelect={addToPlaylist} onDismiss={dismissPlaylistPicker} />
      }}
      searchable={{
        value: inputValue,
        onChanged: setInputValue,
        placement: "navigationBarDrawer",
        prompt: mode === "local" ? "搜索本地歌曲" : "搜索音乐、艺人、专辑"
      }}
      searchSuggestions={
        <>
          {!inputValue.trim() && history.map((h, i) => (
            <Text key={i} searchCompletion={h}>{`🕐 ${h}`}</Text>
          ))}
        </>
      }
      onSubmit={{
        triggers: "search",
        action: () => doSearch(inputValue)
      }}
      submitLabel="search"
      toolbar={
              <Toolbar>
                {hasOnlineResults && !isSearching && mode === "online" && (
                  <ToolbarItem placement="topBarTrailing">
                    <Menu label={<Image systemName="arrow.up.arrow.down" />}>
                      <Button title="按相关度" systemImage={sortType === "relevance" ? "checkmark" : undefined} action={() => setSortType("relevance")} />
                      <Button title="按歌曲名称" systemImage={sortType === "title" ? "checkmark" : undefined} action={() => setSortType("title")} />
                      <Button title="按艺人名称" systemImage={sortType === "artist" ? "checkmark" : undefined} action={() => setSortType("artist")} />
                    </Menu>
                  </ToolbarItem>
                )}
              </Toolbar>
            }>
      <Section>
        <Picker
                  label={<Text>搜索模式</Text>}
                  value={mode}
                  onChanged={(v: string) => setMode(v as SearchMode)}
                  pickerStyle="segmented"
                >
          <Text tag="online">在线</Text>
          <Text tag="local">本地</Text>
        </Picker>
        {mode === "online" ? (
          <Picker
            label={<Text>服务源</Text>}
            value={source}
            onChanged={(v: string) => setSource(v as SourceId)}
            pickerStyle="segmented"
          >
            {music.listSources().map(s => (
              <Text key={s.id} tag={s.id}>{s.label}</Text>
            ))}
          </Picker>
        ) : null}
      </Section>

      {isSearching ? (
        <Section>
          <VStack spacing={12} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
            <Image systemName="magnifyingglass" font="largeTitle" foregroundStyle="tertiaryLabel" />
            <Text font="headline" foregroundStyle="secondaryLabel">正在搜索...</Text></VStack>
        </Section>
      ) : error ? (
        <Section>
          <VStack spacing={8} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
            <Image systemName="wifi.slash" font="largeTitle" foregroundStyle="tertiaryLabel" />
            <Text font="headline" foregroundStyle="secondaryLabel">搜索失败</Text>
            <Text font="subheadline" foregroundStyle="tertiaryLabel">{error}</Text>
          </VStack>
        </Section>
      ) : showEmpty ? (
        <Section>
          <VStack spacing={8} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
            <Image systemName="music.note.list" font="largeTitle" foregroundStyle="tertiaryLabel" />
            <Text font="headline" foregroundStyle="secondaryLabel">未找到相关音乐</Text><Text font="subheadline" foregroundStyle="tertiaryLabel">试试其他关键词</Text>
          </VStack>
        </Section>
      ) : mode === "online" && hasOnlineResults ? (
              <Section header={<Text>{`"${query}" 的搜索结果`}</Text>}>
                {results!.map(item => (
                  <SearchResultCard
                    key={item.id}
                    info={item}
                    isPlaying={playerState.currentMusic?.id === item.id}
                    onShowPlaylistPicker={() => { setSelectedMusic(item); setShowPlaylistPicker(true) }}
      />
                ))}
              </Section>
      ) : mode === "local" && hasLocalResults ? (
        <Section header={<Text>{`"${query}" 的本地结果`}</Text>}>
          {localResults!.map(m => (
            <SongRow
              itemId={m.id}
              music={m}
              queue={localResults!}
              coverExists={localCoverExists}
              onToggleFavorite={async (mm) => {
                await database.toggleFavorite(mm.id)
                setLocalResults(prev => prev ? prev.map(x => x.id === mm.id ? { ...x, is_favorite: !x.is_favorite } : x) : prev)
              }}
              onDelete={deleteLocalMusic}
              onAddToPlaylist={(mm) => { setSelectedMusic(mm); setShowPlaylistPicker(true) }}
            />
          ))}
        </Section>
      ) : (
        history.length > 0 ? (
          <Section
            header={
              <HStack>
                <Text>最近搜索</Text>
                <Spacer />
                <Button title="清除" action={() => { clearHistory(); setHistoryVersion(v => v + 1) }} />
              </HStack>
            }
          >
            {history.map((h, i) => (
              <Button key={i} action={() => doSearch(h)}>
                <HStack>
                  <Text>{h}</Text>
                  <Spacer />
                  <Image systemName="arrow.up.left" foregroundStyle="tertiaryLabel" />
                </HStack>
              </Button>
            ))}
          </Section>
        ) : null
      )}
    </List>
  )
}
