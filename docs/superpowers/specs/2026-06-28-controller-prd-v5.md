# Superpowers Controller PRD V5

## 1. Document Info

- Version: v5
- Date: 2026-06-29
- Status: refined PRD draft
- Supersedes: `docs/superpowers/specs/2026-06-27-controller-prd-v4.md`
- Companion design: `docs/superpowers/specs/2026-06-29-controller-philosophy-tool-interaction-design.md`

v5 继承 v4 已确认的边界：public tool surface、controller autonomy、non-blocking dispatch、runtime recovery、`sp_report` result contract、TUI progress 可见性和主会话按需 progress digest。

v5 的变化集中在一点：插件不再把内置 workflow kind 当作主决策来源，也不强制每个请求都先生成 workflow。controller 先根据用户需求判断是否需要委派，以及委派给单个 agent 还是多节点 workflow。只要进入插件控制，单 agent task 和 workflow 使用同一套运行时机制：校验、持久化、派发 child session、收集 `sp_report`、恢复、取消和 progress 可见性。单 agent task 可以被规范化为 one-node workflow run；多节点 workflow 可以从 controller 自行设计，也可以从插件内置 workflow templates 裁剪而来。

```text
controller 决定 direct response / single agent / workflow
plugin 暴露 agent catalog、workflow templates 和 schema
controller 选择或生成 execution spec
plugin 校验并执行 execution spec
node agent 执行单个 node 并调用 sp_report
agent report 可产生新任务或 workflow expansion
plugin 根据 execution spec + result + expansion_policy 推进或反馈 controller
```

## 2. Product Positioning

Superpowers Controller 是一个 controller-driven agent/workflow runtime plugin。

它不是智能 planner。它不理解用户需求，也不替 controller 选择 agent 或设计 workflow。它提供的是确定性的控制能力：

- agent catalog
- built-in workflow templates
- workflow schema
- workflow examples
- execution spec 校验
- run-local artifact 管理
- node session 创建、恢复和取消
- `sp_report` 结果处理
- no-report fallback
- runtime recovery
- TUI 和 progress 可见性

## 3. Actor Responsibilities

### 3.1 Controller: `super-agent`

controller 是主会话里的总控 agent。

职责：

- 理解用户原始需求。
- 在主会话中问清目标、范围、约束、验收标准和确认点。
- 判断当前请求是否需要委派；如果需要，选择 direct single-agent delegation 或 multi-node workflow。
- 根据 Superpowers 工作理念、agent catalog、内置 workflow templates 和常用 workflow 示例，生成或选择本次 bootstrap execution spec。
- 设置 `expansion_policy`，决定 node report 生成的新任务是否允许自动扩展到当前 run。
- 调用 `sp_status` 获取当前事实和能力目录。
- 调用 `sp_prepare` 校验或注册 execution。
- 调用 `sp_start` 启动、恢复、重试或继续 execution。
- 调用 `sp_cancel` 停止 workflow、node 或 session。
- 解释 plugin 返回的 `controller_feedback`，并在需要时向用户确认。

限制：

- 不直接创建 child session。
- 不直接执行 node 工作。
- 不调用 native task tool。
- 不加载业务 skill。
- 不用自然语言记忆覆盖 `sp_status` 返回的 runtime fact。

### 3.2 Plugin Runtime

plugin 是 workflow runtime 和状态事实源。

职责：

- 暴露 public tools。
- 暴露 agent catalog、workflow schema、built-in workflow templates 和静态 workflow examples。
- 校验 controller 选择或生成的 execution spec。
- 持久化 `execution-spec.json`、兼容性的 `workflow-spec.json`、`documents.json`、`state.json`、`events.jsonl`。
- 生成 node task packet。
- 创建、复用或恢复 child session。
- 读取 run-local workflow artifacts，并内联到 node prompt。
- 收集和校验 `sp_report`。
- 根据 `WorkflowState`、`GeneratedExecutionSpec`、node result 和 `expansion_policy` 计算下一步。
- 在 `expansion_policy` 允许时，校验并自动应用 agent-generated task graph 或 workflow expansion。
- 处理 no-report fallback、late report、dispatch failure、startup recovery。
- 通过 `controller_feedback`、TUI surface 和 progress digest 反馈 controller。

