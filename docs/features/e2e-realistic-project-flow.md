# E2E Realistic Project Flow

## Background

现有 workflow e2e 更接近“按预设 `sp_record` 推动状态机”。它能证明 proposal、gate、artifact 和 dispatch 的基本逻辑，但还不能证明以下几件事：

- `super-agent` 是否真的先理解用户、再走 `sp_route` / `sp_prepare` / `sp_start`
- `sp-planner`、`sp-implementer`、`sp-spec-reviewer`、`sp-code-reviewer`、`sp-verifier` 是否真的拿到了插件生成的节点 prompt
- 每个节点是否真的通过预期工具返回结果，而不是测试直接代替节点写 `sp_record`
- planning-driven workflow 是否真的经过 `plan review -> user confirm -> start execution`

用户希望 e2e 更像一个“真实项目实现过程”，也就是：

1. 有一个合理的项目目标和约束。
2. `super-agent` 先澄清、确认、决定进入哪条流程。
3. `sp_prepare` 创建 planning draft。
4. `sp-planner` 看到真实节点 prompt，写正式 plan 和 task graph。
5. `super-agent` 审查 plan，等待用户确认。
6. `sp_start(run_id)` 激活 run。
7. implement / review / verification / finish 节点按预期顺序执行。
8. 测试中途断言经过了哪些节点、用了哪些工具、prompt/record 是否合理。

## Goal

把 workflow e2e 提升到“项目实现模拟”层面，验证控制器、子节点 prompt、工具调用和关键状态转换，而不只是最终 state。

## Scope

- 为 mock LLM server / harness 增加稳定的端口分配，避免 `Bun.serve({ port: 0 })` 在当前环境直接失败。
- 为 child session prompt 提供可预测的 request marker 注入，让节点 agent 的真实 LLM 回合可被 mock expectation 驱动。
- 扩展 harness 读取能力：
  - 读取 mock 请求日志
  - 读取最近 run 的 `nodes/*/task.md`
  - 读取最近 run 的 `nodes/*/record.json`
  - 读取 child dispatch 顺序
- 新增至少一条“真实项目实现链路” e2e：
  - `super-agent`
  - `sp_route`
  - `sp_prepare`
  - `sp-planner`
  - `super-agent`
  - `sp_start(run_id)`
  - `sp-implementer`
  - `sp-spec-reviewer`
  - `sp-code-reviewer`
  - `sp-verifier`
  - `sp-finisher`

## Scenario Contract

测试场景应模拟一个合理的项目任务，例如：

- “给任务运行面板增加批量视图、重试操作和验证覆盖”

每个节点都必须具备：

- 合理的输入 prompt
- 合理的工具调用
- 合理的产物或结果

### `super-agent` 期望行为

- 先读取当前状态或路由 proposal
- 在 planning-driven workflow 上先 `sp_prepare`
- 在 planner 完成后查看 plan / task graph，再请求确认
- 用户确认后才调用 `sp_start(run_id)`

### `sp-planner` 期望行为

- 从节点 prompt 中读取 request / workflow / objective
- 调用 `sp_record(event="plan")`
- 产出 plan artifact 和 `task_graph`
- 不提前开始 implementation

### `sp-implementer` 期望行为

- 从节点 prompt 中读取 task id 和 required artifacts
- 调用 `sp_record(event="implementation")`
- 提交 `red_test_log` 和 `patch_summary`

### review / verification / finish 节点

- 使用对应 `sp_record` event
- 产出与节点契约一致的 artifact
- 顺序必须是 `spec-review -> code-review -> verification -> finish`

## Assertions

每个场景至少断言以下内容：

1. **节点顺序**
   - 是否经过了预期节点
   - 是否跳过不该跳过的节点

2. **工具顺序**
   - `sp_route -> sp_prepare -> sp_start(run_id)` 是否按预期出现
   - 各 child node 是否调用了预期的 `sp_record`

3. **prompt 真实性**
   - `nodes/*/task.md` 是否包含预期 objective、primary skill、record contract、required artifacts
   - provider 请求是否包含对应 child marker 和 node prompt 片段

4. **状态与产物**
   - draft run 是否停在 `awaiting-plan-approval`
   - 激活后是否进入 implementation dispatch
   - 关键 artifact 是否存在且内容合理

5. **super-agent 控制点**
   - plan 完成后是否真的回到 controller review / confirm
   - `sp_start(run_id)` 前是否已经有 plan artifact 和 pending confirmation

## Non-Goals

- 不在这次 e2e 里覆盖所有失败分支。
- 不要求每个节点都运行真实文件写入或真实测试命令。
- 不把 e2e 变成完整仓库实现；重点是控制面、prompt、tool、artifact 和节点流转。

## Validation

- 新 scenario 的 mock expectation 必须覆盖 controller turn 和 child node turn。
- 至少一条全成功链路通过。
- 原有 targeted unit tests 和 `bun run build` 继续通过。
- 如果 workflow e2e 仍因环境问题失败，必须把失败点收敛到与本次逻辑无关的基础设施问题，并在结果里明确说明。
