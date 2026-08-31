# DEV-CANVAS-06 E2E Family Driver 执行设计

文档版本：`v1.6`

文档状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`feature`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标与边界

本文冻结 `DRIVER-PROCEDURAL`、`DRIVER-CONTROL`、`DRIVER-STRUCTURAL` 三个 Family Driver 的可执行契约，覆盖活动 E2E Manifest `0.2` 中全部 `178` 个 Family case：

| Family | Driver | Suite | 总数 | PASS | BLOCKED |
| --- | --- | --- | ---: | ---: | ---: |
| PROC | `DRIVER-PROCEDURAL` | `E2E-CANVAS-002` | 33 | 16 | 17 |
| CTRL | `DRIVER-CONTROL` | `E2E-CANVAS-003` | 35 | 20 | 15 |
| STRUCT | `DRIVER-STRUCTURAL` | `E2E-CANVAS-004` | 110 | 94 | 16 |
| 合计 | - | - | 178 | 130 | 48 |

本文不新增 Manifest、Attempt Artifact 或 Report Schema，不建立第二套 Runtime/Web/Browser 生命周期，不修改 Common Driver、产品 Vue/Java 非目标逻辑、SQLite DDL、Profile 业务资产、Gate 或 Capability 状态。Family Driver `4 M`子切片不得修改OpenAPI或Java；Stage R仅允许第6.5节API/Runtime contract `5 M`前置子切片及后继source guard `2 M`修改已冻结路径。三个 Family Driver 必须复用活动 Runner、Stage A 六方法 `observation_sink`、Attempt Artifact `0.2` 的 11 类 root、Report `0.2`投影及Family Controlled Invocation的Context/dispatch/bridge契约。

Playwright `Page`只存在于child进程。production bridge必须在child内导入Source Set第1项的import-safe Runner owner，并在Page attach后调用Runner-owned一次性`resolve_invocation(page)`取得完整CaseExecution与五参数对象；禁止父进程序列化Page或bridge复制Driver loader/CaseExecution builder。

## 2. 唯一输入闭包

### 2.1 每个 case 的五方 exact join

Runner 必须先从已验证 Manifest root 读取以下 raw ref，禁止读取 checkout、相邻版本根、环境变量、默认目录或文件名猜测：

```text
Manifest 0.2 case
  -> upstream_input_refs[COVERAGE_CATALOG]
  -> upstream_input_refs[GOLDEN_MANIFEST]
  -> upstream_input_refs[GOLDEN_REPLAY_REPORT]
  -> fixture_refs[FAMILY_FIXTURE_IDENTITY_CATALOG]
  -> case.fixture_ref + case.input_ref
```

每个 Family case 在内存中合成为一个深冻结 `FamilyCaseExecution`：

```text
{
  manifest_case,
  coverage_requirement,
  golden_case,
  replay_case,
  family_identity,
  base_fixture,
  input_fixture,
  companion_pass_requirement,
  companion_pass_golden_case,
  companion_pass_input_fixture,
  execution_mode,
  expected_api,
  expected_error
}
```

唯一 join 规则：

1. `manifest_case.case_id = coverage_requirement.case_id = golden_case.case_id = replay_case.case_id`；
2. `suite_id/driver_id/capability_id/coverage_key/expectation` 与 Family 映射逐字段一致；
3. `manifest_case.fixture_ref/input_ref` 与物化 raw bytes 的 length/SHA/archive ref 一致；
4. `base_fixture` 必须是 `MS-REV-001/0.2`，其 Project/Model/Context/base Revision 与 Family Identity Catalog 一致；
5. `input_fixture.parent_revision_id = base_fixture.revision_id`，且恰含一个 subject Fact；
6. Golden Replay 两次 attempt 的 `observed_status/error_code/transaction/artifact_sha256/trace_sha256`必须逐字段一致；
7. PASS 的两次 Replay 均为 `PASS_MATCHED`，BLOCKED 的两次 Replay 均为 `BLOCKED_MATCHED`；
8. 任一缺项、extra、重复、顺序、raw ref、字段或两次 Replay 漂移时，Family Driver 不得启动浏览器或写 attempt artifact。

`companion_pass_requirement` 的唯一选择算法为：在 Coverage Catalog 原始 `requirements[]` 顺序中，选择与当前 case 的 `family+capability_id` 相同且 `expectation=PASS` 的第一项。后继[Family Companion PASS Input闭包修正规格](../../specs/opm-dev-canvas-06-family-companion-pass-input-closure-bugfix-task-spec.md)进一步冻结其Golden case与input fixture两个必填字段：PASS自指当前case；BLOCKED按该requirement闭合exact PASS input Fact。它只为 BLOCKED case建立合法候选上下文，不替代当前case的`input_fixture`、期望错误或事务。

