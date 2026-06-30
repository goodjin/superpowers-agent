# Controller-Owned User Input Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development before production code changes. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `needs_user` a controller-mediated workflow pause: child sessions report structured questions, runtime notifies the parent controller session, the main conversation asks the user, and `sp_start(run_id, resume_input)` resumes the waiting child.

**Architecture:** Workflow state remains the authority. `sp_report(status="needs_user")` records `pending_question` and stops dispatch, then sends a controller prompt to `parent_session_id`. `sp_start` gains a resume-input branch that validates the active `pending_question`, clears it, and continues the original child session with the user's answer. The old `superpowers-questions` TUI route and OpenCode pending-question bridge are removed so workflow interaction has one user-facing path: the main controller conversation.

**Tech Stack:** TypeScript, Bun test runner, OpenCode plugin `session.prompt`, Solid/OpenTUI plugin slots.

---

## Problem

The current implementation has two competing user-input paths:

- Workflow `needs_user` writes `state.pending_question`, but it does not proactively wake the parent controller session.
- `superpowers-questions` is a separate manually opened TUI route that only handles OpenCode native child questions, not workflow `pending_question`.

This leaves a workflow paused in `waiting_user` without a reliable main-conversation handoff. It also encourages child sessions to interact with the user through a side panel, which conflicts with the controller design.

## Target Flow

```text
child sp_report(needs_user)
-> runtime records node needs_user and workflow waiting_user
-> runtime sends a controller prompt to parent_session_id
-> super-agent asks the user in the main conversation
-> user replies naturally
-> super-agent calls sp_start(run_id, resume_input)
-> runtime validates and clears pending_question
-> runtime sends resume_input to the original child session
-> child continues and reports a normal terminal status
```

## Files

- Modify: `src/session/adapter.ts`
  - Add a parent-session prompt capability that reuses OpenCode `ctx.client.session.prompt`.
- Modify: `src/session/orchestrator.ts`
  - Expose `notifyParent()` and `resumeNode()` or equivalent focused methods without making callers build raw prompt packets.
- Modify: `src/tools/report-handler.ts`
  - On `wait_user`, notify the parent controller session with the structured pending question.
- Modify: `src/tools/sp-start.ts`
  - Add `resume_input` schema and branch.
  - Validate current run is `waiting_user` and `source_node_id` matches `pending_question`.
  - Clear `pending_question`, mark workflow running, and send resume prompt to the original child session.
- Modify: `src/state/store.ts`
  - Add a state transition helper for consuming a pending question.
- Modify: `src/state/types.ts`
  - Add `ResumeInput` type.
- Modify: `src/session/templates.ts`
  - Add prompt builders for parent notification and child resume.
- Modify: `src/agents/index.ts`
  - Teach `super-agent` that controller prompts about pending user input require asking the user and then calling `sp_start(run_id, resume_input)`.
- Modify: `src/tui.ts`
  - Remove `superpowers-questions` route and command.
  - Keep progress route and resident progress slots.
- Delete: `src/tui/question-bridge.ts`
  - Remove the OpenCode native pending-question bridge from workflow code.
- Delete or rewrite: `test/question-bridge.test.ts`
- Modify: `test/sp-record-dispatch.test.ts`
- Modify: `test/controller-intake.test.ts`
- Modify: `test/tui-plugin.test.ts`
- Modify: `test/agents.test.ts`
- Modify: `docs/modules/controller.md`
- Modify: `docs/modules/session-orchestrator.md`
- Modify: `docs/modules/progress.md`
- Modify: `docs/modules/state.md`
- Modify: `docs/modules/testing.md`

## Design Rules

- Child sessions do not use native OpenCode `question` for workflow user input.
- `question.options` stays optional. Missing options means the main conversation should collect free-form user input.
- Plugin code does not decide whether the user should choose or type. It only transports the child question to the parent controller session and transports `resume_input` back to the child.
- `superpowers-questions` is removed. There is no separate workflow question UI.
- Resident TUI slots may show `waiting_user` status, but they do not collect answers.
- `sp_start(run_id)` without `resume_input` preserves `waiting_user` and does not dispatch.
- `sp_start(run_id, resume_input)` is the only public resume path from `waiting_user`.

## Task 1: Add State Resume Primitive

**Files:**
- Modify: `src/state/types.ts`
- Modify: `src/state/store.ts`
- Test: `test/controller-intake.test.ts`

- [ ] **Step 1: Write failing test**

Add a test that prepares a `waiting_user` state with a `pending_question`, then calls the new store helper through `sp_start(run_id, resume_input)` and expects:

```ts
expect(result.state.status).toBe("running")
expect(result.state.current_phase).toBe("<source node phase>")
expect(result.state.pending_question).toBeUndefined()
```

Also assert a mismatched `source_node_id` throws a clear error.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test test/controller-intake.test.ts -t "resume_input"
```

Expected: fail because `resume_input` is not supported.

- [ ] **Step 3: Implement minimal state helper**

Add a `ResumeInput` type and a store method that:

- reads current state by `runID`
- requires `status === "waiting_user"`
- requires `pending_question.source_node_id === resume_input.source_node_id`
- clears `pending_question`
- sets `status: "running"` and restores `phase/current_phase` to the source node phase
- appends an event such as `user_input_resumed`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test test/controller-intake.test.ts -t "resume_input"
```

Expected: pass.

## Task 2: Resume Waiting Child From `sp_start`

**Files:**
- Modify: `src/tools/sp-start.ts`
- Modify: `src/session/orchestrator.ts`
- Modify: `src/session/templates.ts`
- Test: `test/controller-intake.test.ts`

- [ ] **Step 1: Write failing test**

Add a test that:

