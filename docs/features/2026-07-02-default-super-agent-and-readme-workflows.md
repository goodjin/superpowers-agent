# Default Super Agent And README Workflow Notes

## Goal

让安装后的默认入口更贴合 Agent-first 定位：普通启动 OpenCode 时默认使用 `super-agent`，README 同时说明持久化、审计、配置含义和内置 workflow。

## Scope

- 安装器写入 OpenCode config：
  - `plugin` 包含 `superpowers-controller`
  - `default_agent` 为 `super-agent`
- doctor 增加 default agent 检查。
- 移除内部 legacy `/sp-*` command mode 映射，保留自然语言分类。
- README / README.en.md 补充：
  - 持久化方便恢复、跟踪和审计
  - 配置段说明这是插件 gate/runtime 配置，不是 provider/model 配置
  - 核心工具后增加内置 workflow 简介
  - 安装后默认 agent 行为

## Acceptance

- `install()` 写入 `default_agent: "super-agent"`。
- 重复安装不产生重复 plugin entry。
- `bun run test` 通过。
- `bun run build` 通过。