### 2.2 case 集合

三个 module 的 `case_ids[]` 必须分别等于 Manifest `cases[]` 中对应 `driver_id` 的原序子序列，不排序、不按文件名重建：

```text
PROC   = manifest.cases.filter(driver_id == DRIVER-PROCEDURAL).case_id  # 33
CTRL   = manifest.cases.filter(driver_id == DRIVER-CONTROL).case_id     # 35
STRUCT = manifest.cases.filter(driver_id == DRIVER-STRUCTURAL).case_id  # 110
```

集合摘要不另建算法。Driver source raw SHA 由 Manifest `driver_catalog[0..2].source_ref` 和活动 Runner Source Set `0.2`共同锁定；case 集合由上述 exact join 锁定。禁止在 Reporter、observed result 或目录扫描后反填 case 集合。

## 3. 三个 Driver 的导出接口

每个 module 恰导出以下三个 named export，不允许 default export、别名、额外生产 export 或可变全局状态：

```text
export const driver
export const case_ids
export async function executeCase({
  page,
  case_entry,
  attempt_identity,
  observation_sink,
  precondition_client
}) -> Promise<undefined>
```

`driver` 必须深冻结并恰含：

```text
{
  driver_id: DRIVER-PROCEDURAL|DRIVER-CONTROL|DRIVER-STRUCTURAL,
  driver_version: "0.1.0",
  family: PROC|CTRL|STRUCT,
  suite_id: E2E-CANVAS-002|003|004,
  capability_prefix: CAP-ISO-PROC-|CAP-ISO-CTRL-|CAP-ISO-STRUCT-,
  expected_case_count: 33|35|110
}
```

约束：

1. `case_ids` 是深冻结、唯一、有序字符串数组；
2. `case_entry` 必须是第2章已经闭合的 `FamilyCaseExecution`，不得只传裸 Manifest case；
3. Driver 接收的 `attempt_identity` 必须是第4.4节的深冻结 `SetupBoundAttemptIdentity`；基础字段来自已验证 Fault Plan、Materialization artifact 和 Family Catalog，SETUP字段只能由Runner在Page attach后按第4.4节绑定；
4. `precondition_client === observation_sink.precondition_client`，Driver不得包装、替换或跨cycle缓存；
5. `executeCase()` 成功只返回 JavaScript `undefined`；返回其他值、修改输入、保留 `page/sink/client`、读取环境变量或自行写 artifact 均为 `E2E_ORCHESTRATION_INPUT_INVALID`；
6. Browser 的创建、attach、关闭和 confirm 继续由受控 Playwright handler 按 Stage A 契约完成，Driver只使用已attach的 `page`。

## 4. 前置模型与 SETUP 边界

### 4.1 三个 Revision 概念

必须区分：

| 名称 | 含义 | 来源 |
| --- | --- | --- |
| `materialized_base_revision` | Materializer 写入 fresh SQLite 的 exact base Revision | Family Identity Catalog + `fixture_ref` |
| `subject_baseline_revision` | 最后一个 SETUP 动作稳定后、首个 subject 动作前的 Head | 正式 API/SQLite snapshot |
| `subject_result_revision` | subject 完成后的 Head | 正式 API/SQLite snapshot |

PROC/STRUCT 没有语义写入 SETUP，因此 `subject_baseline_revision=materialized_base_revision`。CTRL 必须先创建基础 Procedural Fact，因此 `subject_baseline_revision` 是 SETUP 提交后的新 Revision，不能误写成物化 base Revision。该 Revision 与基础 Fact 身份必须由第4.4节的同一正式响应及其API Exchange证据绑定，不能分别从不同观测源拼装。

### 4.2 唯一执行顺序

```text
VERIFY_FAMILY_CASE_EXECUTION
-> MATERIALIZE_EXACT_BASE_FIXTURE
-> START_INITIAL_RUNTIME_WEB_BROWSER
-> ATTACH_PAGE
-> OPEN_EXACT_PROJECT_MODEL_CONTEXT_REVISION
-> WAIT_INITIAL_PROJECTION_TEXT
-> RUN_SETUP
-> WAIT_SETUP_STABLE
-> CAPTURE_SUBJECT_BASELINE
-> EXECUTE_SUBJECT
-> WAIT_SUBJECT_TERMINAL
-> CAPTURE_SUBJECT_TRANSACTION
-> CAPTURE_INITIAL_COMMITTED_STATE
-> CLOSE_BROWSER_PROOF_AND_INITIAL
-> START_REOPEN_SAME_STORAGE
-> OPEN_REOPEN_CONTEXT
-> CAPTURE_REOPEN_STATE
-> ASSERT_AND_FINALIZE_ATTEMPT
```

