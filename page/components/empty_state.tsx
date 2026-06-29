import { VStack, Image, Text, Button } from "scripting"

type EmptyStateProps = {
  icon: string
  title: string
  message: string
  actionTitle?: string
  action?: () => void
}

export function EmptyState({ icon, title, message, actionTitle, action }: EmptyStateProps) {
  return (
    <VStack spacing={16} padding={32} frame={{ maxWidth: Infinity, maxHeight: Infinity }}>
      <Image systemName={icon} font="largeTitle" foregroundStyle="secondaryLabel" />
      <VStack spacing={8}>
        <Text font="headline">{title}</Text>
        <Text font="subheadline" foregroundStyle="secondaryLabel" multilineTextAlignment="center">
          {message}
        </Text>
      </VStack>
      {action && actionTitle ? (
        <Button action={action}>
          <Text>{actionTitle}</Text>
        </Button>
      ) : null}
    </VStack>
  )
}