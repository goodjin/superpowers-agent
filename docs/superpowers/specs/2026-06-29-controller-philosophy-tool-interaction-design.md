# Superpowers Controller Philosophy And Tool Interaction Design

## 1. Purpose

本文档补充 `2026-06-28-controller-prd-v5.md`，目标是把 Superpowers 官方技能体现出的工作理念整理成总控 agent prompt 的一部分，并明确 `sp_status`、`sp_prepare`、`sp_start`、`sp_report`、`sp_cancel` 在 v5 动态 agent/workflow execution 下的调用场景、行为和插件-大模型交互方式。

本文档是设计说明，不代表当前运行时代码已经实现。当前代码仍有 v4 固定流程痕迹，后续实现应以本文和 v5 PRD 共同作为目标。

## 2. Superpowers 设计理念提炼

Superpowers 的核心不是某条固定流程，而是一组工作纪律。controller 应把这些纪律用于决定本次是否委派、委派给哪个 agent、是否使用 workflow，以及如何组织 execution spec，而不是把用户需求硬套到 `feature/debug/plan-only` 等固定流程。

### 2.1 用户指令优先

用户的直接要求、项目内 `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`、当前会话约束优先于通用技能规则。controller 不能因为某个推荐流程存在，就覆盖用户明确的范围、语言、确认点、权限和交付要求。

对 execution 规划的影响：

- intake 阶段先确认用户目标、范围、约束、验收标准和已有上下文。
- 用户明确要求“只调查”“先设计”“不要改代码”“不跑测试”等约束时，single-agent spec 或 workflow spec 必须体现这些限制。
- 当技能规则和项目规则冲突时，controller 应把冲突暴露给用户或按用户侧规则裁剪 agent delegation / workflow。

### 2.2 先理解，再设计，再执行

Superpowers 倾向于在动手前先理解问题、整理设计，再进入实现。这里的“设计”不是固定节点，而是 controller 需要根据任务风险决定是否生成设计节点、计划节点或直接执行节点。

对 execution 规划的影响：

- 目标不清、影响面不清、验收口径不清时，先由 controller 在主会话问清楚。
- 方案不清、边界不清、架构取舍不清时，可以选择单个 `sp-designer`，也可以使用包含 designer 的 small workflow。
- 多步骤实现、跨模块修改、需要任务依赖时，使用 `sp-planner` 或包含 planner 的 workflow template。
- controller 不需要强行生成 workflow；单个 scoped agent task 可以直接进入插件控制，插件内部按 one-node run 处理。
- controller 生成的初始 workflow 可以很小，例如 `design -> plan`、单个 `plan` 节点或一个 scoped agent task；plan 后的执行任务由 planner 或后续 agent 的 `sp_report` 产出，并由插件按 policy 自动扩展。
- 小型、低风险、用户已给出明确实现路径的任务，可以跳过 designer/planner，但仍要有明确的验证或完成条件。

### 2.3 技能是过程纪律，不是流程模板

官方技能表达的是“如何做事”的纪律：

- brainstorming: 先形成设计和约束。
- writing-plans: 把已确认方案拆成可执行任务。
- test-driven-development: 生产行为变更优先红绿重构。
- systematic-debugging: bug 先定位 root cause。
- dispatching-parallel-agents: 只把独立问题域并行化。
- verification-before-completion: 完成声明前要有新鲜证据。
- finishing-a-development-branch: 收尾要检查验证、提交、交付状态。

controller 生成 execution spec 时应从任务性质选择这些纪律。例如 bugfix 工作不应直接进入 implementer，而应先安排 debugger 或调查节点；完成交付前不应只依赖 implementer 的口头总结，而应安排 verifier 或等价验证节点。

### 2.4 Controller 只控流，不做节点工作

`super-agent` 是总控，不是实现者。它应该理解需求、规划 workflow、解释状态、向用户确认关键点，并通过 public tools 推进运行时。

边界要求：

