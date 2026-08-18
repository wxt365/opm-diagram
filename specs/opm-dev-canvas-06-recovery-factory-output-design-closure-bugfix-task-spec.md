# Spec: DEV-CANVAS-06 Recovery Factory Output 设计闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与根因

Recovery Execution `v1.1` 已冻结两份 template 输入和 Factory 三个函数名，但 `FrozenAttemptMaterialization` 使用“至少包含”，`materialization.json` 没有 Schema；目录 tree descriptor 与 Recovery Report 普通 `fileRef` 没有唯一映射；四份 base Revision、Profile package、Handoff/Intake 与 Runtime JAR 未形成可由 Factory 直接消费的受控镜像；Template 到 SQLite 的逐表映射、原子提交、验证顺序和 Gate Fixture owner 也未封闭。

根因是 template authoring input 与 Factory execution output 被视为同一层冻结对象：前者已通过 immutable bytes 闭合，后者仍只有流程性文字，缺少机器形状和持久化协议。

## 2. 目标

1. 将 Recovery Execution 升为 `v1.2`，封闭 `FrozenRecoveryTemplate`、`FrozenAttemptMaterialization` 和三个 Factory 接口；
2. 新增 Attempt Materialization `0.1` 与 Tree Descriptor `0.1` Schema，全部 `additionalProperties=false`；
3. 冻结 source mirror、四个 base scenario、Profile 五文件、Gate work copy 和 Report ref 的唯一映射；
4. 冻结 MS-REV-001/0.2 到 SQLite V1 的逐表字段、顺序、事务、Head、21表精确集合/计数和 snapshot 算法；
5. 冻结 staging/fsync/atomic rename/零 final 输出以及只读 verifier 的首错顺序；
6. 明确 Manifest/Fixture Builder 是 Recovery Gate Fixture 唯一生成者，Factory 仅复制并验证 attempt-local work copy。

## 3. 非目标

- 不实现 `recovery-fixture-factory.mjs`、Java factory helper、Manifest builder、Runner、fault hook、launcher、artifact collector、Report writer或verifier；
- 不修改现有 Recovery Manifest/Gate Fixture/Report `0.1` Schema、SQLite DDL/migration、公共 API、Profile/Handoff/Intake、两份 template bytes或production gate；
- 不生成 Recovery Manifest/Report、28/56 execution、Candidate、Activation、Capability enablement或ISO 19450:2024符合性证据。

## 4. 修改边界

允许修改：

- 本规格和对应 checklist；
- `docs/design/opm-dev-canvas-06-recovery-execution-design.md`；
- `docs/contracts/schemas/opm-dev-canvas-06-recovery-attempt-materialization.schema.json`；
- `docs/contracts/schemas/opm-dev-canvas-06-recovery-tree-descriptor.schema.json`；
- `scripts/validate-canvas06-recovery-schemas.test.mjs`；
- Recovery runner规格/checklist、DEV-CANVAS-06总 checklist、测试策略、冻结基线、开发执行包和文档索引中的当前版本/准入指针。

禁止修改：`.harness/**`、`services/**`、现有三个Recovery Schema、`tests/recovery/**/templates/0.1.0/*.json`、SQLite、API、Vue、Profile/Grammar/Rule/Symbol、Handoff/Intake、release evidence、依赖和其他 Gate 实现。

本任务允许新增机器 Schema 和更新其定向结构测试；不允许新增运行命令、依赖或生产配置。

## 5. 修正策略

1. 既有三份 Recovery `0.1` Schema保持不可变；Report 的 `isolated_root_ref` 固定引用最终 `artifact-index.json`，`asset_copy_ref`固定引用 Attempt 内 `asset-tree.json`，二者继续使用普通 `fileRef`。
2. Factory source mirror保持 template 内原相对路径不变；Builder把 Handoff、Intake、Runtime JAR、四份 base Revision和Active Profile五文件逐byte复制到 evidence root同相对路径，Factory只从该root读取。
3. `materialization.json`只描述已提交的 attempt输入，不是Release结论；它引用两个封闭tree descriptor、raw project.db、base snapshot和可复算payload SHA。
4. 所有attempt都物化Model base；ROLLBACK额外复制Builder生成的Gate Fixture work copy。case到四个base scenario的映射在Recovery Execution设计中按28项完整冻结。
5. SQLite seed复用现有`ProjectDatabaseFactory/Flyway`和单Revision snapshot模式，但由Recovery专用test-only helper按本规格字段写入，禁止调用公共HTTP API或修改Golden Materializer语义。

## 6. 验收标准

1. 两份新增Schema可解析、Draft 2020-12、对象封闭，并有正例及缺字段/额外字段/条件字段反例；
2. Factory接口输入能够定位Manifest、Handoff、Intake、Runtime JAR、base Revision、Profile五文件和Gate Fixture，不依赖隐式cwd或source checkout旁路；
3. `FrozenAttemptMaterialization`不存在“至少包含”、开放对象或未定义optional字段；
4. Report三个ref均映射为具体普通文件，tree descriptor字段、排序、digest与排除项唯一；
5. SQLite七张seed表、两张基础设施表、十二张零行表、Head、document raw bytes、JCS子树、timestamp和snapshot算法完整；
6. 原子提交和verifier首错顺序覆盖symlink、已有root、staging失败、fsync/rename失败、残留、只读前后digest和稳定退出码；
7. Gate Fixture owner、case/base scenario映射、现行版本和准入状态在跨文档中一致；
8. Recovery Schema定向测试、template verifier、JSON解析、引用检查和`git diff --check`通过。

## 7. 验证与回滚

验证使用现有`npm run release:canvas06:recovery-schema:test`和`npm run release:canvas06:recovery:template:test`，并执行定向文档引用/版本检查及`git diff --check`。本轮无产品代码，Maven、前端和E2E测试不适用。

回滚只删除两份新增Schema和本规格/checklist，并回退本任务对允许文档与定向测试的增量。不得删除或改写既有Schema、template、用户数据、Handoff/Intake或其他未提交改动。

## 8. 状态边界

本任务完成只表示`RECOVERY-IMPL-01`设计输入闭合。Factory实现、受控materialization、`RECOVERY-IMPL-02~06`、28/56、Recovery READY、生产发布和ISO符合性仍需独立实现与证据。
