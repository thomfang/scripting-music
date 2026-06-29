import { HStack, ProgressView, Section, Spacer, Text, VStack } from "scripting"
import { BatchDownloadProgress } from "../../class/batch_download_helper"

export function BatchDownloadProgressSection({ progress }: { progress: BatchDownloadProgress | null }) {
  if (!progress) return null

  return (
    <Section header={<Text>{"下载进度"}</Text>}>
      <VStack alignment="leading" spacing={6}>
        <HStack>
          <Text>{`${progress.done} / ${progress.total}`}</Text>
          <Spacer />
          <Text font="caption" foregroundStyle="secondaryLabel">
            {`✓ ${progress.ok}   ↻ ${progress.skipped}   ✗ ${progress.failed}`}
          </Text>
        </HStack>
        {progress.currentTitles && progress.currentTitles.length > 0 && (
          <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={1}>
            {`正在下载：${progress.currentTitles.join("、")}`}
          </Text>
        )}
        <ProgressView
          value={progress.total > 0 ? progress.done / progress.total : 0}
          total={1}
        />
      </VStack>
    </Section>
  )
}
