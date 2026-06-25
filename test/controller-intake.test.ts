import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildWorkflowProposal } from "../src/controller/proposal"
import { prepareStartRun } from "../src/controller/intake"
import { createProjectStore } from "../src/state/store"
import { createPrepareTool } from "../src/tools/sp-prepare"
import { createStartTool } from "../src/tools/sp-start"

const toolContext = {
  sessionID: "session-main",
  messageID: "message-1",
  agent: "super-agent",
  directory: "/repo",
  worktree: "/repo",
  abort: new AbortController().signal,
  metadata() {},
  async ask() {},
}

describe("workflow proposal", () => {
  test("builds a feature proposal from an implementation request", () => {
    const proposal = buildWorkflowProposal({
      request: "Add workflow gates",
      routeHint: "feature",
      existingState: null,
    })

    expect(proposal.workflow).toBe("feature")
    expect(proposal.entrypoint).toBe("feature")
    expect(proposal.requires_confirmation).toBe(true)
    expect(proposal.markdown).toContain("feature workflow")
    expect(proposal.next_action).toBe("confirm_prepare")
  })

  test("builds a resume proposal when an active run exists", () => {
    const proposal = buildWorkflowProposal({
      request: "continue",
      existingState: {
        id: "run-1",
        project: "/repo",
        session: "session-main",
        parent_session_id: "session-main",
        activation: "active",
        workflow: "feature",
        entrypoint: "feature",
        limited_context: false,
        mode: "design",
        phase: "plan-complete",
        current_phase: "plan-complete",
        status: "running",
        goal: "Add workflow gates",
        created_at: "2026-06-14T00:00:00.000Z",
        updated_at: "2026-06-14T00:00:00.000Z",
        gates: { plan_written: true },
        artifacts: {},
        node_runs: [],
        history: [],
      },
    })

    expect(proposal.workflow).toBe("feature")
    expect(proposal.next_action).toBe("confirm_resume")
    expect(proposal.markdown).toContain("plan-complete")
  })
})

describe("controller intake", () => {
  test("prepares start input with request and proposal markdown", () => {
    const proposal = buildWorkflowProposal({
      request: "Add workflow gates",
      routeHint: "feature",
      existingState: null,
    })

    const start = prepareStartRun({
      request: "Add workflow gates",
      proposal,
      parentSessionID: "session-main",
    })

    expect(start.workflow).toBe("feature")
    expect(start.request).toContain("Add workflow gates")
    expect(start.proposal).toContain("feature workflow")
  })
})

describe("sp_prepare and sp_start tools", () => {
  test("sp_start reports that a confirmed workflow run started", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-start-progress-"))
    try {
      const store = createProjectStore(project)
      const progress: Array<{ stage: string; message: string }> = []
      const start = createStartTool(store, undefined, {
        async report(input) {
          progress.push({ stage: input.stage, message: input.message })
        },
      })

      await start.execute(
        {
          request: "Add workflow gates",
          workflow: "feature",
          entrypoint: "feature",
          proposal: "# Proposal\n\nRun feature workflow.",
        },
        toolContext,
      )

      expect(progress).toEqual([
        {
          stage: "run_started",
          message: "feature workflow run started from feature.",
        },
      ])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("sp_prepare creates a prepared workflow without dispatching node work", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-prepare-"))
    try {
      const store = createProjectStore(project)
      const prepare = createPrepareTool(
        store,
        {
          async dispatch() {
            return {
              action: "create_session",
              session_id: "session-planner",
              task_markdown: "# Planner task",
            }
          },
        },
      )

      const output = await prepare.execute(
        {
          request: "Add workflow gates",
          workflow: "feature",
          entrypoint: "feature",
          proposal: "# Proposal\n\nPrepare feature workflow.",
        },
        toolContext,
      )

      const result = JSON.parse(toolOutput(output))
      expect(result.state.activation).toBe("draft")
      expect(result.state.current_phase).toBe("plan")
      expect(store.readCurrent()?.node_runs).toEqual([])
      expect(result.next).toContain("sp_start")
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("sp_start creates a run and writes request, proposal, and changelog files", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-start-"))
    try {
      const store = createProjectStore(project)
      const start = createStartTool(store)

      const output = await start.execute(
        {
          request: "Add workflow gates",
          workflow: "feature",
          entrypoint: "feature",
          proposal: "# Proposal\n\nRun feature workflow.",
        },
        toolContext,
      )

      const state = JSON.parse(toolOutput(output)).state
      const runRoot = join(store.root, "runs", state.id)
      expect(store.readCurrent()?.id).toBe(state.id)
      expect(readFileSync(join(runRoot, "request.md"), "utf8")).toContain("Add workflow gates")
      expect(readFileSync(join(runRoot, "proposal.md"), "utf8")).toContain("Run feature workflow")
      expect(readFileSync(join(runRoot, "changelog.md"), "utf8")).toContain("created")
      expect(existsSync(join(runRoot, "artifacts"))).toBe(true)
      expect(existsSync(join(runRoot, "nodes"))).toBe(true)
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("sp_start activates a prepared run and dispatches approved tasks", async () => {
    const project = mkdtempSync(join(tmpdir(), "sp-start-activate-"))
    try {
      const store = createProjectStore(project)
      const prepared = store.prepareRun({
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
          task_graph: {
            tasks: [{ id: "T1", title: "Gate types", summary: "Add gate types", depends_on: [] }],
          },
        },
      })

      const start = createStartTool(
        store,
        {
          async dispatch() {
            return {
              action: "create_session",
              session_id: "session-impl",
              task_markdown: "# Implement task",
            }
          },
        },
      )

      const output = await start.execute(
        {
          run_id: prepared.id,
        },
        toolContext,
      )

      const result = JSON.parse(toolOutput(output))
      expect(result.state.activation).toBe("active")
      expect(result.dispatches).toEqual([
        {
          action: "create_session",
          phase: "implement",
          agent: "sp-implementer",
          task_id: "T1",
          session_id: "session-impl",
        },
      ])
      expect(store.readCurrent()?.node_runs.some((run) => run.agent === "sp-implementer")).toBe(true)
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
