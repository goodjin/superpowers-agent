# Bug Fix: Hide Resident Progress On Home Screen

## 问题描述

- 日期: 2026-06-25
- 严重程度: Medium
- 影响范围: SuperAgent TUI 首页布局

首页布局没有可靠的 `sidebar_content` 区域承载插件内容。此前为了展示未完成任务，把 no-session `sidebar_content` 当成首页 surface 使用，并继续注册 `home_bottom`，导致插件 resident progress 可能出现在首页。

## 根因分析

- 问题位置: `src/tui.ts`
- 原因:
  - `RESIDENT_PROGRESS_SLOT_NAMES` 注册了 `home_bottom`。
  - `sidebar_content` 的 no-session 分支会渲染 unfinished task list。
  - 非 compact resident slot 没有要求 session props，导致首页/no-session surface 也可能显示 active workflow。

## 修复方案

- 移除 `home_bottom` resident slot 注册。
- `app_bottom`, `sidebar_content`, `sidebar_footer` 必须有 session props 才渲染。
- `sidebar_content` 只展示主会话里的 running child session 列表。
- 首页/no-session 场景返回空，不展示插件 resident content。

## 验证步骤

1. 运行 TUI/progress targeted tests。
2. 运行完整 test。
3. 运行 build。
4. 运行 OpenCode e2e。
5. 重新部署 isolated superagent runtime。
