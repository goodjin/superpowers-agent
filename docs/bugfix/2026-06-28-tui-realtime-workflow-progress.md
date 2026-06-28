# Bug Fix: TUI Realtime Workflow Progress

## 问题描述

- 日期: 2026-06-28
- 严重程度: High
- 影响范围: TUI `sidebar_content`、`sidebar_footer`、`app_bottom` 和 `superpowers-progress` route

用户反馈 workflow 进度没有及时展示。当前 TUI 能读取 workflow state 和 child progress，但展示链路仍存在延迟、选错 workflow、缺少状态边界提示的问题。

## 现有链路

当前进度展示由两类文件拼出来：

1. `runs/<run-id>/state.json`
   - workflow、phase、status、node_runs、pending_question、task_graph。
2. `runs/<run-id>/nodes/<node-id>/progress.jsonl`
   - child session 的 `session.status`、`message.part.updated`、tool/text/reasoning/patch 等事件。

TUI 入口：

- `src/tui.ts`
  - 注册 `sidebar_footer`、`sidebar_content`、`app_bottom`。
  - slot 内部每 1000ms 重新读取 state/progress 文件。
  - workflow 选择先匹配当前 session，再选 unfinished workflow，再按 `state.updated_at` 排序。
- `src/tui/progress-panel.ts`
  - 把 `WorkflowState + progress.jsonl + live session status` 合成 view model。
  - `sidebar_content` 显示 pending question、running nodes 或 latest node。
- `src/plugin.ts`
  - OpenCode event hook 把 child session 事件写入 `progress.jsonl`。

## 调查证据

### 1. 当前隔离 runtime 没有加载最新 dist

`dist/index.js` 和 `dist/tui.js` 是 2026-06-28 12:58 生成的，但隔离 server 日志最后启动时间是 2026-06-27 20:50 左右，端口 5096 上仍有旧 `opencode` 进程监听。

这说明如果用户观察的是 `127.0.0.1:5096` 对应的 Superagent runtime，当前进程没有重启，TUI 仍在使用旧插件代码。

### 2. state 时间和 progress 时间分离

当前 active run:

- run: `a7464814-bcc2-4fdd-b717-ced2a312de46`
- state updated: `2026-06-28T04:26:06.371Z`
- latest child progress: `2026-06-28T05:36:19.535Z`

child 进度持续写入 `progress.jsonl`，但不会更新 `state.updated_at`。TUI 的 global workflow 选择主要按 `state.updated_at` 排序，所以一个正在持续输出 progress 的 workflow 可能输给另一个 state 更新时间更晚、但没有真实 child 活动的 workflow。

### 3. unfinished workflow 状态集合滞后于 v4

`src/tui.ts` 的 `isUnfinishedWorkflow()` 目前只包含：

```ts
["intake", "running", "waiting_user", "blocked", "recovered_unknown"]
```

v4 新增或强化的状态没有纳入：

- `awaiting_design_approval`
- `awaiting_plan_approval`
- `waiting_user_decision`
- `failed`

这些状态都不是终态，TUI 应该优先展示并给出下一步，而不是被当成历史状态。

### 4. 展示内容缺少 workflow-level event timeline

当前 sidebar 主要显示 running session 或 latest node。它没有把这些 workflow 级事件作为第一等进度：

- `workflow_prepared`
- `design_approved`
- `plan_approved`
- `dispatch_failed`
- `late_report_ignored`
- `report_received`
- `workflow_canceled`

结果是用户能看到某个 child session 的 activity，但看不到完整 workflow 从 prepare、approval、dispatch、report 到 waiting/blocked/finish 的状态线。

### 5. 当前刷新策略是轮询文件，不是事件驱动

slot 通过 `setInterval` 每秒重读文件。这个策略能工作，但存在两个问题：

- 每个 slot 都独立扫描 workflow candidates 和 progress 文件，工作量随历史 run 增长。
- 轮询只能“下次刷新看到结果”，不能在关键事件发生时立即推送到 TUI。

## 根因判断

这不是单纯的 UI 文案问题，主要是数据模型和刷新模型的问题：

1. TUI 没有一个轻量、单文件、实时更新的 progress snapshot。
2. workflow 选择算法只看 `state.updated_at`，没有把 `progress.jsonl` 的最新时间纳入。
3. v4 非终态集合没有同步到 TUI。
4. workflow-level events 没有进入进度视图，用户只能看到 child session 片段。
5. 隔离 runtime 若不重启，会继续加载旧 dist，导致刚修完的 TUI 代码不可见。

## 推荐设计

### 目标

让用户在 TUI 中实时看到三层进展：

1. workflow 当前阶段：prepare/design/plan/approve/implement/check/finish。
2. node 当前活动：哪个 child session 正在运行、最近做了什么。
3. 下一步决策：等待批准、等待用户、正在运行、已阻塞、可重试、已完成。

### 设计方向

引入一个 runtime 维护的轻量 snapshot：

```text
.opencode/superpowers/
  progress-index.json
  runs/<run-id>/
    progress-snapshot.json
```

`progress-snapshot.json` 由 store/progress hook 在每次关键事件后原子写入：

