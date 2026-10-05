# Checklist: P03 直接删除与平行关系分轨

## Spec Mapping

- 规格：`specs/opm-p03-direct-delete-and-parallel-relation-layout-task-spec.md`
- 验收：`P03-DIRECT-DELETE-01` 至 `P03-VERIFY-01`
- 边界：仅修改前端交互/渲染、设计文档和测试；Runtime、API/schema、SQLite、依赖与发布链保持不变。

## Plan

- [x] 冻结右键一次点击、键盘无菜单、固定 mode 优先级和失败零部分删除。
- [x] 冻结简单二元关系的稳定分组、分轨间距、复杂关系排除和 X6 更新边界。

## Build

- [x] `P03-DIRECT-DELETE-01/02/03` 直接删除链路与回归测试完成。
- [x] `P03-PARALLEL-RELATION-01/02` 分轨纯函数、X6 接入与回归测试完成。

## Verify

- [x] `P03-VERIFY-01` 定向/全量 Vue、lint、typecheck、build、P03 Playwright、浏览器视觉检查及 diff 检查完成。

## Verify Record

- `2026-09-05`：定向 Vue `41/41`、全量 Vue `83/83`、lint、typecheck、contract/build 和 `git diff --check` 通过。
- `2026-09-05`：构造删除 Playwright `1/1`、关系手势/分轨 Playwright `2/2` 通过；两条同端点关系的 committed SVG path 不同，刷新后路径逐项一致。
- `2026-09-05`：真实浏览器桌面截图确认两条关系分居上下轨道，节点、箭头、关系线和 OPL 无关键遮挡；未将本地功能验证提升为 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 证据。