### 4.3 SETUP 允许项

SETUP 只允许：

1. 打开 exact Project/Model/Context/Revision；
2. 等待 Projection/Text/Trace 与当前 Head 一致；
3. 选择已存在的 Element/State/Fact；
4. 为 BLOCKED case 使用 companion PASS 端点调用一次 `API-EDT-001`，取得合法候选上下文但不提交目标 Fact；
5. CTRL case 由Runner-owned `RUN_SETUP`通过attached Page上的同源正式 `API-EDT-001 + API-EDT-002 CREATE_FACT` 创建一个无 `control.*` Modifier 的合法基础 Procedural Fact；该内部SETUP executor不是`precondition_client`，不得消耗BLOCKED subject唯一一次负例调用额度；
6. CTRL 基础 Fact 的语义字段从当前 `input_fixture.facts[0]`移除全部 `modifier_id` 以 `control.`开头的项后得到；若当前 Fact 本身是独立 Control Fact，则改用 companion PASS Fact移除 `control.*`后的基础 Fact；
7. SETUP API request/response 必须先写入同一attempt的raw body文件并取得稳定raw ref，最终进入同一 `api-exchanges/index.json`；只有第4.4节身份绑定完成后才允许采集 `transaction-observation.before`或调用Driver。

禁止 SETUP：提交当前 case 的目标 Fact、预写期望 Revision或Fact ID、直接修改SQLite、调用test controller、修改Pinia、伪造候选、把SETUP事务计入subject事务、在SETUP后沿用旧baseline snapshot，或从页面、fixture、目录名、SQLite row order推断基础Fact身份。

### 4.4 RUN_SETUP 身份绑定

Runner 必须把attempt identity作为不可变的两阶段状态转换，不得原地修改已冻结对象：

```text
MaterializedAttemptIdentity
-> RUN_SETUP
-> SetupBoundAttemptIdentity
```

`MaterializedAttemptIdentity`恰含：

```text
{
  case_id,
  attempt_ordinal,
  project_id,
  model_id,
  context_id,
  materialized_base_revision
}
```

Runner只能在Page已attach、FamilyCaseExecution已完成五方join且SETUP raw request/response已经落入attempt staging后，新建以下对象并对全部plain object/array递归`Object.freeze`；禁止向旧对象追加字段、保留可变嵌套对象或在Driver调用后回填：

```text
SetupBoundAttemptIdentity={
  case_id,
  attempt_ordinal,
  project_id,
  model_id,
  context_id,
  materialized_base_revision,
  setup_fact_id,
  subject_baseline_revision,
  setup_create_fact_exchange_ref
}
```

`setup_create_fact_exchange_ref`是SETUP `API-EDT-002 CREATE_FACT`真实response body的封闭raw file ref，恰含`kind/path/byte_length/sha256`，其中`kind=API_RESPONSE_BODY`。它必须逐字段等于最终`api-exchanges/index.json`中唯一SETUP entry的`response_ref`；该entry还必须绑定同一request raw ref、`operation_id=API-EDT-002`、`method=POST`、normalized URL `/api/v1/projects/<project_id>/models/<model_id>/contexts/<context_id>/commands`、HTTP 200、`revision=subject_baseline_revision`。request raw body必须`command_type=CREATE_FACT`、`base_revision=materialized_base_revision`且不得携带`payload.fact_id`。该ref不是最终index文件自身的ref，因而可在subject开始前完成并冻结。

CTRL 的唯一 `setup_fact_id` 提取算法为：

```text
response_affected_ids
= exact SETUP CREATE_FACT raw response.data.affected_ids

new_fact_ids
= post_setup_revision.fact_ids - pre_setup_revision.fact_ids

setup_fact_candidates
= intersection(response_affected_ids, new_fact_ids)

setup_fact_id
= the unique member of setup_fact_candidates
```

`pre_setup_revision.fact_ids`与`post_setup_revision.fact_ids`的读取方式唯一：Runner分别请求`API-CTX-002`的`revision=materialized_base_revision`与`revision=response.meta.committed_revision`，从Schema-valid raw response `data.constructs[]`中选择`construct_role`为`PROCEDURAL_LINK`或`STRUCTURAL_LINK`的`target_id`并去重成集合。pre集合必须先逐项等于已验证base fixture `facts[].fact_id`集合；post集合只能取上述response Revision的正式投影。禁止用DOM/X6 cell、OPL文本、Trace遗漏补齐、SQLite查询/row order或内存candidate对象代替这两个集合。

