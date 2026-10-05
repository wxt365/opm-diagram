# Task Checklist: OPM P03 命令反馈布局稳定性修复

## Spec Mapping

- 规格：`specs/opm-p03-command-feedback-layout-stability-bugfix-task-spec.md`
- 验收：`P03-FEEDBACK-01`～`P03-FEEDBACK-04`
- 边界确认：仅修改工作台反馈展示、样式、测试和本任务文档；Revision/URL 与 Runtime 契约不变。

## Build

- [x] `P03-FEEDBACK-01` 命令反馈迁入画布悬浮状态层。
- [x] `P03-FEEDBACK-02` 页面级读取失败继续保留顶部状态区。

## Verify

- [x] `P03-FEEDBACK-03` 浏览器验证反馈出现前后 Grid 几何和 Revision 不变。
- [x] `P03-FEEDBACK-04` 自动化验证和 diff 检查通过。

## Verify Record

- `2026-09-11`：非法 Invocation 端点触发 Runtime 无候选反馈，提示显示于画布悬浮层；工作台 Grid 的 `x/y/width/height` 与提示前一致，Revision 不变。
- `2026-09-11`：Workbench 定向单测 `30/30`、Web 全量单测 `88/88`、关系 E2E `4/4`、lint、typecheck、build 和 `git diff --check` 通过。
- 构建保留既有 `/opm-bootstrap.js` 非 module 警告，与本任务无关。
