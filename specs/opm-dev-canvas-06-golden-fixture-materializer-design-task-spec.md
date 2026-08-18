# Spec: DEV-CANVAS-06 Golden Fixture Materializer 设计冻结

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

在既有 Golden Authoring `GOLDEN-AUTHORING-02` Capture Planner 与 `GOLDEN-AUTHORING-03` candidate author 之间，新增仅限 release authoring 的 Golden Fixture Materializer 设计与后续实现包，冻结 exact Evidence Bundle fixture 输入、隔离 SQLite 输出、Runtime fail-closed 启动、启动前校验、可复核报告和 Authoring Report 引用边界，使开发人员无需补充架构决定即可实现。

## 2. 范围

1. 新增 Golden Fixture Materializer 独立设计文档、设计 checklist、实现 task spec 和未执行 implementation checklist；
2. 冻结 Materializer 的输入、输出、身份、事务、并发、幂等、失败、恢复、性能和安全边界；
3. 冻结 `OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001/0.1` 机器报告目标契约；
4. 冻结 Golden Approval Record 同一 identity 的 `schema_version=0.2/record_version=0.2.0` 生产目标，其 candidate/new set digest 必须覆盖 130 份 Materialization Report 与 130 个 SQLite base；
5. 冻结 Golden Authoring Report 同一 identity 的 `schema_version=0.2/report_version=0.2.0` 目标及 `fixture_materialization_report_refs[]/fixture_database_refs[]` 必填引用；
6. 同步 Golden Authoring 主设计、DEV-CANVAS-06 release 规格/checklist、测试策略、全量冻结基线和正式索引。

## 3. 非目标

- 不实现 Java Materializer、Spring 条件装配、JSON Schema、runner、测试或 `package.json` 命令；
- 不修改 SQLite V1 DDL、Flyway migration、公共 API、Controller、Vue 或 Profile/Rule/Grammar/Symbol 资产；
- 不执行真实 materialization，不生成 SQLite、Materialization Report、candidate/approved PNG、Visual Manifest/Report、Candidate 或 Activation；
- 不把设计冻结表述为实现完成、`GATE-06-03` READY、Capability enablement、生产发布或 ISO 19450:2024 符合性证明。

## 4. 修改边界

允许修改：

- 本规格及对应设计/实现 checklist；
- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md`；
- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/design/opm-test-strategy.md`、`docs/design/opm-design-freeze-baseline.md`、`docs/README.md`；
- 为避免当前冻结计数冲突所必需的全量冻结 Spec/checklist 历史状态注记。
- 为避免历史符合性快照被误用为当前基线所必需的 conflict-remediation Spec/checklist 与 implementation conformance report 适用性注记。

禁止修改：

- `.harness/**`、`apps/**`、`services/**`、`packages/**`、`scripts/**`、`tests/**`；
- `docs/contracts/schemas/**`、`docs/contracts/migrations/**`、根 `package.json`、lockfile、POM 和构建配置；
- approved golden、release artifact、Handoff/Evidence Bundle 和用户其他未提交改动。

本任务允许修改文档，不允许修改公共 API、数据库 schema、运行配置、依赖、代码或测试。

## 5. 必须冻结的设计输入

1. 输入只能是 READY Capture Plan 中 exact `archiveEntryRef` 选出的 Evidence Bundle `MS-REV-001` fixture；不得接收任意本地 JSON 或 Planner 临时解包路径；
2. `MS-REV-001` 不含 `project_id`，必须冻结确定性 authoring Project ID；Model/Revision ID 和 sequence 必须保持 fixture 原值；
3. 每个唯一 exact fixture 只形成一个只读基础 SQLite；每个 capture attempt 必须克隆到独立可写 storage，禁止共享写库；
4. Runtime 只在全部受控参数同时满足且 `spring.main.web-application-type=none` 时装配 Materializer；不得新增 HTTP endpoint；
5. 启动前必须校验 Bundle ref/SHA、当前 Runtime JAR、Capture Plan active binding、fixture ref/SHA/schema 和目标 storage 为空；任一失败不得写 SQLite；
6. materialization 必须使用 SQLite V1/Flyway，在单事务内写入 Project、已绑定 package、Model、Revision 和 Draft Head，并在提交后复核 identity、外键、完整性和数据库摘要；
7. 只有 `GFM-CHECK-FIXTURE` 成功并取得可信 `fixture_identity` 后才形成 reportable invocation；Check 1~8 失败为零 Report 的 pre-acceptance rejection，Check 9 及以后失败必须生成封闭 BLOCKED Report；只有 `MATERIALIZED` 报告可被 Authoring Report 0.2 引用；
8. 必须冻结错误码、退出码、零业务输出、并发排他、路径/ZIP 安全、恢复、回滚和测试矩阵。

