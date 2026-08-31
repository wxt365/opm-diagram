# DEV-CANVAS-06 Common Setup Plan 设计

文档版本：`v0.1`

文档状态：`FROZEN_FOR_IMPLEMENTATION`

适用版本：Common Fixture Catalog `0.2.0`、E2E Manifest `0.2/0.2.0`、Attempt Artifact `0.2`

## 1. 目的与边界

本设计为 Common 16 case 的 `M0 -> SETUP -> subject baseline` 提供唯一、可复核的正式 API 输入，并解除 Common Driver 编排设计 `v1.3` 的 `BLOCKED_BY_COMMON_SETUP_PLAN` 前置条件。

Plan 只定义 SETUP；不改变 Common case ID、`7 PASS + 9 BLOCKED` 矩阵、subject transaction、REOPEN、公共 HTTP wire、SQLite DDL、产品默认配置、Gate、Candidate、Activation 或 Capability 状态。

现有 Runtime 已正式读取 `CREATE_STATE.payload.state_id` 和完整 `CREATE_FACT.payload.fact_id`，但 OpenAPI 的两个完整 payload 漏写了这两个可选字段。本设计授权只把这两个既有可选字段补入 OpenAPI；不得改变路径、状态码、字段语义或 Runtime 行为。Common Plan 中这两个字段必须出现，以获得可复核的稳定 identity。

另一个已确认冲突是：`STATE_SUPPRESS` 会从 Projection 中移除 State occurrence，而旧 Common Driver 仍尝试点击该不可见 State。唯一修正是 `API-CTX-002.data` 增加只读 `suppressed_states` 清单，Object inspector 对其提供稳定的显式化按钮；画布仍不得渲染该 State。清单项只包含 `state_id/owner_ref/name_or_value/state_roles/explicitness`，不伪造 occurrence 或 layout。

## 2. 受控对象与输入根

唯一对象是 UTF-8、LF、末尾一个换行的 JSON 文件：

```text
schema_id      = OPM-DEV-CANVAS-06-E2E-COMMON-SETUP-PLAN-001
schema_version = 0.1
plan_version   = 0.1.0
logical path   = dev-canvas-06-common-setup-plan.json
kind           = COMMON_SETUP_PLAN
```

它与 Catalog、8 个 visual fixture、16 个 BASE/INPUT 和 factory mirror 一起构成活动 Common 输入根。因此活动输入根从 `43` 个 regular file 升为 `44` 个；历史 `0.1.0` 根保持只读。

Plan 由 Common input builder 以 active binding、Catalog 的 16 case 顺序和静态绑定的 `common-driver.mjs` source owner 生成，并在同一 staging tree 内由 verifier 复核。`generator_ref` 必须逐字段等于 Catalog 的 `generator_ref`，即指向根内既有 `sources/scripts/build-canvas06-common-visual-fixtures.mjs`，`kind=GENERATOR_SOURCE`。`common_driver_ref.path` 固定为 source-relative `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`；builder/verifier 只能通过静态 URL 定位该普通文件，禁止 CLI、环境变量、checkout 扫描或 fallback。

Manifest producer 只复制、引用和重新验证该 raw file；Runner 只接受 Manifest final root 中的同一 raw file，禁止 checkout、目录扫描、临时 JSON 或输入根外替代文件。跨容器 ref 使用唯一重写：Catalog `dev-canvas-06-common-fixture-catalog.json -> inputs/common/dev-canvas-06-common-fixture-catalog.json`，Driver `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs -> inputs/drivers/common-driver.mjs`。重写前后 `kind/byte_length/sha256` 必须相同；除此之外不得忽略或改写字段。

## 3. 动态候选与命令规则

`CREATE_ELEMENT` 的 payload 是静态模板。`CREATE_STATE` 和 `CREATE_FACT` 的 `capability_query_id`、`selected_option_id` 由当前 head 的 `API-EDT-001` 返回，不能写死在 Plan。

每个需要候选的步骤固定执行：

```text
读取当前 committed revision
-> API-EDT-001（Plan 指定 selection_id/intent/endpoints）
-> 以 Plan 的 option_selector 唯一匹配 enabled option
-> 用响应的 capability_query_id/option_id 填充 command_template
-> API-EDT-002
-> 仅接受 200 + meta.status=COMMITTED + meta.committed_revision
```

`option_selector` 是封闭对象，必须包含 `command_type`、`capability_id`、`target_ids`；`CREATE_STATE` 还必须有 `owner_target_kind=ELEMENT`，`CREATE_FACT` 还必须有 `fact_family`。候选响应必须恰有一个启用 option，且 command/capability/normalized endpoint identity 与 selector 逐项相等。零个或多个匹配项都是 `E2E_COMMON_SETUP_PLAN_INVALID`。

实际 `API-EDT-001` URL、响应原文、解析出的 option、实际 `API-EDT-002` JCS body、响应原文均写入 SETUP API exchange evidence。Plan 内只保存 request descriptor 与 command template 的 JCS digest，不把运行时 option 值伪装成固定 bytes。

