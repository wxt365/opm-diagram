# DEV-CANVAS-06 执行契约缺口修正 Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-execution-contract-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：规格第 2 节。
- 允许/禁止范围：规格第 3 节。
- 缺口映射：规格第 4 节。
- 验收：规格第 7 节。
- 验证：规格第 8 节。
- 兼容与回滚：规格第 9 节。

## Plan

- [x] 复现三个设计缺口并确认现有 Schema/实现边界。
- [x] 冻结 E2E Manifest `0.1` builder 执行契约。
- [x] 冻结 Materializer pending-quarantine 与唯一 cleanup 顺序。
- [x] 冻结 Recovery factory、template、fault/launcher 与 artifact 契约。
- [x] 同步正式入口、版本和状态。
- [x] 历史规格/checklist/报告中的当前基线指针已同步到 `v1.8`，历史计数和实现结论保持不变。
- [x] 执行文档一致性验证。

## Build

- [x] E2E spec 含完整 CLI、controlled/production 布局、ref 映射和原子零输出事务。
- [x] Materializer 设计升为 `v1.5`，Catalog 升为 `v1.1` 且旧 case 不变。
- [x] pending verifier 只返回内存 attestation，不产生持久化证据或消费结论。
- [x] cleanup 唯一顺序及每阶段失败边界已冻结。
- [x] Recovery execution 设计和 runner 实现规格/checklist 已建立。
- [x] 两份 Recovery template 的 source path、raw ref、identity/digest 和 clone 规则已冻结。
- [x] 七个 SQLite fault hook、四个 forced-stop reachpoint 和 launcher protocol 已冻结。
- [x] artifact tree、index、raw SHA、采集时机和零伪造规则已冻结。

## Verify

- [x] 活动 E2E builder owner/版本唯一。
- [x] E2E `194=178+16` case、`388` attempt 和五类 upstream ref 映射一致。
- [x] Materialization verifier catalog 新总数及分项计数一致。
- [x] Recovery `2/28/56`、`8+7+4+3+6` 和 16 个 failure code 一致。
- [x] Markdown 相对链接可解析，代码围栏成对。
- [x] 限定文件 `git diff --check` 通过。

## 状态边界

- [x] 已明确：设计冻结不等于 Schema/实现完成。
- [x] 已明确：受控 case 通过不等于 production release evidence。
- [x] 已明确：未生成真实 E2E/Recovery READY Report、Candidate 或 Activation。
- [x] 已明确：未启用任何 Capability，不构成 ISO 19450:2024 符合性证明。
