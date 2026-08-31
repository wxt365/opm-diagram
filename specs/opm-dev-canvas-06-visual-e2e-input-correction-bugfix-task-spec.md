# Spec: DEV-CANVAS-06 Visual/E2E 输入契约修正

文档状态：`FROZEN`

冻结日期：`2026-08-03`

当前适用性：Visual `0.2`、Golden Authoring join和bundle class规则继续有效；本文关于E2E保持`0.1/0.1.0`的决定已被`opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md`及`opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md`取代。活动E2E唯一版本为`0.2/0.2.0`，本文旧E2E段落只作历史设计记录。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与复现

当前活动文档同时存在两个不兼容目标：

1. 历史 `opm-dev-canvas-06-visual-e2e-input-implementation-task-spec.md` 要求一个合并 builder 生成 Visual/E2E Manifest `0.1`；
2. `GOLDEN-AUTHORING-05` 已把生产 Visual Manifest 冻结为 `schema_version=0.2`、`manifest_version=0.2.0`，并要求绑定 approved Golden Authoring provenance；
3. E2E Manifest 不消费 approved PNG、Golden Environment、Authoring Report 或 Materialization Report，但现有活动入口没有明确其版本是否随 Visual 升级；
4. 受控测试输入和生产 Handoff Evidence Bundle 没有独立 class、根目录和拒绝互用规则，Schema-valid 的受控 Manifest 存在被误当作生产证据的风险。

最小复现条件是：实现人员同时读取上述两个 implementation spec 时，无法唯一决定 builder owner、Visual/E2E 输出版本、`--approved-version-root` 的适用对象以及可消费的 bundle 根。

## 2. 目标

1. 冻结 Visual 与 E2E 为两个独立 builder owner，一次调用只能生成一类 Manifest；
2. 冻结生产 Visual Manifest 唯一版本为 `0.2/0.2.0`，E2E Manifest 保持 `0.1/0.1.0`；
3. 冻结 Visual Manifest 对 approved version、Authoring Report、Approval Record、Golden Environment、Capture Plan 和 130 份 Materialization Report 的 exact join；
4. 冻结 `CONTROLLED_TEST` 与 `PRODUCTION_HANDOFF` 两类输入 bundle 的目录、身份、CLI 和禁止互用规则；
5. 将旧 Visual/E2E `0.1` 合并 builder 规格降级为历史版本，消除两个活动 builder 目标并存。

## 3. 修改边界

### 3.1 允许修改

- 本规格及对应 checklist；
- 历史 Visual/E2E 输入 implementation spec/checklist 的状态和替代指针；
- Visual Manifest `0.2` implementation spec/checklist；
- Golden Authoring、DEV-CANVAS-06 release checklist、测试策略、开发执行包、文档索引和冻结基线中的必要入口与口径；
- 仅用于冻结未来实现的命令、目录、字段和验收说明。

### 3.2 禁止修改

- `apps/**`、`services/**`、`scripts/**`、`tests/**`、`packages/**`、`package.json`；
- `docs/contracts/**`、OpenAPI、SQLite DDL、Profile、Rule、Grammar、Symbol 和 Handoff；
- 任一 builder/verifier、bundle、Manifest、Report、approved golden、Candidate、Activation 或 production gate；
- `.harness/**` 和用户并行实现。

## 4. Builder owner 与版本冻结

### 4.1 唯一 owner

| 入口 | 唯一职责 | 唯一输出 | 禁止输出 |
| --- | --- | --- | --- |
| `scripts/release-canvas06-visual-manifest-v02.mjs` | 构建并原子提交 Visual Manifest | `OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001/0.2`、`manifest_version=0.2.0`、`generator_identity.runner_version=0.2.0` | Visual `0.1`、E2E Manifest、Report、golden |
| `scripts/release-canvas06-e2e-manifest-v01.mjs` | 构建并原子提交 E2E Manifest | `OPM-DEV-CANVAS-06-E2E-MANIFEST-001/0.1`、`manifest_version=0.1.0`、`generator_identity.runner_version=0.1.0` | Visual Manifest、E2E `0.2`、Report、golden |

