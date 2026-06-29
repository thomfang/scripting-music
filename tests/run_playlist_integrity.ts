import { Script } from "scripting"
import { runSuite } from "./test_runner"
import { suite } from "./test_playlist_integrity"

async function main() {
  const result = await runSuite(suite)
  const lines = [
    `${result.failed === 0 ? "OK" : "FAILED"} ${result.name} (${result.passed}✓ ${result.failed}✗ · ${result.duration}ms)`,
    ...result.cases.map(c => `${c.passed ? "✓" : "✗"} ${c.name}${c.error ? `\n${c.error}` : ""}`),
  ]
  const report = lines.join("\n")
  console.log(report)
  Script.exit(result.failed === 0 ? `OK\n${report}` : `FAILED\n${report}`)
}

main()
