# Bug Fix: Mutually exclusive stalled status wording

## Problem

- Date: 2026-06-26
- Severity: Medium
- Scope: TUI progress status wording.

The resident progress summary showed text like:

```text
sessions 1 running (1 stalled)
```

This made one child session look like two sessions: one running and one stalled.

## Root Cause

The display layer treated `stalled` as an activity modifier layered on top of the durable `running` status. That is useful internally, but user-facing text should not show both states for the same session.

## Fix

Use a single display status per session:

- `stalled` when a running node has stale progress.
- `running` when a running node is still active.

Live session status such as `busy` remains available in the full panel as a separate `live` line, but it is no longer combined into the main status token.

## Validation

```bash
bun test test/progress-panel.test.ts test/tui-plugin.test.ts
bun run test
bun run build
```