限制：

- 不根据用户自然语言生成 workflow。
- 不替 controller 选择 agent、workflow template 或业务流程。
- 不把 fallback summary 默认当作成功。
- 不让 progress 替代结构化 `sp_report`。

### 3.3 Node Agents

node agent 是 child session 中执行单个 node 的 agent。

职责：

- 读取插件传入的 node task packet。
- 使用分配的 primary skill。
- 执行当前 node 的 scoped task。
- 在完成、失败、阻塞或需要用户输入时调用 `sp_report`。
- 产出 `summary`、`artifacts`、`checks`、`findings`、`question`、`task_graph` 或 workflow expansion。

限制：

- 不创建新的 workflow。
- 不创建 child session。
- 不调用 native question tool。
- 不在 `sp_report` 中提交 `next_action`、`next_suggestion`、`child_session_id`、`reuse_session_id`。
- 不自行搜索 run 目录之外的 `spec.md`、`plan.md`。

## 4. Controller Prompt Principles

`super-agent` prompt 应包含 Superpowers 工作理念、内置 workflow templates 和常用 workflow 示例。templates 和 examples 只帮助 controller 选择或规划，不是固定流程，也不是 plugin 的智能建议。

### 4.1 Operating Principles

controller 应遵守：

- 用户和项目指令优先。
- 先理解用户侧问题，再决定是否委派、委派给哪个 agent 或是否使用 workflow。
- 不强求生成 workflow；小型清晰任务可以选择单 agent delegation，复杂任务再使用 workflow。
- 单 agent delegation 和 workflow 都走插件同一套控制机制；单 agent delegation 可规范化为 one-node workflow run。
- 初始 workflow 可以很小，只表达当前确定的启动节点，例如 `design -> plan`、`plan`、`debug`、`investigation` 或单个 agent task。
- workflow 从任务性质生成，不从固定 workflow kind 套模板。
- 插件内置 workflow templates 可以被 controller 直接选择、裁剪或忽略；plugin 不根据用户请求推荐 template。
- plan 后默认继续执行：planner 产出的 task graph 或 workflow expansion 由 plugin 校验后自动追加并派发。
- 只做设计、只做计划或只跑指定节点时，controller 应在 bootstrap spec 中设置 `expansion_policy.mode = "disabled"`。
- design、plan、debug、TDD、verification、finish 都是过程纪律，不是强制阶段。
- controller 控流，node agent 做事，plugin 执行状态机。
- 证据先于完成声明。
- 状态混乱时先 `sp_status` 对齐事实。

### 4.2 Common Workflow Examples

总控 prompt 中应提供这些示例：

```text
Feature with unclear requirements:
intake -> design/spec -> plan/task graph -> auto-expanded implementation tasks -> acceptance -> verification -> code review -> finish

Simple scoped implementation:
intake -> implementation -> verification -> optional review -> finish

Bugfix:
intake/reproduce -> root cause investigation -> repair plan or implementation -> regression verification -> review -> finish

Design-only or plan-only:
design or plan node -> terminal, with expansion_policy.mode="disabled"

Review-only:
acceptance or code review node -> verification when needed -> controller decision or finish

Parallel investigation:
independent investigator nodes -> synthesis/finish -> controller decision before write actions
```

controller 可以裁剪、重排或省略节点，但需要保证每个 bootstrap node 有清晰输入、输出、报告契约和 transition 条件。plan 后的 implementation、review、verification 节点可以由 planner report 生成，并按 `expansion_policy` 自动进入 workflow。

### 4.3 Built-In Workflow Templates

plugin 应内置一组 workflow templates，作为 `sp_status(include_capabilities=true)` 的能力目录返回。templates 是可复制、可裁剪的结构化起点，不是插件根据用户请求生成的建议。

