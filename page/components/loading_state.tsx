import { VStack, ProgressView, Text } from "scripting"

type LoadingStateProps = {
  message?: string
}

export function LoadingState({ message }: LoadingStateProps) {
  return (
    <VStack spacing={16} padding={32} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <ProgressView />
      <Text font="subheadline" foregroundStyle="secondaryLabel">
        {message || "加载中..."}
      </Text>
    </VStack>
  )
}