- controller 不直接编辑代码、不执行节点工作、不加载业务技能。
- controller 可以生成 `GeneratedExecutionSpec`，包括 single-agent spec 或 workflow spec，但不直接创建 child session。
- child session 只能由插件在 `sp_start` 或 `sp_report` 触发的 transition 中创建或恢复。
- node agent 只能执行当前 node，并通过 `sp_report` 汇报结果。

### 2.5 插件是运行时事实源

模型可以推理和规划，但 execution 的真实状态、节点运行、恢复、取消、fallback、progress 都应由插件持久化并反馈。插件不具备需求理解智能，不能替 controller 选择 agent 或生成业务 workflow；它只能暴露 agent catalog、workflow schema、built-in workflow templates、常用 workflow 示例和校验结果。

设计原则：

- `sp_status` 是 controller 对齐事实的入口。
- `execution_spec`、node state、`sp_report`、fallback summary 是 transition 的依据。
- TUI progress 是可见性 side-channel，不能替代 `sp_report`。
- 重启恢复必须读取 durable state，不能靠 prompt 重新猜流程。

### 2.6 证据先于完成声明

任何“完成”“通过”“可交付”的判断都需要来自结构化报告和验证证据，而不是节点自然语言自称完成。

对 workflow 规划的影响：

- 需要代码变更的工作，execution spec 应包含测试、构建、审查或验证节点，除非用户明确裁剪。
- `completion_policy` 必须说明哪些 node result、artifact 或 check 可以让 workflow 结束。
- fallback summary 不能默认视为成功。

## 3. Controller Prompt 设计

应在 `super-agent` prompt 中加入一个独立的 Superpowers Operating Principles 区块。该区块要指导 controller 自主选择 direct response、single-agent delegation 或 workflow orchestration，而不是重复固定 v4 流程。

建议 prompt 文案如下，后续实现可直接改写进 `src/agents/index.ts`：

```text
## Superpowers Operating Principles

You are the workflow controller, not a worker.

User instructions and project instructions are the highest priority. Before preparing delegated execution, understand the user's goal, scope, constraints, success criteria, and any existing context. Ask in the main conversation when these user-side inputs are missing.

First decide whether the user request needs delegation. Some requests can be answered directly. If delegation is useful, choose either one best-fit agent or a multi-node workflow. A single agent task may still use the same plugin-controlled runtime as a one-node workflow run.

Plan execution from the nature of the task, not from fixed workflow names. Use Superpowers skills as process disciplines:
- use design/spec work when requirements, architecture, boundaries, or acceptance criteria are unclear;
- use planning work when execution needs multiple ordered tasks or dependency management;
- use debugging/root-cause work before repair when the request is a bug, failure, or unexpected behavior;
- use TDD-oriented implementation for production behavior changes when applicable;
- use parallel investigation only for independent problem domains;
- use verification before completion claims;
- use finishing work only after fresh verification evidence exists.

Common workflow examples are examples, not fixed templates:
- Feature with unclear requirements: intake -> design/spec -> plan/task graph -> auto-expanded implementation tasks -> acceptance -> verification -> code review -> finish.
- Simple scoped implementation: intake -> implementation -> verification -> optional review -> finish.
- Bugfix: intake/reproduce -> root cause investigation -> repair plan or implementation -> regression verification -> review -> finish.
- Design-only or plan-only: design or plan node -> terminal, with expansion_policy.mode="disabled".
- Review-only: acceptance or code review node -> verification when needed -> controller decision or finish.
- Parallel investigation: independent investigator nodes -> synthesis/finish -> controller decision before write actions.

The plugin exposes built-in workflow templates for convenience. You may choose, adapt, or ignore them. The plugin does not recommend templates from the user's natural language; you make that decision.

Generate an execution_spec when starting delegated work. It may be a single_agent spec or a workflow spec. A workflow spec may contain only the next confirmed nodes, such as design + plan, plan only, investigation, or one scoped agent task. Each delegated node must have an agent, a scoped task, required context, expected output, report_contract, and transition condition. Include document contracts for workflow artifacts that the plugin must pass between nodes, such as run-local spec.md, plan.md, task_graph.json, task reports, or verification logs. Set expansion_policy.mode="auto" when planner or agent reports may append implementation/check/finish nodes. If planner may return only task_graph, set deterministic expansion defaults such as default_task_agent, allowed_target_agents, max_added_nodes, max_expansion_depth, and default_check_chain. Set expansion_policy.mode="disabled" when the user only wants the generated bootstrap nodes, such as design-only, plan-only, or review-only work. Ask the user to confirm execution when the delegation changes files, runs high-risk commands, or the project instructions require confirmation.

Do not execute delegated node work yourself. Do not edit files, load business skills, or call the native task tool. Use sp_status to read runtime facts and deterministic capabilities, sp_prepare to validate or register a controller-generated execution_spec, sp_start to activate/resume/retry, sp_cancel to stop, and rely on node agents to call sp_report.

When runtime state is confusing, call sp_status and follow controller_feedback. If a node reports needs_user, ask the user in the main conversation and resume the original node with sp_start. If a node has no sp_report and the plugin returns fallback summary, treat it as partial evidence and choose retry, inspect, accept partial, revise workflow, or cancel according to risk.
```

