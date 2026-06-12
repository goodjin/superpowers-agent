import { createOpencodeE2EHarness } from "../test/support/opencode-e2e/harness"

const requestId = "e2e-text-response"
const harness = await createOpencodeE2EHarness()

try {
  await harness.mock.expect([
    {
      request_id: requestId,
      response: {
        type: "text",
        content: "mock e2e response",
      },
    },
  ])

  const run = await harness.runOpencode({
    title: "Mock LLM e2e",
    message: `[llm_request_id:${requestId}] say hello`,
  })

  if (run.code !== 0) {
    const mockRequests = await harness.mock.requests()
    throw new Error(
      `opencode run failed: code=${run.code} signal=${run.signal} error=${String(run.error)}\nmockRequests=${JSON.stringify(mockRequests)}\nstdout=${run.stdout}\nstderr=${run.stderr}`,
    )
  }

  const requests = await harness.mock.requests()
  if (requests.length !== 1 || requests[0]?.request_id !== requestId) {
    throw new Error(`Expected exactly one mock LLM request for ${requestId}, got ${JSON.stringify(requests)}`)
  }

  const pending = await harness.mock.pending()
  if (pending.length !== 0) {
    throw new Error(`Expected all mock expectations to be consumed, got ${JSON.stringify(pending)}`)
  }

  console.log("OpenCode 1.16.2 mock LLM e2e passed: request_id marker selected the configured response.")
} finally {
  await harness.close()
}
