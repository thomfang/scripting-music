import { Script } from "scripting"
import { runSuite, SuiteResult } from "./test_runner"
import { ALL_SUITES } from "./all_suites"

function summarize(results: SuiteResult[]): string {
  const lines: string[] = []
  let total = 0, passed = 0, failed = 0
  let totalMs = 0

  for (const s of results) {
    totalMs += s.duration
    total += s.cases.length
    passed += s.passed
    failed += s.failed
    const mark = s.failed === 0 ? "✅" : "❌"
    lines.push(`\n${mark} ${s.name}  (${s.passed}✓ ${s.failed}✗ · ${s.duration}ms)`)
    for (const c of s.cases) {
      const icon = c.passed ? "  ✓" : "  ✗"
      lines.push(`${icon} ${c.name} · ${c.duration}ms`)
      if (!c.passed && c.error) {
        const err = c.error.split("\n").map(l => "      " + l).join("\n")
        lines.push(err)
      }
    }
  }

  const header = [
    "==================== TEST SUMMARY ====================",
    `Suites : ${results.length}`,
    `Cases  : ${total}   (${passed} passed, ${failed} failed)`,
    `Time   : ${totalMs}ms`,
    "======================================================",
  ].join("\n")

  return header + lines.join("\n")
}

async function main() {
  const results: SuiteResult[] = []
  for (const s of ALL_SUITES) {
    try {
      results.push(await runSuite(s))
    } catch (e) {
      results.push({
        name: s.name,
        cases: [{ name: "<suite error>", passed: false, error: String(e), duration: 0 }],
        passed: 0,
        failed: 1,
        duration: 0
      })
    }
  }

  const report = summarize(results)
  console.log(report)
  const hasFailure = results.some(r => r.failed > 0)
  Script.exit(hasFailure ? `FAILED\n${report}` : `OK\n${report}`)
}

main()
