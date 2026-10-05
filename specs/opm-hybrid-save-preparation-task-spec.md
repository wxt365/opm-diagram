# HS-01C 一致备份、草稿初始化与回读校验

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、db-migration、testing。

状态：设计冻结，实现及定向验证完成。上游：[混合保存实施任务](opm-hybrid-save-strategy-implementation-task-spec.md)。

## 1. 范围与边界

实现离线迁移准备：从存在的项目 SQLite 取得包含已提交 WAL 的一致备份，在独立副本执行现有 Flyway V1/V2/V3，再初始化所选模型 edit_seq=0 的草稿内容/检查点，并以新连接验证可还原。输出 PREPARED，不是已切换或可由当前工作台编辑的状态。

源库只读，禁止用 Files.copy(source.db) 作为 WAL 备份。源模型不切换；候选库也不写 model_save_mode，旧 HEAD/历史保持原值。不得装配 Spring Bean、增加 HTTP handler/CLI/配置开关、启用默认 V3、操作用户数据库、修改 V1/V2/V3 SQL、改写历史不可变约束或复用旧的不完整备份方法。后继激活必须具备草稿 Runtime，并重新核对 live HEAD、binding、备份及消费者兼容性。

## 2. 输入、输出与持久化

唯一服务接口：`HybridSavePreparation.prepare(sourceDatabase, outputRoot, migrationRoot, DraftPreparationRequest)`；`verify(outputRoot)` 独立回读校验已完成输出。以上 Path 必须明确传入，不查找环境变量或默认用户存储。

Request 由保存 Schema 生成：project_id、model_id、expected_revision_id、expected_document_sha256、expected_binding_digest、draft_id、checkpoint_id、requested_at，全必填；时间复用 UTC 毫秒规则，ID/digest 复用原规则。此 Request 为内部离线接口，不加入 OpenAPI 路径。

输出根固定 `backup.sqlite`、`prepared.sqlite`、`report.json`。第一次创建要求根不存在，父目录已存在；以 createDirectory 排他占用，不覆盖文件。已存在根仅允许验证完整 report 且 Request 逐字段相同后返回原结果；不完整/不匹配根拒绝，不清理、不续写。输入数据库必须存在且不是符号链接，父目录 canonical 化以支持系统 /tmp 别名；禁止复用源文件作为输出。

输出报告由同一 Schema 生成：schema_id=OPM-DRAFT-PREPARATION、schema_version=0.1、status=PREPARED、request、token、content_digest、artifact_digest、backup_sha256、prepared_sha256、backup_bytes、prepared_bytes，全必填，路径由固定根布局确定，报告不能自定路径。token 序号为 0，draft/binding 必须和 request 一致。PREPARED 只证明一致快照和初始化存储，不证明生成文本、完整领域符合性或新模式可用。

`draft_content.model_json` 为 HS-01B split.content 的 JSON；artifact_json 为 split.metadata 的 JSON，artifact_digest=SHA256(UTF8(artifact_json 原始存储字符串))。此处摘要覆盖完整元数据存储，不冒充 OPL/Trace 的独立业务摘要。content_digest=SaveContentDigest/1(原文档)。原始完整 document_json 原样保留在旧 revision_document 和备份中；不通过有损 DTO 中转。draft_stream 固定 base_revision_id、edit_seq=0、dirty_since/deadline=NULL；检查点 covered_seq=0，created_at=requested_at。仅插入 content/stream/checkpoint，不新增 savepoint/journal/receipt/mode，不生成假手动版本。

## 3. 执行与事务

先用 SQLite 原生 backup API 从只读连接备份（支持活跃 WAL）；核对备份 integrity_check、foreign_key_check、项目/模型 ACTIVE、所选 HEAD、文档 raw SHA、文档与 SQL 的模型/版本/序号和 binding。不能把读到的 head_sequence 假设等同 revision_sequence；两者各自校验为合法正整数，HEAD 指向请求的 exact Revision。

将已关闭且已转为单文件 DELETE journal 的备份复制为 prepared.sqlite，使用显式 migrationRoot 执行 target=3 的 Flyway；仅允许冻结的 1/2/3 SQL 内容与版本集合，不扫描别的迁移根，不 repair。DDL 失败保留隔离副本，无 report。

