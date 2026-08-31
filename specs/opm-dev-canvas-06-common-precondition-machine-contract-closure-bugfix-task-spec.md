# DEV-CANVAS-06 Common Precondition Machine Contract Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `testing (primary)`
- `backend-springboot`
- `design-module-docs`

## 1. 问题与 Root Cause

Common Driver 已冻结五类 `PRECONDITION_API`，但旧设计只给出名称，没有封闭完整 command payload、两类 UI request mutation、动态 raw ref 解析、subject baseline 重绑定和不同执行模式的 receipt。现有 Runner 原型又把五类操作全部实现成“立即同源 POST”，使 `REPLACE_OPTION_ID`、`REPLACE_IMPACT_TOKEN`无法在后续真实 UI 请求上生效。

`source_observation_ref="setup-baseline-api"`同时被描述为“attempt 内既有 API observation id”，但它是 Driver source 中的固定字符串，不可能预先携带运行期 raw ref。继续实现会自行发明证据语义。

## 2. 修改边界

本设计修正只允许修改：

```text
specs/opm-dev-canvas-06-common-precondition-machine-contract-closure-bugfix-task-spec.md
docs/checklists/opm-dev-canvas-06-common-precondition-machine-contract-closure-bugfix-checklist.md
docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md
specs/opm-dev-canvas-06-family-controlled-invocation-closure-bugfix-task-spec.md
docs/README.md
```

