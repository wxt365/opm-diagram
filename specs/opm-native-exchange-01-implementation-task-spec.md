# EXCHANGE-01 原生交换包实现规格

状态：`READY_FOR_DEVELOPMENT`  
Task Type：`feature`  
风险级别：`L3`

## 目标与范围

实现 `.opmp` 1.0 的通用 ZIP Reader/Writer、安全 inspection 和 `MODEL_REVISION` 内存适配。设计权威为 `docs/design/opm-native-exchange-package-contract.md` 与 `docs/design/opm-native-exchange-machine-contract.md`。

允许修改：`docs/design/`、`docs/contracts/schemas/`、`docs/checklists/`、`specs/`、`services/local-runtime/src/main/java/org/opm/localruntime/exchange/`、`services/local-runtime/src/test/java/org/opm/localruntime/exchange/`、`package.json`、`scripts/` 中 EXCHANGE-01 专用验证文件。

禁止修改：SQLite DDL/Flyway、OpenAPI、既有 `semantic` 包、Profile 资产、前端、`.harness/**`。不新增依赖。

## 验收

| ID | 验收 | 验证 |
| --- | --- | --- |
| EXCHANGE-01-AC-01 | Writer 写出 schema-valid `.opmp`，entry 与 Manifest 摘要一致 | JUnit 正向 roundtrip |
| EXCHANGE-01-AC-02 | `MODEL_REVISION` 返回与原始 Revision 一致的内存语义 | JUnit router/adaptor 测试 |
| EXCHANGE-01-AC-03 | 安全、篡改、路径、重复、版本、扩展和依赖负例稳定拒绝 | JUnit 参数化负例 |
| EXCHANGE-01-AC-04 | inspection 与适配过程零 SQLite/业务写入 | JUnit 临时目录断言 |
| EXCHANGE-01-AC-05 | Schema 示例与新增实现均通过定向验证 | Node Schema 测试、Maven 定向测试 |

## 非目标与兼容

`PROJECT_FULL`/`BASELINE_ASSET` 只可 inspection，不支持持久化导入；不声明完整备份、生产发布或 ISO 符合性。新增 Schema 是首发 `1.0`，不改变现有 Revision Schema/API/数据格式。

## 实施与回滚

先实现 Manifest JCS 与含 Decimal 的 Exchange JSON Canonicalizer，再实现 ZIP Reader/Writer 和 `MODEL_REVISION` adapter，最后添加 Schema 验证脚本与测试。所有失败写入临时目录，不覆盖目标。回滚仅移除新 `exchange` 包及专用 Schema/脚本；不存在数据迁移。