第一版 templates：

- `feature`: design/spec、plan/task graph、implementation、acceptance、verification、code-review、finish 的完整链路。
- `bugfix`: reproduce/root-cause、repair、regression verification、review、finish。
- `review`: acceptance 或 code-review，再按需要进入 verification 或 finish。
- `verify-finish`: verification、finish。
- `plan-only`: designer/planner bounded run，默认 `expansion_policy.mode="disabled"`。
- `parallel-investigate`: 多个 independent investigator nodes，最后 synthesis/finish。
- `single-agent`: one-node template，用于直接委派给一个 agent。

template contract：

```ts
type BuiltInWorkflowTemplate = {
  id: string
  title: string
  description: string
  recommended_for: string[]
  default_execution_spec: GeneratedExecutionSpec
  customization_points: string[]
  risk_notes: string[]
}
```

controller 可以：

- 直接选择 template 并填入当前 request/context。
- 裁剪 template 的 nodes、edges、documents、completion policy 或 expansion policy。
- 忽略 template，自己生成 single-agent spec 或 workflow spec。

plugin 只能返回 templates 和校验结果，不能基于自然语言替 controller 选择某个 template。

### 4.4 Delegation Decision Examples

controller 应先判断任务形态：

| User request shape | Controller choice | Runtime shape |
|---|---|---|
| 只需回答、解释、总结当前信息 | controller 直接回答 | 不调用插件 |
| 单点实现、单点调查、单次 review | 选择一个最合适的 node agent | one-node workflow run |
| 需求、方案或验收不清 | 选择 designer / planner，或 `design -> plan` template | one-node 或 small bootstrap workflow |
| 多步骤实现、需要验证和收尾 | 选择或裁剪内置 workflow template | multi-node workflow run |
| 只做 plan / design / review | 单 agent 或 small workflow，并设置 `expansion_policy.mode="disabled"` | bounded run |

无论 runtime shape 是 one-node 还是 multi-node，plugin 都使用同一套状态、artifact、report、fallback、恢复和 TUI progress 机制。

## 5. Public Tool Surface

v5 仍只暴露五个 public tools：

```text
sp_status
sp_prepare
sp_start
sp_cancel
sp_report
```

### 5.1 `sp_status`

定位：只读事实查询。

调用场景：

- 新请求开始时，对齐是否已有 active/draft/waiting workflow。
- 用户询问当前进度。
- controller 状态记忆与 runtime 返回不一致。
- 重启恢复、blocked、fallback、waiting_user 后需要判断下一步。
- controller 需要 agent catalog、workflow schema、built-in workflow templates 或常用 workflow examples。

行为：

- 不修改状态。
- 返回当前 workflow、node 状态、最近 report/fallback、可运行 node、阻塞原因、`controller_feedback`。
- `include_progress=true` 时返回按需 `progress_digest`。
- `include_capabilities=true` 时返回 agent catalog、schema capability、built-in workflow templates 和 workflow examples。

### 5.2 `sp_prepare`

定位：校验或注册 controller 已选择或生成的 execution spec。

`sp_prepare` 不生成 workflow，不提供智能建议。它可以校验 single-agent execution spec，也可以校验 multi-node workflow spec。

Validation mode:

```ts
type SpPrepareValidationInput = {
  mode: "validate_execution"
  request: string
  execution_spec: GeneratedExecutionSpec
}
```

返回：

```ts
type WorkflowValidationResult = {
  valid: boolean
  errors: string[]
  warnings: string[]
  required_user_confirmations: string[]
  referenced_agents: AgentName[]
  referenced_documents: string[]
}
```

Registration mode:

```ts
type SpPrepareWorkflowInput = {
  mode: "register_execution"
  request: string
  execution_spec: GeneratedExecutionSpec
}
```

行为：