后继 Stage R 实现只允许继续修改既有 owner并新增一个活动Source Set owner：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs
```

不修改Context/Manifest/Attempt/Report Schema、公共 HTTP wire、OpenAPI、Java、Vue、SQLite DDL、生产配置、依赖或Runner Source Set版本。Common Driver只允许把`REQUEST_MUTATION`的`ARMED` receipt与`DIRECT_COMMAND`完整receipt分支校验，case常量、selector、页面步骤和其他export逐byte语义不变。

本后继把Stage R最终修正为`33=31 M+2 A`，累计`O..R=52=40 M+12 A`；Runner Source Set保持`0.2/24`，相对A变为`11 changed/new +13 unchanged`。`common-driver.test.mjs`只更新既有Driver receipt正反例，不进入Source Set。该口径取代旧规格的`31/50/10+14`及初版`32/51`，不改变O..A `25=15 M+10 A`。

## 3. Driver Request 与适用集合

Driver 传入对象固定为下列七字段，`attempt_identity`必须与当前 INITIAL cycle 使用同一深冻结对象引用，其他字段不得缺失或增加：

```text
{
  case_id,
  attempt_identity,
  type: "PRECONDITION_API",
  kind,
  source_observation_ref: "setup-baseline-api",
  expected_apis
}
```

`source_observation_ref`唯一解释为 `SOURCE_LOCATOR_TOKEN`，不是 observation id、path 或 raw ref。Runner 必须按本规格第 5 章在当前 attempt 内解析出 actual raw ref；禁止把固定字符串写入任何 `*_ref`字段或从目录扫描补齐。

Runner内部factory固定接收：

```text
createFamilyObservationSink({
  web_origin,
  attempt_root,
  case_execution,
  attempt_identity,
  setup_baseline
})
```

Common传入factory的`setup_baseline`是深冻结seed，恰含`active_binding`和`subject_transaction_baseline_revision`；不得预填、伪造或从其他Page复制`projection_receipt`。Page attach后、Driver调用前，Bridge必须通过现有`waitForApi({operation_id:"API-CTX-002",method:"GET",expected_http_status:200}) -> waitForProjectionRefresh()`等待首个同源Projection；sink以该完整exchange在内部原子形成`resolved_setup_baseline={active_binding,projection_receipt,subject_transaction_baseline_revision}`。read revision必须等于seed和attempt identity的初始subject baseline，后续Projection refresh不得替换该receipt。Family沿用`setup_baseline=null`。禁止增加sink公开方法、环境变量、checkout读取、第二个client factory或Page前置capture。

适用集合固定为：

| kind | case_id | mode |
| --- | --- | --- |
| `REPLACE_OPTION_ID` | `E2E-CANVAS-005.STALE_OPTION_BLOCKED` | `REQUEST_MUTATION` |
| `ADVANCE_HEAD` | `E2E-CANVAS-006.STALE_TOKEN_BLOCKED` | `DIRECT_COMMAND` |
| `REPLACE_IMPACT_TOKEN` | `E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED` | `REQUEST_MUTATION` |
| `SUBMIT_TEXT_BLOCKED_COMMAND` | `E2E-CANVAS-007.TEXT_BLOCKED` | `DIRECT_COMMAND` |
| `ADVANCE_HEAD` | `E2E-CANVAS-007.REVISION_CONFLICT` | `DIRECT_COMMAND` |
| `SUBMIT_READONLY_COMMAND` | `E2E-CANVAS-007.READONLY` | `DIRECT_COMMAND` |

其他 case/kind、REOPEN、第二次调用、并发或跨 attempt 对象固定拒绝。

## 4. DIRECT_COMMAND 完整请求

共同外层字段固定为：

```text
kind_slug = ASCII lowercase(kind)，并把每个"_"替换为"-"
request_id = "e2e.precondition.<attempt_ordinal>.<kind_slug>.request"
command_id = "e2e.precondition.<attempt_ordinal>.<kind_slug>.command"
base_revision = attempt_identity.subject_baseline_revision
binding = exact Bootstrap active binding，与Manifest、Runtime和setup-baseline逐字段相等
```

URL固定为当前 Page origin 下：

```text
/api/v1/projects/<percent-project_id>/models/<percent-model_id>/contexts/<percent-context_id>/commands
```

### 4.1 ADVANCE_HEAD

完整业务字段固定为：

```json
{
  "command_type": "CREATE_ELEMENT",
  "payload": {
    "kind": "OBJECT",
    "element_id": "object.common.precondition.advance.<attempt_ordinal>",
    "name": "E2E Precondition Advance <attempt_ordinal>",
    "layout": {"x": 24, "y": 24}
  }
}
```

`element_id`必须在 setup-baseline Projection 中不存在。响应必须为 `200/COMMITTED`，`affected_ids`恰包含该 ID，`meta.committed_revision`非空且不同于旧 baseline。该提交是独立的正式业务提交，不属于 subject transaction。

Runner 内部事务基线原子重绑定为：

```text
from_revision = attempt_identity.subject_baseline_revision
to_revision = response.meta.committed_revision
baseline_exchange_ref = 当前 ADVANCE_HEAD API_EXCHANGE
```

深冻结 `attempt_identity`不得修改；后续 UI subject request必须仍携带旧 `from_revision`并得到`409/REVISION_CONFLICT`，事务 delta 与 REOPEN 则相对于 `to_revision`计算。缺少唯一 committed revision、Head未移动、subject request改用新 revision或重绑定发生在响应证据落盘前均为 `E2E_PRECONDITION_BASELINE_INVALID/4`。

### 4.2 SUBMIT_TEXT_BLOCKED_COMMAND

本 case 证明产品 command 的领域拒绝，不宣称 Text Generator fault。完整业务字段固定为：

```json
{
  "command_type": "CREATE_FACT",
  "payload": {
    "kind": "CONSUMPTION",
    "object_id": "object.common.input",
    "state_id": "state.common.text-blocked.missing",
    "process_id": "process.common.action",
    "layout": {"x": 250, "y": 160}
  }
}
```

setup-baseline Projection必须证明 Object/Process 存在且 missing State 不存在。结果固定为`422/DOMAIN_REJECTED/retryable=false`、Head不变和八项事务 delta 全零。

### 4.3 SUBMIT_READONLY_COMMAND

完整业务字段固定为：

```json
{
  "command_type": "CREATE_FACT",
  "payload": {
    "kind": "CONSUMPTION",
    "object_id": "object.common.input",
    "process_id": "process.common.action",
    "layout": {"x": 250, "y": 160}
  }
}
```

setup-baseline Projection必须证明两个端点存在；INITIAL Runtime必须已按 exact Fault Plan 武装 `READONLY`。结果固定为`409/READ_ONLY_REVISION/retryable=false`、Head不变和八项事务 delta 全零；REOPEN不创建 client、不重新武装 fault。

## 5. REQUEST_MUTATION 完整契约

两类 mutation 不立即发送 HTTP。`execute()`只能为 attached Page 安装一次性 `page.route()`；仅允许对下一条 exact match 调用 `route.continue({postData:<canonical-mutated-body>})`。禁止 `fulfill/abort/fallback`、修改 URL/method/header、第二条 route、Node HTTP、修改 Vue/Pinia/DOM 或伪造 response。

共同状态固定为：

```text
READY -> ARMED -> MATCHED -> CONSUMED -> CLOSED
READY -> ARMED -> CLOSED = E2E_PRECONDITION_MATCH_MISSING/4
READY -> ARMED -> second match = E2E_PRECONDITION_MULTIPLE_MATCH/4
```

原始 UI body 与改写后 body分别以 exact bytes写为两个 `API_REQUEST_BODY`；正式`API_EXCHANGE.request_ref`必须指向改写后 actual body。两个 raw refs、source exchange ref、JSON Pointer、旧值、新值和最终 exchange ref由内存 receipt闭合并全部进入 Artifact Index；不得新增或伪装第二种 exchange Schema。

### 5.1 REPLACE_OPTION_ID

source locator解析为当前 Driver 开始后、precondition调用前唯一尚未消费的：

```text
API-EDT-001 / GET / 200
intent=CREATE_FACT
endpoint=object.common.input
endpoint=process.common.action
```

exact match固定为当前 command URL、`POST`、`command_type=CREATE_FACT`、`base_revision=attempt_identity.subject_baseline_revision`，且：

```text
payload.capability_query_id = source response.data.capability_query_id
payload.selected_option_id 属于 source response.data.options[].option_id
```

唯一改写：

```text
JSON Pointer = /payload/selected_option_id
replacement = "option.e2e.invalid.stale"
```

replacement必须不属于source options，其他字段与原始 UI body逐byte语义相等。结果固定`422/DOMAIN_REJECTED`。

### 5.2 REPLACE_IMPACT_TOKEN

source locator解析为当前 Driver 开始后、precondition调用前唯一尚未消费的：

```text
API-EDT-001 / GET / 200
selection_id=state.common.subject
intent=DELETE_CONSTRUCT
```

source response必须恰有一个enabled `DELETE_CONSTRUCT` option，且包含非空 `impact_token`。exact match固定为当前 command URL、`POST`、`command_type=DELETE_CONSTRUCT`、旧 baseline、`payload.construct_kind=STATE`、`payload.construct_id=state.common.subject`，且原始 token逐字符等于source token。

唯一改写：

```text
JSON Pointer = /payload/impact_token
replacement = "impact.e2e.mismatched.token"
```

replacement必须不同于source token，其他字段与原始 UI body逐byte语义相等。结果固定`422/DOMAIN_REJECTED`。

## 6. Receipt 与证据

`DIRECT_COMMAND`成功返回深冻结：

```text
{mode,kind,source_locator,resolved_source_refs,raw_request,actual_request,response,exchange_ref,baseline_rebind}
```

其中`source_locator`逐字等于`setup-baseline-api`，`resolved_source_refs`恰为：

```text
{
  setup_projection_exchange_ref: <exact API_EXCHANGE raw ref>,
  setup_projection_response_ref: <exact API_RESPONSE_BODY raw ref>
}
```

两个ref必须逐字段等于sink内部`resolved_setup_baseline.projection_receipt`内对应ref。除 `ADVANCE_HEAD`外 `baseline_rebind=null`；`ADVANCE_HEAD`恰为`{from_revision,to_revision,baseline_exchange_ref}`。`REQUEST_MUTATION`的 `execute()`返回深冻结 armed receipt：

```text
{mode,kind,source_locator,source_exchange_ref,match,json_pointer,replacement,state:"ARMED"}
```

`match`恰含五字段：

```text
{
  operation_id: "API-EDT-002",
  method: "POST",
  normalized_url: <当前command path>,
  command_type: "CREATE_FACT|DELETE_CONSTRUCT",
  base_revision: <attempt_identity.subject_baseline_revision>
}
```

mutation在唯一UI请求与唯一正式response闭合后，Runner内部生成且只生成一个深冻结final receipt：

```text
{
  mode,
  kind,
  source_locator,
  source_exchange_ref,
  match,
  json_pointer,
  original_value,
  replacement,
  original_request_ref,
  actual_request_ref,
  response,
  exchange_ref,
  state: "CONSUMED"
}
```

`original_request_ref/actual_request_ref`均为`API_REQUEST_BODY`；后者必须逐字段等于正式`API_EXCHANGE.request_ref`，前者必须不同路径且保存route改写前原始UI bytes。`original_value`逐字符等于source锁定的旧option/token，`response/exchange_ref`逐字段等于唯一正式exchange。上述对象均按`additionalProperties=false`语义处理；实现不得增加时间、目录、callback或占位字段。

Common Driver必须按`mode`分支：`DIRECT_COMMAND`要求`raw_request/actual_request/response/exchange_ref`完整；`REQUEST_MUTATION`只接受上述exact ARMED形状，禁止要求或补写占位HTTP字段。Driver仍恰调用一次`recordPrecondition()`。mutation在对应`WAIT_API`消费时由sink闭合为final receipt，并校验 original/actual request raw refs及最终 exchange；armed receipt不得被当成HTTP response。Attempt finalize前必须恰有零或一个final precondition receipt，且需要precondition的case必须为`CONSUMED`。

业务 status/error 不匹配为attempt FAILED；raw bytes/ref、route match、baseline、origin、redirect或证据事务不可信固定升级为`EVIDENCE_TRANSACTION/4`。首错顺序固定：request形状与case映射 -> source locator/ref -> state/reuse -> origin/path/match -> raw request mutation -> response语义 -> baseline rebind -> finalize completeness。

## 7. 验收

后继 Runner test至少覆盖：

1. 六个case/kind映射与其他case拒绝；
2. 三类完整DIRECT command body、binding、ID、status/error和零/一次baseline重绑定；
3. 两类mutation source解析、五字段exact match、唯一JSON Pointer改写、original/actual raw ref和十三字段最终receipt；
4. duplicate/concurrent/REOPEN/cross-attempt、绝对URL、redirect、route多匹配/零匹配、wrong source、wrong old value、修改额外字段反例；
5. `ADVANCE_HEAD`后旧base subject 409、相对新baseline零delta及REOPEN unchanged；
6. `recordPrecondition` armed/final边界与Artifact Index完整性；
7. 既有Node 22 Runner回归、`npm run contract:validate`和`git diff --check`。

## 8. 回滚与状态边界

回滚必须同时恢复本规格、Common Driver设计和Family Controlled Invocation第8章；不得保留“固定locator是假raw ref”或把mutation退化为直接POST。

本设计冻结不构成真实`194/388`、E2E Report、`GATE-06-03`、Candidate、Activation、Capability、production发布或ISO 19450:2024符合性证据。
