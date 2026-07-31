# OPM 开发契约设计资产

本目录承接首批开发可以直接消费的机器可读设计资产。

## 目录

```text
schemas/                       JSON Schema 2020-12
examples/                      代表性 Revision/Profile/Rule 样例
openapi/opm-local-api-v1.yaml  P01-P03 首批 HTTP 契约
migrations/sqlite/             SQLite Flyway V1 和验证 SQL
```

## 状态边界

1. `opm-revision.schema.json` 是 0.1 Revision 交换/持久化结构基线；完整画布必须按冻结目标发布独立 0.2 Schema，不能原地改变历史 0.1 身份。
2. Profile 和 Rule 样例使用 `REPRESENTATIVE`，用于验证 Package/AST 结构，不是完整 96 能力或 103 规则组发布包。
3. OpenAPI 冻结 P01-P03 和完整画布 `API-EDT-001/002` 的 0.2 目标输入；未列入的应用操作继续以 `opm-modeling-tool-application-api-contract.md` 为上游。
4. V1 SQL 是 SQLite 设计基线；开发工程落盘后由 Flyway 执行。当前目录不会自动修改任何用户数据库。
5. 设计语义由 `docs/design/opm-design-freeze-baseline.md` 冻结；文件名或内部版本带 `draft/representative` 时表示机器发布或覆盖状态，不表示设计门仍开放。首次产品发布前仍须锁定 digest、生成客户端并完成兼容性和运行验证。

## 验证要求

1. JSON Schema 必须通过 Draft 2020-12 元校验，三个 example 必须通过对应 schema。
2. OpenAPI 必须可解析、operationId 唯一、所有本地写入口声明 `localSession`。
3. V1 必须能在空 SQLite 数据库执行，外键检查为零，不可变 Revision 触发器生效。
4. 任何验证未执行时只能报告“设计资产已形成”，不能报告运行契约已验证。

# 机器契约与代表性资产

`schemas/` 和 `examples/` 是设计期机器契约及其代表样例。样例中的摘要可以用于 JSON Schema 结构校验，但不是运行时受信任的资产摘要。

DEV-01 的可加载代表性离线资产位于仓库根 `packages/profiles/<profile-id>/<package-version>/`。运行时只根据 manifest 的逻辑相对路径、字节长度、SHA-256 和精确 `id + version` 加载所需 Rule、Symbol、Grammar 与 Normalization 资产；其目录、摘要算法及失败语义以 `specs/opm-dev-01-asset-loader-task-spec.md` 为准。

## SQLite 迁移运行方式

`services/local-runtime` 在构建时将唯一的 V1 来源 `migrations/sqlite/V1__initial_schema.sql` 复制到 classpath `db/migration`，由 Flyway 执行；不在服务资源目录维护第二份 SQL。项目数据库固定为 `opm.storage.root/projects/<project-id>/project.db`，默认 root 为 `runtime-data`。

打开项目库时，适配器先校验已应用迁移的状态和 checksum，再为既有库创建恢复点后执行 pending migration。V1 包含 SQLite PRAGMA 与 DDL，Flyway 因此仅在 SQLite 适配器中允许混合语句。迁移失败会创建同目录 `.recovery-required` marker，调用者只能获得 `RECOVERY_REQUIRED` 状态，不能取得可写数据库对象。

## API-EDT 0.2 冻结目标与当前机器输入

`openapi/opm-local-api-v1.yaml` 的 `0.2.0-draft` 是冻结目标的当前机器输入。在不改变
`API-EDT-001/002` operationId 的前提下，它保留 P0 的 Object、Process 与 Consumption
命令，并补充 State、完整 Fact、`base_fact_capability_ref`、`AllowedModifier`、候选 option
和删除 impact token。Control 原子组与 Revision 0.2 的最终机器闭包以冻结基线第 6 章为准。生成类型由
`npm run contract:generate` 写入前端和 Local Runtime，`npm run contract:check` 用于检测
OpenAPI 与生成产物漂移。

本扩展不表示 State、完整关系、Capability 选择或前端工具已经通过运行验收。实际 handler、
generated client、兼容 reader、roundtrip 和生产启用状态只能由 DEV-CANVAS-00~06 的 exact
报告证明，不能从 OpenAPI 文件存在推导。
