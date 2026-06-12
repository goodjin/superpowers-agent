# Controller Final Architecture Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the current MVP from prompt-led workflow routing to the finalized plugin-led architecture where `super-agent` controls sessions, node agents execute one primary skill, and `sp_record` submits only simplified node results.

**Architecture:** The plugin becomes the control plane. It persists each workflow run under a run directory, owns node session creation/reuse, stores artifacts and state, computes transitions from structured `sp_record` results, serializes review/verify retry loops, and uses OpenCode TUI toast for progress that should not enter model context. Models only execute node tasks and submit markdown artifacts plus small structured status/gate fields.

**Tech Stack:** Bun, TypeScript, `@opencode-ai/plugin`, `@opencode-ai/sdk`, `zod`, `jsonc-parser`, Bun test, OpenCode 1.16.2 isolated e2e runtime.

---

## Spec Source

Primary design source:

- `docs/superpowers/specs/2026-06-11-controller-final-design.md`

This plan supersedes the older MVP plan where relevant:

- `docs/superpowers/plans/2026-06-09-superpowers-controller-mvp.md`

## File Structure

- `src/state/types.ts`: replace mode-centric MVP types with final workflow, node run, task graph, record, artifact, gate, and interaction types.
- `src/state/run-paths.ts`: create canonical run directory and file path helpers.
- `src/state/store.ts`: persist `state.json`, `request.md`, `proposal.md`, `changelog.md`, `task_graph.json`, `artifacts/*.md`, and `nodes/*`.
- `src/state/records.ts`: validate simplified `sp_record`, write node record files, normalize artifacts, and update gates.
- `src/state/task-graph.ts`: normalize task graph and add implicit dependencies for shared writable files.
- `src/router/workflows.ts`: define final workflows and transitions.
- `src/router/transition.ts`: compute next dispatch decisions from state and record results.
- `src/session/adapter.ts`: OpenCode session adapter interface and SDK implementation.
- `src/session/templates.ts`: node task markdown templates.
- `src/session/orchestrator.ts`: create/reuse node sessions and write node task packets.
- `src/ui/progress.ts`: show TUI toasts with fallback logging.
- `src/tools/sp-record.ts`: expose simplified record schema only.
- `src/tools/sp-state.ts`: report final run state shape.
- `src/tools/sp-next.ts`: return controller-facing next dispatch summary, not a node execution prompt.
- `src/agents/index.ts`: rename `superpowers` to `super-agent`, add `sp-investigator`, enforce one primary skill per node.
- `src/router/modes.ts` or replacement: remove `skill-authoring`, remove multi-skill mode definitions.
- `src/commands/index.ts`: command entries route to `super-agent`.
- `assets/skills/`: remove `superpowers-writing-skills` from install set unless kept as unused upstream asset outside default install.
- `test/*.test.ts`: update existing tests and add new tests below.
- `test/session/*.test.ts`: session adapter/orchestrator unit tests with mocks.
- `test/state/*.test.ts`: run persistence and task graph tests.
- `test/router/*.test.ts`: transition and workflow tests.
- `test/e2e/opencode-workflow.test.ts`: update e2e expectations for `super-agent` and `sp-investigator`.
- `README.md`, `README.en.md`: keep aligned with final design.

## Task 1: Final Types and Record Schema

**Files:**
- Modify: `src/state/types.ts`
- Create: `src/state/record-schema.ts`
- Modify: `src/tools/sp-record.ts`
- Test: `test/record-schema.test.ts`

- [ ] **Step 1: Write failing tests for simplified `sp_record` acceptance**

Create `test/record-schema.test.ts` with tests that assert these inputs are accepted:

```ts
import { describe, expect, test } from "bun:test"
import { parseSpRecordInput } from "../src/state/record-schema"

describe("parseSpRecordInput", () => {
  test("accepts a design record with markdown spec artifact", () => {
    const record = parseSpRecordInput({
      event: "design",
      status: "passed",
      summary: "Design completed.",
      artifacts: { spec: "# Spec\n\nDesign details." },
      gates: { design_approved: true, spec_written: true },
    })

    expect(record.event).toBe("design")
    expect(record.status).toBe("passed")
    expect(record.artifacts?.spec).toContain("# Spec")
  })

  test("accepts a needs_user record with a question", () => {
    const record = parseSpRecordInput({
      event: "question",
      status: "needs_user",
      summary: "Need confirmation.",
      question: {
        prompt: "Use strict gates?",
        options: ["guided", "strict"],
      },
    })

    expect(record.question?.prompt).toContain("strict")
  })
})
```

- [ ] **Step 2: Write failing tests rejecting control-plane fields**

Extend `test/record-schema.test.ts`:

```ts
test("rejects model-supplied control-plane fields", () => {
  expect(() =>
    parseSpRecordInput({
      event: "verification",
      status: "failed",
      summary: "Tests failed.",
      next_action: "retry",
    }),
  ).toThrow("Unrecognized")

  expect(() =>
    parseSpRecordInput({
      event: "implementation",
      status: "passed",
      summary: "Done.",
      child_session_id: "ses_123",
    }),
  ).toThrow("Unrecognized")
})
```

- [ ] **Step 3: Verify tests fail**

Run:

```bash
bun test ./test/record-schema.test.ts
```

Expected: fail because `src/state/record-schema.ts` does not exist.

