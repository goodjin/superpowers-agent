# Superpowers Controller

Superpowers Controller 是一个面向 OpenCode coding agents 的任务控制插件。

它基于 Superpowers methodology，但把流程从“靠 skill 提醒模型怎么做”推进到“由插件维护状态、调度节点、记录结果”。大模型负责理解任务、拆分任务和完成节点产出；插件负责推进 workflow、持久化状态、恢复中断和记录审计日志。

## 怎么使用

一行命令安装：

```bash
curl -fsSL https://raw.githubusercontent.com/goodjin/superpowers-controller/main/scripts/install.sh | bash
```

安装后检查：

```bash
bunx superpowers-controller doctor
opencode agent list
```

启动时选择 `super-agent`：

```bash
opencode --agent super-agent
```

如果要从本项目源码编译后安装：

```bash
git clone https://github.com/goodjin/superpowers-controller.git
cd superpowers-controller
bun install
bun run build
bash scripts/install.sh
```

这个本地安装路径会使用当前 checkout 的源码 CLI 写入 OpenCode 配置，并同步插件打包的 primary skills。

## 设计理念

很多 agent 框架用 skill 承载工作方法。skill 很轻，也容易扩展，但长程任务会把问题放大：同一个主会话加载太多 skill 后，上下文变长、噪音变多；改用 subagent 可以隔离单个节点，但任务编排、结果回收、失败处理和继续推进仍会压回主会话。

Superpowers Controller 把这部分流程压力交给插件 runtime。模型只需要处理当前节点的判断和产出；插件负责保存 workflow state、校验 gate、记录 artifacts、调度下一步，并在重启后恢复。

可以把它看作动态工作流方案：workflow 可以由主控根据任务生成或裁剪；进入执行后，节点顺序、执行状态、结果记录和异常处理由插件接管。

## 组成部分

```text
super-agent -> Node Session -> Node Agent -> Primary Skill
      |
      v
State / Router / Gate / Session Control
```

- **super-agent**：用户入口，负责理解需求、准备任务、恢复状态、创建或复用节点会话。
- **Node agent**：专门角色，例如 `sp-debugger`、`sp-implementer`、`sp-verifier`。
- **Primary skill**：节点使用的方法，例如 systematic debugging、TDD、verification。
- **Plugin runtime**：负责状态、路由、gate、会话控制、artifact 记录和恢复。

核心工具：

- `sp_status`：查看当前 workflow、节点、进度和可用能力。
- `sp_prepare`：准备任务、生成摘要和执行方案。
- `sp_start`：启动、继续或裁决 workflow。
- `sp_cancel`：取消当前 workflow。
- `sp_report`：节点 agent 提交结构化结果、证据和后续建议。

插件状态保存在项目本地：

```text
.opencode/superpowers/current.json
.opencode/superpowers/runs/<run-id>/state.json
.opencode/superpowers/runs/<run-id>/artifacts/*.md
```

## 配置

默认配置是 guided：遇到 gate 问题会提示，但不直接阻断。可以切到 strict：

```jsonc
{
  "mode": "guided",
  "tdd": "strict",
  "design_gate": "guided",
  "debug_gate": "guided",
  "verification_gate": "guided",
  "state": {
    "scope": "project",
    "retention_days": 30
  }
}
```

`strict` 会阻断工具调用；`guided` 记录 warning；`off` 关闭对应 gate。

## 开发验证

```bash
bun install
bun run test
bun run build
bun run e2e:opencode
```

更多设计细节见：

```text
docs/superpowers/specs/2026-06-11-controller-final-design.md
docs/superpowers/specs/2026-06-28-controller-prd-v5.md
```
