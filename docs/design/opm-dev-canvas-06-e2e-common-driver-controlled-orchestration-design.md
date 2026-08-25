# DEV-CANVAS-06 E2E Common Driver 与受控编排设计

文档版本：`v1.2`

文档状态：`FROZEN_FOR_IMPLEMENTATION`

适用版本：E2E Manifest `0.2/0.2.0`、Attempt Artifact `0.2`、E2E Report `0.2`

## 1. 目的

本设计关闭以下三个实现自由裁量点：

1. `DRIVER-COMMON` 对16个Common case的初始状态、页面动作、selector、API与错误码映射；
2. controlled bundle、活动Manifest、exact Runtime JAR、production Web dist与fresh attempt root之间的唯一信任和复制关系；
3. `INITIAL -> REOPEN`的进程、storage、事务基线和证据采集顺序。

本设计不生成Manifest、Report、Gate、Candidate、Activation或Capability证据，不修改公共HTTP wire、SQLite DDL、产品默认配置或Recovery协议。

## 2. 已确认的冲突与修正决定

### 2.1 Manifest第四Driver冲突

活动Manifest Schema `0.2`的Common case要求`driver_id=DRIVER-COMMON`，但`driver_catalog`当前只允许三个Family driver。该Schema不能封闭证明Common driver source身份。

唯一修正：`driver_catalog`固定为四项、固定顺序：

```text
0 DRIVER-PROCEDURAL
1 DRIVER-CONTROL
2 DRIVER-STRUCTURAL
3 DRIVER-COMMON
```

第四项只包含`driver_id/source_ref`，`source_ref.kind=E2E_DRIVER_SOURCE`，`path=inputs/drivers/common-driver.mjs`。不得把Common driver藏入Family driver、Runner source ref、fixture factory或checkout fallback。

### 2.2 历史Common输入不足

历史Common BASE/INPUT只包含identity与expected result，不包含可复核初始图、页面动作或selector。因此：

- 历史`0.1.0` Catalog与32个fixture保持只读；
- 活动`0.2.0` Catalog仍承接base/input raw ref、事务和REOPEN结果；
- 动作语义唯一由`common-driver.mjs`内的冻结`COMMON_CASES`常量承接，并由Manifest第四driver raw ref锁定；
- Materializer只建立本节定义的`M0`最小初始模型；`SETUP`阶段通过真实产品API/UI建立case前置状态，完成后才采集事务基线；不得把SETUP计入subject事务。

### 2.3 错误码修正

活动Common输入按下列口径重建：

```text
AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED -> 无HTTP错误；UI_BLOCKED_AMBIGUOUS
STALE_OPTION_BLOCKED                -> DOMAIN_REJECTED
STALE_TOKEN_BLOCKED                 -> REVISION_CONFLICT
MISMATCHED_TOKEN_BLOCKED            -> DOMAIN_REJECTED
ASSET_MISSING                       -> TEXT_GENERATION_BLOCKED
TEXT_BLOCKED                        -> DOMAIN_REJECTED
REVISION_CONFLICT                   -> REVISION_CONFLICT
PERSISTENCE_FAILED                  -> PERSISTENCE_FAILED
READONLY                            -> READ_ONLY_REVISION
```

`AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED`的`expected_error_code`必须省略；其余八个BLOCKED case必须与上表逐字相等。该决定取代Fault Launcher实现规格中“除三个fault case外其他Common业务字段不变”的旧限制；只允许按本表修正错误码/空码，不改变case ID、case顺序和事务模板。

## 3. Driver机器常量

### 3.1 顶层形状

`common-driver.mjs`必须导出且只导出以下执行入口和只读常量：

```text
COMMON_DRIVER_ID = "DRIVER-COMMON"
COMMON_DRIVER_VERSION = "0.2.0"
COMMON_CASES = Readonly<Record<case_id, CommonCase>>
executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) -> Promise<void>
```

`COMMON_CASES`必须恰好16项，与活动Common Catalog同序且无额外case。`executeCase`只能按exact `case_id`索引，不得由case名称片段、suite、expected status或fixture内容猜测动作。

### 3.2 CommonCase封闭字段

每项固定字段：