两个入口可以复用无写权限的 exact-ref、安全解包和 bundle-class 校验库，但共享库不得选择输出类型、写 Manifest 或根据输入自动降级版本。原 `scripts/release-canvas06-visual-e2e-manifest.mjs` 仅是历史目标，禁止创建、恢复或作为活动入口。

### 4.2 E2E 保持 0.1 的决定

E2E Manifest 保持 `0.1/0.1.0`，不随 Visual 升级。理由是 E2E 不消费 approved PNG、Golden Environment、Golden Authoring Report、Approval Record、Capture Plan 或 Materialization Report；本修正没有改变 E2E Manifest 的字段、case 矩阵或交易断言语义。未来只有 E2E 自身字段或行为发生不兼容变化时，才允许通过独立设计变更升版。

E2E builder 必须拒绝 `--approved-version-root`、`--golden-authoring-report`、`--golden-environment`、`--capture-plan` 和 `--materialization-root` 参数。Visual 的 golden provenance 不得进入 E2E Manifest `0.1`。E2E builder 的完整 CLI、controlled archive/Catalog/fixture 布局、逐字段 ref 映射和单一 final transaction root 由 `opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-task-spec.md` 唯一细化；本规格不维护第二套参数或目录。

## 5. Visual approved exact join

Visual builder 必须接收一个显式、不可变、非 symlink 的：

```text
--approved-version-root <approved-root>/versions/<golden-set-version>
```

写任何目标或临时 Manifest bytes 前，按以下顺序完成全部守卫：

1. `<golden-set-version>` 是合法 SemVer，目录 basename 与最终 Authoring Report、Approval Record 及 Visual Manifest 的 `golden_set_version` 完全相等；禁止 `approved/` 父目录、`latest`、current pointer、candidate root、目录扫描或自动选择最高版本。
2. `golden_authoring_report_ref` 必须 exact 指向该 root 的 `authoring-report.json`，raw `path/byte_length/sha256` 可复算；文件身份固定为 `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001/0.2`、`report_version=0.2.0`、`report_status=APPROVED_PUBLISHED`、`failures=[]`。
3. Report 的 `approval_record_ref` 与 Manifest 的 `golden_approval_record_ref` 必须 exact 指向该 root 的 `approval-record.json`；Approval 身份固定为 `OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001/0.2`、`record_version=0.2.0`、`approval_status=APPROVED`，其 `approved_output_path=versions/<golden-set-version>`。
4. Report 的 `golden_environment_ref` 必须 exact 指向该 root 的 `golden-environment.json`；Environment 身份固定为 `OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001/0.2`。Approval 的 `authored_golden_environment_ref` 必须与该文件 raw SHA 相等，Report、Approval 和 Environment 的 fingerprint、PNG、blank、font refs 必须深度相等。
5. Report、Approval 和 Manifest 的 `capture_plan_ref` 必须 exact 指向该 root 的 `capture-plan.json`；Plan 身份固定为 `OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001/0.1`、`plan_version=0.1.0`、`plan_status=READY_FOR_AUTHORING`。Plan 的 `capture_set_sha256` 必须按固定顺序从 `captures[]` 独立复算，并与三方字段相等。
6. Report 与 Approval 的 `fixture_materialization_report_refs[]` 必须恰有 `130` 项、按 `fixture_ref_key` 字典序完全相等，每项 exact 指向 `materialization/reports/<fixture-ref-key>.json`，且 Report 身份为 `OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001/0.1`、`report_version=0.1.0`、`report_status=MATERIALIZED`。
7. 每份 Materialization Report 的 `capture_plan_ref/evidence_bundle_ref/source_fixture_ref/runtime_binding/fixture_identity/target_storage.database_ref/semantic_state_sha256` 必须与 Plan、approved database ref 和 Authoring/Approval 对应条目闭合；130 个 database 均位于 `materialization/fixtures/**/project.db`，raw SHA、`fixture_materialization_set_sha256` 和 `fixture_database_set_sha256` 独立复算相等。
8. Visual Manifest 的八个 provenance 字段 `golden_authoring_report_ref/golden_approval_record_ref/golden_set_version/golden_set_sha256/capture_plan_ref/capture_set_sha256/fixture_materialization_set_sha256/fixture_database_set_sha256` 必须逐值等于上述 exact 输入；既有 `golden_environment_ref` 继续必填且 exact 相等。
9. approved root 必须通过 Golden Verifier `--require-approved`；缺失、额外、临时文件、symlink、路径逃逸、版本、顺序、数量或任一 SHA 不匹配时，Visual Manifest 目标和临时文件均为零输出。

