import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { prepareExplicitStartRun } from "../controller/intake"
import { AGENT_SKILL_MAP } from "../router/modes"
import { buildNodeTaskPacket } from "../session/templates"
import type { SessionOrchestrator } from "../session/orchestrator"
import { noopProgressReporter, type ProgressReporter } from "../progress/reporter"
import type { ProjectStore } from "../state/store"
import type { WorkflowEntrypoint, WorkflowKind } from "../state/types"

export function createPrepareTool(
  store: ProjectStore,
  orchestrator: Pick<SessionOrchestrator, "dispatch">,
  progress: ProgressReporter = noopProgressReporter,
): ToolDefinition {
  return tool({
    description: "Create a planning draft run, dispatch sp-planner, and wait for controller review before execution starts.",
    args: {
      request: tool.schema.string().describe("Confirmed user request"),
      workflow: tool.schema.string().describe("Workflow kind: feature or plan-only"),
      entrypoint: tool.schema.string().describe("Confirmed entrypoint"),
      proposal: tool.schema.string().describe("Proposal markdown that was confirmed by the user"),
      session: tool.schema.string().optional().describe("Controller session id"),
    },
    async execute(args, context) {
      const workflow = args.workflow as WorkflowKind
      if (!["feature", "plan-only"].includes(workflow)) {
        throw new Error("sp_prepare currently supports planning-driven workflows only.")
      }

      const start = prepareExplicitStartRun({
        request: args.request,
        workflow,
        entrypoint: args.entrypoint as WorkflowEntrypoint,
        proposal: args.proposal,
        parentSessionID: args.session ?? context.sessionID,
      })
      const state = store.prepareRun(start)
      await progress.report({
        stage: "run_started",
        title: "Superpowers workflow",
        message: `${state.workflow} planning draft prepared from ${state.entrypoint}.`,
        variant: "success",
      })

      const decision = {
        action: "create_session" as const,
        phase: "plan",
        agent: "sp-planner" as const,
        primary_skill: AGENT_SKILL_MAP["sp-planner"],
        reason: "planning draft prepared",
      }
      const packet = buildNodeTaskPacket({
        state,
        decision,
        nodeID: "001-plan",
      })
      let nodeRegistered = false
      const dispatch = await orchestrator.dispatch({
        project: state.project,
        runID: state.id,
        parentSessionID: state.parent_session_id,
        decision,
        packet,
        async onSessionCreated(input) {
          store.addNodeRun({
            phase: decision.phase,
            agent: decision.agent,
            primary_skill: decision.primary_skill,
            session_id: input.sessionID,
            task_markdown: input.taskMarkdown,
          })
          nodeRegistered = true
        },
      })
      if (!nodeRegistered) {
        store.addNodeRun({
          phase: decision.phase,
          agent: decision.agent,
          primary_skill: decision.primary_skill,
          session_id: dispatch.session_id,
          task_markdown: dispatch.task_markdown,
        })
      }

      return JSON.stringify(
        {
          state: store.readCurrent(),
          dispatches: [
            {
              action: dispatch.action,
              phase: decision.phase,
              agent: decision.agent,
              session_id: dispatch.session_id,
            },
          ],
        },
        null,
        2,
      )
    },
  })
}
