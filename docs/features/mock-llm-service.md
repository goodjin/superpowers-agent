# Mock LLM Service

## Goal

测试 OpenCode 插件时，需要稳定控制模型返回。当前 e2e 只验证插件能被 OpenCode 1.16.2 加载，没有覆盖一次真实 chat turn 里的系统消息注入、工具调用、状态写入和 gate 行为。

这个功能提供一个测试专用的 LLM mock 服务。测试先注册每个 LLM 请求的返回结果，再发起 OpenCode 请求。mock 服务按请求里的 `request_id` marker 找到预设响应，返回 OpenAI-compatible Chat Completions 数据。

## Request ID Contract

测试 prompt 中放入 marker：

```text
[llm_request_id:debug-route-001]
```

mock 服务按下面顺序解析请求 ID：

1. `metadata.request_id`
2. `x-request-id` header
3. messages 里的 `[llm_request_id:<id>]` marker

当前实现以 prompt marker 为主要路径，因为它不依赖 OpenCode 是否透传自定义 metadata 或 header。

## Control API

mock 服务暴露测试控制接口：

- `POST /__mock/reset`：清空 expectation 和请求记录。
- `POST /__mock/expectations`：注册预设响应。
- `GET /__mock/requests`：读取已收到的 LLM 请求。
- `GET /__mock/pending`：读取还没有消费的 expectation。

每个 expectation 由 `request_id` 唯一匹配。命中后标记为 consumed。未带 `request_id`、重复请求、没有预设响应都会返回 `409`，让测试尽早失败。

## LLM API

mock 服务支持：

- `GET /v1/models`
- `POST /v1/chat/completions`

第一版支持普通文本和 tool call 响应。tool call 响应用于驱动 OpenCode 调用插件工具，比如 `sp_route`、`sp_next`、`sp_record`。

## Test Flow

1. e2e 脚本启动 mock LLM 服务，拿到本地端口。
2. 创建临时 `HOME` 和 `XDG_CONFIG_HOME`。
3. 写入临时 `opencode.jsonc`，加载 `file://dist/index.js`，并配置 custom OpenAI-compatible provider 指向 mock 服务。
4. 注册 request_id 对应的模型响应。
5. 执行 `opencode run --model llm-mock/test-model ...`。
6. 断言 mock 收到预期请求，插件写出预期 workflow state 或 artifact。

## Scope

本功能只添加测试设施，不改变插件核心 runtime 行为。后续如果 OpenCode 明确支持 provider metadata 或 header 注入，可以把 `request_id` 从 prompt marker 迁移到更干净的传参方式，同时保留 marker 作为兼容路径。
