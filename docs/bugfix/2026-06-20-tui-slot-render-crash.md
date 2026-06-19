# Bug Fix: TUI Slot Render Crash

## 问题描述

- 日期: 2026-06-20
- 严重程度: High
- 影响范围: Superpowers TUI persistent progress surface

用户在运行 TUI 时看到 `bunfs/root/chunk-g2e5x2h0.js` 相关异常。服务日志显示 TUI plugin 已加载，但常驻进度 surface 渲染异常，导致主界面看不到子会话实时进度。

## 根因分析

- 问题位置: `src/tui.ts`
- 原因: 常驻 slot 直接返回字符串。OpenTUI/Solid slot 应返回可渲染的 OpenTUI/Solid element；裸字符串会进入 host 的渲染路径并触发内部 chunk 栈异常。
- 次要问题: slot render 未做异常隔离。读取 workflow state 或 progress JSONL 时如果出现文件解析问题，会把异常抛进 TUI 渲染器。

## 修复方案

- 使用 `@opentui/solid` 的 `createElement("text")` 和 `insert()` 生成 text element。
- 在 TUI 入口加载 `@opentui/solid/runtime-plugin-support`，让外部插件使用 host TUI 兼容的 Solid/OpenTUI runtime。
- 将 compact progress slot 包装为 `createCompactProgressSlot()`，只在有 active workflow 文本时返回元素。
- slot 读取进度失败时返回 `SP: progress unavailable`，避免 TUI 渲染器崩溃。
- TUI build 对 `@opentui/solid` 使用 external，运行时通过 package dependency 解析 OpenTUI/Solid runtime。

## 验证步骤

1. 复查最新 OpenCode 日志，确认 TUI plugin load 成功，异常集中在渲染 surface。
2. 修正 slot 返回类型和失败隔离。
3. 运行 TUI plugin 单测。
4. 运行项目构建并重新打包。

## 相关测试

- `bun test test/progress-panel.test.ts test/tui-plugin.test.ts`
- `bun run build`