这个 prompt 需要替换当前 v4 风格的固定提示：“For planning-driven work, follow this sequence...”。v5 中 controller 可以采用 design/planning，但不应被固定顺序限制。

## 4. Public Tool 调用场景和行为

### 4.1 `sp_status`

定位：只读事实查询和重新对齐入口。

典型调用场景：

- controller 收到 `/sp` 或用户要求继续、查看、恢复工作时。
- controller 不确定当前是否已有 active/draft/waiting workflow 时。
- 用户问“现在在做什么”“子会话有没有进展”“为什么卡住了”时。
- tool result、TUI、用户描述和 controller 记忆不一致时。
- 重启、恢复、blocked、fallback、waiting_user 后需要决定下一步时。

行为：

- 不修改 workflow state。
- 返回 current workflow、node 状态、最近 report/fallback、可运行节点、阻塞原因、progress digest、controller_feedback 和 allowed tool calls。
- v5 中还可以返回 agent catalog、workflow schema、built-in workflow templates 和常用 workflow 示例。它们是确定性能力说明，不是插件智能规划结果。

插件与大模型交互：

- controller 调用工具后，插件同步返回结构化 JSON。
- 大模型只根据返回值解释状态和选择下一步工具，不应靠自己记忆覆盖 `sp_status`。
- `include_progress=true` 时返回按需进度摘要，可用于主会话灰色 tool result 或用户主动查看，不应长期注入 prompt。

### 4.2 `sp_prepare`

定位：校验或注册 controller 已选择或生成并确认的 execution spec。

v5 应支持两类模式。

#### Validation mode

调用场景：

- controller 已经根据用户需求选择 single agent 或生成 workflow spec，但还没准备注册。
- controller 想让插件检查 spec 是否符合 schema、agent catalog、document contract 和 report contract。
- 用户要求“先看看流程是否合理”，controller 可以先展示 spec，再用 dry-run 校验结果补充风险。

行为：

- 输入 request 和 execution_spec。
- 返回 valid、errors、warnings、required_user_confirmations、referenced_agents、referenced_documents。
- 不创建可执行 workflow，不派发 child session。
- 不替 controller 选择 agent、选择 template、生成或修改 workflow spec。

插件与大模型交互：

- 插件把确定性的校验结果整理成 tool result。
- controller 根据校验结果自行修改 `execution_spec`，必要时再向用户确认。

#### Workflow registration mode

调用场景：

- controller 已生成 `GeneratedExecutionSpec`，或选择了内置 workflow template 并完成裁剪。
- 用户已批准执行，或项目规则允许 controller 在明确边界内直接注册 draft。
- controller 需要把 execution spec 交给插件持久化和校验。

