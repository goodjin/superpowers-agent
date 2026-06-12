export type E2EScenarioLogger = {
  step(action: string, target: string): void
  verify(result: string): void
}

type ScenarioSummary = {
  name: string
  status: "passed" | "failed"
  steps: number
  verifications: number
  error?: string
}

export function createE2ELogger(args: { suite: string; description: string }) {
  const summaries: ScenarioSummary[] = []

  return {
    suiteStart() {
      console.log("")
      console.log(`[e2e] Suite: ${args.suite}`)
      console.log(`[e2e] Goal: ${args.description}`)
    },
    async scenario(name: string, description: string, run: (log: E2EScenarioLogger) => Promise<void>) {
      let steps = 0
      let verifications = 0
      const startedAt = Date.now()
      const log: E2EScenarioLogger = {
        step(action, target) {
          steps += 1
          console.log(`[e2e] STEP ${steps}: ${action}`)
          console.log(`[e2e]   test: ${target}`)
        },
        verify(result) {
          verifications += 1
          console.log(`[e2e] VERIFY ${verifications}: PASS - ${result}`)
        },
      }

      console.log("")
      console.log(`[e2e] Scenario: ${name}`)
      console.log(`[e2e] Description: ${description}`)

      try {
        await run(log)
        const durationMs = Date.now() - startedAt
        summaries.push({ name, status: "passed", steps, verifications })
        console.log(`[e2e] Scenario result: PASS - ${name} (${steps} steps, ${verifications} verifications, ${durationMs}ms)`)
      } catch (error) {
        const durationMs = Date.now() - startedAt
        const message = error instanceof Error ? error.message : String(error)
        summaries.push({ name, status: "failed", steps, verifications, error: message })
        console.log(`[e2e] Scenario result: FAIL - ${name} (${steps} steps, ${verifications} verifications, ${durationMs}ms)`)
        console.log(`[e2e] Failure: ${message}`)
        throw error
      }
    },
    suiteSummary() {
      const passed = summaries.filter((summary) => summary.status === "passed").length
      const failed = summaries.length - passed
      const steps = summaries.reduce((total, summary) => total + summary.steps, 0)
      const verifications = summaries.reduce((total, summary) => total + summary.verifications, 0)

      console.log("")
      console.log(`[e2e] Summary: ${args.suite}`)
      console.log(`[e2e] Scenarios: ${summaries.length}, passed: ${passed}, failed: ${failed}`)
      console.log(`[e2e] Steps: ${steps}, verifications: ${verifications}`)
      for (const summary of summaries) {
        const detail =
          summary.status === "passed"
            ? `${summary.steps} steps, ${summary.verifications} verifications`
            : `${summary.steps} steps, ${summary.verifications} verifications, error: ${summary.error}`
        console.log(`[e2e] - ${summary.status.toUpperCase()} ${summary.name}: ${detail}`)
      }
    },
  }
}
