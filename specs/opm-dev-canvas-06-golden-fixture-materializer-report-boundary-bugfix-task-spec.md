# Spec: DEV-CANVAS-06 Golden Fixture Materializer Report 接纳边界修正

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与最小复现

Materialization Report `0.1` Schema 对 `MATERIALIZED/BLOCKED` 都强制要求可信的 `source_fixture_ref` 和 `fixture_identity`。修正前的设计及实现规格同时写明“单项 preflight 失败写 BLOCKED Report”，因此以下输入可稳定复现冲突：

1. Evidence Bundle raw SHA 与 Capture Plan 不匹配；
2. archive entry 为 traversal、absolute、symlink、duplicate、zip bomb 或其他不安全输入；
3. archive entry bytes 的 size/SHA、UTF-8、JSON 或 `MS-REV-001/0.2` Schema 不匹配。

这些失败均发生在 exact fixture 身份可信建立之前。若仍生成 Schema-valid Report，只能缺失强制字段或填入占位/推测值；前者违反 Schema，后者伪造证据。

## 2. Root Cause

### 2.1 问题原因

主设计定义了 10 项有序 preflight 和强制 `fixture_identity`，但没有明确“调用何时被 Report 契约接纳”；实现规格把全部单项 preflight 失败统一映射为 BLOCKED Report，混淆了输入拒绝与已接纳 materialization 失败。

### 2.2 为什么之前未发现

原设计重点验证了成功报告、binding/storage/事务失败和失败原子性，没有把 Bundle、Archive、Fixture 三类“身份尚未可信”的反例与 Report 必填字段做逐阶段可构造性检查。

## 3. 目标

1. 冻结 `GFM-CHECK-FIXTURE` 成功后的唯一 Report 接纳点；
2. 冻结 pre-acceptance rejection 与 Schema-valid BLOCKED Report 的互斥边界；
3. 保持 Materialization Report `0.1` Schema 的 `fixture_identity` 强制要求不变；
4. 同步主设计、原设计规格、实现规格/checklist、DEV-CANVAS-06 状态、测试策略、索引和冻结基线；
5. 让实现人员可直接补齐正反测试，不再自行决定占位值或失败输出。

## 4. 修改边界

允许修改：

- 本规格及对应 checklist；
- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`；
- `specs/opm-dev-canvas-06-golden-fixture-materializer-design-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-golden-fixture-materializer-design-checklist.md`；
- `specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-golden-fixture-materializer-implementation-checklist.md`；
- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`、`docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md` 中仅限 Materializer 当前状态说明；
- `docs/design/opm-test-strategy.md`、`docs/design/opm-design-freeze-baseline.md`、`docs/README.md`；
- 为避免 DEV-CANVAS-06 当前实现状态失真的必要状态说明。

禁止修改：

- `docs/contracts/schemas/**`、SQLite DDL/Flyway migration；
- `services/**`、`scripts/**`、`tests/**`、`package.json`、POM 和 lockfile；
- 公共 API、Profile/Rule/Grammar/Symbol、Evidence Bundle、approved golden 和生产 gate；
- `.harness/**` 和用户其他并行改动。

本任务只修正文档设计，不实现或修改代码、Schema、runner 和测试。

## 5. 冻结语义

### 5.1 Report 接纳点

只有 `GFM-CHECK-FIXTURE` 成功完成以下全部动作后，单项调用才成为 `reportable invocation`：

1. 从 exact Evidence Bundle 安全取得 Plan 指向的 archive entry bytes；
2. entry size 和 raw SHA 与 `source_fixture_ref` 完全一致；
3. bytes 是有效 UTF-8 和 JSON；
4. JSON 通过 `MS-REV-001/0.2` Schema；
5. 从已验证 bytes 取得真实 `fixture_identity`。

该接纳点位于 `GFM-CHECK-FIXTURE` 标记 `PASSED` 之后、`GFM-CHECK-BINDING` 开始之前。不得从 Plan、文件名、archive metadata、expected ref 或占位常量推导 `fixture_identity`。

### 5.2 Pre-acceptance rejection

`GFM-CHECK-MODE` 至 `GFM-CHECK-FIXTURE` 任一阶段失败统一为 `pre-acceptance rejection`：

- 输出稳定错误码、脱敏 stderr 和既有退出码；
- storage、SQLite、Report 临时文件和最终 Materialization Report 均为零输出；
- Orchestrator 停止后续项，已成功 sibling 不得被 Candidate Author 消费；
- 不创建 BLOCKED Report，不填空、占位、expected 或部分 `fixture_identity`。

### 5.3 Post-acceptance BLOCKED Report

调用被接纳后，以下失败必须写 Schema-valid `BLOCKED` Report：

- `GFM-CHECK-BINDING`；
- `GFM-CHECK-STORAGE`；
- migration、seed、commit、cleanup、post-commit verify；
- success Report 内容组装、payload digest 或 Schema pre-write 复核。

