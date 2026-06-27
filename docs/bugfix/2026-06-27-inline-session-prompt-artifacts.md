# Bug Fix: Inline Session Prompt Artifacts

## 问题描述

- 日期: 2026-06-27
- 严重程度: High
- 影响范围: `sp_start` / `sp_report` 派发的 planner、implementer、reviewer、verifier node session

Node prompt 只列出 `request.md`、`artifacts/plan.md`、`spec.md` 等相对路径。child session 的工作目录是项目根目录，不是 `.opencode/superpowers/runs/<run-id>/`，模型找不到文件后会扩大搜索范围，甚至执行 `find /`。

## 根因分析

- 问题位置: `src/session/templates.ts` 和 `src/session/orchestrator.ts`
- `buildNodeTaskPrompt()` 只把 `required_artifacts` 渲染成路径清单。
- orchestrator 生成 prompt 时没有读取 run 目录里的 required artifact 正文。
- 设计文档要求 runtime 读取 workflow/task/spec/plan/report 后生成 session prompt，而不是让模型自行拼 source context。

## 修复方案

- 在 session 层增加 artifact 正文读取逻辑。
- `buildNodeTaskPrompt()` 保留路径清单，同时追加 `## Source Artifacts`，内联每个 required artifact 的正文。
- 路径解析以 `.opencode/superpowers/runs/<run-id>/` 为根，兼容 `request.md`、`spec.md`、`plan.md`、`artifacts/*.md`、`reports/*/*.md`。
- 文件缺失时在 prompt 里显式标记 missing，避免模型全盘搜索。

## 验证步骤

1. 添加失败测试：orchestrator dispatch 应把 required artifact 正文内联进 child prompt。
2. 实现 artifact 正文读取和 prompt 渲染。
3. 运行聚焦测试、完整测试、构建和 OpenCode e2e。

## 相关测试

- `bun test test/session-orchestrator.test.ts`: 9 pass
- `bun run test`: 120 pass
- `bun run build`: pass
- `bun run test:e2e:opencode`: 15 pass

## 设计建议

Node agent 不应该负责寻找 workflow artifact。runtime 是 prompt 生成方，应把必要上下文直接提交给 session，并保留路径作为审计引用。
