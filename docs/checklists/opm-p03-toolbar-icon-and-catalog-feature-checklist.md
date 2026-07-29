# Task Checklist: OPM P03 图标工具栏与关系目录

## Spec Mapping

- 当前任务规格：`specs/opm-p03-toolbar-icon-and-catalog-feature-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`frontend-vue (primary)`、`testing`
- 目标：图标化工具栏、State/Relation 入口与 16/8/10 关系目录。
- 范围：规格第 4 节允许的工作台、Mock、样式、测试、依赖与本文件。
- 非目标：后端、OpenAPI、数据库、正式 State/Relation 命令与生产 Symbol Catalog。
- 约束：关系合法性不在页面或 Pinia 硬编码；未接入能力必须可解释。
- 验收：规格第 9 节。
- 验证：定向单元、E2E、lint、typecheck、unit、build。
- 回滚：回退本任务涉及的前端、测试与依赖锁文件；无数据回滚。

## Task 1 - 分析

- [x] 阅读 P03 当前页面、Store、类型、样式和现有测试。
- [x] 阅读完整画布工具链、handoff 与执行包，确认完整能力仍受 DEV-CANVAS-00~06 依赖约束。
- [x] 确认当前实现只提供 Object、Process、Consumption 三条 Mock 路径。
- [x] 确认本任务不修改后端、OpenAPI、Schema、Profile/Rule/Grammar/Symbol Catalog。

## Task 2 - 测试准备

- [x] 增加图标工具和目录分组的失败测试。
- [x] 增加菜单焦点、不可用原因与 Consumption 回归测试。
- [x] 增加移动工具栏横向可达性 E2E。

## Task 3 - 实现

- [x] 锁定 `@lucide/vue@1.27.0` 依赖版本。
- [x] 在 Mock adapter 提供关系目录展示数据。
- [x] 实现图标化固定工具组、领域工具和关系目录。
- [x] 实现本地菜单搜索、焦点恢复和不可用反馈。
- [x] 调整桌面与移动样式，保持工具栏和画布分离。

## Task 4 - 验证

- [x] 运行定向单元测试。
- [x] 运行 `npm run lint`。
- [x] 运行 `npm run typecheck`。
- [x] 运行 `npm run test`。
- [x] 运行 `npm run test:e2e`（6 passed）。
- [x] 运行 `npm run build`。
- [x] 核对未实现能力没有被呈现为生产可用。
