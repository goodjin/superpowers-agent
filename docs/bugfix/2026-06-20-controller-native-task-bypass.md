# Bug Fix: Controller Native Task Bypass

## Problem

- Date: 2026-06-20
- Severity: High
- Impact: A `super-agent` session could create an `sp-implementer` child through OpenCode's native `task` tool. The child ran, but Controller state did not contain a matching `node_runs` entry, so TUI progress and pending-question surfaces could not treat it as part of the active workflow.

## Root Cause

- Location: `src/agents/index.ts`
- Cause: global `permission: "allow"` produced `task: "allow"` for `super-agent` and node agents. The default `super-agent` config also allowed `task` dispatch to `sp-*`. That left a native child-session path outside `sp_start` / `sp_record` orchestration.
- Secondary issue: `src/state/transitions.ts` allowed `finish/passed` after `verification_fresh` without checking whether all task graph tasks had passed node runs.

## Fix

- Deny and hide native `task` for `super-agent` and all node agents.
- Block native `task` in `tool.execute.before` for `super-agent` and all `sp-*` agents, even when no workflow state is active.
- Keep global allow inheritance for non-control-plane permissions such as read, edit, bash, question, plan, and external directory.
- Deny `super-agent` skill loading in global allow mode.
- Reject `finish/passed` when task graph tasks remain incomplete.
- Update agent, state, feature, and module docs.

## Verification

1. `bun test test/agents.test.ts test/transitions.test.ts test/session-orchestrator.test.ts test/sp-record-dispatch.test.ts`
2. `bun run test`
3. `bun run build`
4. `bun run test:e2e:opencode`
5. `bun run deploy:superagent`

## Related Tests

- `test/agents.test.ts`
- `test/transitions.test.ts`
- `test/session-orchestrator.test.ts`
- `test/sp-record-dispatch.test.ts`
