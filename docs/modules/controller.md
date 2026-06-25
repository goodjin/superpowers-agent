# Controller Module

## Responsibility

controller 模块负责把用户确认后的任务整理成可准备、可启动的 workflow 输入。它不执行节点工作；子会话创建由 session orchestrator 负责，run 状态持久化由 state store 负责。

## Files

- `src/controller/proposal.ts`：生成 workflow proposal 和 resume proposal。
- `src/controller/intake.ts`：把确认后的 proposal 转成 `startRun` 输入。
- `src/tools/sp-status.ts`：查询当前 workflow，或在没有当前 workflow 时返回未完成历史列表。
- `src/tools/sp-prepare.ts`：创建 prepared workflow，不派发节点会话。
- `src/tools/sp-start.ts`：确认后创建 active run，或激活已准备好的 draft run，并派发起始节点或 runnable tasks。
- `src/tools/sp-cancel.ts`：取消 workflow、task 或 session。
- `src/tools/sp-report.ts`：节点会话汇报结果、问题、产物和 task graph。
- `src/progress/reporter.ts`：为 route/start 提供用户可见的流程提示契约。

## Flow

1. `super-agent` 先调用 `sp_status` 判断是否有当前 workflow 或未完成历史 workflow。
2. 新任务或需要重新派发时，`super-agent` 调用 `sp_prepare`，传入确认后的 task、workflow kind 和可选 source workflow。
3. `sp_prepare` 创建 `draft` run，写入 task/proposal/state 文件，但不派发节点会话。
4. 用户确认开始后，`super-agent` 调用 `sp_start`。
5. `sp_start` 激活 prepared run，并根据 workflow kind 派发 designer、planner、debugger、investigator、verifier 或已有 task graph 中的 runnable implementer。
6. 节点会话完成或需要追加中间结果时调用 `sp_report`。
7. runtime 根据 transition 规则派发后续节点，直到 finish、waiting_user、blocked、failed 或 canceled。

## Notes

- public tool surface 只包含 `sp_status`、`sp_prepare`、`sp_start`、`sp_cancel`、`sp_report`。
- `sp_prepare` 是 workflow 准备入口；`sp_start` 只启动已有 workflow/task，不负责重新拆任务。
- `/sp-execute` 会启动 `feature` workflow，但 entrypoint 是 `execute`，用于从中间阶段进入执行门禁。
- proposal markdown 给用户和 super-agent 读；插件判断只依赖结构化字段。
- progress 是 side-channel UI/log 提示，不进入模型上下文，也不改变确认语义。
- 产品展示名是 `Superpowers Controller`。当前模块运行在 OpenCode adapter 上，但 controller 的职责描述不应绑定单一 harness。
