import {
  List, Section, Button, Image, HStack, VStack, Text, Spacer, ProgressView,
  Toolbar, ToolbarItem, Menu,
} from "scripting"
import { downloadCenter, DownloadCenterItem, DownloadStatus } from "../../class/download_center"
import { useDownloadCenter } from "../../class/use_download_center"
import { fileManager } from "../../class/file_manager"
import { EmptyState } from "../components/empty_state"

function statusText(it: DownloadCenterItem): string {
  switch (it.status) {
    case "queued": return "等待中…"
    case "downloading": return `下载中 ${Math.round(it.progress * 100)}%`
    case "paused": return `已暂停 ${Math.round(it.progress * 100)}%`
    case "completed": return "已完成"
    case "failed": return it.error ? `失败：${it.error}` : "下载失败"
    case "cancelled": return "已取消"
  }
}

function statusColor(status: DownloadStatus): string {
  switch (status) {
    case "completed": return "systemGreen"
    case "failed": return "systemRed"
    case "paused": return "systemOrange"
    case "cancelled": return "secondaryLabel"
    default: return "secondaryLabel"
  }
}

function DownloadItemRow({ it }: { it: DownloadCenterItem }) {
  const coverPath = fileManager.getCoverPath(it.musicId)
  return (
    <HStack spacing={12}>
      {it.info.cover
        ? <Image imageUrl={it.info.cover} frame={{ width: 48, height: 48 }} resizable={true} scaleToFill={true} clipShape={{ type: "rect", cornerRadius: 6 }}
            placeholder={<Image systemName="music.note" frame={{ width: 48, height: 48 }} />} />
        : <Image systemName="music.note" font="title2" foregroundStyle="secondaryLabel" frame={{ width: 48, height: 48 }} background="secondarySystemBackground" clipShape={{ type: "rect", cornerRadius: 6 }} />}

      <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="subheadline" fontWeight="medium" lineLimit={1}>{it.info.title}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>{it.info.artist}</Text>
        {(it.status === "downloading" || it.status === "paused" || it.status === "queued") && (
          <ProgressView value={Math.max(0, Math.min(1, it.progress))} total={1} tint="systemPink" />
        )}
        <Text font="caption2" foregroundStyle={statusColor(it.status) as any}>{statusText(it)}</Text>
      </VStack>

      <Spacer />

      {/* 状态操作按钮 */}
      <HStack spacing={16}>
        {it.status === "downloading" && (
          <Button buttonStyle="plain" action={() => downloadCenter.pause(it.musicId)}>
            <Image systemName="pause.circle.fill" font="title2" foregroundStyle="systemOrange" />
          </Button>
        )}
        {it.status === "paused" && (
          <Button buttonStyle="plain" action={() => downloadCenter.resume(it.musicId)}>
            <Image systemName="play.circle.fill" font="title2" foregroundStyle="systemGreen" />
          </Button>
        )}
        {(it.status === "failed" || it.status === "cancelled") && (
          <Button buttonStyle="plain" action={() => downloadCenter.retry(it.musicId)}>
            <Image systemName="arrow.clockwise.circle.fill" font="title2" foregroundStyle="systemBlue" />
          </Button>
        )}
        {it.status === "completed" ? (
          <Button buttonStyle="plain" action={() => downloadCenter.remove(it.musicId)}>
            <Image systemName="checkmark.circle.fill" font="title2" foregroundStyle="systemGreen" />
          </Button>
        ) : (
          <Button buttonStyle="plain" action={() => downloadCenter.cancel(it.musicId)}>
            <Image systemName="xmark.circle.fill" font="title2" foregroundStyle="secondaryLabel" />
          </Button>
        )}
      </HStack>
    </HStack>
  )
}

export function DownloadCenterView() {
  const { items } = useDownloadCenter()

  const hasActive = items.some(it => it.status === "downloading" || it.status === "queued")
  const hasPaused = items.some(it => it.status === "paused")
  const hasFinished = items.some(it => it.status === "completed" || it.status === "failed" || it.status === "cancelled")

  const toolbarEl = (
    <Toolbar>
      <ToolbarItem placement="topBarTrailing">
        <Menu label={<Image systemName="ellipsis.circle" />}>
          {hasActive && <Button title="全部暂停" systemImage="pause.fill" action={() => downloadCenter.pauseAll()} />}
          {hasPaused && <Button title="全部继续" systemImage="play.fill" action={() => downloadCenter.resumeAll()} />}
          {hasFinished && <Button title="清除已完成" systemImage="trash" action={() => downloadCenter.clearFinished()} />}
        </Menu>
      </ToolbarItem>
    </Toolbar>
  )

  if (items.length === 0) {
    return (
      <List navigationTitle="下载中心" toolbar={toolbarEl}>
        <EmptyState icon="arrow.down.circle" title="暂无下载任务" message="在任意页面点击下载后，可在这里查看进度、暂停或取消" />
      </List>
    )
  }

  return (
    <List navigationTitle="下载中心" toolbar={toolbarEl}>
      <Section>
        {items.map(it => <DownloadItemRow key={it.musicId} it={it} />)}
      </Section>
    </List>
  )
}
