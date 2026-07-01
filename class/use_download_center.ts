import { useObservable, useEffect } from "scripting"
import { downloadCenter, DownloadCenterItem } from "./download_center"

/**
 * 订阅全局下载中心。返回反应式的 items 与 activeCount。
 * 不用 Context（下载中心是模块级单例，任何组件都能直接订阅）。
 */
export function useDownloadCenter(): { items: DownloadCenterItem[]; activeCount: number } {
  const items = useObservable<DownloadCenterItem[]>(() => downloadCenter.getItems())

  useEffect(() => {
    // 挂载即同步一次当前快照，避免订阅前的状态漏掉。
    items.setValue(downloadCenter.getItems())
    const unsub = downloadCenter.subscribe(() => {
      items.setValue(downloadCenter.getItems())
    })
    return unsub
  }, [])

  const list = items.value
  const activeCount = list.filter(it =>
    it.status === "queued" || it.status === "downloading" || it.status === "paused" || it.status === "failed"
  ).length

  return { items: list, activeCount }
}