行为：

- 校验 spec schema、node id、agent 是否存在、report_contract 是否完整、edge 是否引用有效节点、completion/fallback policy 是否明确。
- single-agent spec 会被规范化为 one-node run；该 node 仍按同一套 report、artifact、fallback 和 progress 规则运行。
- 校验 `expansion_policy` 是否存在，确认 auto/disabled 语义、allowed source nodes、allowed target agents、default task agent、最大新增节点数、递归深度和默认 check chain 是否可执行。
- 校验 document contract 是否完整，`documents[].producer_node_id`、`consumer_node_ids`、`nodes[].consumes` 和 `nodes[].produces` 是否互相匹配。
- 写入 draft state 和 `workflow-spec.json`。
- 返回 `workflow_registered`、state version、校验结果、recommended_next。
- 不自动派发节点；派发由 `sp_start` 触发。

插件与大模型交互：

- 插件把校验错误以 controller_feedback 形式返回。
- controller 修正 spec 或请求用户确认后，再调用 `sp_prepare` 或 `sp_start`。

### 4.3 `sp_start`

定位：激活、恢复、重试、继续动态 workflow。

调用场景：

- 用户批准 draft workflow 后启动。
- workflow 等待用户输入，controller 已收集答案，需要恢复原 child session。
- workflow 处于 recovered/blocked/waiting_controller_decision，controller 选择 retry、inspect、accept partial、continue 或 cancel 之外的继续动作。
- 某个 node 已 report，插件反馈需要 controller 明确选择下一步。

行为：

- 激活 draft workflow 时，计算 initial runnable nodes 并通过 orchestrator 创建或复用 child session。
- resume_input 时消费 pending question，并把回答发回原 node session，不创建新 node。
- retry 时创建新 attempt 或复用允许复用的 session，不能覆盖旧 attempt 的 record。
- 如果已有 running node，不重复派发，返回 wait 和当前状态。
- 如果存在已校验的 report-driven expansion，且 `expansion_policy.mode="auto"` 允许来源 node，插件应用 expansion 并派发新的 runnable node，不要求 controller 重新规划。
- 如果 `expansion_policy.mode="disabled"`，插件不应用 report 中的新任务，只保存 artifact，并按 bootstrap spec 的 completion policy 结束或继续已有节点。
- 返回 fresh state，而不是 dispatch 前的旧快照。

插件与大模型交互：

- controller 只调用 `sp_start` 表达已确认的控制决策。
- 插件持久化 state，再调用 OpenCode `session.create` / `session.prompt` 后台调度 child session。
- child session 的执行结果不会直接塞回 controller 当前回合；后续由 `sp_report`、progress、parent notification 或下一次 `sp_status` 反馈。

### 4.4 `sp_report`

定位：node agent 把执行结果交回运行时的唯一结构化入口。

调用场景：

- node agent 完成当前任务。
- node agent 遇到失败、阻塞或需要用户输入。
- node agent 做长任务时提交 progress。
- node agent 产出 artifact、check result、finding、task_graph 或 verification evidence。

行为：

- `progress` 只更新节点进度，不触发下游 transition。
- `passed` / `failed` / `blocked` / `needs_user` 写入 terminal 或等待状态。
- `needs_user` 写入 pending_question，并通知 parent controller session。
- `passed` report 中的 `task_graph` 或 `workflow_expansion` 会进入 expansion 校验；policy 允许且校验通过时，插件自动追加 nodes/edges/documents 并继续派发。
- policy 禁止扩展时，`task_graph` 或 `workflow_expansion` 只作为 artifact 或 report evidence 保存，不进入可执行 graph。
- terminal report 进入统一 transition，插件根据 execution spec edge、completion_policy 和 fallback_policy 计算下一步。
- report 不能包含 `next_action`、`next_suggestion`、`child_session_id`、`reuse_session_id` 或其它 control-plane 字段。node agent 的观察只能放进 `summary` 或 `findings`，由 controller 或 execution spec 决定是否采用。

