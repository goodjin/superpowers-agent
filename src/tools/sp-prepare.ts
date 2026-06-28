import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { prepareExplicitStartRun } from "../controller/intake"
import type { SessionOrchestrator } from "../session/orchestrator"
import { noopProgressReporter, type ProgressReporter } from "../progress/reporter"
import type { ProjectStore } from "../state/store"
import type { PrepareMode, WorkflowEntrypoint, WorkflowKind } from "../state/types"
import { AGENT_SKILL_MAP } from "../router/modes"
import { buildControllerFeedback } from "../controller/feedback"
import { dispatchWorkflowDecisions } from "./sp-start"

export function createPrepareTool(
  store: ProjectStore,
  orchestrator: Pick<SessionOrchestrator, "dispatch">,
  progress: ProgressReporter = noopProgressReporter,
): ToolDefinition {
  return tool({
    description: "Prepare a Superpowers workflow from a confirmed task. V4 may dispatch managed design or planning draft nodes.",
    args: {
      task: tool.schema.string().optional().describe("Confirmed task markdown or plain text"),
      request: tool.schema.string().optional().describe("Backward-compatible confirmed task text"),
      workflow_id: tool.schema.string().optional().describe("Existing workflow id to load for continuation"),
      source_workflow_id: tool.schema.string().optional().describe("Completed workflow id to use as source context"),
      kind: tool.schema.string().optional().describe("Workflow kind: feature, debug, plan-only, review, verify-finish, or parallel-investigate"),
      workflow: tool.schema.string().optional().describe("Backward-compatible workflow kind"),
      entrypoint: tool.schema.string().optional().describe("Confirmed entrypoint"),
      prepare_mode: tool.schema.enum(["proposal_only", "managed_design", "managed_planning"]).optional().describe("V4 prepare mode."),
      proposal: tool.schema.string().optional().describe("Optional proposal markdown confirmed by the user"),
      session: tool.schema.string().optional().describe("Controller session id"),
    },
    async execute(args, context) {
      if (args.workflow_id) {
        const existing = store.readRun(args.workflow_id)
        if (!existing) throw new Error(`No Superpowers workflow found for ${args.workflow_id}.`)
        return JSON.stringify({ state: existing }, null, 2)
      }

      const request = args.task ?? args.request
      if (!request) throw new Error("sp_prepare requires task or request.")
      const workflow = (args.kind ?? args.workflow ?? "feature") as WorkflowKind
      const entrypoint = (args.entrypoint ?? workflow) as WorkflowEntrypoint
      const prepareMode = choosePrepareMode({
        explicit: args.prepare_mode as PrepareMode | undefined,
        workflow,
        entrypoint,
        sourceWorkflowID: args.source_workflow_id,
      })
      const start = prepareExplicitStartRun({
        request,
        workflow,
        entrypoint,
        proposal: args.proposal ?? buildPreparedProposal({ request, workflow, sourceWorkflowID: args.source_workflow_id }),
        parentSessionID: args.session ?? context.sessionID,
      })
      const state = store.prepareRun({
        ...start,
        sourceWorkflowID: args.source_workflow_id,
        prepareMode,
      })
      const dispatches = await dispatchWorkflowDecisions({
        store,
        orchestrator,
        state,
        startMode: "resume",
        decisions: prepareDispatchDecisions(prepareMode),
      })
      await progress.report({
        stage: "run_started",
        title: "Superpowers workflow",
        message: `${state.workflow} workflow prepared from ${state.entrypoint} in ${prepareMode}.`,
        variant: "success",
      })

      const fresh = store.readCurrent() ?? state
      return JSON.stringify(
        {
          state: fresh,
          prepare_mode: prepareMode,
          dispatches,
          next: nextMessageForPrepareMode(prepareMode),
          controller_feedback: buildControllerFeedback(fresh),
        },
        null,
        2,
      )
    },
  })
}

function choosePrepareMode(args: {
  explicit?: PrepareMode
  workflow: WorkflowKind
  entrypoint: WorkflowEntrypoint
  sourceWorkflowID?: string
}): PrepareMode {
  if (args.explicit) return args.explicit
  if (args.workflow === "plan-only" || args.entrypoint === "plan") return "managed_planning"
  if (args.workflow === "feature" && args.entrypoint !== "execute" && !args.sourceWorkflowID) return "managed_design"
  return "proposal_only"
}

function prepareDispatchDecisions(mode: PrepareMode) {
  if (mode === "managed_design") {
    return [{
      action: "create_session" as const,
      phase: "design",
      agent: "sp-designer" as const,
      primary_skill: AGENT_SKILL_MAP["sp-designer"],
      reason: "prepare candidate design for controller approval",
    }]
  }
  if (mode === "managed_planning") {
    return [{
      action: "create_session" as const,
      phase: "plan",
      agent: "sp-planner" as const,
      primary_skill: AGENT_SKILL_MAP["sp-planner"],
      reason: "prepare candidate plan and task graph for controller approval",
    }]
  }
  return []
}

function nextMessageForPrepareMode(mode: PrepareMode): string {
  switch (mode) {
    case "managed_design":
      return "Wait for the designer candidate output. Approve it with sp_start(run_id, start_action=\"approve_design\") or request a revision."
    case "managed_planning":
      return "Wait for the planner candidate output. Approve it with sp_start(run_id, start_action=\"approve_plan\") or request a revision."
    default:
      return "Ask the user to approve, revise, or cancel the proposal. Start with sp_start(run_id, start_action=\"start_entrypoint\") only after approval."
  }
}

function buildPreparedProposal(args: { request: string; workflow: WorkflowKind; sourceWorkflowID?: string }): string {
  const source = args.sourceWorkflowID ? `\n\nSource workflow: ${args.sourceWorkflowID}` : ""
  return [`# Superpowers Workflow Proposal`, "", `Workflow: ${args.workflow}`, "", args.request.trim(), source].join("\n")
}
