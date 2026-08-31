# DEV-CANVAS-06 Family Controlled Invocation Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭活动 E2E Runner 从 Manifest `194` case 到真实 Playwright `388` attempt 之间的机器输入与调用缺口，冻结：

1. Family Controlled Invocation Context `0.1`及其唯一 producer、Schema、verifier owner；
2. Manifest 原序 `194 case / 388 attempt`的严格串行调度；
3. Runner 按`case_entry.driver_id`加载四个 exact Driver，并在 Page attach 后形成完整五参数调用对象；
4. 一次性、同源、进入 API Exchange 证据链的`precondition_client`；
5. production controlled Playwright bridge 的 Browser/Page 创建、attach、Driver 调用与关闭证明；
6. Stage R、Runner Source Set和最终 source-chain 的新 allowlist 与计数。

本规格只冻结设计。不得据此声明 Stage R、`194/388`、Report、Gate、Candidate、Activation、Capability、production 或 ISO 19450:2024 证据已经形成。

## 2. Root Cause

### 2.1 问题原因

现有活动规格已经分别冻结 Manifest `194/388`、Family Driver 五参数接口、Common Driver步骤和 Stage A 生命周期，但没有一个机器契约把这些输入闭合为可由 Playwright child消费的完整 session：

1. Fault Launcher Context `0.1`只承载`3 case / 6 attempt / 12 cycle`，且明确没有独立Schema，不能扩写为production `194/388`；
2. Runner尚未冻结`driver_id -> exact module`的加载、export复核和错误边界；
3. `FamilyCaseExecution`虽已定义，但没有冻结由谁构造、何时与Page/client绑定、如何形成完整五参数调用对象；
4. Stage A的`precondition_client`只有禁止项，没有可执行request、同源发送、一次性状态机和API Exchange写入契约；
5. production Playwright spec不在Runner Source Set中；若让未计入`runner_source_sha256`的spec拥有Browser/Driver语义，Report不能覆盖真实执行代码身份。
6. CTRL `RUN_SETUP`会创建基础Fact，但正式`EditCommandResult`没有独立`created_fact_id`，`affected_ids`也不承诺创建ID位置；若在Driver调用后再回填已深冻结identity，或从页面、fixture、目录名推断Fact ID，五参数调用与API Exchange证据均无法闭合。

### 2.2 为什么之前未被发现

此前验收分别检查了Manifest数量、Driver接口和Runner source owner，没有沿以下完整路径复核：

```text
Manifest case
-> Invocation Context
-> Playwright child
-> Driver dispatch
-> Family/Common CaseExecution
-> five-parameter call
-> API Exchange/Browser proof
-> Attempt Artifact
```

因此`194/388`在文档中存在，但执行者仍需自行发明跨进程输入、Driver选择、client行为和bridge身份。

## 3. Fix Strategy

1. 新增一个活动Context Schema，不修改Manifest、Attempt Artifact或Report Schema；
2. Context producer/verifier、schedule、Driver loader、CaseExecution builder和client factory全部收敛到既有`scripts/release-canvas06-e2e-run.mjs`；
3. 新增唯一production bridge `tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts`；
4. 将该bridge加入Runner Source Set，升级为`0.2/0.2.0/24 entries`；
5. 本规格曾把Stage R扩为`20=18 M+2 A`；后继Service Regression、Family Attempt Path Owner、Stage R Release Discovery、API Exchange/Artifact Index、Family Case ID/Archive Ref及Common Precondition Machine Contract闭包最终扩为`33=31 M+2 A`，累计`O..R=52=40 M+12 A`；
6. 保持Report `0.2/runner_version=0.2.0`、Manifest `0.2`和Attempt Artifact版本`0.2`不变；Attempt Artifact字段闭包由后继API Exchange/Artifact Index修正规格承接。
7. 将identity-bearing `RUN_SETUP`收敛到Runner-owned resolver：先从正式CREATE_FACT response与SETUP前后Revision Fact差集取得唯一`setup_fact_id`并闭合raw证据，再生成新的深冻结`SetupBoundAttemptIdentity`交给Driver；不原地修改旧identity。

