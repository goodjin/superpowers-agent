# Bug Fix: Runtime resume plan-complete loop

## Problem

- Date: 2026-06-26
- Severity: High
- Scope: Superpowers Controller runtime resume, transition dispatch, task graph completion, and finish recovery.

A live isolated run reached `phase/current_phase=plan-complete` with a populated `task_graph` and completed task checks. Calling `sp_start(run_id)` resumed the durable run, but the runtime dispatched new plan/design nodes instead of continuing to implementation or finish.

Observed symptom:

- `032-plan` was created and reported `passed`.
- The workflow stayed around `plan-complete`.
- No implementer or finisher was dispatched.

This created a state-machine loop:

```text
plan-complete -> dispatch plan -> plan passed -> no durable-state transition to implement/finish
```

## Root Cause

The runtime mixed fresh-start behavior with durable-run resume behavior.

1. `sp_start(run_id)` reused startup decisions that synthesized an `intake passed` or `plan passed` event. That is valid for a new or just-approved run, but wrong for an active run that already has `node_runs`, `task_graph`, waiting state, canceled state, or finish/check results.
2. `sp_report(status="progress")` could still flow into dispatch calculation instead of remaining a non-terminal update.
3. Task graph completion treated task status too loosely. A task should be considered passed only when implementation and required checks pass, not when any node with the same `task_id` is `passed`.
4. A blocked or failed `finish` node could be hidden by workflow-level `blocked/failed` state before transition had a chance to retry finish.

## Fix

- Split `sp_start` into two modes:
  - new start: use workflow entrypoint/start decisions.
  - resume: call transition on durable state directly.
- Make `progress` reports non-dispatching.
- Add task-level completion helpers in `src/state/task-status.ts`:
  - required phases per workflow.
  - task-level passed calculation.
  - running/failed/passed task sets for graph scheduling.
- Update transition recovery order:
  - preserve waiting-user and canceled workflow boundaries.
  - avoid duplicating running nodes.
  - recover failed checks by reusing implementer where possible.
  - dispatch runnable task graph tasks from durable state.
  - dispatch `sp-finisher` when all task graph checks pass.
  - retry `finish` when the latest finish node is blocked or failed.
- Preserve `waiting_user` and pending questions when an existing active run is resumed.

## Files

- `src/tools/sp-start.ts`
- `src/router/transition.ts`
- `src/state/task-status.ts`
- `src/state/transitions.ts`
- `src/state/store.ts`
- `test/controller-intake.test.ts`
- `test/dispatch-transition.test.ts`
- `test/sp-record-dispatch.test.ts`
- `test/transitions.test.ts`
- `docs/modules/controller.md`
- `docs/modules/state.md`
- `docs/modules/session-orchestrator.md`
- `docs/modules/testing.md`

## Validation

Focused checks:

```bash
bun test test/controller-intake.test.ts -t "sp_start resume redispatches a finish node reported as blocked"
bun test test/dispatch-transition.test.ts test/controller-intake.test.ts test/sp-record-dispatch.test.ts test/transitions.test.ts
```

Full gates:

```bash
git diff --check
bun run test
bun run build
bun run test:e2e:opencode
```

## Acceptance Criteria

- `sp_start(run_id)` never falls back to design/plan entrypoint when durable state already contains runnable tasks, running nodes, waiting-user state, canceled state, completed checks, or finish state.
- `progress` reports update state/report files without dispatching downstream sessions.
- A task graph dependent task unlocks only after the dependency reaches task-level passed.
- A completed task graph dispatches `sp-finisher`; `finish` decision itself does not create a session.
- A blocked/canceled/failed finish node resumes through finish retry or explicit blocked recovery, not through workflow entrypoint.