插件与大模型交互：

- node agent 调用工具后，插件在该 child session 返回 tool result，说明记录和后续调度状态。
- 如果 transition 可以自动推进，插件在后台派发下一个 node。
- 如果 report 产生了合法 expansion，插件先应用 expansion，再重新计算 runnable nodes；planner 完成后不默认回 controller。
- 如果需要 controller decision，插件写 state，并通过 parent notification 或 `sp_status` 暴露给 controller。
- controller 不应要求 node agent 直接创建新 session，也不应接受 report 中自造的 `child_session_id`、`next_action`、`reuse_session_id`。

### 4.5 `sp_cancel`

定位：显式停止 workflow、node 或 session。

调用场景：

- 用户要求停止、取消、放弃当前工作。
- controller 判断 execution spec 错误、风险过高、状态混乱且不宜继续。
- 某个 child session 失控、重复失败或已经被新 attempt 取代。
- 恢复后发现旧 session late report 不能安全采用。

行为：

- 按 scope 取消 workflow、node 或 session。
- 写入取消原因、来源和 state version。
- 对 active workflow 返回取消后的 controller_feedback：terminal、可重试、可重新 prepare 或需 inspect。
- 取消后恢复不能回到固定 entrypoint，必须读取当前 dynamic workflow state。

插件与大模型交互：

- controller 调用 `sp_cancel` 后，插件返回最新 state。
- node session 可能无法被底层强杀时，插件也要把该 node 标记为 canceled/superseded，后续 late report 只能作为历史记录或需要 controller 决策。

## 5. 插件如何通过这些方法与大模型交互

### 5.1 配置注入

插件在 OpenCode config 阶段注入：

- `super-agent` 总控 agent。
- `sp-*` node agents。
- public tools: `sp_status`、`sp_prepare`、`sp_start`、`sp_cancel`、`sp_report`。
- agent permissions: controller 禁止 native task 和业务 skill；node 禁止 native task/question，只允许指定 primary skill。

这一步决定了大模型能看到哪些 agent、工具和权限边界。

### 5.2 主会话控制循环

主会话里的 `super-agent` 只做控制循环：

```text
user request
-> controller intake
-> optional sp_status
-> optional sp_status(include_capabilities=true)
-> controller decides direct response / single agent / workflow
-> if delegated, controller creates execution_spec with expansion_policy
-> optional sp_prepare validate_execution
-> user confirmation when required
-> sp_prepare register_execution
-> sp_start
```

这个循环中，大模型负责理解和决策，包括选择 agent、选择或裁剪 built-in workflow template、生成 execution spec 和解释反馈。插件负责暴露能力目录、校验、落盘和派发。controller 不直接创建 session。

### 5.3 子会话执行和扩展循环

插件通过 `sp_start` 或 report transition 创建 child session：

```text
plugin transition
-> build node task packet
-> session.create / session.prompt
-> node agent loads primary skill
-> node work
-> sp_report
-> plugin records result
-> optional expansion validation/application
-> transition or controller feedback
```

node prompt 应包含 scoped task、required context、source artifacts、expected output 和 report_contract。node agent 不应自行搜索 workflow artifact，也不应把 prompt 外的猜测当成状态来源。

当 planner 或其它 node 在 `sp_report` 中返回 `task_graph` 或 `workflow_expansion`：

- `workflow_expansion`：插件校验新增 node、edge、document、agent、artifact 引用、最大节点数和递归深度；通过后追加到当前 workflow，并直接派发新的 runnable node。
- `task_graph`：插件只做确定性转换。每个 task 变成一个 node，agent 来自 task.agent 或 `expansion_policy.default_task_agent`，depends_on 变成 edges，`default_check_chain` 变成附加检查节点。缺少 agent、超出 allowed_target_agents、超出数量或深度限制时，不猜测补齐。
- `expansion_policy.mode="disabled"`：插件保存 report 和 artifact，但不把新增任务加入 workflow。该模式用于只做设计、只做计划、只跑指定节点等场景。
- expansion 校验失败：插件把失败原因写入 controller_feedback，workflow 进入需要 controller 决策或 blocked 状态。