必须同时满足：

1. raw response通过活动OpenAPI验证，`meta.status=COMMITTED`；
2. `response.meta.committed_revision=subject_baseline_revision`，且等于SETUP exchange entry的`revision`、post-SETUP snapshot Revision和subject request的`base_revision`；`meta.revision`不是活动`CommandMeta`字段，禁止兼容读取；
3. pre-SETUP snapshot Revision等于`materialized_base_revision`；
4. `new_fact_ids.size=1`且`setup_fact_candidates.size=1`；
5. `setup_fact_id`存在于`subject_baseline_revision`的Fact集合，不存在于`materialized_base_revision`的Fact集合；
6. 该Fact的family、endpoints及移除`control.*`后的Modifiers逐字段等于第4.3节冻结的基础Procedural Fact语义；
7. `setup_create_fact_exchange_ref`的raw bytes解析结果就是参与上述计算的同一response，不得读取另一次请求、DOM缓存或规范化后重写的JSON。

`affected_ids`当前表达候选Revision的受影响ID集合，不承诺创建ID排序。因此禁止读取首项/末项、按ID前缀过滤、从request预填`fact_id`，也禁止从DOM/X6 cell、URL、页面文案、Golden fixture Fact ID、case ID、attempt目录、SHA、文件名、SQLite row order或目录扫描取得/派生`setup_fact_id`。

PROC/STRUCT不执行写入型SETUP，但对象形状必须唯一：

```text
setup_fact_id=null
setup_create_fact_exchange_ref=null
subject_baseline_revision=materialized_base_revision
```

Runner-owned `resolve_invocation(page)`必须先完成上述转换，再把同一个`SetupBoundAttemptIdentity`引用放入Driver `call_context`；CTRL未绑定、字段漂移或Driver收到旧身份时固定为`E2E_DRIVER_INVOCATION_INVALID`。非COMMITTED、Revision不一致、Fact差集不是唯一或语义不匹配固定为`E2E_FAMILY_SETUP_IDENTITY_INVALID`并使该attempt为`FAILED`；raw bytes/ref、API Exchange index、Revision snapshot或证据链不可信固定为`E2E_FAMILY_SETUP_EVIDENCE_INVALID -> EVIDENCE_TRANSACTION/4`，禁止生成可消费Attempt Artifact或Report。

## 5. 稳定 Selector 契约

### 5.1 现有应用 selector

Driver 只允许以下稳定 selector；禁止坐标点击、文本模糊匹配、CSS class、XPath、SVG path序号或截图像素定位：

| 目的 | Selector |
| --- | --- |
| 工作台/画布 | `[data-testid="p03-workbench"]`、`[data-testid="p03-canvas"]` |
| exact X6 node | `[data-cell-id="<target_id>"]` |
| 过程/结构关系工具 | `p03-tool-procedural-relation`、`p03-tool-structural-relation` |
| 端点选择完成 | `p03-relation-target`、`p03-relation-resolve` |
| 候选目录/选项 | `p03-relation-catalog`、`p03-relation-option-<capability_id>` |
| duration | `p03-relation-duration` |
| Structural 编辑 | `p03-structural-candidate`、`p03-structural-label-<slot_id>`、`p03-structural-completeness`、`p03-structural-candidate`内`getByRole("combobox", {name:"direction", exact:true})`、`p03-structural-candidate`内`getByRole("button", {name:"创建", exact:true})` |
| Control 编辑 | `p03-control-open`、`p03-control-catalog`、`p03-control-option-<capability_id>` |
| OPL/Trace | `p03-tab-text`、`p03-text-panel`、`p03-opl-sentence` |

`target_id` 只能来自已验证 Fact endpoint。Playwright 必须通过属性等值 locator 构造 selector并拒绝非法引号/NUL，不得字符串拼接未转义CSS。

Structural方向与提交的两个role locator必须先以`p03-structural-candidate`唯一表单为scope，再使用上述精确英文label/中文按钮名；禁止全页role搜索、模糊name、`select`标签或按钮序号。仅当input Fact的`direction`与候选表单当前值不等时选择exact值；提交前必须逐项复核labels、direction和collection completeness均等于input Fact。

### 5.2 Fact 选择

