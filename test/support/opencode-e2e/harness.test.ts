import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import { createOpencodeE2EHarness } from "./harness"
import { createE2ELogger } from "./logging"

let harness: Awaited<ReturnType<typeof createOpencodeE2EHarness>> | null = null
const e2eLog = createE2ELogger({
  suite: "OpenCode e2e harness",
  description: "Verify the reusable harness can run real opencode against the mock LLM provider.",
})

beforeAll(() => {
  e2eLog.suiteStart()
})

afterAll(() => {
  e2eLog.suiteSummary()
})

afterEach(async () => {
  await harness?.close()
  harness = null
})

describe("createOpencodeE2EHarness", () => {
  test("runs opencode against the mock LLM provider and records the request", async () => {
    await e2eLog.scenario(
      "harness smoke",
      "Start a temporary OpenCode project, route one prompt through the mock provider, and verify request capture.",
      async (log) => {
        log.step("Create isolated harness", "temporary HOME, config, project directory, plugin entry, and mock LLM server are prepared")
        harness = await createOpencodeE2EHarness()

        log.step("Register mock response", "one request_id expectation should be consumed by the real provider call")
        await harness.mock.expect([
          {
            request_id: "harness-smoke",
            response: {
              type: "text",
              content: "harness response",
            },
          },
        ])

        log.step("Run opencode", "the prompt marker should select the registered response")
        const result = await harness.runOpencode({
          title: "Harness smoke",
          message: "[e2e_trace_id:harness-smoke] [llm_request_id:harness-smoke] say hello",
        })

        expect(result.code).toBe(0)
        expect(result.error).toBeUndefined()
        log.verify("OpenCode exited successfully with the mock provider response")

        log.step("Verify provider request capture", "mock server should record exactly one provider request with request_id=harness-smoke")
        const requests = await harness.mock.requests()
        expect(requests).toHaveLength(1)
        expect(requests[0]?.request_id).toBe("harness-smoke")

        const pending = await harness.mock.pending()
        expect(pending).toEqual([])
        log.verify("mock server recorded one request and has no pending expectations")
      },
    )
  }, 30_000)
})
