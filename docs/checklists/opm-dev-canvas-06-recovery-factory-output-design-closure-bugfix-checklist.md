# DEV-CANVAS-06 Recovery Factory Output 设计闭包修正 Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-recovery-factory-output-design-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 问题/目标：规格第1、2节；对应Build 1~6。
- 非目标/修改边界：规格第3、4节；对应Boundary全部。
- 修正策略：规格第5节；对应Build 2~6。
- 验收/验证：规格第6、7节；对应Verify全部。
- 回滚/状态边界：规格第7、8节；对应Summary 3~5。

## Plan

1. P0：新增Factory output/tree机器Schema并封闭对象；
2. P0：冻结source mirror、Report ref和SQLite逐字段映射；
3. P1：冻结原子事务、verifier首错、binding与Gate owner；
4. 同步版本/准入状态并运行定向验证。

## Boundary

- [x] 只修改规格第4节允许的设计、Schema、定向测试和状态指针。
- [x] 不修改`.harness/**`、产品代码、SQLite DDL、公共API、三份既有Recovery Schema和template bytes。
- [x] 不实现Factory/Runner或生成release evidence。
- [x] 回滚不覆盖工作树其他未提交改动。

## Build

- [x] Recovery Execution升为`v1.2`且Factory对象/接口封闭。
- [x] Attempt Materialization `0.1` Schema完成。
- [x] Tree Descriptor `0.1` Schema和Report普通fileRef映射完成。
- [x] source mirror、base scenario、Profile五文件和Gate work copy闭合。
- [x] SQLite逐表/顺序/Head/snapshot映射闭合。
- [x] 原子事务、verifier首错、binding owner和错误边界闭合。
- [x] runner规格/checklist、总checklist、测试策略、冻结基线、执行包和README指针同步。

## Verify

- [x] 新旧Recovery Schema正反例通过：`npm run release:canvas06:recovery-schema:test`，`8/8 PASS`。
- [x] 两份immutable template verifier回归通过：`npm run release:canvas06:recovery:template:test`，`3/3 PASS`。
- [x] 新增/修改JSON通过`jq empty`解析；按Schema object节点检查，新增对象均为`additionalProperties=false`。
- [x] 本任务冻结时的Recovery `v1.2` Factory output闭包已被活动Recovery Execution `v1.4`纳入；当前owner、ref和准入状态以`v1.4`、五份Schema、21表和`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`为准。
- [x] 本任务11份规格、checklist、设计和活动入口文件的相对Markdown链接无断链。
- [x] `git diff --check`通过。

## Summary

- [x] 修改文件、验证结果、风险与遗留项已记录。
- [x] 事实与设计决定已区分，无未声明假设。
- [x] `RECOVERY-IMPL-01`只提升为`DESIGN_READY/IMPLEMENTATION_NOT_STARTED`。
- [x] `RECOVERY-IMPL-02~06`及28/56保持未实现/未执行。
- [x] 未宣称Recovery READY、Capability enablement、生产发布或ISO符合性。
