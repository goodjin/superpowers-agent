# Session Orchestrator Module

## Responsibility

session orchestrator 模块把 dispatch decision 变成 OpenCode node session。它生成插件控制的 task packet，调用 session adapter 创建或复用 session，并把 task markdown 返回给 store 写入 `nodes/*/task.md`。

## Files

- `src/session/task-packet.ts`：node task packet 类型。
- `src/session/templates.ts`：把 packet 渲染成 node prompt，并声明 primary skill 和 `sp_report` contract。
- `src/session/adapter.ts`：封装 OpenCode SDK 的 `session.create`、`session.prompt`、`tui.showToast` 和 `app.log` fallback。
- `src/session/orchestrator.ts`：根据 create/reuse dispatch 调用 adapter。
- `src/router/transition.ts`：生成 orchestrator 消费的 dispatch decision。
- `src/progress/reporter.ts`：定义 dispatch progress 的稳定事件结构。

## Dispatch Contract

orchestrator 接收：

- `project`
- `runID`
- `parentSessionID`
- `decision`
- `packet`

返回：

- `action`
- `session_id`
- `task_markdown`

store 随后用这些信息创建 `node_runs`，并写入 `nodes/<node-id>/task.md` 和 `reports/<task-id>/task.md`。

当 decision 是 `create_session` 时，orchestrator 还支持 `onSessionCreated` 回调。工具层会在这个回调里先注册 `node_runs`，再继续发送首条 child prompt。这样 child session 即使立刻调用 `sp_report`，state store 里也已经有对应节点，不会出现 report 先到、node_run 还没落盘的竞态。

## Prompt Context

`buildNodeTaskPacket()` 会把 transition decision 转成可审计的 prompt packet。除 objective 和 required artifacts 外，packet 可以携带 `context_sections`：

- 有 `task_id` 的节点会包含 `Task Scope`，内容来自 `state.task_graph.tasks[]` 的同 id task。
- `acceptance` 节点会包含 `Implementation Completion Summary`，内容来自触发派发的 implementation `sp_report.summary` 和 `artifacts.patch_summary`。
- `acceptance` 节点还会包含 `Acceptance Instructions`，明确 reviewer 只检查当前 task，不因其他 task graph 项未完成而失败。
- retry 复用 implementer session 时，prompt 会包含失败检查的 `Retry Context`。

Acceptance 的 required artifacts 会指向 `spec.md`、`plan.md`、`tasks.json`、`reports/<task-id>/task.md` 和 `reports/<task-id>/report.md`。这些路径用于 reviewer 读取完整上下文，内联 summary 用于让检查范围在首屏 prompt 中也足够清楚。

## Progress Behavior

orchestrator 在每次 dispatch 时发送两类 progress：

- `dispatch_started`：准备创建或复用节点 session。
- `node_running`：节点 session 已创建或复用，task prompt 已提交。

这些提示走 adapter 的 `showProgress()`，生产环境优先显示 TUI toast，缺失时写入 app log。

## E2E Behavior

生产默认行为是创建 node session 后提交 task prompt。OpenCode e2e 默认设置 `OPENCODE_SUPERPOWERS_DISABLE_CHILD_PROMPT=1`，这时 adapter 会返回一个受抑制的 synthetic session id，并跳过真正的 `session.prompt()`；state、`node_runs` 和 `nodes/*/task.md` 仍然会照常落盘。

需要验证真实节点链路时，e2e 会关闭这个开关，让 child session 正常向 mock LLM 发请求。

## Notes

- 节点 prompt 只声明一个 primary skill。
- 模型不能在 `sp_report` 中提交 `next_action`、`child_session_id`、`reuse_session_id` 或 `skills_used`。
- retry dispatch 优先复用原 implementer session；无法复用时由 transition 创建新的 implementer decision。
- `test/session-orchestrator.test.ts` 断言 create-session 路径的顺序是 `create -> register -> prompt`，这是避免子会话首轮抢跑的稳定性边界。
