# Checklist: DEV-CANVAS-06 Projection Digest Closure 设计闭包修正

关联规格：`specs/opm-dev-canvas-06-projection-digest-closure-bugfix-task-spec.md`

状态：`COMPLETE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## 1. Spec Mapping

| Spec责任 | 目标 | 范围/非目标 | 约束 | 验收 | 验证 | 回滚 |
| --- | --- | --- | --- | --- | --- | --- |
| Projection摘要冲突 | 关闭`double`与safe-integer JCS冲突 | 只改设计、Schema、vector和定向测试；不实现producer/verifier | 共享JCS owner不放宽 | `DFR-018`可关闭 | JCS/Schema/vector回归 | 删除新增资产并恢复BLOCKED状态 |
| 版本化preimage | 固定owner、source contract和唯一形状 | 覆盖正式Projection data | unknown/extra/null不得静默规范化 | preimage Schema递归封闭 | Schema正反例 | 回退独立设计与Schema |
| 浮点编码 | binary64 raw bits跨语言一致 | 只编码layout四字段 | big-endian、16位小写hex、保留正负零、拒绝非有限 | exact正反vector | canonical bytes/SHA复算 | 禁止回退为默认decimal string |
| Node/Java parity | 同一raw向量驱动两端实现 | 本轮只冻结输入和未来测试责任 | 不新增第二JCS owner | input/preimage/bytes/SHA四层相等 | Node定向契约测试；Java责任冻结 | vector升级必须新版本 |
| Recovery同步 | 恢复`RECOVERY-IMPL-01`设计入口 | base/before/after/reopen及expected result | Report `0.1`字段永久绑定Digest `0.1` | `DESIGN_READY/IMPLEMENTATION_NOT_STARTED` | Recovery Schema/引用检查 | 冲突重现则重新BLOCKED |
| E2E同步 | 消除全部Projection SHA歧义 | materialization/attempt/reopen/semantic comparison | Artifact `0.1`字段永久绑定Digest `0.1` | Runner不再自行决定算法 | E2E Schema/引用检查 | 不改写历史artifact语义 |
| 全局状态 | 恢复设计级开发门 | 不提升Gate/发布/ISO | `32=22+10`且冲突为0 | `READY_FOR_DEVELOPMENT` | 状态与计数扫描 | 任一冲突恢复全局BLOCKED |

## 2. Plan

- [x] 读取现有Recovery/E2E/JCS owner、Runtime Projection和冻结基线。
- [x] 记录最小复现：Projection layout为`double`，共享JCS拒绝浮点。
- [x] 新增Projection Digest Closure独立设计。
- [x] 新增preimage Schema、vector Catalog Schema和不可变parity vectors。
- [x] 新增定向Schema/vector契约测试，不实现normalizer/producer/verifier。
- [x] 同步Recovery Execution、E2E Artifact设计和两类runner规格/checklist。
- [x] 升级冻结基线并恢复`22+10/READY_FOR_DEVELOPMENT`。
- [x] 执行全部定向验证并记录exact结果。

## 3. Build 检查

- [x] preimage顶层和Projection data所有object递归封闭。
- [x] layout四字段唯一转换为`{"$binary64":"<16 lowercase hex>"}`。
- [x] `+0.0/-0.0`、普通小数、subnormal、max finite exact bytes已冻结。
- [x] 非layout fractional、unsafe integer和unknown字段稳定拒绝。
- [x] Node/Java的raw-bit与big-endian步骤无第二解释。
- [x] object key和array顺序责任明确，不允许实现自行排序数组。
- [x] 错误码、首错优先级、上层映射和零输出边界封闭。
- [x] Recovery/E2E所有正式Projection digest字段绑定`0.1`；Recovery scenario projection digest保持独立且template不变。
- [x] 未来版本变更要求上层artifact Schema升版，禁止重解释历史摘要。

## 4. Verify 检查

- [x] Projection preimage/vector Schema正例通过。
- [x] 缺字段、extra、错误版本、错误hex、错误digest和错误顺序反例拒绝。
- [x] 所有正向量canonical UTF-8 hex与SHA独立复算相等。
- [x] 现有Common Visual JCS owner回归通过。
- [x] Recovery Schema回归通过。
- [x] Visual/E2E Schema回归通过。
- [x] JSON解析、Markdown引用/围栏/表格和状态计数检查通过。
- [x] `git diff --check`通过。

## 5. Root Cause

- 问题原因：流程设计直接把含`double`的Projection payload交给只支持safe integer的共享JCS owner，缺少Projection专用的版本化数值适配层。
- 之前未发现：Common Visual的normalized Projection fixture使用整数geometry，既有JCS parity只覆盖安全整数，未覆盖正式Runtime Projection的binary64布局值。

## 6. Fix Strategy

- 修复方式：在业务Projection与共享JCS之间增加独立`0.1` preimage契约，以IEEE-754 binary64大端raw-bit hex替换layout浮点后再调用现有JCS/SHA owner。
- 影响模块：只改变未来Recovery/E2E摘要生产与验证输入；不改变产品Projection API、业务语义、SQLite和现有JCS owner。
- 日志/监控：本轮无生产实现，不新增日志或监控；后续producer/verifier必须输出稳定错误码和JSON Pointer，不得输出locale化异常作为机器判定。

## 7. 风险与状态边界

- [x] 本轮不生成真实Recovery/E2E evidence。
- [x] 本轮不启用Capability、不创建Candidate/Activation、不改变production gate。
- [x] ISO 19450:2024状态保持`EVIDENCE_MISSING/无法判断`。
- [x] 全部验证通过后关闭`DFR-018`并恢复开发门。

## 8. 验证记录

- `node --test scripts/validate-canvas06-projection-digest-contract.test.mjs`：`4/4 PASS`。
- `npm run release:canvas06:common-visual:jcs:test`：`2/2 PASS`。
- `npm run release:canvas06:recovery-schema:test`：`12/12 PASS`。
- `npm run release:canvas06:visual-e2e-schema:test`：`12/12 PASS`。
- 三份新增JSON：`jq empty PASS`；Catalog payload SHA、三份raw SHA与byte length由定向测试exact复算。
- 冻结责任表：`22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`；`blocked/unresolved/cross_document_conflict=0`。
- Markdown：`46`个相对链接可解析，`11`份主文档围栏/表格结构通过。
- `git diff --check`：`PASS`。

未执行Maven、前端build或真实Recovery/E2E；本任务没有产品代码改动，且这些执行属于后续implementation/release证据，不是本设计闭包验收项。