- [ ] **Step 4: Implement final record types**

In `src/state/types.ts`, replace old `WorkflowRecord` shape with final types:

```ts
export type WorkflowKind =
  | "feature"
  | "debug"
  | "plan-only"
  | "review"
  | "verify-finish"
  | "parallel-investigate"

export type WorkflowEntrypoint = WorkflowKind

export type NodeEvent =
  | "intake"
  | "question"
  | "design"
  | "plan"
  | "debug"
  | "red-test"
  | "implementation"
  | "spec-review"
  | "code-review"
  | "verification"
  | "finish"

export type NodeStatus = "passed" | "failed" | "blocked" | "needs_user"

export type ArtifactName =
  | "request"
  | "spec"
  | "plan"
  | "root_cause"
  | "red_test_log"
  | "patch_summary"
  | "spec_review"
  | "code_review"
  | "verification_log"
  | "finish_note"

export type GateName =
  | "request_confirmed"
  | "design_approved"
  | "spec_written"
  | "plan_written"
  | "root_cause_found"
  | "red_test_seen"
  | "implementation_done"
  | "spec_review_passed"
  | "code_review_passed"
  | "verification_fresh"

export type TaskGraph = {
  tasks: Array<{
    id: string
    title: string
    summary: string
    depends_on: string[]
    files?: string[]
    test_commands?: string[]
  }>
}

export type SpRecordInput = {
  event: NodeEvent
  status: NodeStatus
  summary: string
  artifacts?: Partial<Record<ArtifactName, string>>
  gates?: Partial<Record<GateName, boolean>>
  checks?: string
  findings?: string
  question?: {
    prompt: string
    options?: string[]
  }
  task_graph?: TaskGraph
}
```

- [ ] **Step 5: Implement zod parser**

Create `src/state/record-schema.ts` with strict schemas:

```ts
import { z } from "zod"
import type { SpRecordInput } from "./types"

const ArtifactNameSchema = z.enum([
  "request",
  "spec",
  "plan",
  "root_cause",
  "red_test_log",
  "patch_summary",
  "spec_review",
  "code_review",
  "verification_log",
  "finish_note",
])

const GateNameSchema = z.enum([
  "request_confirmed",
  "design_approved",
  "spec_written",
  "plan_written",
  "root_cause_found",
  "red_test_seen",
  "implementation_done",
  "spec_review_passed",
  "code_review_passed",
  "verification_fresh",
])

const TaskGraphSchema = z.object({
  tasks: z.array(
    z.object({
      id: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().min(1),
      depends_on: z.array(z.string()).default([]),
      files: z.array(z.string()).optional(),
      test_commands: z.array(z.string()).optional(),
    }).strict(),
  ),
}).strict()

export const SpRecordInputSchema = z.object({
  event: z.enum([
    "intake",
    "question",
    "design",
    "plan",
    "debug",
    "red-test",
    "implementation",
    "spec-review",
    "code-review",
    "verification",
    "finish",
  ]),
  status: z.enum(["passed", "failed", "blocked", "needs_user"]),
  summary: z.string().min(1),
  artifacts: z.record(ArtifactNameSchema, z.string()).optional(),
  gates: z.record(GateNameSchema, z.boolean()).optional(),
  checks: z.string().optional(),
  findings: z.string().optional(),
  question: z.object({
    prompt: z.string().min(1),
    options: z.array(z.string()).optional(),
  }).strict().optional(),
  task_graph: TaskGraphSchema.optional(),
}).strict()

export function parseSpRecordInput(input: unknown): SpRecordInput {
  return SpRecordInputSchema.parse(input)
}
```

- [ ] **Step 6: Update tool schema**

Modify `src/tools/sp-record.ts` to accept only:

```ts
event
status
summary
artifacts
gates
checks
findings
question
task_graph
```

Remove:

```ts
phase
next
reason
skills_used
```

- [ ] **Step 7: Verify green**

Run:

```bash
bun test ./test/record-schema.test.ts
bun run test
```

Expected: new record schema tests pass; existing tests that still expect old fields may fail and will be updated in later tasks.

## Task 2: Run Directory Persistence

**Files:**
- Create: `src/state/run-paths.ts`
- Modify: `src/state/store.ts`
- Create: `src/state/persistence.ts`
- Test: `test/run-persistence.test.ts`

- [ ] **Step 1: Write failing test for canonical run layout**

Create `test/run-persistence.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createProjectStore } from "../src/state/store"

describe("run persistence", () => {
  test("creates run directory with request, state, proposal, changelog, artifacts, and nodes", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-project-"))
    const store = createProjectStore(project)

    const state = store.startRun({
      workflow: "feature",
      entrypoint: "feature",
      goal: "Add workflow gates",
      request: "# Request\n\nAdd workflow gates.",
      proposal: "# Proposal\n\nfeature workflow",
      parentSessionID: "ses_main",
    })

    const runRoot = join(project, ".opencode", "superpowers", "runs", state.id)
    expect(existsSync(join(runRoot, "state.json"))).toBe(true)
    expect(readFileSync(join(runRoot, "request.md"), "utf8")).toContain("Add workflow gates")
    expect(existsSync(join(runRoot, "proposal.md"))).toBe(true)
    expect(existsSync(join(runRoot, "changelog.md"))).toBe(true)
    expect(existsSync(join(runRoot, "artifacts"))).toBe(true)
    expect(existsSync(join(runRoot, "nodes"))).toBe(true)
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
bun test ./test/run-persistence.test.ts
```

