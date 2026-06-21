# Bug Fix: Resident Progress Surface Not Visible

## 问题描述

- 日期: 2026-06-21
- 严重程度: High
- 影响范围: SuperAgent TUI 主会话进度展示

当前 workflow state 和 `nodes/<node-id>/progress.jsonl` 已经记录了 running child session，但主会话 TUI 没有稳定展示 Superpowers 进度。用户只能看到 OpenCode 原生 `todowrite` 面板，无法确认 Superpowers Controller 是否仍在跟踪子会话。

## 根因分析

- 问题位置: `src/tui.ts`, `src/tui/progress-panel.ts`
- 原因:
  - compact progress 只注册到 `session_prompt_right` 和 `sidebar_footer` 两个位置，实际 TUI 布局中这些 slot 可能不可见或不在当前界面渲染。
  - running child session 进展停在 pending/running 状态时，compact 文本没有明确标出 stale/stalled。
  - 测试只验证了 route 和两个 slot 注册，没有覆盖更多常驻候选 surface 和无 session props 渲染。

## 修复方案

- 在 TUI 插件中集中定义 resident progress slot 名单，并额外注册到 `sidebar_content`, `home_bottom`, `app_bottom`, `home_footer`, `home_prompt_right`。
- 保持 `session_prompt_right` 和 `sidebar_footer` 向后兼容。
- 在 progress view-model 中计算 running node 的 `activity_status`，超过阈值未更新时显示 `stalled`。
- 补充 TUI 插件和 progress panel 测试。

## 验证步骤

1. 运行 TUI/progress targeted tests。
2. 运行完整 test。
3. 运行 build。
4. 运行 e2e。
5. 重新部署 isolated superagent runtime。

## 设计建议

如果 OpenCode 后续提供官方固定 status bar slot，应把 resident slot 名单收敛到官方 slot，并保留当前多 slot 注册作为兼容层。
