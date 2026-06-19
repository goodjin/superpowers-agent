import { describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createNodeProgressStore, progressEntryFromEvent } from "../src/progress/node-progress"
import { createProjectStore } from "../src/state/store"

describe("node progress event capture", () => {
  test("records tool updates for a known child session", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-node-progress-"))
    try {
      const workflow = createProjectStore(project)
      workflow.startRun({
        workflow: "feature",
        entrypoint: "execute",
        goal: "Implement task",
        request: "# Request",
        proposal: "# Proposal",
        parentSessionID: "session-main",
      })
      workflow.addNodeRun({
        phase: "implement",
        agent: "sp-implementer",
        primary_skill: "superpowers-test-driven-development",
        session_id: "session-child",
        task_id: "T1",
        task_markdown: "# Task",
      })
      const state = workflow.readCurrent()
      if (!state) throw new Error("missing state")

      const entry = progressEntryFromEvent(
        state,
        {
          type: "message.part.updated",
          properties: {
            part: {
              id: "part-tool",
              sessionID: "session-child",
              messageID: "message-1",
              type: "tool",
              callID: "call-1",
              tool: "bash",
              state: {
                status: "running",
                input: { cmd: "bun run test" },
                time: { start: 1 },
              },
            },
          },
        },
        "2026-06-19T00:00:00.000Z",
      )

      expect(entry).toMatchObject({
        at: "2026-06-19T00:00:00.000Z",
        kind: "tool_running",
        node_id: "001-implement-T1",
        session_id: "session-child",
        agent: "sp-implementer",
        phase: "implement",
        task_id: "T1",
        summary: "bash running",
      })

      const progress = createNodeProgressStore(project)
      progress.append(state.id, entry!)
      expect(progress.readNode(state.id, "001-implement-T1")).toEqual([entry!])
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("ignores events from sessions outside the active workflow", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-node-progress-ignore-"))
    try {
      const workflow = createProjectStore(project)
      const state = workflow.startRun({
        workflow: "feature",
        entrypoint: "execute",
        goal: "Implement task",
        request: "# Request",
        proposal: "# Proposal",
        parentSessionID: "session-main",
      })

      const entry = progressEntryFromEvent(
        state,
        {
          type: "session.status",
          properties: {
            sessionID: "unrelated-session",
            status: { type: "busy" },
          },
        },
        "2026-06-19T00:00:00.000Z",
      )

      expect(entry).toBeNull()
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })

  test("records session errors with a readable summary", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-node-progress-error-"))
    try {
      const workflow = createProjectStore(project)
      workflow.startRun({
        workflow: "debug",
        entrypoint: "debug",
        goal: "Find root cause",
        request: "# Request",
        proposal: "# Proposal",
        parentSessionID: "session-main",
      })
      workflow.addNodeRun({
        phase: "debug",
        agent: "sp-debugger",
        primary_skill: "superpowers-systematic-debugging",
        session_id: "session-debug",
        task_markdown: "# Debug task",
      })
      const state = workflow.readCurrent()
      if (!state) throw new Error("missing state")

      const entry = progressEntryFromEvent(
        state,
        {
          type: "session.error",
          properties: {
            sessionID: "session-debug",
            error: {
              name: "ProviderAuthError",
              data: {
                providerID: "test-provider",
                message: "missing API key",
              },
            },
          },
        },
        "2026-06-19T00:00:00.000Z",
      )

      expect(entry).toMatchObject({
        kind: "session_error",
        node_id: "001-debug",
        summary: "session error: missing API key",
      })
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