Expected: fail because `startRun` and final layout do not exist.

- [ ] **Step 3: Implement run path helpers**

Create `src/state/run-paths.ts`:

```ts
import { join } from "node:path"

export function superpowersRoot(project: string): string {
  return join(project, ".opencode", "superpowers")
}

export function runRoot(project: string, runID: string): string {
  return join(superpowersRoot(project), "runs", runID)
}

export function runFile(project: string, runID: string, name: string): string {
  return join(runRoot(project, runID), name)
}

export function artifactPath(project: string, runID: string, name: string): string {
  return join(runRoot(project, runID), "artifacts", `${name}.md`)
}

export function nodeRoot(project: string, runID: string, nodeID: string): string {
  return join(runRoot(project, runID), "nodes", nodeID)
}
```

- [ ] **Step 4: Add final WorkflowState shape**

Update `src/state/types.ts` with:

```ts
export type WorkflowState = {
  id: string
  project: string
  parent_session_id: string
  workflow: WorkflowKind
  entrypoint: WorkflowEntrypoint
  limited_context: boolean
  goal: string
  current_phase: string
  status: "intake" | "running" | "waiting_user" | "blocked" | "passed" | "failed"
  created_at: string
  updated_at: string
  gates: Partial<Record<GateName, boolean>>
  artifacts: Partial<Record<ArtifactName, string>>
  node_runs: NodeRun[]
  pending_question?: {
    prompt: string
    options?: string[]
    source_node_id?: string
  }
}

export type NodeRun = {
  id: string
  task_id?: string
  phase: string
  agent: string
  primary_skill?: string
  session_id: string
  status: "running" | "passed" | "failed" | "blocked" | "needs_user"
  attempts: number
  started_at: string
  ended_at?: string
  record_path?: string
}
```

- [ ] **Step 5: Implement `startRun`**

Update `src/state/store.ts`:

```ts
startRun(args: {
  workflow: WorkflowKind
  entrypoint: WorkflowEntrypoint
  goal: string
  request: string
  proposal: string
  parentSessionID: string
}): WorkflowState
```

It must:

- create `.opencode/superpowers/current.json`
- create run directory
- write `state.json`
- write `request.md`
- write `proposal.md`
- write `changelog.md`
- create `artifacts/`
- create `nodes/`

- [ ] **Step 6: Verify green**

Run:

```bash
bun test ./test/run-persistence.test.ts
```

Expected: pass.

## Task 3: Artifact and Record Persistence

**Files:**
- Create: `src/state/records.ts`
- Modify: `src/state/store.ts`
- Test: `test/record-persistence.test.ts`

- [ ] **Step 1: Write failing tests for artifact persistence**

Create `test/record-persistence.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createProjectStore } from "../src/state/store"

describe("record persistence", () => {
  test("writes markdown artifacts to canonical artifacts directory and stores raw record json", () => {
    const project = mkdtempSync(join(tmpdir(), "sp-project-"))
    const store = createProjectStore(project)
    const state = store.startRun({
      workflow: "feature",
      entrypoint: "feature",
      goal: "Add gates",
      request: "# Request",
      proposal: "# Proposal",
      parentSessionID: "ses_main",
    })

    const next = store.recordNodeResult({
      nodeID: "001-design",
      input: {
        event: "design",
        status: "passed",
        summary: "Design passed.",
        artifacts: { spec: "# Spec\n\nDetails." },
        gates: { design_approved: true, spec_written: true },
      },
    })

    const runRoot = join(project, ".opencode", "superpowers", "runs", state.id)
    expect(readFileSync(join(runRoot, "artifacts", "spec.md"), "utf8")).toContain("# Spec")
    expect(existsSync(join(runRoot, "nodes", "001-design", "record.json"))).toBe(true)
    expect(next.gates.spec_written).toBe(true)
    expect(next.artifacts.spec).toBe("artifacts/spec.md")
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
bun test ./test/record-persistence.test.ts
```

Expected: fail because `recordNodeResult` does not exist.

- [ ] **Step 3: Implement record persistence**

Create `src/state/records.ts` with:

```ts
export function applyNodeRecord(args: {
  project: string
  state: WorkflowState
  nodeID: string
  input: SpRecordInput
}): WorkflowState
```

It must:

- parse with `parseSpRecordInput`
- write `nodes/<nodeID>/record.json`
- write `nodes/<nodeID>/output.md` from `summary`
- write `artifacts/<artifact>.md` from markdown strings
- update `state.artifacts`
- update gates only when required artifact keys are present or already persisted
- append `changelog.md`
- set `pending_question` and `status: "waiting_user"` when `status === "needs_user"`

- [ ] **Step 4: Add `recordNodeResult` to store**

Update `createProjectStore` to expose:

```ts
recordNodeResult(args: {
  nodeID: string
  input: unknown
}): WorkflowState
```

- [ ] **Step 5: Verify green**

Run:

```bash
bun test ./test/record-persistence.test.ts
bun run test
```

Expected: record persistence tests pass; old transition tests may need migration to final record semantics.

## Task 4: Task Graph Normalization

