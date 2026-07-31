# Task Checklist: OPM DEV-CANVAS-06 工具链集成与发布验收

## Spec Mapping

- 规格：`specs/opm-dev-canvas-06-toolchain-release-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`frontend-vue (primary)`、`backend-springboot`、`testing`
- 目标：完整工具链集成、视觉/E2E/性能/恢复证据和按 Capability 分批启用。
- 范围：P03、X6、Projection、visual golden、E2E、性能 fixture、release gate 和发布报告。
- 非目标：新增语义、修改 concrete OPL/Trace/Rule、补写 DEV-CANVAS-05 资产、SQLite migration、ISO 符合性声明。
- 约束：只启用 exact dependency closure 已通过的 Capability；性能不以省略语义符号换取通过。
- 验收：规格第 5~8 节。
- 验证：组件、E2E、visual/canvas pixel、性能、故障恢复、clean install smoke、diff check。
- 回滚：整体或按 Capability 关闭 gate，历史模型和 Revision 不回退。

### GATE-06-01~06 设计冻结边界

- Task Type：`feature`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 允许修改：本 checklist、`specs/opm-dev-canvas-06-toolchain-release-task-spec.md` 与 `docs/design/opm-test-strategy.md`。
- 禁止修改：`.harness/**`、机器 Schema、Profile/Grammar/Rule/Symbol、API、SQLite、Java、Vue、runner、测试和配置。
- Schema/API/配置/代码/测试：本轮均不允许修改；只冻结未来实现输入。
- 验证：Markdown 结构与表格、ID/集合/计数、跨文档口径、限定文件 `git diff --check`；纯文档任务无需执行代码测试。
- 回滚：只回退本轮两份文档的增量，不改变工作树中的并行实现和任何运行时数据。

## 输入门槛

- [x] 性能阈值、样本量、固定环境和报告字段已冻结
- [ ] `handoff_ref={path,sha256}` 已冻结，Handoff Schema 合法且 `handoff_status=READY_FOR_DEV_CANVAS_06`
- [ ] `GATE-05-01~06` 的 report ref/length/SHA 全部匹配，Compatibility `13/13`、semantic `178/130/48`、Atomic `19/19`、Structural `24/24`、Control `20/20`
- [ ] clean release build、`LOCAL_RUNTIME_JAR/EVIDENCE_BUNDLE`、Revision `0.1/0.2` Schema 和历史/ACTIVE exact binding 已冻结
- [ ] `34/34` Capability 为 `ELIGIBLE_FOR_RELEASE_VALIDATION`，上游 production gate=`DISABLED`、enabled ID 为空
- [ ] 性能/视觉 fixture 的生成器与摘要已版本化

## Build

- [ ] 完成固定工具链、State、关系目录、候选层和完整检查器
- [ ] 接入逐 Capability evidence gate 和禁用 reason
- [ ] 完成 committed/blocked/conflict/readonly/asset-missing/recovery 状态
- [ ] 建立三视口、三缩放 visual golden 与 canvas pixel 检查
- [ ] 建立 300/600、1,000/2,000 和 10,000 结点性能 fixture
- [ ] 保留 P0 工具链和整体/逐 Capability 回滚入口

## Verify

- [ ] `E2E-CANVAS-001~007` 全部通过
- [ ] `1440x900`、`1280x800`、`390x844` 无关键遮挡或全局溢出
- [ ] `25%/100%/400%` visual golden 和 canvas pixel 非空检查通过
- [ ] 普通编辑反馈 P95 `<=100 ms`，增量 OPL P95 `<=500 ms`
- [ ] 300/600 frame P95 `<=32 ms`、选择 P95 `<=100 ms`
- [ ] 1,000/2,000 frame P95 `<=50 ms`、选择 P95 `<=200 ms`、零 OOM
- [ ] 10,000 结点保存/快照/全量校验每次分别 `<=10/15/60 s`，各 5 次零失败
- [ ] 交互预热/样本、30 s frame 采样、机器/版本/digest 元数据完整
- [ ] 强停、服务失败、asset mismatch 和 gate 回滚无 partial Revision/错误 Head
- [ ] enablement manifest 只包含 Handoff eligible 且本包证据通过的 Capability，并保持原 `handoff_ref.sha256`
- [ ] Intake Report 的 8 项检查和 `34/34` capability intake 均为 matched，原 Handoff bytes 未被复制改写
- [ ] Candidate/Activation/Rollback manifest 的状态、集合基数、前序 SHA 和 Report refs 通过 Schema 与 verifier
- [ ] clean install/start/health/open/reopen/exit 的 `6/6` case、`12/12` attempt 通过
- [ ] 限定文件 `git diff --check` 通过

## 发布证据

- [ ] 报告原始样本、P50/P95/Max、失败率、fixture 摘要和运行命令
- [ ] 报告每个 enabled/disabled Capability 及其 exact evidence/digest/reason
- [ ] 报告记录并复核 DEV-CANVAS-05 `handoff_ref`、Compatibility 摘要和上游 production gate 初始状态
- [ ] 报告明确未证明其他硬件性能和 ISO 19450:2024 符合性
- [ ] 回滚演练结果与残余风险已记录
- [ ] Release Candidate Manifest/Report 汇总 exact Handoff、Intake、Visual/E2E/Performance/Recovery、Candidate、ZIP/JAR/Web dist/lockfile/environment 指纹和全部 raw SHA

## 冻结 Gate 依赖与关闭顺序

| 阶段 | Gate/动作 | 输入 | 退出状态 |
| ---: | --- | --- | --- |
| 1 | `GATE-06-01 Handoff Intake` | exact `handoff_ref={path,sha256}` | `READY_FOR_RELEASE_VALIDATION` |
| 2 | `GATE-06-02` 契约实现 | Intake Report；本节冻结的 Schema/算法 | builder/verifier 可执行，不生成 READY Candidate |
| 3 | `GATE-06-03 Visual/E2E Closure` | Intake、固定 Visual/E2E manifest | Visual/E2E 全部 matched |
| 4 | `GATE-06-04 Performance Closure` | Intake、clean release build、固定环境/fixture | 全阈值 matched |
| 5 | `GATE-06-05 Recovery/Rollback` | Intake、release build、故障矩阵、test-only disabled gate | 零增量、恢复和只读回退 matched |
| 6 | `GATE-06-02` Candidate 生成 | Intake + `GATE-06-03~05` exact Report | `READY_FOR_ACTIVATION` 或稳定 `BLOCKED` |
| 7 | `GATE-06-06 Release Candidate Evidence` | Intake、`GATE-06-03~05`、clean smoke、Candidate | Release Candidate `READY` 或 `BLOCKED` |
| 8 | `GATE-06-02` Activation/回滚 | exact Candidate + READY Release Report | `ACTIVE_PARTIAL/ACTIVE_COMPLETE`；必要时 `ROLLED_BACK` |

`GATE-06-01` 未关闭时不得进入 Build 或生成任何 enablement manifest。`GATE-06-03~05` 在 Intake 关闭后可按资源顺序执行，但不得互相替代；Candidate 必须等待三者全部报告，Activation 必须再等待 `GATE-06-06` READY Report。

### GATE-06-01 Handoff Intake 冻结执行契约

本节只消费 `GATE-05-06` Handoff，不重算 OPL/Trace、Compatibility、coverage 或 eligibility。设计冻结状态为 `FROZEN`，实现与执行状态仍为 `BLOCKED`。

#### 1. 机器资产与命令

```text
docs/contracts/schemas/opm-dev-canvas-06-intake-report.schema.json
<evidence_output_root>/dev-canvas-06/intake/dev-canvas-06-intake-report.json
```

Schema 固定 `schema_id=OPM-DEV-CANVAS-06-INTAKE-REPORT-001`、`schema_version=0.1`。Runner 的稳定入口固定为：

```text
npm run release:canvas06:intake -- \
  --handoff-root <只读handoff_bundle_root> \
  --handoff <root内相对path> \
  --handoff-sha256 <64位小写十六进制> \
  --out <evidence_output_root>/dev-canvas-06/intake/dev-canvas-06-intake-report.json
```

不得提供 `--ignore-digest`、`--partial`、`--force-ready` 或从 checklist 推导状态的旁路。退出码固定为：`0=READY_FOR_RELEASE_VALIDATION`、`2=输入/Schema/ref 无效`、`3=内容或证据不匹配`、`4=未分类 I/O/内部错误`。

#### 2. Intake Report 顶层与封闭规则

顶层字段固定为：

```text
schema_id, schema_version, report_id, generated_at,
runner_identity, handoff_ref, intake_status,
checks[], capability_intake[], blockers[]
```

1. 所有对象 `additionalProperties=false`；数组按本节规定排序，ID 唯一。
2. `handoff_ref` 记录输入 `path + byte_length + sha256`；SHA 对原始 bytes 计算，path 必须相对只读 `handoff_bundle_root`，不得为绝对路径、包含 `..` 或逃逸该 root。CLI 传入的 SHA 与实算 SHA 不一致时立即 BLOCKED。
3. 其余文件 ref 统一为 `path + byte_length + sha256`；只记录上游 Handoff 已引用的原始文件，不复制、改名或重写上游证据。
4. `runner_identity` 至少包含 runner version、source commit、Node exact version、OS、command 和 runner source SHA；命令参数中的本机绝对路径在报告中归一为 bundle 相对路径。
5. `report_id` 固定编码为 `dev-canvas-06.intake.<handoff_id>.<handoff_sha256前12位>`；`intake_status` 只允许 `BLOCKED/READY_FOR_RELEASE_VALIDATION`。
6. `blockers[]` 每项包含 `code/check_id/capability_id?/evidence_refs[]/message_key`；`READY` 时必须为空，`BLOCKED` 时至少一项，禁止只有自由文本。

#### 3. 固定 8 项检查

`checks[]` 必须按下表恰有 `8` 项；每项包含 `check_id/status/evidence_refs[]/observed_summary/blocker_codes[]`，status 只允许 `MATCHED/BLOCKED`。

| Check ID | 必须精确验证 | BLOCKED code |
| --- | --- | --- |
| `INTAKE-06-001.HANDOFF_BYTES` | CLI SHA、原始 bytes SHA、byte length、bundle 相对 path 一致 | `CANVAS06_HANDOFF_DIGEST_MISMATCH` |
| `INTAKE-06-002.HANDOFF_SCHEMA_STATUS` | `OPM-DEV-CANVAS-05-HANDOFF-001/0.1` Schema 通过且 status=`READY_FOR_DEV_CANVAS_06`、`blockers=[]` | `CANVAS06_HANDOFF_NOT_READY` |
| `INTAKE-06-003.SOURCE_BUILD_ARTIFACTS` | clean source build；`LOCAL_RUNTIME_JAR/EVIDENCE_BUNDLE` 和 build/lockfile/POM 元数据的 ref/length/SHA 全匹配 | `CANVAS06_BUILD_EVIDENCE_MISMATCH` |
| `INTAKE-06-004.REVISION_BINDINGS` | reader=`0.1/0.2`、writer=`0.2`，历史/ACTIVE package、五 role asset 和 canonical binding 与 Handoff exact 值深度相等 | `CANVAS06_BINDING_MISMATCH` |
| `INTAKE-06-005.GATE_EVIDENCE` | `GATE-05-01~06` 恰有 6 项且均 `MATCHED`，每个 report ref/length/SHA 和 Schema 均合法 | `CANVAS06_UPSTREAM_GATE_BLOCKED` |
| `INTAKE-06-006.COVERAGE_COMPATIBILITY` | semantic=`178/130/48`、Atomic=`19/19`、Structural=`24/24`、Control=`20/20`、Compatibility=`13/13=6+7`、failed=`0` | `CANVAS06_UPSTREAM_COVERAGE_MISMATCH` |
| `INTAKE-06-007.CAPABILITY_ELIGIBILITY` | 34 个 ID 集合与 family 计数精确，全部 `ELIGIBLE_FOR_RELEASE_VALIDATION`，coverage/dependency 字段完整 | `CANVAS06_CAPABILITY_INTAKE_BLOCKED` |
| `INTAKE-06-008.PRODUCTION_GATE_DISABLED` | state=`DISABLED` 且 `enabled_capability_ids=[]` | `CANVAS06_UPSTREAM_GATE_ALREADY_ENABLED` |

任一检查 BLOCKED 时仍须输出可通过 Intake Report Schema 的诊断报告，但 runner 返回非零；不得继续读取后续报告来覆盖该结果。

#### 4. 34 项 Capability Intake

`capability_intake[]` 必须按 `family(PROCEDURAL,CONTROL,STRUCTURAL) + capability_id` 排序并恰有：

- `CAP-ISO-PROC-001~016`：`16`；
- `CAP-ISO-CTRL-001~008`：`8`；
- `CAP-ISO-STRUCT-001~010`：`10`。

每项字段固定为：

```text
capability_id, family, upstream_eligibility,
coverage_keys[], template_refs[], rule_refs[], symbol_refs[], grammar_refs[],
binding_digest, upstream_evidence_fingerprint,
intake_status, blocker_codes[]
```

1. `upstream_evidence_fingerprint` 是 Handoff 中对应 `capability_evidence[]` 单个对象按 RFC 8785 JCS 规范化后的 SHA-256；文件 ref 仍使用 raw bytes SHA，二者不得混用。
2. `coverage_keys[]` 和四类 ref/digest 从 Handoff 原样投影，不允许去重后改变顺序或用版本号代替 digest；`binding_digest` 必须等于 ACTIVE canonical binding。
3. `intake_status` 只允许 `MATCHED/BLOCKED`。只有 upstream eligibility 合法、字段闭包完整且指纹可复算时为 `MATCHED`。
4. Intake Report 不能把 capability 标为 enabled，也不能添加 DEV-CANVAS-06 视觉、E2E、性能或恢复结论。

#### 5. READY 算法与退出证据

只有以下表达式为真时才输出 `READY_FOR_RELEASE_VALIDATION` 并返回 `0`：

```text
checks.length == 8
AND every(check.status == MATCHED)
AND capability_intake.length == 34
AND family_counts == {PROCEDURAL:16, CONTROL:8, STRUCTURAL:10}
AND every(capability.intake_status == MATCHED)
AND blockers.length == 0
```

- [x] Intake Schema identity、路径、命令、8 项检查、34 项结构、JCS 指纹、READY 算法和退出码已冻结。
- [ ] Intake Schema 与 runner 已实现并由非法 SHA、非法 Schema、证据缺失、错误计数、非禁用 gate 反例验证。
- [ ] exact Handoff 达到 `READY_FOR_RELEASE_VALIDATION`，报告原始 bytes SHA 已冻结。

### GATE-06-02 Enablement Manifest 冻结执行契约

本节冻结“release-validation PASS 如何成为生产启用候选”，不把 eligibility 或单个测试 PASS 直接解释为 enabled。设计冻结状态为 `FROZEN`，最终 Candidate/Activation/回滚证据尚未生成。

#### 1. 机器资产、命令与不可变文档

```text
docs/contracts/schemas/opm-dev-canvas-06-enablement-manifest.schema.json
<evidence_output_root>/dev-canvas-06/enablement/candidate-enablement-manifest.json
<evidence_output_root>/dev-canvas-06/enablement/activation-enablement-manifest.json
<evidence_output_root>/dev-canvas-06/enablement/rollback-enablement-manifest.json
```

Schema 固定 `schema_id=OPM-DEV-CANVAS-06-ENABLEMENT-001`、`schema_version=0.1`。稳定入口固定为：

```text
npm run release:canvas06:enablement:build -- --evidence-root <path> --intake-report <相对path> --visual-report <相对path> --e2e-report <相对path> --performance-report <相对path> --recovery-report <相对path> --out <candidate相对path>
npm run release:canvas06:enablement:verify -- --evidence-root <path> --manifest <相对path>
npm run release:canvas06:enablement:activate -- --evidence-root <path> --candidate <相对path> --release-report <相对path> --out <activation相对path>
npm run release:canvas06:enablement:rollback -- --evidence-root <path> --effective-manifest <相对path> --scope <ALL|CAPABILITY_SET> [--capability <ID>...] --trigger-code <受控code> --out <rollback相对path>
```

所有命令都先校验输入 raw SHA 与 Schema；禁止 `--force`、跳过失败 Gate、手工传入 enabled ID 或在原文件上更新状态。退出码固定为：

- `build`：`0=READY_FOR_ACTIVATION`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Candidate`、`4=未分类 I/O/内部错误`；
- `verify`：`0=Schema/ref/派生字段均合法`、`2=Schema/ref 无效`、`3=派生状态/集合/证据不匹配`、`4=未分类 I/O/内部错误`；
- `activate`：`0=新 Activation 已生成并复验`、`2=输入/Schema/ref 无效`、`3=Candidate 或 Release Report 非 READY`、`4=未分类 I/O/内部错误`；
- `rollback`：`0=新 Rollback 已生成并复验`、`2=输入/Schema/ref 无效`、`3=输入不是 ACTIVE/ROLLED_BACK_PARTIAL、scope/Capability/trigger 不合法或请求未减少 enabled 集合`、`4=未分类 I/O/内部错误`。

因此，Schema 合法的 BLOCKED Candidate 可以由 `verify` 返回 `0`，但其 `build` 必须返回 `3`，发布流水线不得只看 `verify` 退出码决定激活。

#### 2. 顶层字段与条件结构

顶层字段固定为：

```text
schema_id, schema_version, manifest_id, manifest_kind, manifest_status,
generated_at, generator_identity, source_build, supersedes_ref?,
handoff_ref, intake_report_ref, release_evidence,
candidate_manifest_ref?, release_candidate_report_ref?, rollback_of_ref?, rollback_trigger?, rollback_scope?,
batches[], capability_decisions[],
proposed_enabled_capability_ids[], production_gate,
limitations[], blockers[]
```

1. 所有对象封闭；全部文件 ref 为 bundle 相对 `path + byte_length + sha256`；`handoff_ref.sha256` 必须与 `GATE-06-01` 输入一致。
2. `manifest_kind` 只允许 `CANDIDATE/ACTIVATION/ROLLBACK`。Candidate status 只允许 `BLOCKED/READY_FOR_ACTIVATION`；Activation 只允许 `ACTIVE_PARTIAL/ACTIVE_COMPLETE`；Rollback 只允许 `ROLLED_BACK_PARTIAL/ROLLED_BACK`。
3. `release_evidence` 固定包含 Visual、E2E、Performance、Recovery 四个 report ref；Candidate 必填。Activation 必须追加 exact `candidate_manifest_ref + release_candidate_report_ref`；Rollback 必须追加 exact `rollback_of_ref`，并从前序 effective manifest 原样继承 release evidence，禁止借回退替换证据。
4. `production_gate` 固定包含 `state/enabled_capability_ids[]`。Candidate 必须 `DISABLED + []`；Activation 必须 `ENABLED`，enabled 集合与 Candidate proposed 集合完全相等；`ROLLED_BACK_PARTIAL` 必须 `ENABLED + remaining_enabled_capability_ids`，`ROLLED_BACK` 必须 `DISABLED + []`。Rollback 的 `proposed_enabled_capability_ids[]` 必须等于 remaining，不能保留被回退 ID。
5. `generator_identity` 字段与 Intake `runner_identity` 同结构；`source_build` 必须与 Visual/E2E/Performance/Recovery Report 的 target release build 深度相等，Activation/Rollback 继续携带同一 target build，不用生成器所在工作树冒充目标 build。
6. Rollback 的 `rollback_trigger` 必须包含 `trigger_code/evidence_refs[]/message_key`；trigger code 只允许 `MANUAL_RELEASE_ROLLBACK/EVIDENCE_INVALIDATED/RUNTIME_HEALTH_FAILED/ASSET_INTEGRITY_FAILED`，其他 kind 禁止出现该字段。
7. Rollback 的 `rollback_scope` 必须包含 `mode/requested_disabled_capability_ids[]/effective_disabled_capability_ids[]/remaining_enabled_capability_ids[]/dependency_cascade[]`。`mode=ALL` 时 requested 为空且 effective 等于前序全部 enabled；`mode=CAPABILITY_SET` 时 requested 非空且都在前序 enabled 集合中，effective 等于 requested 加 Control 对 Procedural 的反向依赖闭包，remaining 等于前序 enabled 减 effective。
8. `manifest_id` 固定编码为 `dev-canvas-06.<kind小写>.<source-commit前12位>.<前序关键ref-sha前12位>`；同一 manifest 原始 bytes 不可变，新状态必须新建文件并设置 `supersedes_ref`。
9. `limitations[]` 必须包含“性能只适用于报告环境”和“未证明 ISO 19450:2024 符合性”；`blockers[]` 使用稳定 code/evidence refs，不以自由文本决定状态。

#### 3. 固定三批次

`batches[]` 必须按 ordinal 恰有：

| Batch | ordinal | Capability 集合 | 依赖 |
| --- | ---: | --- | --- |
| `BATCH-PROCEDURAL` | 1 | `CAP-ISO-PROC-001~016`，16 项 | 公共 Gate |
| `BATCH-CONTROL` | 2 | `CAP-ISO-CTRL-001~008`，8 项 | 公共 Gate；各 Control coverage keys 涉及的基础 Procedural ID 必须已在同一或前序 Activation 启用 |
| `BATCH-STRUCTURAL` | 3 | `CAP-ISO-STRUCT-001~010`，10 项 | 公共 Gate；不得在本包发明额外语义依赖 |

每个 Batch 包含 `batch_id/ordinal/capability_ids/dependency_batch_ids/release_validation_status/activation_state/blocker_codes[]`。Batch status 由成员和依赖计算，禁止手写覆盖。

#### 4. Capability Decision 字段与证据闭包

`capability_decisions[]` 必须与 Intake 的 34 个 ID 一一对应并按相同顺序排列。每项字段固定为：

```text
capability_id, family, batch_id,
upstream_evidence_fingerprint, dependency_closure,
release_evidence_coverage,
release_validation_status, activation_state, blocker_codes[]
```

`dependency_closure` 必须原样包含 Intake 的 `coverage_keys[]/template_refs[]/rule_refs[]/symbol_refs[]/grammar_refs[]/binding_digest`；`release_evidence_coverage` 固定包含：

1. `visual_case_ids[]`：该 Capability 在 `VP-1440X900/VP-1280X800/VP-390X844` 与 `Z-025/Z-100/Z-400` 笛卡尔积的 `9` 个 case；ID 固定为 `VIS-CANVAS.<capability_id>.<viewport_id>.<zoom_id>`，按 viewport 上述顺序再按 zoom 上述顺序排列；每个 case 必须由 `GATE-06-03` 按 exact Symbol Descriptor 展开全部 visual variant capture；
2. `family_e2e_result_ref`：Procedural -> `E2E-CANVAS-002/<capability_id>`，Control -> `E2E-CANVAS-003/<capability_id>`，Structural -> `E2E-CANVAS-004/<capability_id>`；其 covered coverage keys 必须与 dependency closure 集合相等；
3. `common_e2e_ids[]`：固定 `E2E-CANVAS-001/005/006/007`，全部 PASS；
4. `performance_scenario_ids[]`：固定为 `PERF-CANVAS-001~007`，覆盖规格第 5 节全部 7 个场景，Performance Report overall PASS；
5. `recovery_case_ids[]`：固定覆盖 `GATE-06-05` 的故障零增量、重开恢复、整体 gate 回退和逐 Capability gate 回退，Recovery Report overall PASS。

`release_validation_status` 只允许 `PENDING/PASSED/BLOCKED`；最终 Candidate 不允许 `PENDING`。`activation_state` 只允许 `DISABLED/ENABLED`；Candidate 中 34 项必须全部 `DISABLED`。

#### 5. 逐 Capability 判定算法

对每个 Capability `C` 按下列顺序短路；任何 ref 缺失、Schema 失败、SHA 不符或重复 ID 先产生 `CANVAS06_EVIDENCE_INTEGRITY_MISMATCH`，不得继续用报告摘要判定：

1. Intake status 必须 READY，`C.intake_status=MATCHED` 且 upstream eligibility=`ELIGIBLE_FOR_RELEASE_VALIDATION`；
2. `upstream_evidence_fingerprint` 可从 Handoff 对应对象复算，dependency closure 与 Intake 深度相等；
3. Visual Report 中 `C` 的固定 9 case 全部 matched，golden、canvas pixel 非空、marker/label/遮挡断言均 PASS；
4. E2E Report 的四个公共 suite 全 PASS，家族 suite 中 `C` 的结果 PASS，covered coverage keys 与上游集合相等；
5. Performance Report 的固定环境、样本和全部 7 个场景 overall PASS；
6. Recovery Report overall PASS，且整体/逐 Capability 回退都证明零数据删除、最近 committed Projection 可重开；
7. Control 额外检查其 coverage keys 引用的全部基础 Procedural Capability 在 proposed 集合中且无 BLOCKED；
8. 以上全部满足才为 `PASSED`，否则为 `BLOCKED + blocker_codes[]`，并保持 `DISABLED`。

稳定 blocker code 只允许：

```text
CANVAS06_HANDOFF_BLOCKED
CANVAS06_UPSTREAM_CAPABILITY_BLOCKED
CANVAS06_DEPENDENCY_CLOSURE_MISMATCH
CANVAS06_EVIDENCE_INTEGRITY_MISMATCH
CANVAS06_VISUAL_EVIDENCE_MISSING
CANVAS06_VISUAL_EVIDENCE_FAILED
CANVAS06_E2E_EVIDENCE_MISSING
CANVAS06_E2E_EVIDENCE_FAILED
CANVAS06_PERFORMANCE_EVIDENCE_MISSING
CANVAS06_PERFORMANCE_EVIDENCE_FAILED
CANVAS06_RECOVERY_EVIDENCE_MISSING
CANVAS06_RECOVERY_EVIDENCE_FAILED
CANVAS06_BATCH_DEPENDENCY_BLOCKED
CANVAS06_RELEASE_CANDIDATE_NOT_READY
CANVAS06_CAPABILITY_ROLLED_BACK
CANVAS06_DEPENDENCY_ROLLED_BACK
CANVAS06_ROLLED_BACK
```

多个 code 按上表顺序输出。`disabled reason` 是 code 的本地化呈现，不得反向参与机器决策。

#### 6. Candidate、Activation 与 Rollback 状态机

```text
BLOCKED Candidate --补齐并重新生成--> READY_FOR_ACTIVATION Candidate
READY_FOR_ACTIVATION Candidate --GATE-06-06 READY--> ACTIVE_PARTIAL | ACTIVE_COMPLETE
ACTIVE_PARTIAL --新增闭包后的新 Candidate/READY--> ACTIVE_COMPLETE
ACTIVE_PARTIAL | ACTIVE_COMPLETE --CAPABILITY_SET rollback--> ROLLED_BACK_PARTIAL
ACTIVE_PARTIAL | ACTIVE_COMPLETE --ALL rollback--> ROLLED_BACK
ROLLED_BACK_PARTIAL --继续单调回退--> ROLLED_BACK_PARTIAL | ROLLED_BACK
ROLLED_BACK_PARTIAL --恢复证据后新 Candidate/READY--> ACTIVE_PARTIAL | ACTIVE_COMPLETE
```

1. Candidate `READY_FOR_ACTIVATION` 至少有 1 个 PASSED Capability，`proposed_enabled_capability_ids` 必须恰等于所有 PASSED ID；若为完整画布发布候选则必须 `34/34`。存在公共 Gate blocker 时 Candidate 必须整体 `BLOCKED + proposed=[]`。
2. `ACTIVE_PARTIAL` 的 enabled 数量固定 `1~33`；`ACTIVE_COMPLETE` 固定 `34`，family 计数必须为 `16/8/10`。Activation 中每个 enabled ID 的 `activation_state=ENABLED`，其余保持 DISABLED 并有 reason。
3. Activation 只接受 `GATE-06-06` 状态 READY、SHA 合法且引用同一 Candidate/Handoff 的 Release Candidate Report；否则产生新的 BLOCKED Candidate 或失败报告，禁止生成 ACTIVE 文件。
4. Rollback 只能从 exact `ACTIVE_PARTIAL/ACTIVE_COMPLETE/ROLLED_BACK_PARTIAL` 做 enabled 集合的单调减法，禁止添加、替换或重新排序剩余 ID。删除 Procedural 时必须级联删除 dependency closure 中引用它的 Control；删除 Control 或 Structural 不产生反向级联。
5. `ROLLED_BACK_PARTIAL` 仍为 `production_gate=ENABLED`，remaining 数量为 `1~33`；effective disabled 项为 DISABLED，直接请求项使用 `CANVAS06_CAPABILITY_ROLLED_BACK`，依赖级联项使用 `CANVAS06_DEPENDENCY_ROLLED_BACK`。`ROLLED_BACK` 为 `production_gate=DISABLED + []`，34 项全部 DISABLED 并包含 `CANVAS06_ROLLED_BACK`。
6. Rollback 不得恢复 Capability；恢复必须生成新的 Candidate，经当时有效的 `GATE-06-03~06` 证据重新 Activation。Model/Revision/Text/Trace/Finding 和历史 manifest 在任何回退范围下均不删除、不降级。
7. 运行时只允许加载 Schema/verifier 通过且 gate=`ENABLED` 的 `ACTIVE_PARTIAL/ACTIVE_COMPLETE/ROLLED_BACK_PARTIAL`；其他状态一律按 gate disabled 处理。读取历史 Revision 继续使用其 exact binding，不因当前 gate 关闭而改写。

#### 7. Gate 退出证据

- [x] Enablement Schema identity、路径、命令、三批次、34 项闭包、稳定 blocker code 和不可变状态机已冻结。
- [ ] Schema、builder、verifier、activate、rollback runner 已实现，正反例和集合边界测试通过。
- [ ] `GATE-06-03~05` 机器报告已生成且 Candidate 可复算为 `READY_FOR_ACTIVATION`；当前不得勾选。
- [ ] `GATE-06-06` READY 后 Activation manifest 已生成并复验；本项关闭前 production gate 必须保持 `DISABLED`。

## GATE-06-01/02 设计冻结结论

1. `GATE-06-01/02` 的设计输入已达到 `FROZEN`，实现和执行仍为 `BLOCKED`。
2. 本轮没有创建 Schema、runner、manifest 或发布报告，没有执行视觉、浏览器 E2E、性能、恢复或生产 enablement。
3. 本结论只覆盖 `GATE-06-01/02`；`GATE-06-03` 由下节独立冻结，不能反向改变 Intake 或 Enablement 算法。

### GATE-06-03 Visual/E2E Closure 冻结执行契约

本节是 Visual/E2E release evidence 的唯一实施口径。它冻结机器资产、case catalog、截图/像素/几何算法、E2E coverage、报告状态和 Gate READY 规则，不表示当前浏览器测试已经达到这些门槛。

#### 1. 本轮边界与当前事实

- Task Type：`feature`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 允许修改：本 checklist、DEV-CANVAS-06 Spec、`docs/design/opm-test-strategy.md`。
- 禁止修改：`.harness/**`、机器 Schema、golden PNG、Profile/Grammar/Rule/Symbol、API、SQLite、Java、Vue、runner、Playwright 配置和测试代码。
- Schema/API/配置/代码/测试：本轮均不允许修改；只冻结未来实现输入。
- 验证：Markdown 结构与表格、case/attempt/coverage 计数、跨文档口径、限定文件 `git diff --check`；纯文档任务无需执行代码测试。
- 回滚：只回退本轮三份文档增量，不改变工作树中的并行实现和任何运行时数据。

审计时的仓库事实：现有 `tests/e2e/playwright.config.ts` 使用 Vite dev server，未冻结 release build、截图 comparator、golden 路径或机器 report；`workbench-layout.spec.ts` 的现有浏览器场景可作为实现复用输入，但不能直接标记为 `GATE-06-03` PASS。Gate 实现必须新建独立 release 入口，不能改变现有 P0 E2E 的含义。

#### 2. 固定机器资产

```text
docs/contracts/schemas/opm-dev-canvas-06-visual-manifest.schema.json
docs/contracts/schemas/opm-dev-canvas-06-visual-report.schema.json
docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest.schema.json
docs/contracts/schemas/opm-dev-canvas-06-e2e-report.schema.json

tests/e2e/release/dev-canvas-06/golden/**

<evidence_output_root>/dev-canvas-06/visual/dev-canvas-06-visual-manifest.json
<evidence_output_root>/dev-canvas-06/visual/dev-canvas-06-visual-report.json
<evidence_output_root>/dev-canvas-06/visual/attempts/**
<evidence_output_root>/dev-canvas-06/visual/diffs/**
<evidence_output_root>/dev-canvas-06/e2e/dev-canvas-06-e2e-manifest.json
<evidence_output_root>/dev-canvas-06/e2e/dev-canvas-06-e2e-report.json
<evidence_output_root>/dev-canvas-06/e2e/attempts/**
```

Schema identity 固定为：

| 资产 | `schema_id` | `schema_version` |
| --- | --- | --- |
| Visual Manifest | `OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001` | `0.1` |
| Visual Report | `OPM-DEV-CANVAS-06-VISUAL-REPORT-001` | `0.1` |
| E2E Manifest | `OPM-DEV-CANVAS-06-E2E-MANIFEST-001` | `0.1` |
| E2E Report | `OPM-DEV-CANVAS-06-E2E-REPORT-001` | `0.1` |

所有对象封闭；文件 ref 均为对应 root 内相对 `path + byte_length + sha256`。Manifest/Report/golden/attempt/diff 不进入 Profile required manifest、Profile package digest、Handoff 或五 role binding digest，但其 raw SHA 必须进入后续 Enablement Candidate 和 Release Candidate Report。

#### 3. 稳定命令与退出码

```text
npm run release:canvas06:visual:manifest -- --handoff-root <只读root> --evidence-root <path> --intake-report <相对path> --source-root <clean-checkout> --web-dist <source-root内相对path> --runtime-jar <exact上游jar> --golden-root tests/e2e/release/dev-canvas-06/golden --out <visual-manifest相对path>
npm run release:canvas06:visual:run -- --evidence-root <path> --manifest <相对path> --out <visual-report相对path>
npm run release:canvas06:visual:verify -- --evidence-root <path> --report <相对path> --require-ready
npm run release:canvas06:e2e:manifest -- --handoff-root <只读root> --evidence-root <path> --intake-report <相对path> --source-root <clean-checkout> --web-dist <source-root内相对path> --runtime-jar <exact上游jar> --out <e2e-manifest相对path>
npm run release:canvas06:e2e:run -- --evidence-root <path> --manifest <相对path> --out <e2e-report相对path>
npm run release:canvas06:e2e:verify -- --evidence-root <path> --report <相对path> --require-ready
```

Manifest 命令：`0=Schema/计数/ref 全合法`、`2=输入/Schema/ref 无效`、`3=case/coverage/golden 闭包不匹配`、`4=未分类 I/O/内部错误`。Run 命令：`0=READY_FOR_ENABLEMENT_EVALUATION`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Report`、`4=未分类错误`。Verify 不带 `--require-ready` 时可对合法 BLOCKED Report 返回 `0`；Gate 流水线必须带该参数，此时 BLOCKED 返回 `3`。

禁止 `--update-snapshots`、`--accept-new-golden`、`--retry`、`--skip-failed`、`--ignore-pixel`、`--force-ready` 或手写 PASS summary。当前依赖只允许复用锁定的 `@playwright/test=1.57.0`、Node 标准库和浏览器标准 Canvas 2D API；本 Gate 不授权引入新的图片比较依赖。

#### 4. Manifest 与 Report 公共封闭字段

Visual/E2E Manifest 顶层固定包含：

```text
schema_id, schema_version, manifest_id, manifest_version, generated_at,
generator_identity, intake_report_ref, handoff_ref,
upstream_source_build, source_build,
environment_policy, cases[], summary
```

Visual/E2E Report 顶层固定包含：

```text
schema_id, schema_version, report_id, generated_at,
runner_identity, manifest_ref, intake_report_ref, handoff_ref,
upstream_source_build, source_build,
environment, report_status, summary,
capability_results[], case_results[], failures[], limitations[]
```

1. `manifest_version=0.1.0`；`manifest_id` 分别固定为 `dev-canvas-06.visual.<source-commit前12位>.<intake-sha前12位>` 和 `dev-canvas-06.e2e.<source-commit前12位>.<intake-sha前12位>`。
2. Manifest/Report 的 `handoff_ref/intake_report_ref/upstream_source_build` 必须与 READY Intake 深度相等；`source_build` 是独立的 clean DEV-CANVAS-06 target build，Visual 和 E2E 必须深度相等，禁止用上游 DEV-CANVAS-05 source commit 冒充目标 build。
3. `generator_identity/runner_identity` 至少包含工具版本、source commit、Node/Playwright/Chromium exact version、OS、命令和 runner source SHA。target build 与 runner build 分开记录，禁止混用。
4. `report_status` 只允许 `BLOCKED/READY_FOR_ENABLEMENT_EVALUATION`。READY 时 `failures=[]`；BLOCKED 时至少一项稳定 failure。
5. `case_results[]` 与 Manifest case 一一对应并保持顺序；不允许缺项、重复、额外 case、skip、only 或从其他 build 拼接结果。
6. 每个 case 恰有 `2` 个全新 browser context、独立 Project/Model/资产目录的 attempt，`attempt_ordinal=1/2`；Playwright `workers=1/retries=0`。任一 attempt 失败、超时或不一致，case 为 FAILED。
7. Manifest `generated_at` 固定取 release build 的 `SOURCE_DATE_EPOCH` UTC 值，同一输入必须生成相同 bytes；Report `generated_at` 记录实际结束时间。Report ID 固定为 `dev-canvas-06.<visual|e2e>-report.<manifest-sha前12位>.<runner-source-sha前12位>`。
8. Visual `summary` 固定包含 `case_count/capability_case_count/common_case_count/attempt_count/capture_count/attempt_capture_count/pass_matched_count/failed_count/skipped_count/retry_count`；E2E `summary` 固定包含 `case_count/family_case_count/family_pass_expectation_count/family_blocked_expectation_count/common_case_count/attempt_count/pass_matched_count/blocked_matched_count/failed_count/skipped_count/retry_count`。

`source_build` 至少包含 source commit、`dirty_before_build=false`、build command、Node exact version、lockfile SHA、`WEB_DIST` aggregate digest 和 `LOCAL_RUNTIME_JAR` ref/SHA。JAR 必须与 Intake build artifact exact 相等；Web dist 必须来自该 source commit 的 production build。Manifest 生成在 evidence output root 进行，不能使 source checkout 变脏。

#### 5. Visual 固定矩阵与 case catalog

Visual Manifest 额外包含 `viewport_catalog[]/zoom_catalog[]/common_subjects[]/blank_baselines[]/pixel_policy/geometry_policy/golden_policy`。

每个 Visual `cases[]` 对象字段固定为：

```text
case_id, case_kind, capability_id?, subject_id?,
viewport_id, zoom_id, fixture_ref, expected_revision,
focus_target_id, focus_anchor, expected_cells,
variant_captures[]
```

`case_kind` 只允许 `CAPABILITY/COMMON`，Capability 与 subject 条件字段互斥。每个 `variant_captures[]` 包含 `visual_variant_key/capture_id/golden_ref/focus_target_id/focus_anchor/critical_regions[]`；公共 case 也固定一个与 subject 同名的 variant capture，避免 Report 使用另一种形状。

| Viewport ID | width | height | device scale factor |
| --- | ---: | ---: | ---: |
| `VP-1440X900` | 1440 | 900 | 1 |
| `VP-1280X800` | 1280 | 800 | 1 |
| `VP-390X844` | 390 | 844 | 1 |

| Zoom ID | scale | UI 显示 |
| --- | ---: | --- |
| `Z-025` | 0.25 | `25%` |
| `Z-100` | 1 | `100%` |
| `Z-400` | 4 | `400%` |

Visual case 固定为：

1. Capability case：`34×3×3=306`，ID=`VIS-CANVAS.<capability_id>.<viewport_id>.<zoom_id>`；
2. 公共 case：`8×3×3=72`，ID=`VIS-CANVAS.COMMON.<subject_id>.<viewport_id>.<zoom_id>`；
3. 总计 `378` case，每项 `2` attempt，总计 `756` attempt；排序固定为 Capability family/ID -> viewport 表顺序 -> zoom 表顺序，再接公共 subject 表顺序 -> viewport -> zoom。

公共 subject 恰有：

| Subject ID | 固定覆盖 |
| --- | --- |
| `STATE_ROLES` | State owner containment、Initial/Default/Final 角色、显式/抑制 |
| `LONG_LABELS` | Object/Process/State/关系长标签换行、无裁剪、无相邻遮挡 |
| `FUNDAMENTAL_FAN` | junction、ordered branches、完整/不完整标记和稳定 Fact 身份 |
| `CANDIDATE_LAYER` | preview、规范端点、route、未提交与 committed Projection 分层 |
| `INSPECTOR` | 桌面侧栏与窄屏 bottom sheet、字段/错误/操作区完整 |
| `TOOLCHAIN_CATALOG` | 图标、tooltip、split-button、搜索、16/8/10 分组与 disabled reason |
| `FINDING_FOCUS` | Finding/图文定位高亮不遮盖基础符号，移除后样式恢复 |
| `BLOCKED_FEEDBACK` | blocked/conflict/readonly/persistence-failed 呈现可区分且不改变固定控件尺寸 |

每个 Capability case 的 `variant_captures[]` 必须从 exact Symbol Catalog 中该 Capability 的 descriptor/visual variant keys 生成，并与 Symbol digest 绑定；每个 variant 至少一个 capture。Case 仍只计一项，但只有全部 variant capture 两次 matched 才 PASS。Visual Report 必须记录 `covered_symbol_variant_keys[]`，集合与 descriptor exact 相等；禁止只截默认 marker 代表 tagged/null-tagged、direction、State-specified、Control annotation 或 fan variant。

Visual `case_results[]` 每项固定包含 `case_id/case_kind/capability_id?/subject_id?/status/covered_symbol_variant_keys[]/attempts[]/failure_codes[]`；status 只允许 `PASS_MATCHED/FAILED`。每个 attempt 包含 `attempt_ordinal/status/revision/projection_digest/cell_geometry_hash/capture_results[]/assertion_results[]`，capture result 必须给出 actual/probe/diff ref、golden/blank ref、像素统计、关键区统计和 geometry 统计。Visual `capability_results[]` 恰有 34 项，包含 `capability_id/family/case_ids[9]/covered_symbol_variant_keys[]/pass_matched_count/failed_count/status`。

#### 6. Visual release 环境与稳定捕获

1. 使用 `source_build.WEB_DIST + upstream exact LOCAL_RUNTIME_JAR` 的 production/release 组合，关闭 HMR、Vue devtools、浏览器 DevTools、扩展、网络访问和非产品注入；不得复用当前 dev-server E2E 结果。
2. Chromium patch、launch args、OS build、color profile、locale=`zh-CN`、timezone=`Asia/Shanghai`、color scheme=`light`、reduced motion=`reduce`、device scale factor=`1` 和全部实际字体文件 SHA 必须与 golden environment fingerprint 一致。
3. 每个 attempt 使用固定时钟、稳定 fixture ID、独立 Project/Model 和同一 expected Revision；先等待 Local Runtime health、`p03-workbench` ready、expected Projection/Text revision、`document.fonts.ready`，再等待连续两个 animation frame 的 cell/geometry hash 相等。
4. Screenshot 使用 Playwright `animations=disabled/caret=hide/scale=css`。禁止 mask；动态时间、光标、进度和随机 ID 必须通过固定时钟/fixture 消除，不能遮掉问题区域。
5. Capability capture 以 `p03-canvas` 为截图范围，按 `focus_target_id + focus_anchor(CENTER/SOURCE/TARGET/LABEL/JUNCTION)` 把当前 variant 的关键区域移到可见 canvas 中心；高缩放或窄屏允许非关键远端位于 canvas 外，但 focus bbox 必须完整可见。
6. 公共 case 以 `p03-workbench` 为主截图，同时保存 `p03-canvas` probe。窄屏 case 必须验证 bottom sheet/横向工具条真实降级，不得改用桌面 CSS 强制截图。
7. 每个 attempt 保存原始 PNG ref/SHA、canvas probe ref/SHA、viewport、zoom、Revision、Projection digest、cell/geometry hash 和捕获时间。失败 case 额外保存 diff PNG；PASS 不生成伪空 diff。

#### 7. Pixel、非空、几何与遮挡算法

PNG 统一由浏览器标准 Canvas 2D 解码为 8-bit sRGB RGBA；SHA 对原始 PNG bytes 计算。像素 `p/q` 的差异定义为 `max(abs(Rp-Rq),abs(Gp-Gq),abs(Bp-Bq),abs(Ap-Aq)) > 16`。

1. Golden match：实际 PNG 与 manifest exact golden 尺寸必须相同；全图 `different_pixel_ratio <= 0.001`，marker/label/junction/focus bbox 关键区 `different_pixel_count=0`。
2. Attempt determinism：同 case/variant 的 attempt 1/2 使用同一算法，要求 `different_pixel_count=0` 且 geometry hash 相等；即使两次都在 golden 容差内，只要彼此不同也判 `VISUAL_NONDETERMINISTIC`。
3. Canvas nonblank：每个 viewport/zoom 固定一个空画布 baseline，共 `9` 个 exact ref；probe 与对应 baseline 的 changed count 必须 `>=max(64,ceil(pixel_count×0.0001))`，并且 X6 可见 cell/marker/label 数与 fixture 预期相等。像素或 cell 任一不满足均失败。
4. 几何统一转换为 viewport CSS pixel AABB；两个非许可 bbox 的交集宽和高都 `>0.5px` 时算遮挡。允许的 intentional pair 只有：State-owner containment、同一关系 label-route、endpoint marker-node boundary、同一 fan junction-branch；许可不能跨 Fact/construct。
5. 工具链、viewport controls、检查器/bottom sheet、底栏、candidate、feedback 与可见关键 construct 之间 `critical_overlap_count=0`。同一关系以外的 marker/label/node、不同 fan branch label 之间也必须为 `0`。
6. 可见文本容器必须满足 `scrollWidth<=clientWidth+1` 且 `scrollHeight<=clientHeight+1`；页面满足 `documentElement.scrollWidth<=viewport.width+1`。Canvas 自身内部 pan/scroll 不算页面横向溢出。
7. focus bbox 必须在 canvas 可见 rect 内各边至少 `1px`；State bbox 必须在 owner content bbox 内；fan junction/branch 数、direction/marker/label slot、Control `e/c` annotation 和 descriptor 期望精确一致。

Release 命令对 golden 只读。缺 golden、golden SHA 不符或环境 fingerprint 不同均 BLOCKED；更新必须走独立设计/标准变更任务，记录 change ID、原因、旧/新 SHA，并重新生成 Visual Manifest，不能在失败 run 中原地接受新图。

#### 8. E2E 固定 catalog 与 coverage 派生

E2E Manifest 额外包含 `fixture_refs[]/driver_catalog[]/suite_catalog[]/coverage_summary/transaction_policy`。家族 case 从 READY Intake 指向的 Handoff coverage catalog 派生，不在浏览器测试中重新解释 Rule：

每个 E2E `cases[]` 对象字段固定为：

```text
case_id, suite_id, capability_id?, coverage_key?, expectation,
viewport_id, zoom_id, fixture_ref, input_ref, driver_id,
expected_transaction, assertion_ids[]
```

`expectation` 只允许 `PASS/BLOCKED`；家族 case 必须有 capability/coverage key，公共 case 必须省略二者并使用本节固定 case ID。`expected_transaction` 必须来自上游 coverage 或公共 case 定义，不允许 runner 从 observed 结果反填。

1. family coverage 恰有 `178`：expected PASS=`130`、BLOCKED=`48`；每个 coverage key 恰映射一次；
2. Procedural -> `E2E-CANVAS-002`，Control -> `003`，Structural -> `004`；
3. case ID=`<suite_id>.<capability_id>.<sha256(coverage_key UTF-8 bytes)前12位>`，同时保存完整 coverage key、upstream case/fixture ref、expectation、driver ID 和 input SHA；
4. driver 只允许 `DRIVER-PROCEDURAL/DRIVER-CONTROL/DRIVER-STRUCTURAL`，输入来自 upstream fixture。前端不能修改端点、Modifier、标签或 completeness 来迁就现有 UI；无法执行时 case FAILED 并回流相应上游/实现包；
5. family case 在 `VP-1440X900/Z-100` 执行一次用户 mutation。PASS 必须原子提交 expected Revision 并重开；BLOCKED 必须 Head 不动且 Revision/Parent/Trace/Finding/Operation/Receipt 增量全 `0`。

公共 case 固定 `16`：

| Suite | Case ID | Viewport | 核心断言 |
| --- | --- | --- | --- |
| `E2E-CANVAS-001` | `STATE_CREATE_RENAME_ROLES` | `VP-1440X900` | 创建、改名、Initial/Default/Final 角色原子提交 |
| `E2E-CANVAS-001` | `STATE_EXPLICITNESS_EXPANSION` | `VP-1280X800` | 显式/抑制、展开/折叠与布局/语义边界 |
| `E2E-CANVAS-001` | `STATE_MOBILE_CREATE_REOPEN` | `VP-390X844` | 窄屏基本创建、重开 Projection 一致 |
| `E2E-CANVAS-001` | `STATE_TEXT_TRACE_ROUNDTRIP` | `VP-1440X900` | State/owner/OPL/Token/Trace 双向定位闭合 |
| `E2E-CANVAS-005` | `REVERSE_DRAG_NORMALIZED` | `VP-1440X900` | 反向拖线得到规范端点 |
| `E2E-CANVAS-005` | `AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED` | `VP-1440X900` | 多候选不自动提交 |
| `E2E-CANVAS-005` | `STALE_OPTION_BLOCKED` | `VP-1440X900` | Revision 变化后 option 失效、零写入 |
| `E2E-CANVAS-006` | `STATE_IMPACT_CONFIRMED` | `VP-1440X900` | State 影响可定位，合法 token 后删除闭合 |
| `E2E-CANVAS-006` | `FACT_IMPACT_CONFIRMED` | `VP-1440X900` | Fact/fan 影响可定位，合法 token 后删除闭合 |
| `E2E-CANVAS-006` | `STALE_TOKEN_BLOCKED` | `VP-1440X900` | 过期 token 阻断、零写入 |
| `E2E-CANVAS-006` | `MISMATCHED_TOKEN_BLOCKED` | `VP-1440X900` | construct/binding 不匹配 token 阻断 |
| `E2E-CANVAS-007` | `ASSET_MISSING` | `VP-1440X900` | 受控占位/禁用原因，保留最近 committed Projection |
| `E2E-CANVAS-007` | `TEXT_BLOCKED` | `VP-1440X900` | 候选不冒充正式关系，Head/Projection 不动 |
| `E2E-CANVAS-007` | `REVISION_CONFLICT` | `VP-1440X900` | 过期候选不可重放，刷新后显式重算 |
| `E2E-CANVAS-007` | `PERSISTENCE_FAILED` | `VP-1440X900` | 七项零增量、最近 committed Projection 可重开 |
| `E2E-CANVAS-007` | `READONLY` | `VP-1440X900` | 语义控件禁用，查看/定位/比较/导出/建草稿保留 |

公共完整 ID 为 `<suite>.<Case ID>`。E2E 总计 `178+16=194` case，每项 `2` attempt，总计 `388` attempt。排序固定为 suite `001~007`；家族 suite 内按 Capability/coverage key，公共 suite 按上表顺序。

公共 case 的 `zoom_id` 全部固定为 `Z-100`。Manifest 不得把公共 case 复制到其他 zoom；三缩放交互/布局由 Visual 矩阵证明。

#### 9. E2E attempt 与报告断言

每个 attempt 必须记录：fixture/input SHA、browser context/project/model ID、base/head/committed Revision、command/option/impact token ID、expected/observed status、top/detail error code、Projection/Text/Trace digest、持久化七项 before/after delta、reopen 结果、console/page/request errors 和 artifact refs。

1. expected PASS -> `PASS_MATCHED`：一次 mutation 的 committed Revision、Head、Projection、OPL/Token/Trace 与 upstream expectation 同 Revision，重开后 digest/身份不变。
2. expected BLOCKED -> `BLOCKED_MATCHED`：错误码与 upstream expectation 相等，repository commit 到达口径匹配，七项增量为 `0`，Head/最近 committed Projection/Text 不动。
3. 公共 case -> `PASS_MATCHED`：Manifest 中逐项断言全通过；其中故障/只读不能只检查 UI 文案，必须比较正式数据和重开状态。
4. attempt 1/2 位于不同数据目录，但使用 Manifest 固定的同一 Project/Model/construct ID 和固定时钟；observed status、Revision/Projection/Text/Trace digest、错误码和事务增量必须相等。不得用随机业务 ID 造成不可比较后再做宽松归一化。
5. 任何未预期 console error、pageerror、未分类 5xx、外网请求、skip、timeout、retry 或 artifact 缺失均使 case FAILED。

E2E `capability_results[]` 恰有 `34` 项，字段至少包含 `capability_id/family/covered_coverage_keys[]/pass_matched_count/blocked_matched_count/failed_count/status/case_refs[]`。covered keys 与 Intake dependency closure 集合完全相等，才可供 `GATE-06-02` 引用。

E2E `case_results[]` 每项字段固定为 `case_id/suite_id/capability_id?/coverage_key?/expectation/status/attempts[]/failure_codes[]`；status 只允许 `PASS_MATCHED/BLOCKED_MATCHED/FAILED`。PASS expectation 和公共 case 只能映射 `PASS_MATCHED`，BLOCKED expectation 只能映射 `BLOCKED_MATCHED`，禁止只检查 status 在允许枚举内。

#### 10. 稳定失败分类

Visual failure code 只允许：

```text
VISUAL_INPUT_INVALID
VISUAL_ENVIRONMENT_MISMATCH
VISUAL_GOLDEN_MISSING
VISUAL_GOLDEN_DIGEST_MISMATCH
VISUAL_CAPTURE_FAILED
VISUAL_CELL_MISMATCH
VISUAL_PIXEL_EMPTY
VISUAL_PIXEL_DIFF
VISUAL_NONDETERMINISTIC
VISUAL_CRITICAL_OVERLAP
VISUAL_TEXT_CLIPPED
VISUAL_PAGE_OVERFLOW
```

E2E failure code 只允许：

```text
E2E_INPUT_INVALID
E2E_ENVIRONMENT_MISMATCH
E2E_FIXTURE_MISMATCH
E2E_CASE_MISSING
E2E_EXPECTATION_MISMATCH
E2E_REVISION_MISMATCH
E2E_PROJECTION_MISMATCH
E2E_TEXT_TRACE_MISMATCH
E2E_TRANSACTION_DELTA_MISMATCH
E2E_NONDETERMINISTIC
E2E_UNEXPECTED_RUNTIME_ERROR
```

`failures[]` 每项固定包含 `code/case_id/attempt_ordinal?/capability_id?/coverage_key?/evidence_refs[]/message_key`。人类说明可本地化，但不能改变 code、case status 或聚合结果。未能归类的异常使用各自 `*_INPUT_INVALID` 或 `E2E_UNEXPECTED_RUNTIME_ERROR` 并使 Gate BLOCKED，不允许忽略。

#### 11. READY 算法与退出证据

Visual Report 只有同时满足以下表达式才 READY：

```text
intake == READY_FOR_RELEASE_VALIDATION
AND case_count == 378
AND capability_case_count == 306
AND common_case_count == 72
AND attempt_count == 756
AND blank_baselines.length == 9
AND capture_count == manifest.capture_count
AND attempt_capture_count == capture_count * 2
AND pass_matched_count == 378
AND failed_count == 0
AND capability_results.length == 34
AND every(case.status == PASS_MATCHED)
AND every(capability.covered_symbol_variant_keys == exact_descriptor_variant_keys)
AND failures.length == 0
AND skipped_count == 0
AND retry_count == 0
```

E2E Report 只有同时满足以下表达式才 READY：

```text
intake == READY_FOR_RELEASE_VALIDATION
AND case_count == 194
AND family_case_count == 178
AND family_expectations == {PASS:130, BLOCKED:48}
AND common_case_count == 16
AND attempt_count == 388
AND pass_matched_count == 146
AND blocked_matched_count == 48
AND failed_count == 0
AND capability_results.length == 34
AND every(case.status == expected_status(case.expectation))
AND every(capability.covered_coverage_keys == intake.coverage_keys)
AND failures.length == 0
AND skipped_count == 0
AND retry_count == 0
```

`GATE-06-03` 关闭还要求两个 Manifest/Report Schema 全部通过、raw SHA 完整；两份报告的 Handoff/Intake/upstream source build refs 相同，DEV-CANVAS-06 target `source_build` 与 environment identity 相同，两个 `--require-ready` verifier 均返回 `0`。任一不满足时 Gate=`BLOCKED`，相关 Capability 保持 disabled；不得用 Visual READY 抵消 E2E BLOCKED，反之亦然。

- [x] 四个 Schema identity、路径、命令、固定矩阵、case ID、attempt 数和 release 环境已冻结。
- [x] PNG comparator、非空、determinism、几何/遮挡/裁剪/溢出和 golden 更新边界已冻结。
- [x] E2E `194=178+16` catalog、两次执行、事务/重开断言、失败码和 READY 算法已冻结。
- [ ] 四个机器 Schema、manifest builder、runner、reporter、verifier 与 release Playwright 配置已实现并通过正反例。
- [ ] `378/378` Visual、`194/194` E2E 及全部 attempts 在 exact release build 实际通过，Report SHA 已冻结。
- [ ] `GATE-06-02` Candidate 重新消费两个 READY Report；当前不得生成 Activation 或启用 Capability。

## GATE-06-03 设计冻结结论

1. `GATE-06-03` 设计输入已达到 `FROZEN`；机器资产、release runner、golden 和执行报告仍为 `BLOCKED`。
2. 本轮没有创建或更新 golden，没有运行 Visual/E2E release 验收，也没有把现有 dev E2E 解释为发布证据。
3. 本结论只覆盖 `GATE-06-03`；`GATE-06-04 Performance Closure` 由下节独立冻结，不能用 Visual/E2E 结果替代性能证据。

### GATE-06-04 Performance Closure 冻结执行契约

本节是产品性能发布门槛的唯一实施口径。它冻结固定 fixture、7 个场景、11 个 metric、原始样本、计时边界、统计算法、环境指纹、报告状态和 Gate READY 规则；所有阈值都是产品要求，不是 ISO 19450:2024 要求。

#### 1. 本轮边界与当前事实

- Task Type：`feature`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 允许修改：本 checklist、DEV-CANVAS-06 Spec、`docs/design/opm-test-strategy.md`。
- 禁止修改：`.harness/**`、机器 Schema、fixture/factory、脚本、配置、Profile/Grammar/Rule/Symbol、API、SQLite、Java、Vue 和测试代码。
- Schema/API/配置/代码/测试：本轮均不允许修改；只冻结未来实现输入。
- 验证：Markdown 结构与表格、scenario/metric/sample/fixture 计数、阈值换算、跨文档口径和限定文件 `git diff --check`；纯文档任务无需执行代码测试。
- 回滚：只回退本轮三份文档增量，不改变工作树中的并行实现和任何运行时数据。

审计时未发现版本化 performance runner、raw sample Schema 或 `perf:*` package script。现有规格和测试策略只冻结了阈值与最低样本量，不能据此声称当前 build 达标。

#### 2. 固定机器资产

```text
docs/contracts/schemas/opm-dev-canvas-06-performance-manifest.schema.json
docs/contracts/schemas/opm-dev-canvas-06-performance-samples.schema.json
docs/contracts/schemas/opm-dev-canvas-06-performance-report.schema.json

tests/performance/release/dev-canvas-06/factories/**

<evidence_output_root>/dev-canvas-06/performance/fixtures/**
<evidence_output_root>/dev-canvas-06/performance/dev-canvas-06-performance-manifest.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-001.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-002.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-003.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-004.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-005.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-006.samples.json
<evidence_output_root>/dev-canvas-06/performance/raw/PERF-CANVAS-007.samples.json
<evidence_output_root>/dev-canvas-06/performance/dev-canvas-06-performance-report.json
<evidence_output_root>/dev-canvas-06/performance/artifacts/**
```

| 资产 | `schema_id` | `schema_version` |
| --- | --- | --- |
| Performance Manifest | `OPM-DEV-CANVAS-06-PERFORMANCE-MANIFEST-001` | `0.1` |
| Performance Samples | `OPM-DEV-CANVAS-06-PERFORMANCE-SAMPLES-001` | `0.1` |
| Performance Report | `OPM-DEV-CANVAS-06-PERFORMANCE-REPORT-001` | `0.1` |

所有对象封闭；文件 ref 使用对应 root 内相对 `path + byte_length + sha256`。Fixture、Manifest、Samples、Report 和 artifact 不进入 Profile required manifest、Profile package digest、Handoff 或五 role binding digest，但其 raw SHA 必须进入 Enablement Candidate 和 Release Candidate Report。

#### 3. 稳定命令与退出码

```text
npm run release:canvas06:performance:fixtures -- --handoff-root <只读root> --evidence-root <path> --intake-report <相对path> --factory-root tests/performance/release/dev-canvas-06/factories --out <performance/fixtures相对path>
npm run release:canvas06:performance:manifest -- --handoff-root <只读root> --evidence-root <path> --intake-report <相对path> --source-root <clean-checkout> --web-dist <source-root内相对path> --runtime-jar <exact上游jar> --fixture-root <performance/fixtures相对path> --out <performance-manifest相对path>
npm run release:canvas06:performance:run -- --evidence-root <path> --manifest <相对path> --out <performance-report相对path>
npm run release:canvas06:performance:verify -- --evidence-root <path> --report <相对path> --require-ready
```

Fixtures/Manifest 命令：`0=Schema/数量/ref/digest 全合法`、`2=输入/Schema/ref 无效`、`3=fixture/scenario 闭包不匹配`、`4=未分类 I/O/内部错误`。Run：`0=READY_FOR_ENABLEMENT_EVALUATION`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Report`、`4=未分类错误`。Verify 不带 `--require-ready` 可对合法 BLOCKED Report 返回 `0`；Gate 流水线必须带该参数，BLOCKED 返回 `3`。

禁止 `--drop-outlier`、`--retry`、`--skip-failed`、`--ignore-oom`、`--use-dev-build`、`--throttle`、`--force-ready` 或手写统计量。本 Gate 只允许复用 Node `perf_hooks/process.hrtime.bigint`、浏览器 Performance/RAF API 和已锁定 Playwright；不授权新增 benchmark/statistics 依赖。

#### 4. Manifest、Samples 与 Report 字段

Performance Manifest 顶层固定为：

```text
schema_id, schema_version, manifest_id, manifest_version, generated_at,
generator_identity, handoff_ref, intake_report_ref,
upstream_source_build, source_build,
environment_policy, statistic_policy,
fixture_catalog[], scenario_catalog[], summary
```

每份 Performance Samples 顶层固定为：

```text
schema_id, schema_version, sample_set_id, generated_at,
manifest_ref, scenario_id, fixture_ref,
environment_fingerprint, series[], integrity
```

Performance Report 顶层固定为：

```text
schema_id, schema_version, report_id, generated_at,
runner_identity, manifest_ref, handoff_ref, intake_report_ref,
upstream_source_build, source_build,
environment, environment_fingerprint,
report_status, summary, fixture_results[], scenario_results[],
raw_sample_refs[], failures[], limitations[]
```

1. `manifest_version=0.1.0`；Manifest ID=`dev-canvas-06.performance.<source-commit前12位>.<intake-sha前12位>`，Report ID=`dev-canvas-06.performance-report.<manifest-sha前12位>.<runner-source-sha前12位>`。
2. Manifest `generated_at` 固定为 release build `SOURCE_DATE_EPOCH` UTC；Report/Samples 记录实际结束时间。相同输入必须生成相同 Manifest bytes。
3. Handoff/Intake/upstream source build 与 READY Intake 深度相等；`source_build` 是 clean DEV-CANVAS-06 target build，结构与 `GATE-06-03` 相同，JAR 为 upstream exact artifact，Web dist 来自目标 source commit production build。
4. `report_status` 只允许 `BLOCKED/READY_FOR_ENABLEMENT_EVALUATION`。READY 时 `failures=[]`；BLOCKED 时至少一个稳定 failure。
5. Manifest `summary` 固定包含 `fixture_count/scenario_count/metric_count/raw_sample_set_count/required_non_frame_measured_sample_count/minimum_baseline_frame_sample_count/minimum_stress_frame_sample_count/minimum_total_measured_sample_count`。
6. 每个 `scenario_catalog[]` 固定包含 `scenario_id/fixture_id/sample_set_path/ordered_metrics[]/functional_check_ids[]/timeout_policy`；每个 metric 定义固定包含 `metric_id/timing_domain/unit/measurement_method/required_warmup_count/required_measured_count?/required_measured_duration_us?/minimum_measured_count?/threshold_policy`。`threshold_policy` 只能使用本节表格冻结的 `P95/MAX/EVERY_SAMPLE + LTE + limit_us`，不得由 runner 临时改写。
7. Report `summary` 固定包含 `fixture_count/scenario_count/metric_count/raw_sample_set_count/non_frame_measured_sample_count/baseline_frame_sample_count/stress_frame_sample_count/total_measured_sample_count/failed_sample_count/timeout_count/oom_count/sample_integrity_failure_count/functional_failure_count/result_incomplete_count/external_interference_count/skipped_count/retry_count`。
8. 每个 `fixture_results[]` 固定包含 `fixture_id/source_fixture_ref/before_digest/after_digest/counts_status/result_status/evidence_refs[]`；每个 `scenario_results[]` 固定包含 `scenario_id/fixture_id/raw_sample_ref/metric_results[]/functional_check_results[]/failed_sample_count/timeout_count/oom_count/status/evidence_refs[]`；每个 `metric_results[]` 固定包含 `metric_id/observed_measured_count/observed_measured_duration_us?/p50_us/p95_us/max_us/threshold_status`。Verifier 按 `(scenario_id, metric_id)` 关联 Manifest metric、Samples series 和 metric result；状态只能由 Manifest、Raw Samples 和 expected digest 重算，不能信任 Report 自报值。

每个 Samples `series[]` 字段固定为：

```text
metric_id, timing_domain, unit, measurement_method,
required_warmup_count, observed_warmup_count,
required_measured_count?, required_measured_duration_us?,
observed_measured_count, observed_measured_duration_us?,
warmup_samples[], measured_samples[], series_digest
```

每个 sample 固定 `ordinal/status/started_at_monotonic_us/ended_at_monotonic_us/duration_us/result_ref?/failure_code?`。`unit=MICROSECONDS`，时间字段为非负整数；status 只允许 `SUCCEEDED/FAILED/TIMEOUT/OOM`。`integrity` 包含 `status/series_count/sample_count/ordinal_contiguous/duplicate_count/missing_count/ordered_samples_sha256`；status 只允许 `MATCHED/FAILED`，SHA 按 Manifest 顺序编码后计算。

#### 5. 固定 fixture catalog

Fixture factory 使用固定 seed=`canvas06-performance-v1`、固定时钟、稳定业务 ID 和 Intake exact Profile/Rule/Grammar/Symbol/Normalization binding。生成发生在 evidence output root；source checkout 保持 clean。

| Fixture ID | 固定规模 | 固定用途/完整性 |
| --- | --- | --- |
| `PERF-FIXTURE-SMALL` | 1 个 Context；Object/Process/State 与 Procedural/Control/Structural/fan 代表构造 | 3 类编辑反馈；State、Procedural、Control update、Structural fan update 四类 OPL mutation 各 25 个独立 clone |
| `PERF-FIXTURE-OPD-300-600` | 300 个未隐藏 semantic construct occurrence、600 个 Fact edge；projection junction 另计 | 34 Capability 至少各一次，包含 State、fan、长标签、Finding；全部 cell/marker/label 可校验 |
| `PERF-FIXTURE-OPD-1000-2000` | 1,000 个未隐藏 semantic construct occurrence、2,000 个 Fact edge；projection junction 另计 | 与基线集同一分布规则放大，34 Capability、State/fan/Finding 不得省略 |
| `PERF-FIXTURE-MODEL-10000` | 10 个 OPD；10,000 semantic construct、20,000 Fact；每 OPD 1,000/2,000 | 5 个不可变 clone template；保存/快照/全量校验各自从每个 template 物化 5 个全新 working copy，禁止跨 scenario 复用；完整 expected Revision/validation/result digest |

`semantic construct` 只计 Element/State/Feature 等正式语义构造，不把 projection-only junction 计入 300/1,000/10,000；junction、edge、marker 和 label 仍必须单独报告真实数量，禁止通过隐藏/折叠/culling 从 X6 graph 删除正式 cell 来降低负载。Viewport 外但未隐藏的 cell 仍计入 fixture；性能报告同时记录实际 DOM/SVG/X6 cell 数。

每个 `fixture_catalog[]` 项固定包含 `fixture_id/generator_id/generator_version/seed/fixed_clock/source_revision_ref/context_count/semantic_construct_count/fact_count/projection_junction_count/cell_count/capability_counts/asset_binding/artifact_refs[]/fixture_digest/expected_result_digests`。四项必须 Schema 合法、digest 可复算，Report 开始和结束均不改变 source fixture bytes。

#### 6. 固定 7 个 scenario 与 11 个 metric

| Scenario | Metric | Fixture | 预热/Measured | PASS 阈值 |
| --- | --- | --- | --- | --- |
| `PERF-CANVAS-001.EDIT_FEEDBACK` | `EDIT_TOOL_SWITCH_US` | SMALL | `5 + 100` | P95 `<=100000 us` |
| `PERF-CANVAS-001.EDIT_FEEDBACK` | `EDIT_SELECTION_US` | SMALL | `5 + 100` | P95 `<=100000 us` |
| `PERF-CANVAS-001.EDIT_FEEDBACK` | `EDIT_INSPECTOR_FEEDBACK_US` | SMALL | `5 + 100` | P95 `<=100000 us` |
| `PERF-CANVAS-002.INCREMENTAL_OPL` | `INCREMENTAL_OPL_VISIBLE_US` | SMALL | `8 + 100`，四类 mutation 各 25 | P95 `<=500000 us` |
| `PERF-CANVAS-003.BASELINE_OPD` | `PAN_ZOOM_FRAME_US` | 300/600 | 2 s warmup + 30 s measured，至少 900 frame | P95 `<=32000 us` |
| `PERF-CANVAS-003.BASELINE_OPD` | `SELECTION_FEEDBACK_US` | 300/600 | `5 + 100` | P95 `<=100000 us` |
| `PERF-CANVAS-004.STRESS_OPD` | `PAN_ZOOM_FRAME_US` | 1000/2000 | 2 s warmup + 30 s measured，至少 600 frame | P95 `<=50000 us`，零 OOM |
| `PERF-CANVAS-004.STRESS_OPD` | `SELECTION_FEEDBACK_US` | 1000/2000 | `5 + 100` | P95 `<=200000 us`，零 OOM |
| `PERF-CANVAS-005.LARGE_MODEL_SAVE` | `LARGE_MODEL_SAVE_US` | MODEL-10000 | 5 个独立 clone，各 1 次 measured | 每次且 Max/P95 `<=10000000 us` |
| `PERF-CANVAS-006.LARGE_MODEL_SNAPSHOT` | `LARGE_MODEL_SNAPSHOT_US` | MODEL-10000 | 5 个独立 clone，各 1 次 measured | 每次且 Max/P95 `<=15000000 us` |
| `PERF-CANVAS-007.LARGE_MODEL_VALIDATE` | `LARGE_MODEL_VALIDATE_US` | MODEL-10000 | 5 个独立 clone，各 1 次 measured | 每次且 Max/P95 `<=60000000 us`，结果完整 |

固定汇总：scenario=`7`、metric instance=`11`、raw sample set=`7`；metric 的稳定唯一键为 `(scenario_id, metric_id)`，两档 OPD 复用 `PAN_ZOOM_FRAME_US/SELECTION_FEEDBACK_US` 时不得合并，所以全局 metric 语义名为 `9` 个但 `metric_count` 必须为 `11`。非 frame measured sample=`615`，frame measured sample 至少 `900+600=1500`，总 measured sample 至少 `2115`。大模型任务不设置 measured 前的业务 warmup；启动/health/fixture clone 在计时外完成，五次全部保留，不得因首次较慢而丢弃。

#### 7. 计时起止点与 timing domain

| Metric | timing domain | Start | End |
| --- | --- | --- | --- |
| `EDIT_TOOL_SWITCH_US` | `BROWSER_PERFORMANCE` | 用户 click/key event `processingStart` | 首个 RAF 后 active tool、`aria-pressed` 和 cursor/mode 可见一致 |
| `EDIT_SELECTION_US` | `BROWSER_PERFORMANCE` | construct click event `processingStart` | 首个 RAF 后 selection highlight 与 inspector header 同时更新 |
| `EDIT_INSPECTOR_FEEDBACK_US` | `BROWSER_PERFORMANCE` | inspector submit event `processingStart` | 首个 RAF 后 `P03-command-feedback` 显示 submitting；下一 sample 前等待该命令终态 |
| `INCREMENTAL_OPL_VISIBLE_US` | `BROWSER_PERFORMANCE` | `API-EDT-002` committed revision response body 完整到达 | 首个 RAF 后同 Revision OPL 可见且 Trace freshness=current |
| `PAN_ZOOM_FRAME_US` | `BROWSER_RAF` | 相邻 RAF 的前一 timestamp | 后一 RAF timestamp；仅固定 interaction trace 的 30 s measured window |
| `SELECTION_FEEDBACK_US` | `BROWSER_PERFORMANCE` | 固定 target click `processingStart` | 首个 RAF 后 highlight/inspector target 均匹配 |
| `LARGE_MODEL_SAVE_US` | `NODE_HRTIME` | 保存请求写入 loopback socket 前 | durable committed response 完整读取且 Head 回读匹配 |
| `LARGE_MODEL_SNAPSHOT_US` | `NODE_HRTIME` | Snapshot 请求写入 socket 前 | 成功响应读取、Snapshot 回读且 source Revision 匹配 |
| `LARGE_MODEL_VALIDATE_US` | `NODE_HRTIME` | 全量校验请求写入 socket 前 | Task SUCCEEDED、完整 Result 拉取并验证 digest 后 |

同一 series 只能使用一个 timing domain。浏览器 observer/RAF 由 runner 只读安装，不得 patch Vue/X6、timer、fetch、DOM 更新或产品代码；Node 使用 `process.hrtime.bigint()`。跨域 clock 值不得相减，所有 duration 在同域先计算再转整数微秒。

Frame 使用 manifest exact `PERF-TRACE-PAN-ZOOM-V1`，按 RAF 节奏重放 30 秒 pan/zoom 序列；interaction trace path/length/SHA 和事件数进入 Manifest。Measured window 前 2 秒只预热，不进入 series。窗口内 visibility change、focus 丢失、sleep/wake、trace 中断或样本低于固定数量均使 scenario FAILED。

#### 8. 统计与原始样本算法

1. `duration_us=ceil((end-start)×1000)`，browser 毫秒转微秒后向上取整；Node 纳秒转微秒也向上取整。Gate 始终比较整数微秒。
2. 对全部 `SUCCEEDED` measured duration 升序排序；P50 index=`ceil(0.50×N)-1`，P95 index=`ceil(0.95×N)-1`，Max 为最后一个。禁止插值、平均 P95 或跨 metric/机器/build 合并。
3. Warmup 保留在 raw samples 但不进入统计；Measured sample 不删除 outlier。FAILED/TIMEOUT/OOM 记录实际或截止 duration 和 failure code，`failed_sample_count>0` 时 scenario 必然 FAILED；诊断统计不得覆盖失败状态。
4. Report 展示 `p50_ms/p95_ms/max_ms` 时用 `duration_us/1000` 保留三位小数，门槛判断只用 `p50_us/p95_us/max_us`。对 N=`5`，nearest-rank P95 等于 Max。
5. `failure_rate=failed measured sample / required measured sample`，只允许 `0`。任何 sample 缺失、ordinal 重复/断裂、负 duration、结束早于开始、series/report 统计重算不一致均为 sample integrity failure。
6. Run/Report 必须保留 7 份原始 Sample bytes；报告只引用 raw SHA，不能只输出 CSV 摘要、控制台数字或聚合后的 P95。

#### 9. 固定性能环境与环境指纹

1. 机器至少 8 logical CPU、16 GB RAM、SSD；报告 machine/CPU/GPU/RAM/SSD/OS build、可用内存、温度/电源状态、display refresh。低电量/节能模式、CPU/network throttling、远程网络或非 SSD 环境为无效输入。
2. 使用 headful Chromium、hardware acceleration、前台可见窗口、`1440x900`、device scale factor `1`、display refresh `>=60 Hz`；关闭 DevTools、扩展、HMR、浏览器后台节流和非产品动画。不得用 Visual Gate 的软件光栅环境替代性能环境。
3. Java=`21`、Node=`22`、Playwright/Chromium exact patch、JVM/Chromium/product launch args、heap limit、SQLite/Flyway、loopback ports、source build、Profile/Rule/Grammar/Symbol/Normalization 和 fixture digest 全部记录。使用产品默认发布参数，禁止只为通过测试扩大 heap、关闭校验或省略渲染。
4. Runtime/browser 在全部 scenario 前启动并完成 health；交互为 `HOT_SERVICE/HOT_BROWSER`，大模型为 `HOT_SERVICE/FRESH_PROJECT_CLONE`。不得把启动或 fixture generation 混入 metric；冷启动不在本 Gate 七个阈值内，但必须在 limitations 明确。
5. 每个 scenario 前后记录环境 snapshot。visibility change、窗口失焦、sleep/wake、power mode 变化、外网请求、进程 crash、thermal critical 或 source artifact 变化计为 external interference，当前 run 整体 BLOCKED。

`environment_fingerprint` 固定为上述离散环境字段、exact versions/args/digests 按字段顺序 RFC 8785 JCS 后的 SHA-256；瞬时可用内存/温度值记录但不进入 fingerprint。不同 fingerprint 的 sample 不得进入同一 Report。

#### 10. 功能与结果完整性守卫

1. 两档 OPD 在 run 前后都必须保持 Manifest 的 semantic construct/Fact/junction/X6 cell/marker/label/Finding 数；无 pageerror、未预期 console error、5xx、空白 canvas、缺 marker、缺 State、fan branch 丢失或工具禁用。
2. Pan/zoom 不创建 Revision/OPL；selection 每次命中 expected stable target，highlight/inspector 一致。只测 frame 或 DOM 回调但功能断裂时 scenario FAILED。
3. Incremental OPL 的 100 个 sample 按 State/Procedural/Control/Structural 各 25 个独立 clone；每个 end state 的 committed Revision、OPL、Token/Trace 和 Projection digest 必须匹配 expected result。
4. Save 每次必须产生完整 durable Revision/Parent/Head/Trace/Finding/Operation/Receipt 并重开一致；Snapshot 每次指向 exact source Revision 且不可变；Validation 每次覆盖 Manifest expected Rule scope，Finding/result digest 完整。
5. OOM 通过 JVM/Chromium exit、日志、page crash 和 process status 联合判定。任一 OOM、timeout、任务失败、结果缺失或 partial write 均失败，不能只看 duration。

#### 11. 稳定失败分类

```text
PERF_INPUT_INVALID
PERF_ENVIRONMENT_MISMATCH
PERF_BUILD_MISMATCH
PERF_FIXTURE_MISMATCH
PERF_SAMPLE_INCOMPLETE
PERF_SAMPLE_CORRUPT
PERF_THRESHOLD_EXCEEDED
PERF_FUNCTIONAL_FAILURE
PERF_RESULT_INCOMPLETE
PERF_TIMEOUT
PERF_OOM
PERF_RUNTIME_ERROR
PERF_EXTERNAL_INTERFERENCE
```

`failures[]` 每项固定包含 `code/scenario_id?/metric_id?/sample_ordinal?/fixture_id?/evidence_refs[]/message_key`。人类说明不能改变 code、metric/scenario status 或聚合结果。未分类异常使用 `PERF_RUNTIME_ERROR` 并整体 BLOCKED。

#### 12. READY 算法与退出证据

Performance Report 只有同时满足以下表达式才 READY：

```text
intake == READY_FOR_RELEASE_VALIDATION
AND source_build.dirty_before_build == false
AND environment.valid == true
AND environment_fingerprint == sha256(jcs(environment.discrete_fields))
AND fixture_count == 4
AND scenario_count == 7
AND metric_count == 11
AND raw_sample_set_count == 7
AND non_frame_measured_sample_count == 615
AND baseline_frame_sample_count >= 900
AND stress_frame_sample_count >= 600
AND total_measured_sample_count >= 2115
AND total_measured_sample_count == non_frame_measured_sample_count + baseline_frame_sample_count + stress_frame_sample_count
AND every(raw_sample_set.integrity.status == MATCHED)
AND every(fixture_result.counts_status == MATCHED AND fixture_result.result_status == MATCHED)
AND every(metric_result.{p50_us,p95_us,max_us} == recompute(raw_sample_series, NEAREST_RANK))
AND every(recompute_threshold_status(metric_result, manifest_metric.threshold_policy) == PASS_MATCHED AND metric_result.threshold_status == PASS_MATCHED)
AND every(recompute_scenario_status(scenario_result.metric_results, scenario_result.functional_check_results, raw_samples) == PASS_MATCHED AND scenario_result.status == PASS_MATCHED)
AND failed_sample_count == 0
AND timeout_count == 0
AND oom_count == 0
AND sample_integrity_failure_count == 0
AND functional_failure_count == 0
AND result_incomplete_count == 0
AND external_interference_count == 0
AND skipped_count == 0
AND retry_count == 0
AND failures.length == 0
```

`GATE-06-04` 关闭还要求 Manifest、7 份 Samples 和 Report Schema 全部通过，raw SHA 完整，Handoff/Intake/upstream build 与 READY Intake 一致；target `source_build` 与后续 Visual/E2E/Recovery Report 完全相同；`--require-ready` verifier 返回 `0`。Gate BLOCKED 时全部 Capability 的公共 performance evidence 不成立，不能按单个 Capability 绕过。

- [x] 三个 Schema identity、路径、命令、4 个 fixture、7 个 scenario、11 个 metric instance 和计时边界已冻结。
- [x] Raw Samples、nearest-rank P50/P95/Max、样本完整性、环境指纹、功能守卫、失败码和 READY 算法已冻结。
- [ ] 三个机器 Schema、fixture factory、manifest builder、runner、reporter、verifier 和 performance release config 已实现并通过正反例。
- [ ] `7/7` scenario、`11/11` metric instance、全部 raw sample 和结果完整性在 exact release build 实际通过，Report SHA 已冻结。
- [ ] `GATE-06-02` Candidate 重新消费 READY Performance Report；当前不得生成 Activation 或启用 Capability。

## GATE-06-04 设计冻结结论

1. `GATE-06-04` 设计输入已达到 `FROZEN`；机器 Schema、fixture、runner、raw samples 和执行报告仍为 `BLOCKED`。
2. 本轮没有生成性能 fixture、没有执行 benchmark，也没有把开发环境响应或人工观察解释为性能证据。
3. 本结论只覆盖 `GATE-06-04`；`GATE-06-05 Recovery/Rollback` 由下节独立冻结，不能用性能结果替代恢复证据。

### GATE-06-05 Recovery/Rollback 冻结执行契约

本节是 Recovery/Rollback release evidence 的唯一实施口径。它冻结 28 个 case、故障到达点、七项事务与 Head 证明、强停重开、幂等回放、test-only gate 演练、部分/全量回退和 Gate READY 规则，不表示当前 release build 已通过恢复验收。

#### 1. 本轮边界与当前事实

- Task Type：`feature`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 允许修改：本 checklist、DEV-CANVAS-06 Spec、`docs/design/opm-test-strategy.md`。
- 禁止修改：`.harness/**`、机器 Schema、fixture/factory、脚本、配置、Profile/Grammar/Rule/Symbol、API、SQLite、Java、Vue 和测试代码。
- Schema/API/配置/代码/测试：本轮均不允许修改；只冻结未来实现输入。
- 验证：Markdown 结构与表格、case/attempt/category/failure code 计数、状态机集合算法、跨文档口径和限定文件 `git diff --check`；纯文档任务无需执行代码测试。
- 回滚：只回退本轮三份文档增量，不改变工作树中的并行实现和任何运行时数据。

审计时的仓库事实：现有 SQLite 测试已覆盖 `REVISION/PARENT/TRACE/FINDING/HEAD/OPERATION/RECEIPT` 七个写阶段异常回滚，数据库打开存在 `RECOVERY_REQUIRED` marker 状态；但没有版本化 Recovery release Schema、28-case manifest、强停 runner、部分回退 manifest 或机器 Report。现有单元测试不能直接标记本 Gate PASS。

#### 2. 固定机器资产

```text
docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest.schema.json
docs/contracts/schemas/opm-dev-canvas-06-recovery-gate-fixture.schema.json
docs/contracts/schemas/opm-dev-canvas-06-recovery-report.schema.json

tests/recovery/release/dev-canvas-06/factories/**

<evidence_output_root>/dev-canvas-06/recovery/fixtures/**
<evidence_output_root>/dev-canvas-06/recovery/dev-canvas-06-recovery-manifest.json
<evidence_output_root>/dev-canvas-06/recovery/dev-canvas-06-recovery-gate-fixture.json
<evidence_output_root>/dev-canvas-06/recovery/dev-canvas-06-recovery-report.json
<evidence_output_root>/dev-canvas-06/recovery/artifacts/**
```

| 资产 | `schema_id` | `schema_version` |
| --- | --- | --- |
| Recovery Manifest | `OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001` | `0.1` |
| Recovery Gate Fixture | `OPM-DEV-CANVAS-06-RECOVERY-GATE-FIXTURE-001` | `0.1` |
| Recovery Report | `OPM-DEV-CANVAS-06-RECOVERY-REPORT-001` | `0.1` |

所有对象封闭；文件 ref 使用对应 root 内相对 `path + byte_length + sha256`。Recovery 资产不进入 Profile required manifest、Profile package digest、Handoff、五 role binding 或生产 enablement 目录；Report raw SHA 必须进入 Candidate 和 Release Candidate Report。

#### 3. 稳定命令与退出码

```text
npm run release:canvas06:recovery:manifest -- --handoff-root <只读root> --evidence-root <path> --intake-report <相对path> --source-root <clean-checkout> --web-dist <source-root内相对path> --runtime-jar <exact上游jar> --factory-root tests/recovery/release/dev-canvas-06/factories --manifest-out <recovery-manifest相对path> --gate-fixture-out <gate-fixture相对path>
npm run release:canvas06:recovery:run -- --evidence-root <path> --manifest <相对path> --gate-fixture <相对path> --out <recovery-report相对path>
npm run release:canvas06:recovery:verify -- --evidence-root <path> --report <相对path> --require-ready
```

Manifest 命令：`0=Schema/数量/ref/digest 全合法`、`2=输入/Schema/ref 无效`、`3=fixture/case/dependency 闭包不匹配`、`4=未分类 I/O/内部错误`。Run：`0=READY_FOR_ENABLEMENT_EVALUATION`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Report`、`4=未分类错误`。Verify 不带 `--require-ready` 可对合法 BLOCKED Report 返回 `0`；Gate 流水线必须带该参数，BLOCKED 返回 `3`。

禁止 `--skip`、`--retry`、`--force-ready`、`--accept-production-gate-fixture`、`--ignore-delta`、`--ignore-head` 或在父 runner 进程内模拟强停。故障只允许施加于 attempt 专用资产副本、项目目录和子进程；source checkout、Handoff bundle 和生产 gate 路径保持只读。

#### 4. Manifest、Gate Fixture 与 Report 字段

Recovery Manifest 顶层固定为：

```text
schema_id, schema_version, manifest_id, manifest_version, generated_at,
generator_identity, handoff_ref, intake_report_ref,
upstream_source_build, source_build,
environment_policy, fixture_catalog[], fault_policy, case_catalog[], summary
```

Recovery Gate Fixture 顶层固定为：

```text
schema_id, schema_version, fixture_id, generated_at,
test_only, production_loader_expected_status,
handoff_ref, intake_report_ref, source_build,
source_manifest_state, enabled_capability_ids[], dependency_graph,
fixture_digest
```

Recovery Report 顶层固定为：

```text
schema_id, schema_version, report_id, generated_at,
runner_identity, manifest_ref, gate_fixture_ref,
handoff_ref, intake_report_ref, upstream_source_build, source_build,
environment, environment_fingerprint, report_status, summary, gate_fixture_result,
fixture_results[], case_results[], failures[], limitations[]
```

1. `manifest_version=0.1.0`；Manifest ID=`dev-canvas-06.recovery.<source-commit前12位>.<intake-sha前12位>`，Report ID=`dev-canvas-06.recovery-report.<manifest-sha前12位>.<runner-source-sha前12位>`。
2. Manifest/Gate Fixture `generated_at` 固定为 release build `SOURCE_DATE_EPOCH` UTC；Report 记录实际结束时间。相同输入必须生成相同 Manifest 与 Gate Fixture bytes。
3. Handoff/Intake/upstream source build 与 READY Intake 深度相等；`source_build` 与 GATE-06-03/04 的 clean DEV-CANVAS-06 target build 深度相等。
4. `report_status` 只允许 `BLOCKED/READY_FOR_ENABLEMENT_EVALUATION`。READY 时 `failures=[]`；BLOCKED 时至少一个稳定 failure。
5. Manifest `summary` 固定包含 `fixture_count/case_count/pre_commit_case_count/sqlite_case_count/forced_restart_case_count/service_recovery_case_count/rollback_case_count/required_attempt_count`，数值必须为 `2/28/8/7/4/3/6/56`。
6. Report `summary` 固定包含上述计数及 `observed_attempt_count/pass_matched_count/failed_count/zero_model_delta_case_count/committed_recovered_case_count/partial_rollback_matched_count/full_rollback_matched_count/rejected_rollback_matched_count/skipped_count/retry_count/production_gate_mutation_count`。
7. `gate_fixture_result` 固定包含 `expected_loader_status/observed_loader_status/evaluator_adapter_status/production_gate_before/production_gate_after/status/evidence_refs[]`；status 只允许 `MATCHED/FAILED`。每个 `fixture_results[]` 固定包含 `fixture_id/source_ref/before_digest/after_digest/integrity_status/evidence_refs[]`。
8. `environment_policy` 固定 Java=`21`、Node=`22`、exact SQLite JDBC/Flyway、OS/filesystem、SQLite `journal_mode/synchronous/foreign_keys`、loopback、runtime/JVM args 和 source artifact digest；Report 记录 actual 值。`environment_fingerprint` 为离散字段按 RFC 8785 JCS 后的 SHA-256，瞬时 PID/端口/路径不进入 fingerprint。
9. `fault_policy` 固定 `required_attempt_count=2/runner_retry_count=0/forced_termination=OS_CHILD_PROCESS/evidence_capture_before_cleanup=true`；实现不得按 fault 类型改变 attempt 数或清理时机。

每个 `case_catalog[]` 固定包含 `case_id/category/fixture_ref/fault/expected_top_code?/expected_detail_code?/expected_process_outcome/expected_transaction/expected_reopen/expected_gate/required_attempt_count`。`category` 只允许 `PRE_COMMIT/SQLITE/FORCED_RESTART/SERVICE_RECOVERY/ROLLBACK`；`fault` 固定包含 `stage/variant/target_ref?/requires_forced_termination`，stage 必须等于 category，variant 必须等于 case ID 最后一个稳定段，只有 `016~019` 的 forced termination 为 true。`expected_process_outcome` 只允许 `BLOCKED_ZERO_DELTA/RESTART_ZERO_DELTA/COMMITTED_RECOVERED/STABLE_REOPEN/ROLLBACK_PARTIAL/ROLLBACK_FULL/ROLLBACK_REJECTED`；`expected_gate.status` 只允许 `UNCHANGED_DISABLED/PARTIAL/FULL/REJECTED`，非 ROLLBACK case 固定 `UNCHANGED_DISABLED`。每个 `case_results[]` 固定包含 `case_id/category/status/attempts[]/failure_codes[]/evidence_refs[]`；status 只允许 `PASS_MATCHED/FAILED`。

每个 attempt 固定包含：

```text
attempt_ordinal, isolated_root_ref, asset_copy_ref, project_db_ref,
before_snapshot, injected_fault, fault_reached,
api_observation, process_observation,
after_snapshot, reopen_snapshot, idempotent_replay?,
gate_observation?, artifact_refs[], normalized_outcome_digest, status
```

`attempt_ordinal=1/2`，status 只允许 `PASS_MATCHED/FAILED`；两个 attempt 不得复用 SQLite、进程、缓存、端口、资产副本或 gate fixture 工作副本。`normalized_outcome_digest` 覆盖 top/detail code、七项 delta、Head、reopen 正式 digest 和 gate 结果，排除时间、PID、端口和临时路径。Report 顺序严格等于 Manifest；禁止缺项、重复、额外 case 或仅保留绿色 attempt。

#### 5. 固定 fixture 与 test-only gate 边界

| Fixture ID | 固定内容 | 完整性要求 |
| --- | --- | --- |
| `RECOVERY-FIXTURE-MODEL` | 已提交 base Revision、Head、完整 Projection/OPL/Trace/Finding；State、Procedural、Control、Structural/fan 的合法 candidate command | 每个 case 从不可变 template 物化全新项目；base/candidate/expected result digest 固定 |
| `RECOVERY-FIXTURE-GATE` | exact Handoff `34/34` eligible 集合、Control -> Procedural 依赖图和模拟 `ACTIVE_COMPLETE` effective state | `test_only=true`、`production_loader_expected_status=REJECTED`；只允许 recovery runner 适配到公共 rollback evaluator |

Gate Fixture 不是 Enablement Manifest，不得放入生产 enablement path，也不得被 runtime production loader 接受。Runner 必须先证明 production loader 对它返回 `REJECTED`，再通过测试组合根调用与生产 rollback builder/verifier 共用的纯 evaluator；禁止伪造 `GATE-06-06` READY Report、调用生产 activate 命令或改变真实 production gate。

`dependency_graph` 从 READY Intake/Handoff 的 34 项 closure 确定性生成并带 SHA。逐 Capability 演练目标固定为：字典序首个 Structural、字典序首个 Control、字典序首个具有至少一个反向 Control 依赖的 Procedural；不存在第三类目标时 Manifest 生成失败，禁止改选无依赖项降低覆盖。

#### 6. 固定 28 个 Recovery/Rollback case

| Case ID | 类别 | 故障/动作 | 稳定预期 |
| --- | --- | --- | --- |
| `RCV-CANVAS-001.RULE_IDENTITY` | PRE_COMMIT | Rule identity 受控不匹配 | `TEXT_GENERATION_BLOCKED/PROFILE_ASSET_IDENTITY_MISMATCH`；repository 未调用；零增量 |
| `RCV-CANVAS-002.SYMBOL_MISSING` | PRE_COMMIT | Symbol 文件从 attempt 副本移除 | `TEXT_GENERATION_BLOCKED/PROFILE_ASSET_MISSING`；repository 未调用；零增量 |
| `RCV-CANVAS-003.GRAMMAR_DIGEST` | PRE_COMMIT | Grammar bytes 与 ref digest 不一致 | `TEXT_GENERATION_BLOCKED/PROFILE_ASSET_DIGEST_MISMATCH`；repository 未调用；零增量 |
| `RCV-CANVAS-004.NORMALIZATION_IDENTITY` | PRE_COMMIT | Normalization identity 不匹配 | `TEXT_GENERATION_BLOCKED/PROFILE_ASSET_IDENTITY_MISMATCH`；repository 未调用；零增量 |
| `RCV-CANVAS-005.SEMANTIC_VALIDATION` | PRE_COMMIT | Context closure 受控破坏 | `VALIDATION_BLOCKED/CONTEXT_CLOSURE_VIOLATION`；repository 未调用；零增量 |
| `RCV-CANVAS-006.PLAN_UNSUPPORTED` | PRE_COMMIT | 合法入口到不支持 SentencePlan | `TEXT_GENERATION_BLOCKED/TEXT_PLAN_UNSUPPORTED`；repository 未调用；零增量 |
| `RCV-CANVAS-007.TEXT_COMPOSITION` | PRE_COMMIT | Composer 受控失败 | `TEXT_GENERATION_BLOCKED/TEXT_COMPOSITION_FAILED`；repository 未调用；零增量 |
| `RCV-CANVAS-008.TRACE_INCOMPLETE` | PRE_COMMIT | Trace 必需 SourceRef 缺失 | `TEXT_GENERATION_BLOCKED/TEXT_TRACE_INCOMPLETE`；repository 未调用；零增量 |
| `RCV-CANVAS-009.SQLITE_REVISION` | SQLITE | `afterRevisionInsert` 抛错 | `PERSISTENCE_FAILED`；七项零增量、Head 不动 |
| `RCV-CANVAS-010.SQLITE_PARENT` | SQLITE | `afterParentInsert` 抛错 | 同上 |
| `RCV-CANVAS-011.SQLITE_TRACE` | SQLITE | `afterTraceInsert` 抛错 | 同上 |
| `RCV-CANVAS-012.SQLITE_FINDING` | SQLITE | `afterFindingInsert` 抛错 | 同上 |
| `RCV-CANVAS-013.SQLITE_HEAD` | SQLITE | `beforeHeadUpdate` 抛错 | 同上 |
| `RCV-CANVAS-014.SQLITE_OPERATION` | SQLITE | `afterOperationInsert` 抛错 | 同上 |
| `RCV-CANVAS-015.SQLITE_RECEIPT` | SQLITE | `afterReceiptInsert` 抛错 | 同上 |
| `RCV-CANVAS-016.KILL_AFTER_REVISION` | FORCED_RESTART | Revision insert 后强停子进程 | 新进程重开七项零增量、Head/base digest 不变 |
| `RCV-CANVAS-017.KILL_AFTER_HEAD` | FORCED_RESTART | Head update 后、commit 前强停 | 新进程重开七项零增量、Head/base digest 不变 |
| `RCV-CANVAS-018.KILL_AFTER_COMMIT` | FORCED_RESTART | SQLite commit 后、API response 前强停 | 恰一项 committed Revision；Head 指向它；同 command_id 回放不重复写 |
| `RCV-CANVAS-019.IDLE_RESTART` | FORCED_RESTART | 已确认提交后强停空闲 runtime | 新进程打开相同 Head/Projection/OPL/Trace，无新增写入 |
| `RCV-CANVAS-020.SERVICE_UNAVAILABLE` | SERVICE_RECOVERY | command 前 runtime 不可用，随后恢复 | 页面保留最近 committed 投影；恢复后重开 base；零增量 |
| `RCV-CANVAS-021.PROJECTION_READBACK` | SERVICE_RECOVERY | commit 后 Projection 回读失败 | 恰一项 committed Revision；重开新 Head 与同 Revision Projection/OPL/Trace；幂等回放不重复写 |
| `RCV-CANVAS-022.RECOVERY_REQUIRED` | SERVICE_RECOVERY | 启动存在合法 recovery-required marker | 不提供可写数据库；原 base 文件/恢复点不变；不得伪报 READY |
| `RCV-CANVAS-023.ROLLBACK_STRUCTURAL` | ROLLBACK | 回退固定 Structural ID | `ROLLED_BACK_PARTIAL`；只移除目标；历史语义只读可渲染 |
| `RCV-CANVAS-024.ROLLBACK_CONTROL` | ROLLBACK | 回退固定 Control ID | `ROLLED_BACK_PARTIAL`；只移除目标；基础 Procedural 保留 |
| `RCV-CANVAS-025.ROLLBACK_PROCEDURAL_CASCADE` | ROLLBACK | 回退固定 Procedural ID | `ROLLED_BACK_PARTIAL`；移除目标及全部反向依赖 Control，集合可复算 |
| `RCV-CANVAS-026.ROLLBACK_ALL` | ROLLBACK | `scope=ALL` | `ROLLED_BACK`、gate disabled、enabled 为空；历史语义只读可渲染 |
| `RCV-CANVAS-027.ROLLBACK_UNKNOWN` | ROLLBACK | 请求未知/未启用 Capability | 请求拒绝，前序 effective state 不变，不生成 Rollback manifest |
| `RCV-CANVAS-028.ROLLBACK_TAMPERED` | ROLLBACK | 前序 manifest/ref digest 被篡改 | verifier 拒绝，前序 effective state 不变，不生成 Rollback manifest |

固定汇总：`28=8+7+4+3+6` case；每项 `2` 个隔离 attempt，总计 `56`。`26` 个 case 的模型数据增量为零；`018/021` 为恰好一次 committed 且恢复成功。Run 不允许 Playwright/JUnit retry；`018/021` 内同 command_id 的显式幂等回放属于 case 断言，不计为 attempt retry。

#### 7. 故障到达与强停规则

1. PRE_COMMIT fault 必须通过正式 release command 入口到达目标阶段；Report 记录 top/detail code、asset role/identity 和 `repository_commit_call_count=0`。Runner 不得按 case ID 直接返回预期错误。
2. SQLITE fault 必须调用真实 SQLite repository 的七个受控 hook；每个 hook 只抛出一次受控 I/O 异常，不改 SQL、事务边界或候选数据。失败后关闭连接并由新进程回读。
3. FORCED_RESTART 必须以 exact `LOCAL_RUNTIME_JAR` 加载产品类，并由 test classpath 中、不进入发布 JAR 的 launcher 启动独立子进程；收到 runner 的到达证明后由父进程执行强制终止。不能用 Java exception、正常 shutdown hook 或 mock crash 替代。原始 exit/signal、WAL/journal、临时文件和日志进入 artifact refs。
4. `KILL_AFTER_COMMIT` 的到达证明必须发生在真实 `connection.commit()` 成功后、HTTP response 首字节前；`PROJECTION_READBACK` 必须发生在 commit response 已确定同一 Revision 后。无法证明窗口时 case=`FAILED`。
5. 每个 attempt 的重开使用新 JVM、新数据库连接、新浏览器 context 和同一 immutable fixture expectation。重开前不得手工清理 WAL、journal、marker、临时目录或修正 Head。

#### 8. 七项事务、Head、重开与幂等算法

`before_snapshot/after_snapshot/reopen_snapshot` 固定包含：

```text
revision_document_count, revision_parent_count, text_artifact_count,
text_trace_count, finding_count, operation_count, receipt_count,
draft_head_revision_id, head_sequence,
revision_digest, projection_digest, opl_digest, trace_digest,
sqlite_quick_check, foreign_key_check_count,
recovery_marker_refs[], temporary_artifact_refs[]
```

1. `expected_transaction` 直接复用 DEV-CANVAS-05 的 `revision_delta/revision_parent_delta/text_artifact_delta/text_trace_delta/finding_delta/operation_delta/receipt_delta/draft_head_changed`，并追加 expected Head ID/sequence；不得建立“只看 Revision 数”的简写。
2. 零增量 case 的前七项全部为 `0`、Head ID/sequence 不变、candidate Revision JSON 不存在；PRE_COMMIT 还要求 repository 调用为 `0`。
3. `018/021` 的 expected committed snapshot 由 fixture 给出 exact delta/digest；Revision/Parent/Operation/Receipt 各恰一份，Head 只前移一次。显式幂等回放返回同一 committed Revision，回放前后全部 delta 为 `0`。
4. 每次重开后 `PRAGMA quick_check=ok`、`foreign_key_check_count=0`；Projection、OPL、Trace 必须绑定 reopen Head。可重建索引允许重建，但不能改变正式 Revision bytes 或伪造缺失证据。
5. `RECOVERY_REQUIRED` 只证明写入被阻断和恢复点保留，不自动执行破坏性替换；无法确认一致性时保持 recovery-required，不得为了 Gate 绿色删除 marker。
6. `text_artifact_count` 是从 `revision_document.document_json` 中正式 Text Artifact 计算的逻辑计数，不代表新增 SQLite 表；本 Gate 不改变 V1 schema。

#### 9. 部分/全量回退与历史只读算法

1. Rollback 输入必须是通过 Enablement Schema/verifier 的 `ACTIVE_PARTIAL/ACTIVE_COMPLETE/ROLLED_BACK_PARTIAL` effective manifest。演练时 Gate Fixture 只在测试组合根适配为该输入，production loader 必须明确拒绝原 fixture bytes。
2. `requested` 必须非空、无重复且全部属于前序 enabled 集合，再按 Handoff Capability 顺序规范化；任一未知、未启用或重复 ID 使请求整体拒绝。`effective_disabled=requested ∪ reverse_control_dependencies(requested_procedural)`；`remaining=previous_enabled-effective_disabled`。
3. `remaining` 非空生成 `ROLLED_BACK_PARTIAL + production_gate=ENABLED`；为空生成 `ROLLED_BACK + production_gate=DISABLED`。输出 enabled 顺序必须保持 Handoff 顺序，禁止排序差异掩盖错误。
4. Structural/Control 单项回退不级联；Procedural 只级联 dependency graph 明确引用它的 Control，不关闭无关 Procedural/Structural。每个 cascade 项记录 source/dependent ID 和 closure evidence ref。
5. 回退后读取含 disabled Capability 的历史 Revision 必须按其 exact binding 渲染 Projection/OPL/Trace；创建、更新或删除 disabled Capability 的新命令返回稳定 disabled reason 且七项零增量。查看、定位、比较和导出仍可用。
6. Rollback 资产、Gate Fixture 和 Report 均位于 evidence root；真实 production gate 在 56 个 attempt 前后必须保持 `DISABLED + []`，`production_gate_mutation_count=0`。

#### 10. 稳定失败分类

```text
RECOVERY_INPUT_INVALID
RECOVERY_ENVIRONMENT_MISMATCH
RECOVERY_BUILD_MISMATCH
RECOVERY_FIXTURE_MISMATCH
RECOVERY_FAULT_NOT_REACHED
RECOVERY_ERROR_CODE_MISMATCH
RECOVERY_TRANSACTION_DELTA_MISMATCH
RECOVERY_HEAD_MISMATCH
RECOVERY_REOPEN_FAILED
RECOVERY_IDEMPOTENCY_MISMATCH
RECOVERY_DATA_LOSS
RECOVERY_GATE_STATE_MISMATCH
RECOVERY_ROLLBACK_SCOPE_MISMATCH
RECOVERY_READONLY_MISMATCH
RECOVERY_NONDETERMINISTIC
RECOVERY_UNEXPECTED_RUNTIME_ERROR
```

`failures[]` 每项固定包含 `code/case_id?/attempt_ordinal?/fault_stage?/capability_id?/evidence_refs[]/message_key`。人类说明不能改变 code、case status 或聚合结果；未分类异常使用 `RECOVERY_UNEXPECTED_RUNTIME_ERROR` 并整体 BLOCKED。

#### 11. READY 算法与退出证据

Recovery Report 只有同时满足以下表达式才 READY：

```text
intake == READY_FOR_RELEASE_VALIDATION
AND source_build.dirty_before_build == false
AND environment.valid == true
AND environment_fingerprint == sha256(jcs(environment.discrete_fields))
AND fixture_count == 2
AND case_count == 28
AND pre_commit_case_count == 8
AND sqlite_case_count == 7
AND forced_restart_case_count == 4
AND service_recovery_case_count == 3
AND rollback_case_count == 6
AND observed_attempt_count == 56
AND pass_matched_count == 28
AND failed_count == 0
AND every(case.required_attempt_count == 2)
AND every(count(case.attempts) == 2)
AND every(case.category == ROLLBACK OR every(case.attempts.fault_reached == true))
AND every(recompute_case_status(case.attempts, case.expected_transaction, case.expected_reopen, case.expected_gate) == PASS_MATCHED AND case.status == PASS_MATCHED)
AND every(distinct_count(case.attempts.normalized_outcome_digest) == 1)
AND every(fixture_result.integrity_status == MATCHED)
AND zero_model_delta_case_count == 26
AND committed_recovered_case_count == 2
AND partial_rollback_matched_count == 3
AND full_rollback_matched_count == 1
AND rejected_rollback_matched_count == 2
AND every(case.attempts.reopen_snapshot.sqlite_quick_check == OK)
AND every(case.attempts.reopen_snapshot.foreign_key_check_count == 0)
AND gate_fixture_result.expected_loader_status == REJECTED
AND gate_fixture_result.observed_loader_status == REJECTED
AND gate_fixture_result.evaluator_adapter_status == MATCHED
AND gate_fixture_result.status == MATCHED
AND production_gate_mutation_count == 0
AND skipped_count == 0
AND retry_count == 0
AND failures.length == 0
```

`GATE-06-05` 关闭还要求 Manifest、Gate Fixture、Report Schema 全部通过，raw SHA 完整，Handoff/Intake/upstream build 与 READY Intake 一致，target `source_build` 与 Visual/E2E/Performance Report 完全相同，`--require-ready` verifier 返回 `0`。Recovery BLOCKED 时全部 Capability 的公共 recovery evidence 不成立，不能按单个 Capability 绕过。

- [x] 三个 Schema identity、路径、命令、2 个 fixture、28 个 case、56 个 attempt 和故障到达规则已冻结。
- [x] 七项事务/Head、强停重开、幂等回放、部分/全量回退、历史只读、失败码和 READY 算法已冻结。
- [ ] 三个机器 Schema、fixture factory、fault runner、rollback evaluator adapter、reporter 和 verifier 已实现并通过正反例。
- [ ] `28/28` case、`56/56` attempt 在 exact release build 实际通过，Recovery Report SHA 已冻结。
- [ ] `GATE-06-02` Candidate 重新消费 READY Recovery Report；当前不得生成 Activation 或启用 Capability。

## GATE-06-05 设计冻结结论

1. `GATE-06-05` 设计输入已达到 `FROZEN`；机器 Schema、fixture、runner、部分回退实现和执行报告仍为 `BLOCKED`。
2. 本轮没有注入故障、强停进程、生成 rollback manifest 或改变 production gate，也没有把现有 SQLite 单元测试解释为 release recovery 证据。
3. `GATE-06-05` 的下游输入由下一节 `GATE-06-06 Release Candidate Evidence` 承接；Recovery 结论不能替代 release smoke 或最终激活前守卫。

### GATE-06-06 Release Candidate Evidence 冻结执行契约

本节是 DEV-CANVAS-06 最终发布候选证据的唯一实施口径。它冻结发布包身份、构建来源、clean smoke、证据汇总、报告状态和 Activation 前置守卫，不表示当前仓库已有安装包、release runner 或 READY 报告。

#### 1. 本轮边界与当前事实

- Task Type：`feature`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 允许修改：本 checklist、DEV-CANVAS-06 task spec 与 `docs/design/opm-test-strategy.md`。
- 禁止修改：`.harness/**`、Schema 实体、fixture/factory、runner、脚本、配置、Java、Vue、API、SQLite 和测试代码。
- 验证：文档表格、Schema/ID/状态/计数、跨 Gate ref、围栏、旧口径和限定文件 `git diff --check`；纯文档任务无需执行代码测试。
- 回滚：只回退本轮三份文档增量，不改变工作树中的实现、构建产物、数据或 production gate。

审计时的仓库事实：根 `package.json` 只有 contract/lint/typecheck/test/build/E2E/backend verify，现有 Playwright 使用 Vite dev server；Local Runtime 暴露 `/actuator/health`，但 `pom.xml` 尚未把 `apps/web/dist` 内嵌为发布态静态资源；仓库没有 release bundle、clean install runner、Release Candidate Schema/Report 或 CI 发布流水线。现有 dev E2E、`apps/web/dist` 或 Spring Boot JAR 即使存在，也不能直接标记本 Gate PASS。

#### 2. 固定机器资产、路径与命令

本 Gate 固定两类 JSON 机器资产和一个被引用的二进制发布包：

```text
docs/contracts/schemas/opm-dev-canvas-06-release-candidate-manifest.schema.json
docs/contracts/schemas/opm-dev-canvas-06-release-candidate-report.schema.json

<evidence_output_root>/dev-canvas-06/release/dev-canvas-06-release-candidate-manifest.json
<evidence_output_root>/dev-canvas-06/release/dev-canvas-06-release-candidate-report.json
<evidence_output_root>/dev-canvas-06/release/artifacts/opm-modeling-tool-<app_version>-<target_os>-<target_arch>.zip
<evidence_output_root>/dev-canvas-06/release/artifacts/bundle-content.json
<evidence_output_root>/dev-canvas-06/release/artifacts/web-dist-files.json
<evidence_output_root>/dev-canvas-06/release/artifacts/profile-assets-files.json
<evidence_output_root>/dev-canvas-06/release/smoke/<lane_id>/<case_id>/**
```

Schema identity 固定为：

- Manifest：`schema_id=OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-MANIFEST-001`、`schema_version=0.1`；
- Report：`schema_id=OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-REPORT-001`、`schema_version=0.1`。

未来实现的稳定入口固定为：

```text
npm run release:canvas06:assemble -- \
  --handoff-root <只读handoff_bundle_root> \
  --evidence-root <evidence_output_root> \
  --candidate <dev-canvas-06内相对path> \
  --target-os <target_os> \
  --target-arch <target_arch> \
  --output <dev-canvas-06/release内相对manifest path>

npm run release:canvas06:smoke -- \
  --evidence-root <evidence_output_root> \
  --manifest <dev-canvas-06内相对path> \
  --output <dev-canvas-06/release内相对report path>

npm run release:canvas06:verify -- \
  --evidence-root <evidence_output_root> \
  --manifest <dev-canvas-06内相对path> \
  --report <dev-canvas-06内相对path> \
  --require-ready
```

`assemble`：`0=READY_FOR_RELEASE_SMOKE`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Manifest`、`4=未分类 I/O/内部错误`。`smoke`：`0=READY`、`2=输入/Schema/ref 无效`、`3=已生成合法 BLOCKED Report`、`4=未分类错误`。`verify` 不带 `--require-ready` 时可对 Schema 合法的 BLOCKED 文件返回 `0`；带该参数时 BLOCKED 固定返回 `3`。禁止 `--force-ready`、`--skip-smoke`、`--reuse-install`、`--ignore-digest`、`--activate` 或从 checklist 勾选推导状态的旁路。

`assemble` 只校验并组装 GATE-06-03~05 已证明的 exact target build，不重新编译 Web/JAR。若输入产物缺失而必须重编译，新 build identity 必须退回 GATE-06-03~05 全量重跑后才能重新 assemble。

所有对象封闭。文件 ref 统一为其所属 root 内相对 `path + byte_length + sha256`，禁止绝对路径、`..`、root 逃逸、符号链接跟随和同名替换。Manifest、Report、inventory 和 smoke 原始证据生成后不可原地修改。它们不进入 Profile required manifest、Profile package digest 或五 role binding digest；Activation 直接记录 Report raw ref，Manifest raw ref 由 Report 的 `release_manifest_ref` 进入可复核证据链。

#### 3. 发布包、Web dist 与 source build 身份

发布包是目标平台定向 ZIP，不是源码包，也不是 `.opmp` 模型交换包。解压后的逻辑内容固定为：

```text
<install_root>/bin/<platform_launcher>
<install_root>/lib/opm-local-runtime.jar
<install_root>/assets/profiles/**
<install_root>/manifest/bundle-content.json
```

1. 外置 `bundle-content.json` 记录 ZIP 内除其同字节副本外每个 payload 的相对 path、media type、executable bit、byte length 和 SHA-256；ZIP 内 `manifest/bundle-content.json` 必须与外置文件 raw bytes 相等。ZIP 不得包含绝对路径、`..`、重复/大小写冲突 entry、符号链接、设备文件或未列出的 payload。
2. `apps/web/dist` 的 production tree 以排序后的 `(relative_path,byte_length,sha256)` 计算 `web_dist_tree_sha256`，完整嵌入 `opm-local-runtime.jar` 的静态资源目录；运行时与前端必须为同一 loopback origin，并对 `/projects` 和工作台深链提供 SPA index fallback，不得启动 Vite 或外部静态服务器。
3. JAR 必须内含应用 classes、Flyway migration 和 Web dist；Profile/Rule/Grammar/Symbol/Normalization 按 exact binding 放入 `assets/profiles`。launcher 只接受 loopback bind、端口和 data root，不从源码目录解析资产。
4. clean install 只解压并校验 ZIP，不执行 `npm install`、Maven、源码编译、系统目录写入或网络下载。Java 21 是首版外部运行前置，exact vendor/version/path hash 进入 smoke environment；其他 JRE 分发形态必须另立 task spec。
5. `source_build` 固定包含 `git_commit/git_tree/dirty_before_build/build_commands[]/build_exit_codes[]/build_log_refs[]/toolchain/dependency_lock_refs[]/source_input_refs[]`。`dirty_before_build` 必须为 false；`package-lock.json`、根/前端 `package.json`、根/Local Runtime `pom.xml`、Maven wrapper properties 均记录 raw ref。
6. `artifacts` 固定包含 `status` 以及 `web_dist={file_count,tree_sha256,file_manifest_ref}`、`local_runtime_jar_ref`、`profile_assets_tree_ref`、`bundle_content_ref`、`release_zip_ref`。`READY_FOR_RELEASE_SMOKE` 时 status=`ASSEMBLED` 且全部 ref 必填；BLOCKED 时 status=`ABSENT/INVALID`，未生成项必须缺省而非伪造空 SHA。JAR 中实取 Web dist tree SHA 必须与 `web_dist.tree_sha256` 相等；ZIP 解压结果必须与 `bundle_content_ref` 逐文件相等。
7. Manifest 的 `source_build` 必须与 Visual/E2E/Performance/Recovery READY Report 的 target source build 深度相等；不得在四类 Gate 通过后重新编译另一 JAR 或 Web dist 冒充同一 release candidate。

#### 4. Release Candidate Manifest 顶层与证据汇总

Manifest 顶层固定包含：

```text
schema_id
schema_version
manifest_id
generated_at
generator
manifest_status
release_scope
handoff_ref
intake_report_ref
release_evidence
enablement_candidate_ref
source_build
dependency_locks
artifacts
target_environment
smoke_catalog
production_gate
blockers[]
```

1. `manifest_id` 固定为 `dev-canvas-06.release.<candidate_manifest_sha256前12位>.<git_tree前12位>.<target_os>.<target_arch>`，因此合法 BLOCKED Manifest 不依赖尚未生成的 ZIP identity；`manifest_status` 只允许 `BLOCKED/READY_FOR_RELEASE_SMOKE`。
2. `release_evidence` 恰含 `visual_manifest_ref/visual_report_ref/e2e_manifest_ref/e2e_report_ref/performance_manifest_ref/performance_report_ref/recovery_manifest_ref/recovery_report_ref`。每项 ref/Schema/status/raw SHA 必须匹配 `GATE-06-03~05`，不得只引用摘要。
3. `enablement_candidate_ref` 必须指向通过 Enablement Schema/verifier 的 `READY_FOR_ACTIVATION` Candidate；`release_scope` 由其 proposed 集合确定：`1~33=PARTIAL`、`34=COMPLETE`。proposed 集合必须恰等于 Candidate 中全部 `PASSED` Capability。
4. Manifest 的 Handoff/Intake、四类 release evidence 与 Candidate 内对应 refs 必须深度相等；Capability、coverage、binding 或 build 任一分叉时 Manifest BLOCKED。
5. `production_gate` 必须为 `state=DISABLED`、`enabled_capability_ids=[]`，并记录 production loader 对 Candidate 的观察结果为 `NOT_ACTIVE`。Manifest 不得包含 Activation ref 或把 proposed 集合写入 enabled 集合。
6. `target_environment` 固定包含 `target_os/target_arch/java_major/loopback_only/single_origin/no_external_network/browser_engine/browser_patch/viewport/device_scale_factor`；viewport 固定 `1440x900`，device scale factor 固定 `1`。
7. READY 时 `blockers=[]`；BLOCKED 时至少一个 `code/evidence_refs[]/message_key`，并且不生成可用于 smoke 的 release ZIP 引用。

#### 5. 固定 6 个 smoke case 与 2 个隔离 lane

Manifest 的 `smoke_catalog[]` 恰有以下 `6` 项，按表中顺序执行。每项 `required_attempt_count=2`，由 `LANE-01/LANE-02` 各执行一次，共 `12` 条 attempt evidence：

| Case ID | 固定动作 | PASS 观察 |
| --- | --- | --- |
| `SMK-CANVAS-001.CLEAN_INSTALL` | 在 lane 专属、运行前为空的 install/storage/browser roots 解压 ZIP | `bundle-content` 逐文件 SHA matched；无源码、npm/Maven、网络、路径逃逸或预存数据依赖；`duration<=30s` |
| `SMK-CANVAS-002.START` | 仅从 install root 的 launcher 启动 exact JAR/asset tree | 只监听 lane 专属 `127.0.0.1:<port>`，未监听非 loopback；无 Vite/HMR/dev server；进程 `5s` 内存活且日志无 secret/path 正文泄露 |
| `SMK-CANVAS-003.HEALTH` | 轮询同 origin `/actuator/health` 并读取 `/opm-bootstrap.js` 与 `/` | `30s` 内 HTTP `200` 且 health=`UP`；bootstrap/session 同 origin；静态 HTML/JS/CSS 全来自 release JAR；production gate=`DISABLED + []` |
| `SMK-CANVAS-004.OPEN` | headful Chromium 从 `/projects` 经真实 UI 创建 Project、Model、Object、Process、Consumption | `15s` 内工作台可用、canvas pixel 非空；`2` 个 construct、`1` 个 Fact、OPL=`Process 1 consumes Object 1.`；记录 committed Revision、Projection/OPL/Trace digest；零 console/page error、零外网请求 |
| `SMK-CANVAS-005.REOPEN` | 关闭浏览器，正常终止首进程；用同一 install/storage 启动新进程和新浏览器上下文，打开原 route | `30s` 内重开；project/model/context/head、Projection/OPL/Trace digest 与 OPEN 记录相等；Revision/Fact 无重复；gate 仍 `DISABLED + []` |
| `SMK-CANVAS-006.EXIT` | 确认无活动写事务/未提交候选后正常终止重开进程 | `10s` 内 exit code `0`；health 不再可达、无残留子进程；SQLite quick check=`OK`、foreign key violation=`0`、最后 committed Head 不变 |

每个 lane 使用不同的 install root、storage root、browser profile、进程、端口和日志目录；两个 lane 只能共享只读 Manifest/ZIP bytes。不得复用现有服务器、开发者项目库、`runtime-data`、浏览器 profile 或前一 lane 的解压目录。任一 case 失败后仍输出该 lane 已观察到的原始证据，但不得重试、跳过后续 case 后伪报完整，也不得更新包内容后沿用原 Manifest。

OPEN 只使用已发布 P0 Object/Process/Consumption 主路径证明安装包可工作；Candidate 的 16/8/10 仍处于 proposed/disabled，完整 Capability 行为由 GATE-06-03~05 的 exact release-validation evidence 证明。smoke 不得临时加载 test-only Gate Fixture、Candidate 或 Activation 来绕过 production loader。

#### 6. Release Candidate Report、attempt 与环境字段

Report 顶层固定包含：

```text
schema_id
schema_version
report_id
generated_at
generator
release_status
release_manifest_ref
handoff_ref
intake_report_ref
release_evidence
enablement_candidate_ref
source_build
artifact_observations
environment
environment_fingerprint
lane_results[]
aggregation
production_gate_observation
failures[]
residual_risks[]
conformance_boundary
```

1. `report_id` 固定为 `dev-canvas-06.release-report.<release_manifest_sha256前12位>`；`release_status` 只允许 `BLOCKED/READY`。
2. Report 中 Manifest/Handoff/Intake/release evidence/Candidate/source build 必须与 Manifest 深度相等；`artifact_observations` 记录安装前 ZIP、安装后 payload、JAR 内 Web dist 和 profile asset 的实算 refs/digests。
3. `environment` 固定记录目标 OS/build/arch、Java vendor/full version/executable SHA、Chromium full version、CPU、逻辑核、RAM、SSD、locale、timezone、viewport、device scale、loopback ports、network mode、HMR/DevTools 状态。`environment_fingerprint=sha256(jcs(environment.discrete_fields))`，不得包含随机 lane path、PID、时间或端口。
4. `lane_results[]` 恰有 `LANE-01/LANE-02`；每项包含 `lane_id/status/install_root_was_empty/storage_root_was_empty/browser_profile_was_empty/process_identity_refs[]/case_results[]/evidence_refs[]`。status 只允许 `PASS_MATCHED/FAILED`。
5. 每个 `case_results[]` 包含 `case_id/status/attempt_ordinal/started_at/finished_at/duration_us/observations/evidence_refs[]/failure_codes[]`；status 只允许 `PASS_MATCHED/FAILED`。时间阈值只比较 `duration_us`，不得由格式化秒数判断。
6. OPEN/REOPEN 的 `observations` 固定包含 `project_id/model_id/context_id/head_revision_id/head_sequence/projection_sha256/opl_sha256/trace_sha256/canvas_nonblank/console_error_count/page_error_count/external_request_count`；REOPEN 必须与同 lane OPEN 的身份和 digest 深度相等。
7. `aggregation` 固定包含 `lane_count/case_count/expected_attempt_count/observed_attempt_count/pass_matched_count/failed_count/skipped_count/retry_count/external_request_count/production_gate_mutation_count`。
8. `production_gate_observation` 固定包含 `before/during/after` 三个快照；三者都必须 `DISABLED + []`，Candidate loader status=`NOT_ACTIVE`。`conformance_boundary` 固定声明 `PRODUCT_RELEASE_EVIDENCE_ONLY` 与 `ISO_19450_2024_CONFORMANCE_NOT_ESTABLISHED`。

#### 7. Candidate、Release Report 与 Activation 守卫

1. Manifest 生成前，Enablement Candidate 必须已由 exact Intake + GATE-06-03~05 READY Reports 构建并复验为 `READY_FOR_ACTIVATION`；BLOCKED Candidate 不得进入 smoke。
2. Release Report READY 只对 exact Manifest、ZIP、source build、target environment 和 Candidate 有效。任一文件 bytes、Candidate proposed 集合或 build ref 变化都必须生成新 Manifest、重新执行 `12/12` attempt 并生成新 Report。
3. `GATE-06-02 activate` 必须同时传入 exact Candidate ref 和 exact READY Release Report ref；Activation verifier 必须反向确认 Report 引用同一 Candidate/Handoff/Intake 和 release evidence，且 Manifest/Report raw SHA 未变。
4. READY Report 生成前后 production gate 均保持 `DISABLED + []`。Report builder/smoke/verifier 均禁止写 production enablement path；只有独立 activate 命令能生成新 `ACTIVE_PARTIAL/ACTIVE_COMPLETE` 文件。
5. READY Report 可以覆盖 PARTIAL 或 COMPLETE Candidate，但报告必须明确 `release_scope`。只有 `release_scope=COMPLETE` 且 proposed 集合为 `34/34`，才允许使用“完整画布发布候选证据完备”；PARTIAL 不得使用该文案。
6. Report READY 不证明 Activation 已执行，也不证明已安装到其他机器、已发布给用户或符合 ISO 19450:2024。

#### 8. 稳定失败分类

以下 `20` 个 code 是本 Gate 唯一一级失败分类：

```text
CANVAS06_RELEASE_INPUT_SCHEMA_INVALID
CANVAS06_RELEASE_REF_INVALID
CANVAS06_RELEASE_UPSTREAM_GATE_BLOCKED
CANVAS06_RELEASE_CANDIDATE_NOT_READY
CANVAS06_RELEASE_CANDIDATE_SCOPE_MISMATCH
CANVAS06_RELEASE_PRODUCTION_GATE_NOT_DISABLED
CANVAS06_RELEASE_SOURCE_BUILD_MISMATCH
CANVAS06_RELEASE_LOCKFILE_MISMATCH
CANVAS06_RELEASE_WEB_DIST_MISMATCH
CANVAS06_RELEASE_JAR_MISMATCH
CANVAS06_RELEASE_BUNDLE_MISMATCH
CANVAS06_RELEASE_ENVIRONMENT_MISMATCH
CANVAS06_RELEASE_INSTALL_FAILED
CANVAS06_RELEASE_START_FAILED
CANVAS06_RELEASE_HEALTH_FAILED
CANVAS06_RELEASE_OPEN_FAILED
CANVAS06_RELEASE_REOPEN_FAILED
CANVAS06_RELEASE_EXIT_FAILED
CANVAS06_RELEASE_ISOLATION_FAILED
CANVAS06_RELEASE_UNEXPECTED_RUNTIME_ERROR
```

Manifest `blockers[]` 与 Report `failures[]` 每项固定包含 `code/case_id?/lane_id?/evidence_refs[]/message_key`。多项失败并存时全部保留，不能以最后错误覆盖前序失败；自由文本、异常类名或日志内容不能改变 code 和聚合状态。

#### 9. READY 算法与退出证据

Release Candidate Report 只有同时满足以下表达式才 READY：

```text
manifest.schema_valid == true
AND report.schema_valid == true
AND manifest.manifest_status == READY_FOR_RELEASE_SMOKE
AND handoff/intake refs and raw SHA are exact
AND visual_report == READY_FOR_ENABLEMENT_EVALUATION
AND e2e_report == READY_FOR_ENABLEMENT_EVALUATION
AND performance_report == READY_FOR_ENABLEMENT_EVALUATION
AND recovery_report == READY_FOR_ENABLEMENT_EVALUATION
AND enablement_candidate.status == READY_FOR_ACTIVATION
AND candidate.proposed_enabled_capability_ids == all candidate PASSED ids
AND candidate.production_gate == DISABLED + []
AND manifest.production_gate == DISABLED + []
AND candidate four report refs == manifest matching report refs == report matching report refs
AND source_build deep-equals Visual/E2E/Performance/Recovery target source build
AND source_build.dirty_before_build == false
AND dependency_locks all raw SHA matched
AND web_dist observed tree SHA == manifest web_dist tree SHA
AND JAR observed SHA == manifest local_runtime_jar_ref.sha256
AND installed payloads == bundle_content entries
AND release ZIP raw SHA matched
AND environment.valid == true
AND environment_fingerprint == sha256(jcs(environment.discrete_fields))
AND smoke_catalog.case_count == 6
AND lane_count == 2
AND observed_attempt_count == 12
AND pass_matched_count == 12
AND failed_count == 0
AND every(lane.case_results ordered exactly as smoke_catalog)
AND every(lane.install_root_was_empty == true)
AND every(lane.storage_root_was_empty == true)
AND every(lane.browser_profile_was_empty == true)
AND every(case.status == PASS_MATCHED)
AND every(case.duration_us <= case.threshold_us)
AND every(REOPEN identity/digests == same-lane OPEN identity/digests)
AND every(EXIT sqlite_quick_check == OK)
AND every(EXIT foreign_key_check_count == 0)
AND external_request_count == 0
AND production_gate_mutation_count == 0
AND production_gate before/during/after == DISABLED + []
AND skipped_count == 0
AND retry_count == 0
AND failures.length == 0
```

`GATE-06-06` 关闭还要求两个 Schema、Manifest 和 Report raw SHA 完整，`release:canvas06:verify --require-ready` 返回 `0`。任何输入或 smoke BLOCKED 时禁止调用 Activation；修复后必须生成新 Manifest、重新执行两个 clean lane 和生成新 Report，不能原地改状态。

- [x] Manifest/Report Schema identity、路径、命令、ZIP/JAR/Web dist/lockfile/environment 字段已冻结。
- [x] `6` 个 case、`2` 个 lane、`12` 条 attempt、阈值、20 个失败码和 READY 算法已冻结。
- [x] Candidate 必须 READY、production gate 全程 disabled、Activation 必须引用 exact READY Report 的边界已冻结。
- [ ] Release Schema、bundle builder、static Web packaging、smoke runner、reporter 和 verifier 已实现并通过正反例。
- [ ] exact release ZIP 的 `6/6` case、`12/12` attempt 实际通过，Manifest/Report raw SHA 已冻结。
- [ ] exact Candidate + exact READY Report 已由 `GATE-06-02 activate` 消费；当前不得勾选或声称生产 enabled。

## GATE-06-06 设计冻结结论

1. `GATE-06-06` 设计输入已达到 `FROZEN`；机器 Schema、release ZIP、production static packaging、runner、Report、CI 和 Activation 仍为 `BLOCKED`。
2. `GATE-06-01~06` 现已全部完成设计冻结，DEV-CANVAS-06 可以按 Gate 顺序进入实现；任何 FROZEN 状态都不能替代实际机器报告。
3. 本轮没有构建、安装、启动或发布应用，没有执行 smoke，没有生成 Candidate/Activation/Rollback，也没有改变 production gate。
4. 完整画布的产品发布证据与 ISO 19450:2024 Conformance Suite 是两条独立证据链；前者 READY 不能推出后者符合。
