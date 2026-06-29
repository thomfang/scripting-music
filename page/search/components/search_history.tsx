const HISTORY_KEY = "search_history"
const MAX_HISTORY = 20

export function getHistory(): string[] {
  try {
    const data = Storage.get<string[]>(HISTORY_KEY)
    return data || []
  } catch {
    return []
  }
}

export function addToHistory(query: string) {
  if (!query.trim()) return
  const history = getHistory()
  const filtered = history.filter(item => item !== query)
  const updated = [query, ...filtered].slice(0, MAX_HISTORY)
  Storage.set(HISTORY_KEY, updated)
}

export function clearHistory() {
  Storage.remove(HISTORY_KEY)
}