**Files:**
- Create: `src/state/task-graph.ts`
- Test: `test/task-graph.test.ts`

- [ ] **Step 1: Write failing tests for runnable tasks**

Create `test/task-graph.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { getRunnableTasks, normalizeTaskGraph } from "../src/state/task-graph"

describe("task graph", () => {
  test("runs tasks whose depends_on are complete", () => {
    const graph = normalizeTaskGraph({
      tasks: [
        { id: "T1", title: "One", summary: "First", depends_on: [] },
        { id: "T2", title: "Two", summary: "Second", depends_on: ["T1"] },
      ],
    })

    expect(getRunnableTasks(graph, new Set()).map((task) => task.id)).toEqual(["T1"])
    expect(getRunnableTasks(graph, new Set(["T1"])).map((task) => task.id)).toEqual(["T2"])
  })
})
```

- [ ] **Step 2: Write failing test for implicit dependency on shared writable files**

Add:

```ts
test("adds implicit dependency for shared writable files", () => {
  const graph = normalizeTaskGraph({
    tasks: [
      { id: "T1", title: "One", summary: "First", depends_on: [], files: ["src/state/types.ts"] },
      { id: "T2", title: "Two", summary: "Second", depends_on: [], files: ["src/state/types.ts"] },
    ],
  })

  expect(graph.tasks.find((task) => task.id === "T2")?.depends_on).toContain("T1")
  expect(graph.tasks.find((task) => task.id === "T2")?.implicit_depends_on?.[0]?.reason).toContain("shared writable file")
})
```

- [ ] **Step 3: Verify failure**

Run:

```bash
bun test ./test/task-graph.test.ts
```

Expected: fail because task graph module does not exist.

- [ ] **Step 4: Implement task graph utilities**

Create `src/state/task-graph.ts`:

```ts
import type { TaskGraph } from "./types"

export type NormalizedTask = TaskGraph["tasks"][number] & {
  implicit_depends_on?: Array<{ task: string; reason: string }>
}

export type NormalizedTaskGraph = {
  tasks: NormalizedTask[]
}

export function normalizeTaskGraph(graph: TaskGraph): NormalizedTaskGraph {
  const seenFileOwner = new Map<string, string>()
  const tasks = graph.tasks.map((task) => {
    const depends = new Set(task.depends_on)
    const implicit: Array<{ task: string; reason: string }> = []
    for (const file of task.files ?? []) {
      const owner = seenFileOwner.get(file)
      if (owner && !depends.has(owner)) {
        depends.add(owner)
        implicit.push({ task: owner, reason: `shared writable file: ${file}` })
      }
      if (!seenFileOwner.has(file)) seenFileOwner.set(file, task.id)
    }
    return {
      ...task,
      depends_on: Array.from(depends),
      ...(implicit.length > 0 ? { implicit_depends_on: implicit } : {}),
    }
  })
  return { tasks }
}

export function getRunnableTasks(graph: NormalizedTaskGraph, completed: Set<string>): NormalizedTask[] {
  return graph.tasks.filter((task) => !completed.has(task.id) && task.depends_on.every((dep) => completed.has(dep)))
}
```

- [ ] **Step 5: Persist task graph on plan record**

When `sp_record.event === "plan"` and `task_graph` is present, normalize it and write `task_graph.json`.

- [ ] **Step 6: Verify green**

Run:

```bash
bun test ./test/task-graph.test.ts
bun run test
```

Expected: pass.

## Task 5: Agents and Skills Final Mapping

**Files:**
- Modify: `src/agents/index.ts`
- Modify: `src/router/modes.ts` or replace with `src/router/workflows.ts`
- Modify: `src/commands/index.ts`
- Modify: `assets/skills/` install list if needed
- Test: `test/agents.test.ts`

- [ ] **Step 1: Update tests for final agents**

Modify `test/agents.test.ts` to expect exactly these configured agents:

```ts
const expectedAgents = [
  "super-agent",
  "sp-designer",
  "sp-planner",
  "sp-debugger",
  "sp-investigator",
  "sp-implementer",
  "sp-spec-reviewer",
  "sp-code-reviewer",
  "sp-verifier",
  "sp-finisher",
]
```

Assert:

- `super-agent.mode === "primary"`
- node agents are subagents
- node agent prompt includes exactly one `Primary skill: ...`
- no prompt includes `supporting_skills`
- no prompt includes `superpowers-writing-skills`

- [ ] **Step 2: Verify failure**

Run:

```bash
bun test ./test/agents.test.ts
```

Expected: fail because current agent list uses `superpowers`, lacks `sp-investigator`, and has multi-skill prompts.

- [ ] **Step 3: Implement final agent map**

Update `src/agents/index.ts` to use:

```ts
const NODE_AGENTS = {
  "sp-designer": { primarySkill: "superpowers-brainstorming", purpose: "..." },
  "sp-planner": { primarySkill: "superpowers-writing-plans", purpose: "..." },
  "sp-debugger": { primarySkill: "superpowers-systematic-debugging", purpose: "..." },
  "sp-investigator": { primarySkill: "superpowers-dispatching-parallel-agents", purpose: "..." },
  "sp-implementer": { primarySkill: "superpowers-test-driven-development", purpose: "..." },
  "sp-spec-reviewer": { primarySkill: "superpowers-requesting-code-review", purpose: "..." },
  "sp-code-reviewer": { primarySkill: "superpowers-requesting-code-review", purpose: "..." },
  "sp-verifier": { primarySkill: "superpowers-verification-before-completion", purpose: "..." },
  "sp-finisher": { primarySkill: "superpowers-finishing-a-development-branch", purpose: "..." },
}
```

