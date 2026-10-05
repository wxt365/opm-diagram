# Checklist: P03 布局拖放稳定性修复

## Spec Mapping

- 规格：`specs/opm-p03-layout-drag-stability-bugfix-task-spec.md`
- 风险：`L2`
- Task Type：`bugfix`
- Active Playbooks：`none (primary)`

## Build

- [x] `UPDATE_LAYOUT` 重读保持工作台 ready 状态。
- [x] 增加布局提交期间不显示加载提示的回归测试。

## Verify

- [x] 定向单测、全量单测、lint、typecheck、build 和相关 E2E 通过。