选择 existing Fact 时唯一 cell ID 优先级为：

```text
exact fact_id
-> <fact_id>.input            # Effect segment
-> <fact_id>.root             # Structural fan
```

只有一个候选可以存在；零个或多个均为 `E2E_FAMILY_SELECTOR_NOT_UNIQUE`。点击后必须由正式 UI 选择态和下一次 `API-EDT-001 selection_id=<fact_id>`双重证明，不得从DOM class推断 relation identity。

## 6. 每个 case 的真实 UI/API 步骤

### 6.1 execution mode

| Family/Expectation | `execution_mode` | subject命令 |
| --- | --- | --- |
| PROC PASS | `UI_CREATE_FACT` | `CREATE_FACT` |
| PROC BLOCKED | `API_NEGATIVE_CREATE_FACT` | `CREATE_FACT` |
| CTRL PASS | `UI_UPDATE_CONTROL` | `UPDATE_FACT` |
| CTRL BLOCKED，除独立Control Fact | `API_NEGATIVE_UPDATE_FACT` | `UPDATE_FACT` |
| `G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED` | `API_NEGATIVE_CREATE_FACT` | `CREATE_FACT` |
| STRUCT PASS | `UI_CREATE_FACT` | `CREATE_FACT` |
| STRUCT BLOCKED | `API_NEGATIVE_CREATE_FACT` | `CREATE_FACT` |

该表与第2章 exact input 共同定义全部178项，无允许实现者自由选择的第六种模式。

### 6.2 PASS 的 UI 路径

PROC/STRUCT PASS：

```text
按 input_fixture.facts[0].endpoints.ordinal 选择第一个endpoint
-> 点击对应 relation tool
-> 按剩余ordinal逐项点击 exact target_id
-> 点击 p03-relation-resolve
-> 等待 API-EDT-001 200
-> 选择 p03-relation-option-<capability_id>
-> STRUCT时按 input Fact填写 labels/direction/collection_completeness
-> PROC-015/016时按 input Fact duration Modifier填写duration
-> 提交并等待 API-EDT-002 200/COMMITTED
```

CTRL PASS：

```text
接收第4.4节已闭合的SetupBoundAttemptIdentity
-> 按attempt_identity.setup_fact_id选择exact base Fact cell
-> 点击 p03-control-open
-> 等待 API-EDT-001(intent=UPDATE_FACT,selection_id=<setup_fact_id>) 200
-> 选择 p03-control-option-<capability_id>
-> 等待 API-EDT-002 200/COMMITTED
```

UI request 的 subject semantic fields 必须与 `input_fixture.facts[0]`逐项等价：capability、fact family、endpoint role/kind/id/ordinal、direction、labels、Modifiers、logical groups、collection completeness。Runtime生成的 Fact ID、endpoint ID、source、normalization和layout identity不要求逐字等于Golden fixture，但Projection、OPL、Token、Trace和事务摘要必须等于Golden Replay/Manifest定义。

### 6.3 BLOCKED 的正式 API 负例路径

普通 UI 不会产生非法endpoint、缺失必填label、非法Control Modifier或重复ordinal。48项 BLOCKED 必须采用以下唯一受控边界：

1. 先用 companion PASS endpoint/Fact通过真实UI建立合法 `API-EDT-001`候选上下文；
2. 保留该 response 的 exact `capability_query_id/selected_option_id`；
3. 只把正式 `API-EDT-002` payload 的subject semantic fields替换为当前 `input_fixture.facts[0]`；
4. CTRL update 的 `fact_id`必须逐字符等于`attempt_identity.setup_fact_id`，replacement Modifiers取input Fact；独立Control Fact改用CREATE_FACT并取input Fact完整semantic fields；
5. 通过 `precondition_client.execute(request)`发送一次同源正式API请求；禁止第二次mutation、HTTP旁路、test endpoint、SQLite、store注入或直接调用Service；
6. raw request/response、候选response和当前Revision全部进入 API Exchange evidence；
7. 没有候选、按钮disabled或前端本地提示不能替代subject错误证据。

候选两项身份的唯一可执行返回通道由后继[Family Candidate Receipt闭包修正规格](../../specs/opm-dev-canvas-06-family-candidate-receipt-closure-bugfix-task-spec.md)冻结：production `observation_sink.waitForApi()`必须在raw证据与index稳定后返回完整`ApiExchangeReceipt`；禁止由DOM或fixture补值。

### 6.4 期望 API 与错误码

全部case都要求：