Visual builder 不允许从文件名推测 ref、不允许重写 approved bytes、不允许复制 candidate 内容补洞，也不允许只验证 Schema 而跳过 transitive join。

## 6. Bundle class、根目录与身份

### 6.1 强制模式

Visual/E2E builder 都必须显式接收且只接受一个：

```text
--input-mode CONTROLLED_TEST
--input-mode PRODUCTION_HANDOFF
```

缺失、未知、同时传入或由路径自动推断模式均固定拒绝。模式不新增 Manifest 字段；它由 CLI、输入根、受控 descriptor、既有 `handoff_ref`、`upstream_input_refs[]` 和 `input_materialization.bundle_ref` 联合证明。

### 6.2 `CONTROLLED_TEST`

受控 bundle 唯一只读根为：

```text
tests/e2e/release/dev-canvas-06/bundles/controlled/<controlled-bundle-id>/
```

`<controlled-bundle-id>` 固定为 `canvas06-controlled-<bundle-identity-sha256>`。根内必须存在 `controlled-bundle.json`，其封闭身份包含：

```text
schema_id=OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001
schema_version=0.1
bundle_class=CONTROLLED_TEST
bundle_id=canvas06-controlled-<bundle-identity-sha256>
bundle_identity_sha256
handoff_ref
intake_report_ref
evidence_bundle_ref
approved_version_ref
```

descriptor 的机器 Schema 路径固定为 `docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json`，身份为 `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1`；由后续 builder 实现任务创建，本设计任务不创建 Schema。`approved_version_ref` 必须列入 Schema `required`，值类型固定为封闭 `{path,golden_set_version,authoring_report_ref}` 或 JSON `null`；禁止字段缺失。对象中的 path 相对受控 bundle root。

`bundle_identity_sha256=sha256(JCS({bundle_class,handoff_ref,intake_report_ref,evidence_bundle_ref,approved_version_ref}))`；目录 basename、`bundle_id` 与该 digest 必须三方相等，`evidence_bundle_ref.sha256` 必须等于 raw archive SHA。Visual 受控 bundle 的 `approved_version_ref` 必须为对象并闭合第 5 章；E2E 受控 bundle 的 `approved_version_ref` 必须显式为 `null`，E2E builder 不读取 golden ref。一个 descriptor 不得同时供 Visual 和 E2E 使用；即使其他 refs 相同，也必须分别生成对象版与 `null` 版 descriptor，并因 identity payload 不同得到两个不同 `bundle_id`。字段缺失、Visual 为 `null` 或 E2E 为对象均属于非法 descriptor，固定退出 `2`，目标与临时文件零输出。Visual 受控物化只能写入调用方提供的 fresh `<controlled_output_root>/dev-canvas-06/inputs/controlled/<controlled-bundle-id>/`。E2E 受控构建不得创建该独立物化根，只能在 fresh `<controlled_output_root>/dev-canvas-06/e2e/manifests/<manifest-id>/` 的同父 staging root 内生成 Manifest、build/raw copy、archive materialization、Common 和 driver，最后单次目录原子提交。两者都不得写 production evidence root。受控 Manifest 只用于正反、故障和 determinism 测试，不构成 Gate、Candidate 或 release evidence。

### 6.3 `PRODUCTION_HANDOFF`

生产输入只能来自外部只读：

```text
<handoff_bundle_root>/<handoff-ref.path>
```

builder 必须从 READY Intake -> exact Handoff -> `HANDOFF_EVIDENCE_BUNDLE` ref 取得 archive，并先复算原始 `path/byte_length/sha256`。Visual builder 再安全物化到唯一 fresh 根：

