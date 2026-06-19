# Super Agent Prepare/Start Control

## Background

`super-agent` 之前更像一个带规则提示的普通 agent。它能调用 `sp_route` 和 `sp_start`，但在 planning-driven workflow 里，入口确认、正式计划、用户审查和真正开跑之间没有清楚的控制边界。结果是 controller 容易越级做节点工作，或者在 plan 还没审完时直接进入实现。

这次调整把 planning-driven workflow 收成：

```text
super-agent clarify
-> sp_route
-> user confirms workflow
-> sp_prepare
-> sp-planner writes plan/task_graph
-> super-agent reviews artifacts
-> user confirms execution
-> sp_start
-> plugin dispatches execution nodes
```

## Scope

- 新增 `sp_prepare`，为 planning-driven workflow 创建 draft run，并由插件直接派发 `sp-planner`。
- `sp_start` 支持两种入口：
  - 兼容旧语义：直接创建 active run。
  - 新语义：激活已准备好的 draft run，并按已批准的 plan 派发实现节点。
- `WorkflowState` 新增 `activation`，区分 `draft` 和 `active`。
- draft run 的 `plan passed` 不再自动派发 implementer，而是停在 controller review / user confirmation。
- `sp_next` 增加 controller-facing `controller_action`，减少 `super-agent` 靠 prompt 猜下一步。
- 强化 `super-agent` prompt，明确它只负责理解用户、澄清需求、管理确认点和流程控制，不做节点工作。

## Non-Goals

- 不把 `super-agent` 变成正式 plan 的作者。
- 不让 `sp_route` 变成新的模型级路由 agent。
- 不修改 review、verification、finish 的 gate 语义。
- 不在这次改动里实现 task-level 精细恢复策略；先支持通过 `run_id` 激活已准备好的 run，并可选过滤 `task_id`。

## Tool Semantics

### `sp_route`

- 继续只生成 proposal / resume proposal。
- 对 `feature` 和 `plan-only`，`next_action` 改为 `confirm_prepare`。

### `sp_prepare`

- 输入：`request`、`workflow`、`entrypoint`、`proposal`、`session`
- 只支持 planning-driven workflow：`feature`、`plan-only`
- 行为：
  - 创建 `activation: "draft"` 的 run
  - 写入 `request.md` / `proposal.md`
  - 立即派发 `sp-planner`

### `sp_start`

- 当提供 `run_id` 时：
  - 激活 draft run
  - 清掉 plan review 等待态
  - 读取 `task_graph`
  - 派发实现节点
- 当不提供 `run_id` 时：
  - 保留旧行为，直接创建 active run

## State Changes

`WorkflowState` 新增：

- `activation: "draft" | "active"`

draft planning run 的关键状态：

- 创建后：`activation="draft"`, `phase="plan"`, `status="running"`
- planner 成功后：`phase="awaiting-plan-approval"`, `status="waiting_user"`
- 用户确认并调用 `sp_start(run_id=...)` 后：`activation="active"`, `phase="plan-complete"`，随后继续派发

## Validation

- `test/controller-intake.test.ts`
  - `feature` proposal 返回 `confirm_prepare`
  - `sp_prepare` 创建 draft run 并 dispatch `sp-planner`
  - `sp_start(run_id)` 激活 prepared run 并 dispatch implementer
- `test/dispatch-transition.test.ts`
  - 保持现有 serial review / retry 逻辑
- `test/agents.test.ts`
  - `super-agent` prompt 明确 `route -> prepare -> review -> start`
