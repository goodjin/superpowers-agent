import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { createProjectStore } from "../src/state/store"
import { createTools } from "../src/tools"
import { createCancelTool } from "../src/tools/sp-cancel"
import { createReportTool } from "../src/tools/sp-report"
import { createStatusTool } from "../src/tools/sp-status"

describe("public Superpowers tools", () => {
  test("exposes the simplified workflow tool set", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-tools-registry-"))
    try {
      const store = createProjectStore(project)
      expect(Object.keys(createTools(store)).sort()).toEqual([
        "sp_cancel",
        "sp_prepare",
        "sp_report",
        "sp_start",
        "sp_status",
      ])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

describe("sp_status tool", () => {
  test("returns the current workflow and can focus a task", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-status-tool-"))
    try {
      const store = createProjectStore(project)
      store.startRun({
        workflow: "feature",
        entrypoint: "feature",
        goal: "Add workflow gates",
        request: "# Request",
        proposal: "# Proposal",
        parentSessionID: "session-main",
      })
      store.recordNodeResult({
        input: {
          event: "plan",
          status: "passed",
          summary: "Plan ready.",
          artifacts: { plan: "# Plan" },
          gates: { plan_written: true },
          task_graph: {
            tasks: [{ id: "T1", title: "Gate types", summary: "Add gate types", depends_on: [] }],
          },
        },
      })
      const status = createStatusTool(store)

      const output = await status.execute(
        {
          task_id: "T1",
        },
        {
          sessionID: "session-1",
          messageID: "message-1",
          agent: "super-agent",
          directory: project,
          worktree: project,
          abort: new AbortController().signal,
          metadata() {},
          async ask() {},
        },
      )

      const result = JSON.parse(toolOutput(output))
      expect(result.source).toBe("runtime_current")
      expect(result.current.task_graph.tasks[0].id).toBe("T1")
      expect(result.task.task.id).toBe("T1")
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

describe("sp_report tool", () => {
  test("rejects control-plane fields from model output", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-report-tool-"))
    try {
      const store = createProjectStore(project)
      store.start({ session: "session-1", mode: "verify-finish", goal: "verify work" })
      const report = createReportTool(store, {
        async dispatch() {
          throw new Error("unexpected dispatch")
        },
      })

      await expect(
        report.execute(
          {
            event: "verification",
            status: "failed",
            summary: "Tests failed.",
            next_action: "retry",
          },
          {
            sessionID: "session-1",
            messageID: "message-1",
            agent: "sp-verifier",
            directory: project,
            worktree: project,
            abort: new AbortController().signal,
            metadata() {},
            async ask() {},
          },
        ),
      ).rejects.toThrow()
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

describe("sp_cancel tool", () => {
  test("cancels the current workflow and preserves it for status/history queries", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-cancel-tool-"))
    try {
      const store = createProjectStore(project)
      const state = store.prepareRun({
        workflow: "feature",
        entrypoint: "feature",
        goal: "Add workflow gates",
        request: "# Request\n\nAdd workflow gates.",
        proposal: "# Proposal\n\nPrepare feature workflow.",
        parentSessionID: "session-main",
      })

      const cancel = createCancelTool(store)
      const output = await cancel.execute(
        {
          workflow_id: state.id,
          reason: "User chose to stop.",
        },
        {
          sessionID: "session-main",
          messageID: "message-1",
          agent: "super-agent",
          directory: project,
          worktree: project,
          abort: new AbortController().signal,
          metadata() {},
          async ask() {},
        },
      )
      const result = JSON.parse(typeof output === "string" ? output : String(output))
      expect(result.state.status).toBe("canceled")
      expect(store.readRun(state.id)?.history.at(-1)?.event).toBe("workflow_canceled")
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

function toolOutput(value: unknown): string {
  if (typeof value === "string") return value
  if (value && typeof value === "object" && "output" in value) return String((value as { output: unknown }).output)
  return String(value)
}