## 4. 修改边界

### 4.1 本设计修正

只允许修改`specs/**`、`docs/design/**`、`docs/checklists/**`和`docs/README.md`。不修改Node、Java、Vue、Schema实现、OpenAPI、SQLite、配置、测试或release资产。

### 4.2 后继Stage R新增路径

在既有Stage R `14 M`基础上增加：

```text
A docs/contracts/schemas/opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json
M docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json
M scripts/canvas06-e2e-run-stage.mjs
M scripts/canvas06-e2e-run-stage.test.mjs
M scripts/validate-canvas06-visual-e2e-schemas.test.mjs
A tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

Context producer/verifier及其定向测试继续收敛在既有Stage R路径：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/validate-contracts.mjs
```

禁止新增Context helper、Driver registry helper、precondition helper、bridge helper或第二个production spec。

## 5. Controlled Invocation Context 0.1

### 5.1 Schema与owner

唯一Schema：

```text
docs/contracts/schemas/opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json
schema_id=OPM-DEV-CANVAS-06-E2E-CONTROLLED-INVOCATION-CONTEXT-001
schema_version=0.1
```

唯一producer与语义verifier函数归属`scripts/release-canvas06-e2e-run.mjs`。父进程调用其中producer；Playwright bridge在child内导入同一Runner owner并调用其中verifier，不得在spec中复制验证逻辑。`scripts/validate-contracts.mjs`只负责注册Schema，`scripts/validate-canvas06-visual-e2e-schemas.test.mjs`只负责Schema正反例；二者不得生产或修复Context。

Context必须在Runner全部preflight通过、Report staging创建后、任何Materializer/Runtime/Web/Browser启动前生成。Runner CLI新增且必须显式传入：

```text
--process-control-parent <fresh absolute writable directory>
```

该root必须与source、Handoff/Bundle、Manifest、Profile、output及browser/java实体不相等且互不包含；禁止默认值、环境变量、cwd、临时目录扫描或latest选择。

### 5.2 身份、路径与原始bytes

```text
context_id
= "dev-canvas-06.e2e-controlled-invocation."
  + manifest_ref.sha256[0:12] + "."
  + runner_source_set_ref.sha256[0:12]

context_tmp=<process-control-parent>/.<context_id>.json.tmp
context_final=<process-control-parent>/<context_id>.json
```

原始bytes唯一为`RFC8785_JCS(context)+LF`。`context_payload_sha256=SHA-256(JCS(删除本字段后的完整context))`。Node唯一可移植发布顺序固定为`exclusive tmp -> full write -> file fsync/close -> raw/Schema/semantic reread -> hard-link(tmp,final) with final ENOENT -> tmp/final same inode复核 -> unlink(tmp) -> final single-link普通文件复核 -> parent fsync`。`link`创建final是原子且拒绝覆盖既有路径；禁止使用会覆盖final的普通`rename()`、copy或平台私有`RENAME_NOREPLACE`。tmp/final必须启动时均为`ENOENT`；失败尽力移除本轮tmp，已出现final时必须保留并视为不可消费事务残留，返回`E2E_INVOCATION_CONTEXT_TRANSACTION_FAILED/4`，且不得启动Materializer、Runtime、Web或Browser。

Context final是本次执行的只读process-control输入，不进入Report root，不被Report verifier当作业务证据；成功或失败后均不得由Runner覆盖、删除或复用。

### 5.3 根字段

根对象`additionalProperties=false`，字段恰为：

```text
schema_id, schema_version, context_id, input_mode,
source_root_realpath, input_trust, manifest_root_realpath, manifest_ref,
profile_asset_root_realpath, profile_asset_tree_ref, profile_asset_refs,
report_staging_root_realpath, attempt_parent_realpath,
process_control_parent_realpath,
java_executable_ref, browser_executable_ref,
runtime_jar_ref, web_dist_ref, runner_source_set_ref,
driver_catalog, runtime_port, web_port,
execution_schedule, context_payload_sha256
```

