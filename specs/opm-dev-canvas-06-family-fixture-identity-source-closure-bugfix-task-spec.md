# Spec: DEV-CANVAS-06 Family Fixture Identity 来源闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与最小复现

E2E Runner 要求 Family Materializer 把 Project/Model/Revision/Context identity 原样写入 fresh SQLite，并禁止生成业务 ID；但 exact `MS-REV-001/0.2` Family base fixture 只包含 `model_id/revision_id/revision_sequence/model_header.root_context_id`，不包含 `project_id`，且当前两个 base fixture 均合法省略可选的 `parent_revision_id`。E2E Manifest `0.1` 的 case 也没有 Project identity 字段。现有 Golden Fixture Materializer 使用 fixture raw SHA 派生 `project.golden.fixture.<sha256>`，该身份只属于 Golden Authoring 隔离库，不能冒充 E2E Family 原 Project identity。

最小复现为任取一个 Family case：Runner 只能取得 `case.fixture_ref` 和 fixture bytes，无法在“不生成、不派生、不默认”的约束下填写 `fixture-materialization.identity.project_id`，因此不能安全创建 Project/Model，也不能生成 Schema-valid attempt evidence。

同时，Attempt Artifact 设计允许把 11 类 artifact 的 `attempt_ordinal` 与“调度 ordinal”比较，但未冻结下游 producer 必须从同 attempt root 内已写入且验证通过的 `fault-plan.json` 读取该值。实现仍可能从目录名、循环下标或执行顺序反推 identity。

## 2. Root Cause

1. Revision 文档身份与项目容器身份被误写为同一来源；`MS-REV-001/0.2` 能证明 Model/Revision/Context，不能证明 Project。
2. Golden Authoring 的隔离 Project 派生算法被误认为可复用于 E2E 原身份；两者证据目的不同。
3. Fault Plan 已携带 `attempt_ordinal`，但现有设计只冻结跨 artifact 相等，没有冻结其作为 attempt 内唯一机器来源的读取顺序。
4. 先前 Artifact Schema 测试只验证字段存在、枚举和聚合，没有构造“fixture 无 project_id 且禁止派生”的身份来源反例。

## 3. 目标

1. 新增 Family Fixture Identity Catalog `0.1/0.1.0` Schema 和当前活动不可变输入；
2. 逐一绑定 Manifest 中 178 个 Family case 的 `fixture_ref` 深度去重集合，当前活动集合固定为 2 个 base Revision；
3. 冻结 `project_id` 只来自 Catalog，`model_id/context_id/base_revision/revision_sequence` 与 exact fixture bytes 深度一致，并把 fixture 中可选 `parent_revision_id` 的缺失唯一归一为 Catalog 的显式 `null`；
4. 冻结 `base_revision` 精确等于 fixture `revision_id`，不等于 `parent_revision_id`；
5. 保持 E2E Manifest Schema/identity `0.1` 不变，把 Catalog 作为 `fixture_refs[]` 中唯一 `kind=FAMILY_FIXTURE_IDENTITY_CATALOG` 的普通 raw `fileRef` 锁定；
6. 冻结 `fault-plan.json` 是 attempt 内 `attempt_ordinal` 的唯一机器来源及跨 artifact 首个 join 根；
7. 同步 Manifest Builder、E2E Runner、Attempt Artifact、执行契约修正入口、测试策略、开发执行包、总 checklist、冻结基线和文档索引。

## 4. 非目标

- 不实现或修改 Manifest Builder/Verifier、E2E Runner、Java Materializer、Reporter、driver、fault launcher 或 Runtime；
- 不修改 E2E Manifest `0.1`、Attempt Artifact `0.1`、E2E Report `0.2` 或 SQLite Schema；
- 不把 identity Catalog 填入 178 个 case，不复制 178 份相同身份；
- 不为 178 个 Family `input_ref` 建立 Project identity；input Revision 由浏览器动作消费，不作为 attempt base storage seed；
- 不复用 Recovery 的 `project.recovery.*` 或 Golden Authoring 的 `project.golden.fixture.*`；
- 不重建 Handoff/Evidence Bundle，不生成 controlled/production `194/388` Report，不提升 Gate、Candidate、Activation、Capability 或 ISO 状态。

## 5. 修改边界

允许修改：

- 本规格和对应 checklist；
- 新增 Family Fixture Identity Catalog Schema 与活动 Catalog JSON；
- E2E Manifest Builder 实现规格/checklist中的输入、输出布局、ref 映射和验收；
- E2E Runner 实现规格/checklist、Attempt Artifact设计、执行契约修正入口、测试策略、开发执行包、DEV-CANVAS-06总 checklist、冻结基线和`docs/README.md`的当前契约指针。

