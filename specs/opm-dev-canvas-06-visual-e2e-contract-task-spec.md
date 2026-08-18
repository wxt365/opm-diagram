# Spec: DEV-CANVAS-06 Visual/E2E 可执行输入闭包

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景

`GATE-06-03 Visual/E2E Closure` 已冻结 `378/756` Visual、`194/388` E2E、环境、失败分类和 READY 算法，但对当前 exact Handoff/Symbol/Golden 资产做实施前映射后，发现现有设计不能无猜测地生成 Manifest：

1. exact Symbol Catalog 对 34 个 Capability 各只有一个扁平 symbol 条目，没有 `descriptor_id/version`、受控 `visual_variant_key` 或 variant 列表；
2. Visual case 把 `fixture_ref/expected_revision/expected_cells` 放在 case 层，但一个 Capability case 需要展开多个 variant capture，无法给每个 variant 绑定不同 fixture；
3. 8 个公共 Visual 与 16 个公共 E2E 只有场景描述，没有版本化 fixture/factory、步骤和 expected transaction 机器输入；
4. 130 个 PASS family case 的 transaction 只存在于 Golden Replay Report，48 个 BLOCKED 同时存在于 Golden Manifest/Replay；尚未冻结 Coverage -> Golden Manifest -> Golden Replay 的 exact join；
5. family fixture 位于 Handoff exact evidence bundle 内，普通 `path + byte_length + sha256` 无法表示 archive entry，安全解包与 evidence-root 物化规则未冻结。

在这些输入关闭前直接写 Schema/runner，会迫使开发人员猜测 variant、fixture、focus、transaction 或 archive 语义，违反冻结约束。

## 2. 目标

1. 把上述缺口写入 `GATE-06-03` 唯一实施口径，撤销缺少 exact mapping 时的旧冻结结论，并按补齐后的契约重新冻结；
2. 冻结不修改 Profile binding 的闭包方案：以 exact Symbol 主 descriptor 为基线，并通过 exact Coverage/Golden Manifest/Golden Replay 三表 join 派生 family Visual/E2E 输入；
3. 冻结 Visual variant 级 fixture 字段、固定数量和排序；
4. 冻结 Handoff evidence bundle 的安全解包、物化路径和 raw SHA 继承规则；
5. 冻结公共 fixture/factory catalog 必须提供的字段、步骤与事务边界；
6. 明确进入六个输入/输出 Schema、manifest builder、runner、reporter、verifier Build 的 P0 门槛。

## 3. 非目标

- 不创建四个 Manifest/Report Schema、Common Fixture Schema 或 Golden Environment Schema；
- 不实现 manifest builder、runner、reporter、verifier 或 release Playwright 配置；
- 不创建或更新 golden PNG、blank baseline、fixture/factory 代码或 attempt evidence；
- 不修改 Profile/Rule/Grammar/Symbol 资产及其版本、digest、package manifest；
- 不重新生成 DEV-CANVAS-05 Handoff/Intake，不生成 Candidate/Activation/Rollback；
- 不启用 Capability，不宣称发布通过或 ISO 19450:2024 符合性。

## 4. 修改边界

允许修改：

- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/design/opm-test-strategy.md`；
- 本规格和对应 checklist。

禁止修改：

- `.harness/**`、`docs/contracts/**`、`scripts/**`、`package.json`；
- `apps/**`、`services/**`、`tests/e2e/**`、`tests/performance/**`、`tests/recovery/**`；
- `packages/**`、`reference/**`、SQLite、OpenAPI 和任何现有机器证据。

Schema/API/配置/代码/测试均不修改；本轮是实现前设计输入闭包，无需执行代码测试。

## 5. 设计输入基线

### 顶层与模块设计

- 顶层 Gate/发布边界：`specs/opm-dev-canvas-06-toolchain-release-task-spec.md`；
- 唯一执行契约：`docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md` 的 `GATE-06-03`；
- 测试分层与发布证据边界：`docs/design/opm-test-strategy.md`。

### 上游机器输入

- DEV-CANVAS-05 Handoff：34 Capability、178 coverage key、exact evidence bundle 与 active binding；
- Coverage Catalog：178 个 `coverage_key/case_id/capability_id/variant_key/expectation`；
- Golden Manifest：178 个 family fixture、PASS expected projection、BLOCKED expected transaction；
- Golden Replay Report：178 个 case 的两次 matched attempt 与 exact transaction；
- Symbol Catalog：34 个 Capability 主 symbol descriptor 的当前扁平开发基线。

### 缺口处理

- 不修改不可变 Profile asset 来补 variant；由 GATE-06-03 release Manifest 对 exact upstream 三表做可复算派生，并显式保存所有原始 ref/SHA；
- 公共场景没有可派生的上游 fixture，必须由后续独立实现分包新增版本化 release fixture/factory catalog；
- 本规格只关闭设计字段与算法，不把尚未存在的机器资产标记为完成。

## 6. 冻结方案

### 6.1 Family Visual variant 派生

1. 以 READY Intake 的 `capability_intake[34]` 为 Capability 顺序，按 `PROCEDURAL -> CONTROL -> STRUCTURAL`、ID 升序；
2. 对每个 Capability，读取 Handoff exact Coverage Catalog 中 `expectation=PASS` 的 requirement，并按 `coverage_key` 字典序排序；
3. 使用 `(capability_id, case_id, variant_key, expectation)` 与 exact Golden Manifest 做一对一 join；使用 `case_id` 与 exact Golden Replay Report 做一对一 join；任一缺项、重复或字段不等即 BLOCKED；
4. `visual_variant_key` 固定等于完整 `coverage_key`，不得只用可能跨 Capability 重复的短 `variant_key`；
5. 当前 exact 基线固定为 `130` 个 family visual variant：Procedural `16`、Control `20`、Structural `94`；每个 Capability 仍只有 9 个 viewport/zoom case；
6. family capture 数固定为 `130*3*3=1170`，加 72 个公共 capture 后 `capture_count=1242`，两次 attempt 后 `attempt_capture_count=2484`。

Visual case 字段修正为：

```text
case_id, case_kind, capability_id?, subject_id?, viewport_id, zoom_id,
variant_captures[]
```

每个 `variant_captures[]` 独立包含：

```text
visual_variant_key, capture_id, fixture_ref, expected_revision,
focus_target_id, focus_anchor, expected_cells,
golden_ref, critical_regions[]
```

不得把多个上游 fixture 的 `fixture_ref/expected_revision/expected_cells` 提升到 case 层。

### 6.2 Family fixture 与 focus 派生

1. `fixture_ref` 取 Golden Manifest 的 `input_revision_fixture` 在 exact evidence bundle 中的物化 bytes；`expected_revision` 取该 Revision 的 `revision_id`；
2. `expected_cells` 等于 fixture 中目标 Context 的 visible `occurrences.length`，不得从截图观察值反填；
3. `focus_target_id` 是 `target_kind=FACT && target_id=expected_normalized_fact.fact_id` 的唯一 Occurrence ID；不存在或不唯一即 BLOCKED；
4. `focus_anchor` 按以下优先级派生：有 junction -> `JUNCTION`；有 annotation/completeness/label slot -> `LABEL`；仅 target marker -> `TARGET`；仅 source marker -> `SOURCE`；其余 -> `CENTER`；
5. `critical_regions[]` 至少包含 `FOCUS_BBOX`，再按 expected projection 非空字段精确加入 `SOURCE_MARKER/TARGET_MARKER/JUNCTION_MARKER/ANNOTATION/COMPLETENESS/LABEL_SLOT:<id>`；
6. 以上派生字段和上游 expected projection canonical SHA 必须写入 Manifest，verifier 独立重算。

### 6.3 Family E2E join

1. 178 个 case 以 Coverage Catalog 为主表，`case_id` 一对一 join Golden Manifest 和 Golden Replay Report；
2. `fixture_ref/input_ref` 分别取 Golden Manifest 的 `base_revision_fixture/input_revision_fixture` exact materialized ref；
3. `expected_transaction` 取 Golden Replay 两次 attempt 完全相等的 `transaction`；BLOCKED case 还必须与 Golden Manifest 的 `expected_transaction` 深度相等；
4. PASS 两次 replay 必须均为 `PASS_MATCHED`，BLOCKED 两次均为 `BLOCKED_MATCHED`；状态、error code、transaction 或 artifact/trace 守卫不一致即 Manifest 构建 BLOCKED；
5. family assertion ID 固定：PASS 为 `REVISION_COMMITTED/PROJECTION_MATCHED/TEXT_TRACE_MATCHED/TRANSACTION_MATCHED/REOPEN_MATCHED`；BLOCKED 为 `ERROR_CODE_MATCHED/TRANSACTION_ZERO/HEAD_UNCHANGED/PROJECTION_UNCHANGED/REOPEN_MATCHED`。

### 6.4 Evidence bundle 安全物化

1. builder 先校验 Handoff 中 `EVIDENCE_BUNDLE` 的 path、byte length、raw SHA；
2. 只允许通过 fixed Java 21 `${JAVA_HOME}/bin/jar` 列表与解包到新建的 evidence-root 临时目录；列表中绝对路径、`..`、重复 entry、symlink 或大小/数量超限立即 BLOCKED；
3. 只物化 Manifest 引用的 fixture、Coverage、Golden Manifest/Replay 和 Symbol bytes 到 `<evidence_output_root>/dev-canvas-06/inputs/upstream/**`，禁止写回 source/handoff root；
4. 每个物化文件使用排他创建并记录 `path + byte_length + sha256 + bundle_ref.sha256 + archive_entry_path`；普通 file ref 不得伪装成 archive entry ref；
5. verifier 重新校验物化 bytes、archive entry path、bundle raw SHA 和引用闭包。

### 6.5 公共 fixture/factory catalog

> 历史适用边界：本节记录首轮Common Catalog `0.1.0`设计输入，保留用于解释既有历史Catalog，不再是活动02B Builder目标。当前机器Schema仍为`0.1`，活动完整Catalog固定为`catalog_version=0.2.0`，并由Visual Common Materialization `v1.4`承接五类index、8类UI step和43文件self-contained root；历史`0.1.0`不得覆盖或供新semantic verifier接受。

本规格冻结时的后续实现必须新增唯一版本化 catalog：

```text
tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json
```

对应 Schema 固定为 `docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json`。catalog identity 固定为 `OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001/0.1`，必须封闭包含：

```text
catalog_id, catalog_version, generated_at, generator_ref,
source_binding, visual_subjects[8], e2e_cases[16], summary
```

`catalog_id` 的唯一派生公式固定为：

```text
catalog_id = "dev-canvas-06.common-fixtures." + source_binding.binding_digest[0:12]
catalog_version = "0.1.0"
```

`catalog_id` 标识binding域，不标识source commit，禁止使用包含Catalog自身bytes的source commit派生identity。同一`catalog_id + catalog_version`的内容必须不可变；fixture、factory、条目顺序或生成语义变化时必须发布新的`catalog_version`。

每个 Visual subject 必须包含 `subject_id/factory_id/factory_source_ref/fixture_ref/expected_revision/focus_target_id/focus_anchor/expected_cells/critical_regions[]`。每个 E2E common case 必须包含 `case_id/factory_id/factory_source_ref/base_fixture_ref/input_ref/actions[]/assertion_ids[]`；每个 action 显式包含 `action_id/expected_status/expected_error_code?/expected_transaction/reopen_checkpoint`。禁止由 runner 根据 observed 结果补 expected 值。

catalog 的 8/16 条目、所有 factory source SHA、生成 fixture SHA 和 action 顺序必须由 Manifest builder/verifier exact 校验。具体 fixture/factory 内容属于后续实现包，内容未落盘前 `GATE-06-03` 保持 BLOCKED。

### 6.6 Golden 路径与环境

1. Golden Environment `0.1` Schema 固定为 `docs/contracts/schemas/opm-dev-canvas-06-golden-environment.schema.json`，只保留历史输入；生产 Golden Environment 固定为后续 `docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json`。golden 路径固定为 `<golden-root>/<capture_id>.png`，blank baseline 固定为 `<golden-root>/blank/<viewport_id>.<zoom_id>.png`；
2. `<golden-root>/golden-environment.json` 必须封闭记录 Chromium/Playwright/OS/font/color/locale/timezone/scale 指纹及所有 PNG ref/SHA；
3. Manifest 只读取该 index，不扫描目录猜测 golden；缺项、额外项、SHA 或环境不一致均 BLOCKED；
4. golden index Schema、authoring 流程和变更审批属于后续独立分包，未实现前不得生成 READY Visual Manifest。

## 7. 进入 Build 的门槛

只有以下条件同时满足，才允许进入六个输入/输出 Schema/runner 实现：

1. 本规格第 6 节已同步到总 Spec、总 checklist 和测试策略；
2. Visual case/variant 字段层级、`130/1242/2484` 数量已无跨文档冲突；
3. Coverage/Golden Manifest/Replay join 和 bundle 物化算法已冻结；
4. common fixture catalog 与 golden environment index 的 identity、路径、字段和 owner 已冻结；
5. 总 checklist 明确区分“可执行输入设计契约已冻结”和“对应机器资产尚不存在、当前不可直接执行”。

即使满足上述门槛，真实 common fixtures、golden、release executor、Report 和 READY evidence 仍需后续实现和执行。

## 8. 验收与验证

1. 三份权威文档对 case/attempt/capture 数量、字段层级、join、archive 和公共输入口径完全一致；
2. 使用 `jq` 对当前 exact 资产复核：34 Capability、178 coverage、PASS 130、BLOCKED 48、PASS variant 无 `(capability_id,variant_key)` 重复；
3. 确认 Golden Manifest 178 个 family case 均有 base/input fixture，Golden Replay 178 个 case 均有两次 attempt；
4. 确认 Symbol Catalog 的现状限制被明确记录，未修改其 bytes/version/digest；
5. 限定文件 `git diff --check` 通过；纯文档任务无需执行代码测试。

## 9. Compatibility Impact

- API、SQLite、Profile binding、Handoff、Intake、Enablement：无变更；
- 发布顺序：新增 `common fixture catalog -> golden index -> 四 Schema/manifest builder -> release runner/report -> READY verifier` 前置顺序；
- 既有 dev E2E：语义不变，仍不能作为 release evidence。

## 10. 回滚

只回退本任务对总 Spec、总 checklist、测试策略、本规格和本 checklist 的文档增量，不改变任何机器资产、运行时数据或用户其他未提交改动。

## 11. 事实与假设

### 事实

1. 当前 exact Symbol Catalog 含 40 个 symbol 条目，其中 34 个带 Capability，但没有 visual variant 字段；
2. Coverage/Handoff coverage key 均为 178 且集合相等，PASS=130、BLOCKED=48；
3. Golden Manifest 的 178 个 case 均有 base/input fixture；130 个 PASS 没有 manifest-level expected transaction；
4. Golden Replay 提供全部 178 case 的两次 transaction，可作为 exact join 输入；
5. 当前无 common fixture catalog、golden environment index、六个 GATE-06-03 输入/输出 Schema 或真实 Report。

### 假设

无。当前结论只使用仓库内 exact 文件和可复算计数。
