# DEV-CANVAS-06 Recovery Template/Input Closure Bugfix Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-recovery-template-input-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：规格第 2 节；由 Build 1~5 验证。
- 范围/非目标：规格第 3、4 节；由 Boundary 全项验证。
- Root Cause/Fix Strategy：规格第 1、5 节；由 Build 1~5 和 Verify 2~5 验证。
- 验收/验证：规格第 6、7 节；由 Verify 全项验证。
- 回滚/风险：规格第 8、9 节；由 Boundary 4 和 Summary 验证。

## Plan

1. 冻结两份 template 的完整机器字段、四条 command 和 digest preimage；
2. 生成 `0.1.0` immutable JSON 并复算所有 SHA；
3. 同步 Recovery 设计、总 checklist、冻结基线和 README；
4. 运行 JSON、JCS/SHA、ref、Schema、引用与 diff 验证。

## Boundary

- [x] 只允许修改规格第 4 节列出的文档和 template 目录。
- [x] 不修改 Runtime、Schema、SQLite、API、Profile、Golden、Handoff、Intake 或 release artifact。
- [x] 不实现 runner/factory/launcher/fault/verifier，不生成 release evidence。
- [x] 回滚只撤销本任务增量，不覆盖工作树其他改动。

## Build

- [x] Model template 完整 JSON、四个独立 scenario 和 source refs 已冻结。
- [x] 四条 command request、capability derivation input 和 JCS request digest 已冻结。
- [x] deterministic ID port、逐 scenario 分配序列和 production UUID 边界已冻结。
- [x] 七个规范化结果 digest 键、preimage 和值已冻结。
- [x] Gate template 的 34 项顺序、反向 Control 依赖、回退目标和集合 digest 已冻结。
- [x] Recovery 设计、runner规格/checklist、总 checklist、冻结基线、README和当前/历史状态指针已同步。

## Verify

- [x] 两份 template 均通过 `jq empty` 且无占位 SHA/可选字段歧义。
- [x] template payload SHA、四个 request digest 和全部结果 digest 独立复算一致。
- [x] source ref、Handoff/Intake ref 的 path/byte length/raw SHA 与磁盘一致。
- [x] Capability 恰有 34 项且与 Handoff顺序一致；reverse dependency和rollback target闭合。
- [x] 现有 Recovery Schema 正反例回归 `4/4 PASS`。
- [x] `11`份变更文档的`20`个本地链接无断链，`git diff --check`通过。

## Summary

- [x] Root Cause 和 Fix Strategy 已记录。
- [x] 修改文件、验证结果、事实与假设、风险与遗留项已输出。
- [x] 未将设计冻结写成实现、Recovery READY、Capability enablement 或 ISO 符合性证据。

## Verification Record

1. 两份template raw/payload/fixture SHA、4条request digest、28个scenario结果digest、7个model聚合digest和7个Gate结果digest均独立复算一致；
2. 7个外部raw ref的path/byte length/SHA一致，34项Capability与Handoff/Intake顺序一致，16个Procedural反向依赖键可由Handoff PASS coverage唯一推导；
3. State场景原query/option不满足第4.4节公式，已修正并连带刷新request/payload/raw/fixture SHA；其余三场景无需修改；
4. `npm run release:canvas06:recovery-schema:test`为`4/4 PASS`；`jq empty`、本地链接检查和`git diff --check`通过；
5. 未运行Recovery factory/runner、未执行28/56、未生成Recovery Report，`GATE-06-05`保持`BLOCKED`。
