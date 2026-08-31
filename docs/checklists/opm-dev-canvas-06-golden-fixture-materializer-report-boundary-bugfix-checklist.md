# Checklist: DEV-CANVAS-06 Golden Fixture Materializer Report 接纳边界修正

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-fixture-materializer-report-boundary-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标映射：规格第 3、5 节；冻结 Check 8 后的 Report 接纳点及两类失败输出。
- 范围映射：规格第 4 节；只修改列出的设计、规格、checklist、策略、索引和基线文档。
- 非目标映射：不修改 Schema、Java、Node、测试、SQLite、API、资产或 production gate。
- 验收映射：规格第 7、8 节；字段可构造性、逐 Check 输出、版本/计数及 Markdown 验证。
- 兼容与回滚映射：规格第 9 节；机器契约 identity/version 不变，历史伪 identity Report 不得消费。

## Reproduction

- [x] Report `0.1` Schema 对 BLOCKED 强制 `source_fixture_ref/fixture_identity`。
- [x] Bundle mismatch 时 exact archive bytes 尚未可信取得。
- [x] unsafe archive 时 entry 不得被读取为可信 fixture。
- [x] fixture size/SHA/UTF-8/JSON/Schema mismatch 时不能取得可信 `MS-REV-001/0.2` identity。
- [x] 原设计“任一 preflight 失败写 BLOCKED”会迫使缺字段或伪造 identity。

## Plan

- [x] 建立独立 bugfix Spec 与 Spec Mapping checklist。
- [x] 修订 Materializer 主设计并升为 v1.1。
- [x] 同步原设计规格/checklist和 implementation Spec/checklist。
- [x] 同步测试策略、正式索引和冻结基线 v1.4。
- [x] 验证无 Schema/代码/测试改动且冲突计数恢复为 0。

## Design Closure

- [x] 冻结 Check 8 PASSED 后、Check 9 前的唯一 reportable invocation 边界。
- [x] 冻结 Check 1~8 失败为 pre-acceptance rejection 和零 Report。
- [x] 冻结 Check 9~10 及持久化/验证/report-build 失败为 Schema-valid BLOCKED Report。
- [x] 冻结 `fixture_identity` 只能来自已验证 exact fixture bytes，禁止占位或推测。
- [x] 冻结 report-out I/O/atomic rename 失败的不可交付例外。
- [x] 冻结 Orchestrator 停止、sibling 不可消费、cleanup 和退出码边界。
- [x] 冻结逐阶段自动化测试要求和历史 Report 兼容边界。

## Acceptance Mapping

| 需求 | 设计承接 | 验证方式 |
| --- | --- | --- |
| 可报告边界 | 主设计第 9/12 章 | Check 8 PASSED 前后字段可构造性对照 |
| pre-acceptance | 主设计第 9/13/14 章 | 8 项失败均断言 stderr/exit 且 storage/report 不存在 |
| post-acceptance | 主设计第 12/16 章 | Binding/Storage/持久化/验证失败含真实 identity 的 BLOCKED Report |
| Report 交付异常 | 主设计第 12/14 章 | I/O/rename 失败为 `GFM_REPORT_WRITE_FAILED/4` 且无最终 Report |
| 实现入口 | implementation Spec/checklist | 测试矩阵和未完成项与新边界一致 |
| 全局冻结 | 基线/索引 | v1.4、32/22/10、冲突 0、开发门 READY |

## Verify

- [x] 不再存在“Check 1~8 失败写 BLOCKED Report”的现行设计表述。
- [x] 主设计、设计规格、实现规格、测试策略和 checklist 使用同一边界。
- [x] Materialization Report Schema 未修改且 `fixture_identity` 仍为 required。
- [x] 未修改 Java、Node、测试、package/POM、SQLite 或生产资产。
- [x] 新增相对链接存在，Markdown 表格和围栏有效。
- [x] `git diff --check` 通过。
- [x] 纯文档修正，未运行构建、Maven、Node test、materialization 或发布验证。

## Risks And Residuals

- [x] 当前并行实现是否完全符合新边界，必须由 implementation checklist 后续测试证明。
- [x] Report Schema/Runtime Materializer 整体仍为 `IN_PROGRESS`，不能因设计修正宣称完成。
- [x] 真实 130 项 Report/SQLite、approved golden、GATE-06-03、Candidate 和 Activation 仍未生成。
- [x] ISO 19450:2024 状态仍为 `EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 仅回退本规格允许的文档增量和版本说明。
- [x] 不回退或覆盖工作树中的 Schema、Java、Node、测试及其他用户改动。

> 历史快照说明（2026-08-26 更新指针）：本 checklist 只证明当时的Report接纳边界。当前唯一口径为Materializer `v1.5`、Verifier Catalog `v1.1`、Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2`和冻结基线`v1.52`；后续契约必须按当前implementation checklist重验。
