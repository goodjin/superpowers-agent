import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, test } from "bun:test"
import { createProjectStore } from "../src/state/store"
import { createNextTool } from "../src/tools/sp-next"
import { createRecordTool } from "../src/tools/sp-record"
import { createRouteTool } from "../src/tools/sp-route"

describe("sp_route tool", () => {
  test("returns a proposal for explicit slash commands without starting a run", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-route-tool-"))
    try {
      const store = createProjectStore(project)
      const route = createRouteTool(store)

      await route.execute(
        {
          request: "/sp-debug fix failing tests",
          command: "/sp-debug",
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

      expect(store.readCurrent()).toBeNull()
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})

describe("sp_record tool", () => {
  test("rejects control-plane fields from model output", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-record-tool-"))
    try {
      const store = createProjectStore(project)
      store.start({ session: "session-1", mode: "verify-finish", goal: "verify work" })
      const record = createRecordTool(store)

      await expect(
        record.execute(
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

describe("sp_next tool", () => {
  test("reports draft planning runs as review_plan_and_confirm_start", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-next-tool-"))
    try {
      const store = createProjectStore(project)
      store.prepareRun({
        workflow: "feature",
        entrypoint: "feature",
        goal: "Add workflow gates",
        request: "# Request\n\nAdd workflow gates.",
        proposal: "# Proposal\n\nPrepare feature workflow.",
        parentSessionID: "session-main",
      })
      store.recordNodeResult({
        input: {
          event: "plan",
          status: "passed",
          summary: "Plan ready.",
          artifacts: { plan: "# Plan" },
          gates: { plan_written: true },
        },
      })

      const next = createNextTool(store)
      const output = await next.execute(
        {},
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
      expect(result.activation).toBe("draft")
      expect(result.controller_action).toBe("review_plan_and_confirm_start")
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
