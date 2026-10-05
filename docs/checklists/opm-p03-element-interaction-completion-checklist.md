# Task Checklist: OPM P03 元素选择与布局编辑

## Spec Mapping

- 规格：`specs/opm-p03-element-interaction-completion-task-spec.md`
- 风险：`L3`
- Task Type：`feature`
- Active Playbooks：`none (primary)`

## Build

- [x] `UPDATE_LAYOUT` 从 Legacy payload 收敛为受控 OpenAPI 与生成 DTO。
- [x] Runtime 只对当前 Context 的 owned Object/Process occurrence 更新布局并提交 Revision。
- [x] X6 左键选择不再与画布平移冲突，Object/Process 拖动结束后提交布局。
- [x] 同一工作台的布局提交重读不触发 loading 重排或 X6 全量清空。

## Verify

- [x] 后端覆盖成功、错误 occurrence 与语义不变。
- [x] 前端覆盖选择、拖动事件与 committed revision 重读。
- [x] 契约、类型、单测、构建和 diff 检查通过。
