import { describe, expect, test } from "bun:test"
import {
  buildProgressPanelViewModel,
  renderCompactProgressText,
  renderProgressPanelText,
  renderRunningSessionsText,
  renderSidebarProgressText,
  renderWorkflowStatusText,
} from "../src/tui/progress-panel"
import type { NodeProgressEntry } from "../src/progress/node-progress"
import type { WorkflowState } from "../src/state/types"

describe("progress panel view model", () => {
  test("renders an empty state when no workflow is active", () => {
    const model = buildProgressPanelViewModel(null, {}, {})

    expect(model).toEqual({
      active: false,
      title: "Superpowers Progress",
      summary: "No active Superpowers workflow.",
      rows: [],
      tasks: [],
    })
    expect(renderProgressPanelText(model)).toContain("No active Superpowers workflow.")
  })

  test("summarizes active node runs with latest stored progress and live session status", () => {
    const state: WorkflowState = {
      id: "run-1",
      project: "/repo",
      session: "session-main",
      parent_session_id: "session-main",
      activation: "active",
      workflow: "feature",
      entrypoint: "execute",
      limited_context: true,
      mode: "execute",
      phase: "implement",
      current_phase: "implement",
      status: "running",
      goal: "Implement feature",
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
      gates: {},
      artifacts: {},
      task_graph: {
        tasks: [
          {
            id: "T1",
            title: "Implement progress surface",
            summary: "Show progress in TUI",
            depends_on: [],
          },
          {
            id: "T2",
            title: "Document progress surface",
            summary: "Update module docs",
            depends_on: ["T1"],
          },
        ],
      },
      node_runs: [
        {
          id: "001-implement-T1",
          task_id: "T1",
          phase: "implement",
          agent: "sp-implementer",
          primary_skill: "superpowers-test-driven-development",
          session_id: "session-child",
          status: "running",
          attempts: 1,
          started_at: "2026-06-19T00:00:00.000Z",
        },
      ],
      history: [{ at: "2026-06-19T00:00:00.000Z", event: "created", to: "feature" }],
    }
    const latest: NodeProgressEntry = {
      at: "2026-06-19T00:01:00.000Z",
      kind: "tool_running",
      session_id: "session-child",
      node_id: "001-implement-T1",
      agent: "sp-implementer",
      phase: "implement",
      task_id: "T1",
      summary: "bash running",
      detail: "bun run test",
    }

    const model = buildProgressPanelViewModel(
      state,
      {
        "001-implement-T1": [latest],
      },
      {
        "session-child": "busy",
      },
      new Date("2026-06-19T00:01:05.000Z"),
    )

    expect(model).toMatchObject({
      active: true,
      title: "Superpowers Progress",
      summary: "feature run run-1 is running at implement.",
      workflow: "feature",
      status: "running",
      current_phase: "implement",
      tasks: [
        {
          task_id: "T1",
          title: "Implement progress surface",
          status: "running",
        },
        {
          task_id: "T2",
          title: "Document progress surface",
          status: "pending",
        },
      ],
      rows: [
        {
          node_id: "001-implement-T1",
          task_id: "T1",
          agent: "sp-implementer",
          phase: "implement",
          durable_status: "running",
          activity_status: "active",
          session_id: "session-child",
          live_status: "busy",
          latest_summary: "bash running",
          latest_detail: "bun run test",
        },
      ],
    })
    const text = renderProgressPanelText(model)
    expect(text).toContain("feature run run-1 is running at implement.")
    expect(text).toContain("001-implement-T1")
    expect(text).toContain("bash running")
    expect(renderCompactProgressText(model)).toBe("SP: sp-implementer T1 running/busy - bash running")
    expect(renderCompactProgressText(model, 44)).toBe("SP: sp-implementer T1 running/busy - bash...")
    expect(renderWorkflowStatusText(model)).toBe("SP: feature running@implement | tasks 0/2 done | sessions 1 running")
    expect(renderRunningSessionsText(model)).toContain("sp-implementer T1: busy - bash running")
    expect(renderSidebarProgressText(model)).toBe([
      "SP: feature running@implement | tasks 0/2 done | sessions 1 running",
      "running",
      "sp-implementer T1: running/busy - bash running",
    ].join("\n"))
  })

  test("marks stale running child progress as stalled", () => {
    const state: WorkflowState = {
      id: "run-1",
      project: "/repo",
      session: "session-main",
      parent_session_id: "session-main",
      activation: "active",
      workflow: "feature",
      entrypoint: "execute",
      limited_context: true,
      mode: "execute",
      phase: "implement",
      current_phase: "implement",
      status: "running",
      goal: "Implement feature",
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
      gates: {},
      artifacts: {},
      node_runs: [
        {
          id: "030-acceptance",
          phase: "acceptance",
          agent: "sp-acceptance-reviewer",
          session_id: "session-review",
          status: "running",
          attempts: 1,
          started_at: "2026-06-19T00:00:00.000Z",
        },
      ],
      history: [{ at: "2026-06-19T00:00:00.000Z", event: "created", to: "feature" }],
    }
    const latest: NodeProgressEntry = {
      at: "2026-06-19T00:00:20.000Z",
      kind: "tool_pending",
      session_id: "session-review",
      node_id: "030-acceptance",
      agent: "sp-acceptance-reviewer",
      phase: "acceptance",
      summary: "write pending",
    }

    const model = buildProgressPanelViewModel(
      state,
      { "030-acceptance": [latest] },
      { "session-review": "busy" },
      new Date("2026-06-19T00:01:00.000Z"),
    )

    expect(model.rows[0]?.activity_status).toBe("stalled")
    expect(renderProgressPanelText(model)).toContain("status: running / busy / stalled")
    expect(renderCompactProgressText(model)).toBe("SP: sp-acceptance-reviewer running/busy/stalled - write pending")
    expect(renderWorkflowStatusText(model)).toBe("SP: feature running@implement | nodes 1 | sessions 1 running (1 stalled)")
  })

  test("sidebar progress explains an active workflow before node dispatch", () => {
    const state: WorkflowState = {
      id: "run-1",
      project: "/repo",
      session: "session-main",
      parent_session_id: "session-main",
      activation: "active",
      workflow: "feature",
      entrypoint: "feature",
      limited_context: false,
      mode: "design",
      phase: "intake",
      current_phase: "intake",
      status: "intake",
      goal: "Implement feature",
      created_at: "2026-06-19T00:00:00.000Z",
      updated_at: "2026-06-19T00:00:00.000Z",
      gates: {},
      artifacts: {},
      node_runs: [],
      history: [{ at: "2026-06-19T00:00:00.000Z", event: "created", to: "feature" }],
    }

    const model = buildProgressPanelViewModel(state, {}, {})

    expect(renderSidebarProgressText(model)).toBe([
      "SP: feature intake@intake | nodes 0 | sessions 0 running",
      "waiting for node dispatch",
    ].join("\n"))
  })
})