`input_mode=PRODUCTION_HANDOFF|CONTROLLED_TEST`。`input_trust`封闭为：

```text
{
  mode,
  root_realpath,
  primary_ref
}
```

production的`primary_ref`必须逐字段等于Manifest `intake_report_ref`，controlled的`primary_ref`必须是已通过活动controlled bundle verifier的exact descriptor raw ref；两种模式禁止互用。

所有`*_realpath`必须是父Runner已完成lexical、realpath、类型、single-link、containment和fresh/read-only检查后的absolute normalized realpath。所有ref均使用封闭`{kind,path,byte_length,sha256}`；不得使用相对cwd、目录名、mtime或缓存值补齐。

`runtime_jar_ref/web_dist_ref`分别逐字段等于Manifest `source_build.local_runtime_jar/web_dist`；Profile tree与五ref逐字段等于Manifest；`driver_catalog`恰四项且逐字段等于Manifest原序；`runner_source_set_ref`指向Report staging已复核的Source Set `0.2` raw文件。

### 5.4 388项schedule

`execution_schedule`恰388项，每项`additionalProperties=false`，字段恰为：

```text
ordinal, case_ordinal, case_id, suite_id, driver_id, expectation,
attempt_ordinal, viewport_id, zoom_id, attempt_root_realpath,
runtime_port, web_port
```

唯一展开算法：

```text
for manifest.cases[0..193] in original order:
  emit attempt_ordinal=1
  emit attempt_ordinal=2
```

因此`ordinal=1..388`、`case_ordinal=1..194`；同case的ordinal `2n-1/2n`分别对应attempt `1/2`。全部item的`runtime_port/web_port`分别等于CLI显式值；因为严格串行而允许复用，但每个INITIAL、REOPEN结束后都必须验证child退出和端口释放，下一attempt才可启动。

`attempt_root_realpath`必须等于Report staging内固定percent-encoded case path与attempt ordinal计算结果。producer与child各自复算；禁止从目录扫描反推、重排、分片、并发、retry、skip、resume或只生成失败前缀Context。

## 6. 跨进程协议

Runner启动唯一bridge前，必须删除child环境中全部`OPM_CANVAS06_E2E_*`键，只加入：

```text
OPM_CANVAS06_E2E_CONTROL_CONTEXT_REF
= RFC8785_JCS({
    kind: "E2E_CONTROLLED_INVOCATION_CONTEXT",
    path: <context_final absolute normalized realpath>,
    byte_length,
    sha256
  })
```

bridge只可读取该一个环境键，并按`raw ref -> canonical bytes -> Schema -> payload -> root/ref -> 194/388 schedule`顺序复核。任一失败必须在Materializer/Runtime/Web/Browser和attempt artifact零输出时返回`E2E_INVOCATION_CONTEXT_INVALID/2`或`E2E_INVOCATION_CONTEXT_REF_MISMATCH/3`。

固定Playwright token数组必须显式指定：

```text
<current process.execPath>
<source-root>/node_modules/@playwright/test/cli.js test
tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
--config tests/e2e/release/dev-canvas-06/playwright.release.config.ts
--workers 1
--retries 0
```

父Runner必须以`execFile(process.execPath, fixedArgs, {cwd: source_root_realpath, shell:false})`启动；CLI module必须是上述普通非链接文件并位于exact source-root的`node_modules`内。禁止PATH/`.bin`链接、shell、glob、默认test discovery、额外spec、stdout JSON IPC或第二个环境通道。

### 6.1 Child 内唯一 Runner API

Playwright bridge必须从以下exact普通非链接文件URL导入Runner owner：

```text
<source_root_realpath>/scripts/release-canvas06-e2e-run.mjs
```

