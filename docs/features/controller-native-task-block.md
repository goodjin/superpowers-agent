# Controller Native Task Block

## Context

The Superpowers Controller workflow depends on `state.node_runs`: every child node session must be registered before its first prompt starts, so TUI progress and pending questions can be joined back to the active run. A running `super-agent` session bypassed that path by calling OpenCode's native `task` tool directly with `subagent_type: sp-implementer`. The child session existed, but it was absent from `node_runs`, so the resident TUI surface could not track it reliably.

## Scope

- Deny and hide OpenCode's native `task` tool for `super-agent`.
- Deny and hide native `task` for all `sp-*` node agents to avoid nested, unregistered child sessions.
- Keep Controller-owned dispatch through `sp_start` and `sp_record`, where `create -> register node_run -> prompt` ordering is already enforced.
- Reject `finish/passed` records when a run has a task graph with tasks that do not have passed matching node runs.

## Acceptance

- In default restricted config, `super-agent` has `permission.task = "deny"` and `tools.task = false`.
- In global `permission: "allow"` config, `super-agent` and all `sp-*` agents still deny and hide native `task`.
- Node agents can still load their assigned primary skill when global permission is allow.
- `finish` records require `verification_fresh` and, when a `task_graph` exists, all graph tasks passed in `node_runs`.
- Agent, transition, session orchestrator, and dispatch integration tests cover the control-plane boundaries.
