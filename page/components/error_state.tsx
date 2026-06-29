import { VStack, Image, Text, Button } from "scripting"

type ErrorStateProps = {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <VStack spacing={16} padding={32} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <Image systemName="exclamationmark.triangle" font="largeTitle" foregroundStyle="systemRed" />
      <Text font="headline">加载失败</Text>
      <Text font="subheadline" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
        {message}
      </Text>
      <Button action={onRetry}>
        <Text>重试</Text>
      </Button>
    </VStack>
  )
}