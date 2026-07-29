# Spec: OPM P04 工作台契约修复

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 背景

P03 已完成桌面和移动布局可用性修复，但当前实现仍偏离 P0 handoff：Context 与 Revision 不能稳定定位和刷新恢复；设计确认 Mock、投影生成和页面状态耦合在单一 Pinia store；X6 基础图形不符合 Object/Process/Consumption 符号契约；弹层缺少对话框语义和焦点管理。

## 2. 目标

1. 工作台 URL 稳定承载项目、模型、活动 revision 与 Context；Context 切换、语义修订变更和刷新均恢复同一可用 Context。
2. 设计确认 Mock fixture、Context/Text/Finding 投影生成迁至 `shared/api/mock`；Pinia 仅编排页面状态和本地交互会话。
3. P0 X6 Object、Process 与 Consumption 按冻结符号尺寸、白色闭合箭头和无重复关系标签渲染。
4. 所有现有 P0 弹层提供 `role="dialog"`、`aria-modal`、关联标题、打开时焦点进入以及关闭时回到触发控件。
5. 为以上行为补充单元和 E2E 回归测试。

## 3. 非目标

- 不接入真实后端、OpenAPI generated client、SSE、数据库或本地文件运行时。
- 不实现 P04-P06 页面、完整关系目录、State 工具或完整画布增量。
- 不修改 OpenAPI、Schema、后端、依赖版本和全局视觉主题。

## 4. 范围

### 包含范围

- `apps/web/src/app/router.ts`
- `apps/web/src/modules/workbench/**`、`apps/web/src/modules/projects/**`
- `apps/web/src/stores/designConfirmation.ts`
- `apps/web/src/shared/api/mock/**`、`apps/web/src/shared/composables/**`、`apps/web/src/shared/types/**`
- `tests/e2e/**` 与现有前端单元测试
- 本规格与 checklist。

### 不包含范围

- `services/**`、`docs/contracts/**`、`docs/design/**`、`prototype/**`、数据库与 API 契约。

## 5. 设计依据与根因

1. `opm-frontend-handoff.md` 第 5.1 节和 `opm-modeling-workbench-state-model.md` 第 4 章要求浏览器 route 仅保存可恢复的 project/model/revision/context，刷新先解析并验证这些定位项。当前路由只有 project/model，Context 切换不改变 URL。
2. P0 任务规格要求 Mock 统一隔离在前端适配层；当前 fixtures、Context、OPL、Finding 和页面状态都在 `designConfirmation.ts`。
3. `opm-symbol-and-text-generation-implementation-contract.md` 第 4.2、5.2、5.3 节冻结 Object `160 x 72`、Process `168 x 84`、白填充闭合箭头，且 P0 基础关系不得显示重复名称；当前 X6 使用相反尺寸、实心 block marker 和 `consumes` edge label。
4. `opm-modeling-workbench-component-interaction.md` 第 12.1 节要求弹层打开时焦点进入首个可编辑字段、关闭后回到触发控件；当前弹层为普通 form。

## 6. 方案约束

1. 使用可选 URL query `revision` 与 `context` 承载 P03 定位；不得把选择、viewport、工具模式、未提交表单或弹层写入 URL。
2. 当前 Mock 只支持活动修订；非法、过期或不属于模型的 Context/revision 回退到当前 Draft 的根 Context，并保留非阻断反馈。
3. Mock adapter 只提供设计确认数据和纯投影/命令结果；不模拟真实 HTTP 或把 X6 Cell 作为正式模型。
4. 不添加图标或图片依赖；关闭按钮保持现有可访问名称。

## 7. 验收标准

1. 从 `/projects/:projectId/models/:modelId/workbench?revision=18&context=processing-refinement` 进入或刷新后，显示 Processing refinement；切换 Context 后 URL 更新。
2. 语义缩放创建新 revision 后 URL revision 更新；非法 Context/revision 回退到可用根 Context。
3. `designConfirmation.ts` 不再定义 Mock fixtures、Context/OPL/Finding 纯构建函数；这些由 `shared/api/mock` 提供。
4. X6 Object 为 `160 x 72`、Process 为 `168 x 84`；Consumption 使用白填充闭合箭头且没有边标签。
5. OV01、OV02、OV03、OV05、OV06、OV11 与过程内缩放弹层具备对话框语义；焦点进入弹层并在关闭后返回触发按钮。
6. lint、typecheck、unit、E2E、build 通过；E2E 覆盖 URL 恢复、符号与焦点主路径。

## 8. 验证与回滚

- 验证：`npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、`npm run build`，并以 1440x1000、390x844 的浏览器状态复核。
- 回滚：还原本任务所涉 Vue、Mock adapter、测试和任务文档；不涉及数据、Schema 或外部系统回滚。
