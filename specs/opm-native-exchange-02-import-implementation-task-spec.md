# EXCHANGE-02 原生交换持久化导入实现规格

状态：`READY_FOR_DEVELOPMENT`

Task Type：`feature`

风险级别：`L3`

## 1. 目标

实现 `docs/design/opm-native-exchange-import-design.md` 的 `PROJECT_FULL` 与
`BASELINE_ASSET` `NEW_PROJECT` application-service 导入，复用 EXCHANGE-01 Reader。

## 2. 允许与禁止范围

允许修改：`docs/design/opm-native-exchange*`、`docs/contracts/schemas/`、
`docs/contracts/migrations/sqlite/V2__exchange_import_origin.sql`、`docs/checklists/`、
`specs/`、`services/local-runtime/src/main/java/org/opm/localruntime/exchange/`、
`services/local-runtime/src/main/java/org/opm/localruntime/storage/`、对应 JUnit 测试和
`package.json` 中 EXCHANGE-02 定向测试命令。

禁止修改：OpenAPI、HTTP Controller、前端、既有 semantic reader/writer、Profile 资产、
EXCHANGE-01 Reader 的低层安全规则、既有 V1 migration、依赖和 `.harness/**`。

## 3. 实现决策

新增 `ExchangePackageImportService`、布局解析器与 SQLite staging writer；服务仅接受
`Path packageFile` 和 `Path storageRoot`，返回不可变 `ExchangeImportResult`。所有 source
metadata 使用 package canonical bytes，不从文件名或环境推导。V2 origin/identity tables
是唯一重复检测和来源记录位置。

## 4. 契约影响

新增 `opm-native-exchange-import-v1.schema.json`，限定第 2.3 节的三个 JSON entry；
新增 V2 migration。`ExchangePackageReader.inspect()` 保持只读，新的 import service 在其
成功后才可创建 staging。不得增加 API 路由。

## 5. 验收

| ID | 验收 | 验证 |
| --- | --- | --- |
| EXCHANGE-02-AC-01 | PROJECT_FULL 的全部 Revision/Baseline 和原始内部 identity 写入新 Project | JUnit 多模型 roundtrip/readback |
| EXCHANGE-02-AC-02 | BASELINE_ASSET 写入单 Model/head/Baseline，source Project 映射到新本地 ID | JUnit 正向测试 |
| EXCHANGE-02-AC-03 | layout、绑定、语义、文本、Trace、重复包负例稳定拒绝且零业务写入 | JUnit 参数化负例 |
| EXCHANGE-02-AC-04 | 事务、migration 与 rename 故障不留下 staging/目标半成品 | JUnit 故障注入 |
| EXCHANGE-02-AC-05 | 无 HTTP/OpenAPI、无新依赖且 EXCHANGE-01 回归通过 | Maven 定向测试与 diff 检查 |

## 6. 验证与回滚

先执行 EXCHANGE-02 JUnit，再执行 EXCHANGE-01 JUnit、`npm run contract:validate` 和
`git diff --check`。无法执行的完整生产导入、外部互操作和 ISO 验证必须如实保留为未验证。
回滚遵循设计第 6 节。
