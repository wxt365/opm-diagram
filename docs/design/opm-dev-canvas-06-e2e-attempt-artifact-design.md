# DEV-CANVAS-06 E2E Attempt Artifact 执行设计

文档版本：`v1.3`

文档状态：`FROZEN_INCLUDED`

更新时间：2026-08-17

## 1. 定位与边界

本文是历史 `0.1` Attempt Artifact 的执行级设计。活动 E2E Runner 的机器契约已由 `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md` 和 `opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json/0.2` 后继；本文件的 `0.1` bytes、字段和反例只保留只读兼容，不得作为活动 producer/verifier 的第二套口径。活动 E2E Report `0.2`仍定义`388`个attempt的最终聚合。

Fault Plan 的字段、Schema和摘要继续由本历史设计承接；Launcher配置、握手、Plan raw identity、Spring装配、注入层、一次性状态机和错误码已由 [E2E Fault Launcher设计](opm-dev-canvas-06-e2e-fault-launcher-design.md) `v1.1`后继。两者冲突时，Launcher执行语义以该后继设计为准，历史`0.1`机器bytes不得改写。

本历史设计冻结：文件名、Schema identity、producer/consumer、字段、可空性、枚举、排序、JCS/SHA、跨 artifact join、Report 投影和失败边界。它不实现 Runner、Materializer、driver、fault port、collector、Reporter 或 verifier，也不构成真实 `194/388`、Gate、发布或 ISO 证据。

## 2. 版本与公共编码

唯一机器 Schema：

```text
docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact.schema.json
$id=urn:opm:contract:dev-canvas-06-e2e-attempt-artifact:0.1
schema_version=0.1
```

Schema 是 11 个根对象的互斥 union。每个根对象和嵌套对象均 `additionalProperties=false`；每个 root 通过唯一 `schema_id` 选择，不允许未知 identity。Reader必须支持artifact contract `0.1`才能读取E2E Runner `0.2.0`产物；不兼容变更必须新增Schema/runner版本，不得改写已提交evidence root。

所有 JSON 固定为无 BOM UTF-8、LF、一个结尾换行。`JCS(x)` 采用 RFC 8785；所有 SHA-256 为小写 64 位十六进制。每个 artifact 都包含：

```text
artifact_payload_sha256 = sha256(UTF8(JCS(root object 删除 artifact_payload_sha256 后)))
```

路径均相对最终 E2E Report root，使用 `/`，禁止 absolute、`.`、`..`、空段、反斜线、NUL、symlink、hardlink、socket、device 和 FIFO。普通 `fileRef={kind,path,byte_length,sha256}` 引用 raw bytes，不引用 JCS 重编码 bytes。

本设计中所有`projection_sha256/projection_before_sha256/projection_after_sha256/projection_reopen_sha256`永久绑定[Projection Digest Closure设计](opm-dev-canvas-06-projection-digest-closure-design.md)`v1.0/0.1`。producer从已验证`API-CTX-002/0.2.0-draft` response提取`.data`，对layout四个有限binary64应用大端raw-bit tag后再调用共享safe-integer JCS owner；禁止直接对含浮点的data调用JCS。其他artifact payload SHA继续按本节普通JCS公式。

## 3. 文件、Identity 与 Owner