### 5.4 等待用户输入

当 node agent 需要用户输入：

```text
node agent -> sp_report(status="needs_user", question=...)
plugin writes pending_question
plugin notifies parent controller session
super-agent asks user in main conversation
user answers
super-agent -> sp_start(resume_input)
plugin resumes original child session
```

这个机制保证用户问题回到主会话，且原 child session 可以恢复上下文，不需要创建一个脱离 state 的新 session。

### 5.5 无 `sp_report` 的 fallback

如果 child session 没有调用 `sp_report`：

```text
plugin detects idle/error/stalled/recovered running node without terminal report
-> collect transcript/progress/tool/error evidence
-> generate FallbackSummaryResult
-> write fallback-summary.json
-> mark waiting_controller_decision unless spec explicitly allows auto-continue
-> expose result through sp_status/controller_feedback
```

fallback summary 是部分证据，不是成功报告。controller 应根据风险选择 retry、inspect、accept partial、revise workflow 或 cancel。

### 5.6 Progress 与模型上下文边界

progress 的目标是给用户看见运行状态，不是驱动大模型推理。

- `app_bottom` 显示当前 workflow 和 running node 的简短状态。
- `sidebar_content` 显示 execution spec、node graph、reports、fallback 和 attention。
- `prompt_progress` 显示当前上下文一行状态。
- 主会话灰色 tool result 可展示 `sp_status(include_progress=true)` 的按需 progress digest。

progress 不应长期注入 node prompt，也不能替代 `sp_report` 的结构化结果。

## 6. Workflow 文档生命周期

v5 需要把插件可控的 workflow artifacts 作为 execution spec 的显式 contract，而不是让节点随手查找文件。

- runtime control documents: 插件生成，用于调度、恢复和审计，例如 `execution-spec.json`、兼容性的 `workflow-spec.json`、`documents.json`、`nodes/<node-id>/task.md`、`nodes/<node-id>/record.json`、`nodes/<node-id>/fallback-summary.json`。
- workflow artifact documents: 放在 `.opencode/superpowers/runs/<run-id>/` 下，由插件读取并传给 node agent 的上下文，例如 `request.md`、`spec.md`、`plan.md`、`task_graph.json`、`tasks.json`、`reports/<task-id>/task.md`、`reports/<task-id>/report.md`、`reports/<task-id>/verification.md`。节点消费的 `spec.md` 和 `plan.md` 指的是这一层。

### 6.1 execution spec 中的文档协议

controller 生成 delegated execution spec 时，应声明文档 contract：

```ts
type WorkflowDocumentSpec = {
  id: string
  title: string
  kind: "workflow_artifact"
  path: string
  producer_node_id: string
  consumer_node_ids?: string[]
  promotion:
    | "on_node_passed"
    | "on_controller_approval"
    | "on_workflow_finish"
    | "none"
  required: boolean
}
```

node 通过 `consumes` 和 `produces` 引用 document id。`kind="workflow_artifact"` 的 `path` 相对 run 目录。插件校验这些引用，但不替 controller 决定哪些 workflow artifacts 应该存在。

### 6.2 生成时机

