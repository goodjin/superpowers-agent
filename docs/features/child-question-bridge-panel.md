# Child Question Bridge Panel

## Context

Superpowers Controller can dispatch long-running child sessions. A child session may call OpenCode's `question` tool and wait for user input. Showing only `question running` in the parent progress surface is not enough: the user needs to see the question text and answer or reject it from the parent TUI flow.

## Scope

- Add a parent TUI route for pending child-session questions.
- Show child question text, options, owning session, and request id.
- Let the user submit a reply option or reject the question from the TUI route.
- Keep the compact session surface lightweight, but prefer pending child question text over generic progress when available.

## Non-Goals

- Do not inject child question text into model prompts.
- Do not change `sp_record` or workflow transition semantics.
- Do not invent a second question store; use OpenCode's pending question API as the source of truth.

## Design

The TUI plugin registers:

- route: `superpowers-questions`
- command: `superpowers.questions`

The route reads OpenCode pending questions through:

```text
GET /api/question/request?location[directory]=<project>
POST /api/session/<sessionID>/question/request/<requestID>/reply
POST /api/session/<sessionID>/question/request/<requestID>/reject
```

The bridge filters responses to the active workflow's `node_runs[].session_id`, so parent UI only shows questions owned by current child sessions. The route renders one selectable action per answer option plus a reject action.

The compact progress slot refreshes on a timer. When a child pending question exists, it displays the question header and prompt before falling back to normal progress text.

## Verification

- `bun test test/question-bridge.test.ts test/tui-plugin.test.ts test/progress-panel.test.ts`
- `bun run build`
