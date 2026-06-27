# PRD V4 Recovery Closure

## Goal

在 v3 PRD 的基础上，把异常路径、恢复路径和用户等待路径补成闭合设计，形成 v4 PRD，作为后续实现和测试的产品依据。

## Background

v3 已经统一了 public tool loop、task-scoped 检查链、runtime memory 优先级、非阻塞派发、启动恢复、用户输入恢复和 progress surface。

进一步模拟各类运行场景后，发现 v3 对部分异常状态的退出条件写得不够硬：

- `sp_prepare` 的 draft planning 路径容易只生成 draft，不生成可批准的 task graph。
- 单个 implement session 被 cancel 后，workflow 可能保持 running，但调度器没有下一步。
- `waiting_user` 状态下收到 progress report，可能错误清空 `pending_question`。
- child prompt 后台派发失败时，node 可能长期停在 running。
- parent notification 失败后，用户可能不知道 workflow 正在等输入。
- `sp_start` 返回值可能不是派发后的最新 state。
- feature workflow 在没有 task graph 时进入 generic implementer，容易跑偏。

## Scope

- 新增 `docs/superpowers/specs/2026-06-27-controller-prd-v4.md`。
- 将 v4 定位为 v3 之后的实现前设计稿。
- 明确所有非终态 workflow 都要有可解释的下一步决策。
- 明确异常场景下的状态落盘、用户可见性、恢复动作和验收用例。
- 更新 `docs/modules/product-docs.md`，把当前 PRD 源指向 v4。

## Design Decisions

- v4 不新增 public tool。仍沿用 `sp_status`、`sp_prepare`、`sp_start`、`sp_cancel`、`sp_report`。
- v4 增加状态不变量：未结束 workflow 不能出现“没有 running node、没有 pending user input、没有 retry/cancel/finish 建议”的空转状态。
- v4 将 `sp_prepare` 收紧为 proposal-only 或 managed draft planning 两种可辨识模式，避免 draft 状态看起来已准备好但没有计划产物。
- v4 要求 `waiting_user` 的问题只能由用户回答路径清空，progress report 不改变等待用户的事实。
- v4 要求 prompt scheduling failure 进入可恢复状态，并在 `sp_status` / TUI 中给出 retry 或 cancel 建议。
- v4 要求 `sp_start` 返回派发后的 fresh state。
- v4 将 “plan passed but no task graph” 视为需要显式用户确认或 blocker 的场景，不作为 feature workflow 的默认执行入口。

## Acceptance

- v4 PRD 覆盖 draft planning、cancel、waiting user、dispatch failure、parent notification failure、stale return state、missing task graph 和 stalled running 等场景。
- v4 PRD 提供状态决策表，能判断每类非终态 workflow 的下一步。
- v4 PRD 提供可测试的验收场景，后续实现可以直接转成测试用例。
- 文档保持产品设计口径，不在本次改动中修改 runtime 代码。