```json
{
  "case_id": "E2E-CANVAS-...",
  "initial_state": "M0|M_OBJECT|M_STATE|M_STATE_SUPPRESSED|M_OBJECT_PROCESS|M_STATE_OBJECT_PROCESS|M_FACT|M_DELETABLE_STATE|M_READONLY_TARGET",
  "setup_steps": [],
  "subject_steps": [],
  "expected_apis": [
    {
      "operation_id": "API-EDT-001|API-EDT-002",
      "method": "GET|POST",
      "ordinal": 1,
      "expected_http_status": 200,
      "expected_error_code": null
    }
  ],
  "expected_transaction": "TX_COMMIT_1|TX_NO_COMMIT",
  "reopen_assertion": "REOPEN_COMMITTED|REOPEN_UNCHANGED"
}
```

`expected_apis[]`长度只允许`1|2`，每项`additionalProperties=false`，并与`subject_steps`中的`WAIT_API`按出现顺序一一对应；`operation_id/method/ordinal`逐字段相等。`expected_http_status`是整数且只允许`200|409|422|500`，`expected_error_code`只允许`null|DOMAIN_REJECTED|REVISION_CONFLICT|TEXT_GENERATION_BLOCKED|PERSISTENCE_FAILED|READ_ONLY_REVISION`，具体组合以第5章表格为准。`REVERSE_DRAG_NORMALIZED`恰有两项，依次为`API-EDT-001/GET/1/200/null`和`API-EDT-002/POST/1/200/null`；其余15个case各恰有一项。`PRECONDITION_API`自身产生的exchange进入独立API artifact，不进入`expected_apis[]`，也不得改变对应`WAIT_API`的ordinal。字段缺失、额外字段、未知枚举、case顺序不等或常量可变，均为`E2E_DRIVER_MAPPING_INVALID/3`。

### 3.3 初始状态

`M0`由Common Materializer写入空业务模型、root Context、base Revision及可读空Projection；其他状态只能由SETUP在同一attempt storage中从`M0`建立：

| 状态 | SETUP完成后的固定语义 |
| --- | --- |
| `M_OBJECT` | 一个可编辑Object `object.common.owner` |
| `M_STATE` | `M_OBJECT`加State `state.common.subject`，名称`draft`，角色`INITIAL` |
| `M_STATE_SUPPRESSED` | `M_STATE`且当前Context中的State presentation为`SUPPRESSED` |
| `M_OBJECT_PROCESS` | Object `object.common.input`与Process `process.common.action` |
| `M_STATE_OBJECT_PROCESS` | `M_OBJECT_PROCESS`加State `state.common.subject`，Owner为`object.common.input`，名称`draft`，角色`INITIAL` |
| `M_FACT` | `M_OBJECT_PROCESS`加基础Fact `fact.common.subject` |
| `M_DELETABLE_STATE` | `M_STATE`且DELETE_CONSTRUCT capability返回enabled与有效impact token |
| `M_READONLY_TARGET` | `M_OBJECT_PROCESS`；只读性由Fault Launcher对真实head投影，不写seed标志 |

SETUP只能调用exact Runtime JAR的正式`API-EDT-001/002`，不得直写SQLite、调用test controller、修改Vue store或伪造Projection。SETUP完成后必须重新读取Workspace/Projection/Text/Revision并写`setup-baseline.json`，随后Runner才开始事务delta计数。

## 4. Selector与Step词汇

### 4.1 Selector

仅允许三类selector：

```text
T(id)       = page.getByTestId(id)
X(targetId) = page.locator('[data-cell-id="' + cssEscape(targetId) + '"]')
R(role,name)= page.getByRole(role,{name,exact:true})
```

禁止CSS class、中文自由文本模糊匹配、XPath、坐标点击、`.first()`/`.nth()`、sleep和基于DOM顺序的selector。`X()`必须先从已验证Projection取得exact target ID，再要求locator唯一可见；不得用X6内部随机cell ID。

### 4.2 八类Subject Step

`subject_steps`只允许以下八类封闭JSON对象；每项`additionalProperties=false`，字段必须与对应形状完全相等：