| 固定文件 | `schema_id` | 唯一 producer | 主要 consumer |
| --- | --- | --- | --- |
| `fault-plan.json` | `OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001` | Runner plan builder | test launcher、Materializer、verifier |
| `fixture-materialization.json` | `OPM-DEV-CANVAS-06-E2E-FIXTURE-MATERIALIZATION-001` | non-web Java Materializer | Runner、verifier |
| `attempt-observation.json` | `OPM-DEV-CANVAS-06-E2E-ATTEMPT-OBSERVATION-001` | attempt aggregator | Reporter、verifier |
| `runtime-process.json` | `OPM-DEV-CANVAS-06-E2E-RUNTIME-PROCESS-001` | process orchestrator | attempt aggregator、verifier |
| `browser-environment.json` | `OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-001` | browser orchestrator | Reporter、verifier |
| `network-observation.json` | `OPM-DEV-CANVAS-06-E2E-NETWORK-OBSERVATION-001` | Playwright network collector | attempt aggregator、verifier |
| `console-errors.json` | `OPM-DEV-CANVAS-06-E2E-CONSOLE-ERRORS-001` | Playwright event collector | attempt aggregator、verifier |
| `transaction-observation.json` | `OPM-DEV-CANVAS-06-E2E-TRANSACTION-OBSERVATION-001` | snapshot collector | attempt aggregator、verifier |
| `reopen-observation.json` | `OPM-DEV-CANVAS-06-E2E-REOPEN-OBSERVATION-001` | reopen collector | attempt aggregator、verifier |
| `api-exchanges/index.json` | `OPM-DEV-CANVAS-06-E2E-API-EXCHANGE-INDEX-001` | same-origin API recorder | attempt aggregator、verifier |
| `artifact-index.json` | `OPM-DEV-CANVAS-06-E2E-ARTIFACT-INDEX-001` | artifact collector | Reporter、verifier |

Runner/verifier 必须按文件名选择预期 identity。仅用 union Schema 验证、但允许 `fault-plan.json` 携带其他合法 root identity，固定为 `E2E_INPUT_INVALID/2`。

所有 11 个 root 必须携带同一 `case_id` 和 `attempt_ordinal`。Runner plan builder 是唯一允许从冻结调度矩阵取得 ordinal 的组件；它必须先原子写入并验证 `fault-plan.json`。其余 producer 只能读取同 attempt root 内已验证 Fault Plan 的 `case_id/attempt_ordinal`，再与 Manifest case 和调度矩阵交叉校验。禁止从路径、循环下标、执行顺序或回调参数反推后覆盖 artifact 字段。

## 4. Attempt Root 与 Join

固定 root：

```text
attempts/<percent-encoded-case-id>/<attempt-ordinal>/
```

case path 编码复用 E2E Manifest Builder：除 ASCII 字母数字、`.`、`-`、`_` 外，按 UTF-8 byte 编码为大写 `%HH`。`attempt-ordinal` 只允许 `1/2`。

核心 join：

1. 先按固定文件名验证 `fault-plan.json` 的 Schema、`plan_sha256/artifact_payload_sha256`，再以其 `case_id/attempt_ordinal` 作为其余 10 个 root 的唯一 attempt 内机器来源；
2. 11 个 root 的 `case_id/attempt_ordinal` 深度相等，并与 Manifest case及冻结调度矩阵相等；
3. `fixture-materialization.fixture_ref/input_ref` 与 Manifest case 对应 ref 深度相等；
4. Family 的 `fixture_ref.sha256` 在 Manifest `fixture_refs[]` 唯一 `kind=FAMILY_FIXTURE_IDENTITY_CATALOG` raw ref 所指 Catalog 中恰命中一项；
5. `fixture-materialization` 的 Project/Model/Context/base/head identity 与 Catalog、fixture bytes、`attempt-observation`、`transaction-observation`、`reopen-observation` 相等；
6. `fault-plan.plan_sha256` 等于 Materializer、Runtime启动参数实际读取的同一 raw plan 复算值；
7. `attempt-observation.transaction` 深度等于 `transaction-observation.observed_transaction`；
8. `attempt-observation` 的 before/after/reopen digest 等于 transaction/reopen/API raw evidence按Projection Digest `0.1`复算值；
9. `artifact-index.refs[]` 覆盖除自身外的全部 attempt 文件，其他 artifact 内所有 `fileRef` 必须能在其中按 path/raw SHA 唯一命中；
10. Report attempt `artifact_refs[]` 固定为 `artifact-index.json` 自身 fileRef 加 `refs[]`，按 UTF-8 path 排序；
11. `runtime-process.cycles[].java_ref`必须逐字段等于活动Report `0.2`的`runner_identity.java_executable.mirror_ref`，INITIAL/REOPEN及全部388 attempt不得出现第二个Java ref。

