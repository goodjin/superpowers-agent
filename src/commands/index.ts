export type CommandConfigRecord = Record<string, Record<string, unknown>>

const COMMANDS: Array<[string, string, string]> = [
  ["sp", "Prepare or resume a Superpowers workflow", "Call sp_status, then prepare or continue this task with sp_prepare if needed: $ARGUMENTS"],
  ["sp-design", "Prepare a Superpowers feature workflow", "Call sp_status, then sp_prepare kind=feature for: $ARGUMENTS"],
  ["sp-plan", "Prepare a Superpowers plan-only workflow", "Call sp_status, then sp_prepare kind=plan-only for: $ARGUMENTS"],
  ["sp-prepare", "Prepare a workflow before execution starts", "Call sp_prepare for: $ARGUMENTS"],
  ["sp-debug", "Prepare a Superpowers debugging workflow", "Call sp_status, then sp_prepare kind=debug for: $ARGUMENTS"],
  ["sp-execute", "Start the prepared Superpowers workflow", "Call sp_status, ask for confirmation if needed, then sp_start for: $ARGUMENTS"],
  ["sp-review", "Prepare a Superpowers review workflow", "Call sp_status, then sp_prepare kind=review for: $ARGUMENTS"],
  ["sp-verify", "Prepare a Superpowers verification workflow", "Call sp_status, then sp_prepare kind=verify-finish for: $ARGUMENTS"],
  ["sp-cancel", "Cancel a Superpowers workflow", "Call sp_cancel with a concise reason: $ARGUMENTS"],
]

export function createCommandConfig(): CommandConfigRecord {
  return Object.fromEntries(
    COMMANDS.map(([name, description, template]) => [
      name,
      {
        description,
        agent: "super-agent",
        template,
      },
    ]),
  )
}
