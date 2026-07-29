# Task Checklist: OPM P04 工作台契约修复

## Spec Mapping

- 当前任务规格文档：`specs/opm-p04-workbench-contract-bugfix-task-spec.md`
- `Task Type`：`bugfix`
- `Active Playbooks`：`frontend-vue (primary)`、`testing`
- 目标：补齐 P03 的稳定定位、Mock 边界、P0 符号契约和弹层可访问性。
- 范围：工作台/项目 Vue、router、Pinia、共享 Mock 适配层和前端测试。
- 非目标：后端、OpenAPI、数据库、P04-P06、完整关系和 State 工具。
- 约束：URL 只保存 revision/context；不新增依赖；当前 Mock 只提供设计确认数据。
- 验收：规格第 7 节的 route、adapter、X6、dialog 与测试要求。
- 回滚：规格第 8 节，不涉及数据或 schema。

## Task 1 - 复现与测试准备

- [x] 复现 Context 切换后 URL 不变，刷新回到根 SD。
- [x] 复现 X6 Object/Process 尺寸、Consumption marker/label 偏离契约。
- [x] 复现弹层没有 dialog 语义且焦点留在触发按钮。
- [x] 新增稳定定位、符号和焦点回归测试。

## Task 2 - 实现

- [x] 为 P03 同步 revision/context URL 并处理非法定位回退。
- [x] 迁移设计确认 Mock fixture 与纯投影构建到共享适配层。
- [x] 对齐 P0 X6 Object/Process/Consumption 渲染契约。
- [x] 补齐现有 P0 弹层对话框语义和焦点恢复。

## Task 3 - 验证与交付

- [x] lint、typecheck、unit、E2E、build 通过。
- [x] 桌面与移动浏览器复核通过。
- [x] 输出 Root Cause、Fix Strategy、风险与遗留项。
