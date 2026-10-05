# Task Checklist: OPM P03 画布平移工具修复

## Spec Mapping

- 规格：`specs/opm-p03-canvas-pan-tool-bugfix-task-spec.md`
- 验收：`P03-PAN-01`～`P03-PAN-05`
- 边界确认：仅修改工作台工具状态、X6 平移配置、组件测试和本任务文档。

## Build

- [x] `P03-PAN-01` 选择/平移按钮状态互斥并传入画布。
- [x] `P03-PAN-02` 平移模式启用左键拖动画布并隔离节点交互。
- [x] `P03-PAN-03` 关系与 State 工具恢复选择模式。

## Verify

- [x] `P03-PAN-04` 浏览器验证平移工具左键拖动与切回选择。
- [x] `P03-PAN-05` 定向测试、typecheck、lint、build 和 diff 检查通过。
