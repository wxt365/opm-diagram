# OPM 单机建模工具物理数据与迁移设计

文档版本：`v0.1-draft`

文档状态：SQLite 首批开发冻结基线

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档范围

本文档把逻辑持久化契约下钻为 SQLite 物理数据库、可重建索引、资产目录、事务、Flyway migration、备份恢复和 `.opmp` 原生交换容器设计，供 M09、M10、M12 直接实现。

本设计只支持 SQLite。它不宣称 SQL 可在达梦、MySQL 或 PostgreSQL 执行。

## 2. 设计输入

1. `docs/design/opm-modeling-tool-persistence-contract.md`
2. `docs/design/opm-native-exchange-package-contract.md`
3. `docs/design/opm-core-metamodel-field-schema.md`
4. `docs/design/opm-development-technology-baseline.md`
5. `docs/contracts/migrations/sqlite/V1__initial_schema.sql`

## 3. 项目物理布局

```text
<workspace>/
  catalog.db
  projects/
    <project_id>/
      project.db
      assets/
        sha256/<prefix>/<digest>
      staging/
      exports/
      recovery/
```

1. `catalog.db` 只保存项目目录、状态和位置引用，不保存 Model Fact；
2. 每个 Project 使用独立 `project.db`，迁移、备份和恢复边界清晰；
3. 资产按 SHA-256 内容寻址，业务名称和媒体类型保存在 `asset_manifest`；
4. staging/recovery 不属于已提交 Project，启动扫描后按 manifest 状态恢复或清理；
5. 数据库和资产路径由 File Gateway 解析，Model/Manifest 不保存设备绝对路径。

## 4. SQLite 连接基线

每个连接建立后必须执行并验证：

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 5000;
PRAGMA temp_store = MEMORY;
```

规则：

1. 每个 Project 同时只有一个写协调器；读连接只读取固定 revision；
2. 写事务使用 `BEGIN IMMEDIATE`，在执行领域校验和文本生成后才进入最短持久化区；
3. 不依赖 SQLite JSON 函数解释正式语义，Canonical JSON 先通过应用层 schema 校验；
4. WAL checkpoint 由 M12 在空闲、备份前和正常关闭时执行；
5. 数据库忙、磁盘满或 fsync 失败返回 `PERSISTENCE_FAILED`，不得移动 Draft Head。

## 5. 表与所有权

| 表 | 所有者 | 可变性 | 作用 |
| --- | --- | --- | --- |
| `project_metadata` | M02 | 单行可变 | Project 名称、状态和默认 Profile |
| `model_catalog` | M02/M09 | 可变 | Model 元数据和活动 Draft Head |
| `revision_document` | M09/M12 | 不可变 | 完整 Revision Canonical JSON、schema/profile/rule/digest |
| `revision_parent` | M09 | 不可变 | 父链和 merge 禁止约束 |
| `named_snapshot` | M09 | 不可变 | 命名快照保留根 |
| `baseline` | M09 | 不可变 | Baseline、证据摘要和固定 Revision |
| `profile_package` | M06 | 不可变 | Package JSON 和 digest |
| `rule_set_package` | M06 | 不可变 | Rule Set JSON 和 digest |
| `grammar_package` | M08 | 不可变 | Grammar manifest 和 digest |
| `operation_record` | M09 | 追加 | 本地业务动作和结果 |
| `idempotency_record` | M03 | 有期限 | command_id、请求摘要和结果引用 |
| `background_task` | M12 | 状态机可变 | 固定输入任务、阶段、结果和错误 |
| `asset_manifest` | M10/M12 | 追加/引用计数 | 内容寻址资产 |
| `element_index` | M04/M12 | 可重建 | 名称、kind、Capability 和 Revision 定位 |
| `fact_endpoint_index` | M04/M12 | 可重建 | Fact 邻接和端点查询 |
| `occurrence_index` | M05/M12 | 可重建 | Context、target 和 ownership 定位 |
| `finding_index` | M07/M12 | 可重建 | severity、rule、locator 和 Revision 查询 |
| `text_trace_index` | M08/M12 | 可重建 | Fact/Construct/Sentence 双向定位 |

正式恢复只依赖 Revision JSON、Package、Manifest、版本对象和资产；五类 index 表均带 `source_revision_id`，摘要或版本不符时整批重建。

## 6. 关键列与约束

### 6.1 Revision

`revision_document` 至少包含：

- `model_id + revision_sequence` 唯一；
- `revision_id` 主键，`parent_revision_id` 外键由 `revision_parent` 承接；
- `schema_set_json`、`profile_binding_json` 与完整 `document_json`；
- `document_digest` 唯一校验；
- `commit_reason`、`created_at` 仅记录，不参与并发排序；
- `immutable=1` 检查约束，禁止 UPDATE/DELETE 由 Repository 和触发器双重保护。

### 6.2 Draft Head、Snapshot 与 Baseline

1. `model_catalog.draft_head_revision_id` 是唯一可移动指针；
2. 更新 Draft Head 和插入新 Revision、索引、Operation Record 位于同一事务；
3. Snapshot/Baseline 只引用已存在 Revision；
4. Baseline 名称在 Model 内唯一，绑定 validation report digest；
5. 迁移只创建新 Revision，不更新既有 Baseline 引用。

### 6.3 幂等

`idempotency_record` 使用 `(operation_id, aggregate_id, command_id)` 唯一键，并保存 `request_digest`。命中相同 digest 返回已提交结果；命中不同 digest 返回 `IDEMPOTENCY_MISMATCH`。记录清理不得删除仍被活动 Session、Operation Record 或 Baseline 流程引用的结果。

## 7. 原子事务映射

| 业务事务 | 同一 SQLite 事务内写入 | 事务外动作 |
| --- | --- | --- |
| 语义编辑 | revision、父链、Draft Head、五类索引、operation、idempotency | 提交后 SSE 通知 |
| 创建 Snapshot | snapshot、operation | 无 |
| 创建 Baseline | baseline、证据引用、operation | 可选导出任务 |
| Profile 迁移 | 目标 revision、Draft Head、索引、报告引用、operation | staging 构建与全量验证 |
| 导入提交 | 新 Project/Model/revision/package/index/operation | staging 解析、试生成和用户确认 |
| 恢复替换 | 新数据库完整检查后原子目录切换 | 备份、迁移、校验和回退点 |

文本、Trace 和提交校验摘要必须已包含在 Revision JSON，不能提交 Revision 后再以第二事务补写。

## 8. Flyway 迁移

### 8.1 目录与命名

```text
migrations/sqlite/
  V1__initial_schema.sql
  V2__<expand_change>.sql