Report 必须使用已验证 fixture bytes 取得的真实 `source_fixture_ref/fixture_identity`。Check 1~8 为 `PASSED`；Binding/Storage 失败时当前项为 `FAILED`、后续为 `NOT_RUN`；持久化及之后失败时 10 项 preflight 均为 `PASSED`。失败 storage 按主设计清理；cleanup 自身失败时残留目录必须隔离并标记不可消费。两种情况的 Report 都不含可消费 `materialized_identity/target_storage/persistence`。

### 5.4 Report 交付失败

“report 阶段失败必须写 BLOCKED Report”只覆盖内容组装、摘要和 Schema pre-write 复核。若 report-out 不可写、临时文件无法创建或 atomic rename 失败，物理上无法保证任何 Schema-valid 文件；此时固定为 `GFM_REPORT_WRITE_FAILED`、退出码 `4`、脱敏 stderr、零可消费最终 Report，并清理本次临时文件。禁止把部分文件、旧文件或未通过 Schema 的文件当作 BLOCKED Report。

## 6. Fix Strategy

1. 在主设计第 9、12、13、14、16 章加入接纳点、两类失败输出和交付异常；
2. 把原设计规格的“每次成功或阻断 attempt”改为“每个 reportable invocation”；
3. 把实现规格的“单项 preflight 失败写 BLOCKED”拆成 Check 1~8 零 Report、Check 9~10 BLOCKED Report；
4. 在测试要求中增加逐 Check 输出断言和禁止伪造 identity 的反例；
5. Materialization Report Schema 不变，避免引入 nullable/placeholder identity 或第二种诊断报告。

本修正只影响 Materializer 失败输出边界，不影响成功 SQLite、身份派生、公共 API、Golden Authoring 计数、Approval/Authoring Report 版本或生产 Gate。

## 7. Acceptance Mapping

| 验收 | 必须证据 |
| --- | --- |
| 冲突复现 | Schema 强制 `fixture_identity` 与 Check 1~8 失败时身份不可得的字段级对照 |
| 接纳点 | 主设计明确 Check 8 PASSED 后、Check 9 前成为 reportable invocation |
| pre-acceptance | MODE/ARGS/JAR/PLAN/MEMBERSHIP/BUNDLE/ARCHIVE/FIXTURE 失败均为 stderr + 非零退出 + 零 storage/report |
| post-acceptance | BINDING/STORAGE/migration/seed/verify/report-build 失败生成真实 identity 的 Schema-valid BLOCKED Report |
| 交付异常 | report-out I/O/rename 失败返回 `GFM_REPORT_WRITE_FAILED/4` 且零可消费 Report |
| 无伪造 | 设计、规格和测试禁止 placeholder/expected/partial fixture identity |
| 全局一致 | Materializer v1.1、实现规格、测试策略、索引和冻结基线 v1.4 口径一致 |

## 8. 验证方式

本任务为纯文档修正，不执行或修改代码测试。至少完成：

1. 搜索并消除“任意单项 preflight 失败都写 BLOCKED Report”的现行表述；
2. 核对 Check 1~8/9~10、失败码和退出码映射；
3. 核对 Materialization Report Schema 仍强制真实 `fixture_identity`，且本任务未修改 Schema；
4. 检查新增相对链接、Markdown 表格/围栏和 `git diff --check`；
5. 核对 `32=22+10`、`blocked=0` 和 `cross_document_conflict_count=0` 在修正复核后成立。

## 9. 兼容性与回滚

- Schema/API/SQLite：不变；
- 配置：不变；
- 行为：只收窄失败 Report 生成边界，禁止 pre-acceptance 伪证据；
- 既有合法 Report：不改写；若历史文件在 Check 1~8 失败时含占位 identity，则不得消费，必须按修正后契约重跑；
- 回滚：只回退本规格允许的文档增量，同时把 Materializer/冻结基线版本恢复到前一版本；不删除并行实现或运行资产。

## 10. 事实与假设

### 10.1 事实

1. 当前 Report `0.1` Schema 对 BLOCKED 也强制 `fixture_identity`；
2. 当前主设计未定义 Check 8 后的显式 Report 接纳点；
3. 修正前的实现规格要求任一单项 preflight 失败写 BLOCKED Report；
4. 当前工作树中的并行 Runner 已在取得 fixture bytes 后才建立 ReportContext，但本任务不验收或修改该实现；
5. 本修正不构成 Materializer 实现完成、真实 release evidence 或 GATE-06-03 READY。

### 10.2 假设

无。

> 历史快照说明（2026-08-26 更新指针）：本规格记录当时的Report接纳边界。当前唯一口径为Materializer `v1.5`、Verifier Catalog `v1.1`、Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2`和冻结基线`v1.52`；不得用本历史验收覆盖后续契约。
