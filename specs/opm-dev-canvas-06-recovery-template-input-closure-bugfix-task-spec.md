# Spec: DEV-CANVAS-06 Recovery Template/Input Closure Bugfix

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

现有 Recovery Execution 设计把两份 template、四类 command 和结果 digest 声明为 `FROZEN`，但只列出了顶层字段名；仓库中没有 `tests/recovery/release/dev-canvas-06/templates/0.1.0/`，也没有四条完整 Runtime command、唯一 request digest preimage、结果 digest 固定键集合或可复算 template payload SHA。

Root Cause：Recovery 机制设计先冻结了 runner/fault/launcher 流程，没有把 template authoring input 作为独立的机器输入闭包；同时误把 Golden PASS candidate 的 base/result 关系视为可直接复用的 Runtime 编辑增量。Golden candidate 是独立修订，不能证明 `CREATE_FACT`/`UPDATE_FACT` 执行后的 Runtime 修订等于该 candidate。

之前未被发现的原因：Schema 只要求 `expected_result_digests` 为非空对象，不约束 template bytes、command payload 和 digest 键，因此 Schema 正反例无法暴露该设计缺口。

## 2. 目标

1. 冻结 Model/Gate 两份 `0.1.0` immutable template 的完整 JSON 字段和唯一 source path；
2. 冻结 State、Procedural、Control、Structural fan 四条完整 command request、精确 capability query/option 推导输入及固定 ID；
3. 冻结 RFC 8785 JCS request digest、template payload digest、fixture digest 和规范化结果投影 digest；
4. 冻结 test-only deterministic ID port、分配序列、生产 UUID 默认边界和不进入 release JAR 的守卫；
5. 将 Recovery 设计状态从过早的全量 `FROZEN` 修正为可验证的输入闭包状态，并同步总 checklist、冻结基线和文档索引。

## 3. 非目标

- 不实现 factory、manifest builder、runner、launcher、fault hook、deterministic ID port、Report writer 或 verifier；
- 不修改 Recovery Manifest/Gate Fixture/Report Schema、SQLite schema/migration、HTTP API、Java、Vue、Profile、Grammar、Golden、Handoff、Intake 或 release artifact；
- 不生成真实 Recovery Manifest/Report、Candidate、Activation，不启用 Capability，不形成 ISO 19450:2024 符合性证明；
- 不声称 template 已通过 Runtime materialization 或 28/56 Recovery 执行。

## 4. 修改边界

允许修改：

- `specs/opm-dev-canvas-06-recovery-template-input-closure-bugfix-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-recovery-template-input-closure-bugfix-checklist.md`；
- `docs/design/opm-dev-canvas-06-recovery-execution-design.md`；
- `tests/recovery/release/dev-canvas-06/templates/0.1.0/*.json`；
- `specs/opm-dev-canvas-06-recovery-runner-implementation-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-recovery-runner-implementation-checklist.md`；
- `specs/opm-dev-canvas-06-execution-contract-closure-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-05-clean-handoff-rebuild-task-spec.md`；
- `docs/reports/opm-implementation-design-conformance-test-report.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/design/opm-design-freeze-baseline.md`、`docs/README.md`。

禁止修改：`.harness/**`、`services/**`、`scripts/**`、`docs/contracts/**`、`packages/**`、数据库、依赖和其他 Gate 实现/证据。

本任务允许新增文档和不可变 JSON；不允许修改 schema、公共 API、配置或引入依赖。

## 5. Fix Strategy

1. Model template 使用四个彼此独立的 `command_scenarios`；每项显式包含 base revision source ref、project/model/context identity、command request、capability derivation input、deterministic ID allocation、expected transaction 和规范化结果投影；禁止把 Golden candidate 当作 Runtime commit 结果。
2. `request_digest=sha256(RFC8785-JCS(command_request) 的 UTF-8 bytes)`；HTTP body 必须发送同一 JCS bytes，Runtime 重序列化 request 的 JCS bytes 必须相等，否则 preflight 阻断。
3. 结果 digest 只覆盖冻结的规范化投影，固定键为 `semantic_projection_sha256/projection_sha256/opl_sha256/trace_sha256/finding_sha256/transaction_sha256/normalized_outcome_sha256`；每个键的 preimage 在设计和 template 中唯一声明。
4. test-only ID port 按 scenario 固定序列分配 Revision/Endpoint/Occurrence/Layout ID；普通 Runtime 仍使用 UUID provider。test port/class/配置进入 product JAR 或默认 Spring context即构建失败。
5. Gate template 固定 exact Handoff/Intake raw refs、34 项顺序、反向 Control 依赖、回退目标和预期集合 digest；真实 production gate 始终保持 `DISABLED + []`。

该修复不改变现有 Runtime 行为；它只提供后续实现所需的唯一机器输入。

## 6. 验收标准

1. 两份 JSON 存在、可解析、无占位值，`template_payload_sha256` 可按设计复算；
2. 四条 command 顶层字段和 payload 完整，request digest 由独立复算一致；
3. 四项 deterministic ID 序列完整，不能调用未声明随机 ID；
4. 七个结果 digest 键在四项 scenario 中恰好各出现一次，preimage 与值可复算；
5. Gate template 恰有 34 项 Capability，顺序与 exact Handoff 一致，回退目标及 reverse dependency 闭合；
6. 两份 template source/raw ref、Handoff/Intake ref 的 byte length 和 SHA-256 与磁盘 bytes 一致；
7. Recovery 设计、runner 规格/checklist、总 checklist、冻结基线、README 和当前/历史状态指针不再把未实现/未执行的 Recovery 组件或 Gate 写成完成证据，也不再授权 runner 重写冻结 template；
8. `jq empty`、定向 Node/JCS 复算、Recovery Schema 回归、文档引用检查和 `git diff --check` 通过。

## 7. 验证方式

文档与机器输入修复不新增产品测试。使用独立只读 Node 校验脚本片段复算 JCS/SHA/ref/集合闭包，并运行现有 `npm run release:canvas06:recovery-schema:test` 验证未破坏三份 Recovery Schema 契约；最后执行引用检查和 `git diff --check`。

## 8. 回滚

删除本任务新增规格、checklist 和两份 template，回退本任务对 Recovery 设计、runner 规格/checklist、总 checklist、冻结基线与 README 的增量。不得删除或改写已有 Handoff、Intake、Golden、Schema、release artifact 或用户的其他未提交改动。

## 9. 风险与状态边界

- template 只冻结 authoring input，不证明 factory 能物化 SQLite；
- deterministic ID port 只冻结接口与序列，不代表 Java 已实现；
- expected projection digest 只对定义的规范化投影负责，不替代完整 Revision Schema、SQLite snapshot 或 Recovery Report 验证；
- 完成本任务后，Recovery Runner 仍为 `NOT_IMPLEMENTED`，`GATE-06-05` 仍为 `BLOCKED`。
