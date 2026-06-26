import { parseSpRecordInput } from "../state/record-schema"
import { noopProgressReporter, type ProgressReporter } from "../progress/reporter"
import { decideNextDispatches, type DispatchDecision } from "../router/transition"
import { buildNodeTaskPacket } from "../session/templates"
import type { SessionOrchestrator } from "../session/orchestrator"
import type { ProjectStore } from "../state/store"
import type { NodeStatus, WorkflowState } from "../state/types"

export type ReportHandlerContext = {
  sessionID?: string
  agent?: string
}

export function createReportHandler(deps: {
  store: ProjectStore
  orchestrator: Pick<SessionOrchestrator, "dispatch">
  progress?: ProgressReporter
}) {
  return async (input: unknown, context: ReportHandlerContext = {}): Promise<string> => {
    const progress = deps.progress ?? noopProgressReporter
    const record = parseSpRecordInput(input)
    const state = deps.store.recordNodeResult({
      input: record,
      sessionID: context.sessionID,
      agent: context.agent,
    })
    const decisions = decideNextDispatches(state, record)
    const dispatches = []

    await progress.report({
      stage: "node_recorded",
      title: "Superpowers workflow",
      message: `${record.event} reported as ${record.status}; workflow is at ${state.current_phase ?? state.phase}.`,
      variant: variantForReportStatus(record.status),
    })

    for (const decision of decisions) {
      if (decision.action === "wait_user") {
        await progress.report({
          stage: "waiting_user_input",
          title: "Superpowers workflow",
          message: "Node requested user input.",
          variant: "warning",
        })
        continue
      }
      if (decision.action === "blocked") {
        await progress.report({
          stage: "workflow_blocked",
          title: "Superpowers workflow",
          message: `Workflow blocked: ${decision.reason}`,
          variant: "error",
        })
        continue
      }
      if (decision.action === "finish") {
        await progress.report({
          stage: "workflow_finished",
          title: "Superpowers workflow",
          message: "Workflow finished.",
          variant: "success",
        })
        continue
      }
      if (decision.action !== "create_session" && decision.action !== "reuse_session") continue
      const current = deps.store.readCurrent() ?? state
      const nodeID = nextDispatchNodeID(current, decision)
      const packet = buildNodeTaskPacket({
        state: current,
        decision,
        nodeID,
      })
      let nodeRegistered = false
      const result = await deps.orchestrator.dispatch({
        project: current.project,
        runID: current.id,
        parentSessionID: current.parent_session_id ?? context.sessionID ?? current.session,
        decision,
        packet,
        async onSessionCreated(input) {
          deps.store.addNodeRun({
            phase: decision.phase,
            agent: decision.agent,
            primary_skill: decision.primary_skill,
            session_id: input.sessionID,
            task_id: decision.task_id,
            task_markdown: input.taskMarkdown,
          })
          nodeRegistered = true
        },
      })
      if (!nodeRegistered) {
        deps.store.addNodeRun({
          phase: decision.phase,
          agent: decision.agent,
          primary_skill: decision.primary_skill,
          session_id: result.session_id,
          task_id: decision.task_id,
          task_markdown: result.task_markdown,
        })
      }
      dispatches.push({
        action: result.action,
        agent: decision.agent,
        phase: decision.phase,
        task_id: decision.task_id,
        session_id: result.session_id,
      })
    }

    return JSON.stringify(
      {
        state: deps.store.readCurrent(),
        decisions,
        dispatches,
      },
      null,
      2,
    )
  }
}

function variantForReportStatus(status: NodeStatus): "info" | "success" | "warning" | "error" {
  switch (status) {
    case "progress":
      return "info"
    case "passed":
      return "success"
    case "needs_user":
      return "warning"
    case "blocked":
    case "failed":
      return "error"
  }
}

function nextDispatchNodeID(state: WorkflowState, decision: Extract<DispatchDecision, { action: "create_session" | "reuse_session" }>): string {
  const index = state.node_runs.length + 1
  const task = decision.task_id ? `-${decision.task_id}` : ""
  return `${String(index).padStart(3, "0")}-${decision.phase}${task}`
}