任一 join 不闭合都使用 `E2E_INPUT_INVALID` 或更高优先级的既有稳定 failure code，禁止以 placeholder、空 digest、伪造 identity 或丢弃失败 attempt 生成 Report。

## 5. Fault Plan

固定字段：`schema_id/schema_version/case_id/attempt_ordinal/fault_kind/target/trigger_count/nonce/plan_sha256/artifact_payload_sha256`。

```text
plan_sha256 = sha256(UTF8(JCS({
  case_id, attempt_ordinal, fault_kind, target, trigger_count, nonce
})))
```

`nonce` 是 Runner 为当前 attempt 生成的 256-bit 小写十六进制值，只通过受控父子进程握手传递，不进入 semantic comparison digest。映射唯一为：

| Case | `fault_kind` | `target` | `trigger_count` |
| --- | --- | --- | ---: |
| `E2E-CANVAS-007.ASSET_MISSING` | `ASSET_MISSING` | `SYMBOL_CATALOG_ASSET` | 1 |
| `E2E-CANVAS-007.PERSISTENCE_FAILED` | `PERSISTENCE_FAILED` | `SQLITE_BEFORE_REVISION_INSERT` | 1 |
| `E2E-CANVAS-007.READONLY` | `READONLY` | `PROJECT_STORAGE_READ_ONLY` | 1 |
| 其余 191 个 case | `NONE` | `NONE` | 0 |

`REVISION_CONFLICT/STALE_OPTION/STALE_TOKEN/MISMATCHED_TOKEN` 必须由正式 UI/API 前序动作产生，不允许映射为 fault plan。三类fault的活动执行语义唯一采用Fault Launcher设计`v1.1`：`ASSET_MISSING`在`ProfilePackageAssembler`调用Symbol loader前注入且不修改资产，`PERSISTENCE_FAILED`在SQLite事务内第一条Revision INSERT前注入并回滚，`READONLY`只投影本次真实Head为`writable=false`且不修改SQLite。旧版“移除资产副本”“Runtime打开storage前设置只读”仅为已废止的设计草案，不得实现。普通生产启动、case/nonce/target不匹配或第二次触发必须按后继设计稳定拒绝。

Fault Plan 必须在 Materializer、Runtime、Web 和 Browser 启动前以 single-link regular file 原子发布并完成固定文件名/Schema/payload验证。Materializer CLI只接受`--fault-plan <same-attempt-root/fault-plan.json>`，不接受`--attempt-ordinal`。Fault Plan缺失、partial、值与Manifest schedule/root不一致时固定为`E2E_INPUT_INVALID/2`，且不得产生SQLite或后续artifact。attempt root目录名只允许用于定位和containment，不是identity来源。

## 6. Fixture Materialization

固定结构：

- `fixture_kind=FAMILY|COMMON`；
- `fixture_ref/input_ref`：Manifest 对应 raw refs；
- `active_binding`：READY Intake 引用的 exact Handoff active binding；
- `identity={project_id,model_id,context_id,base_revision,head_revision}`；
- `storage={storage_root,project_db_ref,storage_schema_version,sqlite_quick_check,foreign_key_check_count,sidecar_absent}`；
- `materializer_identity={main_class,runtime_jar_ref,source_sha256}`；
- `state_digests={revision_document_sha256,projection_sha256,opl_sha256,token_sha256,trace_sha256}`；
- `materialization_payload_sha256` 与 `artifact_payload_sha256`。

`materialization_payload_sha256=sha256(JCS({case_id,attempt_ordinal,fixture_kind,fixture_ref,input_ref,active_binding,identity,storage,materializer_identity,state_digests}))`。其中`state_digests.projection_sha256=sha256ProjectionV01(validatedProjectionResponse.data)`；外层materialization payload只包含64位hex string，因此继续属于共享JCS安全整数值域。