- 校验 execution spec。
- 校验 node agent 是否存在。
- 校验 report contract、edge、completion policy、fallback policy。
- 校验 run-local artifact contract。
- 写入 draft state。
- 写入 `workflow-spec.json`、`documents.json`、`events.jsonl`。
- 返回 `recommended_next: approve_execution | revise_execution | cancel_execution`。

### 5.3 `sp_start`

定位：激活、恢复、重试或继续 workflow。

行为：

- `draft + approve_execution`: 激活 execution，派发 initial runnable node。
- `active + running node`: 返回 wait，不重复派发。
- `waiting_user + resume_input`: 清空 pending question，恢复原 child session。
- `waiting_controller_decision`: 按 controller 明确选择继续。
- `fallback_summary_ready`: 默认返回 controller decision，除非 spec 明确允许自动继续。
- `recovered_unknown`: 要求 controller 选择 retry、cancel 或 inspect。
- `expansion_ready`: 如果 expansion 由已允许的 node 产生且校验通过，自动应用并派发新 runnable node；不回到 controller。

`sp_start` 调度 child prompt 后返回，不等待 child session 完整跑完。

### 5.4 `sp_report`

定位：node result 进入 runtime 的唯一结构化入口。

输入：

```ts
type SpReportInput = {
  node_id?: string
  event:
    | "intake"
    | "question"
    | "design"
    | "plan"
    | "investigation"
    | "debug"
    | "red-test"
    | "implementation"
    | "acceptance"
    | "code-review"
    | "verification"
    | "finish"
  status: "progress" | "passed" | "failed" | "blocked" | "needs_user"
  summary: string
  artifacts?: Record<string, string>
  gates?: Record<string, boolean>
  checks?: string
  findings?: string
  question?: {
    prompt: string
    options?: Array<{ label: string; description?: string }>
  }
  task_graph?: {
    tasks: Array<{
      id: string
      title: string
      summary: string
      agent?: AgentName
      depends_on: string[]
      files?: string[]
      test_commands?: string[]
    }>
  }
  workflow_expansion?: WorkflowExpansionPatch
}
```

禁止字段：

- `next_action`
- `next_suggestion`
- `child_session_id`
- `reuse_session_id`
- `create_sessions`
- `skills_used`

status 语义：

| Status | Runtime effect | Dispatch effect |
|---|---|---|
| `progress` | 更新 record、artifact candidate、progress 和 `reported_at`。node 仍 running。 | 不派发下游。 |
| `passed` | 关闭 node，校验 artifacts/gates/report contract；如果包含 task graph 或 workflow expansion，则按 expansion policy 校验并追加。 | expansion 合法时自动派发新增 runnable node；否则按 execution spec edge 推进。 |
| `failed` | 关闭 node，记录失败。 | 有明确 failure edge 才继续，否则返回 controller decision。 |
| `blocked` | 标记 node/workflow blocked。 | 不自动继续，反馈 controller。 |
| `needs_user` | 写入 `pending_question`，workflow 进入 `waiting_user`。 | 通知 parent controller session，等待 `sp_start(resume_input)`。 |

### 5.5 `sp_cancel`

定位：显式取消 workflow、node 或 session。

行为：

- 写入取消状态、原因和 state version。
- 对 canceled/interrupted/dispatch_failed node 的 late report 只作为审计，不覆盖 current state。
- 取消后恢复必须读取当前 state 和 execution spec，不能回到固定 entrypoint。

## 6. Generated Execution Spec

`GeneratedExecutionSpec` 是 controller 与 plugin 的主协议。它允许 controller 选择单 agent task 或 multi-node workflow；plugin 内部可以把 single-agent spec 规范化为 one-node workflow run，从而复用同一套 runtime。

