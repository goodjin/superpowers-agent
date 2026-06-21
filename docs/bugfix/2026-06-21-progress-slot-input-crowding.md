# Bug Fix: Resident Progress Crowds Input Area

## 问题描述

- 日期: 2026-06-21
- 严重程度: Medium
- 影响范围: SuperAgent TUI 主会话布局

常驻 progress surface 扩展到多个 host slot 后，启动或刷新时可能在 prompt/input 附近展示 `SP:` compact 行，挤占输入框和底部操作元素。用户需要在主会话里持续看到子会话进度，但这条状态不应该影响输入区域。

## 根因分析

- 问题位置: `src/tui.ts`
- 原因:
  - `RESIDENT_PROGRESS_SLOT_NAMES` 同时包含 `session_prompt_right` 和 `home_prompt_right`。
  - `home_footer` 的 host 布局语义不够明确，也可能靠近底部输入/状态区域。

## 修复方案

- 将常驻 progress 主承载收敛为 `sidebar_footer`, `sidebar_content`, `home_bottom`, `app_bottom`。
- 保留 `session_prompt_right` 作为短 fallback indicator，限制为 44 字符，避免当前 host layout 不渲染 bottom/sidebar 时完全看不到进度。
- 从 TUI 注册名单中移除 `home_prompt_right`, `home_footer`。
- 更新 TUI 单元测试，断言 `home_prompt_right` 不注册，且 `session_prompt_right` fallback 被截短。
- 更新 progress 模块文档，明确主会话底部和右侧栏是常驻进度承载区。

## 验证步骤

1. 运行 TUI/progress targeted tests。
2. 运行完整 test。
3. 运行 build。
4. 运行 OpenCode e2e。
5. 重新部署 isolated superagent runtime。
