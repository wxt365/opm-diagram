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

1. `opm-revision.schema.json` 是首批 Revision 交换/持久化结构基线；后续字段只能按兼容规则演进。
2. Profile 和 Rule 样例使用 `REPRESENTATIVE`，用于验证 Package/AST 结构，不是完整 96 能力或 103 规则组发布包。
3. OpenAPI 只冻结首批 P01-P03 开发入口；未列入的应用操作继续以 `opm-modeling-tool-application-api-contract.md` 为上游。
4. V1 SQL 是 SQLite 设计基线；开发工程落盘后由 Flyway 执行。当前目录不会自动修改任何用户数据库。
5. 所有资产仍处于 `draft`，首次产品发布前需要转入正式 contracts 目录、锁定 digest 并完成兼容性评审。

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

## API-EDT 0.2 草案扩展

`openapi/opm-local-api-v1.yaml` 的 `0.2.0-draft` 在不改变 `API-EDT-001/002`
operationId 的前提下，保留 P0 的 Object、Process 与 Consumption 命令，并补充了
State、完整 Fact、候选 option 和删除 impact token 的结构契约。生成类型由
`npm run contract:generate` 写入前端和 Local Runtime，`npm run contract:check` 用于检测
OpenAPI 与生成产物漂移。

本扩展不表示 State、完整关系、Capability 选择或前端工具已启用。当前 Local Runtime
仅返回空的 `options`，并继续拒绝未实现的完整画布命令；领域语义、持久化与 UI 由后续
DEV-CANVAS 包实现。
