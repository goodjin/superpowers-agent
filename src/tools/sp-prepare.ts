import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { prepareExplicitStartRun } from "../controller/intake"
import type { SessionOrchestrator } from "../session/orchestrator"
import { noopProgressReporter, type ProgressReporter } from "../progress/reporter"
import type { ProjectStore } from "../state/store"
import type { WorkflowEntrypoint, WorkflowKind } from "../state/types"

export function createPrepareTool(
  store: ProjectStore,
  _orchestrator: Pick<SessionOrchestrator, "dispatch">,
  progress: ProgressReporter = noopProgressReporter,
): ToolDefinition {
  return tool({
    description: "Prepare a Superpowers workflow from a confirmed task. This does not start node work.",
    args: {
      task: tool.schema.string().optional().describe("Confirmed task markdown or plain text"),
      request: tool.schema.string().optional().describe("Backward-compatible confirmed task text"),
      workflow_id: tool.schema.string().optional().describe("Existing workflow id to load for continuation"),
      source_workflow_id: tool.schema.string().optional().describe("Completed workflow id to use as source context"),
      kind: tool.schema.string().optional().describe("Workflow kind: feature, debug, plan-only, review, verify-finish, or parallel-investigate"),
      workflow: tool.schema.string().optional().describe("Backward-compatible workflow kind"),
      entrypoint: tool.schema.string().optional().describe("Confirmed entrypoint"),
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
      const start = prepareExplicitStartRun({
        request,
        workflow,
        entrypoint,
        proposal: args.proposal ?? buildPreparedProposal({ request, workflow, sourceWorkflowID: args.source_workflow_id }),
        parentSessionID: args.session ?? context.sessionID,
      })
      const state = store.prepareRun(start)
      await progress.report({
        stage: "run_started",
        title: "Superpowers workflow",
        message: `${state.workflow} workflow prepared from ${state.entrypoint}.`,
        variant: "success",
      })

      return JSON.stringify(
        {
          state: store.readCurrent(),
          next: "Ask the user to confirm start, then call sp_start with run_id.",
        },
        null,
        2,
      )
    },
  })
}

function buildPreparedProposal(args: { request: string; workflow: WorkflowKind; sourceWorkflowID?: string }): string {
  const source = args.sourceWorkflowID ? `\n\nSource workflow: ${args.sourceWorkflowID}` : ""
  return [`# Superpowers Workflow Proposal`, "", `Workflow: ${args.workflow}`, "", args.request.trim(), source].join("\n")
}
