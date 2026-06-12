# OpenCode E2E Workflow Tests

## Goal

在真实 OpenCode runtime 下验证 Superpowers Controller 的关键流程。测试不直接调用插件内部函数，而是启动 OpenCode 1.16.2、加载当前构建产物、通过本地 mock LLM 返回预设模型输出，再检查工具调用、workflow state 和 artifact。

当前已搭建可复用基础设施，并覆盖 8 个真实 OpenCode 场景：

- harness smoke：真实 `opencode run` 能通过 mock provider 消费 request_id expectation。
- debug happy path：模型调用 `sp_route` 后写入 root cause，生成 state 和 artifact。
- strict gate blocks repair write：debug 模式未记录 root cause 时，修复性写入被 gate 阻断。
- full feature lifecycle：从 design/spec、plan、red test、implementation、review 到 fresh verification 的长链路。
- record validation recovery：`sp_record` 缺少 gate artifact 时失败，随后附带 artifact 恢复。
- completion verification gate：`done` 在 fresh verification 前失败，记录 verification 后通过。
- active waiting reroute：等待态 workflow 优先于后续不同意图的路由请求。
- execute gate order：strict execute 下先卡 plan，再卡生产写入前的 red test。

## Runtime Setup

每个 scenario 使用隔离环境：

- 临时 `HOME`
- 临时 `XDG_CONFIG_HOME`
- 临时 project directory
- 本地 mock LLM server
- `file://dist/index.js` 插件入口

临时 `opencode.jsonc` 配置：

```json
{
  "plugin": ["file:///absolute/path/to/dist/index.js"],
  "model": "llm-mock/test-model",
  "enabled_providers": ["llm-mock"],
  "provider": {
    "llm-mock": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "LLM Mock",
      "options": {
        "baseURL": "http://127.0.0.1:<port>/v1",
        "apiKey": "mock-api-key"
      },
      "models": {
        "test-model": {
          "name": "Test Model"
        }
      }
    }
  }
}
```

## Trace and Request IDs

`trace_id` 标识一个测试场景，`request_id` 标识一次 LLM 请求。

测试 prompt 使用 marker：

```text
[e2e_trace_id:<trace_id>] [llm_request_id:<request_id>] <task>
```

mock LLM 仍以 `request_id` 作为主匹配键。harness 会读取 mock 请求列表，并按 trace/request 检查是否有多余请求或未消费 expectation。

## Harness API

第一版提供：

- `createOpencodeE2EHarness()`
- `harness.runOpencode(args)`
- `harness.readWorkflowState()`
- `harness.readArtifact(name)`
- `harness.mock.expect(expectations)`
- `harness.mock.requests()`
- `harness.mock.pending()`
- `harness.close()`

`runOpencode` 使用异步 child process，避免同步阻塞 Bun server，保证 mock LLM 能响应 provider 请求。

## Verification Levels

每个 scenario 至少验证：

1. OpenCode exit code。
2. mock LLM 收到的 request_id。
3. pending expectations 为空，除非场景明确预期提前失败。
4. `.opencode/superpowers/current.json` 和 run `state.json`。
5. 关键 artifact 文件内容。
6. stderr 中没有非预期 provider/runtime 错误。

## Scenario Set

### Harness Smoke

注册一个文本 expectation，并运行真实 `opencode run`。e2e 断言 OpenCode 成功退出、mock 收到 1 个 request_id、pending expectation 为空。

request_id 缺失由 mock server 单元测试覆盖。真实 OpenCode provider 错误后的退出行为不稳定，第一轮不把它作为 workflow e2e gate。

### Debug Happy Path

预设两次模型响应：

1. `debug-route`：返回 `sp_route` tool call，参数包含 `/sp-debug`。
2. `debug-record-root-cause`：返回 `sp_record` tool call，写入 `root_cause` artifact 和 `root_cause_found` gate。
3. `debug-final`：返回普通文本，结束当前 OpenCode turn。

断言最终 state：

- `mode === "debug"`
- `gates.root_cause_found === true`
- `artifacts.root_cause === "root_cause.md"`
- `runtime.skills_used` 包含 `superpowers-systematic-debugging`
- `artifacts/root_cause.md` 非空

### Strict Gate Blocks Repair Write

临时配置设置：

```json
{
  "debug_gate": "strict"
}
```

预设两次模型响应：

1. `debug-route`：返回 `sp_route`，进入 debug。
2. `debug-write-before-root-cause`：返回 `write` tool call，试图修改生产文件。
3. `debug-write-blocked-final`：返回普通文本，结束当前 OpenCode turn。

断言第三次 provider 请求体包含 `root_cause_found gate is required before repair writes`，state 仍处于 debug 且未打开 `root_cause_found`。

### Full Feature Lifecycle

预设多轮模型响应：

1. `/sp-design` 进入 design workflow。
2. `sp_record` 写入 spec artifact，并打开 `spec_written`、`design_approved`。
3. `sp_record` 写入 plan artifact，并打开 `plan_written`。
4. `sp_record` 写入 red test、patch summary、spec review，并打开对应 gate。
5. `sp_record` 写入 code review、verification log，并打开 `code_review_passed`、`verification_fresh`。
6. 文本响应结束回合。

断言最终 state 处于 `verified`，所有关键 gate 打开，history 保留完整节点序列，所有 artifact 都可从 run 目录读取。

### Record Validation Recovery

先调用 `sp_record` 设置 `plan_written` 但故意不传 `plan` artifact。测试断言下一次 provider 请求体包含 `plan_written requires plan artifact`。随后模型重新调用 `sp_record` 并附带 `plan`，最终 state 只记录成功的 plan 事件。

### Completion Verification Gate

先在 `/sp-verify-finish` 中记录 `done`，因为缺少 `verification_fresh` 被拒绝。随后记录 `verification_log` 并打开 `verification_fresh`，再记录 `done`。断言 history 中只有成功的 `verified` 和 `done`。

### Active Waiting Reroute

debug workflow 写入 root cause 后进入 `waiting-review`。同一回合内再次调用 `sp_route`，请求内容偏向 feature implementation。测试断言路由结果仍返回 active waiting workflow，且不会覆盖原 debug state。

### Execute Gate Order

临时配置：

```json
{
  "mode": "strict",
  "tdd": "strict"
}
```

流程先进入 `/sp-execute`，直接写生产文件会因为缺 `plan_written` 失败；记录 plan 后再次写生产文件，会因为缺 `red_test_seen` 失败；记录 red test 后结束。测试断言两个错误都进入后续 provider 请求体，且 state 只打开已证明的 gate。

## Remaining Scenario Groups

基础设施跑通后，再扩展：

- controller routing：显式命令、自然语言、低置信、active state continuation。
- `sp_record`：更多 artifact/gate 组合、skills 去重、history 边界。
- tool gate：design、review、guided/off 模式。
- LLM 边界：未知工具、坏 JSON、重复 request_id、429/500、慢流、tool call streaming。
- workflow：plan、execute、review、verify、reset、多 trace 串行互不污染。