bridge唯一bootstrap允许以`process.cwd()`（父进程已固定为Context的`source_root_realpath`）拼接上述普通文件并构造exact file URL；禁止读取Context字段、扫描目录或fallback选择模块。Runner owner必须保持import-safe，禁止模块导入时解析CLI、创建目录、启动child、写Report或读取环境。导入后的第一条显式调用必须是下述loader；loader在任何Materializer/Runtime/Web/Browser行为前证明该文件source bytes、Report staging mirror和Source Set第1项raw ref三方相等。只有显式调用以下两个export才允许产生对应行为：

```text
loadFamilyControlledInvocationContextFromEnvironment()
  -> Promise<FrozenVerifiedInvocationContext>

runFamilyControlledInvocationSession({
  invocation_context,
  cycle_handler
}) -> Promise<undefined>
```

`loadFamilyControlledInvocationContextFromEnvironment()`只读取第6节唯一环境键，并调用Runner-owned raw ref、Schema、payload、root/ref、Runner source/mirror/Source Set三方bytes与194/388语义verifier；bridge不得自行实现第二套verifier。`runFamilyControlledInvocationSession()`只接受前一函数返回对象和一个深冻结handler，按Context原序拥有388 attempt的Materializer、Runtime/Web、observation/client、artifact及cleanup生命周期。

每个cycle只调用一次handler，参数恰为：

```text
{
  cycle: "INITIAL" | "REOPEN",
  origin,
  browser_executable_ref,
  case_entry,
  attempt_identity,
  observation_sink,
  resolve_invocation
}
```

`INITIAL`的`resolve_invocation(page)`是Runner-owned一次性函数；只有同一handler已成功执行`observation_sink.attachBrowserPage(page)`后才可调用，并返回第7.3节完整`ControlledCaseInvocation`。它在child进程内按`driver_id`加载Driver、构造Family/Common CaseExecution，执行第7.4节identity-bearing `RUN_SETUP`，再把同一Page引用和最终深冻结identity放入五参数`call_context`。`REOPEN`的`resolve_invocation`必须为`null`，bridge不得加载或调用Driver。第二次resolve、attach前resolve、错误Page、跨cycle保留、bridge自行构造CaseExecution或父进程尝试序列化Page均返回`E2E_DRIVER_INVOCATION_INVALID`。

## 7. Driver dispatch与调用对象

### 7.1 唯一映射

Runner只按已验证`case_entry.driver_id`选择：

```text
DRIVER-PROCEDURAL -> inputs/drivers/procedural-driver.mjs
DRIVER-CONTROL    -> inputs/drivers/control-driver.mjs
DRIVER-STRUCTURAL -> inputs/drivers/structural-driver.mjs
DRIVER-COMMON     -> inputs/drivers/common-driver.mjs
```

每个module必须同时满足Manifest `driver_catalog` raw ref、Runner Source Set mirror raw ref和实际import bytes三方相等。import只允许exact file URL；禁止目录扫描、bare specifier、checkout fallback、alias或按suite/文件名猜测。

导出形状由后继[Common Driver Export与Loader闭包修正规格](opm-dev-canvas-06-common-driver-export-loader-closure-bugfix-task-spec.md)取代：三个Family module各恰导出`driver/case_ids/executeCase`；Common module继续恰导出`COMMON_DRIVER_ID/COMMON_DRIVER_VERSION/COMMON_CASES/executeCase`，其case集合唯一取`Object.keys(COMMON_CASES)`。两类case集合原序均须与Manifest对应子序列相等。module每次session按raw SHA最多加载一次；全局可变状态、额外production export或driver_id不一致均返回`E2E_DRIVER_CONTRACT_INVALID/3`。

### 7.2 CaseExecution builder

Family case必须由Runner按Family Driver设计构造完整深冻结`FamilyCaseExecution`：

```text
manifest_case, coverage_requirement, golden_case, replay_case,
family_identity, base_fixture, input_fixture,
companion_pass_requirement, companion_pass_golden_case,
companion_pass_input_fixture, execution_mode, expected_api, expected_error
```

