# Task Checklist: OPM DEV-CANVAS-01 State End-to-End

## Spec Mapping

- 规格：`specs/opm-dev-canvas-01-state-end-to-end-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`frontend-vue`、`testing`
- 目标：完成 Object State 从命令、Revision、Projection、OPL/Trace 到 P03 的最小闭环。
- 非目标：完整关系、跨 owner 移动、SQLite migration、P01/P02、性能/发布门槛。
- 约束：State 不是 Element；Process State 必须阻断；Context presentation 写入 Revision。
- 验收：State 符号/命令/检查器/State-specified Consumption/OPL Trace/E2E 均可证明。
- 验证：契约、前后端分层测试、Local Runtime E2E、质量门与 diff check。
- 回滚：关闭 State 工具，历史 State 只读可渲染，不删除数据。

## 分析

- [x] 确认 DEV-CANVAS-00 契约与 P0 主路径已通过。
- [x] 确认 SemanticRevision 已存在 State/owner/roles/occurrence 基础结构。
- [x] 冻结 Context-scoped State presentation 的持久化归属与兼容默认值。
- [x] 核对 Local Runtime 的 Capability/OPL/Projection 扩展点及现有测试模式。

## 实现

- [x] 扩展 State presentation 与 State 专属命令契约、DTO 和校验。
- [x] 实现 State capability、命令、impact、Projection、OPL/Trace 及重开行为。
- [x] 支持 Legacy Consumption 的可选 `state_id`，并验证 owner、Projection、OPL 与 Trace。
- [x] 实现 `STATE_EXPLICIT`、`STATE_SUPPRESS`、`FOLD`、`UNFOLD` 的 Context-scoped Revision 与 Projection 读取。
- [x] 实现 P03 State 创建候选、State 检查器与 X6 State 基础符号。
- [x] 实现 State 删除 impact option/token、引用阻断与 P03 删除交互。
- [x] 完成浏览器验收及 Local Runtime E2E 主路径。
- [x] 增加 State 后端、前端及主路径 E2E 覆盖。

## 验证与交付

- [x] 执行 contract generate/check/validate。
- [x] 执行 lint、typecheck、Vitest、build。
- [x] 使用 Java 21 执行 Local Runtime verify。
- [x] 执行 Local Runtime E2E、浏览器 State 主路径与 diff check。