Family 的 Project identity 只来自 [Family Fixture Identity 来源闭包修正规格](../../specs/opm-dev-canvas-06-family-fixture-identity-source-closure-bugfix-task-spec.md)冻结的 Catalog `0.1/0.1.0`；Model/Context/base Revision/sequence 同时来自 Catalog 与 exact `MS-REV-001/0.2` fixture bytes并深度相等，`parent_revision_id`按fixture字段存在时取字符串、缺失时写显式`null`归一，其中`base_revision=fixture.revision_id`，不是`parent_revision_id`。禁止从fixture SHA、model、case、path、attempt或Golden seed公式派生/默认Project。Common 使用 `seed=sha256(UTF8(case_id))` 和既有固定公式生成 Project/Model/Context，`base_revision=head_revision=initial_revision`。两个 attempt 业务 identity 相同、storage path不同。`storage_root=storage`、SQLite V1、`quick_check=ok`、FK=`0`、`-wal/-shm/-journal` 不存在。写后读取 identity、Head、Revision、Projection、OPL、Token、Trace 并复算；失败时不得启动 Runtime。

## 7. Attempt Observation

固定字段沿用 Runner 规格第 11.1 节并补齐机器约束：

```text
schema_id, schema_version, case_id, suite_id,
capability_id?, coverage_key?, expectation, attempt_ordinal,
fixture_sha256, input_sha256,
project_id, model_id, context_id, base_revision, head_revision,
committed_revision|null, command_id|null, option_id|null, impact_token_id|null,
expected_status, observed_status, status,
top_error_code|null, detail_error_code|null,
projection_before/after/reopen_sha256,
opl_before/after/reopen_sha256,
token_before/after/reopen_sha256,
trace_before/after/reopen_sha256,
transaction, assertion_results[], semantic_comparison_digest,
artifact_payload_sha256
```

Family 必须同时存在 `capability_id+coverage_key`；Common 两者同时不存在。`expectation/expected_status` 只允许 `PASS|BLOCKED` 且二者相等。`observed_status/status` 只允许 `PASS_MATCHED/BLOCKED_MATCHED/FAILED`；verifier按断言和第13章算法复算并要求相等。

`assertion_results[]` 与 Manifest `assertion_ids[]` 同序一对一，每项固定 `{assertion_id,status,evidence_refs[]}`，`status=PASS|FAILED`。不得只保留失败或绿色断言。

`semantic_comparison_digest` 严格复用既有公式，包含 case、fixture/input SHA、业务 identity、Revision/command/option/token、observed/error、四组 before/after/reopen digest、transaction 和 assertion results；其中三个Projection字段必须先按Projection Digest `0.1`独立复算。semantic preimage只包含摘要string，不重新嵌入含浮点Projection。它排除 suite/capability/coverage、expectation、attempt ordinal、时间、PID、端口和路径；两个 attempt 必须相等。

## 8. Runtime 与 Browser Environment

### 8.1 Runtime Process

`runtime-process.json` 固定包含两个有序 cycle：`INITIAL`、`REOPEN`。每个 cycle 包含：

```text
cycle, normalized_command[], java_ref, runtime_jar_ref,
pid, parent_nonce, host=127.0.0.1, port,
health_samples[], started_at, stopped_at,
termination, stdout_ref, stderr_ref, owned_child_count_after_stop=0
```

每个 `health_sample={ordinal,status,observed_at}`；至少三项连续 `UP`，ordinal从1连续递增。`termination={kind,exit_code|null,signal|null,owned_process_terminated}`；NORMAL只允许`exit_code=0/signal=null`，SIGNAL只允许signal，EXIT_CODE只允许非零exit code。`parent_nonce` 必须等于当前 plan nonce。INITIAL 与 REOPEN 的 PID 不同，且均由 Runner parent proof闭合。