```ts
type GeneratedExecutionSpec =
  | SingleAgentExecutionSpec
  | GeneratedWorkflowSpec

type SingleAgentExecutionSpec = {
  version: "v5"
  kind: "single_agent"
  title: string
  goal: string
  constraints: string[]
  agent: AgentName
  task: string
  required_context?: string[]
  expected_output: string
  report_contract: ReportContract
  documents?: WorkflowDocumentSpec[]
  expansion_policy: ExpansionPolicy
  completion_policy: CompletionPolicy
  fallback_policy: FallbackPolicy
}

type GeneratedWorkflowSpec = {
  version: "v5"
  kind: "workflow"
  title: string
  goal: string
  constraints: string[]
  nodes: WorkflowNodeSpec[]
  edges: WorkflowEdgeSpec[]
  documents?: WorkflowDocumentSpec[]
  expansion_policy: ExpansionPolicy
  completion_policy: CompletionPolicy
  fallback_policy: FallbackPolicy
}

type WorkflowNodeSpec = {
  id: string
  agent: AgentName
  title: string
  task: string
  required_context?: string[]
  consumes?: string[]
  produces?: string[]
  expected_output: string
  report_contract: ReportContract
  timeout_policy?: TimeoutPolicy
  no_report_policy?: NoReportPolicy
}

type WorkflowDocumentSpec = {
  id: string
  title: string
  kind: "workflow_artifact"
  path: string
  producer_node_id: string
  consumer_node_ids?: string[]
  promotion: "on_node_passed" | "on_controller_approval" | "on_workflow_finish" | "none"
  required: boolean
}

type WorkflowEdgeSpec = {
  from: string
  to: string
  condition:
    | { kind: "on_status"; status: "passed" | "failed" | "blocked" | "needs_user" }
    | { kind: "on_artifact"; artifact: string }
    | { kind: "on_gate"; gate: string }
    | { kind: "controller_decision"; options: string[] }
    | { kind: "fallback_summary"; options: string[] }
}

type ExpansionPolicy = {
  mode: "auto" | "disabled"
  allowed_source_nodes?: string[]
  allowed_target_agents?: AgentName[]
  default_task_agent?: AgentName
  max_added_nodes?: number
  max_expansion_depth?: number
  default_check_chain?: Array<"acceptance" | "verification" | "code_review">
}

type WorkflowExpansionPatch = {
  nodes?: WorkflowNodeSpec[]
  edges?: WorkflowEdgeSpec[]
  documents?: WorkflowDocumentSpec[]
  completion_policy_patch?: Partial<CompletionPolicy>
}
```

结构规则：

- `nodes[].id` 唯一。
- `kind="single_agent"` 会被 plugin 规范化成一个 node；该 node 仍必须有 agent、task、expected output 和 report contract。
- `node.agent` 必须存在于 agent catalog。
- 每个 node 必须有 `report_contract`。
- `nodes[].consumes` 和 `nodes[].produces` 只能引用 `documents[].id`。
- `documents[].path` 相对 `.opencode/superpowers/runs/<run-id>/`。
- `expansion_policy.mode = "auto"` 时，允许被授权 node 的 `sp_report` 追加 task graph 或 workflow expansion，并在校验后继续执行。
- `expansion_policy.mode = "disabled"` 时，plugin 只运行 bootstrap spec 中已有 node；node report 中的 task graph 或 expansion 只作为 artifact 保存，不追加执行节点。
- `workflow_expansion` 是首选可执行扩展协议，因为它显式给出 nodes、edges 和 documents。
- 只有当 `task_graph.tasks[].agent` 或 `expansion_policy.default_task_agent` 能确定目标 agent 时，plugin 才能把 `task_graph` 确定性转换为 executable nodes；否则返回 controller decision。
- `default_check_chain` 只做确定性追加，例如为每个 implementation task 追加 acceptance、verification 或 code-review node；插件不根据任务语义自行选择 check 类型。
- edge 只能引用存在的 node。
- graph 第一版按 DAG 处理；retry 通过新 attempt 或新 node run 记录。
- 没有入边的 node 是 initial runnable node。
- completion policy 必须说明 workflow 何时 passed、failed、blocked 或等待 controller。

## 7. Run-Local Artifact Lifecycle

