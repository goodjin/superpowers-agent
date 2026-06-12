import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { applyRecord, createInitialState } from "./transitions"
import { normalizeTaskGraph } from "./task-graph"
import type { WorkflowMode, WorkflowRecord, WorkflowState } from "./types"

export type ProjectStore = {
  root: string
  readCurrent(): WorkflowState | null
  start(args: { session: string; mode: WorkflowMode; goal: string }): WorkflowState
  record(record: WorkflowRecord): WorkflowState
  reset(): void
}

export function createProjectStore(project: string): ProjectStore {
  const root = join(project, ".opencode", "superpowers")
  return {
    root,
    readCurrent() {
      const currentPath = join(root, "current.json")
      if (!existsSync(currentPath)) return null
      const pointer = JSON.parse(readFileSync(currentPath, "utf8")) as { run: string }
      const statePath = join(root, "runs", pointer.run, "state.json")
      if (!existsSync(statePath)) return null
      return JSON.parse(readFileSync(statePath, "utf8")) as WorkflowState
    },
    start(args) {
      const state = createInitialState({
        id: randomUUID(),
        project,
        session: args.session,
        mode: args.mode,
        goal: args.goal,
      })
      writeState(root, state)
      writeCurrent(root, state.id)
      writeRunMarkdown(root, state.id, "request.md", `# Request\n\n${args.goal.trim()}\n`)
      appendChangelog(root, state.id, `created ${args.mode} workflow`)
      return state
    },
    record(record) {
      const current = this.readCurrent()
      if (!current) {
        throw new Error("No active Superpowers workflow. Call sp_route or sp_next first.")
      }
      writeArtifacts(root, current.id, record.artifacts ?? {})
      const nodeIndex = current.history.filter((entry) => entry.event !== "created").length + 1
      writeNodeRecord(root, current.id, nodeIndex, record)
      if (record.task_graph) {
        const normalized = normalizeTaskGraph(record.task_graph)
        writeJson(root, current.id, "task_graph.json", normalized)
      }
      const next = applyRecord(current, record)
      writeState(root, next)
      writeCurrent(root, next.id)
      appendChangelog(root, next.id, `${record.event}: ${record.status} - ${record.summary}`)
      return next
    },
    reset() {
      const currentPath = join(root, "current.json")
      if (existsSync(currentPath)) rmSync(currentPath)
    },
  }
}

function writeState(root: string, state: WorkflowState): void {
  const statePath = join(root, "runs", state.id, "state.json")
  mkdirSync(dirname(statePath), { recursive: true })
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function writeRunMarkdown(root: string, run: string, filename: string, body: string): void {
  const path = join(root, "runs", run, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body.endsWith("\n") ? body : `${body}\n`)
}

function writeJson(root: string, run: string, filename: string, value: unknown): void {
  const path = join(root, "runs", run, filename)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeCurrent(root: string, run: string): void {
  mkdirSync(root, { recursive: true })
  writeFileSync(join(root, "current.json"), `${JSON.stringify({ run }, null, 2)}\n`)
}

function writeArtifacts(root: string, run: string, artifacts: NonNullable<WorkflowRecord["artifacts"]>): void {
  for (const [name, body] of Object.entries(artifacts)) {
    const artifactPath = join(root, "runs", run, "artifacts", `${name}.md`)
    mkdirSync(dirname(artifactPath), { recursive: true })
    writeFileSync(artifactPath, `${body.trim()}\n`)
  }
}

function writeNodeRecord(root: string, run: string, index: number, record: WorkflowRecord): void {
  const node = `${String(index).padStart(3, "0")}-${record.event}`
  const nodeRoot = join(root, "runs", run, "nodes", node)
  mkdirSync(nodeRoot, { recursive: true })
  writeFileSync(join(nodeRoot, "record.json"), `${JSON.stringify(record, null, 2)}\n`)
  writeFileSync(join(nodeRoot, "output.md"), `${record.summary.trim()}\n`)
}

function appendChangelog(root: string, run: string, message: string): void {
  const path = join(root, "runs", run, "changelog.md")
  mkdirSync(dirname(path), { recursive: true })
  const current = existsSync(path) ? readFileSync(path, "utf8") : "# Changelog\n\n"
  writeFileSync(path, `${current.trimEnd()}\n- ${new Date().toISOString()} ${message}\n`)
}
