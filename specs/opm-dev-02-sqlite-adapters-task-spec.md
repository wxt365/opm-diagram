# Spec: OPM DEV-02 SQLite V1 与 M12 本地适配层

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `db-migration`
- `testing`

## 1. 背景

`DEV-01` 已提供可校验的 Profile/Rule/Grammar 绑定。执行包将 `DEV-02` 定义为后续 Revision、命令和项目模块的持久化前置：SQLite V1 必须通过 Flyway 建库，连接行为、事务、迁移失败和恢复点不能由后续业务模块临时决定。

## 2. 目标

将既有 `docs/contracts/migrations/sqlite/V1__initial_schema.sql` 原样作为 Flyway V1 运行资源装配；提供每项目数据库路径解析、SQLite 连接配置、迁移/恢复状态和最小 schema metadata Repository。

## 3. 非目标

- 不修改已冻结的 V1 SQL、OpenAPI、JSON Schema 或前端。
- 不实现 Project/Model/Revision/Task 的业务用例、HTTP API、写命令、幂等或 Baseline。
- 不实现完整备份恢复、RecoveryScanner、资产文件网关、索引重建或 M12 后台任务。
- 不支持达梦、MySQL 或 PostgreSQL；一期仅验证 SQLite。

## 4. 范围

### 包含范围

- `services/local-runtime/**` 的 Flyway、SQLite、数据库路径、恢复状态、schema metadata Repository 和测试。
- `services/local-runtime/pom.xml`、资源复制配置和 `application.yml`。
- 本规格、对应 checklist 及 `docs/contracts/README.md` 的运行迁移说明。

### 不包含范围

- `docs/contracts/migrations/sqlite/V1__initial_schema.sql` 和 `verify_v1.sql`。
- `apps/web/**`、`tests/e2e/**`、`docs/design/**`、公共 API 与数据库以外的远程服务。

## 5. 设计输入

- 开发顺序与 DoD：`docs/design/opm-development-execution-pack.md` 第 5、6.2 节。
- SQLite/Flyway/恢复边界：`docs/design/opm-physical-data-and-migration-design.md` 第 3、4、7、8 节。
- M12 边界和原子事务：`docs/design/opm-modeling-tool-persistence-contract.md` 第 7、8、12 节。
- 物理 schema：`docs/contracts/migrations/sqlite/V1__initial_schema.sql`。
- 测试策略：`docs/design/opm-test-strategy.md` 第 3、5、10 节。

不启用 `design-module-docs`：本包直接实现已冻结的物理存储前置，不修改模块或页面设计。完整恢复编排与领域 Repository 留给后续开发包。

## 6. 方案要求

1. V1 SQL 保持唯一事实源；Maven 在构建时复制至 classpath `db/migration`，不得维护第二份 SQL。
2. 每个 Project 数据库固定为受控工作区 `projects/<project-id>/project.db`；`project_id` 不接受绝对路径、分隔符或路径穿越。
3. 每条 SQLite 连接配置并验证 `foreign_keys=ON`、`journal_mode=WAL`、`synchronous=FULL`、`busy_timeout=5000`、`temp_store=MEMORY`。
4. 数据库打开先 `validate`；存在 pending migration 时，既有库先创建同目录恢复点再 `migrate`。迁移失败创建 recovery marker，并返回 `RECOVERY_REQUIRED`，不得给后续调用者可写连接。
5. JDBC 仅存在于 M12 adapter 内。Repository 返回不可变领域值，不返回 `Connection`、`ResultSet` 或 JDBC record。
6. 不创建数据库连接池；单项目连接按调用打开，后续 M03/M09 再实现写协调器和 `BEGIN IMMEDIATE` 事务编排。

## 7. 接口与状态影响

- 不新增 HTTP/OpenAPI 接口。
- 新增进程内 `ProjectDatabaseFactory`、`ProjectDatabaseOpenResult` 和 `SchemaMetadataRepository`。
- 新增本地持久化状态：`project.db`、Flyway history、迁移前恢复点和失败 marker；正常启动不自动创建任何项目数据库。

## 8. 验收标准

1. 空数据库执行 V1 成功，20 张业务表、必要索引和不可变触发器存在，外键检查为空。
2. V1 迁移重复打开不重复执行；schema metadata Repository 返回 `1.0` 且不泄漏 JDBC 类型。
3. 不存在 Model 的 Revision 被外键阻止；Revision UPDATE/DELETE 被触发器阻止。
4. SQLite PRAGMA 在重新打开后满足设计值。
5. 损坏 migration 失败时生成恢复点/marker，结果为 `RECOVERY_REQUIRED`。
6. Java 21 `./mvnw verify`、既有 contract validate 和差异检查通过。

## 9. 验证与回滚

使用临时目录 SQLite 数据库执行 Flyway 集成测试；测试不读取开发者真实项目库。迁移失败场景使用临时损坏 migration 目录。

V1 已冻结且不提供 down migration。失败时删除未成功创建的临时数据库，或使用迁移前恢复点替换既有库；本包未发布数据，不执行生产回滚。

## 10. 风险

- SQLite 的 WAL 与同步模式只在 SQLite/Xerial 驱动实测，不推断其他数据库兼容性。
- M12 完整恢复扫描、原子目录替换和业务写事务不在本包范围；`RECOVERY_REQUIRED` 仅提供明确阻断状态与诊断文件。
- 迁移资源复制必须持续从既有 contracts SQL 取源，否则会产生版本漂移。