| 阶段 | Operation | 期望 |
| --- | --- | --- |
| 打开 | `API-PRJ-009` | `200`，Project/Model/Head一致 |
| 导航 | `API-CTX-001` | `200`，Context/Revision一致 |
| 图投影 | `API-CTX-002` | `200`，Revision一致 |
| 文本/Trace | `API-TXT-001` | `200`，Revision一致 |
| 候选 | `API-EDT-001` | `200`，exact query/option/capability |
| subject PASS | `API-EDT-002` | `200`且`COMMITTED` |
| subject BLOCKED | `API-EDT-002` | `400`或`422`，按下表exact code |

BLOCKED 的唯一错误映射由 Golden Replay两次一致的 `attempts[].error_code`冻结：

| Family | Replay error | 数量 | HTTP | Attempt `top_error_code` | `detail_error_code` |
| --- | --- | ---: | ---: | --- | --- |
| PROC | `ENDPOINT_KIND_MISMATCH` | 7 | 422 | `DOMAIN_REJECTED` | `ENDPOINT_KIND_MISMATCH` |
| PROC | `STATE_OWNER_MISMATCH` | 8 | 422 | `DOMAIN_REJECTED` | `STATE_OWNER_MISMATCH` |
| PROC | `INVALID_ARGUMENT` | 2 | 400 | `INVALID_ARGUMENT` | `null` |
| CTRL | `MODIFIER_COMBINATION_INVALID` | 15 | 422 | `MODIFIER_COMBINATION_INVALID` | `null` |
| STRUCT | `ENDPOINT_KIND_MISMATCH` | 11 | 422 | `DOMAIN_REJECTED` | `ENDPOINT_KIND_MISMATCH` |
| STRUCT | `STATE_OWNER_MISMATCH` | 1 | 422 | `DOMAIN_REJECTED` | `STATE_OWNER_MISMATCH` |
| STRUCT | `MODIFIER_COMBINATION_INVALID` | 4 | 422 | `MODIFIER_COMBINATION_INVALID` | `null` |

`detail_error_code` 是 Runner 对已验证 input/replay与正式wire的受控分类，不得从本地化message解析。若正式 ErrorEnvelope 的 `error.code` 与上表top code不一致，attempt必须 `FAILED`，不得用Replay值覆盖wire事实。

### 6.5 API/Runtime ErrorDetail 同步前置

冻结的唯一目标wire是：`MODIFIER_COMBINATION_INVALID`作为HTTP 422 `ErrorEnvelope.error.code`的top code，`detail_error_code=null`。`ApiErrorCode`、`ApiExceptionHandler`和Golden Replay已使用该稳定code；`LocalApiService`的相关校验当前仍可能经`domain()`返回`DOMAIN_REJECTED`，因此不能只同步OpenAPI或在Driver中改写wire事实。

该闭包纳入Stage R的固定API/Runtime contract子切片，exact `4 M`：

```text
M docs/contracts/openapi/opm-local-api-v1.yaml
M scripts/validate-contracts.mjs
M services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
M services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java
```

1. OpenAPI只向`ErrorDetail.code`枚举增加`MODIFIER_COMBINATION_INVALID`，不改HTTP状态、category、retryable、message或公共请求shape；
2. `validate-contracts.mjs`必须对Schema-valid HTTP 422 ErrorEnvelope正例和错误top code/extra/shape负例执行真实OpenAPI Schema验证，禁止只搜索YAML文本；
3. `LocalApiService.java`只把第6.6节精确19项非法组合映射为该错误；禁止批量替换`domain()`或改变未列领域错误；
4. `LocalApiControllerTest`必须经真实Service、临时SQLite、Project/Model/Element/Fact、`API-EDT-001`候选和`API-EDT-002`命令取得HTTP 422、`application/problem+json`和原始响应bytes，验证`code/category/retryable/diagnostic_id`，再用同一OpenAPI ErrorEnvelope Schema验证raw body；不得mock Service、直接调用Handler、直接抛`ApiException`、构造预期Map或只测enum；
5. 至少覆盖一个Control、一个Structural正例，并以同一真实路径证明endpoint/owner和候选过期/不匹配等未列领域错误保持原码；
6. Stage R内固定先完成这4项，再执行三个Family Driver和Runner聚合；任一失败时不得启动Family browser、写attempt/Report或形成R commit。

该子切片的唯一完整映射、排除集、source identity与回滚边界由[Family Error Code Mapping与Source Closure修正规格](../../specs/opm-dev-canvas-06-family-error-code-mapping-source-closure-bugfix-task-spec.md)承接。生成的EDT TypeScript/Java contract不承载`ErrorDetail`，因此本次不修改generated contract；若后继实现发现四路径不足，必须停止并新开bugfix，禁止静默扩围。本设计任务不修改OpenAPI、Java、Node实现或source chain commit。

