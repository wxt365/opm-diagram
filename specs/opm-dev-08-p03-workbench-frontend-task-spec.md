# Spec: OPM DEV-08 P03 Workbench Frontend

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 背景

DEV-07 已将 P01/P02 切换到 Local Runtime API，但 P03 工作台仍以设计确认 Mock store 驱动，不能展示实际 Semantic Revision、OPL、校验和 Revision 历史，也不能提交 P0 语义命令。

## 2. 目标

将 P03 根系统图工作台接入既有 Local Runtime API：读取 workspace session、navigation、projection、text、validation/task 与 revisions；提交 Object、Process 和 Consumption 的 P0 命令，并在 committed revision 后重新读取服务端投影。

## 3. 非目标

- 不修改 OpenAPI、SQLite V1、Profile/Rule/Grammar/Symbol 资产或后端命令语义。
- 不实现 P04-P06、State、细化、快照、完整 16/8/10 关系能力或完整画布工具链。
- 不引入依赖，不调整全局主题、路由结构或发布打包。

## 4. 范围

### 包含范围

- `apps/web/src/shared/api/**`：补齐既有 P03 API client 和 DTO/ViewModel 映射。
- `apps/web/src/stores/**`：新增独立 P03 运行时状态，隔离设计确认 Mock。
- `apps/web/src/modules/workbench/**`：P03 五区读取、P0 命令交互与页面级测试。
- 仅在确有客户端与服务端 DTO 不一致时修改 `services/local-runtime/**` 并补 Spring 测试。

### 不包含范围

- `docs/contracts/openapi/**`、`docs/contracts/migrations/**`、`packages/**`。
- P04-P06、`DEV-CANVAS-*`、设计确认 Mock 的功能扩展。

## 5. 设计输入 / 开发前文档基线

- 开发执行范围：`docs/design/opm-development-execution-pack.md` 6.5、DEV-08 及 P0 边界。
- 页面与交互：`docs/design/opm-modeling-workbench-page-design.md`、`opm-modeling-workbench-component-interaction.md`、`opm-modeling-workbench-state-model.md`、`opm-modeling-workbench-field-region-detail.md`。
- API：`docs/contracts/openapi/opm-local-api-v1.yaml` 中 P03 workspace/navigation/projection/command/text/validation/revision operation。
- 前端实现标注：`docs/design/opm-frontend-handoff.md`。
- `design-module-docs` 不启用：本包消费已冻结设计输入，不增补设计文档。

## 6. 方案要求

1. 页面不得直接拼接 URL 或读 P03 fixture；统一经 `localRuntimeApi` 和 P03 runtime store。
2. 初次进入按稳定 `projectId/modelId` 获取 workspace session；revision/context 由服务端返回并同步至 query。
3. P03 只允许根系统图，`CREATE_ELEMENT` 仅 Object/Process，`CREATE_FACT` 仅 Consumption；前端只暴露服务端允许的命令。
4. 每个语义命令携带 request_id、command_id、base_revision、binding 和会话令牌；`COMMITTED` 后重读 projection/text/validation/revisions。
5. viewport 变化只更新本地视图状态；不产生 revision。语义写操作才更新 revision。
6. blocked/failed/conflict/save-failed/readonly 必须保留可恢复提示；图文与 Finding 按稳定 ID 定位。

## 7. 输入输出/接口影响

- 仅消费 DEV-06 已有 API，不新增或变更 OpenAPI 字段。
- 新增的前端 DTO 仅为既有 wire response 映射；写请求遵循既有 binding/命令结构。
- 后端若无需兼容修复则不修改；不影响 P01/P02 调用方。

## 8. 数据与状态变化

- 不新增表、迁移或配置。
- P03 前端状态从 Mock 独立为按 workspace 重新获取的运行时状态。
- 命令成功由服务端创建 revision；前端不构造正式模型或 revision。

## 9. 风险点

- 当前 UI 覆盖的设计确认能力多于 P0 API，必须明确禁用而不是伪造成功。
- 多个异步读取可能发生竞态，旧响应不得覆盖新 revision/context。
- Local Runtime 错误 envelope 与浏览器提示需保持可恢复且不泄漏令牌。

## 10. 验收标准

1. P03 五区显示当前服务端 context、projection、OPL、validation/task 和 revisions。
2. Object、Process、Consumption 成功命令产生新的 committed revision，并从服务端重读图文与历史。
3. conflict、blocked/failed、save-failed、readonly 显示正确提示和恢复路径；viewport 不创建 revision。
4. P03 页面/API 测试覆盖成功、读取失败、命令冲突与只读；前端 lint/typecheck/test/build 通过。
5. Java 21 verify、契约校验、`git diff --check` 通过；浏览器 smoke 覆盖 P02 打开 P03 与至少一条 P0 命令主路径。

## 11. 回滚方案

回退新增 P03 runtime store、P03 API 映射和工作台接线，恢复 DEV-07 时的设计确认 P03；不回滚已由服务端提交的 revision，不涉及 schema 或契约回滚。