Flyway 预验证允许 `*:pending`，以便执行此次准备所需的 V2/V3；不忽略 checksum mismatch、failed 或 missing migration。三个 SQL raw SHA 固定为：V1=`0ea9217a8d09e2bdd8ada4e9622d69e0df9ccdf5fe8c3d3574908652c7cafdd5`；V2=`2e84d7906cf4477f81541d60bed7a25fd600d86c1d6110742e6a4a80700cb786`；V3=`4e6547b14f4b502a2c91be8675e90281a0a092b48f1ef13c5230841e34fe0776`。

初始化在一个 SQLite FULL/FK 事务中完成；重新 SELECT content/stream/checkpoint，复算两个摘要，并将 metadata/content join 后与备份原文档按 JSON 值比较（先统一用严格 reader 解析，保留负零）；校验旧表数据无变化，再 commit。事务失败 rollback，零半草稿。既有所有表除 schema_metadata 的版本行、Flyway 新迁移记录外，行值/行数必须双向一致；schema_metadata 其他行保持，Flyway 原记录保持。

提交后关闭连接，checkpoint/truncate 并转 DELETE journal，确认零 -wal/-shm/-journal；再次以只读新连接回读/校验。backup/prepared fsync 后计算 raw SHA/长度；临时 report 写入/fsync→原子 rename 为 report.json→目录 fsync。report 是唯一完成标记。若最后目录 fsync 抛错，调用结果未知，必须 verify；不盲重建。无报告的失败根不可消费，保留供排障。

verify 必须先严格解析 report、核对两个数据库 raw SHA/长度，拒绝缺文件/符号链接/sidecar，再校验备份原模型、迁移后版本、草稿 exact join、完整内容还原、原表内容保留及无 V2 mode。禁止只相信报告自报成功。读取返回新的不可变标量记录，不返回可绕过校验的数据库连接。

## 4. 错误与验证

稳定失败码：DRAFT_PREPARATION_INPUT_INVALID、DRAFT_PREPARATION_SOURCE_MISMATCH、DRAFT_PREPARATION_OUTPUT_EXISTS、DRAFT_PREPARATION_SCHEMA_MISMATCH、DRAFT_PREPARATION_CONTENT_MISMATCH、DRAFT_PREPARATION_PERSISTENCE_FAILED。异常携带 code，message 只诊断；失败不伪造 PREPARED。已经创建的隔离失败根保留，回滚不影响源库。

- HS-C01：真实 V2 库包含未 checkpoint 的已提交 WAL，备份中可读；源 HEAD/旧文档/历史不变。
- HS-C02：已有 V1/V2 库均迁移到隔离 V3、真实 fixture 初始化、只读重开与独立 verify 通过；两数据库均可独立打开。
- HS-C03：源身份/摘要/binding 不符、未知 schema、已有根、符号链接拒绝；合法重试返回相同 report，无重复行。
- HS-C04：测试专用包内阶段回调在 content/stream/checkpoint 后抛错，事务回滚，零三表残留、零 report；回调不装配生产配置。
- HS-C05：报告字段/数据库 bytes/存储 artifact/旧表漂移被 verifier 拒绝；包含重算文件 hash 后的内容篡改反例。
- HS-C06：生成物检查、Node Schema 正反例、Java/SQLite 定向与 HS-01A/01B 回归通过。无 browser 或生产迁移声明。

## 5. 精确文件集合与计划

允许修改保存 Schema、其生成 Java/TS 类型（由现有 generate-draft-save-contract.mjs 生成）、`scripts/draft-save-contract.test.mjs`；新增 `services/local-runtime/src/main/java/org/opm/localruntime/storage/HybridSavePreparation.java` 和 `PreparedDraftRepository.java`，对应同包 `HybridSavePreparationTest.java`。允许新增本规格，更新保存设计/上游规格/实施 Checklist。其他 API、依赖、配置、SQL、语义规则及用户数据禁止修改。生成 OpenAPI 必须保持原有三条路径不变。

Plan：冻结 Request/Report→生成类型→一致备份与只读入口→事务 seed/read 与旧表比较→完成标记和 verifier→临时 SQLite 及错误回滚测试→记录证据。测试 fixture 复用已冻结文件；源库不使用 runtime-data。Git 基线与实际命令记录于 Checklist。

回滚仅撤回本任务增量。输出都是隔离副本，不替换源库；失败根保留不自动删除。备份可由 SQLite 独立打开，正式恢复源库属于后继显式恢复流程。
