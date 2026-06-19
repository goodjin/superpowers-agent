# Isolated TUI Entry And Delivery Rule

## Context

The Superpowers TUI progress panel is built as `dist/tui.js`, while the isolated `superagent` runtime config currently loads only the server plugin entry. That can leave the server hooks active but the TUI route unavailable.

The project workflow should also make feature completion more explicit: after a feature is implemented, run the build/package step, then commit and push the feature changes.

## Scope

- Update `scripts/deploy-superagent-runtime.sh` so the generated isolated OpenCode config loads both plugin entries:
  - `dist/index.js`
  - `dist/tui.js`
- Add a deployment test assertion for both plugin entries.
- Update the request workflow rules in `AGENTS.md`.
- Update deployment module documentation to describe both isolated config entries.

## Non-Goals

- Do not change the TUI panel behavior.
- Do not change the normal `superagent` launcher command shape.
- Do not rework unrelated permission inheritance or skill packaging behavior.

## Validation

- Run the deployment runtime test.
- Run `bun run build`.
- Run the project package step once before committing.
