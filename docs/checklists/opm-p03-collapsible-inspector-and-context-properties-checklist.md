# Checklist: OPM P03 按需属性检查器与右键属性入口

## Spec Mapping

- Spec：`specs/opm-p03-collapsible-inspector-and-context-properties-task-spec.md`
- 验收：`INSPECTOR-01~06`
- 边界：仅前端视图状态、布局、测试和相关设计文档；API、Schema、Runtime、依赖和持久化禁止修改。

## Build

- [x] 默认移除检查器 DOM 和桌面第三列。
- [x] 右键菜单增加非破坏性的“打开属性”首项和分隔线。
- [x] 工具栏增加稳定属性面板开关，检查器增加关闭按钮。
- [x] 候选编辑状态独立维持右侧任务区。
- [x] X6 开启容器自动 resize。
- [x] 删除测试改为使用明确的删除动作定位，不依赖菜单第一项。

## Verify

- [x] Vue 定向测试通过：`36/36`；完整 Vue 测试通过：`86/86`。
- [x] P03 Playwright 通过：`14/14`。
- [x] lint、typecheck、build 通过。
- [x] `git diff --check` 通过。
- [x] 浏览器确认默认画布扩展、右键打开、关闭恢复和 Revision 不变。