### 6.6 `MODIFIER_COMBINATION_INVALID`封闭集合

目标集合恰为`19=15 CTRL+4 STRUCT`。Control完整case为：

```text
BASE_CAPABILITY_MISMATCH
DUPLICATE_CONTROL_CAPABILITY
DUPLICATE_CONTROL_SEGMENT
EFFECT_OUTPUT_SEGMENT
EVENT_CONDITION_COMBINATION
INDEPENDENT_CONTROL_FACT
MISSING_CONTROL_CAPABILITY
MISSING_CONTROL_SEGMENT
MODIFIER_CAPABILITY_REF_MISMATCH
MODIFIER_VALUE_REF_MISMATCH
NON_INPUT_SEGMENT
OPTION_PAYLOAD_MISMATCH
RESULT
STATE_RESULT
UNKNOWN_CONTROL_CAPABILITY
```

以上名称均固定加前缀`G-OPL-CTRL-001.`和后缀`.BLOCKED`。Structural完整case仅为：

```text
G-OPL-STRUCT-001.FORWARD_TAG_MISSING.BLOCKED
G-OPL-STRUCT-003.REVERSE_TAG_MISSING.BLOCKED
G-OPL-STRUCT-008.COMPLETENESS_INVALID.BLOCKED
G-OPL-STRUCT-010.BIDIRECTIONAL_NULL_TAG.BLOCKED
```

endpoint kind、State owner、Fact不存在、候选过期/不匹配、重复/未知标签槽位、不受支持方向以及其他未列领域错误继续保持既有分类。禁止把全部Control、Structural或HTTP 422错误统一改码。

## 7. Subject transaction 基线

### 7.1 快照时点

`transaction-observation.before` 必须在以下条件全部成立后采集：

1. 所有SETUP API均已到终态；
2. UI、URL、Workspace、Projection、Text/Trace与同一 `subject_baseline_revision`一致；
3. 同源活动请求为0持续500ms并经过两个`requestAnimationFrame`；
4. 首个subject click/request尚未发生。

`after` 必须在唯一subject `API-EDT-002`终态、Projection/Text刷新完成后采集。任何SETUP写入出现在before之后、subject请求在before之前或snapshot来自DOM计数，均为 `E2E_FAMILY_TRANSACTION_BOUNDARY_INVALID`。

### 7.2 PASS

PASS 必须逐字段等于 Manifest `expected_transaction`和Golden Replay两次一致事务：

```text
revision_delta=1
revision_parent_delta=1
text_artifact_delta=1
text_trace_delta=1
finding_delta=0
operation_delta=1
receipt_delta=1
draft_head_changed=true
```

`subject_result_revision`必须是新的Head；`committed_revision/command_id/option_id`必须来自真实API。Projection/OPL/Token/Trace after摘要按活动Digest契约复算。

### 7.3 BLOCKED

BLOCKED 必须逐字段为零事务：

```text
revision_delta=0
revision_parent_delta=0
text_artifact_delta=0
text_trace_delta=0
finding_delta=0
operation_delta=0
receipt_delta=0
draft_head_changed=false
```

`subject_result_revision=subject_baseline_revision`；四组after摘要必须等于before。CTRL case的subject baseline可以是SETUP创建基础Fact后的Revision，不能错误要求等于materialized base。

## 8. 重开断言

INITIAL handler结束后必须按Stage A契约关闭Browser proof、Web和Runtime；REOPEN使用同一attempt storage、fresh Runtime/Web/Browser process/context/page。

PASS：

1. reopen Head等于 `subject_result_revision`；
2. reopen Projection/OPL/Token/Trace摘要分别等于INITIAL after；
3. committed Fact、Control Modifiers、Structural labels/fan/completeness仍存在；
4. `new_process=true/new_context=true/reopen_matches=true`。

BLOCKED：

1. reopen Head等于 `subject_baseline_revision`；
2. reopen四组摘要分别等于subject before/after；
3. input fixture中的非法subject Fact或Modifier不得出现；
4. SETUP基础Fact在CTRL case中必须仍存在；
5. `new_process=true/new_context=true/reopen_matches=true`。

不得在重开前修复SQLite、删除sidecar、改写Head、重放subject或复用INITIAL Browser context。

## 9. 证据采集

不得新增第二套Family artifact。每个attempt必须完整生成活动 Attempt Artifact `0.2` 的11类root，并满足：

