import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test"
import type { MockLlmExpectation } from "../support/llm-mock/server"
import { createE2ELogger } from "../support/opencode-e2e/logging"
import { createOpencodeE2EHarness, type OpencodeE2EHarness } from "../support/opencode-e2e/harness"

const e2eLog = createE2ELogger({
  suite: "OpenCode workflow e2e",
  description: "Run real opencode against the mock LLM provider and verify workflow state, artifacts, gates, and tool errors.",
})

let harness: OpencodeE2EHarness | null = null

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

describe("OpenCode workflow e2e", () => {
  test("records debug root cause through sp_route and sp_record tool calls", async () => {
    await e2eLog.scenario(
      "debug root cause",
      "Route a debug task, record a root cause artifact, and verify the persisted workflow state.",
      async (log) => {
        log.step("Create isolated OpenCode harness", "plugin loads from dist and project state is written only to a temp directory")
        harness = await createOpencodeE2EHarness()
        const requestId = "debug-root-cause"

        log.step("Register mock LLM responses", "same request_id drives sp_route, sp_record, then final text")
        await harness.mock.expect([
          {
            request_id: requestId,
            response: {
              type: "tool_call",
              name: "sp_route",
              arguments: {
                request: "/sp-debug 修复失败测试",
                command: "/sp-debug",
              },
            },
          },
          {
            request_id: requestId,
            response: {
              type: "tool_call",
              name: "sp_record",
              arguments: {
                event: "debug",
                status: "passed",
                summary: "The failing test starts from an uninitialized route state.",
                gates: {
                  root_cause_found: true,
                },
                artifacts: {
                  root_cause: "The failing test starts from an uninitialized route state.",
                },
              },
            },
          },
          {
            request_id: requestId,
            response: {
              type: "text",
              content: "root cause recorded",
            },
          },
        ])

        log.step("Run opencode", "prompt marker binds trace_id and request_id to the mock response queue")
        const result = await harness.runOpencode({
          title: "Debug root cause",
          message: `[e2e_trace_id:debug-root-cause] [llm_request_id:${requestId}] /sp-debug 修复失败测试`,
        })

        expect(result.code).toBe(0)
        expect(result.error).toBeUndefined()
        log.verify("OpenCode exited successfully after the debug tool-call loop")

        log.step("Verify mock provider traffic", "three provider calls should consume the same request_id FIFO queue")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual([requestId, requestId, requestId])
        expect(await harness.mock.pending()).toEqual([])
        log.verify("mock LLM consumed all debug expectations with no pending responses")

        log.step("Verify workflow state and artifact", "debug mode should persist root_cause_found and root_cause.md")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("debug")
        expect(state?.phase).toBe("root-cause-found")
        expect(state?.gates.root_cause_found).toBe(true)
        expect(state?.artifacts.root_cause).toBe("root_cause.md")
        expect(harness.readArtifact("root_cause")).toContain("uninitialized route state")
        log.verify("debug state, gate, and root cause artifact are correct")
      },
    )
  }, 30_000)

  test("blocks repair writes in strict debug mode before root cause is recorded", async () => {
    await e2eLog.scenario(
      "strict debug write gate",
      "Enter debug mode and prove a production write is blocked until root_cause_found is recorded.",
      async (log) => {
        log.step("Create strict debug harness", "debug_gate=strict should turn missing root cause into a blocking tool error")
        harness = await createOpencodeE2EHarness({
          workflowConfig: {
            debug_gate: "strict",
          },
        })
        const requestId = "strict-debug-write"

        log.step("Register mock LLM responses", "route debug, attempt write before root cause, then finish after the tool error")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-debug 修复失败测试",
            command: "/sp-debug",
          }),
          toolCall(requestId, "write", {
            filePath: "src/repair.ts",
            content: "export const repaired = true\n",
          }),
          textResponse(requestId, "repair write blocked"),
        ])

        log.step("Run opencode", "the write tool should be intercepted by the plugin gate")
        const result = await harness.runOpencode({
          title: "Strict debug gate",
          message: `[e2e_trace_id:strict-debug-write] [llm_request_id:${requestId}] /sp-debug 修复失败测试`,
        })

        expect(result.code).toBe(0)
        log.verify("OpenCode exited successfully after receiving the blocked write result")

        log.step("Verify tool error returned to the model", "the third provider request should contain the root_cause_found gate error")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual([requestId, requestId, requestId])
        expect(JSON.stringify(requests[2]?.body)).toContain("root_cause_found gate is required before repair writes")
        expect(await harness.mock.pending()).toEqual([])
        log.verify("blocked write error was visible to the next model turn")

        log.step("Verify state stayed unapproved", "debug workflow exists but root_cause_found and root_cause artifact remain absent")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("debug")
        expect(state?.gates.root_cause_found).not.toBe(true)
        expect(harness.readArtifact("root_cause")).toBeNull()
        log.verify("strict debug gate prevented root cause state from being fabricated")
      },
    )
  }, 30_000)

  test("records a full feature lifecycle from design through fresh verification", async () => {
    await e2eLog.scenario(
      "feature full lifecycle",
      "Record design/spec, plan, red test, implementation, reviews, and fresh verification in one long workflow.",
      async (log) => {
        log.step("Create isolated OpenCode harness", "default guided config should allow the long feature lifecycle to record evidence")
        harness = await createOpencodeE2EHarness()
        const requestId = "feature-full-lifecycle"

        log.step("Register lifecycle mock responses", "six model turns should route, record four evidence groups, then finish")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-design 增加批量任务运行视图",
            command: "/sp-design",
          }),
          toolCall(requestId, "sp_record", {
            event: "design",
            status: "passed",
            summary: "The UI contract, empty states, and batch retry behavior are documented.",
            gates: {
              spec_written: true,
              design_approved: true,
            },
            artifacts: {
              spec: [
                "# Batch task run view",
                "- Shows queued, running, failed, and completed task groups.",
                "- Keeps retry and cancel controls disabled until a task is selected.",
                "- Empty state explains how to start a batch run.",
              ].join("\n"),
            },
          }),
          toolCall(requestId, "sp_record", {
            event: "plan",
            status: "passed",
            summary: "The plan splits state loading, grouped rendering, retry handling, and regression tests.",
            gates: {
              plan_written: true,
            },
            artifacts: {
              plan: [
                "# Implementation plan",
                "1. Add task grouping selector.",
                "2. Render status sections with stable keys.",
                "3. Add retry and cancel action tests.",
              ].join("\n"),
            },
            task_graph: {
              tasks: [
                { id: "task-state", title: "State loading", summary: "Load task run state.", depends_on: [], files: ["src/task-run-view.ts"] },
                { id: "task-actions", title: "Retry actions", summary: "Add retry and cancel actions.", depends_on: ["task-state"], files: ["src/task-run-view.ts"] },
              ],
            },
          }),
          toolCall(requestId, "sp_record", {
            event: "implementation",
            status: "passed",
            summary: "A failing UI test was added before implementation and the spec review passed.",
            gates: {
              red_test_seen: true,
              implementation_done: true,
              spec_review_passed: true,
            },
            artifacts: {
              red_test_log: "FAIL task-run-view.test.ts: retry button is disabled until task selection.",
              patch_summary: "Implemented grouped status rendering and retry/cancel actions.",
              spec_review: "Spec review passed: behavior matches the documented UI contract.",
            },
          }),
          toolCall(requestId, "sp_record", {
            event: "verification",
            status: "passed",
            summary: "Code review passed and the e2e verification command completed after the final change.",
            gates: {
              code_review_passed: true,
              verification_fresh: true,
            },
            artifacts: {
              code_review: "No blocking issues found in grouped rendering, actions, or tests.",
              verification_log: "bun test task-run-view.test.ts && bun run test:e2e passed.",
            },
          }),
          textResponse(requestId, "feature lifecycle recorded"),
        ])

        log.step("Run opencode", "the full lifecycle should complete through repeated sp_record tool calls")
        const result = await harness.runOpencode({
          title: "Feature lifecycle",
          timeoutMs: 60_000,
          message: `[e2e_trace_id:feature-full-lifecycle] [llm_request_id:${requestId}] /sp-design 增加批量任务运行视图`,
        })

        expect(result.code).toBe(0)
        expect(result.error).toBeUndefined()
        log.verify("OpenCode exited successfully after all lifecycle turns")

        log.step("Verify mock provider traffic", "six calls should consume the same request_id without pending expectations")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual(Array(6).fill(requestId))
        expect(await harness.mock.pending()).toEqual([])
        log.verify("all lifecycle expectations were consumed in order")

        log.step("Verify final lifecycle state", "all major gates should be true and history should preserve the node sequence")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("design")
        expect(state?.phase).toBe("verification-passed")
        expect(state?.gates).toMatchObject({
          spec_written: true,
          design_approved: true,
          plan_written: true,
          red_test_seen: true,
          implementation_done: true,
          spec_review_passed: true,
          code_review_passed: true,
          verification_fresh: true,
        })
        expect(state?.history.map((entry) => entry.event)).toEqual([
          "created",
          "design",
          "plan",
          "implementation",
          "verification",
        ])
        log.verify("lifecycle state has the expected mode, phase, gates, and history")

        log.step("Verify lifecycle artifacts", "spec, plan, red test log, and verification log should be persisted")
        expect(harness.readArtifact("spec")).toContain("Batch task run view")
        expect(harness.readArtifact("plan")).toContain("Implementation plan")
        expect(harness.readArtifact("red_test_log")).toContain("FAIL task-run-view.test.ts")
        expect(harness.readArtifact("verification_log")).toContain("bun run test:e2e passed")
        log.verify("all sampled lifecycle artifacts contain the expected evidence")
      },
    )
  }, 70_000)

  test("surfaces missing artifact validation and then recovers with a valid record", async () => {
    await e2eLog.scenario(
      "record validation recovery",
      "Reject a gate update without its required artifact, then recover by recording the artifact.",
      async (log) => {
        log.step("Create isolated OpenCode harness", "default config should still enforce sp_record artifact validation")
        harness = await createOpencodeE2EHarness()
        const requestId = "record-validation-recovery"

        log.step("Register recovery mock responses", "first sp_record omits plan, second sp_record attaches plan")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-plan 拆解重试调度器改造",
            command: "/sp-plan",
          }),
          toolCall(requestId, "sp_record", {
            event: "plan",
            status: "passed",
            summary: "This intentionally omits the plan artifact so validation should fail.",
            gates: {
              plan_written: true,
            },
          }),
          toolCall(requestId, "sp_record", {
            event: "plan",
            status: "passed",
            summary: "The plan artifact is now attached with the gate update.",
            gates: {
              plan_written: true,
            },
            artifacts: {
              plan: "Plan: add retry queue fixtures, persist attempt count, then verify retry ordering.",
            },
          }),
          textResponse(requestId, "record validation recovered"),
        ])

        log.step("Run opencode", "the failed record should be returned to the model before the recovery record")
        const result = await harness.runOpencode({
          title: "Record validation recovery",
          timeoutMs: 60_000,
          message: `[e2e_trace_id:record-validation-recovery] [llm_request_id:${requestId}] /sp-plan 拆解重试调度器改造`,
        })

        expect(result.code).toBe(0)
        log.verify("OpenCode exited successfully after validation recovery")

        log.step("Verify validation error propagation", "the next provider request should include the missing plan artifact error")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual(Array(4).fill(requestId))
        expect(JSON.stringify(requests[2]?.body)).toContain("plan_written requires plan artifact")
        expect(await harness.mock.pending()).toEqual([])
        log.verify("missing artifact error was visible before the valid retry")

        log.step("Verify recovered state", "only the successful plan record should appear in state history")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("plan")
        expect(state?.phase).toBe("plan-complete")
        expect(state?.gates.plan_written).toBe(true)
        expect(state?.history.map((entry) => entry.event)).toEqual(["created", "plan"])
        expect(harness.readArtifact("plan")).toContain("persist attempt count")
        log.verify("plan gate and artifact were persisted after the valid retry")
      },
    )
  }, 70_000)

  test("rejects completion before fresh verification and accepts it after verification evidence", async () => {
    await e2eLog.scenario(
      "completion verification gate",
      "Reject a done record before fresh verification, then accept done after verification evidence is recorded.",
      async (log) => {
        log.step("Create isolated OpenCode harness", "verify-finish workflow should enforce completion evidence")
        harness = await createOpencodeE2EHarness()
        const requestId = "completion-verification-gate"

        log.step("Register completion mock responses", "done should fail first, verified should open the gate, done should pass after that")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-verify-finish 完成调度器修复",
            command: "/sp-verify-finish",
          }),
          toolCall(requestId, "sp_record", {
            event: "finish",
            status: "passed",
            summary: "This completion should be rejected because fresh verification is missing.",
          }),
          toolCall(requestId, "sp_record", {
            event: "verification",
            status: "passed",
            summary: "The verification was rerun after the latest change.",
            gates: {
              verification_fresh: true,
            },
            artifacts: {
              verification_log: "bun test retry-scheduler.test.ts passed after the final patch.",
            },
          }),
          toolCall(requestId, "sp_record", {
            event: "finish",
            status: "passed",
            summary: "Completion is now allowed because verification_fresh is recorded.",
            artifacts: {
              finish_note: "Ready to finish after fresh verification.",
            },
          }),
          textResponse(requestId, "completion accepted after verification"),
        ])

        log.step("Run opencode", "the workflow should recover after the first completion rejection")
        const result = await harness.runOpencode({
          title: "Completion verification gate",
          timeoutMs: 60_000,
          message: `[e2e_trace_id:completion-verification-gate] [llm_request_id:${requestId}] /sp-verify-finish 完成调度器修复`,
        })

        expect(result.code).toBe(0)
        log.verify("OpenCode exited successfully after verification and completion")

        log.step("Verify completion error propagation", "the failed done record should return verification_fresh guidance to the model")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual(Array(5).fill(requestId))
        expect(JSON.stringify(requests[2]?.body)).toContain("verification_fresh is required before completion records")
        expect(await harness.mock.pending()).toEqual([])
        log.verify("completion rejection was visible before the verification retry")

        log.step("Verify completed state", "history should include only successful verified and done records")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("verify-finish")
        expect(state?.phase).toBe("finished")
        expect(state?.gates.verification_fresh).toBe(true)
        expect(state?.history.map((entry) => entry.event)).toEqual(["created", "verification", "finish"])
        expect(harness.readArtifact("verification_log")).toContain("retry-scheduler.test.ts passed")
        log.verify("completion was accepted only after verification_fresh and verification_log")
      },
    )
  }, 70_000)

  test("keeps an active waiting workflow when a later request asks for a different mode", async () => {
    await e2eLog.scenario(
      "active waiting reroute",
      "Keep a waiting debug workflow active even when a later route request looks like feature implementation.",
      async (log) => {
        log.step("Create isolated OpenCode harness", "routeWorkflow should see current waiting state before classifying the new request")
        harness = await createOpencodeE2EHarness()
        const requestId = "active-waiting-reroute"

        log.step("Register reroute mock responses", "debug route records waiting-review, then asks sp_route for an implementation-looking request")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-debug 修复间歇性失败",
            command: "/sp-debug",
          }),
          toolCall(requestId, "sp_record", {
            event: "debug",
            status: "needs_user",
            summary: "The retry cache is shared across two tests and needs review before mutation.",
            gates: {
              root_cause_found: true,
            },
            artifacts: {
              root_cause: "Retry cache state leaks between tests when the fixture is reused.",
            },
            question: {
              prompt: "Review the root cause before repair writes?",
            },
          }),
          toolCall(requestId, "sp_route", {
            request: "现在直接实现一个新的批量运行功能",
          }),
          textResponse(requestId, "active workflow preserved"),
        ])

        log.step("Run opencode", "the second route call should return active waiting workflow instead of starting a feature run")
        const result = await harness.runOpencode({
          title: "Active waiting reroute",
          timeoutMs: 60_000,
          message: `[e2e_trace_id:active-waiting-reroute] [llm_request_id:${requestId}] /sp-debug 修复间歇性失败`,
        })

        expect(result.code).toBe(0)
        log.verify("OpenCode exited successfully after the active-state route check")

        log.step("Verify route decision returned to model", "the final provider request should contain active workflow is waiting")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual(Array(4).fill(requestId))
        expect(JSON.stringify(requests[3]?.body)).toContain("active workflow is waiting in waiting-user")
        expect(await harness.mock.pending()).toEqual([])
        log.verify("second route preserved the waiting debug workflow")

        log.step("Verify current workflow was not overwritten", "mode and goal should still point to the original debug workflow")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("debug")
        expect(state?.phase).toBe("waiting-user")
        expect(state?.goal).toContain("/sp-debug")
        expect(state?.history.map((entry) => entry.event)).toEqual(["created", "debug"])
        expect(harness.readArtifact("root_cause")).toContain("Retry cache state leaks")
        log.verify("debug waiting state and root cause artifact survived the later implementation request")
      },
    )
  }, 70_000)

  test("enforces execute workflow order from plan gate to red-test gate", async () => {
    await e2eLog.scenario(
      "execute gate order",
      "In strict execute mode, block production writes before plan evidence and again before red-test evidence.",
      async (log) => {
        log.step("Create strict execute harness", "mode=strict and tdd=strict should block writes at both execute gates")
        harness = await createOpencodeE2EHarness({
          workflowConfig: {
            mode: "strict",
            tdd: "strict",
          },
        })
        const requestId = "execute-gate-order"

        log.step("Register execute mock responses", "write before plan should fail, plan should pass, write before red test should fail")
        await harness.mock.expect([
          toolCall(requestId, "sp_route", {
            request: "/sp-execute 实现批量任务视图",
            command: "/sp-execute",
          }),
          toolCall(requestId, "write", {
            filePath: "src/batch-task-view.ts",
            content: "export const batchTaskView = true\n",
          }),
          toolCall(requestId, "sp_record", {
            event: "plan",
            status: "passed",
            summary: "A concrete execution plan is recorded after the first gate rejection.",
            gates: {
              plan_written: true,
            },
            artifacts: {
              plan: "Plan: add failing view test, implement grouped rendering, run e2e verification.",
            },
          }),
          toolCall(requestId, "write", {
            filePath: "src/batch-task-view.ts",
            content: "export const batchTaskView = true\n",
          }),
          toolCall(requestId, "sp_record", {
            event: "red-test",
            status: "passed",
            summary: "A failing test now proves the intended behavior before production writes.",
            gates: {
              red_test_seen: true,
            },
            artifacts: {
              red_test_log: "FAIL batch-task-view.test.ts: renders queued and failed groups separately.",
            },
          }),
          textResponse(requestId, "execute gates enforced"),
        ])

        log.step("Run opencode", "the tool gate should produce two separate write-blocking errors")
        const result = await harness.runOpencode({
          title: "Execute gate order",
          timeoutMs: 60_000,
          message: `[e2e_trace_id:execute-gate-order] [llm_request_id:${requestId}] /sp-execute 实现批量任务视图`,
        })

        expect(result.code).toBe(0)
        log.verify("OpenCode exited successfully after strict execute gate recovery")

        log.step("Verify ordered gate errors", "provider requests after each blocked write should contain the expected gate reason")
        const requests = await harness.mock.requests()
        expect(requests.map((request) => request.request_id)).toEqual(Array(6).fill(requestId))
        expect(JSON.stringify(requests[2]?.body)).toContain("plan_written gate is required before executing tasks")
        expect(JSON.stringify(requests[4]?.body)).toContain("red_test_seen gate is required before production code writes")
        expect(await harness.mock.pending()).toEqual([])
        log.verify("plan gate fired before TDD gate, and both errors reached the model")

        log.step("Verify partial execute state", "plan and red_test gates should be true while implementation_done remains unset")
        const state = harness.readWorkflowState()
        expect(state?.mode).toBe("execute")
        expect(state?.phase).toBe("red-test-recorded")
        expect(state?.gates.plan_written).toBe(true)
        expect(state?.gates.red_test_seen).toBe(true)
        expect(state?.gates.implementation_done).not.toBe(true)
        expect(harness.readArtifact("plan")).toContain("add failing view test")
        expect(harness.readArtifact("red_test_log")).toContain("batch-task-view.test.ts")
        log.verify("execute state records only the proven gates and evidence artifacts")
      },
    )
  }, 70_000)
})

function toolCall(requestId: string, name: string, args: Record<string, unknown>): MockLlmExpectation {
  return {
    request_id: requestId,
    response: {
      type: "tool_call",
      name,
      arguments: args,
    },
  }
}

function textResponse(requestId: string, content: string): MockLlmExpectation {
  return {
    request_id: requestId,
    response: {
      type: "text",
      content,
    },
  }
}
