# DEV-CANVAS-06 Recovery Reopen 与 HTTP JCS 设计闭包修正 Checklist

状态：`COMPLETE`；两个P1已关闭

> 历史状态指针（2026-08-07）：本checklist中“Projection浮点摘要仍阻断”记录的是本任务完成时边界。该后续P0已由Projection Digest Closure `v1.0/0.1`关闭；当前唯一状态源为冻结基线`v1.21`与Recovery Execution `v1.5`，`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-recovery-reopen-http-jcs-design-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 问题/目标：规格第1、2节；对应Build 1~6。
- 非目标/修改边界：规格第3、4节；对应Boundary全部。
- 修正策略：规格第5节；对应Build 2~6。
- 验收/验证：规格第6、7节；对应Verify全部。
- 回滚/状态边界：规格第7、8节；对应Summary 3~5。

## Plan

1. P1：新增Catalog `0.1.0`及Schema，冻结三个profile和28项exact join；
2. P1：新增Manifest `0.2`，封闭expected_reopen、digest与Catalog raw ref；
3. P1：将Recovery Execution升为`v1.3`，冻结test-only eager raw-body guard唯一边界；
4. 同步活动版本和设计门，运行Schema/digest/引用验证。

## Boundary

- [x] 只修改规格第4节允许的设计、机器契约、定向测试和状态指针。
- [x] 不修改`.harness/**`、产品代码、SQLite、公共API、历史五份`0.1` Schema和template bytes。
- [x] 不实现Manifest builder、raw-body guard、Runner或生成release evidence。
- [x] 回滚不覆盖工作树其他未提交改动。

## Build

- [x] Reopen Expectation Catalog Schema `0.1`与Catalog `0.1.0`完成。
- [x] 三profile、28项case/profile/digest exact join与raw/payload SHA冻结。
- [x] Manifest `0.2`完成，历史Manifest `0.1`保持不变。
- [x] Recovery Execution升为`v1.3`并冻结HTTP ingress唯一方案。
- [x] HTTP Request Artifact union Schema `0.1`及正反例完成。
- [x] expected digest owner、strict parser、replay、零执行、artifact和production隔离闭合。
- [x] runner规格/checklist、总checklist、测试策略、冻结基线、执行包、README及需求状态指针同步。

## Verify

- [x] 新旧Recovery Schema和Catalog正反例通过：`npm run release:canvas06:recovery-schema:test`为`12/12 PASS`。
- [x] Catalog三个profile、28项顺序/mapping/digest和raw/payload SHA复算通过；raw bytes=`9308`。
- [x] Manifest `0.2`拒绝任意expected_reopen、错误digest及Catalog join。
- [x] 两份immutable template verifier回归通过：`npm run release:canvas06:recovery:template:test`为`3/3 PASS`。
- [x] 当前版本、owner、设计门和实现边界跨文档一致；历史`v1.2/DESIGN_READY`只保留在带日期复核记录中。
- [x] 本任务涉及的12份Markdown相对链接无断链。
- [x] `git diff --check`通过。

## Summary

- [x] 修改文件、验证结果、风险与遗留项已记录。
- [x] 事实与设计决定已区分，无未声明假设。
- [x] 两个P1关闭；本任务完成时Projection浮点摘要仍阻断Recovery，后续已由Projection Digest Closure `v1.0/0.1`关闭。
- [x] `RECOVERY-IMPL-01~06`、28/56、Recovery READY保持未实现/未执行。
- [x] 未宣称Candidate、Activation、Capability enablement、生产发布或ISO符合性。