其中companion两个字段的活动exact join与PASS/BLOCKED映射由后继[Family Companion PASS Input闭包修正规格](opm-dev-canvas-06-family-companion-pass-input-closure-bugfix-task-spec.md)承接；禁止由Driver修复当前非法Fact或按case名称推断合法候选。

Common case必须由Runner按Common Driver设计构造完整深冻结`CommonCaseExecution`，包含Manifest case、Common Catalog case、base/input fixture、subject steps、expected APIs/error/transaction/reopen。bridge和Driver不得自行读取Catalog或补字段。

### 7.3 五参数调用上下文

Runner-owned `resolve_invocation(page)`在Playwright child内、Page attach成功后返回：

```text
ControlledCaseInvocation={
  driver_id,
  execute_case,
  case_execution,
  call_context: {
    page,
    case_entry: case_execution,
    attempt_identity,
    observation_sink,
    precondition_client
  }
}
```

除Playwright `page`作为不透明引用外，wrapper与plain-data成员均深冻结。必须满足：

```text
precondition_client === observation_sink.precondition_client
case_entry === case_execution
attempt_identity.case_id === case_execution.manifest_case.case_id或Common case_id
attempt_identity.attempt_ordinal === schedule.attempt_ordinal
```

bridge只能执行`await execute_case(call_context)`，成功返回必须为JavaScript `undefined`。任何参数替换、包装client、第二次Driver调用、返回非undefined或跨attempt保留引用固定为`E2E_DRIVER_INVOCATION_INVALID`。

### 7.4 Runner-owned RUN_SETUP identity binder

Runner先构造并深冻结`MaterializedAttemptIdentity={case_id,attempt_ordinal,project_id,model_id,context_id,materialized_base_revision}`，但该对象不得暴露给Family Driver。Page attach后，resolver按Family Driver设计`v1.4`执行唯一状态转换：

```text
MaterializedAttemptIdentity
-> RUN_SETUP
-> SetupBoundAttemptIdentity
```

CTRL必须通过attached Page的同源正式`API-EDT-001 + API-EDT-002 CREATE_FACT`完成SETUP；Runner内部SETUP executor与第8章`precondition_client`隔离，不消耗其一次调用额度，但复用同一网络观测、raw body writer和API Exchange Index owner。SETUP response必须先形成稳定`response_ref={kind:"API_RESPONSE_BODY",path,byte_length,sha256}`；对应index entry固定为`API-EDT-002/POST/<same-origin /api/v1/projects/<project_id>/models/<model_id>/contexts/<context_id>/commands>/200`，request固定`command_type=CREATE_FACT`、`base_revision=materialized_base_revision`且不携带`payload.fact_id`，再按以下唯一算法取ID：

```text
setup_fact_id = unique(
  response.data.affected_ids
  intersection
  (post_setup_revision.fact_ids - pre_setup_revision.fact_ids)
)
```

两个Fact集合只能来自正式`API-CTX-002` raw response：分别以`materialized_base_revision`和CREATE_FACT `response.meta.committed_revision`查询，筛选`construct_role=PROCEDURAL_LINK|STRUCTURAL_LINK`的`target_id`后去重；pre集合还必须与已验证base fixture `facts[].fact_id`集合逐项相等。禁止改用DOM、OPL/Trace、SQLite、Runtime内存candidate或其他Revision。

Runner随后新建并递归深冻结：

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

CTRL必须满足`meta.status=COMMITTED`、Fact差集恰一项、交集恰一项、Fact语义等于基础Procedural Fact，并闭合：

```text
attempt_identity.setup_fact_id
= response/diff唯一交集

attempt_identity.subject_baseline_revision
= response.meta.committed_revision
= API Exchange entry.revision
= post-SETUP snapshot.revision
= subject request.base_revision

attempt_identity.setup_create_fact_exchange_ref
= API Exchange Index中唯一SETUP CREATE_FACT entry.response_ref
```

