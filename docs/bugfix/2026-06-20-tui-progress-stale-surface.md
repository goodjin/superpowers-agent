# TUI Progress Stale Surface

## Context

用户在运行 isolated `superagent` 时，主会话长时间没有展示子会话进展。日志确认子会话已经创建，`nodes/<node-id>/progress.jsonl` 也持续写入；当前 active node 卡在 `sp-finisher` 的用户确认问题。

## Diagnosis

- 数据链路正常：server plugin event hook 能捕获 child session 事件并写入 progress JSONL。
- TUI 插件已加载：isolated `tui.json` 指向 `dist/tui.js`，当前 TUI 日志显示插件已加载。
- 常驻 surface 不可靠：compact slot 只在渲染时同步读取一次 workflow/progress，没有自己的刷新触发。父会话没有新消息时，OpenCode 不会因为 child progress 文件变化而自动重绘该 slot。
- 过滤过严：slot 只允许 parent session id；当 host 传入当前 child session id 时，会把同一 workflow 的 child surface 过滤为空。

## Fix

- `createCompactProgressSlot()` 改为默认每秒刷新一次 compact progress 文本。
- slot 同时支持 `session_id` 和 `sessionID` props。
- session 过滤放宽为同一 workflow 内的 parent session 或任一 node child session；无关 session 仍返回空。
- 单元测试用 `refreshMs: 0` 保持同步断言，并覆盖 parent、child、camelCase prop 和 unrelated session。

## Verification

- `bun test test/tui-plugin.test.ts test/progress-panel.test.ts`
- `bun run build`