## 6. 验收标准

1. 独立设计文档不存在待定字段、状态、算法、参数、表写入顺序、失败码或验收口径；
2. 输入身份从 Capture Plan -> Evidence Bundle -> archive entry -> fixture bytes 全链闭合；
3. 输出 Project/Model/Revision 身份、SQLite 路径、事务和 clone 隔离规则可由自动化测试直接断言；
4. Runtime 受控模式与生产 API 隔离具有正反装配验收；
5. Materialization Report 接纳点、字段、状态和摘要算法完整，任何 BLOCKED Report 都能从已验证 fixture 构造真实 identity；Approval Record 0.2 覆盖其 Report/SQLite 集合，Authoring Report 0.2 exact 引用两类资产；
6. 后续实现 task spec/checklist 明确允许目录、非目标、测试分层、性能阈值和完成定义；
7. 全局冻结基线、DEV-CANVAS-06、Golden Authoring、测试策略和索引无状态冲突；
8. Markdown 结构、引用和 `git diff --check` 通过；本纯文档任务无需执行代码测试。

## 7. 兼容性影响

- API：公共 HTTP API 不变，且明确禁止 Materializer endpoint；
- 配置：设计新增 release-only 启动参数，尚未实现，普通/生产启动行为必须保持不变；
- 数据：SQLite V1 DDL 不变，只新增受控 authoring seed 写入路径；
- 机器契约：新增 Materialization Report `0.1`，并把生产目标 Approval Record 与 Authoring Report 均升为 `0.2`；已实现的两个 `0.1` 仅保留为历史输入；
- 发布顺序：先实现 Report Schema 和 Materializer，再实现 Candidate Author/Authoring Report 0.2，随后实现 Approval Record 0.2/verifier/publisher，之后才允许真实 INITIAL authoring。

## 8. 回滚

只回退本规格允许文件中的 Materializer 设计增量和索引/冻结状态同步；不删除或覆盖现有 Schema、Planner、release artifact、Handoff、Evidence Bundle、approved 资产或用户代码改动。若回退使 `DFR-022` 消失，全局冻结计数必须同步恢复，不能保留冲突状态。

## 9. 事实与假设

### 9.1 事实

1. 当前 `MS-REV-001/0.2` fixture 包含 `model_id/revision_id/revision_sequence` 和五角色 binding，不含 `project_id`；
2. 当前 `ProjectDatabaseFactory` 使用 `<storage-root>/projects/<project-id>/project.db` 并执行 Flyway；
3. 当前 `OplGoldenReplayDatabaseInitializer` 固定 `project.golden` 并会删除既有 attempt 数据库，不满足新契约的空目标 fail-closed 边界；
4. 当前 Capture Plan `0.1` 已实现 `archiveEntryRef`，Planner 完成后会清理临时解包目录；
5. 当前 Approval Record 与 Authoring Report `0.1` Schema 已实现，但前者的摘要不覆盖 Materialization Report/SQLite base，后者不含 Materialization Report 引用；
6. 当前 Report Schema、Node 集合编排、共享 binding 和代表性 SQLite seed 已部分实现；完整 release-only guard/preflight/report 闭包、Approval/Authoring Report `0.2`、真实 release 报告和生产 API endpoint 仍不存在。

### 9.2 假设

无。实际 Bundle/JAR/fixture SHA、OS 路径和 materialized database SHA 必须由每次执行报告记录，不在设计中预填。

> 历史快照说明（2026-08-07 更新指针）：本规格记录Materializer首轮设计冻结。当前唯一口径为Materializer `v1.5`、Verifier Catalog `v1.1`、Golden Authoring `v1.4`、Visual Common Materialization `v1.4`、Golden Environment `0.2`、03A当前implementation入口和冻结基线`v1.21`；03A受控实现通过不等于production 130项、Common 8/144或真实release evidence。
