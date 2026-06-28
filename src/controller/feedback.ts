import type { StartAction, WorkflowState } from "../state/types"

export type RecommendedNext =
  | { action: "wait_running_node"; run_id: string; node_id: string; session_id: string }
  | { action: "answer_pending_question"; run_id: string; node_id?: string }
  | { action: "approve_proposal"; run_id: string }
  | { action: "revise_request"; run_id: string }
  | { action: "approve_design"; run_id: string }
  | { action: "revise_design"; run_id: string }
  | { action: "retry_dispatch"; run_id: string; node_id: string }
  | { action: "retry_node"; run_id: string; task_id?: string; phase: string }
  | { action: "cancel_node"; run_id: string; node_id: string }
  | { action: "cancel_workflow"; run_id: string }
  | { action: "approve_plan"; run_id: string }
  | { action: "revise_plan"; run_id: string }
  | { action: "finish"; run_id: string }
  | { action: "blocked"; reason: string }

export type ControllerFeedback = {
  outcome: "ok" | "waiting" | "needs_user" | "needs_approval" | "blocked" | "failed" | "terminal"
  state_version: string
  run_id?: string
  current_status: WorkflowState["status"]
  current_phase: string
  recommended_next: RecommendedNext[]
  allowed_tool_calls: Array<"sp_status" | "sp_prepare" | "sp_start" | "sp_cancel" | "sp_report">
  requires_user?: {
    reason: string
    question?: string
    options?: Array<{ label: string; description?: string }>
  }
  approval_target?: "design" | "plan" | "retry" | "cancel"
  autonomous_options?: Array<{
    action: string
    when_safe: string
    risk: "low" | "medium" | "high"
  }>
  blocking_reason?: string
  artifact_mode?: "candidate" | "canonical" | "none"
}

export function buildRecommendedNext(state: WorkflowState): RecommendedNext[] {
  const running = state.node_runs.find((node) => node.status === "running")
  if (running) {
    return [{ action: "wait_running_node", run_id: state.id, node_id: running.id, session_id: running.session_id }]
  }
  if (state.status === "waiting_user" && state.pending_question) {
    return [{ action: "answer_pending_question", run_id: state.id, node_id: state.pending_question.source_node_id }]
  }
  if (state.status === "awaiting_design_approval") {
    return [{ action: "approve_design", run_id: state.id }, { action: "revise_design", run_id: state.id }, { action: "cancel_workflow", run_id: state.id }]
  }
  if (state.status === "awaiting_plan_approval") {
    return [{ action: "approve_plan", run_id: state.id }, { action: "revise_plan", run_id: state.id }, { action: "cancel_workflow", run_id: state.id }]
  }
  if (state.activation === "draft" && state.prepare_mode === "proposal_only") {
    return [{ action: "approve_proposal", run_id: state.id }, { action: "revise_request", run_id: state.id }, { action: "cancel_workflow", run_id: state.id }]
  }
  const dispatchFailed = [...state.node_runs].reverse().find((node) => node.status === "dispatch_failed")
  if (dispatchFailed) {
    return [
      { action: "retry_dispatch", run_id: state.id, node_id: dispatchFailed.id },
      { action: "cancel_node", run_id: state.id, node_id: dispatchFailed.id },
      { action: "cancel_workflow", run_id: state.id },
    ]
  }
  const interrupted = [...state.node_runs].reverse().find((node) => node.status === "interrupted")
  if (interrupted) {
    return [
      { action: "retry_node", run_id: state.id, task_id: interrupted.task_id, phase: interrupted.phase },
      { action: "cancel_node", run_id: state.id, node_id: interrupted.id },
      { action: "cancel_workflow", run_id: state.id },
    ]
  }
  if (state.status === "passed") return [{ action: "finish", run_id: state.id }]
  if (state.status === "canceled") return [{ action: "blocked", reason: "workflow is canceled" }]
  if (state.status === "blocked" || state.status === "failed" || state.status === "waiting_user_decision" || state.status === "recovered_unknown") {
    return [{ action: "blocked", reason: `workflow is ${state.status}` }]
  }
  return [{ action: "blocked", reason: "no runnable node or approval decision is available" }]
}

