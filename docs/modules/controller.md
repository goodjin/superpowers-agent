# Controller Module

## Responsibility

controller 模块负责把用户请求从“意图识别”推进到“可确认的 workflow proposal”，并在用户确认后整理 prepare/start 所需参数。它不创建 node record；子会话创建由 session orchestrator 负责，run 状态持久化由 state store 负责。

## Files

- `src/controller/proposal.ts`：生成 workflow proposal 和 resume proposal。
- `src/controller/intake.ts`：把确认后的 proposal 转成 `startRun` 输入。
- `src/tools/sp-route.ts`：调用 proposal builder，只返回 proposal，不创建 run。
- `src/tools/sp-prepare.ts`：创建 planning draft run，并派发 `sp-planner`。
- `src/tools/sp-start.ts`：确认后创建 active run，或激活已准备好的 draft run。
- `src/progress/reporter.ts`：为 route/start 提供用户可见的流程提示契约。

## Flow

1. `sp_route` 接收 request/command。
2. controller 读取 active state。
3. 如果没有 active run，按 route 结果生成 proposal：
   - `workflow`
   - `entrypoint`
   - `requires_confirmation`
   - `markdown`
   - `next_action`
4. 如果已有 active run，生成 resume proposal。
5. 对 planning-driven workflow，用户确认 proposal 后，`sp_prepare` 先创建 `draft` run 并派发 `sp-planner`。
6. planner 记录 plan 后，controller 审查 artifacts，并向用户请求最终执行确认。
7. 用户确认后，`sp_start` 激活 draft run；非 planning workflow 仍可直接 `sp_start` 创建 active run。
8. `sp_route` 发送 `waiting_user_confirmation` progress，`sp_prepare` / `sp_start` 发送 `run_started` progress。

## Notes

- `sp_route` 不创建 run，这是 proposal-before-run 的验收边界。
- `sp_prepare` 是 planning-driven workflow 的正式 planning 入口；`sp_start` 不再承担“先出 plan 再开跑”的双重职责。
- `/sp-execute` 会启动 `feature` workflow，但 entrypoint 是 `execute`，用于从中间阶段进入执行门禁。
- proposal markdown 给用户和 super-agent 读；插件判断只依赖结构化字段。
- progress 是 side-channel UI/log 提示，不进入模型上下文，也不改变确认语义。
- 产品展示名是 `Superpowers Controller`。当前模块运行在 OpenCode adapter 上，但 controller 的职责描述不应绑定单一 harness。
