# Superpowers Controller PRD V4

## 1. Version

- Version: v4
- Date: 2026-06-27
- Status: implementation-ready PRD draft
- Supersedes:
  - `docs/superpowers/specs/2026-06-27-controller-prd-v3.md`
  - `docs/superpowers/specs/2026-06-11-controller-final-design.md`
  - `docs/superpowers/plans/2026-06-09-superpowers-controller-mvp.md`

v4 继承 v3 的 public tool loop、agent 边界、task-scoped 检查链、runtime memory 优先、非阻塞派发、启动恢复、用户输入恢复和 TUI progress surface。

v4 的新增重点是异常路径闭合：任何未结束 workflow 都要能回答四个问题：

1. 当前事实是什么。
2. 是否有 live node 正在运行。
3. 如果没有 live node，下一步是等待用户、重试、取消、阻塞还是结束。
4. 这个判断在哪里落盘，用户在哪里能看到。

## 2. Product Positioning

Superpowers Controller 是面向 coding agents 的 workflow control plugin。插件拥有 workflow state machine、节点派发、恢复、取消、用户输入路由、进度可见性和结果落盘。

模型只在被分配的 node session 里执行当前 scoped task，并通过 `sp_report` 提交结构化结果。模型不能自己决定下一个 node，不能通过 native task 或 native question 绕过 controller。

核心循环保持不变：

```text
sp_status -> sp_prepare -> sp_start -> child node -> sp_report -> transition
                         \-> sp_cancel
```

## 3. V4 Goals

- 让所有非终态 workflow 都有明确的 next decision，避免空转、卡住和静默跑偏。
- 补齐 draft planning、用户等待、取消、派发失败、通知失败、stale state 返回和缺失 task graph 的设计约束。
- 把异常场景写成状态机规则和验收场景，后续实现时可以直接落到测试。
- 保持 public tool surface 稳定，不通过增加工具掩盖状态机问题。
- 保持 progress side-channel 定位。progress 可以提升可见性，不能驱动 transition，也不能清除 gate 或 pending question。

## 4. Non-Goals

- 不在 v4 中新增 public tool。
- 不在 v4 中实现完整多 investigator 的 `parallel-investigate`。当前仍按单 investigator + finish 汇总记录。
- 不把 durable `running` 当成 live busy。
- 不让 node agent 使用 native task 或 native question。
- 不在本 PRD 中描述具体代码改动；实现计划和代码变更另行立项。

## 5. Public Tool Surface

v4 公开工具仍为五个：

```text
sp_status
sp_prepare
sp_start
sp_cancel
sp_report
```

### 5.1 `sp_status`

`sp_status` 是只读事实查询。它必须区分：

- `runtime`: runtime memory 中的当前事实。
- `durable`: `.opencode/superpowers/` 下的恢复和审计快照。
- `live`: host API 可确认的 child session 运行状态。
- `progress`: UI/log 可见性事件。
- `recommended_next`: controller 根据当前 state 算出的下一步建议。

`recommended_next` 不能只写自由文本。它至少要能表达：

```ts
type RecommendedNext =
  | { action: "wait_running_node"; node_id: string; session_id: string }
  | { action: "answer_pending_question"; run_id: string; node_id: string }
  | { action: "retry_dispatch"; run_id: string; node_id: string }
  | { action: "retry_node"; run_id: string; task_id?: string; phase: string }
  | { action: "cancel_node"; run_id: string; node_id: string }
  | { action: "cancel_workflow"; run_id: string }
  | { action: "approve_plan"; run_id: string }
  | { action: "revise_plan"; run_id: string }
  | { action: "finish"; run_id: string }
  | { action: "blocked"; reason: string };
```

### 5.2 `sp_prepare`

`sp_prepare` 用于把用户请求整理成可确认的 workflow draft。v4 支持两种模式，返回值必须说明当前模式：

```ts
type PrepareMode = "proposal_only" | "managed_draft_planning";
```

#### Proposal-only

适合轻量任务和用户还没有确认执行范围的场景。

行为：

- 写入 request、proposal、draft state。
- 不派发 child node。
- 返回 `activation: "draft"` 和 `prepare_mode: "proposal_only"`。
- `sp_start(run_id)` 只能激活入口节点，不能假装已有 task graph。

#### Managed draft planning

适合 feature、plan-only、复杂 bugfix 和需要任务拆分的场景。

行为：