PROC/STRUCT固定`setup_fact_id=null`、`setup_create_fact_exchange_ref=null`、`subject_baseline_revision=materialized_base_revision`，字段仍必填以保持对象bytes形状唯一。禁止使用`affected_ids`位置、request预填ID、DOM/X6、URL、页面文案、fixture Fact ID、case/attempt目录、SHA、文件名、SQLite row order或目录扫描。Common production调用沿用同一封闭形状并使用三个null/base值，不改变Common Driver业务步骤。

业务response/Revision/Fact差集或语义不满足返回`E2E_FAMILY_SETUP_IDENTITY_INVALID`并使attempt FAILED；raw body/ref、API Exchange Index或Revision snapshot不可信返回`E2E_FAMILY_SETUP_EVIDENCE_INVALID -> EVIDENCE_TRANSACTION/4`并停止证据事务；Driver调用前未形成最终identity、引用被替换或嵌套对象可变返回`E2E_DRIVER_INVOCATION_INVALID`。本节不新增Context、Manifest、Attempt Artifact或Report字段，持久证据继续由Attempt Artifact `0.2`的API Exchange、transaction、observation和artifact index承接。

### 7.5 Attempt case identity 后继修正

活动Attempt Artifact `0.2`原共享`caseId`只接受Common字形，无法承载本规格的178个`G-OPL-*` Family case。唯一后继口径由[Attempt Artifact Family Case ID Closure Bugfix](opm-dev-canvas-06-attempt-artifact-family-case-id-closure-bugfix-task-spec.md)冻结：Schema同时接受Family/Common两族字形，但可消费身份仍必须与活动Manifest唯一exact join；三个fault专用映射不变，Family Fault Plan只允许`NONE/NONE/0`。

## 8. Precondition Client

### 8.1 状态机与调用边界

每个attempt的INITIAL cycle创建一个fresh client，状态唯一为：

```text
READY -> IN_FLIGHT -> CONSUMED -> CLOSED
READY -> CLOSED
```

`execute(request)`最多调用一次；并发、重入、retry、CONSUMED/CLOSED后调用、REOPEN调用或跨attempt复用固定为`E2E_PRECONDITION_ALREADY_CONSUMED`。不需要precondition的case必须以`READY -> CLOSED`结束。

request必须逐字段等于当前已验证Driver case定义中的唯一`PRECONDITION_API`或Family BLOCKED subject request；client不得接受Driver临时扩展的method/path/body/expected status。允许的URL只能是以`/api/v1/`开头的相对path，最终origin必须逐字符等于当前Page的`http://127.0.0.1:<web_port>`；禁止直连Runtime port、绝对URL、redirect、外网、test endpoint或SQLite。

Common五类precondition的活动机器口径由后继[Common Precondition Machine Contract Closure规格](opm-dev-canvas-06-common-precondition-machine-contract-closure-bugfix-task-spec.md)取代本章未封闭部分：`ADVANCE_HEAD/TEXT_BLOCKED/READONLY`为`DIRECT_COMMAND`，`REPLACE_OPTION_ID/REPLACE_IMPACT_TOKEN`为只改下一条exact UI request的`REQUEST_MUTATION`。固定`source_observation_ref="setup-baseline-api"`仅为locator token，actual source必须由Runner解析并以raw ref闭合。

### 8.2 发送与证据

DIRECT command只能通过已attach的当前Page在浏览器上下文执行同源`fetch`，并由同一Page的request/response监听取得actual bytes；REQUEST mutation只允许后继规格冻结的一次性`page.route -> route.continue({postData})`，不得fulfill/abort/fallback。两者均禁止Node旁路HTTP、`APIRequestContext`、通用mock route或手工合成响应。

第7.4节Runner-owned SETUP executor使用相同的同源fetch与raw证据通道，但具有独立的固定SETUP状态机，只允许CTRL的一次候选查询和一次CREATE_FACT提交；它不得向Driver暴露通用请求能力，不得复用、包装或提前消费本节`precondition_client`。

每次调用必须：

