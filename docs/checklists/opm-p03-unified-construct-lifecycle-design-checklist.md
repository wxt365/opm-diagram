# Checklist: P03 统一画布构造生命周期设计

## Spec Mapping

- 规格：`specs/opm-p03-unified-construct-lifecycle-design-task-spec.md`
- 验收：`LIFECYCLE-DESIGN-01` 至 `LIFECYCLE-DESIGN-07`
- 边界：本 checklist 只冻结设计，不修改或验收 OpenAPI、Runtime、SQLite、Vue、X6、E2E、release 或 ISO 证据。

## Design

- [x] `LIFECYCLE-DESIGN-01` 创建/删除命令矩阵已冻结。
- [x] `LIFECYCLE-DESIGN-02` occurrence、target、CASCADE 和依赖闭包已冻结。
- [x] `LIFECYCLE-DESIGN-03` impact/token/payload/reason/error/幂等边界已冻结。
- [x] `LIFECYCLE-DESIGN-04` Fact 与 Control 的不同删除语义已冻结。
- [x] `LIFECYCLE-DESIGN-05` 右键菜单直接执行、快捷键无菜单直接执行和 X6 意图边界已冻结。
- [x] `LIFECYCLE-DESIGN-06` 后继实现范围、验收和回滚已冻结。
- [x] `LIFECYCLE-DESIGN-07` 受影响设计文档、handoff、索引和基线已同步。

## Verify

- [x] 新增及受影响 Markdown 本地链接、代码围栏和尾随空白有效。
- [x] 当前 OpenAPI 0.2 的既有 `DELETE_CONSTRUCT` 与后继 machine delta 的差异已明确，不误称 Runtime 已实现。
- [x] 未把设计验证表述为 Runtime、浏览器、DEV-CANVAS-06、Candidate、Activation、production 或 ISO 证据。

## Verify Record

- `2026-09-03`：9 份新增及受影响 Markdown 的本地链接与代码围栏检查通过；`git diff --check` 与尾随空白检查通过。
- `2026-09-03`：`npm run contract:validate` 通过。现有 OpenAPI 0.2 `DeleteConstructPayload` 仍为 `construct_kind/construct_id/impact_token`，没有本规格冻结的 `selection_id/delete_mode` 与完整 impact item；因此仅记录后继 machine delta，不修改或宣称当前 Runtime 行为。
- `2026-09-03`：应用 API、完整画布、组件交互、X6 渲染架构、前端 handoff、索引和冻结基线已同步；未运行 Runtime、Vue、浏览器或发布 Gate。
- `2026-09-05`：删除入口修正为右键构造操作菜单和 `Delete/Backspace`；不提供独立删除图标。右键菜单项点击即提交，键盘查询后按固定优先级直接提交且不显示菜单；两者仍必须经 Runtime option/impact token，X6 不直接移除 Cell。
