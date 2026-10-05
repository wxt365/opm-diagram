# Spec: P03 布局拖放稳定性修复

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `none (primary)`

## 1. 目标

修复 Object 或 Process 拖放后提交 `UPDATE_LAYOUT` 时，工作台短暂进入 `loading` 状态导致 Grid 布局上下晃动的问题。

## 2. 非目标

- 不改变布局命令、Runtime、修订提交、路由、投影内容或 X6 拖放行为。
- 不优化其他命令的加载状态，也不修改样式、依赖或 API。

## 3. 允许范围

- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `specs/opm-p03-layout-drag-stability-bugfix-task-spec.md`
- `docs/checklists/opm-p03-layout-drag-stability-bugfix-checklist.md`

## 4. 契约影响

`UPDATE_LAYOUT` 必须继续通过 Runtime 提交并以 committed revision 重读投影；重读期间保持既有 `ready` 状态。其他命令仍使用默认加载行为。

## 5. 验收

1. Object/Process 拖放仍发送原有的 `UPDATE_LAYOUT` payload，并使用 committed revision 重读投影。
2. 布局重读尚未完成时，页面不显示工作台加载提示，画布 Grid 不发生由 resource state 引起的高度变化。
3. 前端定向单测、全量单测、lint、typecheck、build 和相关 E2E 通过。

## 6. 回滚

回退本规格允许范围内的改动即可恢复原行为，不影响已提交 Revision。
