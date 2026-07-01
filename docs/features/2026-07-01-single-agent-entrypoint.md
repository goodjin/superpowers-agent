# Single Agent Entrypoint

## Goal

Remove dynamic slash command registration and make `super-agent` the only user-facing entrypoint.

## Scope

- Stop injecting `/sp`, `/sp-design`, `/sp-plan`, `/sp-prepare`, `/sp-debug`, `/sp-execute`, `/sp-review`, `/sp-verify`, and `/sp-cancel` command config.
- Remove packaged markdown command assets.
- Keep internal node agents registered as subagents because runtime dispatch depends on `sp-planner`, `sp-implementer`, `sp-verifier`, and related node roles.
- Update docs so users start by selecting `super-agent`, not by running slash commands.
- Update install/package tests and release validation.

## Acceptance

- Published package no longer includes `assets/commands/*`.
- Plugin config hook no longer mutates `hostConfig.command`.
- `doctor` no longer reports a commands check.
- `super-agent` and internal `sp-*` agents still appear in OpenCode 1.16.2 agent list.
- Tests and npm dry-run pass.
