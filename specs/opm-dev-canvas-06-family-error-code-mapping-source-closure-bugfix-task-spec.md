# DEV-CANVAS-06 Family Error Code Mapping 与 Source Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`IMPLEMENTATION_NOT_STARTED`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Family Driver 错误码契约与 Runtime 实际命令路径之间的缺口：将 `LocalApiService.java` 纳入 Final Production Source Chain 的 Stage R allowlist，仅把活动 Golden Replay 明确冻结的 `15` 类 Control 和 `4` 类 Structural 非法组合映射为 `MODIFIER_COMBINATION_INVALID`，并以真实 `API-EDT-001 -> API-EDT-002` HTTP raw `ErrorEnvelope` 证明该行为。

本规格不实现代码，不修改 OpenAPI、Java、Node、Schema、Profile、Golden、SQLite、release root、Git commit、Gate 或 Capability 状态。

## 2. 最小复现与 Root Cause

### 2.1 已查证事实

1. 活动 Golden Replay `0.2` 中恰有 `19=15 CTRL+4 STRUCT` 个 BLOCKED case 的 `error_code=MODIFIER_COMBINATION_INVALID`；
2. `ApiErrorCode`、`ApiExceptionHandler` 和 OpenAPI `CapabilityReasonCode` 已支持该值，活动工作树的 `ErrorDetail.code` 同步属于既有 Stage R contract 子切片；
3. `LocalApiService.java` 的 Control/Structural 校验当前经 `domain(message)`返回 `DOMAIN_REJECTED/422`，因此仅修改 OpenAPI 和测试不能形成真实 wire 闭包；
4. `LocalApiControllerTest` 当前没有通过真实 Project/Model/Element/Fact、候选查询和 command 路径取得这两类 `422` raw body 的正反证据；
5. 现有 Stage R allowlist 不包含 `LocalApiService.java`，实现者不能合法修正生产映射。

### 2.2 Root Cause

Family Driver 设计把 Golden Replay 的稳定领域错误码误判为既有 Runtime 行为，只给 OpenAPI、Node contract test 和 Java MVC test 分配修改权，没有沿真实 `LocalApiService.edit()` 校验路径验证 top-level wire code。结果是 Schema 可以接受 `MODIFIER_COMBINATION_INVALID`，但生产 Service 仍可能返回 `DOMAIN_REJECTED`。

### 2.3 为什么此前未发现

此前验收聚焦 Golden Replay、Schema 枚举和 Driver 的期望映射；MVC 要求只冻结到 `ApiExceptionHandler` raw body，没有要求使用真实命令构造非法 Control/Structural 输入，因此直接抛异常或构造对象的测试仍可能表面通过。

## 3. Fix Strategy

1. 将 `LocalApiService.java` 加入 Stage R；后继Service Regression/Source Guard闭包又将既有Service测试纳入，API/Runtime contract 子切片由 `3 M`最终扩为`5 M`；
2. 只对第4章列出的19个语义 case，在识别到对应非法组合的最窄校验点返回 `MODIFIER_COMBINATION_INVALID/422`；
3. 未列出的领域错误保持既有 top code、detail code、HTTP status、category 和 retryable，不允许批量替换 `domain()`；
4. `LocalApiControllerTest` 必须走真实 Service、临时 SQLite、真实候选与命令路径，并直接验证同一组HTTP raw bytes；
5. 本规格当时把Stage R由`13 M`修正为`14 M`、`O..R`修正为`35=25 M+10 A`；后继Controlled Invocation、Stage A Release Discovery/Source Guard及Service Regression/Source Guard闭包最终取代为R=`23=21 M+2 A`和`O..R=43=31 M+12 A`；
6. `LocalApiService.java`始终不进入Runner Source Set，只通过同一clean R重建后的Runtime JAR identity闭合；Source Set活动版本现由后继闭包升级为`0.2/24`。

## 4. 唯一错误码映射

### 4.1 Control：恰好15项

以下完整 case ID 必须映射为HTTP `422`、`ErrorEnvelope.error.code=MODIFIER_COMBINATION_INVALID`、`category=DOMAIN`、`retryable=false`：

