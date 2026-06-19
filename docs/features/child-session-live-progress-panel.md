# Child Session Live Progress Panel

## Background

Superpowers Controller can create and reuse child node sessions, and it already sends short side-channel progress events when a run starts, a node is dispatched, or a node records its final result. That leaves a gap during long child-session execution: the controller state says a node is `running`, but the main session does not show what the child session is doing.

OpenCode exposes enough runtime signals to close that gap. Server plugins can receive event hooks such as `message.part.updated`, `session.status`, `session.idle`, and `session.error`; TUI plugins can register custom routes and read live OpenCode session state. The implementation should use those signals without adding progress chatter to prompts or model context.

## Scope

- Track child session runtime events for sessions listed in the active workflow's `node_runs`.
- Persist compact progress entries under each run's local state directory.
- Add a Superpowers TUI route/panel for inspecting active run progress.
- Keep the existing toast/log reporter as a short transition signal.
- Keep model-facing prompts unchanged.

## Non-Goals

- Do not rewrite workflow routing, gate evaluation, or dispatch ordering.
- Do not add remote storage or cross-project progress aggregation.
- Do not inject child progress into system prompts, runtime skill injection, or node prompts.
- Do not depend on parsing assistant prose for workflow decisions.

## Design

### Server-Side Event Capture

Add a progress store that maps OpenCode events to node progress entries:

- `message.part.updated` with a child `sessionID` records text, tool, patch, step, and reasoning activity.
- `session.status` records `busy`, `retry`, and `idle` transitions.
- `session.idle` records completion of an active turn.
- `session.error` records provider/runtime errors.

The store should ignore events unless the active workflow contains a `node_run` with the event's `sessionID`. Matching by session id avoids attributing unrelated OpenCode activity to Superpowers.

Progress entries are append-only JSONL files:

```text
.opencode/superpowers/runs/<run-id>/nodes/<node-id>/progress.jsonl
```

Each entry should include:

- `at`
- `kind`
- `session_id`
- `node_id`
- `agent`
- `phase`
- `summary`
- optional `detail`

The state file can keep the durable node status contract unchanged. The panel reads progress entries when it needs richer detail.

### TUI Route

OpenCode separates server plugins and TUI plugins. The existing default export is a server plugin module; the panel should be added as a separate TUI module/export that registers a route such as `superpowers-progress`.

The route should show:

- active run id, workflow, phase, and status
- each node run with agent, phase, task id, session id, and durable status
- live OpenCode session status when available
- the latest stored progress summary for each node
- a compact empty state when no Superpowers run is active

The first version can use native TUI route rendering and OpenCode state APIs. It does not need a custom dashboard framework.

### User Entry

Add a command or keymap-visible route action only if OpenCode requires one for navigation. If route registration is enough, the command can be added later. The important first milestone is that the route exists and renders from real state.

## Validation

- Unit test event-to-progress mapping with unmatched sessions ignored.
- Unit test append/read behavior for node progress JSONL.
- Unit test panel view-model generation for no active run and active run states.
- Keep existing workflow tests passing.
- Run `bun run test`.
- Run `bun run build`.
- Run `bun run test:e2e:opencode` if the implementation touches package exports, plugin installation, or runtime wiring.