禁止修改：`.harness/**`、`services/**`、`scripts/**`、`tests/**`、`package.json`、Maven、现有 Schema、现有 fixture bytes、Handoff/Evidence Bundle、API、SQLite DDL、Vue、release evidence 和 production gate。

本任务不新增依赖或生产命令。设计验证使用现有 JSON Schema 依赖的只读一次性校验、`jq`、`rg`、链接检查和 `git diff --check`。

## 6. Fix Strategy

### 6.1 Catalog 与权威来源

唯一源文件：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-e2e-family-fixture-identity-catalog.json
```

唯一机器 Schema：

```text
docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json
schema_id=OPM-DEV-CANVAS-06-E2E-FAMILY-FIXTURE-IDENTITY-CATALOG-001
schema_version=0.1
catalog_version=0.1.0
```

每项固定字段为：

```text
fixture_sha256, project_id, model_id, context_id,
base_revision, revision_sequence, parent_revision_id
```

`entries[]` 按 `fixture_sha256` UTF-8 字典序严格升序，SHA、Project、`(model_id,base_revision)` 均唯一。当前活动 Catalog 恰为 2 项，对应两个 Family base fixture；任何 Catalog/Golden Manifest/fixture bytes 变化都必须升 Catalog 版本并重建 Handoff/Evidence Bundle，禁止原地覆盖 `0.1.0`。

```text
catalog_payload_sha256 = sha256(UTF8(JCS(Catalog根对象删除catalog_payload_sha256后)))
```

Catalog JSON固定为无BOM UTF-8、LF、一个结尾换行；raw file ref SHA始终计算原始文件bytes，不得与上述payload SHA互换。

### 6.2 Manifest raw ref 与集合闭包

Evidence Bundle 必须包含上述 Catalog 的 exact source bytes。Manifest Builder 在安全解包后逐 byte 写入：

```text
inputs/upstream/catalogs/family-fixture-identity-catalog.json
```

Manifest `fixture_refs[]` 固定为：

```text
sortUtf8By(path + NUL + sha256)(
  unique(cases[].fixture_ref + cases[].input_ref)
  + [family_fixture_identity_catalog_ref]
)
```

其中 Catalog ref 必须是普通 `fileRef`，`kind=FAMILY_FIXTURE_IDENTITY_CATALOG`，且在 `fixture_refs[]` 中恰有一项。原 E2E Manifest Schema `0.1` 已允许该封闭 `fileRef` 形状，不修改 Schema；兼容性变化只发生在活动 semantic contract，旧布局 Manifest 只读且不得进入当前 Runner。

Builder/verifier 必须从 178 个含 `capability_id` 的 Family case 提取 `fixture_ref`，按完整 ref 深度去重后得到当前 2 项；该 SHA 集合必须与 Catalog `entries[].fixture_sha256` 一一相等，无缺项、额外、重复或跨 SHA 复用。Common case、Family `input_ref` 和 Catalog ref 本身不得进入此 2 项集合。

### 6.3 Fixture 深度一致与持久化

对每个 Family base fixture，Materializer 在 SQLite 创建前按唯一顺序验证：

```text
Catalog raw ref -> Catalog Schema/payload -> fixture_ref raw SHA
-> MS-REV-001/0.2 Schema -> UTF-8/JSON -> identity deep join
-> active binding -> fresh storage -> migration/seed/verify
```

字段映射唯一为：

| Catalog | exact fixture |
| --- | --- |
| `fixture_sha256` | `sha256(raw fixture bytes)` |
| `model_id` | `fixture.model_id` 且等于 `fixture.model_header.model_id` |
| `context_id` | `fixture.model_header.root_context_id` |
| `base_revision` | `fixture.revision_id` |
| `revision_sequence` | `fixture.revision_sequence` |
| `parent_revision_id` | fixture 存在该字段时取其字符串值；字段缺失时唯一归一为显式 `null` |

`MS-REV-001/0.2` Schema 的 `parent_revision_id` 是可选字符串，不接受 fixture 内显式 `null`。因此 join 必须先完成 Revision Schema 验证，再按“存在则字符串、缺失则 `null`”生成封闭 Catalog/Artifact identity；禁止把 JavaScript `undefined`、字段缺失和 JSON `null` 当作三种可互换的 raw fixture 形状，也禁止要求修改既有 fixture bytes来满足 Catalog。

`project_id` 只取 Catalog 值。Materializer 禁止从 fixture SHA、model、case、path、目录、attempt、时间或随机数派生/默认 Project ID；禁止调用 Golden seed 的 Project 派生公式。两个 attempt 对同一 case 必须读取同一 Catalog entry并产生相同业务 identity、不同 storage path。

缺 Catalog ref、Catalog Schema/payload错误、集合不闭合、SHA不匹配、fixture深度不一致、Project重复冲突或使用禁止命名空间，均固定为 pre-acceptance `E2E_FIXTURE_MISMATCH/3`：稳定 stderr，SQLite、attempt materialization artifact和最终 Report root均不存在。

### 6.4 `attempt_ordinal` 唯一来源

1. Runner plan builder 是唯一允许从冻结调度矩阵 `(Manifest case, 1|2)` 取得 ordinal 的组件；
2. plan builder 必须先在同 attempt staging root 原子写入 `fault-plan.json`，再按固定文件名选择 Fault Plan root Schema，复算 `plan_sha256/artifact_payload_sha256`；
3. Materializer 必须通过 `--fault-plan <same-attempt-root/fault-plan.json>` 读取 `case_id/attempt_ordinal`，CLI 不提供 `--attempt-ordinal`，也不得读取目录名、循环下标或执行顺序；
4. `--case-id`、Manifest case、Fault Plan `case_id` 深度相等；Materializer 输出、其余 10 类 artifact 和 Report attempt 的 `attempt_ordinal` 均以已验证 Fault Plan 值为源并与冻结调度矩阵交叉校验；
5. verifier 对每个 attempt root 先验证 `fault-plan.json`，再验证其余 artifact。路径中的 `<attempt-ordinal>` 只用于定位和 containment 检查，不得反向填充或修正 JSON；
6. Fault Plan 缺失、未原子完成、Schema/SHA错误、值不为 `1|2`、与 schedule/case/root不一致时固定为 `E2E_INPUT_INVALID/2`，不得启动 Materializer/Runtime或写任何后续 artifact。

## 7. 验收标准

1. Catalog Schema 为 Draft 2020-12，所有 object 递归 `additionalProperties=false`；
2. 当前活动 Catalog 通过 Schema，恰为 2 项，raw SHA 与两个 Family base fixture精确一致；
3. Catalog 项的 Model/Context/Revision/sequence 与 fixture bytes 深度一致，`parent_revision_id` 按“存在则字符串、缺失则显式 `null`”归一后相等，Project 只来自 Catalog；
4. 178 个 Family `fixture_ref` 去重集合恰为 2 项，并与 Catalog SHA 集合相等；
5. Manifest `0.1` Schema bytes 不变，活动 semantic contract 要求 `fixture_refs[]` 唯一 Catalog raw ref和新排序/集合公式；
6. Runner CLI、Artifact设计和 verifier 顺序均冻结 Fault Plan 为 attempt ordinal唯一机器来源；
7. 错 SHA、缺/多 entry、重复 SHA/Project/Revision、Model/Context/Revision/parent归一值 drift、禁止 Project命名空间和 ordinal/path/schedule drift 均有明确拒绝边界；
8. 相关活动文档不再出现“Family Project 来自 fixture”或“可从调度/路径直接填充 artifact ordinal”的冲突表述；
9. JSON、Schema instance、相对链接、状态指针和`git diff --check`通过。

## 8. 验证与回滚

验证不运行产品构建或真实 E2E。执行 Catalog/Schema JSON parse、一次性 Draft 2020-12 instance 正反例、fixture SHA/字段/集合复算、受影响文档关键词和相对链接检查、`git diff --check`。

回滚只删除本任务新增规格/checklist/Schema/Catalog，并回退允许文档的本任务增量；不得覆盖工作树其他未提交修改、现有 fixture、Handoff、Evidence Bundle、用户 SQLite 或 evidence root。

## 9. 状态边界

设计修正完成后，Family Materializer 的身份来源和 attempt ordinal 来源达到 `FROZEN_FOR_IMPLEMENTATION`。现有 Handoff/Evidence Bundle 尚未携带 Catalog，Manifest Builder/Verifier 与 E2E Runner 尚未适配，因此实现状态保持 `CONTRACT_UPDATE_REQUIRED/BLOCKED_BY_DEPENDENCY`；不得继续执行真实 Family materialization，直到新 clean Handoff/Evidence Bundle、活动 Manifest 和对应实现验证全部完成。