```ts
type WorkflowProgressSnapshot = {
  run_id: string
  project: string
  workflow: string
  status: WorkflowStatus
  phase: string
  activation: "draft" | "active"
  updated_at: string
  latest_activity_at: string
  state_version?: string
  controller_feedback?: ControllerFeedback
  progress: {
    tasks_total?: number
    tasks_done?: number
    running_nodes: number
    stalled_nodes: number
    blocked_nodes: number
  }
  timeline: Array<{
    at: string
    scope: "workflow" | "node"
    kind: string
    node_id?: string
    session_id?: string
    agent?: string
    task_id?: string
    summary: string
    detail?: string
  }>
}
```

`progress-index.json` 只记录每个 project/run 的最新活动时间和 snapshot 路径：

```ts
type ProgressIndex = {
  current_run_id?: string
  runs: Array<{
    run_id: string
    status: WorkflowStatus
    latest_activity_at: string
    snapshot_path: string
  }>
}
```

### 写入规则

以下事件都应更新 snapshot：

- `prepareRun/startRun/activateRun`
- `approveDesign/approvePlan`
- `addNodeRun`
- `recordNodeResult`
- `consumePendingQuestion`
- `cancel`
- `markDispatchFailed`
- `recoverInterruptedRunningNodes`
- `nodeProgress.recordEvent`

关键点：child progress 写入时不需要改 `state.json`，但要更新 `progress-snapshot.json` 和 `progress-index.json` 的 `latest_activity_at`。这样 TUI 可以按真实活动时间选择 workflow。

### TUI 读取规则

TUI 不再每次扫描所有 run 的 `state.json + nodes/*/progress.jsonl`。优先读取：

1. `progress-index.json`
2. 当前 run 的 `progress-snapshot.json`
3. 如果 snapshot 缺失，再 fallback 到旧的 state/progress 扫描

workflow 选择优先级：

1. 如果 slot 有 session id，选拥有该 parent/child session 的 run。
2. 否则选 current run。
3. 否则选非终态 run，按 `latest_activity_at` 排序。
4. 终态 run 只作为没有任何非终态 run 时的 fallback。

非终态集合应包括：

```ts
[
  "intake",
  "running",
  "awaiting_design_approval",
  "awaiting_plan_approval",
  "waiting_user",
  "waiting_user_decision",
  "blocked",
  "failed",
  "recovered_unknown",
]
```

### 展示规则

`sidebar_content` 推荐展示：

```text
SP: feature running@implement | tasks 3/6 done | 1 running
Next: wait_running_node

Now
sp-implementer T4: bash running (4s ago)
  bun test test/controller-intake.test.ts

Workflow
✓ design approved
✓ plan approved
▶ implement T4
○ acceptance T4
○ verification T4
○ code-review T4

Recent
12:03:11 node_running sp-implementer T4
12:03:15 tool_running bun test ...
```

`sidebar_footer/app_bottom` 保持一行：

```text
SP: feature running@implement | T4 implement running | bash running 4s ago
```

`superpowers-progress` route 显示完整 timeline、tasks、nodes 和 controller_feedback。

## 最小修复切片

### P0: 当前问题止血

1. `isUnfinishedWorkflow()` 加入 v4 非终态。
2. workflow 排序使用 `max(state.updated_at, latest progress at)`。
3. current run 优先级高于历史 run，除非 slot 明确匹配其他 session。
4. 部署流程中明确重启 `superagent`，确保最新 `dist/tui.js` 生效。

### P1: 轻量实时 snapshot

1. 新增 `src/progress/workflow-snapshot.ts`。
2. store 状态变更后写 `progress-snapshot.json`。
3. node progress event 后更新 snapshot/index。
4. TUI 优先读 snapshot/index。

### P2: 更好的用户体验

1. sidebar 展示 `controller_feedback.recommended_next`。
2. timeline 合并 workflow events 和 node progress。
3. stalled、blocked、waiting approval、waiting user 用不同前缀展示。
4. route 页面增加 “why no progress” diagnostic，例如未部署、无 current run、无 matching session、snapshot stale。

## 验证计划

- 单元测试：
  - v4 非终态 run 可被 global slot 选中。
  - child progress 时间晚于 state 更新时间时，slot 选择 child progress 最新的 run。
  - current run 优先于历史终态 run。
  - snapshot 缺失时 fallback 到旧 state/progress 扫描。
  - dispatch_failed/waiting_user_decision/awaiting_plan_approval 都有可读 sidebar 文案。
- 集成测试：
  - 创建 run -> addNodeRun -> append progress，slot 在 1s 内展示新 progress。
  - append progress 不改 state.updated_at，也能更新 `latest_activity_at` 并刷新 TUI。
  - 重启 superagent 后 TUI 加载最新 dist，进度 route 能看到最新 snapshot。
- 手工验证：
  - `bun run build`
  - `bun run test`
  - `bun run deploy:superagent`
  - 打开 `http://127.0.0.1:5096`，确认 sidebar_content 能实时显示 workflow progress。

## 建议

先实施 P0 + P1。P0 能快速解决“选错/漏选 workflow”和“旧 runtime 未生效”的问题；P1 才能把实时展示从“每个 slot 扫文件拼结果”改成“runtime 维护一个可直接渲染的事实快照”。

P2 可以在 P1 稳定后做，不建议一开始就把 UI 文案做得很复杂。先把事实源和刷新路径做扎实，后续再调整展示密度。