- 创建 `activation: "draft"` 的 run。
- 派发 planner node，但 planner 只能产出 plan、acceptance criteria 和 `task_graph`。
- planner passed 后 workflow 进入 `awaiting_plan_approval`。
- 用户批准后调用 `sp_start(run_id)` 激活 approved plan。
- 用户要求修改时，controller 派发 plan revision，不进入 implementation。

v4 要求 `sp_prepare` 不再产生“看起来已准备好执行，但没有 task graph、也没有 planner 正在运行”的 draft。

### 5.3 `sp_start`

`sp_start` 启动、批准、恢复或重试 workflow。v4 要求返回派发后的 fresh state，即 `store.readCurrent()` 或等价的新快照。

行为规则：

- `draft + proposal_only`: 激活 entrypoint，按入口派发第一个节点。
- `draft + awaiting_plan_approval`: 用户批准后激活 task graph，派发第一个 runnable implementation task。
- `active + waiting_user + no resume_input`: 返回 waiting 状态，不清空 `pending_question`。
- `active + waiting_user + resume_input`: 校验 `source_node_id` 后恢复原 child session。
- `active + recovered_unknown`: 不自动 retry，返回 inspect/retry/cancel 建议。
- `active + dispatch_failed`: 支持 retry dispatch 或 cancel。
- `active + blocked/interrupted`: 按状态决策表给出 retry/cancel/blocked。
- `active + running live node`: 返回 wait，不重复派发。

### 5.4 `sp_report`

`sp_report` 是 node result 进入 runtime 的唯一入口。

`status: "progress"` 的 v4 约束：

- 只写 progress history、report summary、artifact draft 和 `reported_at`。
- 不关闭 node。
- 不触发 downstream dispatch。
- 不修改 workflow terminal status。
- 不清空 `pending_question`。
- 如果 workflow 已经是 `waiting_user`，progress 不得把 workflow 改回 `running`。

终态或门禁状态仍为：

```text
passed
failed
blocked
needs_user
```

`needs_user` 必须携带 `question.prompt`，并写入 `pending_question`。只有用户回答路径可以清空它。

### 5.5 `sp_cancel`

`sp_cancel` 可以取消 workflow、task 或 session。v4 要求取消后的 workflow 必须有可见 next decision：

- 取消整个 workflow: workflow 进入 `canceled`。
- 取消单个 running node: node 进入 `canceled`，workflow 根据 task graph 和 phase 进入 `blocked` 或 `waiting_user_decision`。
- 取消 check node: 可以建议 retry check、retry implementer、cancel workflow。
- 取消 implement node: 不允许 workflow 继续保持无 live node 的 `running`。

## 6. Runtime State Model

v4 保留 v3 的 runtime memory 优先原则。durable files 用于恢复、审计和 TUI 降级读取。

新增或收紧的状态字段：

```ts
type WorkflowStatus =
  | "intake"
  | "running"
  | "awaiting_plan_approval"
  | "waiting_user"
  | "waiting_user_decision"
  | "blocked"
  | "passed"
  | "failed"
  | "canceled"
  | "recovered_unknown";

type NodeRunStatus =
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "needs_user"
  | "interrupted"
  | "dispatch_failed"
  | "notification_failed"
  | "canceled";
```

`waiting_user_decision` 用于 workflow 需要用户选择 retry、cancel、approve 或 revise，但不是 node 提出的业务问题。

`dispatch_failed` 表示 child session 已注册或准备注册，但 prompt scheduling 没有成功完成。它不能长期伪装成 `running`。

`notification_failed` 表示 node 已经进入 `needs_user`，但 parent controller prompt 通知失败。workflow 仍是 `waiting_user`，TUI 和 `sp_status` 必须显示 pending question。

## 7. State Invariants

v4 要求 runtime 持续满足以下不变量：

### 7.1 Non-Terminal Closure

任何未结束 workflow 都必须满足至少一个条件：

- 有 host API 可确认的 live running node。
- 有 `pending_question` 等待用户回答。
- 有 `awaiting_plan_approval` 等待用户批准或修改计划。
- 有 `recommended_next` 指向 retry、cancel、finish 或 blocked reason。
- 有明确的 terminal transition 正在落盘。

如果以上都不成立，workflow 必须进入 `blocked`，并写明 `blocked_reason`。

### 7.2 Waiting User Preservation

`pending_question` 是用户等待状态的事实来源。以下事件不得清空它：

- `sp_report(status="progress")`
- TUI refresh
- startup reconciliation
- parent notification retry
- `sp_start(run_id)` without `resume_input`

