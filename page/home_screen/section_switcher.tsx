import { Button, HStack, Image } from "scripting"
import { HomeSection, homeSectionTitle, supportsLiquidGlass } from "../home_screen_model"

const ITEMS: { section: HomeSection; systemImage: string }[] = [
  { section: "library", systemImage: "music.note.square.stack" },
  { section: "discover", systemImage: "sparkles" },
  { section: "search", systemImage: "magnifyingglass" },
  { section: "settings", systemImage: "gear" },
]

const CORNER_RADIUS = 22
const SHAPE = { type: "rect" as const, cornerRadius: CORNER_RADIUS }

function SectionButtons({
  current,
  onSelect,
}: {
  current: HomeSection
  onSelect: (section: HomeSection) => void
}) {
  return (
    <>
      {ITEMS.map(({ section, systemImage }) => (
        <Button
          key={section}
          action={() => onSelect(section)}
          accessibilityLabel={homeSectionTitle(section)}
          buttonStyle="plain"
          frame={{ width: 42, height: 36 }}
        >
          <Image
            systemName={systemImage}
            frame={{ width: 22, height: 22 }}
            foregroundStyle={section === current ? "systemPink" : "secondaryLabel"}
          />
        </Button>
      ))}
    </>
  )
}

/** 固定尺寸的 Home section 导航；整个 HStack 共用一块圆角矩形 Liquid Glass 背景。 */
export function HomeSectionSwitcher({
  current,
  onSelect,
}: {
  current: HomeSection
  onSelect: (section: HomeSection) => void
}) {
  const buttons = <SectionButtons current={current} onSelect={onSelect} />

  if (supportsLiquidGlass(Device.systemVersion)) {
    return (
      <HStack
        spacing={6}
        frame={{ width: 204 }}
        padding={6}
        background="clear"
        clipShape={SHAPE}
        glassEffect={{ glass: UIGlass.regular().interactive(), shape: SHAPE }}
      >
        {buttons}
      </HStack>
    )
  }

  return (
    <HStack
      spacing={6}
      frame={{ width: 204 }}
      padding={6}
      background="secondarySystemBackground"
      clipShape={SHAPE}
    >
      {buttons}
    </HStack>
  )
}
