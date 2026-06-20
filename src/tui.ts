import "@opentui/solid/runtime-plugin-support"
import { createElement, insert } from "@opentui/solid"
import { createSignal, onCleanup, type Accessor } from "solid-js"
import { createNodeProgressStore } from "./progress/node-progress"
import { createProjectStore } from "./state/store"
import { buildProgressPanelViewModel, renderCompactProgressText, renderProgressPanelText } from "./tui/progress-panel"
import type { WorkflowState } from "./state/types"

type TuiApi = {
  route: {
    register(routes: Array<{ name: string; render(input?: { params?: Record<string, unknown> }): unknown }>): () => void
    navigate(name: string, params?: Record<string, unknown>): void
  }
  command?: {
    register(callback: () => Array<{ title: string; value: string; description?: string; category?: string; onSelect?: () => void }>): () => void
  }
  slots?: {
    register(plugin: { slots: Record<string, (_context?: unknown, props?: Record<string, unknown>) => unknown> }): string
  }
  state: {
    path: {
      directory: string
    }
    session: {
      status(sessionID: string): { type: string; attempt?: number; message?: string } | undefined
    }
  }
  lifecycle?: {
    onDispose(fn: () => void): () => void
  }
}

export function createTuiPluginModule() {
  return {
    id: "superpowers-controller",
    async tui(api: TuiApi, _options?: unknown, _meta?: unknown) {
      const disposers: Array<() => void> = []
      disposers.push(api.route.register([
        {
          name: "superpowers-progress",
          render() {
            const workflow = createProjectStore(api.state.path.directory)
            const state = workflow.readCurrent()
            const progress = state ? createNodeProgressStore(api.state.path.directory).readRun(state) : {}
            return renderProgressPanelText(
              buildProgressPanelViewModel(state, progress, liveStatusBySession(api, state)),
            )
          },
        },
      ]))
      api.slots?.register({
        slots: {
          session_prompt_right: createCompactProgressSlot(api),
          sidebar_footer: createCompactProgressSlot(api),
        },
      })
      if (api.command) {
        disposers.push(api.command.register(() => [
          {
            title: "Superpowers Progress",
            value: "superpowers.progress",
            description: "Open the Superpowers Controller progress panel",
            category: "Superpowers",
            onSelect: () => api.route.navigate("superpowers-progress"),
          },
        ]))
      }
      api.lifecycle?.onDispose(() => {
        for (const dispose of disposers) dispose()
      })
    },
  }
}

type TextSource = string | Accessor<string>

type CompactProgressSlotOptions = {
  refreshMs?: number
}

export function createCompactProgressSlot(
  api: TuiApi,
  renderText: (value: TextSource) => unknown = createTextElement,
  options: CompactProgressSlotOptions = {},
): (_context?: unknown, props?: Record<string, unknown>) => unknown {
  return (_context, props) => {
    const sessionID = slotSessionID(props)
    const refreshMs = options.refreshMs ?? 1000
    if (refreshMs <= 0) {
      const text = safeCompactProgressText(api, sessionID)
      return text ? renderText(text) : null
    }
    const [text, setText] = createSignal(safeCompactProgressText(api, sessionID))
    const timer = setInterval(() => {
      setText(safeCompactProgressText(api, sessionID))
    }, refreshMs)
    onCleanup(() => clearInterval(timer))
    return renderText(text)
  }
}

function slotSessionID(props?: Record<string, unknown>): unknown {
  return typeof props?.session_id === "string" ? props.session_id : props?.sessionID
}

function safeCompactProgressText(api: TuiApi, sessionID?: unknown): string {
  try {
    return renderCompactProgressText(currentProgressModel(api, sessionID))
  } catch {
    return "SP: progress unavailable"
  }
}

function createTextElement(value: TextSource): unknown {
  const node = createElement("text")
  insert(node, value)
  return node
}

function currentProgressModel(api: TuiApi, sessionID?: unknown) {
  const workflow = createProjectStore(api.state.path.directory)
  const state = workflow.readCurrent()
  if (typeof sessionID === "string" && state && !isWorkflowSession(state, sessionID)) {
    return buildProgressPanelViewModel(null, {}, {})
  }
  const progress = state ? createNodeProgressStore(api.state.path.directory).readRun(state) : {}
  return buildProgressPanelViewModel(state, progress, liveStatusBySession(api, state))
}

function isWorkflowSession(state: WorkflowState, sessionID: string): boolean {
  return sessionID === state.parent_session_id || state.node_runs.some((node) => node.session_id === sessionID)
}

function liveStatusBySession(api: TuiApi, state: WorkflowState | null): Record<string, string> {
  const result: Record<string, string> = {}
  for (const node of state?.node_runs ?? []) {
    result[node.session_id] = formatSessionStatus(api.state.session.status(node.session_id))
  }
  return result
}

function formatSessionStatus(status: { type: string; attempt?: number; message?: string } | undefined): string {
  if (!status) return "unknown"
  if (status.type === "retry") return `retry ${status.attempt ?? "?"}${status.message ? `: ${status.message}` : ""}`
  return status.type
}

export default createTuiPluginModule()
