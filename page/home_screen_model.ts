export type HomeSection = "library" | "discover" | "search" | "settings"

export const HOME_SECTION_KEY = "home_screen_selected_section"
export const DEFAULT_HOME_SECTION: HomeSection = "library"

export const HOME_SECTIONS: readonly HomeSection[] = [
  "library",
  "discover",
  "search",
  "settings",
]

export function isHomeSection(value: unknown): value is HomeSection {
  return typeof value === "string" && HOME_SECTIONS.includes(value as HomeSection)
}

export function normalizeHomeSection(value: unknown): HomeSection {
  return isHomeSection(value) ? value : DEFAULT_HOME_SECTION
}

export type HomeMiniPlayerGeometry = {
  outerRadius: number
  contentInset: number
  coverRadius: number
}

export function makeConcentricMiniPlayerGeometry(outerRadius: number, contentInset: number): HomeMiniPlayerGeometry {
  return {
    outerRadius,
    contentInset,
    coverRadius: Math.max(0, outerRadius - contentInset),
  }
}

export function supportsLiquidGlass(systemVersion: string): boolean {
  const major = Number.parseInt(systemVersion.split(".")[0] ?? "", 10)
  return Number.isFinite(major) && major >= 26
}

export function homeSectionTitle(section: HomeSection): string {
  switch (section) {
    case "library": return "资料库"
    case "discover": return "发现"
    case "search": return "搜索"
    case "settings": return "设置"
  }
}