## 4. 16 项初始状态闭包

每项按照 Catalog 精确顺序出现一次。相同 `initial_state` 的 Plan 语义和步骤数组必须 JCS 相同。

| initial_state | 有序正式命令 |
| --- | --- |
| `M0` | 无命令 |
| `M_OBJECT` | `CREATE_ELEMENT object.common.owner` |
| `M_STATE` | `M_OBJECT` + `CREATE_STATE state.common.subject` |
| `M_STATE_SUPPRESSED` | `M_STATE` + `STATE_SUPPRESS state.common.subject` |
| `M_OBJECT_PROCESS` | `CREATE_ELEMENT object.common.input` + `CREATE_ELEMENT process.common.action` |
| `M_STATE_OBJECT_PROCESS` | `M_OBJECT_PROCESS` + `CREATE_STATE state.common.subject`，owner=`object.common.input` |
| `M_FACT` | `M_OBJECT_PROCESS` + `CREATE_FACT fact.common.subject`，`CAP-ISO-PROC-001` |
| `M_DELETABLE_STATE` | `M_STATE` + `API-EDT-001/DELETE_CONSTRUCT`，仅验证唯一 enabled option 与 impact token |
| `M_READONLY_TARGET` | `M_OBJECT_PROCESS` |

Element ID、State ID、Fact ID、名称、layout、state roles、occurrence 构造角色、Fact endpoint 顺序、direction、labels、modifiers、logical groups、collection completeness 均由 Plan 的 command template 固定。`STATE_SUPPRESS` 的 command payload 固定为 `{context_id,state_id}`。`M_DELETABLE_STATE` 的 delete candidate 是 SETUP capability evidence，不计入 subject transaction，也不产生 revision。

每个 case 在最后一步后固定读取 `API-CTX-002`、text projection 与 revision list。最终 projection 必须只包含目标 initial state 指定的构造，text/trace 必须与其 Fact 语义一致；`M0` 必须为空。Runner 用最后一条提交响应的 `meta.committed_revision`，`M0` 时使用 materialized base revision，作为 `setup-baseline.json.subject_baseline_revision`。严禁由 fixture 名称、目录、页面、Vue store 或 SQLite 推断。

## 5. Schema、摘要和 Join

Plan Schema 根必须含 `schema_id/schema_version/plan_id/plan_version/generated_at/generator_ref/source_binding/common_fixture_catalog_ref/common_driver_ref/cases/summary/plan_payload_sha256`，且 `additionalProperties=false`。`plan_payload_sha256` 等于删除该字段后的 root JCS bytes 的 SHA-256 小写十六进制。

每个 case 必须含 `case_id/initial_state/setup_steps/expected_baseline`，并禁止未知字段。`expected_baseline` 固定包含 `construct_ids`、`fact_ids`、`minimum_api_exchange_count`、`subject_baseline_source`。同一 Plan 的 active binding 与 Catalog 必须逐字段相等；Plan 的 Catalog/driver ref 与 Manifest 对应 ref 必须按第2节的唯一路径重写后逐字段相等；任一不等为 `E2E_COMMON_SETUP_PLAN_REF_MISMATCH`。

E2E Manifest `0.2` 新增必填 `common_setup_plan_ref`，其 path 必须是 `inputs/common/dev-canvas-06-common-setup-plan.json`，kind 必须是 `COMMON_SETUP_PLAN`。它进入 Manifest exact tree、copy、installed verifier、attempt input copy 与 Runner Context 的 raw-ref closure。

## 6. 原子边界、验收与回滚

Builder 在 Catalog、factory、Plan 任一项不能闭合时不得 rename 活动 Common 根。Verifier 发现 Schema、digest、case order、semantic matrix、raw ref、option selector 或 44-file tree 不等时必须拒绝。

Runner 在 fresh attempt root 创建前验证 Plan raw ref、Schema、payload digest、16项顺序和 case initial state。失败分别为 `E2E_ORCHESTRATION_COMMON_SETUP_PLAN_MISSING/2`、`E2E_COMMON_SETUP_PLAN_INVALID/2`、`E2E_COMMON_SETUP_PLAN_REF_MISMATCH/3` 或 `E2E_COMMON_SETUP_EVIDENCE_INVALID/4`。Plan 验证失败零 attempt、零 storage、零 Materialization Report、零 Browser、零 Report 输出。

必须覆盖正例、缺 Plan、错误 digest、非16项或乱序、错误 Catalog/driver/binding ref、非法 selector、零或多 option、错误模板、错误 final projection、44-file exact tree 和 Manifest ref drift。

回滚仅删除本设计对应的新 Plan、Schema、builder/verifier/Runner 接入；不得删除历史输入根、已安装 release root 或用户数据。通过定向测试不构成真实 `194/388`、E2E Report、GATE-06-03、Candidate、Activation、Capability、生产发布或 ISO 19450:2024 证据。