- creates a run with a `needs_user` node and `pending_question.source_node_id`
- passes `resume_input` to `sp_start`
- uses a fake orchestrator to capture the child resume prompt
- expects the prompt to include the original user answer and the pending question context
- expects no new node session to be created

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test test/controller-intake.test.ts -t "resumes waiting child"
```

Expected: fail because `sp_start` cannot resume a waiting node.

- [ ] **Step 3: Implement minimal resume branch**

In `sp_start.execute()`:

- if `args.resume_input` is present, require `args.run_id`
- call the store resume helper
- find the source `NodeRun`
- call orchestrator resume method with the source child `session_id`
- return fresh `store.readCurrent()` state and a `dispatches` entry like `{ action: "resume_session", session_id, phase, task_id }`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test test/controller-intake.test.ts -t "resumes waiting child"
```

Expected: pass.

## Task 3: Notify Parent Controller On `needs_user`

**Files:**
- Modify: `src/tools/report-handler.ts`
- Modify: `src/session/orchestrator.ts`
- Modify: `src/session/templates.ts`
- Test: `test/sp-record-dispatch.test.ts`

- [ ] **Step 1: Write failing test**

Extend the existing `needs_user` test to inject a fake orchestrator with `notifyParent`. Assert:

```ts
expect(notifications).toHaveLength(1)
expect(notifications[0].sessionID).toBe("session-main")
expect(notifications[0].prompt).toContain("waiting for user input")
expect(notifications[0].prompt).toContain("sp_start")
expect(notifications[0].prompt).toContain("resume_input")
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test test/sp-record-dispatch.test.ts -t "needs_user"
```

Expected: fail because no parent notification is sent.

- [ ] **Step 3: Implement parent notification**

When `decideNextDispatches()` returns `wait_user`, `report-handler` should:

- read the fresh state from store
- build a controller prompt from `pending_question`
- call `orchestrator.notifyParent({ sessionID: state.parent_session_id, agent: "super-agent", prompt })`
- keep returning `decisions` and no child dispatch

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test test/sp-record-dispatch.test.ts -t "needs_user"
```

Expected: pass.

## Task 4: Remove Workflow Question Panel

**Files:**
- Modify: `src/tui.ts`
- Delete: `src/tui/question-bridge.ts`
- Delete or rewrite: `test/question-bridge.test.ts`
- Modify: `test/tui-plugin.test.ts`
- Modify: `test/progress-panel.test.ts` if it references native question bridge behavior

- [ ] **Step 1: Write failing test**

Update TUI tests to assert:

```ts
expect(routes.map((route) => route.name)).toEqual(["superpowers-progress"])
expect(commands.map((command) => command.value)).not.toContain("superpowers.questions")
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test test/tui-plugin.test.ts
```

Expected: fail because the question route and command still exist.

- [ ] **Step 3: Remove panel and bridge**

Remove:

- `createHttpQuestionBridgeClient`
- `filterWorkflowQuestionRequests`
- `buildQuestionActions`
- `createQuestionBridgePanel`
- `superpowers-questions` route
- `superpowers.questions` command

Keep progress route and resident progress slots intact. Sidebar waiting status should come from workflow state/progress only.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test test/tui-plugin.test.ts test/progress-panel.test.ts
```

Expected: pass.

## Task 5: Update Agent Prompt Contract

**Files:**
- Modify: `src/agents/index.ts`
- Modify: `src/skills/runtime-injection.ts`
- Test: `test/agents.test.ts`

- [ ] **Step 1: Write failing test**

Assert `super-agent` prompt includes:

- `waiting_user`
- `pending_question`
- `ask the user`
- `sp_start`
- `resume_input`

Assert node agent prompts still say to use `sp_report(status needs_user)` and not native question.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test test/agents.test.ts
```

Expected: fail on missing resume-input controller instructions.

- [ ] **Step 3: Update prompt text**

Add explicit controller guidance:

- when the controller receives a workflow waiting-user prompt, ask the user in the main conversation
- do not answer on behalf of the user
- after user response, call `sp_start(run_id, resume_input)`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test test/agents.test.ts
```

Expected: pass.

## Task 6: Module Docs And Full Validation

**Files:**
- Modify: `docs/modules/controller.md`
- Modify: `docs/modules/session-orchestrator.md`
- Modify: `docs/modules/progress.md`
- Modify: `docs/modules/state.md`
- Modify: `docs/modules/testing.md`

- [ ] **Step 1: Update module docs**

Document:

- `needs_user` parent notification path
- `sp_start(run_id, resume_input)` resume path
- free-form user input support
- removal of `superpowers-questions`
- TUI progress slots as status-only surfaces

- [ ] **Step 2: Run targeted tests**

Run:

```bash
bun test test/controller-intake.test.ts test/sp-record-dispatch.test.ts test/tui-plugin.test.ts test/agents.test.ts test/progress-panel.test.ts
```

Expected: pass.

- [ ] **Step 3: Run full validation**

Run:

```bash
bun run test
bun run build
bun run test:e2e:opencode
```

Expected: pass.

- [ ] **Step 4: Commit and push**

After validation:

```bash
git add src test docs
git commit -m "fix: route workflow user input through controller session"
git push
```

## Open Questions

- None blocking. The implementation assumes the same `session.prompt` API used for child prompts can also prompt `parent_session_id`. If runtime validation disproves that assumption, fallback is to keep `waiting_user` state and show a clear progress warning while documenting the OpenCode API limitation.

## Self Review

- Spec coverage: covers parent notification, free-form answers, `sp_start(resume_input)`, TUI question panel removal, and docs/tests.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: `resume_input`, `pending_question`, `source_node_id`, and `parent_session_id` names match existing state terminology.
