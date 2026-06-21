# Resident Progress Surface

## Intent

The main SuperAgent TUI should always expose the active Superpowers child-session status when a workflow is running. OpenCode's native Todo panel can show `todowrite` state, but that is session-local and does not prove the Superpowers progress surface is visible.

## Problem

The existing TUI integration registers a full progress route and compact resident slots. Runtime evidence showed `node_runs` and `progress.jsonl` were present for a running child session, while the active TUI still did not show the Superpowers line. A follow-up runtime check also showed prompt-adjacent slots could crowd the input box, so resident progress should prefer main-session bottom/sidebar surfaces and keep any prompt-side fallback short.

## Scope

- Keep progress side-channel only; do not inject child status into prompt/model context.
- Register the compact progress renderer in known persistent host slots that do not sit beside the prompt/input area.
- Register `session_prompt_right` only as a short fallback indicator.
- Do not register compact progress into `home_prompt_right`.
- Keep the existing `superpowers-progress` route for full detail.
- Mark running child sessions as `stalled` when their latest progress entry is older than the display threshold.
- Preserve question bridge precedence: pending child questions still override ordinary progress in compact text.

## Acceptance

- A slot with no session props still renders the active workflow's current child progress.
- Parent session and child session props both render the same active child progress.
- Unrelated session props still hide the Superpowers line.
- The compact line indicates `stalled` for running nodes whose latest progress is stale.
- Prompt-side fallback is truncated and not used for full progress detail.
- TUI route/command registration remains intact.