```json
{"type":"CLICK_TEST_ID","test_id":"<non-empty>"}
{"type":"CLICK_CELL","target_id":"<exact projection target id>"}
{"type":"FILL_TEST_ID","test_id":"<non-empty>","value":"<string>"}
{"type":"SET_ROLE","role":"INITIAL|DEFAULT|FINAL","checked":true}
{"type":"SUBMIT_TEST_ID","test_id":"<non-empty>"}
{"type":"CLICK_ROLE","role":"button|checkbox|tab","name":"<exact accessible name>"}
{"type":"WAIT_API","operation_id":"API-EDT-001|API-EDT-002","method":"GET|POST","ordinal":1}
{"type":"PRECONDITION_API","kind":"ADVANCE_HEAD|REPLACE_OPTION_ID|REPLACE_IMPACT_TOKEN|SUBMIT_TEXT_BLOCKED_COMMAND|SUBMIT_READONLY_COMMAND","source_observation_ref":"<attempt内既有API observation id>"}
```

`SET_ROLE.checked`必须是JSON boolean，允许`true|false`；示例中的`true`不是常量，`STATE_CREATE_RENAME_ROLES`的`INITIAL=false`必须原样保留。`SET_ROLE`唯一selector为`T(p03-state-candidate|p03-state-inspector) + R(checkbox,role)`。`WAIT_API.ordinal`按同一subject内相同`operation_id+method`从`1`开始连续计数，禁止跳号。表5中的缩写必须机械展开成上述JSON后写入`COMMON_CASES`；表内断言属于expected observation，不得伪装成第九类step。

每步等待条件固定为：locator唯一且稳定两个animation frame；动作后等待指定API响应与Projection refresh完成。禁止固定毫秒sleep。`REPLACE_OPTION_ID/REPLACE_IMPACT_TOKEN`只改写下一条匹配的正式产品请求；`ADVANCE_HEAD`先提交独立正式命令再重置subject baseline；`SUBMIT_TEXT_BLOCKED_COMMAND/SUBMIT_READONLY_COMMAND`各发送一次由已验证Projection、binding和活动Manifest输入构造的正式`API-EDT-002`请求。其原始request/actual request/response必须进入API artifact，不能改写产品代码或绕过公共HTTP wire。

## 5. 16 Case精确映射

缩写：`C(id)=CLICK_CELL`、`T(id)=CLICK_TEST_ID`、`F(id,v)=FILL_TEST_ID`、`B(name)=CLICK_ROLE(button,name)`、`W(op,m,n)=WAIT_API`、`P(kind)=PRECONDITION_API(kind,最近一个已验证API observation ref)`。`TX_COMMIT_1`固定为`1/1/1/1/0/1/1/true`；`TX_NO_COMMIT`固定为八项全零且`draft_head_changed=false`。表中的UI、API和REOPEN文字均为必须写入assertion artifact的expected observation，不是自由文本提示。