Use prompt rule:

```text
Primary skill: <skill>.
Load this skill and only this primary skill for this node.
End by calling sp_record with event, status, summary, artifacts/checks/findings as appropriate.
Do not include next_action, target_session_id, child_session_id, or skills_used.
```

- [ ] **Step 4: Rename controller command target**

Update `src/commands/index.ts` so all commands use:

```ts
agent: "super-agent"
```

- [ ] **Step 5: Remove default install of writing-skills**

Either delete `assets/skills/superpowers-writing-skills/` or update installer to exclude it from copying. Prefer deleting if no tests depend on it:

```bash
rm -rf assets/skills/superpowers-writing-skills
```

- [ ] **Step 6: Verify green**

Run:

```bash
bun test ./test/agents.test.ts
bun run test
```

Expected: pass.

## Task 6: Workflow Transition Table

**Files:**
- Create: `src/router/workflows.ts`
- Create: `src/router/transition.ts`
- Test: `test/workflow-transition.test.ts`

- [ ] **Step 1: Write failing tests for serial review transitions**

Create `test/workflow-transition.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { decideNextDispatches } from "../src/router/transition"
import type { WorkflowState, SpRecordInput } from "../src/state/types"

function state(overrides: Partial<WorkflowState> = {}): WorkflowState {
  return {
    id: "run-1",
    project: "/repo",
    parent_session_id: "ses_main",
    workflow: "feature",
    entrypoint: "feature",
    limited_context: false,
    goal: "Add gates",
    current_phase: "implement",
    status: "running",
    created_at: "2026-06-11T00:00:00.000Z",
    updated_at: "2026-06-11T00:00:00.000Z",
    gates: {},
    artifacts: {},
    node_runs: [],
    ...overrides,
  }
}

describe("workflow transitions", () => {
  test("implementation passed dispatches spec review only", () => {
    const record: SpRecordInput = {
      event: "implementation",
      status: "passed",
      summary: "Implemented.",
      artifacts: { patch_summary: "Patch summary." },
      gates: { implementation_done: true },
    }

    const decisions = decideNextDispatches(state(), record)

    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.agent).toBe("sp-spec-reviewer")
  })

  test("spec review passed dispatches code review only", () => {
    const record: SpRecordInput = {
      event: "spec-review",
      status: "passed",
      summary: "Spec review passed.",
      artifacts: { spec_review: "No issues." },
      gates: { spec_review_passed: true },
    }

    const decisions = decideNextDispatches(state({ current_phase: "spec-review" }), record)

    expect(decisions).toHaveLength(1)
    expect(decisions[0]?.agent).toBe("sp-code-reviewer")
  })
})
```

- [ ] **Step 2: Write failing tests for retry on review/verify failure**

Add:

```ts
test("code review failed reuses last implementer session", () => {
  const decisions = decideNextDispatches(
    state({
      current_phase: "code-review",
      node_runs: [
        {
          id: "004-implement-T1",
          task_id: "T1",
          phase: "implement",
          agent: "sp-implementer",
          primary_skill: "superpowers-test-driven-development",
          session_id: "ses_impl",
          status: "passed",
          attempts: 1,
          started_at: "2026-06-11T00:00:00.000Z",
        },
      ],
    }),
    {
      event: "code-review",
      status: "failed",
      summary: "Code review failed.",
      findings: "Important: missing edge case.",
    },
  )

  expect(decisions[0]?.action).toBe("reuse_session")
  expect(decisions[0]?.session_id).toBe("ses_impl")
  expect(decisions[0]?.agent).toBe("sp-implementer")
})
```

- [ ] **Step 3: Verify failure**

Run:

```bash
bun test ./test/workflow-transition.test.ts
```

Expected: fail because transition module does not exist.

- [ ] **Step 4: Implement dispatch decision types**

In `src/router/transition.ts`:

```ts
export type DispatchDecision =
  | {
      action: "create_session"
      phase: string
      agent: string
      primary_skill: string
      task_id?: string
      reason: string
    }
  | {
      action: "reuse_session"
      phase: string
      agent: string
      primary_skill: string
      session_id: string
      task_id?: string
      reason: string
    }
  | {
      action: "wait_user"
      reason: string
    }
  | {
      action: "finish"
      reason: string
    }
  | {
      action: "blocked"
      reason: string
    }
```

- [ ] **Step 5: Implement core transitions**

Implement:

```text
intake passed -> design / debug / plan / review / verify based on workflow
design passed -> plan
plan passed -> runnable implement tasks
implementation passed -> spec-review
spec-review passed -> code-review
code-review passed -> verify
verification passed -> finish
finish passed -> finish action
spec-review/code-review/verification failed -> reuse last implementer session or create retry implementer
needs_user -> wait_user
blocked -> blocked
```

- [ ] **Step 6: Verify green**

Run:

```bash
bun test ./test/workflow-transition.test.ts
bun run test
```

Expected: pass.

## Task 7: Node Task Templates