```

1. 已发布 versioned migration 永不修改；
2. migration 只处理 storage schema，不处理 Profile/Rule 语义迁移；
3. 每次启动先执行 `validate`，需要迁移时创建恢复点后执行 `migrate`；
4. migration 失败保持旧数据库和恢复点，服务进入 `recovery-required`，不开放写 API；
5. SQLite DDL 回滚不依赖自动 down migration；上线回滚使用迁移前一致性备份和旧应用读取旧库。

### 8.2 兼容步骤

1. Expand：新增 nullable 列、表或索引，旧代码可继续运行；
2. Migrate：分批回填，记录 checkpoint 和坏数据；
3. Switch：新代码改读新结构，保留旧字段；
4. Contract：至少跨一个可回滚版本后删除旧结构；
5. SQLite 重建表时使用新表复制、行数/digest 校验、事务内 rename，禁止原地猜测转换。

### 8.3 V1 验证

首批开发必须在临时空数据库验证：

1. V1 一次执行成功；
2. 外键检查无错误；
3. 相同 Revision sequence、Baseline 名称和幂等键被唯一约束阻止；
4. 不存在 Model 的 Revision、悬空 occurrence/fact index 被外键阻止；
5. Revision UPDATE/DELETE 被不可变触发器阻止；
6. 数据库关闭重开后 PRAGMA 和 schema 版本正确；
7. 迁移前备份恢复可重新打开旧项目。

## 9. 索引设计

| 查询 | 索引 |
| --- | --- |
| Project 内 Model | `model_catalog(project_id, status, normalized_name)` |
| Revision 父链 | `revision_parent(model_id, parent_revision_id)` |
| 名称搜索 | `element_index(model_id, source_revision_id, normalized_name)` |
| Fact 邻接 | `fact_endpoint_index(model_id, source_revision_id, target_entity_id)` |
| Context 出现 | `occurrence_index(model_id, source_revision_id, context_id, target_entity_id)` |
| Finding 筛选 | `finding_index(model_id, source_revision_id, severity, category)` |
| 文本追踪 | `text_trace_index(model_id, source_revision_id, fact_id, sentence_id)` |
| 任务恢复 | `background_task(state, updated_at)` |

索引不得包含未固定修订的数据。300/600 OPD 和 10,000 Element 性能测试不通过时，先用查询计划和基准证据调整索引，不修改领域身份规则。

## 10. `.opmp` 物理交换包

### 10.1 容器

1. 扩展名 `.opmp`，物理容器为 ZIP；
2. `manifest.json` 必须存在且逻辑上先解析；ZIP 条目物理顺序不作为正确性条件；
3. JSON 使用 UTF-8、对象键字典序、Decimal 规范化、禁止 NaN/Infinity；
4. 每个 entry 在 Manifest 声明 `logical_path/role/length/sha256/required/schema_ref`；
5. required Profile、Rule、Grammar 可以嵌入包内；外部引用必须同时有精确版本和 digest，并在导入前离线解析；
6. 包摘要覆盖规范化 Manifest 和全部 required entry 摘要。

### 10.2 目录

```text
manifest.json
model/model.json
revisions/<revision_id>.json
profiles/<profile_id>/<version>/package.json
rules/<rule_set_id>/<version>/rules.json
grammar/<grammar_id>/<version>/manifest.json
assets/sha256/<digest>
evidence/<report_id>.json
```

### 10.3 安全上限

首批实现把具体默认值放入受测配置，至少限制：压缩前后总大小、entry 数量、单 entry 大小、压缩比、嵌套深度、JSON 深度、字符串长度、集合长度和引用数量。超过限制返回 `IO_SECURITY_REJECTED`，不得尝试部分导入。

## 11. 备份与恢复

1. 备份先固定 Project head，使用 SQLite Online Backup 等价一致性快照，不复制活动 WAL 半状态；
2. 备份包含数据库、required 资产、Profile/Rule/Grammar 闭包和 backup manifest；
3. 恢复默认创建新 Project ID，保留 origin；
4. 覆盖恢复先生成可打开回退点，在 recovery 目录完成迁移、schema、digest、外键和代表查询检查后原子切换目录；
5. 任一检查失败保留旧 Project，失败 staging 可诊断后清理；
6. 恢复成功后重建可丢弃索引，并对固定 Revision 比较 digest。

## 12. 可观测与故障注入

必须记录但不得泄露模型内容：transaction_id、project/model/revision ID、operation_id、stage、耗时、结果、SQLite 扩展错误码和 diagnostic_id。

首批持久化测试至少注入：数据库忙、磁盘空间不足、资产 rename 失败、迁移中断、索引写失败、Draft Head 更新失败、备份中断、恢复切换失败。每项均验证最近确认 Revision 可重新打开且无半提交。

## 13. 回滚与兼容影响

- V1 是全新项目初始 schema，无历史回填；
- 本轮 SQL 位于设计资产目录，不会自动执行到用户数据库；
- 开发实现后首次启动的新数据库可直接 V1；已有未发布 PoC 数据不承诺兼容，必须通过显式导入或删除测试数据处理；
- 生产发布后的 migration 只能向前追加，回滚依赖升级前备份和旧应用，不修改已执行脚本。

## 14. 事实与建议

### 14.1 已确认事实

1. 一期目标数据库固定为 SQLite；
2. Flyway 只管理 storage schema，Profile/Rule/schema 升级通过新 Revision；
3. 当前仓库没有运行数据库，V1 设计验证不等同生产迁移验证；
4. 达梦、MySQL、PostgreSQL 不在一期兼容范围。

### 14.2 开发约束

1. JDBC driver、Flyway SQLite 支持模块和 SQLite 准确版本必须由首个依赖锁与空库 migration 测试确认；
2. 若 Flyway 当前选定版本不能正式支持 SQLite，必须在开发首个 PoC 形成 ADR，不能自行切换迁移工具；
3. 物理 DDL 与本文不一致时必须先更新设计和故障恢复测试。