| Case | 初始状态 | Subject页面序列 | 预期API/错误 | 事务 | REOPEN |
| --- | --- | --- | --- | --- | --- |
| `E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES` | `M_STATE` | `C(state.common.subject) -> F(p03-state-inspector-name,ready) -> SET_ROLE(INITIAL,false) -> SET_ROLE(DEFAULT,true) -> SET_ROLE(FINAL,true) -> B(保存 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`UPDATE_STATE`；SETUP创建State，subject只计一次rename/roles提交 | `TX_COMMIT_1` | `REOPEN_COMMITTED`，名称和三角色exact匹配 |
| `E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION` | `M_STATE_SUPPRESSED` | `C(state.common.subject) -> B(显式) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`STATE_EXPLICIT` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，presentation=`EXPLICIT` |
| `E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN` | `M_OBJECT` | `C(object.common.owner) -> T(p03-tool-state) -> C(object.common.owner) -> F(p03-state-name,mobile-ready) -> SET_ROLE(INITIAL,true) -> B(创建) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`CREATE_STATE`；viewport=`VP-390X844` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State可见且不溢出画布 |
| `E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP` | `M_STATE_OBJECT_PROCESS` | `C(state.common.subject) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1) -> T(p03-tab-text) -> T(p03-opl-sentence)` | `API-EDT-002/200/null`，`CREATE_FACT`；Fact端点必须包含State及其Owner | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State/owner/OPL/Trace/selection digest匹配 |
| `E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED` | `M_OBJECT_PROCESS` | `C(process.common.action) -> T(p03-tool-procedural-relation) -> C(object.common.input) -> T(p03-relation-resolve) -> W(API-EDT-001,GET,1) -> T(p03-relation-option-CAP-ISO-PROC-002) -> W(API-EDT-002,POST,1)` | `API-EDT-001/200`后`API-EDT-002/200/null`，`CREATE_FACT`；endpoints必须按option规范化 | `TX_COMMIT_1` | `REOPEN_COMMITTED`，方向与endpoint ordinal匹配 |
| `E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-procedural-relation) -> C(process.common.action) -> T(p03-relation-resolve) -> W(API-EDT-001,GET,1)` | `API-EDT-001/200/null`；UI结果`UI_BLOCKED_AMBIGUOUS`、option数`>=2`、`API-EDT-002 POST`调用数`0` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-005.STALE_OPTION_BLOCKED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-procedural-relation) -> C(process.common.action) -> T(p03-relation-resolve) -> P(REPLACE_OPTION_ID) -> T(p03-relation-option-CAP-ISO-PROC-001) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-006.STATE_IMPACT_CONFIRMED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`DELETE_CONSTRUCT/STATE` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State不存在且Trace闭合 |
| `E2E-CANVAS-006.FACT_IMPACT_CONFIRMED` | `M_FACT` | `C(fact.common.subject) -> T(p03-fact-delete-impact) -> B(删除关系) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`DELETE_CONSTRUCT/FACT` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，Fact不存在且Text/Trace闭合 |
| `E2E-CANVAS-006.STALE_TOKEN_BLOCKED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> P(ADVANCE_HEAD) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/409/REVISION_CONFLICT` | `TX_NO_COMMIT`相对于advance后的subject baseline | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> P(REPLACE_IMPACT_TOKEN) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.ASSET_MISSING` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/TEXT_GENERATION_BLOCKED`；Fault=`ASSET_MISSING` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.TEXT_BLOCKED` | `M_OBJECT_PROCESS` | `P(SUBMIT_TEXT_BLOCKED_COMMAND) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED`；request固定引用活动Manifest input、真实binding和不满足文本前置规则的候选，不启用Fault Launcher | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.REVISION_CONFLICT` | `M_OBJECT_PROCESS` | `P(ADVANCE_HEAD) -> C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/409/REVISION_CONFLICT` | `TX_NO_COMMIT`相对于advance后的subject baseline | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.PERSISTENCE_FAILED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/500/PERSISTENCE_FAILED`；Fault=`PERSISTENCE_FAILED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.READONLY` | `M_READONLY_TARGET` | `P(SUBMIT_READONLY_COMMAND) -> W(API-EDT-002,POST,1)` | `T(p03-readonly-banner)`唯一可见、`T(p03-tool-consumption)`唯一且disabled；`API-EDT-002/409/READ_ONLY_REVISION`；Fault=`READONLY`只影响head projection | `TX_NO_COMMIT` | `REOPEN_UNCHANGED`且REOPEN不启用fault |

### 5.1 Selector前置缺口

当前产品实现尚缺下列稳定test id，Common driver实现不得以临时selector绕过：

```text
p03-state-inspector-name
p03-state-inspector
p03-fact-delete-impact
```

这些test id只增加可测试身份，不改变视觉、公共API或业务行为；其实现必须由Runner/前端后继切片的精确allowlist授权。缺任一selector时Common driver Build状态为`BLOCKED_BY_UI_SELECTOR`，不能用class、文本模糊匹配或坐标替代。

### 5.2 STALE_TOKEN口径修正

当前Runtime先校验base head，再校验impact token。因此`ADVANCE_HEAD`后真实首错固定为`REVISION_CONFLICT`，不得把该case继续写成`DOMAIN_REJECTED`。如未来要单独证明过期impact token，必须提供不改变head的版本化token时效机制并新增case/Schema版本，不能重解释本case。

## 6. Controlled Orchestration接口

### 6.1 唯一入口

Runner内部新增纯编排owner：

```text
prepareControlledAttempt({
  controlled_bundle_root,
  manifest_root,
  manifest_path,
  profile_asset_root,
  report_staging_root,
  case_entry,
  attempt_ordinal,
  java_executable,
  browser_executable,
  runtime_port,
  web_port
}) -> PreparedAttempt
```

不新增`--runtime-jar`或`--web-dist-root`覆盖参数。两者唯一来源是已验证Manifest final root：

```text
runtime source = <manifest_root>/<source_build.local_runtime_jar.path>
web source     = <manifest_root>/<source_build.web_dist.path>
```

controlled bundle只证明Intake/Handoff/Evidence Bundle上游身份，不承载或覆盖Runtime JAR、Web dist、Profile asset、driver或attempt输出身份。

### 6.2 PreparedAttempt

输出固定为不可变对象：

```text
attempt_root=<report_staging_root>/attempts/<percent-case-id>/<attempt_ordinal>
runtime_jar=<attempt_root>/inputs/build/local-runtime.jar
web_dist=<attempt_root>/inputs/build/web-dist
profile_assets=<attempt_root>/profile/assets
driver_source=<attempt_root>/inputs/drivers/common-driver.mjs
storage=<attempt_root>/storage
initial_runtime=<attempt_root>/process/initial
reopen_runtime=<attempt_root>/process/reopen
```

`attempt_root`必须在调用前不存在；父目录存在且为空闲。编排器排他创建root，拒绝symlink/hardlink/special file、existing/residual、跨report路径和相同case/ordinal重复调用。

### 6.3 唯一顺序

```text
VERIFY_CONTROLLED_BUNDLE
-> VERIFY_MANIFEST_0.2_AND_PROFILE
-> VERIFY_SOURCE_REFS
-> CREATE_FRESH_ATTEMPT_ROOT
-> COPY_RUNTIME_JAR_AND_REVERIFY_RAW_REF
-> COPY_WEB_DIST_AND_REVERIFY_TREE_REF
-> COPY_PROFILE_AND_DRIVER_AND_REVERIFY
-> MATERIALIZE_M0_IN_FRESH_STORAGE
-> START_INITIAL_RUNTIME
-> START_PRODUCTION_WEB
-> START_FRESH_CHROMIUM
-> EXECUTE_SETUP
-> CAPTURE_SUBJECT_BASELINE
-> EXECUTE_SUBJECT
-> CAPTURE_INITIAL_ARTIFACTS
-> STOP_BROWSER_WEB_RUNTIME
-> START_FRESH_REOPEN_RUNTIME_WEB_BROWSER_ON_SAME_STORAGE
-> EXECUTE_REOPEN_ASSERTION
-> CAPTURE_REOPEN_ARTIFACTS
-> STOP_AND_VERIFY_NO_LISTENER
-> VERIFY_ATTEMPT_ARTIFACT_0.2
```

Runtime、Web server、Chromium在每个attempt都必须是新进程；REOPEN再新建第二组进程，但只读同一attempt storage。不得复用进程、browser context、cookie、cache、service worker或端口listener。

### 6.4 Production Web

Web server只能从attempt-local exact `web-dist`提供静态/SPA内容并同源代理exact Runtime；禁止Vite、HMR、源码编译、目录列表、网络下载和checkout fallback。启动成功必须同时证明：

- `index.html` raw SHA属于Manifest web tree；
- 页面加载的每个静态资源均在tree ref中；
- 所有请求仅到`127.0.0.1:<web-port>`，API只经同源代理到`127.0.0.1:<runtime-port>`；
- server停止后两个端口均无listener。

### 6.5 失败事务

完成`CREATE_FRESH_ATTEMPT_ROOT`前失败：零attempt输出。之后失败：保留当前report staging中的真实artifact供父Runner分类，但不得单独提交attempt或Report final root。基础设施失败导致必填identity无法取得时，父Runner必须放弃整个staging，不得写占位Report。

## 7. 验收矩阵

正例至少覆盖：16项映射exact equality、三个selector owner、9个BLOCKED分支、7个PASS分支、两个attempt、fresh进程、same storage REOPEN、exact JAR与Web tree复制复核、controlled bundle与Manifest四方join。

反例至少覆盖：缺/extra/reorder case、错误selector、模糊/坐标selector、错误API operation/status/code、SETUP计入subject delta、错误baseline时机、JAR/Web override、checkout/Vite fallback、attempt root已存在、跨report root、REOPEN复用进程或换storage、controlled/production参数互用、symlink/hardlink、copy后SHA/tree drift、端口残留和placeholder artifact。

## 8. 状态边界

本设计冻结后：

- Common Driver与controlled orchestration语义：`DESIGN_READY`；
- Manifest v02 producer/verifier：等待独立实现规格执行；
- 缺失UI selector：`BLOCKED_BY_UI_SELECTOR`，只阻断Common driver受控成功路径；
- production `194/388`、E2E Report、`GATE-06-03`、Candidate、Activation、Capability、production与ISO证据：`NOT_RUN/NOT_ENABLED`。
