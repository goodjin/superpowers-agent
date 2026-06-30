# Task-Scoped Acceptance Dispatch

## 背景

Feature workflow 的 implementation task 完成后，runtime 需要启动检查链路。当前实现里，`implementation` report 通过后会直接派发一个没有 `task_id` 的 `sp-acceptance-reviewer` 会话。这会让 reviewer 按整个 workflow 进行验收，也会导致依赖图里 T2-T6 这类后续 task 没有机会继续被派发。

## 目标

- `sp-implementer` 汇报某个 task 完成后，runtime 派发绑定同一 `task_id` 的 `sp-acceptance-reviewer`。
- Acceptance prompt 必须包含该 task 的任务定义、实现完成总结和实现报告内容，避免 reviewer 只能看到全局 workflow 状态。
- Acceptance 通过后继续按同一 `task_id` 派发 verification，再派发 code review。
- Code review 通过后，runtime 回到 task graph 调度，派发下一个依赖已满足的 implementation task。

## 输入来源

Acceptance prompt 由 runtime 生成，来源如下：

- Task definition：来自当前 workflow state 的 `task_graph.tasks[]`，按 `task_id` 精确匹配。
- Implementation completion summary：来自触发派发的 `sp_report.summary`。
- Implementation report：优先使用触发派发的 `sp_report.artifacts.patch_summary`；同时在提示词中给出 `reports/<task_id>/report.md` 的稳定路径，方便 reviewer 读取最新落盘报告。
- Workflow context：给出 `spec.md`、`plan.md`、`tasks.json` 和当前 task 的 `reports/<task_id>/task.md` 路径。

Agent 不自己拼装这些来源。它只读取 runtime 生成的 prompt 和列出的文件，完成检查后调用 `sp_report(event: "acceptance", ...)`。

## 派发逻辑

1. `sp-implementer` 对 task `Tn` 调用 `sp_report(event: "implementation", status: "passed", ...)`。
2. Runtime 记录 node result，写入 `reports/Tn/report.md`。
3. Runtime 派发 `sp-acceptance-reviewer`，decision 携带 `task_id: "Tn"` 和 implementation report 摘要。
4. `buildNodeTaskPacket` 从 state 和 decision 构造 acceptance prompt：
   - 明确 review scope 是 `Tn`。
   - 内联 task JSON。
   - 内联 implementation summary / patch summary。
   - 列出需要读取的 source files 和 report paths。
5. Acceptance 通过后，runtime 用同一 `task_id` 派发 verification。
6. Verification 通过后，runtime 用同一 `task_id` 派发 code review。
7. Code review 通过后，runtime 重新计算 task graph runnable tasks；如果还有依赖已满足的 task，派发 implementer；否则进入 finish。

## 验收

- T1 implementation passed 后，派发结果包含 `phase: "acceptance"`、`agent: "sp-acceptance-reviewer"`、`task_id: "T1"`。
- Acceptance prompt 包含 T1 的 title、summary、files、test commands、implementation summary 和 patch summary。
- T1 code review passed 后，如果 T2 依赖 T1，则派发 T2 implementer，而不是直接 finish。
