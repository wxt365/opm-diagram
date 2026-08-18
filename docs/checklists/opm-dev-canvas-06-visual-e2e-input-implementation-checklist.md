# Checklist: DEV-CANVAS-06 Visual/E2E 输入与 Manifest 实现

> 状态：`HISTORICAL/SUPERSEDED`。已完成项只证明 Common Fixture 首轮实现；未完成的合并 builder 项永久停止，不得在本 checklist 继续勾选。当前唯一修正入口为 `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md` 及其 checklist。

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-visual-e2e-input-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标：实现公共 fixture 与 Visual/E2E Manifest builder。
- 范围、非目标、约束、验收、回滚：以当前任务规格第 2 至第 6 节为准。
- API/Schema/数据库影响：不修改公共 API、SQLite 或 Profile Schema；只消费既有 JSON Schema。

## Build

- [x] 已确认 Handoff、Coverage、Golden Manifest/Replay 和现有 P0 E2E 可复用边界。
- [x] 已创建版本化 Common Fixture Catalog、factory 和 fixture 文件，并由 READY Handoff active binding 派生。
- [ ] （已终止）实现 Visual/E2E 合并 Manifest builder 与固定命令。
- [ ] （已终止）补充合并 manifest 生成正反例。

## Verify

- [x] Common Fixture Catalog Schema 正例通过。
- [ ] Visual/E2E Manifest Schema 正例通过。
- [ ] 缺 golden、错误 join、E2E golden 参数反例通过。
- [x] `git diff --check` 通过。

## Risks And Residuals

- [x] 本切片不生成 golden PNG 或 Report，`GATE-06-03` 仍为 `BLOCKED`。
- [x] 不生成 Candidate、Activation，不启用 Capability。
- [x] Visual `0.1` builder 目标已废止；E2E `0.1` 必须由独立入口实现。
