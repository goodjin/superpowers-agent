import { tool, type ToolDefinition } from "@opencode-ai/plugin/tool"
import { parseSpRecordInput } from "../state/record-schema"
import type { ProjectStore } from "../state/store"

export function createRecordTool(store: ProjectStore): ToolDefinition {
  return tool({
    description: "Record a Superpowers node result, artifact, evidence, and validated gate update.",
    args: {
      event: tool.schema.string().describe("Node event enum: intake, question, design, plan, debug, red-test, implementation, spec-review, code-review, verification, or finish"),
      status: tool.schema.string().describe("Node status enum: passed, failed, blocked, or needs_user"),
      summary: tool.schema.string().describe("Short markdown summary of the node result"),
      gates: tool.schema.record(tool.schema.string(), tool.schema.boolean()).optional().describe("Structured gate updates keyed by known gate name"),
      artifacts: tool.schema.record(tool.schema.string(), tool.schema.string()).optional().describe("Markdown artifact bodies keyed by known artifact name"),
      checks: tool.schema.string().optional().describe("Markdown checks or command evidence. The plugin stores this as text."),
      findings: tool.schema.string().optional().describe("Markdown findings. The plugin stores this as text."),
      question: tool.schema
        .object({
          prompt: tool.schema.string(),
          options: tool.schema.array(tool.schema.string()).optional(),
        })
        .optional()
        .describe("Question for the user when status is needs_user"),
      task_graph: tool.schema
        .object({
          tasks: tool.schema.array(
            tool.schema.object({
              id: tool.schema.string(),
              title: tool.schema.string(),
              summary: tool.schema.string(),
              depends_on: tool.schema.array(tool.schema.string()),
              files: tool.schema.array(tool.schema.string()).optional(),
              test_commands: tool.schema.array(tool.schema.string()).optional(),
            }),
          ),
        })
        .optional()
        .describe("Plan task graph. depends_on is the only parallelism contract."),
    },
    async execute(args) {
      const next = store.record(parseSpRecordInput(args))
      return JSON.stringify(next, null, 2)
    },
  })
}
