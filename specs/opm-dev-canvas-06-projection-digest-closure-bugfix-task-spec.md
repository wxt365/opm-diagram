# Spec: DEV-CANVAS-06 Projection Digest Closure 设计闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

Recovery Execution `v1.3` 要求对 `LocalApiService.projection(...).data` 计算 JCS SHA-256；该 Projection 的 `layout.x/y/width/height` 来自 Java `double`。共享 Node/Java RFC 8785 owner 已冻结为只接受 `null/boolean/safe integer/string/array/object` 并拒绝浮点，因此 Recovery snapshot 当前没有可执行且跨语言唯一的 `projection_digest` 定义。

E2E Attempt Artifact `0.1` 同样包含 materialization、before、after、reopen 的 Projection SHA，但只写了“JCS digest”，没有把这些字段绑定到版本化 preimage、浮点编码、Node/Java parity 和稳定错误边界。实现者若选择 Java/Node 默认小数字符串、隐式取整、容差比较或放宽共享 JCS 值域，会产生不同 bytes，且会破坏 Visual Common 已冻结的安全整数 JCS owner。

Root Cause 是 Projection 业务 payload 与通用 JCS 值域之间缺少独立的、版本化的摘要适配层；既有设计把摘要算法直接写在 Recovery/E2E 流程中，没有分配 Projection digest 的单一 owner。

## 2. 目标

1. 新增 Projection Digest Closure `0.1` 独立设计，冻结唯一 preimage、字段域、数组顺序和 SHA-256 公式；
2. 仅把 `layout.x/y/width/height` 的有限 binary64 值转换为 `{"$binary64":"<16位小写hex>"}`，其余安全整数保持 JSON integer；
3. 冻结 Java `Double.doubleToRawLongBits` 与 Node big-endian `DataView.setFloat64` 的 exact parity；
4. 新增封闭 preimage Schema、parity vector Catalog Schema和不可变正反向量，冻结 canonical UTF-8 bytes、digest和稳定错误码；
5. 同步 Recovery snapshot与E2E materialization/attempt/reopen/semantic comparison digest的正式Projection字段，并明确Recovery template既有scenario projection digest保持独立安全整数JCS定义；
6. 关闭 `DFR-018`，把 `RECOVERY-IMPL-01`恢复为`DESIGN_READY/IMPLEMENTATION_NOT_STARTED`，恢复全局`22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED/READY_FOR_DEVELOPMENT`。

## 3. 非目标

- 不实现 Node/Java Projection normalizer、producer、verifier、Recovery runner、E2E runner、SQLite materializer或Runtime test composition；
- 不修改 `LocalApiService.projection`、`SemanticRevision.Layout`、共享 `scripts/canvas06-rfc8785.mjs`、Java `Rfc8785JsonCanonicalizer`、公共 API、SQLite DDL或Profile资产；
- 不修改历史 Recovery Report `0.1`、E2E Attempt Artifact `0.1` 的字段形状或 Schema identity；
- 不生成真实 Recovery `28/56`、E2E `194/388`、Candidate、Activation、Capability enablement、生产发布或 ISO 19450:2024 符合性证据。

## 4. 修改边界

允许修改：

- 本规格和对应 checklist；
- 新增 Projection Digest Closure 设计、preimage Schema、parity vector Catalog Schema、不可变向量和定向契约测试；
- Recovery Execution设计、E2E Attempt Artifact设计；
- Recovery/E2E runner规格和checklist；
- 测试策略、开发执行包、DEV-CANVAS-06总checklist、冻结基线、文档索引以及必要的需求/验收状态指针。

禁止修改：`.harness/**`、`services/**`、Vue、OpenAPI、SQLite、现有JCS owner、Recovery/E2E producer/verifier实现、现有release evidence、Handoff/Intake、模板、fixture、Catalog、Manifest、Report和其他Gate。

本任务允许新增设计机器输入与定向Schema/vector测试，不允许新增生产代码、依赖、配置或运行入口。

## 5. Fix Strategy