只有 `sp_start(run_id, resume_input)` 在校验来源 node 后可以清空 `pending_question`。

### 7.3 Dispatch Failure Visibility

后台 prompt scheduling 失败时，runtime 必须：

- 记录 node status 为 `dispatch_failed`。
- 写入 `events.jsonl` 和 node `record.json`。
- workflow 进入 `blocked` 或 `waiting_user_decision`。
- `sp_status` 返回 `recommended_next: retry_dispatch | cancel_node | cancel_workflow`。
- TUI 显示失败节点、失败原因和可选操作。

### 7.4 Fresh Return State

任何会改变 state 的工具调用，返回给调用方的 state 必须反映本次变更后的事实。

`sp_start` 在派发后不能返回派发前的 stale state。返回值至少要包含新 `node_runs`、workflow status、current phase 和 recommended next。

### 7.5 Task Graph Guard

feature/debug/review/verify-finish 进入 implementation 前，必须有 task scope。

允许的 task scope 来源：

- approved `task_graph` 中的 runnable task。
- debug root cause 产生的 repair task。
- 用户显式选择 single-task execution。

如果 plan passed 但没有 `task_graph`，runtime 不能默认派发 generic implementer。它应进入 `waiting_user_decision` 或 `blocked`，要求补 plan、转 single-task 或取消。

## 8. State Decision Table

| Current fact | Workflow status | Node status | Decision |
|---|---|---|---|
| host confirms child still running | `running` | `running` | `wait_running_node` |
| durable says running but host cannot confirm after restart | `recovered_unknown` | `interrupted` | `retry_node` or `cancel_node` after user decision |
| node asks business question | `waiting_user` | `needs_user` | `answer_pending_question` |
| parent notification failed | `waiting_user` | `notification_failed` | show pending question, retry notify or answer through controller |
| child prompt scheduling failed | `blocked` or `waiting_user_decision` | `dispatch_failed` | `retry_dispatch` or cancel |
| implement node canceled | `waiting_user_decision` | `canceled` | retry implement, choose another task, or cancel workflow |
| check node failed | `running` or `blocked` | `failed` | dispatch retry implementer when policy allows |
| non-check node failed | `blocked` | `failed` | retry same phase or cancel |
| node blocked without user question | `blocked` | `blocked` | retry same node, revise scope, or cancel |
| plan passed with task graph | `awaiting_plan_approval` | `passed` | approve or revise plan |
| plan passed without task graph | `waiting_user_decision` or `blocked` | `passed` | require graph, single-task confirmation, or cancel |
| all task-level gates passed | `running` | latest passed | dispatch finish |
| finish passed | `passed` | `passed` | terminal |
| workflow canceled | `canceled` | any | terminal |

调度器不能对未结束 workflow 返回空 dispatch list，除非当前决策已经明确是 `wait_running_node`、`answer_pending_question`、`approve_plan`、`blocked` 或 terminal。

## 9. Workflow Updates

### 9.1 Feature

推荐的 managed draft flow：

```text
sp_prepare(managed_draft_planning)
-> planner draft node
-> awaiting_plan_approval
-> sp_start(run_id) after approval
-> implement runnable task
-> acceptance
-> verification
-> code-review
-> next runnable task or finish
```

除非用户明确转成 single-task execution，否则 feature workflow 不能从缺少 task graph 的 plan 进入 implementation。

### 9.2 Debug

debug workflow 在 repair implementation 前需要先有 root cause：

```text
debug-root-cause
-> repair task
-> implement
-> acceptance
-> verification
-> code-review
-> finish
```

如果 root cause 节点 blocked、canceled 或 interrupted，controller 应询问 retry/cancel，而不是直接派发 repair。

### 9.3 Plan-Only

plan-only flow 可以在 approved plan 后结束：

```text
planner
-> awaiting_plan_approval
-> finish or passed
```

如果 plan-only planner 没有返回 plan artifact，workflow 进入 `blocked`。

### 9.4 Review And Verify-Finish

review 和 verify-finish 可以把 failed check 回派给 implementer，但前提是存在 scoped repair task。如果没有 task scope，controller 应请求用户决策，或带原因进入 blocked。

### 9.5 Parallel-Investigate

v4 当前范围保持为：

```text
investigator
-> finish
```

名称可以为兼容性保留，但 status 输出不能暗示已派发多个 investigator，除非 runtime 确实创建了多个 investigator session。

## 10. User Input And Notification