```text
<evidence_output_root>/dev-canvas-06/inputs/production/<bundle-sha256>/
```

E2E builder 不得提交上述独立 production input root；它必须把clean build副本、Intake、Handoff、Evidence Bundle raw copy、allowlisted archive entries、Common Fixture 和 driver 全部写入 `<evidence_output_root>/dev-canvas-06/e2e/manifests/<manifest-id>/inputs/**` 的同一 staging root，并与 E2E Manifest `0.1` 单次目录原子提交。生产身份 payload 固定为 `{bundle_class=PRODUCTION_HANDOFF,intake_report_ref,handoff_ref,evidence_bundle_ref}`，`bundle_identity_sha256=sha256(JCS(payload))`、`bundle_id=canvas06-production-<bundle-identity-sha256>`；Visual 物化目录中的 `<bundle-sha256>` 仍等于 Handoff Evidence Bundle raw SHA，E2E final root 内 raw archive ref 也必须保持该 SHA，不得用 identity digest 替代 archive digest。生产模式不接受本地 sidecar 替代 Intake/Handoff 信任链，也不接受路径相同但 raw SHA、byte length、archive entry identity 或 bundle identity 不同的 source-tree 文件。

### 6.4 禁止互用

以下任一情况必须在写 Manifest bytes 前拒绝：

1. `PRODUCTION_HANDOFF` 读取 `tests/e2e/release/dev-canvas-06/bundles/controlled/**` 或 `controlled-bundle.json`；
2. `CONTROLLED_TEST` 写入 `<evidence_output_root>/dev-canvas-06/inputs/production/**`、production Visual/E2E Manifest/Report 目录或 production gate；
3. `canvas06-controlled-*` 与 `canvas06-production-*` 前缀、descriptor `bundle_class`、CLI 模式或 root class 不一致；
4. 同一 `bundle_id` 跨 class 复用，或只改 class/path 而复用未重新计算的 identity；
5. 使用受控 Bundle 生成 production Visual/E2E Manifest、Report、Candidate、Activation 或 release evidence；
6. 将受控 Manifest 传给 `--require-ready`、`--require-production` 或后续 Candidate builder；
7. production Visual 使用受控 approved version，或 E2E 通过任何 approved/golden 参数绕过其 `0.1` 输入边界。
8. `controlled-bundle.json` 缺少 `approved_version_ref`，或其对象/`null` 取值与 Visual/E2E builder 不匹配。

## 7. 命令、事务与稳定失败

活动命令冻结为：

```text
npm run release:canvas06:visual:manifest -- --input-mode <mode> ... --approved-version-root <exact-version> --out <visual-manifest>
npm run release:canvas06:visual:manifest:verify -- --input-mode <mode> ... --manifest <visual-manifest> [--require-production]
npm run release:canvas06:e2e:manifest -- --input-mode <mode> ... --out <e2e-manifest>
npm run release:canvas06:e2e:manifest:verify -- --input-mode <mode> ... --manifest <e2e-manifest> [--require-production]
```

每次调用只允许一个 `--out`，目标必须 fresh。Visual builder 固定执行：参数/模式 -> bundle trust -> safe materialization -> upstream exact join -> approved exact join -> Manifest 构造 -> Schema + semantic verify -> fsync -> atomic rename。E2E builder 固定执行：参数/模式 -> bundle trust -> source/Common/driver preflight -> archive safety + exact join -> 在 final root 同父目录创建唯一 staging root -> build/raw copy/archive materialization/Common/driver/Manifest 全部写入 staging -> Schema + semantic verify -> fsync -> 单次目录 atomic rename。任一失败停止后续阶段并只清理本次 staging；E2E final transaction root 必须零输出，只读输入和 approved root 永不修改。

退出码沿用 DEV-CANVAS-06：`2=参数/Schema/ref/root/class 非法`、`3=结构合法但 exact join/审批/状态不可消费`、`4=I/O 或内部错误`。Manifest 不提供 `BLOCKED` 状态，禁止用部分输出表达失败。

## 8. Root Cause