1. 在发送前写入request raw body临时文件并复核SHA；
2. 将声明的`raw_request`与Page观测到的`actual_request`逐method、normalized URL、headers、raw body SHA比较；
3. 捕获真实status、raw response body、Revision和稳定error code；
4. 写入Attempt Artifact `0.2`既有`api-exchanges/*.json`及`api-exchanges/index.json`；
5. 返回深冻结receipt `{raw_request,actual_request,response,exchange_ref}`；
6. 由`observation_sink.recordPrecondition(receipt)`恰记录一次，重复record或缺任一字段拒绝。

写入顺序、file ref和`exchange_set_sha256`继续复用Attempt Artifact `0.2`，不新增第二种API证据Schema。request/response不一致、redirect、origin漂移、响应不可解析或证据写入失败时不得retry；业务预期不匹配使attempt FAILED，raw证据事务不可信升级为`EVIDENCE_TRANSACTION/4`。

## 9. Controlled Playwright Bridge

唯一owner为：

```text
tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

每个attempt固定顺序：

```text
Runner materialize + Runtime/Web INITIAL READY
-> bridge launch fresh Browser
-> fresh Context/Page using Manifest viewport/environment
-> observation_sink.attachBrowserPage(page)
-> navigate exact Web origin and wait stable
-> Runner resolve Driver + CaseExecution + five-parameter call context
-> bridge invoke Driver exactly once
-> Driver/Runner capture INITIAL assertions and artifacts
-> finally page.close -> context.close -> browser.close
-> observation_sink.confirmBrowserClosed(same objects)
-> Runner settle/sentinel/client close/Browser proof
-> Runtime/Web INITIAL cleanup and ports released
-> Runtime/Web REOPEN READY on same storage
-> bridge launch/attach fresh Browser tree
-> Runner-only reopen observation; Driver is not called again
-> finally close/confirm/proof
-> Runtime/Web REOPEN cleanup, ports released, attempt artifact finalize
```

bridge只拥有Browser/Context/Page创建、Page attach、`execute_case(call_context)`和finally关闭/confirm；Runner继续唯一拥有Materializer、Runtime/Web、schedule、observation/client、Driver选择、CaseExecution、reopen assertion、artifact writer、child/port cleanup和Report事务。

bridge必须先调用`loadFamilyControlledInvocationContextFromEnvironment()`，再把唯一cycle handler传给`runFamilyControlledInvocationSession()`。INITIAL handler固定执行`create Browser tree -> attachBrowserPage(page) -> resolve_invocation(page) -> execute_case(call_context)`；REOPEN handler只创建/attach Browser tree并执行Runner要求的重开导航与观测，`resolve_invocation`必须为`null`。两个handler分支都必须在`finally`关闭并confirm同一Browser树。父Runner与bridge之间禁止传递、序列化或重建Page/Context/Browser引用。

bridge不得构造CaseExecution、选择Driver、创建client、写Artifact、读取Manifest/Catalog、改变viewport、复用Browser、使用默认Chromium或吞掉关闭失败。Browser proof沿用Stage A的`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED`，任何对象不一致、缺confirm、迟到事件或残留请求升级为`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`。

## 10. 194/388调度与失败边界

1. 388 attempt严格串行，`workers=1/retries=0`；
2. 正常业务FAILED不得停止后续attempt，最终在全部388项真实artifact闭合后生成BLOCKED Report；
3. Context、source/ref、Materializer、Browser proof、child cleanup、端口释放或artifact事务不可信属于基础设施/证据失败，立即停止后续调度，final Report必须不存在；
4. attempt 1/2均真实执行，不得复制artifact或semantic digest；
5. 每attempt必须完整执行INITIAL和REOPEN，Driver只在INITIAL调用一次；
6. 只有388项真实identity和artifact index全部存在，才允许进入Report聚合；
7. 不允许shard、parallel、skip、retry、resume、reuse server/browser/storage或从部分结果补齐Report。

## 11. Runner Source Set 0.2

Schema升级为：

```text
schema_id=OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001
schema_version=0.2
source_set_version=0.2.0
entries=24
```

前18项保持Source Set `0.1`原序；第19项仍为`playwright.release.config.ts`；新增第20项：

```text
tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