v5 的 document contract 只描述插件控制的 run-local workflow artifacts。

### 7.1 Runtime Control Files

这些文件服务状态、恢复和审计：

```text
.opencode/superpowers/runs/<run-id>/
  execution-spec.json
  workflow-spec.json
  documents.json
  state.json
  events.jsonl
  nodes/<node-id>/task.md
  nodes/<node-id>/record.json
  nodes/<node-id>/fallback-summary.json
  nodes/<node-id>/progress.jsonl
```

### 7.2 Workflow Artifacts

这些文件是 node 之间传递的上下文：

```text
.opencode/superpowers/runs/<run-id>/
  request.md
  spec.md
  plan.md
  task_graph.json
  tasks.json
  reports/<task-id>/task.md
  reports/<task-id>/report.md
  reports/<task-id>/acceptance.md
  reports/<task-id>/verification.md
  reports/<task-id>/code_review.md
  reports/<task-id>/finish.md
```

生成和消费规则：

1. `sp_prepare(register_execution)` 写入 `execution-spec.json`、兼容性的 `workflow-spec.json`、`documents.json`、draft state 和事件日志。single-agent spec 会先规范化为 one-node run 再落盘。
2. `sp_start` 派发 node 前生成 `nodes/<node-id>/task.md`；有 `task_id` 时生成 `reports/<task-id>/task.md`。
3. designer/planner 等 node 通过 `sp_report.artifacts` 提交 `spec`、`plan`、`task_graph` 等 candidate。
4. plugin 把 candidate 写入 run 目录的 node record 或 output。
5. spec 声明的 promotion 条件满足后，plugin materialize canonical artifact，例如 `spec.md`、`plan.md`、`task_graph.json`、`tasks.json`。
6. 后续 node 派发前，plugin 读取允许消费且已经 canonical 的 workflow artifacts，内联进 node prompt。
7. node 不自行搜索 run 目录之外的 `spec.md` 或 `plan.md`。
8. `sp_report(status="progress")` 只能产生 candidate/progress，不解锁下游。

## 8. Plugin And LLM Interaction Model

### 8.1 Configuration-Time Interaction

OpenCode 加载 plugin 时：

1. plugin 注入 `super-agent`。
2. plugin 注入 `sp-*` node agents。
3. plugin 注入 public tools。
4. plugin 设置权限边界：controller 禁止 native task 和业务 skill；node agent 禁止 native task/question，只允许指定 primary skill。
5. plugin 可以把 active workflow summary 注入 runtime context，但不能把 progress 当作长期 prompt 上下文。

### 8.2 Main Session Interaction

主会话中的模型是 controller。

```text
user request
-> super-agent intake
-> sp_status
-> optional sp_status(include_capabilities=true)
-> super-agent decides direct response / single agent / workflow
-> if delegated, super-agent creates execution_spec
-> optional sp_prepare(validate_execution)
-> user confirmation when needed
-> sp_prepare(register_execution)
-> sp_start(approve_execution)
```

分工：

- 大模型理解需求、决定是否委派、选择 agent 或 workflow template、生成 spec、解释反馈。
- plugin 返回事实、agent catalog、built-in workflow templates、schema、校验结果和下一步控制建议。
- 用户确认发生在主会话。
- child session 创建只由 plugin 完成。

### 8.3 Child Session Interaction

plugin 派发 node 时：

```text
workflow transition
-> build node task packet
-> read canonical workflow artifacts
-> session.create or reuse session
-> register node_run
-> session.prompt(node prompt)
-> node agent executes scoped task
-> node agent calls sp_report
```

node prompt 包含：

- node id
- agent role
- primary skill
- scoped task
- expected output
- report contract
- source artifacts inline content
- allowed `sp_report` shape

### 8.4 Report-Driven Transition And Expansion

node agent 调用 `sp_report` 后：

```text
sp_report
-> parse and validate schema
-> match node_run by node_id/session_id
-> write record and artifacts
-> update workflow state
-> if task_graph/workflow_expansion exists and expansion_policy allows it, validate and append nodes/edges/documents
-> compute transition from execution_spec
-> dispatch next node or return controller_feedback
```