```text
G-OPL-CTRL-001.BASE_CAPABILITY_MISMATCH.BLOCKED
G-OPL-CTRL-001.DUPLICATE_CONTROL_CAPABILITY.BLOCKED
G-OPL-CTRL-001.DUPLICATE_CONTROL_SEGMENT.BLOCKED
G-OPL-CTRL-001.EFFECT_OUTPUT_SEGMENT.BLOCKED
G-OPL-CTRL-001.EVENT_CONDITION_COMBINATION.BLOCKED
G-OPL-CTRL-001.INDEPENDENT_CONTROL_FACT.BLOCKED
G-OPL-CTRL-001.MISSING_CONTROL_CAPABILITY.BLOCKED
G-OPL-CTRL-001.MISSING_CONTROL_SEGMENT.BLOCKED
G-OPL-CTRL-001.MODIFIER_CAPABILITY_REF_MISMATCH.BLOCKED
G-OPL-CTRL-001.MODIFIER_VALUE_REF_MISMATCH.BLOCKED
G-OPL-CTRL-001.NON_INPUT_SEGMENT.BLOCKED
G-OPL-CTRL-001.OPTION_PAYLOAD_MISMATCH.BLOCKED
G-OPL-CTRL-001.RESULT.BLOCKED
G-OPL-CTRL-001.STATE_RESULT.BLOCKED
G-OPL-CTRL-001.UNKNOWN_CONTROL_CAPABILITY.BLOCKED
```

运行时谓词固定为：Control 只能作为既有基础 Procedural Fact 的受控更新出现，并且 Modifier 必须恰为一个原子对：

```text
control.capability = CAP-ISO-CTRL-001..008
control.segment = PROCESS_INPUT
```

字段级非法输入固定如下；`base capability`和Modifier值均来自对应exact Golden input fixture：

| Variant | 唯一非法输入 |
| --- | --- |
| `BASE_CAPABILITY_MISMATCH` | base=`CAP-ISO-PROC-001`，`control.capability=CAP-ISO-CTRL-002`，不在该Control允许的基础能力集合 |
| `DUPLICATE_CONTROL_CAPABILITY` | 同一Modifier数组出现两个`control.capability` |
| `DUPLICATE_CONTROL_SEGMENT` | 同一Modifier数组出现两个`control.segment` |
| `EFFECT_OUTPUT_SEGMENT` | base=`CAP-ISO-PROC-003`且`control.segment=PROCESS_OUTPUT` |
| `EVENT_CONDITION_COMBINATION` | 同时出现`CAP-ISO-CTRL-001`和`CAP-ISO-CTRL-005`两个Control capability |
| `INDEPENDENT_CONTROL_FACT` | `fact.capability_ref=CAP-ISO-CTRL-001`且不是对既有Procedural Fact的Control更新 |
| `MISSING_CONTROL_CAPABILITY` | 只有`control.segment=PROCESS_INPUT` |
| `MISSING_CONTROL_SEGMENT` | 只有`control.capability=CAP-ISO-CTRL-001` |
| `MODIFIER_CAPABILITY_REF_MISMATCH` | 使用非法字段`control.capability_ref`代替`control.capability` |
| `MODIFIER_VALUE_REF_MISMATCH` | `control.capability=CAP-ISO-CTRL-001@0.2.0`，值不是裸Capability ID |
| `NON_INPUT_SEGMENT` | `control.segment=PROCESS_OUTPUT` |
| `OPTION_PAYLOAD_MISMATCH` | 原子对之外额外出现`control.option_id` Modifier |
| `RESULT` | base=`CAP-ISO-PROC-002`与`CAP-ISO-CTRL-001`不兼容 |
| `STATE_RESULT` | base=`CAP-ISO-PROC-007`与`CAP-ISO-CTRL-001`不兼容 |
| `UNKNOWN_CONTROL_CAPABILITY` | `control.capability=CAP-ISO-CTRL-999` |

实现可以按现有数据结构合并谓词，但不得扩大可观察case集合。特别地，`OPTION_PAYLOAD_MISMATCH`不是`capability_query_id`或`selected_option_id`过期/不匹配；后两者属于第4.3节排除集。

### 4.2 Structural：恰好4项

只有以下完整 case ID 映射为同一 top code：

```text
G-OPL-STRUCT-001.FORWARD_TAG_MISSING.BLOCKED
G-OPL-STRUCT-003.REVERSE_TAG_MISSING.BLOCKED
G-OPL-STRUCT-008.COMPLETENESS_INVALID.BLOCKED
G-OPL-STRUCT-010.BIDIRECTIONAL_NULL_TAG.BLOCKED
```

对应谓词仅包括：必需forward标签缺失、bidirectional时reverse标签缺失、fan完整性值/适用性非法、bidirectional标签与方向组合为空或不完整。重复标签、未知/不受支持槽位、其他方向不支持、端点类型和State owner错误不因本规格改码。

字段级形状固定如下：