原四Driver顺延为第21~24项，bytes与Manifest `driver_catalog`保持exact join。`excluded_classes`中的测试排除语义改为“所有未显式列入entries的test/spec source”，不得排除第20项。

`source_set_sha256`公式不变。相对Stage A，R只允许10项entry变化或新增：Runner、Report verifier、preflight、stage、report、共享Attempt path/artifact owner，三个Family Driver和新增bridge；其余14项逐byte不变。Context Schema、Source Set Schema、Attempt Artifact Schema、stage/artifact/verifier测试和Schema test不进入Source Set；它们由clean R source commit与Stage R patch identity承接。

Report继续使用`0.2/runner_version=0.2.0`，但`runner_source_set_ref`必须指向Source Set `0.2`，`runner_source_sha256`必须使用24项aggregate。历史Source Set `0.1/23`只读，不得由活动R继续生产。

## 12. Stage R与累计计数

Stage R最终由后继API Exchange/Artifact Index闭包固定为：

```text
33=31 M+2 A
```

即本规格20项再由后继闭包增加四个M。累计`O..R`固定为：

```text
52=40 M+12 A
```

`O..A`由后继Stage A修正规格固定为`25=15 M+10 A`。Final Source Chain verifier必须按UTF-8 path byte order比较exact `status<TAB>path`集合；禁止只比较数量、rename/copy推断或将新增Schema/bridge算入origin/A。

## 13. 验收

后继实现至少验证：

1. Context Schema根对象、388 schedule、payload/ref/root正反例；
2. producer与child verifier raw parity、canonical LF、tmp/fsync/rename/残留边界；
3. 四Driver exact module/raw/export/case集合与wrong-driver反例；Family三导出与Common四导出的活动形状按后继Common Driver Export与Loader闭包修正规格验收；
4. 178个Family case均得到完整`FamilyCaseExecution`，16个Common case得到完整`CommonCaseExecution`；
5. Runner owner import-safe、child API exact import、五参数引用相等、Page attach前后、resolve/Driver单次调用与REOPEN零resolve/零Driver调用；
6. precondition zero/one、duplicate/concurrent/cross-attempt/origin/redirect/raw mismatch及API Exchange正反例；
6A. CTRL SETUP response与Revision Fact差集唯一交集、深冻结identity、response ref/index entry/subject baseline逐字段绑定正例，以及零/多Fact、affected_ids排序、旧identity、DOM/fixture/path/SQLite推断、raw ref与Revision漂移反例；
7. Browser创建、attach、finally close/confirm、sentinel、迟到事件和cleanup矩阵；
8. schedule恰`194/388`，业务FAILED继续、证据失败停止、端口复用前释放；
9. Source Set `0.2/24`顺序、11 changed/new与13 unchanged、aggregate与Report join；
10. Stage R `33=31 M+2 A`、累计`52=40 M+12 A`与完整source-chain。

文档验收执行`npm run contract:validate`、Markdown链接检查、活动冲突扫描、计数复核与`git diff --check`。本轮不执行Playwright或真实`194/388`，因为没有实现改动。

## 14. 回滚与当前状态

回滚本设计时必须同时恢复Stage R、Source Set、Runner/Family/最终source-chain全部旧口径，并把真实`194/388`保持为`BLOCKED_BY_CONTROLLED_INVOCATION_CONTRACT_MISSING`；禁止只删除Schema但保留bridge或24项aggregate。

事实：Manifest `0.2`已冻结194 case/388 attempt输入，三个Family Driver当前仍为占位，Stage R和本规格四个新增/修改owner尚未实现。

非结论：本设计冻结不表示Context/bridge/Driver/Runner已经实现，不构成E2E Report、GATE-06-03、Candidate、Activation、Capability、production发布或ISO符合性证明。
