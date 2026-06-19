import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { decideNextDispatches } from "../router/transition"
import type { ProjectStore } from "../state/store"
import type { WorkflowState } from "../state/types"

export function createNextTool(store: ProjectStore): ToolDefinition {
  return tool({
    description: "Return the controller-facing dispatch summary for the active Superpowers workflow.",
    args: {},
    async execute() {
      const state = store.readCurrent()
      if (!state) return "No active Superpowers workflow. Call sp_route and sp_start first."
      return JSON.stringify(
        {
          run: state.id,
          activation: state.activation,
          workflow: state.workflow,
          entrypoint: state.entrypoint,
          status: state.status,
          current_phase: state.current_phase,
          controller_action: controllerActionForState(state),
          gates: state.gates,
          node_runs: state.node_runs,
          pending_question: state.pending_question,
          dispatches: decideNextDispatches(state),
        },
        null,
        2,
      )
    },
  })
}

function controllerActionForState(state: WorkflowState): string {
  if (state.activation === "draft" && state.current_phase === "awaiting-plan-approval") return "review_plan_and_confirm_start"
  if (state.activation === "draft") return "wait_planner"
  if (state.status === "intake") return "record_intake_confirmation"
  if (state.status === "waiting_user") return "ask_user_or_confirm_resume"
  if (state.status === "blocked") return "explain_blocker"
  if (state.status === "passed") return "report_finished"
  if (state.node_runs.some((run) => run.status === "running")) return "wait_node"
  return "inspect_dispatches"
}