如果 `workflow_expansion` 合法，plugin 自动追加新 nodes/edges/documents，并重新计算 runnable nodes。

如果 report 只有 `task_graph`，plugin 只能按 deterministic expansion rule 转换：每个 task 变成一个 node，agent 来自 `task.agent` 或 `expansion_policy.default_task_agent`，依赖关系变成 edges，`default_check_chain` 变成附加检查节点。任何 agent、edge、document、数量或深度校验失败，都不能靠插件猜测补齐。

planner passed 后的 implementation、acceptance、verification、code-review、finish 节点应走这条路径继续执行，不默认回到 controller。

如果 transition 明确、agent 存在、artifact 已 canonical、没有用户输入和 controller decision edge，plugin 可以自动派发下一 node。

如果 expansion 被禁用，plugin 不应用 report 中的新任务，只按 bootstrap spec 的 completion policy 结束或继续已有节点。transition 不明确、缺 artifact、fallback summary、权限不可用、校验失败或有高风险动作时，plugin 返回 controller decision 或 blocked。

### 8.5 User Input Bridge

node 需要用户输入时：

```text
node agent
-> sp_report(status="needs_user", question=...)
-> plugin writes pending_question
-> plugin notifies parent controller session
-> super-agent asks user
-> user answers
-> super-agent calls sp_start(resume_input)
-> plugin resumes original child session
```

node agent 不调用 native question tool。用户输入回到主会话，再由 plugin 恢复原 child session。

### 8.6 No-Report Fallback

如果 child session 没有 terminal `sp_report`：

```text
detect idle/error/stalled/recovered node without terminal report
-> collect transcript/progress/tool/error evidence
-> create FallbackSummaryResult
-> write nodes/<node-id>/fallback-summary.json
-> mark waiting_controller_decision
-> expose via sp_status/controller_feedback/TUI
```

fallback summary 是部分证据。默认不能驱动成功路径。

## 9. Runtime Decision Model

plugin 每次只根据四类输入计算下一步：

1. 当前 `WorkflowState`。
2. controller 选择或生成并注册的 `GeneratedExecutionSpec`。
3. 最新 node result: `sp_report` 或 fallback summary。
4. `expansion_policy` 以及 report 中的 `task_graph` / `workflow_expansion`。

transition 输出只能是：

- `create_session`
- `reuse_session`
- `wait_user`
- `wait_controller`
- `finish`
- `blocked`

自动推进条件：

- report status 与 edge condition 明确匹配。
- 下一个 node agent 存在。
- node 所需 artifacts 已 canonical。
- agent-generated expansion 通过 schema、agent、edge、artifact 和 expansion policy 校验。
- `task_graph` 能通过 deterministic expansion rule 转成可执行 node graph。
- 没有 controller decision edge。
- 没有 unresolved user input。
- 没有未确认的高风险副作用。

返回 controller 条件：

- 多条 edge 同时匹配且优先级不明确。
- fallback summary 代替了 terminal report。
- expansion policy disabled 但 bootstrap spec 没有说明如何处理 report 中的新任务。
- agent-generated expansion 校验失败。
- report 与 spec condition 不匹配。
- report 缺少 required artifact。
- agent 不存在或权限不可用。
- execution spec 不完整。
- startup recovery 后状态不能安全判断。

## 10. Progress And TUI

progress 是用户可见性，不是状态机输入。

显示原则：

- `app_bottom`: workflow title/status、running node、current activity、next controller action。
- `sidebar_content`: execution spec 摘要、node graph、running/reported/fallback nodes、attention。
- `prompt_progress`: 当前上下文一行状态。
- 主会话灰色 tool result: `sp_status(include_progress=true)` 的按需 `progress_digest`。

progress 不能替代：

- `node_runs`
- `sp_report`
- execution spec edge
- completion policy
- fallback policy