### 8.2 Browser Environment

固定 Playwright=`1.57.0`、Chromium=`143.0.7499.4`、locale=`zh-CN`、timezone=`Asia/Shanghai`、color scheme=`light`、reduced motion=`reduce`、device scale factor=`1`、zoom=`Z-100`。`launch_args[]` 固定顺序为：

```text
--disable-background-networking
--disable-component-update
--disable-default-apps
--disable-extensions
--disable-sync
--no-first-run
--no-default-browser-check
```

Artifact 还包含 Node 版本、browser executable raw ref、Manifest viewport ID/width/height、Web server source ref、Web dist ref、`web_origin/runtime_origin` 和 `environment_fingerprint`。两个 origin 只能是不同端口的 `http://127.0.0.1:<port>`。fingerprint 对上述离散环境字段及相关 raw SHA 做 JCS/SHA，排除 case、attempt 和临时路径。

## 9. Network、Console 与 API Exchange

### 9.1 Network Observation

`requests[]` 按 Playwright 捕获序号排列；每项固定：

```text
sequence, method, normalized_url, resource_type,
status|null, failure_code|null,
request_body_ref|null, response_body_ref|null,
operation_id|null, revision|null, allow_decision
```

`allow_decision=ALLOWED|REJECTED`，不得由自由文本决定。汇总固定包含 `external_request_count/websocket_count/service_worker_count/download_count/popup_count`。有效 matched attempt 五项均为0且所有请求 ALLOWED；违反时仍完整记录并使 attempt FAILED。

### 9.2 Console Errors

`events[]` 按发生序排列，每项固定 `{sequence,event_kind,message_sha256,source_ref|null,allow_decision}`。kind 只允许 `CONSOLE_ERROR/CONSOLE_WARNING/PAGE_ERROR/UNHANDLED_REJECTION/DIALOG/DOWNLOAD/POPUP`。不保存未脱敏 message正文；原始必要证据使用 raw `source_ref`。空事件也必须落盘。未知或 REJECTED event 使 attempt FAILED。

### 9.3 API Exchange Index

`exchanges[]` 按同源网络序号排列，每项固定：

```text
sequence, operation_id, method, normalized_url,
request_ref|null, response_ref|null, status, revision|null
```

`request_ref/response_ref` 指向 `api-exchanges/*.json|*.bin` 的原始 body bytes。JSON body 保持正式 API raw bytes并由对应 OpenAPI/Revision Schema验证，不套用 attempt artifact union；Runner 不得重序列化或包装。`exchange_set_sha256=sha256(JCS(exchanges))`。

## 10. Transaction 与 Reopen

### 10.1 Transaction Observation

`before/after` 快照均固定包含七项正式记录 count、`draft_head_revision_id/head_sequence`。Artifact 同时包含 Manifest `expected_transaction`、由快照差计算的 `observed_transaction` 和 `matches`。`transaction_payload_sha256=sha256(JCS({case_id,attempt_ordinal,before,after,expected_transaction,observed_transaction,matches}))`。

计数不得来自浏览器 DOM；必须由 attempt SQLite/正式读取路径获得。`observed_transaction` 必须逐项等于 `after-before`，`draft_head_changed` 等于 Head ID 或 sequence 是否改变。

### 10.2 Reopen Observation

固定包含：

```text
runtime_process_ref, initial_process_nonce, reopen_process_nonce,
initial_browser_context_id, reopen_browser_context_id,
new_process=true, new_context=true,
project_id, model_id, context_id, head_revision,
projection/opl/token/trace_before_sha256,
projection/opl/token/trace_reopen_sha256,
projection/opl/token/trace_matches,
reopen_matches, reopen_payload_sha256
```

两个 process nonce 和两个 context ID 必须各自不同；两个Projection SHA分别从重开前、重开后的正式response data按Projection Digest `0.1`生成，`projection_matches`只能是二者exact string equality。`reopen_matches` 是四个 match 的逻辑 AND，并与 Report attempt `reopen_matches`相等。重开前不得修复 storage、清理 sidecar、改写 Head 或复用旧 browser context。

