# Spec: OPM DEV-06 M02/M09 P0 Local API

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 目标

实现 OpenAPI `opm-local-api-v1.yaml` 已冻结的 16 个 P0 operationId，提供本地 Project/Model、Context/Projection、P0 Command/Text、Validation Task、Revision/Baseline/Task 查询能力，并将写操作接入 Host/Origin/`X-OPM-Session`、base revision、Profile/Rule 和 idempotency 守卫。

## 2. 范围与非目标

允许修改 `services/local-runtime/pom.xml`，新增 `api/**`、`application/**`、必要 storage adapter 和测试。本包不修改 OpenAPI、V1、前端或 Profile/Rule/Grammar 资产；不实现完整 command union、完整 Rule AST、异步计算、P04-P06 页面、导入导出或完整符合性。

## 3. 设计输入

- `docs/contracts/openapi/opm-local-api-v1.yaml` 的 16 个 operationId。
- `docs/design/opm-modeling-tool-application-api-contract.md` 第 6-11 节。
- `docs/design/opm-development-execution-pack.md` DEV-06 完成定义。
- DEV-02 V1、DEV-03/04/05 领域与原子提交边界。

## 4. 方案要求

1. 增加 Spring MVC 运行时依赖；所有 API 响应遵守既有 envelope，错误返回与 ErrorDetail code/category/status 一致。
2. Project/Model 创建必须在各自 SQLite 项目库中原子初始化 catalog、Profile/Rule package、初始 Draft Revision、root SD、Head 和 Operation；创建重放遵守 command idempotency。
3. 所有 5 个 OpenAPI 写操作验证 loopback Host、同源 Origin 与 `X-OPM-Session`；缺失/错误返回 `LOCAL_SESSION_INVALID`。
4. API-EDT-002 仅启用 P0 Object/Process/Consumption 的最小 command payload；其他已列 command 返回结构化 `PROFILE_FORBIDDEN`，不扩大到完整画布 union。
5. API-VAL-001 返回 `202` task，API-TSK-001/004 支持查询与 SSE；task 固定 input revision，不得以旧结果覆盖当前状态。
6. API-VER-004 仅在固定 revision 有 current text、无 BLOCKING Finding 且 evidence token 有效时创建不可变 Baseline。

## 5. 验收与验证

1. 16 个 operationId 均有 MVC 层测试，覆盖成功、非法、未找到和适用冲突。
2. 五个写操作的 Host/Origin/session 守卫具有拒绝测试；错误不泄露路径或栈。
3. P01/P02/P03 需要的 Project -> Model/root SD -> Object/Process/Consumption -> OPL -> Validation Task -> Baseline API 链路可在临时 SQLite 验证。
4. Java 21 根级 verify、contract validate、diff check 通过。

## 6. 回滚与风险

回滚删除新增 API/application/storage adapter，并移除本包增加的 MVC 依赖；不涉及 schema 或 OpenAPI 回滚。完整命令、规则与 ISO 证据仍由后续包提供，不得因 16 个 operationId 可调用而声明完整 ISO 能力。