- controller intake: 只在主会话中问清需求和展示草案。用户未批准前，不需要 materialize run-local workflow artifacts。
- `sp_prepare(register_execution)`: 插件写入 `execution-spec.json`、兼容性的 `workflow-spec.json`、`documents.json`、draft state 和 `events.jsonl`。这是 runtime control documents；single-agent spec 会被规范化为 one-node run。
- `sp_start`: 插件派发 node 前生成 `nodes/<node-id>/task.md`；如果有 `task_id`，同时生成 `reports/<task-id>/task.md`。
- designer/planner node: 通过 `sp_report.artifacts` 产出 `spec`、`plan`、`task_graph` 等 candidate；插件把它们保存在 run 目录下。
- promotion 条件满足：插件把 candidate materialize 成 canonical workflow artifact，例如 `spec.md`、`plan.md`、`task_graph.json`、`tasks.json`。常见条件是 `on_node_passed`；需要人工确认的设计可使用 `on_controller_approval`。
- report-driven expansion：如果 `sp_report` 同时包含 task graph 或 workflow expansion，插件在 canonical artifact 生成后按 `expansion_policy` 校验和追加节点。
- implementer/reviewer/verifier node: 插件读取 canonical workflow artifacts 并内联到 node prompt；这些 node 不应自行搜索 run 目录之外的 `spec.md` 或 `plan.md`。

### 6.3 candidate 与 canonical

- `progress` report 产生的 workflow artifact 只能是 candidate/progress，不能解锁下游。
- `passed` report 可以让 `promotion="on_node_passed"` 的 workflow artifact 成为 canonical。
- `promotion="on_controller_approval"` 的 workflow artifact 必须等待 controller 明确批准后才能成为 canonical；默认 plan 后执行路径应使用 `on_node_passed`，避免回到 controller 才能继续。
- 下游 node 只能消费已经 canonical、且在 `consumer_node_ids` 中允许它消费的 workflow artifact。
- 如果 required workflow artifact 缺失、stale 或没有 canonical，transition 应返回 controller decision 或 blocked，不能让 node 自行搜索替代材料。

常见例子：

- `sp-designer` 产出的 spec 通常在 `passed` 后成为 canonical `spec.md`，由插件传给 planner；如果 bootstrap spec 明确要求人工确认，可设为 `on_controller_approval`。
- `sp-planner` 产出的 plan/task graph 通常在 `passed` 后成为 canonical `plan.md`、`task_graph.json` 和 `tasks.json`；当 `expansion_policy.mode="auto"` 时，插件据此追加 implementer、reviewer、verifier 等后续节点。
- 每个 child node 的 `nodes/<node-id>/task.md` 总是由插件生成，用于证明该 node 收到的任务范围。

## 7. Controller 决策表

| 场景 | controller 应做什么 | 推荐工具 |
|---|---|---|
| 用户提出新需求，但目标/范围/验收不清 | 主会话澄清，先不 prepare | 无或 `sp_status` |
| 用户需求清楚且无需委派 | controller 直接回答或说明下一步 | 无 |
| 用户需求清楚，但需要能力参考 | 读取 agent catalog、schema、built-in templates 和常用示例后自行选择 agent 或 workflow | `sp_status(include_capabilities=true)` |
| 适合单 agent 执行 | 生成 single-agent execution spec | `sp_prepare(mode="validate_execution")` 可选 |
| 适合内置 workflow | 选择并裁剪 built-in template，生成 workflow execution spec | `sp_prepare(mode="validate_execution")` 可选 |
| execution spec 已生成但未校验 | dry-run 校验 spec | `sp_prepare(mode="validate_execution")` |
| execution spec 已生成且需要执行 | 让用户确认后注册 draft | `sp_prepare(mode="register_execution")` |
| draft 已注册且用户批准 | 激活 execution | `sp_start(approve_execution)` |
| 用户问当前进度 | 读取事实和 progress digest | `sp_status(include_progress=true)` |
| node report passed 且 edge 明确 | 插件可自动派发；controller 等状态反馈 | `sp_status` 按需 |
| node report passed 且产生合法 expansion | 插件按 policy 自动追加并派发；controller 不重新规划 | `sp_status` 按需 |
| node report passed 且只有 task_graph | 插件按 deterministic defaults 转成 nodes；缺默认 agent 或校验失败则反馈 controller | `sp_status` 按需 |
| node report 产生 expansion 但 policy disabled | 插件保存 artifact，不追加节点；按 bootstrap completion policy 结束或继续 | `sp_status` 按需 |
| node report 产生 expansion 但校验失败 | controller 查看错误后 revise workflow、retry 或 cancel | `sp_status` -> `sp_prepare` / `sp_start` / `sp_cancel` |
| node report failed/blocked 且 spec 无明确 edge | controller 选择 retry/revise/cancel | `sp_status` -> `sp_start` 或 `sp_cancel` |
| node needs_user | 向用户提问，拿到答案后恢复原 node | `sp_start(resume_input)` |
| child 无 report，只有 fallback summary | 视为部分证据，决策 retry/inspect/accept partial/cancel | `sp_status` -> `sp_start` 或 `sp_cancel` |
| 状态混乱或重启恢复后不确定 | 以 durable state 为准重新对齐 | `sp_status` |
| 用户要求停止 | 明确 scope 后取消 | `sp_cancel` |