## 11. Artifact Index

`artifact-index.refs[]` 每项固定：

```text
kind, path, media_type, byte_length, sha256, capture_phase, required
```

`capture_phase` 只允许 `MATERIALIZE/RUNTIME/ACTION/REOPEN/FINALIZE`。`refs[]` 按 UTF-8 path 严格升序，path唯一，且每项必须位于当前 attempt root；禁止引用 `artifact-index.json` 自身或其他 attempt。

以下 10 个 kind 必须各恰好一项且 `required=true/media_type=application/json`：

```text
FAULT_PLAN
FIXTURE_MATERIALIZATION
ATTEMPT_OBSERVATION
RUNTIME_PROCESS
BROWSER_ENVIRONMENT
NETWORK_OBSERVATION
CONSOLE_ERRORS
TRANSACTION_OBSERVATION
REOPEN_OBSERVATION
API_EXCHANGE_INDEX
```

其余允许 kind 为 `API_REQUEST_BODY/API_RESPONSE_BODY/STDOUT_LOG/STDERR_LOG/FAILURE_ARTIFACT`。stdout/stderr 的 INITIAL/REOPEN 原始 refs 必须存在且被 process artifact引用；API body 必须被 exchange index引用；FAILURE_ARTIFACT 只在对应失败事件存在时出现。任何实际文件未索引、索引 extra、重复path、raw SHA/length/media不等或必需kind缺失都固定为 `E2E_INPUT_INVALID`。

```text
tree_sha256 = sha256(UTF8(JCS(refs)))
```

Index 自身 `artifact_payload_sha256` 按第2章统一公式计算。Report attempt `artifact_refs[]` 不是第二个 index，必须由本 Index投影。

## 12. Report 唯一投影

| Report `case_results[].attempts[]` 字段 | 唯一输入 |
| --- | --- |
| `attempt_ordinal/status/fixture_sha256/input_sha256/project_id/model_id/base_revision/head_revision/observed_status/transaction` | 已验证 `attempt-observation.json` |
| `reopen_matches` | 已验证 `reopen-observation.json`，并与 attempt observation 的 reopen digests复算 |
| `artifact_refs[]` | 已验证 `artifact-index.json` 自身 ref + `refs[]` |

Case状态由两个attempt observation和semantic comparison digest复算；Capability/summary/failures继续按E2E Runner规格及活动E2E Report `0.2` Schema聚合。历史Report `0.1`不得由新Runner生成。Reporter不得从driver callback、stdout、本地化文本或缺失artifact的默认值填充Report。

## 13. 验证顺序与首错

每个 attempt 在写 Report 前按以下顺序只读验证，首错后停止该 attempt 的聚合但不停止其余 case 调度：

```text
PATH_AND_FILE_TYPE
-> FILENAME_SCHEMA_ID
-> ARTIFACT_SCHEMA
-> FAULT_PLAN
-> CASE_ATTEMPT_IDENTITY
-> ARTIFACT_PAYLOAD_SHA
-> FAMILY_IDENTITY_CATALOG
-> MATERIALIZATION
-> PROCESS_BROWSER
-> NETWORK_CONSOLE_API
-> TRANSACTION_REOPEN
-> ATTEMPT_SEMANTIC_DIGEST
-> ARTIFACT_INDEX
-> REPORT_PROJECTION
```

