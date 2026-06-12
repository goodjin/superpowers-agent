import { describe, expect, test } from "bun:test"
import { applyRecord, createInitialState } from "../src/state/transitions"

describe("applyRecord", () => {
  test("accepts root cause gate when matching artifact is recorded", () => {
    const state = createInitialState({
      id: "run-1",
      project: "/repo",
      session: "session-1",
      mode: "debug",
      goal: "fix failing tests",
    })

    const next = applyRecord(state, {
      event: "debug",
      status: "passed",
      summary: "Root cause found.",
      artifacts: { root_cause: "The parser treats protocol JSON as text." },
      gates: { root_cause_found: true },
    })

    expect(next.gates.root_cause_found).toBe(true)
    expect(next.artifacts.root_cause).toBe("root_cause.md")
    expect(next.history.at(-1)?.event).toBe("debug")
    expect(next.history.at(-1)?.status).toBe("passed")
  })

  test("rejects evidence-backed gate without matching artifact", () => {
    const state = createInitialState({
      id: "run-1",
      project: "/repo",
      session: "session-1",
      mode: "debug",
      goal: "fix failing tests",
    })

    expect(() =>
      applyRecord(state, {
        event: "debug",
        status: "passed",
        summary: "Root cause found.",
        gates: { root_cause_found: true },
      }),
    ).toThrow("root_cause")
  })

  test("rejects setting too many gates in a single record", () => {
    const state = createInitialState({
      id: "run-1",
      project: "/repo",
      session: "session-1",
      mode: "execute",
      goal: "implement the plan",
    })

    expect(() =>
      applyRecord(state, {
        event: "implementation",
        status: "passed",
        summary: "Bulk update.",
        gates: {
          design_approved: true,
          spec_written: true,
          plan_written: true,
          root_cause_found: true,
        },
        artifacts: {
          spec: "spec",
          plan: "plan",
          root_cause: "root cause",
        },
      }),
    ).toThrow("too many gates")
  })

  test("rejects completion record without fresh verification", () => {
    const state = createInitialState({
      id: "run-1",
      project: "/repo",
      session: "session-1",
      mode: "verify-finish",
      goal: "finish work",
    })

    expect(() =>
      applyRecord(state, {
        event: "finish",
        status: "passed",
        summary: "Ready to finish.",
        artifacts: { finish_note: "Implemented plugin MVP." },
      }),
    ).toThrow("verification_fresh")
  })
})