**Files:**
- Create: `src/session/templates.ts`
- Create: `src/session/task-packet.ts`
- Test: `test/session/templates.test.ts`

- [ ] **Step 1: Write failing tests for implement task packet**

Create `test/session/templates.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { buildNodeTaskPrompt } from "../../src/session/templates"

describe("node templates", () => {
  test("builds implement task prompt with one primary skill and record contract", () => {
    const prompt = buildNodeTaskPrompt({
      run_id: "run-1",
      node_id: "004-implement-T1",
      workflow: "feature",
      phase: "implement",
      agent: "sp-implementer",
      primary_skill: "superpowers-test-driven-development",
      objective: "Implement T1.",
      required_artifacts: [{ name: "plan", path: "artifacts/plan.md" }],
      record_contract: {
        event: "implementation",
        expected_artifacts: ["patch_summary"],
        allowed_gates: ["implementation_done"],
      },
    })

    expect(prompt).toContain("Primary skill: superpowers-test-driven-development")
    expect(prompt).not.toContain("supporting_skills")
    expect(prompt).toContain("Do not include next_action")
    expect(prompt).toContain("artifacts/plan.md")
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
bun test ./test/session/templates.test.ts
```

Expected: fail because templates do not exist.

- [ ] **Step 3: Implement task packet types**

Create `src/session/task-packet.ts`:

```ts
export type NodeTaskPacket = {
  run_id: string
  node_id: string
  workflow: string
  phase: string
  agent: string
  primary_skill: string
  task_id?: string
  objective: string
  required_artifacts: Array<{ name: string; path: string }>
  retry_context?: string
  record_contract: {
    event: string
    expected_artifacts: string[]
    allowed_gates: string[]
  }
}
```

- [ ] **Step 4: Implement markdown template renderer**

Create `src/session/templates.ts`:

```ts
import type { NodeTaskPacket } from "./task-packet"

export function buildNodeTaskPrompt(packet: NodeTaskPacket): string {
  const artifacts = packet.required_artifacts.map((artifact) => `- ${artifact.name}: ${artifact.path}`).join("\n")
  return [
    `# Superpowers Node Task: ${packet.node_id}`,
    "",
    `Workflow: ${packet.workflow}`,
    `Phase: ${packet.phase}`,
    `Agent: ${packet.agent}`,
    `Primary skill: ${packet.primary_skill}`,
    "",
    "Load this skill and only this primary skill for this node.",
    "",
    "## Objective",
    packet.objective,
    "",
    "## Required Artifacts",
    artifacts || "- none",
    "",
    packet.retry_context ? `## Retry Context\n${packet.retry_context}\n` : "",
    "## sp_record Contract",
    `- event: ${packet.record_contract.event}`,
    `- expected_artifacts: ${packet.record_contract.expected_artifacts.join(", ") || "none"}`,
    `- allowed_gates: ${packet.record_contract.allowed_gates.join(", ") || "none"}`,
    "- Required fields: event, status, summary",
    "- Optional markdown fields: artifacts, checks, findings",
    "- Do not include next_action, target_session_id, child_session_id, reuse_session_id, create_sessions, or skills_used.",
  ].filter(Boolean).join("\n")
}
```

- [ ] **Step 5: Verify green**

Run:

```bash
bun test ./test/session/templates.test.ts
```

Expected: pass.

## Task 8: Session Adapter and Orchestrator

**Files:**
- Create: `src/session/adapter.ts`
- Create: `src/session/orchestrator.ts`
- Modify: `src/plugin.ts`
- Test: `test/session/orchestrator.test.ts`

- [ ] **Step 1: Write failing test for create session decision**

Create `test/session/orchestrator.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { createSessionOrchestrator } from "../../src/session/orchestrator"