Schema/path/identity/index、Fault Plan缺失或ordinal/schedule/path不一致为 `E2E_INPUT_INVALID`；环境为 `E2E_ENVIRONMENT_MISMATCH`；Family Catalog缺失、Schema/payload/集合/SHA/deep join/Project namespace错误，以及fixture/binding/materialization及`PROJECTION_DIGEST_SCHEMA_MISMATCH/UNICODE_INVALID/NON_FINITE_FLOAT/NUMBER_DOMAIN_INVALID/FLOAT_ENCODING_FAILED`映射为`E2E_FIXTURE_MISMATCH`；JCS/SHA owner不可用属于内部错误并退出`4`。后续继续使用 E2E Report Schema冻结的 failure precedence。摘要失败不得写placeholder attempt；只读 verifier 必须记录验证前后 Report root tree digest相等，不得生成 cache、rewrite、cleanup、quarantine或网络请求。

## 14. 可报告边界与原子提交

1. Runner preflight 未全部通过：`pre-acceptance rejection`，零 staging/final/attempt artifact；
2. `ACCEPTED` 后必须尝试全部388 attempt；正常可归类的业务/断言失败仍生成完整11类 artifact，最终可写 BLOCKED Report；
3. 任一 attempt 未取得真实 fixture identity、11类 artifact或完整raw refs，属于不可报告执行失败；不得补 placeholder，整个 final Report root不存在；
4. staging 内全部 artifact、Report Schema和semantic verifier通过后，才执行 fsync、同父目录 no-replace atomic rename和parent fsync；
5. rename前失败删除本次 staging；crash residual不自动续跑/覆盖；rename后parent fsync失败保留final但返回4且不得宣称成功；
6. 已提交 root不可修改。verifier只读消费，不负责修复或补写缺失证据。

## 15. 验收与状态

设计验收必须证明：11个root Schema正例、缺字段/extra/identity/条件/枚举/计数反例、fault三项映射、Fault Plan ordinal唯一来源、Family Catalog与178 -> 2 fixture集合/deep join、Family/Common materialization、Projection Digest `0.1`的4正/9负向量与Node/Java parity、两个attempt nondeterminism边界、10个必需index kind、raw body边界和Report投影。

当前事实：E2E Manifest Builder及Runner Node基础预检/事务/聚合切片已有局部实现；Family Catalog已在`clean-37c5412a9c12`的exact Evidence Bundle、安装后的fixed Handoff和活动Manifest中闭合，Family Java Materializer可进入实现；Java executable mirror/ref、完整source set、fault/driver/collector/verifier和真实`194/388`仍未闭合。本设计`v1.3`已关闭attempt artifact格式、Projection浮点摘要、Report工具链身份、Family Project来源及attempt ordinal来源歧义，不提升实现或发布状态。

## 16. 事实与设计决定

### 16.1 事实

1. 本历史设计绑定 E2E Manifest/Attempt Artifact `0.1`；活动 Manifest/Attempt Artifact 已由 Profile/Digest closure 后继为 `0.2`，历史 Report `0.1`保持只读，活动 Report 为`0.2`，Report attempt仍只保存聚合投影；
2. 现有 Runner规格列出了11类JSON和`additionalProperties=false`要求，但仓库此前没有其机器Schema；
3. 现有Node基础层不生成最终Report，Java Materializer、fault port、driver和collector尚未完成。

### 16.2 设计决定

1. 11类 artifact 共用一个 union Schema，但文件名到root identity的映射必须独立验证；
2. 三个fault case的target分别冻结为 Symbol Catalog、Revision insert前和Project storage只读；其余case一律NONE；
3. API body保留正式raw bytes并由API契约验证，不伪装成Runner自定义artifact wrapper；
4. artifact不完整属于不可报告执行失败，不能降级为带占位identity的BLOCKED Report；
5. Java executable raw identity由Report `0.2`的byte mirror/ref承接，不扩展Attempt Artifact `0.1`；`runtime-process.java_ref`只做exact join。
6. Family identity Catalog由Manifest `fixture_refs[]`的唯一raw ref承接，不扩展Attempt Artifact `0.1`；artifact现有identity字段与Catalog/fixture做semantic join。
7. Fault Plan是attempt内ordinal唯一机器来源；路径只做定位，调度矩阵只做上游生成与交叉校验。

未声明假设：无。
