# Workflow Resume And Dispatch Consistency Bugfix

## Background

`docs/modules` describes the controller/runtime contract for Superpowers workflows. After the module docs were updated, the workflow behavior was simulated against current source and targeted tests were run.

Current targeted tests pass:

- `bun test test/controller-intake.test.ts test/dispatch-transition.test.ts test/sp-record-dispatch.test.ts test/store-node-runs.test.ts test/transitions.test.ts`

Verified as already fixed:

- `sp_start(run_id)` resume now calls durable-state transition logic instead of replaying a fresh entrypoint.
- `sp_report(status="progress")` no longer creates downstream dispatch decisions.
- task graph completion now uses task-level required phases instead of any same-task passed node.

## Confirmed Bugs

### 1. Parallel child reports can close the wrong node

`createReportHandler()` receives `context.sessionID`, but does not pass it into `store.recordNodeResult()`. The store falls back to the latest running node:

- T1 implement session is running.
- T2 implement session is running.
- T1 reports implementation passed.
- The store closes T2 because it is the last running node.

Impact:

- task ownership is corrupted;
- downstream acceptance/review can be scoped to the wrong task;
- node record/output files are written under the wrong node id.

### 2. `entrypoint=execute` still starts from design

A feature workflow with `entrypoint=execute` currently dispatches `sp-designer` from intake. The docs describe `/sp-execute` as entering the feature workflow from the execution gate. The first node should be an implementation node when there is no later durable state to recover from.

Impact:

- `/sp-execute` does not match its documented behavior;
- users can be sent back into design/planning even after explicitly choosing execute.

### 3. `source_workflow_id` is only textual context

`sp_prepare(source_workflow_id=...)` currently embeds the source id into proposal markdown only. It does not import source workflow graph or artifacts into the prepared run.

Impact:

- a derived workflow cannot continue from the source workflow's task graph;
- `sp_start(run_id)` has no structured source context to dispatch runnable tasks;
- the docs' source workflow handoff behavior is not implemented.

## Implemented Fix

### Report/node attribution

- `ProjectStore.recordNodeResult()` now accepts `sessionID` and `agent`.
- `createReportHandler()` passes `context.sessionID` and `context.agent` into the store.
- Resolve node id in this order:
  1. explicit `nodeID`;
  2. running node matching `session_id`;
  3. running node matching both event phase and agent when unambiguous;
  4. a single running node fallback.
- The store throws a clear ambiguity error instead of guessing when multiple running nodes remain.
- Transition task-id inference now prefers the latest non-running node for the reported phase, so a different parallel task that is still running cannot steal the downstream acceptance/check dispatch.

### Execute entrypoint

- Entry dispatch now starts `workflow=feature` plus `entrypoint=execute` with `sp-implementer`.
- Durable resume precedence is unchanged: if an active run already has node state, recovery decisions still come from `node_runs`, `task_graph`, `status`, and `current_phase`.

### Source workflow preparation

- `sp_prepare(source_workflow_id=...)` passes the source id into `ProjectStore.prepareRun()`.
- The store loads the source run and copies the source `task_graph` into the prepared run when present.
- Reusable source markdown artifacts are copied into the new run's artifact directory and state references.
- Proposal text still includes the source workflow id for auditability.
- Source node history is not cloned; node history remains execution evidence for the original workflow.

## Verification

- Added a parallel-report attribution test where T1 and T2 are running and T1's session report closes T1 only.
- Added an `entrypoint=execute` start test that dispatches `sp-implementer`, not `sp-designer`.
- Added a `source_workflow_id` prepare/start test that imports graph context and dispatches runnable implementation tasks.
- Passed targeted workflow tests:

```bash
bun test test/sp-record-dispatch.test.ts test/controller-intake.test.ts test/dispatch-transition.test.ts test/store-node-runs.test.ts test/transitions.test.ts test/tools.test.ts
```

## Design Decision

The source workflow import should start conservatively: copy task graph and markdown artifacts, but not clone node run history. Node history is execution evidence for the old workflow and should remain tied to its original run.
