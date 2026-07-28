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