export function buildControllerFeedback(state: WorkflowState, override?: Partial<ControllerFeedback>): ControllerFeedback {
  const recommendedNext = override?.recommended_next ?? buildRecommendedNext(state)
  const needsApproval = state.status === "awaiting_design_approval" || state.status === "awaiting_plan_approval"
  const waitingUser = state.status === "waiting_user"
  const terminal = state.status === "passed" || state.status === "failed" || state.status === "canceled"
  const blocked = state.status === "blocked" || state.status === "waiting_user_decision" || state.status === "recovered_unknown"
  return {
    outcome: override?.outcome ?? (
      terminal ? "terminal" :
      needsApproval ? "needs_approval" :
      waitingUser ? "needs_user" :
      blocked ? "blocked" :
      recommendedNext.some((next) => next.action === "wait_running_node") ? "waiting" :
      "ok"
    ),
    state_version: stateVersion(state),
    run_id: state.id,
    current_status: state.status,
    current_phase: state.current_phase,
    recommended_next: recommendedNext,
    allowed_tool_calls: override?.allowed_tool_calls ?? ["sp_status", "sp_prepare", "sp_start", "sp_cancel", "sp_report"],
    requires_user: override?.requires_user ?? userRequirementForState(state),
    approval_target: override?.approval_target ?? approvalTargetForState(state),
    autonomous_options: override?.autonomous_options,
    blocking_reason: override?.blocking_reason,
    artifact_mode: override?.artifact_mode ?? artifactModeForState(state),
  }
}

export function staleStateFeedback(state: WorkflowState, expected: string): ControllerFeedback {
  return buildControllerFeedback(state, {
    outcome: "blocked",
    blocking_reason: `expected_state_version ${expected} is stale; current state_version is ${stateVersion(state)}.`,
    allowed_tool_calls: ["sp_status", "sp_start", "sp_cancel"],
  })
}

function stateVersion(state: WorkflowState): string {
  return state.state_version ?? `${state.updated_at}:legacy`
}

export function inferStartAction(state: WorkflowState, args: { start_action?: StartAction; resume_input?: unknown; task_id?: string }): StartAction {
  if (args.start_action) return args.start_action
  if (args.resume_input) return "resume_user_input"
  if (state.status === "awaiting_design_approval") return "approve_design"
  if (state.status === "awaiting_plan_approval") return "approve_plan"
  if (state.status === "recovered_unknown" && args.task_id) return "retry_node"
  return "start_entrypoint"
}

function userRequirementForState(state: WorkflowState): ControllerFeedback["requires_user"] {
  if (state.status === "waiting_user" && state.pending_question) {
    return {
      reason: "A node requested user input.",
      question: state.pending_question.prompt,
      options: state.pending_question.options,
    }
  }
  if (state.status === "awaiting_design_approval") return { reason: "Candidate design requires approval or revision." }
  if (state.status === "awaiting_plan_approval") return { reason: "Candidate plan requires approval or revision." }
  if (state.status === "waiting_user_decision") return { reason: "Controller needs a retry, cancel, approve, or revise decision." }
  return undefined
}

function approvalTargetForState(state: WorkflowState): ControllerFeedback["approval_target"] {
  if (state.status === "awaiting_design_approval") return "design"
  if (state.status === "awaiting_plan_approval") return "plan"
  if (state.status === "recovered_unknown" || state.status === "waiting_user_decision") return "retry"
  return undefined
}

function artifactModeForState(state: WorkflowState): ControllerFeedback["artifact_mode"] {
  if (state.status === "awaiting_design_approval" || state.status === "awaiting_plan_approval") return "candidate"
  if (state.artifacts.spec || state.artifacts.plan || state.task_graph) return "canonical"
  return "none"
}
