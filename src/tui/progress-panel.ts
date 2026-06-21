import type { NodeProgressEntry } from "../progress/node-progress"
import type { WorkflowState } from "../state/types"

export type ProgressPanelRow = {
  node_id: string
  task_id?: string
  agent: string
  phase: string
  durable_status: string
  activity_status: "active" | "stalled"
  session_id: string
  live_status: string
  latest_summary: string
  latest_detail?: string
  updated_at?: string
}

export type ProgressPanelViewModel = {
  active: boolean
  title: string
  summary: string
  rows: ProgressPanelRow[]
}

export const STALLED_PROGRESS_AFTER_MS = 30_000

export function buildProgressPanelViewModel(
  state: WorkflowState | null,
  progressByNode: Record<string, NodeProgressEntry[]>,
  liveStatusBySession: Record<string, string>,
  now: Date = new Date(),
): ProgressPanelViewModel {
  if (!state) {
    return {
      active: false,
      title: "Superpowers Progress",
      summary: "No active Superpowers workflow.",
      rows: [],
    }
  }

  return {
    active: true,
    title: "Superpowers Progress",
    summary: `${state.workflow} run ${state.id} is ${state.status} at ${state.current_phase}.`,
    rows: state.node_runs.map((node) => {
      const progress = progressByNode[node.id] ?? []
      const latest = progress.at(-1)
      const observedAt = latest?.at ?? node.started_at
      return {
        node_id: node.id,
        task_id: node.task_id,
        agent: node.agent,
        phase: node.phase,
        durable_status: node.status,
        activity_status: node.status === "running" && isStalled(observedAt, now) ? "stalled" : "active",
        session_id: node.session_id,
        live_status: liveStatusBySession[node.session_id] ?? "unknown",
        latest_summary: latest?.summary ?? "no progress recorded",
        latest_detail: latest?.detail,
        updated_at: latest?.at,
      }
    }),
  }
}

export function renderProgressPanelText(model: ProgressPanelViewModel): string {
  const lines = [model.title, "", model.summary]
  if (model.rows.length === 0) return lines.join("\n")

  lines.push("")
  for (const row of model.rows) {
    const task = row.task_id ? ` ${row.task_id}` : ""
    lines.push(`${row.node_id}${task}`)
    lines.push(`  ${row.agent} / ${row.phase}`)
    lines.push(`  status: ${row.durable_status} / ${row.live_status} / ${row.activity_status}`)
    lines.push(`  session: ${row.session_id}`)
    lines.push(`  latest: ${row.latest_summary}`)
    if (row.latest_detail) lines.push(`  detail: ${row.latest_detail}`)
    if (row.updated_at) lines.push(`  updated: ${row.updated_at}`)
    lines.push("")
  }
  return lines.join("\n").trimEnd()
}

export function renderCompactProgressText(model: ProgressPanelViewModel): string {
  if (!model.active) return ""
  const row = [...model.rows].reverse().find((candidate) => candidate.durable_status === "running") ?? model.rows.at(-1)
  if (!row) return "SP: active workflow has no child sessions"

  const task = row.task_id ? ` ${row.task_id}` : ""
  const live = row.live_status === "unknown" ? row.durable_status : `${row.durable_status}/${row.live_status}`
  const activity = row.activity_status === "stalled" ? "/stalled" : ""
  return truncateLine(`SP: ${row.agent}${task} ${live}${activity} - ${row.latest_summary}`)
}

function truncateLine(value: string, max = 120): string {
  return value.length > max ? `${value.slice(0, max - 3)}...` : value
}

function isStalled(observedAt: string | undefined, now: Date): boolean {
  if (!observedAt) return false
  const observed = Date.parse(observedAt)
  const current = now.getTime()
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return false
  return current - observed >= STALLED_PROGRESS_AFTER_MS
}