当 node 需要用户输入时：

1. `sp_report(status="needs_user")` writes node result.
2. Runtime writes `pending_question`.
3. Workflow status becomes `waiting_user`.
4. Controller schedules parent prompt.
5. TUI and `sp_status` show the pending question immediately.
6. User answer resumes through `sp_start(run_id, resume_input)`.

如果第 4 步失败：

- Do not clear `pending_question`.
- Mark node as `notification_failed` or attach notification error to the node record.
- Keep workflow `waiting_user`.
- Expose the pending question through `sp_status` and TUI.
- Allow notification retry, direct controller answer, or workflow cancel.

## 11. Recovery And Reconciliation

Startup reconciliation keeps the v3 rule:

- durable `running` does not imply live child session.
- unknown old running nodes become `interrupted`.
- active running workflow becomes `recovered_unknown`.
- draft workflow remains draft.
- runtime does not auto-dispatch replacement work.

v4 adds a follow-up requirement: after reconciliation, `sp_status` must compute a concrete `recommended_next`. A recovered workflow cannot appear as a generic current run with no action.

## 12. Persistence And Audit

会改变 state 的事件需要更新：

- `state.json`
- `events.jsonl`
- `changelog.md`
- node `record.json`
- node `progress.jsonl` when applicable
- task report markdown when applicable

异常状态记录需要包含：

- failure kind: dispatch, notification, cancellation, interruption, blocked, missing artifact, missing task graph.
- affected `run_id`, `node_id`, `session_id`, `task_id` when available.
- recommended next action.
- whether the action is automatic or requires user confirmation.

## 13. TUI And Progress Requirements

TUI surfaces remain:

- `superpowers-progress` route.
- `superpowers.progress` command.
- `app_bottom`.
- `sidebar_content`.
- `sidebar_footer` fallback.

v4 requires abnormal states to be visible in `sidebar_content`:

- pending question.
- plan awaiting approval.
- dispatch failed.
- notification failed.
- recovered unknown.
- canceled node with workflow still open.
- blocked because task graph is missing.

progress events 可以描述这些状态，但不能驱动 transition。

## 14. Acceptance Scenarios

v4 实现需要通过以下场景后再验收：

1. `sp_prepare(managed_draft_planning)` creates draft run, dispatches planner, and planner passed with task graph enters `awaiting_plan_approval`.
2. Approving an `awaiting_plan_approval` run with `sp_start(run_id)` dispatches the first runnable task and returns fresh state containing the new node run.
3. Planner passed without task graph does not dispatch generic implementer for feature workflow; it asks for graph, single-task confirmation or cancellation.
4. Canceling a running implement node does not leave workflow as `running` with no live node and no next decision.
5. `sp_report(status="progress")` while workflow is `waiting_user` preserves `pending_question` and does not change workflow to `running`.
6. Child prompt scheduling failure records `dispatch_failed`, moves workflow to recoverable state and exposes retry/cancel in `sp_status`.
7. Parent notification failure keeps `pending_question` visible through `sp_status` and TUI.
8. `sp_start` after dispatch returns fresh state, not the state captured before dispatch.
9. Startup recovery turns stale durable running nodes into `interrupted` and returns retry/cancel/inspect suggestions.
10. `decideNextDispatches` or equivalent dispatcher never returns `[]` for an unfinished workflow unless `recommended_next` explains wait, user input, approval, blocked or terminal state.
11. Review/verify-finish failures route to implementer only when scoped repair task exists.
12. Parallel-investigate status accurately reports the number of investigator sessions actually dispatched.

## 15. Migration Notes From V3

| V3 risk | V4 decision |
|---|---|
| `sp_prepare` creates draft but may not create executable plan | introduce `proposal_only` vs `managed_draft_planning` |
| canceled implement node can leave workflow silently stuck | canceled nonterminal node forces retry/cancel/user-decision state |
| progress can accidentally override waiting user | progress cannot clear `pending_question` or move `waiting_user` to `running` |
| background prompt failure leaves stale running | record `dispatch_failed` and expose retry/cancel |
| parent notification failure is not user-visible enough | keep waiting state and expose pending question in status/TUI |
| `sp_start` may return stale state | return fresh post-dispatch state |
| plan without task graph can run generic implementer | require task scope or user confirmation |
| incomplete workflow can have no dispatches | add non-terminal closure invariant and decision table |

当前实现和测试可能仍停留在 v3 行为。v4 是下一轮实现的目标 PRD。
