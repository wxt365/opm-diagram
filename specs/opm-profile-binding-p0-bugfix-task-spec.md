# Spec: OPM P0 Runtime Profile Binding 修复

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 目标

消除前端 `profile_version = "0.1.0"` 硬编码与 Runtime 活动 Profile `0.2.0` 的冲突。模型创建、编辑命令和校验命令必须从同一个 Runtime 下发 binding 读取 Profile/Rule 标识及版本。

## 2. 范围

允许修改：

- `apps/web/src/env.d.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts` 及其单元测试
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalRuntimeBootstrapController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- 对应 Runtime MVC/应用测试
- 本规格和 checklist

禁止修改：SQLite migration、OpenAPI operationId、Profile 包资产、既有工作台功能、依赖版本、DEV-CANVAS-06 或发布能力。

## 3. 根因与最小复现

事实：`localRuntimeApi.ts` 的 `defaultBinding()` 被模型创建、编辑命令和校验共用，但固定发送 `profile_version: "0.1.0"`；`LocalApiService` 要求活动 Profile `0.2.0`，导致这三类请求返回 `RULE_VERSION_CONFLICT`。

最小复现：启动 Runtime 和 Web，创建 Project 后创建 Model；请求体携带 `0.1.0` 时，`POST /api/v1/projects/{projectId}/models` 返回 `409 RULE_VERSION_CONFLICT`。

## 4. 方案

1. 复用已有 `/opm-bootstrap.js` 作为同源 Runtime 配置源，在其 session 数据旁下发活动 Profile/Rule binding。
2. Runtime binding 的值必须由 `LocalApiService` 当前活动 binding 生成，Bootstrap Controller 不复制 Profile/Rule 常量。
3. 前端写请求从 `window.__OPM_ACTIVE_PROFILE_BINDING__` 读取 binding；当启动资源缺失或数据不完整时，阻止请求并返回结构化 `RUNTIME_BINDING_UNAVAILABLE`，不得回退到硬编码版本。
4. 为模型创建、编辑命令、校验命令添加请求体断言，并覆盖 Bootstrap 输出与缺失 binding 的拒绝路径。

## 5. 验收与验证

1. 模型创建、编辑命令、校验请求都携带 Runtime 下发的同一 binding。
2. 运行时 Profile `0.2.0` 下 P01 -> P02 -> P03 不再产生 `RULE_VERSION_CONFLICT`。
3. `npm run test --workspace=@opm/web`、Runtime 定向测试和 `npm run test:e2e` 现有 8 条均通过。
4. 不修改 OpenAPI、数据库 schema 或公共 operationId。

## 6. 回滚与风险

回滚仅移除本任务涉及的 Bootstrap binding 注入和前端读取逻辑。运行时 Profile 包升级后，Bootstrap 与 API service 必须保持同一活动 binding；本任务通过同一 Service 数据源避免 Controller 双源，但不覆盖多 Profile 选择、Profile 迁移或 DEV-CANVAS-06 发布闭环。
