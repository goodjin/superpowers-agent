import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import type { ProjectStore } from "../state/store"
import type { WorkflowState } from "../state/types"

const INCOMPLETE_STATUSES = new Set<WorkflowState["status"]>(["intake", "running", "waiting_user", "blocked", "failed", "recovered_unknown"])

export function createStatusTool(store: ProjectStore): ToolDefinition {
  return tool({
    description: "Query current Superpowers workflow status, a specific workflow, or incomplete historical workflows.",
    args: {
      workflow_id: tool.schema.string().optional().describe("Optional workflow/run id to inspect"),
      task_id: tool.schema.string().optional().describe("Optional task id to focus on"),
      include_history: tool.schema.boolean().optional().describe("Include incomplete historical workflows"),
    },
    async execute(args) {
      const current = args.workflow_id ? store.readRun(args.workflow_id) : store.readCurrent()
      const history = args.include_history || !current ? incompleteRuns(store.listRuns()) : undefined
      const focused = current && args.task_id ? focusTask(current, args.task_id) : undefined
      return JSON.stringify(
        {
          current,
          task: focused,
          incomplete_workflows: history,
          source: current ? "runtime_current" : "history_scan",
        },
        null,
        2,
      )
    },
  })
}

function incompleteRuns(runs: WorkflowState[]): WorkflowState[] {
  return runs.filter((run) => INCOMPLETE_STATUSES.has(run.status))
}

function focusTask(state: WorkflowState, taskID: string) {
  const task = state.task_graph?.tasks.find((candidate) => candidate.id === taskID)
  const node_runs = state.node_runs.filter((run) => run.task_id === taskID)
  return {
    task,
    node_runs,
    latest_report: [...node_runs].reverse().find((run) => run.record_path),
  }
}
