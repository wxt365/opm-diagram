# Spec: OPM DEV-CANVAS-00 State/Fact/Capability Contract

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 背景

P0 的 `API-EDT-001/002` 仅返回 `allowed/forbidden` 字符串集合，并且
`CREATE_FACT` 只具有 P0 Consumption payload。完整画布设计已经冻结 State、完整
Fact 与候选 option 的机器契约，但禁止在没有版本兼容 API 与生成类型前，在前端或
领域实现中手写临时 DTO。

## 2. 目标

在保持既有 operationId 和 P0 写请求兼容的前提下，完成 `API-EDT-001/002` 的完整
画布契约扩展：结构化 `CommandCapabilityOption`、State/Fact 封闭 payload union、
删除影响 token，以及由 OpenAPI 输入生成的 TypeScript/Java DTO 产物和契约测试。

## 3. 非目标

- 不实现 State 的领域语义、存储、投影、OPL 或前端编辑流程。
- 不实现 16/8/10 Capability、规则、Symbol、Grammar、候选选择或 production enablement。
- 不修改 SQLite V1、Profile/Rule/Grammar/Symbol 资产或新增 HTTP operationId。
- 不修改 P01/P03 页面行为，不将新增 command 暴露为可用工具。

## 4. 范围与修改边界

允许修改：

- `docs/contracts/openapi/**`、`docs/contracts/README.md`；
- `scripts/**`、根 `package.json`：OpenAPI 驱动的 DTO 生成和校验命令；
- `apps/web/src/shared/api/generated/**`；
- `services/local-runtime/src/main/java/**/api/**`、`services/local-runtime/src/test/java/**/api/**`；
- 本规格及 `docs/checklists/**`。

禁止修改：

- `docs/contracts/migrations/**`、`packages/**`、P0 Profile/Rule/Grammar/Symbol 资产；
- `apps/web/src/modules/**`、`apps/web/src/stores/**`；
- Semantic、Command、Storage、Text 领域实现，除非仅为 API DTO 编译接线所必需。

允许修改公共 API：是。本包以 `0.2.0-draft` 兼容扩展现有 `API-EDT-001/002`；旧 P0
command_type 和 payload 保持可校验。不得通过删除字段、变更 operationId 或重写 V1
达成扩展。

## 5. 设计输入

- `docs/design/opm-development-execution-pack.md` 5.2、6.7；
- `docs/design/opm-complete-canvas-toolchain-design.md` 7、8、12.3、12.4；
- `docs/design/opm-modeling-tool-application-api-contract.md` 7.2、8.1、8.2；
- `docs/design/opm-test-strategy.md` 6.3、7、9；
- `docs/design/opm-frontend-handoff.md` 7.3、12.1。

## 6. 方案要求

1. `API-EDT-001` 保留 `allowed/forbidden`，新增 `capability_query_id` 和
   `options[]`；每个 option 包含 option ID、命令、Capability、规范端点、字段/修饰、
   Symbol/Template/Rule 引用、enabled/reason、失效 revision，以及仅删除意图可出现的
   impact summary/token。
2. `API-EDT-002` 保留所有 P0 command_type，新增 `CREATE_STATE`、`UPDATE_STATE`、
   `UPDATE_FACT`，并将 `CREATE_FACT` 冻结为完整 Fact payload。每种 command_type 都由
   封闭 payload schema 约束；`CREATE_ELEMENT` 的 kind 仅允许 `OBJECT/PROCESS`。
3. `DELETE_CONSTRUCT` 的 State/Fact 删除必须携带 opaque impact token；token 不能出现
   在非删除 option 或非删除 payload 中。
4. Payload 与 option 中的 locator、endpoint、label、modifier、occurrence 和 layout 字段
   必须使用结构化 schema，不使用自由 `additionalProperties: true` 代替已冻结字段。
5. 生成器必须从 OpenAPI 读取 `API-EDT-001/002` 输入，输出 TypeScript 和 Java DTO；生成
   校验检测手工改动、OpenAPI 漂移和 P0 command 遗漏。
6. Local Runtime 在本包只提供结构兼容 DTO/response 适配边界：P0 命令仍可调用，新增
   command 必须返回稳定的 `PROFILE_FORBIDDEN` 或 `DOMAIN_REJECTED`，不得伪造提交。

## 7. 验收与验证

1. OpenAPI 3.1 校验通过，16 个既有 operationId 仍唯一且存在。
2. 正反契约测试覆盖 P0 payload 兼容、State 非 Element、完整 Fact endpoint、option
   expires revision、impact token 限定和非法字段拒绝。
3. 生成 TypeScript/Java DTO 后运行 generation check 无差异；前端/后端能编译。
4. Local Runtime API 测试证明 P0 paths 不回归，新增 command 不会创建 revision。
5. lint、typecheck、Vitest、Java 21 verify、contract validate、diff check 通过。

## 8. 回滚

回退本包新增的兼容扩展与生成类型；不写入任何 State/Fact 数据。若外部版本已发布，
后续通过兼容 API 版本回退，不修改历史 OpenAPI 文件。
