# Superagent Launcher Lifecycle Commands

## Goal

Expose explicit server lifecycle commands through the user-facing `superagent` launcher so stale background server processes can be stopped or restarted without remembering the deployment script path.

## Scope

- Add `superagent start`, `superagent stop`, `superagent restart`, and `superagent status`.
- Route those commands to `scripts/deploy-superagent-runtime.sh`.
- Keep `superagent` with no arguments focused on opening the TUI with `super-agent` selected.
- Keep ordinary OpenCode CLI forwarding for other commands such as `agent list` and `models`.

## Design

The deployment script already owns background server lifecycle with a pid file and port listener detection. The generated launcher should delegate lifecycle verbs back to that script instead of duplicating process control.

`superagent restart` remains the freshness boundary: it rebuilds the plugin, rewrites runtime config and launchers, stops the previous server process, and starts the server again.

## Non-goals

- Do not automatically restart the server when opening the TUI with plain `superagent`.
- Do not make the TUI process own the server lifetime.
- Do not change the isolated runtime root or port defaults.

## Acceptance

- `superagent stop/start/restart/status` are present in the generated launcher.
- Existing no-argument TUI behavior is preserved.
- Existing CLI forwarding behavior is preserved for non-lifecycle commands.
- Deployment docs explain the lifecycle commands and the freshness boundary.
- `stop` handles stale pid files by falling back to the current port listener.
- `start` and `restart` return only after the Web entry asset is reachable and the server is still listening.