1. `api-exchanges/index.json`按网络序记录打开、SETUP、候选、subject、Projection/Text/reopen的raw request/response；
2. `transaction-observation.json`只计算subject baseline到subject terminal；
3. `attempt-observation.json`记录materialized base、subject最终Head、top/detail错误、四组before/after/reopen摘要和Manifest assertion同序结果；
4. `reopen-observation.json`证明fresh process/context及四摘要相等；
5. `network-observation.json/console-errors.json/browser-environment.json/runtime-process.json`继续服从Runner与Stage A Browser proof；
6. `artifact-index.json`覆盖10类核心、Profile tree、五项Profile asset及实际API body/log/failure文件；
7. PASS assertion refs至少指向command response、transaction、after Projection/Text和reopen；
8. BLOCKED assertion refs至少指向负例request/error response、零事务、before/after Projection及reopen；
9. screenshot只允许作为失败诊断 `FAILURE_ARTIFACT`，不能替代机器断言；
10. 两次attempt的`semantic_comparison_digest`必须相等，PID、端口、时间和路径不得进入语义摘要。
11. CTRL必须证明`attempt_identity.setup_fact_id`等于第4.4节response/diff唯一交集，`subject_baseline_revision`等于SETUP response、exchange、post-SETUP snapshot与subject request四方Revision，`setup_create_fact_exchange_ref`等于API Exchange Index中唯一SETUP entry的response ref；PROC/STRUCT三项null/base规则也必须复算。

## 10. 稳定等待与首错

每个动作必须同时等待DOM终态、exact API response、Revision一致、Projection/Text一致、500ms零同源请求和两个animation frame。禁止固定sleep、`networkidle`单项或本地化文本单项。

Family Driver首错顺序：

```text
INPUT_JOIN
-> CASE_SET
-> SELECTOR_UNIQUENESS
-> SETUP
-> SETUP_IDENTITY
-> SUBJECT_BASELINE
-> CANDIDATE
-> SUBJECT_API
-> ERROR_OR_COMMIT
-> TRANSACTION
-> DIGEST
-> REOPEN
-> EVIDENCE_FINALIZE
```

输入闭合失败为`E2E_INPUT_INVALID/2`；selector、SETUP、SETUP identity、UI/API或断言失败使attempt为`FAILED`；SETUP/API Exchange raw证据、Browser proof、child cleanup、端口释放或artifact原子事务不可信时升级为`EVIDENCE_TRANSACTION/4`并禁止生成可消费attempt/Report。

## 11. Source ownership

Family Driver后继实现子切片只修改：

```text
M tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs
M scripts/release-canvas06-e2e-run.test.mjs
```

三个Driver进入活动Runner Source Set `0.2`的第21~23项，Common Driver为第24项；Source Set第20项是唯一production bridge。Family Driver子切片与既有Runner owner共享Runner test；Family Attempt Path Owner闭包后，Stage R最终为`25=23 M+2 A`，累计`O..R=45=33 M+12 A`；Stage A为`7=5 M+2 A`，`O..A=25=15 M+10 A`。Service及其两个Java测试不加入Runner Source Set；共享Attempt artifact owner为Source Set第8项，其测试不进入Source Set；Runtime JAR只从同一clean R重建。

除第6.5节API/Runtime contract固定五个路径及后继source guard两个路径外，产品Vue、其他Java/OpenAPI、SQLite、Schema、Profile、Manifest输入、Common Driver及其他Runner Source Set entry保持只读。若实现证明现有范围仍不足，必须新增bugfix规格，禁止坐标点击、message解析、测试旁路或静默扩围。

## 12. 验收与非结论

设计验收：

1. 三module导出接口、178项case集合和五方join唯一；
2. 130 PASS全部真实UI，48 BLOCKED全部“UI候选上下文+一次正式API负例”；
3. CTRL SETUP的exact `setup_fact_id`、深冻结identity、response/Revision/API Exchange逐字段绑定与subject transaction边界可机器复算；
4. PASS/BLOCKED重开断言均绑定subject baseline/result；
5. Attempt Artifact/Stage A/Runner Source Set没有第二owner；
6. Stage R `25=23 M+2 A` allowlist、API/Runtime、Family Attempt path与source guard同步顺序、Context/bridge闭包和累计`45=33 M+12 A`无冲突。

本设计冻结不表示三个Driver已实现，不表示 `194/388`已执行，不构成E2E Report、GATE-06-03、Candidate、Activation、Capability、生产发布或ISO 19450:2024符合性证据。
