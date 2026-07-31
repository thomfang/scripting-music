import type { DownloadInfo } from "./download_center"

export type DownloadSnapshot = Record<string, DownloadInfo>

export function putDownloadSnapshot(snapshot: DownloadSnapshot, info: DownloadInfo): DownloadSnapshot {
  return { ...snapshot, [info.id]: { ...info } }
}

export function removeDownloadSnapshot(snapshot: DownloadSnapshot, id: string): DownloadSnapshot {
  if (!(id in snapshot)) return snapshot
  const next = { ...snapshot }
  delete next[id]
  return next
}

export function getDownloadSnapshotInfo(snapshot: DownloadSnapshot, id: string): DownloadInfo | null {
  const info = snapshot[id]
  return info && info.id === id ? { ...info } : null
}