| Case | 唯一非法输入 |
| --- | --- |
| `G-OPL-STRUCT-001.FORWARD_TAG_MISSING.BLOCKED` | `CAP-ISO-STRUCT-001`、`DIRECTED`且`labels=[]`，缺必需forward槽位 |
| `G-OPL-STRUCT-003.REVERSE_TAG_MISSING.BLOCKED` | `CAP-ISO-STRUCT-003`、`BIDIRECTIONAL`且`labels=[]`，未形成必需forward/reverse标签原子对；case identity固定为reverse缺失 |
| `G-OPL-STRUCT-008.COMPLETENESS_INVALID.BLOCKED` | `CAP-ISO-STRUCT-008`却声明`collection_completeness=COMPLETE` |
| `G-OPL-STRUCT-010.BIDIRECTIONAL_NULL_TAG.BLOCKED` | `CAP-ISO-STRUCT-010`、`BIDIRECTIONAL`且`labels=[]`，双向关系使用null-tag组合 |

### 4.3 明确排除集

下列错误不得映射为 `MODIFIER_COMBINATION_INVALID`：

- endpoint kind、cross-kind、fan endpoint/ordinal/empty、process endpoint错误继续保持 `DOMAIN_REJECTED`，Runner受控分类为 `ENDPOINT_KIND_MISMATCH`；
- State owner不匹配继续保持 `DOMAIN_REJECTED`，Runner受控分类为 `STATE_OWNER_MISMATCH`；
- Fact/Element/State/Context不存在、Fact capability不匹配、重复业务标识、只读或revision冲突保持既有错误；
- Procedural/Structural/Control候选query或option过期、不匹配保持既有 `DOMAIN_REJECTED`；
- Structural重复标签、未知标签槽位、不受支持方向等未列错误保持既有分类；
- 请求shape、字段类型、空值和解析错误继续由 `INVALID_ARGUMENT/400`承担；
- persistence、validation、text/profile、fault injection错误保持各自稳定错误码。

禁止把全部 `domain()`、全部 Control错误、全部 Structural错误或全部HTTP 422统一改码。若新增case需要该错误码，必须先更新Golden/Replay与独立bugfix规格。

## 5. 修改边界

### 5.1 Stage R API/Runtime contract：`5 M`

```text
M docs/contracts/openapi/opm-local-api-v1.yaml
M scripts/validate-contracts.mjs
M services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
M services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java
M services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
```

允许：

- OpenAPI `ErrorDetail.code`新增/验证该枚举；
- Node contract正反例；
- Service在第4章19项最窄谓词处映射稳定错误码；
- Controller真实命令路径raw body正反例；
- 既有Service测试只同步19项目标集合，并保留candidate/endpoint/owner等排除集原码。

禁止：

- 修改 `ApiErrorCode`、`ApiExceptionHandler`、`LocalApiController`、generated contract、公共请求/响应shape、其他错误码或HTTP status；
- 修改SQLite DDL、Profile/Golden/Replay/fixture、Driver外产品逻辑；
- 新增依赖、helper、test controller、第二套错误分类器或message解析。

### 5.2 Family Driver：`4 M`

既有Family Driver子切片保持：

```text
M scripts/release-canvas06-e2e-run.test.mjs
M tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs
```

`release-canvas06-e2e-run.test.mjs`已属于原Stage R七项，因此API/Runtime `5 M`与Family Driver `4 M`不能直接与原7项相加。

### 5.3 Stage R 与累计 allowlist

本规格冻结的错误码子集最终由后继Service Regression/Source Guard闭包扩为Stage R中的5项API/Runtime contract；Stage R总范围最终为`23=21 M+2 A`。完整路径以Final Production Source Chain规格第9章为准，其中本规格新增：

```text
M services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
```

累计集合固定为：

```text
O..A = 24 = 14 M + 10 A  # 不变
O..R = 41 = 29 M + 12 A
```

比较继续使用UTF-8 path byte order的有序`status + TAB + path`数组；禁止只改计数、遗漏路径、rename/copy推断、extra或missing。

## 6. LocalApiControllerTest 真实路径契约

测试必须使用：

```text
real LocalApiService
+ temp SQLite / ProjectDatabaseFactory
+ LocalApiController
+ ApiExceptionHandler
+ LocalWriteRequestGuard
+ MockMvc HTTP boundary
```

每个代表性正例必须按以下顺序执行：

```text
HTTP创建Project
-> HTTP创建Model
-> HTTP创建所需Element/State
-> HTTP调用API-EDT-001取得真实capability_query_id/selected_option_id
-> 必要时HTTP提交合法基础Fact并以新Head再次取得UPDATE_FACT候选
-> HTTP调用API-EDT-002发送唯一非法Control或Structural payload
-> MvcResult.getResponse().getContentAsByteArray()
```

对同一raw bytes必须同时断言：

