import {
  Button, HStack, Image, List, Navigation, NavigationStack, ScrollView,
  Section, Spacer, Text, VStack, useState, Script
} from "scripting"
import { runSuite, SuiteResult } from "./test_runner"
import { ALL_SUITES } from "./all_suites"

function statusIcon(passed: boolean) {
  return (
    <Image
      systemName={passed ? "checkmark.circle.fill" : "xmark.octagon.fill"}
      tint={passed ? "systemGreen" : "systemRed"}
    />
  )
}

function RunnerView() {
  const [results, setResults] = useState<SuiteResult[]>([])
  const [running, setRunning] = useState(false)

  async function runAll() {
    setRunning(true)
    setResults([])
    const out: SuiteResult[] = []
    for (const s of ALL_SUITES) {
      try {
        out.push(await runSuite(s))
      } catch (e) {
        out.push({
          name: s.name,
          cases: [{ name: "<suite error>", passed: false, error: String(e), duration: 0 }],
          passed: 0,
          failed: 1,
          duration: 0
        })
      }
      setResults([...out])
    }
    setRunning(false)
  }

  const totalPassed = results.reduce((s, r) => s + r.passed, 0)
  const totalFailed = results.reduce((s, r) => s + r.failed, 0)

  return (
    <List navigationTitle="Test Runner">
      <Section>
        <Button action={runAll} disabled={running}>
          <HStack>
            <Image systemName={running ? "hourglass" : "play.circle.fill"} tint="accentColor" />
            <Text>{running ? "运行中…" : `运行全部 (${ALL_SUITES.length} 个 suite)`}</Text>
          </HStack>
        </Button>
        {results.length > 0 && (
          <HStack>
            <Text>总计</Text>
            <Spacer />
            <Text foregroundStyle={totalFailed > 0 ? "systemRed" : "systemGreen"}>
              {totalPassed} passed / {totalFailed} failed
            </Text>
          </HStack>
        )}
      </Section>
      {results.map(suite => (
        <Section
          key={suite.name}
          header={
            <HStack>
              <Text>{suite.name}</Text>
              <Spacer />
              <Text font="caption" foregroundStyle="secondaryLabel">
                {suite.passed}✓ {suite.failed}✗ · {suite.duration}ms
              </Text>
            </HStack>
          }
        >
          {suite.cases.map(c => (
            <VStack alignment="leading" spacing={4} key={c.name}>
              <HStack>
                {statusIcon(c.passed)}
                <Text>{c.name}</Text>
                <Spacer />
                <Text font="caption" foregroundStyle="secondaryLabel">{c.duration}ms</Text>
              </HStack>
              {c.error ? (
                <Text font="caption" foregroundStyle="systemRed" lineLimit={10}>
                  {c.error}
                </Text>
              ) : null}
            </VStack>
          ))}
        </Section>
      ))}
    </List>
  )
}

async function main() {
  try {
    await Navigation.present({
      element: <NavigationStack><RunnerView /></NavigationStack>,
      modalPresentationStyle: "pageSheet",
    })
  } catch (e) {
    console.error(e)
    await console.present()
  } finally {
    Script.exit()
  }
}

main()