旧实现规格把公共 fixture、Visual Manifest 和 E2E Manifest 放入同一个 `0.1` builder 切片；后续 Visual Golden Authoring 升为 `0.2` 时只新增了 Visual implementation spec，没有同时撤销旧 builder owner、冻结 E2E 版本决定和输入 bundle class，导致设计入口出现双重授权。

## 9. Fix Strategy

1. 用本规格成为 Visual/E2E builder 版本和输入 class 的唯一活动修正规则；
2. Visual `0.2` implementation spec 继续承接 Visual builder/verifier，实现时必须消费本规格；
3. E2E 保持 `0.1`，后续 builder 实现只消费本规格和 DEV-CANVAS-06 E2E 契约；
4. 旧合并 implementation spec/checklist 标记 `HISTORICAL/SUPERSEDED`，只保留 Common Fixture 已实现快照；
5. 所有 production verifier 和 Candidate consumer 增加 class/root/identity 拒绝规则，受控测试永不提升 Gate 状态。

## 10. 验收标准

1. 活动文档中 Visual builder 只有 `0.2/0.2.0` 一个输出目标；
2. E2E `0.1/0.1.0` 的保留决定、理由和禁止 golden 参数已明确；
3. Visual approved exact join 覆盖 Report、Approval、Environment、Plan、130 Report/database 和八个 provenance 字段；
4. 两类 bundle 的 class、ID 算法、descriptor Schema identity、`approved_version_ref` 必填联合类型、source/output root、CLI 和八项互用拒绝已冻结；
5. 旧合并 builder 规格/checklist 明确为历史，不能继续领取未完成 Build 项；
6. E2E `0.1` 的完整 CLI、controlled Catalog/fixture 布局、逐字段 ref 映射、单一 final transaction root 和零输出事务有唯一实现规格；
7. 本规格与 Visual 0.2 spec、DEV-CANVAS-06、测试策略、执行包、索引和冻结基线无版本或 owner 冲突；
8. 文档相对链接、代码围栏、术语搜索和 `git diff --check` 通过。

## 11. 验证方式

1. 搜索全部 Visual/E2E Manifest spec、checklist 和 builder 命令，确认唯一活动版本与 owner；
2. 对照 Visual `0.2`、E2E `0.1`、Authoring Report `0.2`、Approval `0.2`、Environment `0.2`、Plan `0.1` 和 Materialization Report `0.1` Schema identity；
3. 人工核对 exact join 数量、顺序、路径、SHA 和失败零输出边界；
4. 检查 Markdown 相对链接与代码围栏；
5. 执行 `git diff --check`。

本轮只修改文档，不执行 builder、Schema、单元、E2E 或 release 测试；这些验证属于后续实现任务。

## 12. 兼容与回滚

- Visual Manifest `0.1` Schema 文件保留为历史读取/fixture 资产，但任何活动或 production builder/verifier 不得输出或接受它；
- E2E Manifest `0.1` 保持兼容，不新增 provenance 或 bundle-class 字段；
- 本任务不修改 Schema、API、SQLite、配置或依赖；
- 回滚只回退本任务文档增量。回滚会恢复双 builder 目标和 bundle 身份歧义，因此全局设计门必须回到 `BLOCKED_BY_DESIGN`，不得静默恢复旧 `0.1` Visual builder。

## 13. 事实与假设

### 13.1 事实

1. 当前 Visual Manifest `0.2`、E2E Manifest `0.1` 和 controlled bundle descriptor Schema 已存在，controlled bundle verifier 已实现；Visual/E2E Manifest builder 尚未实现；
2. Golden Authoring `v1.4` 与 Visual Common Materialization `v1.5`及03C Adapter/Fault闭包已冻结 Visual approved 消费守卫、Common空Text Artifact、index/UI/43文件root、四份adapter机器Schema、独立one-shot fault及JCS owner/parity边界；真实 approved version、Visual/E2E production Manifest/Report 和 `GATE-06-03 READY` 尚不存在；
3. 当前仓库只有公共 Visual/E2E fixture root，没有本规格冻结的受控 bundle root；
4. 本规格不生成 Candidate、Activation，不启用 Capability，也不构成 ISO 19450:2024 符合性证据。

### 13.2 假设

无。