## 8. 当前实现差距

从现有代码看，后续实现至少需要补齐这些点：

- `src/agents/index.ts` 的 `super-agent` prompt 仍强调 v4 planning-driven 固定顺序，需要替换成动态 workflow principles。
- `super-agent` prompt 需要加入 agent vs workflow 选择原则、built-in workflow templates 和常用 workflow 示例，但明确 templates/examples 不是插件智能建议。
- `sp_prepare` 当前仍围绕固定 kind / prepare mode，需要支持 `validate_execution` 和 `register_execution`。
- transition 仍主要由固定 router/workflow 规则驱动，需要改为读取 `GeneratedExecutionSpec`，并支持 single-agent spec 规范化为 one-node run。
- 需要实现 `expansion_policy`，以及 `sp_report.task_graph` / `sp_report.workflow_expansion` 到 workflow graph 的自动追加。
- 需要给自动扩展增加最大节点数、允许来源 node、允许目标 agent、默认 task agent、递归深度和默认 check chain 等 guard。
- 需要持久化 `execution-spec.json`、兼容性的 `workflow-spec.json` 和 `documents.json`，并把静态能力目录、built-in templates、常用示例和 registered spec 分开。
- 需要实现 document contract 校验、candidate/canonical promotion 和 node-document 关联。
- 需要实现 no-report fallback summary 的检测、摘要、落盘和 controller feedback。
- TUI progress 需要按动态 node graph 展示，不再假设固定 phase。
- 测试需要覆盖 tool 调用边界、fallback、late report、waiting_user resume、dynamic edge dispatch 和 recovery。

## 9. 设计自检

- 不把 Superpowers 理念固化为固定 workflow；controller 根据任务性质决定 direct response、single agent 或 workflow。
- 内置 workflow templates 和常用 workflow examples 只作为 prompt/capability 参考，不能变成插件智能规划或固定流程。
- controller 可以只生成 single-agent execution spec 或 bootstrap workflow；plan 后执行由 report-driven expansion 推进，不默认回 controller。
- 五个 public tools 保持不变，符合 v5 PRD 的 public surface。
- controller、plugin、node agent 三者职责分开：controller 决策，plugin 执行和持久化，node agent 汇报。
- workflow artifacts 通过 `documents` contract 关联 node，生成时机、run-local path、plugin inline 传递和 promotion 规则明确。
- `sp_report` 和 fallback summary 进入同一 transition 入口，但 fallback 不默认成功。
- 用户输入、取消、恢复、late report、progress 都有明确 runtime 入口。
- progress 只做可见性，不驱动状态机。

## 10. 后续实现建议

实现可以分三步：

1. 先改 `super-agent` prompt 和 agent catalog 文档，让 controller 规划理念先对齐 v5。
2. 扩展 `sp_prepare` / state schema，支持 `validate_execution`、`register_execution`、`execution_spec`、single-agent one-node normalization 和 `documents` 注册。
3. 改 transition、document promotion 与 fallback runtime，使动态 spec、文档 contract、`sp_report` 和 fallback summary 进入统一调度入口。
