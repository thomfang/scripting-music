import {
  useEffect,
  useMemo,
  useState,
  List,
  Section,
  Text,
  HStack,
  Image,
  Button,
  Spacer,
  Picker,
} from "scripting"
import { Music, database } from "../../class/database"
import { player } from "../../class/player"
import { fileManager } from "../../class/file_manager"
import { SongRow } from "../components/song_row"
import { ArtistResultsSection, AlbumResultsSection, ItunesSongResultsSection } from "./components/entity_results"
import { itunesBrowse, ItunesArtist, ItunesAlbum, ItunesTrack } from "../../class/sources/itunes_browse"
import { SearchPlaceholder } from "./components/search_placeholder"
import { addToHistory, getHistory, clearHistory } from "./components/search_history"
import { usePlayerState } from "../../class/player_state"
import { PlaylistPickerContent } from "../components/playlist_picker"
import { LRUCache } from "../../class/lru_cache"

type CacheEntry = { data: ItunesTrack[], timestamp: number }
type SearchMode = "online" | "artist" | "album" | "local"

const searchCache = new LRUCache<string, CacheEntry>(50)
const CACHE_DURATION = 5 * 60 * 1000

export function SearchView() {
  const [inputValue, setInputValue] = useState("")
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchMode>("online")
  const [results, setResults] = useState<ItunesTrack[] | null>(null)
  const [localResults, setLocalResults] = useState<Music[] | null>(null)
  const [artistResults, setArtistResults] = useState<ItunesArtist[] | null>(null)
  const [albumResults, setAlbumResults] = useState<ItunesAlbum[] | null>(null)
  const [localCoverExists, setLocalCoverExists] = useState<Record<string, boolean>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false)
  const [selectedMusic, setSelectedMusic] = useState<Music | null>(null)
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

    async function doSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) return
    setQuery(trimmed)
    addToHistory(trimmed)
    setHistoryVersion(v => v + 1)

    if (mode === "local") {
      await doLocalSearch(trimmed)
    } else if (mode === "artist") {
      await doArtistSearch(trimmed)
    } else if (mode === "album") {
      await doAlbumSearch(trimmed)
    } else {
      await doOnlineSearch(trimmed)
    }
  }

  async function doArtistSearch(q: string) {
    setIsSearching(true)
    setArtistResults(null)
    setError(null)
    try {
      setArtistResults(await itunesBrowse.searchArtists(q))
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setArtistResults([])
    } finally {
      setIsSearching(false)
    }
  }

  async function doAlbumSearch(q: string) {
    setIsSearching(true)
    setAlbumResults(null)
    setError(null)
    try {
      setAlbumResults(await itunesBrowse.searchAlbums(q))
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setAlbumResults([])
    } finally {
      setIsSearching(false)
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
    const cacheKey = q
    const cached = searchCache.get(cacheKey)
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setResults(cached.data)
      setError(null)
      return
    }
    setIsSearching(true)
    setResults(null)
    setError(null)
    try {
      const items = await itunesBrowse.searchSongs(q)
      setResults(items)
      searchCache.set(cacheKey, { data: items, timestamp: Date.now() })
    } catch {
      setError("搜索失败，请检查网络连接后重试")
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }

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
          cover_url: selectedMusic.cover_url ?? "",
          audio_url: selectedMusic.audio_url || "",
          provider: selectedMusic.provider,
          source_id: selectedMusic.source_id,
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
  const hasArtistResults = artistResults !== null && artistResults.length > 0
  const hasAlbumResults = albumResults !== null && albumResults.length > 0
  const showEmpty = mode === "online"
    ? (results !== null && results.length === 0)
    : mode === "local"
      ? (localResults !== null && localResults.length === 0)
      : mode === "artist"
        ? (artistResults !== null && artistResults.length === 0)
        : (albumResults !== null && albumResults.length === 0)

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
        prompt: mode === "online" ? "搜索歌曲（在线）"
          : mode === "artist" ? "搜索艺人（在线）"
          : mode === "album" ? "搜索专辑（在线）"
          : "搜索本地歌曲"
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
      submitLabel="search">
      <Section>
        <Picker
                  label={<Text>搜索模式</Text>}
                  value={mode}
                  onChanged={(v: string) => setMode(v as SearchMode)}
                  pickerStyle="segmented"
                >
          <Text tag="online">歌曲</Text>
          <Text tag="artist">艺人</Text>
          <Text tag="album">专辑</Text>
          <Text tag="local">本地</Text>
        </Picker>
      </Section>

      {isSearching ? (
        <SearchPlaceholder kind="searching" />
      ) : error ? (
        <SearchPlaceholder kind="error" errorMessage={error} />
      ) : showEmpty ? (
        <SearchPlaceholder kind="empty" />
      ) : mode === "online" && hasOnlineResults ? (
        <ItunesSongResultsSection
          tracks={results!}
          query={query}
          currentMusic={playerState.currentMusic}
          onAddToPlaylist={(m) => { setSelectedMusic(m); setShowPlaylistPicker(true) }}
        />
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
      ) : mode === "artist" && hasArtistResults ? (
        <ArtistResultsSection artists={artistResults!} query={query} />
      ) : mode === "album" && hasAlbumResults ? (
        <AlbumResultsSection albums={albumResults!} query={query} />
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