## 11. Persistence And Recovery

持久化要求：

- controller 生成的 `execution-spec.json` 必须落盘；`workflow-spec.json` 可作为兼容 alias 或规范化后的 one-node/multi-node graph snapshot。
- `documents.json` 记录 run-local artifact id、path、producer、consumer、candidate/canonical 状态和 promotion event。
- `state.json` 是 durable snapshot。
- `events.jsonl` 是审计日志。
- node task、record、fallback summary、progress 都按 node id 落盘。

恢复规则：

- runtime memory 是当前事实源。
- durable snapshot 用于重启恢复和审计。
- 启动时遗留 running node 不能直接视为 live；需要 reconciliation。
- recovered workflow 默认进入 controller decision，而不是自动重派发。
- late report 不覆盖 newer attempt 或 canceled/interrupted node。
- `sp_status` 必须给 controller 明确 next decision。

## 12. Acceptance Scenarios

1. controller 能读取 agent catalog、schema、built-in workflow templates 和 workflow examples；它可以选择不委派、single agent delegation 或 workflow。
2. `sp_prepare(validate_execution)` 只校验，不写入 draft，不派发 node。
3. `sp_prepare(register_execution)` 写入 draft、`execution-spec.json`、兼容性的 `workflow-spec.json`、`documents.json` 和 events。
4. `sp_start(approve_execution)` 激活 draft 并派发 initial runnable node。
5. single-agent execution spec 会被规范化为 one-node run，并复用相同 state、report、fallback、恢复和 TUI 机制。
6. node prompt 包含 scoped task、report contract 和 canonical source artifacts。
7. `sp_report(status="progress")` 不派发下游。
8. planner `sp_report(status="passed", task_graph=...)` 时，如果 expansion policy 为 auto，plugin 自动把任务扩展成 execution/check/finish nodes 并继续派发。
9. `expansion_policy.mode="disabled"` 时，plugin 不应用 planner 产出的 task graph 或 workflow expansion，只保存为 artifact。
10. `sp_report(status="passed")` 无 expansion 时按 execution spec edge 自动推进或返回 controller decision。
11. `sp_report(status="failed")` 只有在 spec 有明确 failure edge 时自动推进。
12. `sp_report(status="needs_user")` 写入 pending question，并通知 parent controller session。
13. `sp_start(resume_input)` 恢复原 child session，不创建新 node。
14. child session 无 terminal report 时生成 fallback summary，并进入 controller decision。
15. `spec.md`、`plan.md` 等 workflow artifacts 只从 run 目录读取并内联给 node agent。
16. TUI 能展示动态 node graph、fallback、attention 和 progress digest。
17. startup recovery 不把 durable running 当成 live running。
18. public tool surface 不新增工具，仍是 `sp_status`、`sp_prepare`、`sp_start`、`sp_cancel`、`sp_report`。

## 13. Migration Notes From V4

| V4 concept | V5 replacement |
|---|---|
| fixed workflow kind decides dispatch | controller-selected execution spec plus agent-generated expansion decides dispatch |
| built-in feature/debug/review flows | built-in templates plus controller-selected/generated spec |
| managed design/planning modes | controller may include designer/planner nodes, planner may expand execution nodes |
| fixed task-scoped check chain | expansion policy and planner-generated nodes/checks |
| plugin semantic workflow definition | plugin generic execution engine |
| missing report can stall workflow | no-report fallback summary result |

v5 不移除现有 agents 或 public tools。它改变的是 agents 被选择和排序的方式。

## 14. Open Questions

- fallback summary 第一版由插件本地摘要逻辑生成，还是派发专用 summarizer node 生成。
- execution spec condition 第一版支持哪些 condition kind 的完整枚举。
- expansion policy 第一版如何限制最大节点数、允许 agent、默认 check chain 和递归扩展深度。
- fallback summary 在哪些低风险场景可以被 spec 声明为可自动继续。
- dynamic workflow schema 是否需要版本化 migration。