1. Projection Digest `0.1` 的 preimage 顶层固定包含 `schema_id/schema_version/source_projection_contract/float_encoding/data`；`data`只接受当前 `API-CTX-002` Projection data 的封闭字段集合。
2. 只对 JSON Pointer `/data/constructs/*/layout/{x,y,width,height}`应用 binary64 编码；使用 IEEE-754 binary64 原始位、8-byte big-endian、16位小写hex，保留 `+0.0/-0.0`差异。非有限数一律拒绝。
3. `z_order`、endpoint `ordinal`和其他整数必须是 safe integer并保持 number；任何其他位置的fractional number、unsafe integer或新增numeric字段均拒绝，不能猜测转换。
4. object key由共享JCS owner排序，array保持正式 Projection 原顺序；optional字段保持“存在”或“缺省”的原始区别，禁止补 `null`、排序construct/endpoints或忽略未知字段。
5. `projection_sha256=sha256(UTF8(canonicalizeJcs(projection_digest_preimage_v01)))`；共享JCS owner不改值域，浮点不得直接进入它。
6. Java/Node实现必须读取同一不可变 parity vector文件；正向量用`$input_binary64`大端位模式物化运行时number/double，避免Catalog自身出现JCS不支持的float，并对 input bits -> runtime value -> preimage -> canonical bytes -> digest全链路相等；负向量用受控mutation构造JSON不能直接表示的NaN/Infinity等运行时输入。
7. 错误类别、首错优先级、零输出和上层映射固定；Recovery映射到`RECOVERY_FIXTURE_MISMATCH`，E2E映射到`E2E_FIXTURE_MISMATCH`，不得降级为摘要不匹配后继续执行。
8. Recovery Report `0.1` 的 `projection_digest`与E2E Attempt Artifact `0.1`全部`projection*_sha256`永久绑定Projection Digest `0.1`；未来更改算法必须发布新的上层artifact Schema版本，禁止重解释历史字段。

## 6. 验收标准

1. 独立设计明确唯一owner、版本、preimage、source contract、字段域、顺序、浮点编码、JCS/SHA和变更规则；
2. preimage Schema与vector Catalog Schema采用Draft 2020-12，所有object递归`additionalProperties=false`；
3. 正向量至少覆盖空Projection、`+0.0/-0.0`、普通正负小数、最小subnormal、最大有限值、完整construct/endpoint顺序；
4. 负向量至少覆盖NaN、正负Infinity、缺失/未知layout字段、非layout浮点、unsafe integer、未知construct字段、非法Unicode scalar；
5. 每个正向量的expected preimage、canonical UTF-8 hex和SHA可被共享Node JCS owner独立复算，vector catalog payload/raw SHA闭合；
6. Java/Node parity责任与后续实现测试路径唯一，不允许默认小数字符串、十进制roundtrip、容差、取整、sort、字段忽略或第二JCS owner；
7. Recovery `base/before/after/reopen`和E2E materialization/attempt/reopen/semantic comparison的正式Projection均引用同一`0.1`定义；Recovery scenario projection digest被明确隔离且template bytes不变；
8. `DFR-018=FROZEN_INCLUDED`、`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`，全局计数为`32=22+10`且`blocked/unresolved/conflict=0`；
9. 定向Schema/vector测试、现有JCS回归、Recovery/E2E Schema回归、JSON/Markdown/引用检查和`git diff --check`通过。

## 7. 验证与回滚

验证执行新增Projection Digest契约测试、`npm run release:canvas06:common-visual:jcs:test`、`npm run release:canvas06:recovery-schema:test`、`npm run release:canvas06:visual-e2e-schema:test`、JSON解析、Markdown链接/围栏/表格与状态扫描、`git diff --check`。本轮不修改产品代码，Maven、前端和真实Recovery/E2E执行不适用。

回滚只删除本规格/checklist、Projection Digest设计/Schema/vector/定向测试，并回退本任务对允许文档的增量。若回滚后浮点摘要冲突重新出现，必须同时恢复`DFR-018=BLOCKED`、`RECOVERY-IMPL-01=BLOCKED_BY_DESIGN`和全局`BLOCKED_BY_DESIGN`；不得改写用户其他工作树改动或历史release资产。

## 8. 状态边界

本任务完成只恢复设计级开发准入和Recovery实现入口。`RECOVERY-IMPL-01`仍是`IMPLEMENTATION_NOT_STARTED`；E2E artifact producer/verifier及其他Runner切片仍按各自checklist状态推进。任何Capability、Gate、Candidate、Activation、production release或ISO状态都不得联动提升。