1. HTTP `422`；
2. Content-Type为`application/problem+json`；
3. bytes是合法UTF-8 JSON且只解析一次作为断言输入；
4. `error.code=MODIFIER_COMBINATION_INVALID`；
5. `error.category=DOMAIN`、`error.retryable=false`；
6. `error.diagnostic_id`存在并符合现有wire；
7. raw body通过活动OpenAPI ErrorEnvelope Schema。

最小正例必须覆盖一个Control和一个Structural谓词；最小负例必须通过同一真实命令路径证明至少一个endpoint/owner错误和一个候选过期/不匹配错误仍保持既有top code。禁止mock Service、直接调用Handler、直接抛 `ApiException`、调用私有校验方法、构造预期Map或只搜索message。

## 7. Source Set、Runtime JAR 与生产Join

`LocalApiService.java`不属于活动Runner Source Set `0.2/24`，不得：

- 加入Source Set Schema `prefixItems`；
- 以错误码修正为由继续升级Source Set、Report或Manifest版本；
- 伪装为Runner source entry或纳入`runner_source_sha256`。

唯一身份路径为：

```text
clean R tree
-> build exact services/local-runtime Runtime JAR
-> Handoff/Manifest runtime_jar_ref raw bytes + byte_length + sha256
-> attempt-local inputs/build/local-runtime.jar
-> Runtime process code source/raw SHA
-> Attempt Artifact runtime refs
-> Report runtime refs
```

R中的24项Runner/Driver/bridge source raw ref从同一clean tree复算。相对A，只有下列8个Source Set entry允许变化或新增：

```text
scripts/release-canvas06-e2e-run.mjs
scripts/canvas06-e2e-run-preflight.mjs
scripts/canvas06-e2e-run-stage.mjs
scripts/canvas06-e2e-run-report.mjs
tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs
tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs
tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs
tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

其余16项必须与A逐byte相同；全部24项的source与mirror raw ref必须从R复算，随后重算aggregate `source_set_sha256`。Runtime JAR也必须从同一R重建；复用A/O的JAR、只更新source ref未重建JAR、把Java SHA写入Runner Source Set或六方source commit不等，均拒绝生成可消费Manifest/Report。

## 8. 实现顺序与验收

唯一顺序：

```text
ADD_FAILING_REAL_CONTROL_HTTP_TEST
-> ADD_FAILING_REAL_STRUCTURAL_HTTP_TEST
-> ADD_UNLISTED_DOMAIN_ERROR_REGRESSION
-> IMPLEMENT_19_CASE_NARROW_MAPPING
-> VALIDATE_OPENAPI_AND_RAW_ERROR_ENVELOPE
-> RUN_FAMILY_DRIVER_TARGETED_TESTS
-> RUN_STAGE_A_CONTROLLED_REGRESSION
-> FORM_CLEAN_R_WITH_14_M
-> VERIFY_O_TO_R_35_PATHS
-> REBUILD_RUNTIME_AND_ALL_PRODUCTION_INPUTS_FROM_R
```

后继实现至少执行：

```text
npm run contract:validate
./mvnw -pl services/local-runtime -Dtest=LocalApiControllerTest test
./mvnw -pl services/local-runtime -Dtest=LocalApiServiceTest,LocalApiControllerTest test
node --test scripts/release-canvas06-e2e-run.test.mjs
npm run release:canvas06:e2e:runner:test
npm run lint
npm run typecheck
npm run build
git diff --check
```

验收必须机器证明：Golden Replay目标集合=`19=15+4`、Stage R=`23=21 M+2 A`、`O..R=43=31 M+12 A`、Runner Source Set=`0.2/24`。Schema、MVC、unit或source计数通过均不代表真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性。

## 9. 回滚边界

本修正未形成R前，回滚只恢复第5.1节五个API/Runtime contract路径，并恢复所有引用本规格的活动设计口径；不得修改A及更早commit、历史Manifest/Report/attempt root或用户SQLite。

R及其版本根形成后，禁止原地改写或删除不可变R输入。回滚必须：停止消费该R，恢复四路径形成新的后继source commit，从新commit重建Runtime JAR/Handoff/Intake/Web/Common/Manifest，并重新执行installed verifier；旧R和失败证据只读保留。不得只回滚 `LocalApiService.java`而继续消费旧Runtime JAR或旧Manifest。

## 10. 状态

设计状态：`FROZEN_FOR_IMPLEMENTATION`。

实现状态：`IMPLEMENTATION_NOT_STARTED`。本规格不证明19项已通过真实HTTP，不证明R已创建，也不提升E2E Report、Gate、Candidate、Activation、Capability、production或ISO状态。
