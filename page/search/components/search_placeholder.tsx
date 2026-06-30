import { Section, VStack, Image, Text } from "scripting"

/**
 * 搜索页的状态占位区（正在搜索 / 失败 / 空结果）。
 * 从 SearchView 主组件抽出，主组件只判分支不堆 JSX。
 */
export type PlaceholderKind = "searching" | "error" | "empty"

export function SearchPlaceholder({ kind, errorMessage }: { kind: PlaceholderKind, errorMessage?: string }) {
  if (kind === "searching") {
    return (
      <Section>
        <VStack spacing={12} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
          <Image systemName="magnifyingglass" font="largeTitle" foregroundStyle="tertiaryLabel" />
          <Text font="headline" foregroundStyle="secondaryLabel">正在搜索...</Text>
        </VStack>
      </Section>
    )
  }
  if (kind === "error") {
    return (
      <Section>
        <VStack spacing={8} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
          <Image systemName="wifi.slash" font="largeTitle" foregroundStyle="tertiaryLabel" />
          <Text font="headline" foregroundStyle="secondaryLabel">搜索失败</Text>
          {errorMessage ? <Text font="subheadline" foregroundStyle="tertiaryLabel">{errorMessage}</Text> : null}
        </VStack>
      </Section>
    )
  }
  return (
    <Section>
      <VStack spacing={8} padding={{ top: 40, bottom: 40 }} frame={{ maxWidth: "infinity" }}>
        <Image systemName="music.note.list" font="largeTitle" foregroundStyle="tertiaryLabel" />
        <Text font="headline" foregroundStyle="secondaryLabel">未找到相关结果</Text>
        <Text font="subheadline" foregroundStyle="tertiaryLabel">试试其他关键词</Text>
      </VStack>
    </Section>
  )
}
