import type { DispatchDecision } from "../router/transition"
import type { SessionAdapter } from "./adapter"
import { buildNodeTaskPrompt } from "./templates"
import type { NodeTaskPacket } from "./task-packet"

export type SessionDispatchResult = {
  action: "create_session" | "reuse_session"
  session_id: string
  task_markdown: string
}

export type SessionResumeResult = {
  action: "resume_session"
  session_id: string
}

export type SessionOrchestrator = ReturnType<typeof createSessionOrchestrator>

export function createSessionOrchestrator(adapter: SessionAdapter) {
  return {
    async dispatch(args: {
      project: string
      runID: string
      parentSessionID: string
      decision: Extract<DispatchDecision, { action: "create_session" | "reuse_session" }>
      packet: NodeTaskPacket
      onSessionCreated?: (args: { sessionID: string; taskMarkdown: string }) => Promise<void>
    }): Promise<SessionDispatchResult> {
      const taskMarkdown = buildNodeTaskPrompt(args.packet)
      await adapter.showProgress({
        stage: "dispatch_started",
        title: "Superpowers dispatch",
        message: `Starting ${args.decision.agent} for ${args.packet.node_id}.`,
        variant: "info",
      })
      if (args.decision.action === "reuse_session") {
        await adapter.continueNodeSession({
          sessionID: args.decision.session_id,
          agent: args.decision.agent,
          prompt: taskMarkdown,
        })
        await adapter.showProgress({
          stage: "node_running",
          title: "Superpowers dispatch",
          message: `Reused ${args.decision.agent} for ${args.packet.node_id}.`,
          variant: "info",
        })
        return {
          action: "reuse_session",
          session_id: args.decision.session_id,
          task_markdown: taskMarkdown,
        }
      }

      const sessionID = await adapter.createNodeSession({
        parentSessionID: args.parentSessionID,
        title: `${args.packet.phase}${args.packet.task_id ? ` ${args.packet.task_id}` : ""}`,
        agent: args.decision.agent,
      })
      if (args.onSessionCreated) {
        await args.onSessionCreated({
          sessionID,
          taskMarkdown,
        })
      }
      await adapter.continueNodeSession({
        sessionID,
        agent: args.decision.agent,
        prompt: taskMarkdown,
      })
      await adapter.showProgress({
        stage: "node_running",
        title: "Superpowers dispatch",
        message: `Created ${args.decision.agent} for ${args.packet.node_id}.`,
        variant: "success",
      })
      return {
        action: "create_session",
        session_id: sessionID,
        task_markdown: taskMarkdown,
      }
    },
    async resumeNode(args: {
      sessionID: string
      agent: string
      prompt: string
    }): Promise<SessionResumeResult> {
      await adapter.continueNodeSession({
        sessionID: args.sessionID,
        agent: args.agent,
        prompt: args.prompt,
      })
      await adapter.showProgress({
        stage: "node_resumed",
        title: "Superpowers dispatch",
        message: `Resumed ${args.agent} in ${args.sessionID}.`,
        variant: "info",
      })
      return {
        action: "resume_session",
        session_id: args.sessionID,
      }
    },
    async notifyParent(args: {
      sessionID: string
      agent: string
      prompt: string
    }): Promise<void> {
      await adapter.continueNodeSession({
        sessionID: args.sessionID,
        agent: args.agent,
        prompt: args.prompt,
      })
      await adapter.showProgress({
        stage: "parent_notified",
        title: "Superpowers workflow",
        message: "Notified controller session about pending user input.",
        variant: "warning",
      })
    },
  }
}
