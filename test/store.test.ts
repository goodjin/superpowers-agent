import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createProjectStore } from "../src/state/store"

describe("ProjectStore", () => {
  test("persists request, artifacts, task graph, and node record files in the run directory", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-store-"))
    try {
      const store = createProjectStore(project)
      const state = store.start({
        session: "session-1",
        mode: "plan",
        goal: "Build workflow gates",
      })

      expect(readFileSync(join(store.root, "runs", state.id, "request.md"), "utf8")).toContain("Build workflow gates")

      store.record({
        event: "plan",
        status: "passed",
        summary: "Plan written.",
        artifacts: { plan: "# Plan\n\nTask graph below." },
        gates: { plan_written: true },
        task_graph: {
          tasks: [
            { id: "task-a", title: "A", summary: "A", depends_on: [], files: ["src/shared.ts"] },
            { id: "task-b", title: "B", summary: "B", depends_on: [], files: ["src/shared.ts"] },
          ],
        },
      })

      const runRoot = join(store.root, "runs", state.id)
      expect(readFileSync(join(runRoot, "artifacts", "plan.md"), "utf8")).toContain("# Plan")
      expect(readFileSync(join(runRoot, "task_graph.json"), "utf8")).toContain("implicit_depends_on")
      expect(existsSync(join(runRoot, "nodes", "001-plan", "record.json"))).toBe(true)
      expect(readFileSync(join(runRoot, "changelog.md"), "utf8")).toContain("plan")
    } finally {
      rmSync(project, { recursive: true, force: true })
    }
  })
})