describe("session orchestrator", () => {
  test("creates a node session and records node_run", async () => {
    const calls: Array<{ agent: string; prompt: string }> = []
    const orchestrator = createSessionOrchestrator({
      async createNodeSession(input) {
        calls.push({ agent: input.agent, prompt: input.prompt })
        return "ses_node"
      },
      async continueNodeSession() {
        throw new Error("unexpected")
      },
      async showProgress() {},
    })

    const result = await orchestrator.dispatch({
      project: "/repo",
      runID: "run-1",
      parentSessionID: "ses_main",
      decision: {
        action: "create_session",
        phase: "design",
        agent: "sp-designer",
        primary_skill: "superpowers-brainstorming",
        reason: "design next",
      },
      packet: {
        run_id: "run-1",
        node_id: "001-design",
        workflow: "feature",
        phase: "design",
        agent: "sp-designer",
        primary_skill: "superpowers-brainstorming",
        objective: "Create design.",
        required_artifacts: [],
        record_contract: { event: "design", expected_artifacts: ["spec"], allowed_gates: ["spec_written"] },
      },
    })

    expect(result.session_id).toBe("ses_node")
    expect(calls[0]?.agent).toBe("sp-designer")
    expect(calls[0]?.prompt).toContain("Primary skill: superpowers-brainstorming")
  })
})
```

- [ ] **Step 2: Verify failure**

Run:

```bash
bun test ./test/session/orchestrator.test.ts
```

Expected: fail because session orchestrator does not exist.

- [ ] **Step 3: Implement adapter interface**

Create `src/session/adapter.ts`:

```ts
export type SessionAdapter = {
  createNodeSession(input: {
    parentSessionID: string
    title: string
    agent: string
    prompt: string
  }): Promise<string>

  continueNodeSession(input: {
    sessionID: string
    agent: string
    prompt: string
  }): Promise<void>

  showProgress(input: {
    title: string
    message: string
    variant: "info" | "success" | "warning" | "error"
  }): Promise<void>
}
```

- [ ] **Step 4: Implement OpenCode SDK adapter**

Add:

```ts
export function createOpenCodeSessionAdapter(ctx: PluginInput): SessionAdapter
```

Use SDK capabilities:

- `ctx.client.session.create({ body: { parentID, title, agent } })`
- `ctx.client.session.prompt({ path: { id/sessionID }, body: { agent, parts: [{ type: "text", text: prompt }] } })`
- `ctx.client.tui.showToast({ body: { title, message, variant } })`

Handle API field name differences between v1 and v2 SDK types by wrapping in a narrow local function and covering with e2e.

- [ ] **Step 5: Implement orchestrator**

Create `src/session/orchestrator.ts`:

```ts
export function createSessionOrchestrator(adapter: SessionAdapter) {
  return {
    async dispatch(args: {
      project: string
      runID: string
      parentSessionID: string
      decision: DispatchDecision
      packet: NodeTaskPacket
    }): Promise<{ session_id?: string; action: string }> {
      // render prompt
      // create or continue session
      // show toast
      // return session id
    }
  }
}
```

- [ ] **Step 6: Verify green**

Run:

```bash
bun test ./test/session/orchestrator.test.ts
```

Expected: pass.

## Task 9: Controller Flow and User Confirmation

**Files:**
- Create: `src/controller/proposal.ts`
- Create: `src/controller/intake.ts`
- Modify: `src/tools/sp-route.ts`
- Modify: `src/tools/sp-next.ts`
- Test: `test/controller-intake.test.ts`

- [ ] **Step 1: Write failing tests for proposal generation**

Create `test/controller-intake.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { buildWorkflowProposal } from "../src/controller/proposal"

describe("workflow proposal", () => {
  test("builds feature proposal from implementation request", () => {
    const proposal = buildWorkflowProposal({
      request: "Add workflow gates",
      routeHint: "feature",
      existingState: null,
    })

    expect(proposal.workflow).toBe("feature")
    expect(proposal.markdown).toContain("feature workflow")
    expect(proposal.requires_confirmation).toBe(true)
  })
})
```

- [ ] **Step 2: Implement proposal builder**

Create:

```ts
export function buildWorkflowProposal(args: {
  request: string
  routeHint?: string
  existingState: WorkflowState | null
}): {
  workflow: WorkflowKind
  entrypoint: WorkflowEntrypoint
  markdown: string
  requires_confirmation: true
}
```

- [ ] **Step 3: Update `sp_route` semantics**

`sp_route` should not immediately create run state from a route decision. It should:

- inspect current state
- return proposal markdown
- return `requires_confirmation: true`
- if active run exists, return resume proposal

Creation happens after user confirmation through a new controller action/tool:

```text
sp_start
```

or through `sp_record(event="intake", status="passed")` from `super-agent`.

- [ ] **Step 4: Add `sp_start` or intake record handling**

Prefer no extra tool if possible:

```text
super-agent asks user for confirmation
user confirms
super-agent calls sp_record(event="intake", status="passed", artifacts.request, gates.request_confirmed)
plugin creates run and dispatches first node
```

If `sp_record` needs an active run before it can work, add `sp_start` as the only run-creation tool.

- [ ] **Step 5: Verify green**

Run:

```bash
bun test ./test/controller-intake.test.ts
bun run test
```

Expected: pass.

## Task 10: Integrate sp_record with Transition and Dispatch

**Files:**
- Modify: `src/tools/sp-record.ts`
- Modify: `src/state/store.ts`
- Modify: `src/router/transition.ts`
- Modify: `src/session/orchestrator.ts`
- Test: `test/sp-record-dispatch.test.ts`

- [ ] **Step 1: Write failing test for `sp_record` dispatching next session**

Create `test/sp-record-dispatch.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { createRecordHandler } from "../src/tools/sp-record"

describe("sp_record dispatch integration", () => {
  test("plan passed with runnable task dispatches implementer session", async () => {
    const dispatched: string[] = []
    const handler = createRecordHandler({
      store: fakeStoreWithFeatureRun(),
      orchestrator: {
        async dispatch(args) {
          dispatched.push(args.packet.agent)
          return { action: "create_session", session_id: "ses_impl" }
        },
      },
    })

    const result = await handler({
      event: "plan",
      status: "passed",
      summary: "Plan ready.",
      artifacts: { plan: "# Plan" },
      gates: { plan_written: true },
      task_graph: {
        tasks: [
          { id: "T1", title: "Types", summary: "Add types", depends_on: [], files: ["src/state/types.ts"] },
        ],
      },
    })

    expect(dispatched).toEqual(["sp-implementer"])
    expect(result).toContain("dispatched")
  })
})
```

Implement `fakeStoreWithFeatureRun` in the test file as a minimal fake matching the handler dependency shape.

- [ ] **Step 2: Refactor tool handler for testability**

In `src/tools/sp-record.ts`, export:

```ts
export function createRecordHandler(deps: {
  store: ProjectStore
  orchestrator: SessionOrchestrator
}): (input: unknown, context?: { sessionID?: string }) => Promise<string>
```

The OpenCode tool wrapper calls this handler.

- [ ] **Step 3: Implement dispatch after record**

Flow:

```text
parse record
store.recordNodeResult
decideNextDispatches
for each decision:
  build node packet
  orchestrator.dispatch
  store.addNodeRun / update node run
