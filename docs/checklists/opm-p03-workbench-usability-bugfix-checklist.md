# Task Checklist: OPM P03 工作台 P0 可用性修复

## Spec Mapping

- 当前任务规格文档：`specs/opm-p03-workbench-usability-bugfix-task-spec.md`
- `Task Type`：`bugfix`
- `Active Playbooks`：`frontend-vue (primary)`、`testing`
- 目标：修复 P03 桌面底栏、移动工具栏、移动画布可达性和空 E2E 成功。
- 范围：P03 模板/CSS、`tests/e2e/**`、根 E2E 脚本、本规格和本 checklist。
- 非目标：路由、符号、mock adapter、无障碍、后端和契约。
- 验收：规格第 8 节的三类布局断言和完整质量命令。
- 回滚：规格第 9 节，不涉及数据或 schema。

## Task 1 - 复现与测试准备

- [x] 在 1440x1000 复现底栏为 0px、校验区为 240px。
- [x] 在 390x844 复现工具栏覆盖画布、过程结点不可达。
- [x] 确认 `test:e2e` 零用例成功。
- [x] 新增失败 E2E 回归用例，并覆盖条件通知出现后的固定行高。

## Task 2 - 实现

- [x] 收敛条件通知并固定主 Grid 区域。
- [x] 改为自适应工具栏高度。
- [x] 为画布提供内部水平滚动。
- [x] 配置 E2E web server 并移除空测试放行。

## Task 3 - 验证与交付

- [x] lint、typecheck、unit、E2E、build 通过。
- [x] 1440x1000、390x844 浏览器复核通过。
- [x] 输出 Root Cause、Fix Strategy、风险与遗留项。
