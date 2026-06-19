import type { ToolDefinition } from "@opencode-ai/plugin/tool"
import { noopProgressReporter, type ProgressReporter } from "../progress/reporter"
import type { SessionOrchestrator } from "../session/orchestrator"
import type { ProjectStore } from "../state/store"
import { createNextTool } from "./sp-next"
import { createRecordTool } from "./sp-record"
import { createPrepareTool } from "./sp-prepare"
import { createResetTool } from "./sp-reset"
import { createRouteTool } from "./sp-route"
import { createStateTool } from "./sp-state"
import { createStartTool } from "./sp-start"

export function createTools(
  store: ProjectStore,
  orchestrator?: Pick<SessionOrchestrator, "dispatch">,
  progress: ProgressReporter = noopProgressReporter,
): Record<string, ToolDefinition> {
  const dispatchFallback = orchestrator ?? {
    async dispatch() {
      return {
        action: "create_session" as const,
        session_id: "session-dispatch-unavailable",
        task_markdown: "# Dispatch unavailable\n",
      }
    },
  }
  return {
    sp_state: createStateTool(store),
    sp_route: createRouteTool(store, progress),
    sp_prepare: createPrepareTool(store, dispatchFallback, progress),
    sp_start: createStartTool(store, orchestrator, progress),
    sp_next: createNextTool(store),
    sp_record: createRecordTool(store, orchestrator, progress),
    sp_reset: createResetTool(store),
  }
}