return JSON summary
```

- [ ] **Step 4: Ensure no dispatch on needs_user**

When `status === "needs_user"`:

- store pending question
- return JSON summary
- no child sessions created
- show toast

- [ ] **Step 5: Verify green**

Run:

```bash
bun test ./test/sp-record-dispatch.test.ts
bun run test
```

Expected: pass.

## Task 11: Gates and Tool Interception Update

**Files:**
- Modify: `src/router/gates.ts`
- Modify: `src/plugin.ts`
- Test: `test/gates.test.ts`

- [ ] **Step 1: Update gate tests for final state shape**

Modify `test/gates.test.ts` so helper state uses:

```ts
workflow
current_phase
status
gates
node_runs
```

- [ ] **Step 2: Keep strict behavior**

Ensure tests still cover:

- design writes blocked before `design_approved`
- debug repair blocked before `root_cause_found`
- implementation production writes blocked before `red_test_seen`
- completion blocked before `verification_fresh`

- [ ] **Step 3: Add session-aware skip**

If a mutating tool call comes from `super-agent`, deny or warn because super-agent should not write code.

Test:

```ts
expect(evaluateToolGate({ agent: "super-agent", tool: "edit", ... }).allowed).toBe(false)
```

- [ ] **Step 4: Verify green**

Run:

```bash
bun test ./test/gates.test.ts
bun run test
```

Expected: pass.

## Task 12: E2E Update for OpenCode 1.16.2

**Files:**
- Modify: `scripts/e2e-opencode-1.16.2.ts`
- Modify: `scripts/e2e-opencode-mock-llm.ts`
- Modify: `test/e2e/opencode-workflow.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Update agent-list e2e**

Expect:

```text
super-agent
sp-investigator
```

Stop expecting:

```text
superpowers
```

- [ ] **Step 2: Add mock workflow e2e happy path**

Using existing mock LLM harness, script a minimal flow:

```text
user: /sp add a small feature
super-agent: proposal
user: confirm
super-agent: sp_record intake passed
plugin: creates design session
sp-designer mock: sp_record design passed with spec
plugin: creates plan session
sp-planner mock: sp_record plan passed with one task
plugin: creates implementer session
```

Assert persisted files:

```text
request.md
proposal.md
artifacts/spec.md
artifacts/plan.md
task_graph.json
nodes/*/record.json
```

- [ ] **Step 3: Add review serial e2e or unit integration**

If full e2e is costly, add integration test with mocked session adapter:

```text
implementation passed -> spec-review
spec-review passed -> code-review
code-review passed -> verify
```

Assert order.

- [ ] **Step 4: Verify**

Run:

```bash
bun run test
bun run build
bun run e2e:opencode
bun run e2e:opencode:mock-llm
```

Expected: all pass.

## Task 13: Documentation and Cleanup

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `docs/superpowers/plans/2026-06-09-superpowers-controller-mvp.md` or add note
- Possibly delete: `assets/commands/*.md`
- Possibly delete: `assets/skills/superpowers-writing-skills/SKILL.md`

- [ ] **Step 1: Update README command and agent names**

Ensure README states:

- `super-agent` is the primary controller.
- Node sessions are plugin-created.
- `sp_record` has simplified schema.
- Task graph uses only `depends_on`.
- Progress uses toast/state instead of model context.

- [ ] **Step 2: Add migration note to old MVP plan**

At the top of `docs/superpowers/plans/2026-06-09-superpowers-controller-mvp.md`, add:

```md
> Superseded for implementation by `docs/superpowers/plans/2026-06-11-controller-final-architecture-migration.md`.
```

- [ ] **Step 3: Remove unused command assets if commands remain dynamic-only**

If no tests require assets commands:

```bash
rm -rf assets/commands
```

Keep installer dynamic-only.

- [ ] **Step 4: Remove unused writing skill asset**

If final install excludes writing-skills:

```bash
rm -rf assets/skills/superpowers-writing-skills
```

- [ ] **Step 5: Verify**

Run:

```bash
bun run test
bun run build
```

Expected: pass.

## Self-Review

- Spec coverage: Covers simplified `sp_record`, plugin-owned session control, serial review, verify retry, run directory persistence, task graph with `depends_on`, implicit write dependencies, `super-agent`, `sp-investigator`, removal of `skill-authoring`, and progress messages outside model context.
- Placeholder scan: No task uses TBD or vague implementation-only instructions; each task names files, tests, expected failures, and implementation shape.
- Type consistency: The plan consistently uses `WorkflowKind`, `NodeStatus`, `SpRecordInput`, `TaskGraph`, `NodeRun`, `DispatchDecision`, `NodeTaskPacket`, and `super-agent`.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-11-controller-final-architecture-migration.md`. Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, with review between tasks.
2. **Inline Execution** - Execute tasks in this session using executing-plans, with checkpoints.

Which approach?
