# Bug Fix: Resident Progress Has No Visible Surface

## 问题描述

- 日期: 2026-06-21
- 严重程度: High
- 影响范围: SuperAgent TUI 子会话进度可见性

当前 child session progress 已持续写入 `nodes/<node-id>/progress.jsonl`，但主会话界面仍没有稳定可见的 Superpowers progress surface。只保留 bottom/sidebar slots 后，当前 OpenCode TUI layout 没有把这些位置展示给用户。

## 根因分析

- 问题位置: `src/tui.ts`, `src/tui/progress-panel.ts`
- 原因:
  - `home_bottom`, `app_bottom`, `sidebar_content`, `sidebar_footer` 在当前 host layout 中不是可靠可见 surface。
  - 完全移除 prompt-side slot 后，主会话失去了唯一已知可见锚点。
  - 之前的 prompt-side 问题来自长文本挤占输入区，而不是“任何短状态都不能存在”。

## 修复方案

- 保留 main bottom/sidebar resident slots 作为首选承载。
- 重新加入 `session_prompt_right`，但限制 compact progress 为 44 字符，只做短 fallback indicator。
- 保持 `home_prompt_right` 和 `home_footer` 不注册。
- 让 `renderCompactProgressText()` 支持最大长度参数，并用测试固定 fallback 截断行为。

## 验证步骤

1. 运行 TUI/progress targeted tests。
2. 运行完整 test。
3. 运行 build。
4. 运行 OpenCode e2e。
5. 重新部署 isolated superagent runtime。
