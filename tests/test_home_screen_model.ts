import { defineSuite, expect, TestSuite } from "./test_runner"
import {
  DEFAULT_HOME_SECTION,
  HOME_SECTIONS,
  homeSectionTitle,
  isHomeSection,
  makeConcentricMiniPlayerGeometry,
  markHomeSectionVisited,
  normalizeHomeSection,
  supportsLiquidGlass,
} from "../page/home_screen_model"

export const suite: TestSuite = defineSuite({
  name: "Home Screen · section model",
  cases: [
    {
      name: "接受全部合法 section",
      fn: () => {
        for (const section of HOME_SECTIONS) expect(isHomeSection(section)).toBe(true)
      }
    },
    {
      name: "拒绝未知和非字符串值",
      fn: () => {
        expect(isHomeSection("player")).toBe(false)
        expect(isHomeSection(null)).toBe(false)
        expect(isHomeSection(1)).toBe(false)
      }
    },
    {
      name: "无效持久化值回退到资料库",
      fn: () => {
        expect(normalizeHomeSection("unknown")).toBe(DEFAULT_HOME_SECTION)
        expect(normalizeHomeSection(undefined)).toBe("library")
      }
    },
    {
      name: "合法持久化值保持不变",
      fn: () => {
        expect(normalizeHomeSection("search")).toBe("search")
        expect(normalizeHomeSection("settings")).toBe("settings")
      }
    },
    {
      name: "已访问 section 只追加一次并保持原顺序",
      fn: () => {
        const first = markHomeSectionVisited(["library"], "search")
        expect(first).toEqual(["library", "search"])
        expect(markHomeSectionVisited(first, "library") === first).toBe(true)
      }
    },
    {
      name: "MiniPlayer 圆角按外圆角减内容 inset 保持同心",
      fn: () => {
        expect(makeConcentricMiniPlayerGeometry(28, 8)).toEqual({
          outerRadius: 28,
          contentInset: 8,
          coverRadius: 20,
        })
        expect(makeConcentricMiniPlayerGeometry(6, 10).coverRadius).toBe(0)
      }
    },
    {
      name: "仅 iOS 26 及以上启用 Liquid Glass",
      fn: () => {
        expect(supportsLiquidGlass("26")).toBe(true)
        expect(supportsLiquidGlass("26.0 beta")).toBe(true)
        expect(supportsLiquidGlass("26.0")).toBe(true)
        expect(supportsLiquidGlass("27.1.2")).toBe(true)
        expect(supportsLiquidGlass("25.9")).toBe(false)
        expect(supportsLiquidGlass("invalid")).toBe(false)
      }
    },
    {
      name: "section 标题映射稳定",
      fn: () => {
        expect(HOME_SECTIONS.map(homeSectionTitle)).toEqual(["资料库", "发现", "搜索", "设置"])
      }
    }
  ]
})
