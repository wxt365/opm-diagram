# DEV-CANVAS-06 Stage A Controlled Lifecycle Interface Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭Stage A两个Runner `M`与controlled Playwright spec之间的生命周期owner缺口，冻结唯一session级接口：

```text
runControlledLifecycleSession()
```

该接口必须在`scripts/release-canvas06-e2e-run.mjs`中实现，并由`scripts/release-canvas06-e2e-run.test.mjs`验收。它是controlled spec启动Runtime/Web、执行`INITIAL/REOPEN`、采集D10B、终止child和完成cleanup的唯一入口。

本规格不实现代码，不修改Schema、公共API、SQLite DDL、production配置、Runner Source Set、Report版本或Preflight Report字段。本文只承接Fault Stage A的`3 case/6 attempt/12 cycle`；production `194/388`的Context、Driver dispatch、client可执行语义和bridge身份由[Family Controlled Invocation闭包](opm-dev-canvas-06-family-controlled-invocation-closure-bugfix-task-spec.md)承接。

## 2. Root Cause

### 2.1 问题原因

现有设计只冻结了attempt准备接口`prepareControlledAttempt()`及“spec调用Runner owner”的原则，没有冻结完整lifecycle接口的名称、参数、返回值和错误边界。同时，D10B把采样与Artifact writer直接归给spec，Common Driver的`observation_sink/precondition_client`也没有唯一构造owner。首轮lifecycle冻结后，handler仍只收到`origin/observation_sink`，但四方法sink既不能绑定spec创建的真实Playwright `Page`供`waitForApi()`消费网络事件，也不能把Browser/Context/Page关闭证明交回Runner；因此DURING仍可能在无真实API观测或Browser残留时被采样。

因此Stage A即使拥有两个Runner `M`，实现者仍可在以下位置自行选择语义：

1. Runner或spec启动Runtime/Web；
2. spec或Runner等待端口READY；
3. spec或Runner决定`INITIAL/REOPEN`顺序与同storage复用；
4. spec自行构造Common Driver client；
5. D10B采样、child终止、端口回收和Artifact写入顺序。
6. Runner如何取得Page网络事件，以及如何验证spec-owned Browser/Context/Page已经完整关闭。

### 2.2 为什么之前未被发现

前一轮只验证了source allowlist和调用方向，未把`BEFORE -> 12 cycle -> AFTER -> Artifact`作为一个不可分割的session事务检查。`prepareControlledAttempt()`的名字也被误当成已经覆盖运行与回收，但其冻结输出只到attempt-local输入和路径准备。首轮接口修正又只冻结了client构造owner，没有沿`Common Driver waitForApi() -> observation_sink -> Playwright Page network events`反向检查数据来源，也没有把Browser关闭事件纳入DURING前置。

## 3. Fix Strategy

1. 保留`prepareControlledAttempt()`作为`runControlledLifecycleSession()`内部调用的attempt准备步骤；controlled spec不得直接调用它；
2. 新增唯一session级接口，统一拥有6个schedule、12个cycle及D10B事务；
3. spec只提供12个预绑定handler，每个handler只能接收已运行Web origin与owner构造的observation sink；
4. observation sink与precondition client均由lifecycle接口构造；sink额外提供唯一Page绑定与Browser关闭确认通道，spec只能按本规格原样调用或转交；
5. D10B采样与Artifact writer收敛到lifecycle接口；spec和父Node owner均不得直接写Gate Artifact；
6. 接口未实现并通过验收前，禁止创建Stage A commit或执行D10B。

## 4. 修改边界

### 4.1 后继实现允许修改

Stage A source边界由后继[Release Discovery与Source Guard闭包](opm-dev-canvas-06-stage-a-release-discovery-and-source-guard-closure-bugfix-task-spec.md)修正为七项：

```text
M scripts/canvas06-e2e-release-config.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

接口、module-private lifecycle helper、client factory、D10B sampler和Artifact writer必须全部收敛在第一个Runner `M`中；生命周期测试收敛在第二个Runner `M`中。其余三个`M`只关闭release discovery和source-chain guard，不得承载生命周期语义。禁止新增第八个source path或第三个helper。

### 4.2 本设计修正允许修改

只允许修改`specs/**`、`docs/design/**`、`docs/checklists/**`和`docs/README.md`。禁止修改Node、Java、Vue、Schema、API、配置、测试代码和release资产。

## 5. 唯一接口

### 5.1 名称与签名

唯一export固定为：

```text
export async function runControlledLifecycleSession({
  invocation_context,
  manifest,
  preflight_descriptor,
  cycle_handlers
}) -> Promise<ControlledLifecycleResult>
```

禁止别名、重载、位置参数、第二个options对象、环境变量补值、默认root、checkout扫描或`latest`选择。接口不得接收Runtime JAR、Web dist、端口、storage、fault plan、Gate root或artifact path覆盖参数；这些值只能从已经验证的三个输入对象及其raw refs解析。

### 5.2 输入闭包

1. `invocation_context`必须是Context `0.1`的child侧完整复核结果，且其Manifest/Descriptor/Preflight Report refs与原始bytes闭合；
2. `manifest`必须是Context锁定的活动Manifest `0.2`对象，三个Fault case、Runtime JAR、Web tree、Profile和Common driver ref均已验证；
3. `preflight_descriptor`必须逐byte对应Context ref，并保持6项schedule、6项port allocation、12个全局互异端口；
4. `cycle_handlers`是封闭、冻结、无原型污染的对象，键恰为`FL-SCH-01~06`，每个值恰含`INITIAL`和`REOPEN`两个async function；
5. handler按schedule/cycle预绑定case、attempt和exact browser executable identity，不得从回调参数、目录名、PATH、默认Playwright缓存或当前循环推断身份。

handler唯一签名固定为：

```text
async function ({ origin, observation_sink }) -> undefined
```

`origin`固定为`http://127.0.0.1:<verified web_port>`，不得包含path、query、fragment、credential或非loopback host。handler必须返回JavaScript `undefined`；返回其他值、修改参数对象、保留sink供cycle结束后使用或抛出异常，均按第9章处理。

## 6. Common Driver Client Ownership

### 6.1 唯一构造owner

`runControlledLifecycleSession()`在每个cycle的Runtime/Web READY后构造新的`observation_sink`和`precondition_client`。spec不得构造、替换、包装、缓存或跨cycle复用任一client。

传给handler的`observation_sink`固定为深冻结对象，恰含以下六个顶层成员：

```text
{
  attachBrowserPage(page),
  confirmBrowserClosed({ browser, context, page }),
  waitForApi(expected),
  waitForProjectionRefresh(),
  recordPrecondition(receipt),
  precondition_client: {
    execute(request)
  }
}
```

其中`precondition_client`也必须深冻结。Stage A只冻结其owner、引用相等和禁止边界；production可执行语义由Family Controlled Invocation闭包唯一补齐为“attached Page对当前Web origin的同源正式API fetch”，并把raw request、actual request和response写入同一attempt API Exchange证据。禁止直连Runtime origin、Node HTTP旁路、直写SQLite、调用test controller、修改Vue store或使用另一个origin。

### 6.2 Page绑定与Browser关闭证明

`attachBrowserPage(page) -> undefined`固定为当前cycle唯一Page接纳入口：

1. handler必须在创建fresh page后立即调用一次，并且严格早于首次`page.route()`、首次导航和任何API请求；调用成功前禁止执行Common Driver；
2. Runner要求`page`是活动Playwright `Page`，以`context=page.context()`、`browser=context.browser()`取得对象；`browser`不得为`null`，三者必须属于当前handler新建的同一fresh Browser树；
3. Runner保存三个对象引用，并在绑定时安装`request/response/requestfailed`、Page `close`、Context `close`和Browser `disconnected`监听；`waitForApi()`与`waitForProjectionRefresh()`只能消费该Page在当前cycle绑定后产生的有序事件，禁止HTTP旁路、另一个Page、历史缓存或跨cycle观测；
4. 同cycle第二次绑定、已出现导航/route/API后的late绑定、已关闭Page、跨cycle对象、非Playwright对象或`page/context/browser`身份不闭合，固定拒绝；
5. 绑定成功后方法返回JavaScript `undefined`，不得把Page、Context、Browser、listener或内部状态返回给handler。

`confirmBrowserClosed({browser,context,page}) -> Promise<undefined>`固定为当前cycle唯一关闭确认入口：

1. handler必须在`finally`中依次完成`page.close() -> context.close() -> browser.close()`后调用一次；该方法只验证关闭，不代替handler关闭对象；
2. 三个参数必须与`attachBrowserPage()`保存的对象引用分别严格`===`，不得用新对象、代理、序列化身份、PID或路径替代；
3. Runner只在Page `close`、Context `close`、Browser `disconnected`三个事件均已到达，且该Page发起的请求均已进入`response`或`requestfailed`终态、无待处理网络观测时接纳；
4. 初步接纳后立即冻结业务观测缓冲，移除会继续采样或写artifact的网络监听；但必须保留或无间隙切换为只设置`late_event_detected=true`的最小sentinel，覆盖同一Page的`request/response/requestfailed/close`、同一Context的`close`和同一Browser的`disconnected`，直到handler settle且sink关闭。sentinel不得把confirm后的事件追加到API/Projection/Network observation，也不得满足任何wait；
5. `confirmBrowserClosed()`在进入`CONFIRMED_SENTINEL`后返回JavaScript `undefined`，此时只形成临时关闭确认，不构成最终Browser proof。缺失attach/confirm、重复confirm、错误对象、事件缺失、残留请求，或从confirm返回到handler settle/sink关闭之间任一sentinel事件，均固定拒绝；
6. handler业务动作成功或失败都必须执行同一`finally`关闭与确认；业务异常只可在confirm返回后继续抛出。Runner必须等待handler settle，先复核`late_event_detected=false`，再关闭sink/precondition client并移除全部sentinel；只有上述步骤无间隙完成后Browser proof才最终成立。Browser证明完整时业务异常仍按controlled execution失败处理，Browser证明不完整时按第9章证据事务失败处理。

监听状态机唯一为`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED`。状态转换必须在同一同步临界段内完成，不允许先移除全部监听再异步安装sentinel形成不可观测窗口；可以复用原监听并切换为sentinel模式，也可以先安装sentinel再移除业务采样监听。`CLOSED`只能在handler settle、late flag复核、sink关闭后进入，进入时才移除全部剩余监听。Runner不得启动、关闭或接管Chromium，不得把`confirmBrowserClosed()`实现为无条件或最终确认，也不得从Playwright child退出、PID消失、端口释放、handler settle或`isClosed()`单项推导完整证明。两个方法只增加cycle内受控对象与事件通道，不增加handler参数、返回值、公共Schema、Gate Artifact字段或第二条IPC。

controlled spec调用既有`common-driver.mjs`时只能执行：

```text
executeCase({
  page,
  case_entry: <handler预绑定case>,
  attempt_identity: <handler预绑定attempt>,
  observation_sink,
  precondition_client: observation_sink.precondition_client
})
```

spec只转交owner构造的client，不拥有client factory。`confirmBrowserClosed()`返回后业务观测通道封闭，但迟到事件sentinel保持活动；handler settle后Runner按`VERIFY_NO_LATE_EVENT -> CLOSE_SINK_AND_PRECONDITION_CLIENT -> REMOVE_ALL_SENTINELS -> MARK_BROWSER_PROOF_COMPLETE`执行。任何迟到API/生命周期事件、二次precondition、confirm后观测、跨cycle调用或在最终teardown前提前移除sentinel均固定拒绝。

## 7. Runtime/Web Lifecycle Ownership

### 7.1 唯一职责

接口唯一负责：

1. 按Descriptor顺序处理`FL-SCH-01~06`，每项严格执行`INITIAL -> REOPEN`；
2. 通过`prepareControlledAttempt()`排他准备fresh attempt，并保证REOPEN复用同一storage；
3. 每个cycle启动新的Runtime和production Web child；
4. Runtime exact READY成功后才能启动Web，Web health/bootstrap READY成功后才能调用handler；
5. 同一schedule的INITIAL完全终止并释放端口后，才能启动REOPEN；
6. handler结束后先复核Page已绑定、临时关闭确认已取得且无迟到事件，再关闭sink、移除sentinel并判定Browser proof完整；随后终止Web/Runtime、移除本cycle challenge并验证端口无listener；
7. 首错后禁止启动任何后续cycle，并对所有已启动child执行同一cleanup。

接口不拥有Chromium或Playwright worker进程。每个handler只可从预绑定的exact browser executable启动一个fresh Chromium process、一个fresh context和一个fresh page，必须立即以`attachBrowserPage(page)`绑定，并通过`finally`在handler settle前关闭三者及调用`confirmBrowserClosed({browser,context,page})`。Runner拥有监听、引用交叉校验、临时关闭确认和handler settle后的最终证明接纳，不拥有对象关闭；spec拥有对象创建与关闭，不拥有证明判定。Browser关闭失败、残留、缺少确认、confirm后迟到事件或sentinel teardown顺序错误会使DURING/AFTER不可信，固定升级为`EVIDENCE_TRANSACTION/4`且不得提交可消费Gate Artifact。父Node owner只拥有Playwright test child的最终终止，lifecycle接口只拥有自己启动的Runtime/Web child。任何一方都不得终止未知PID，也不得把Playwright child退出冒充Chromium或Runtime/Web cleanup证明。

### 7.2 READY与终止

固定启动顺序：

```text
PROBE_RUNTIME_AND_WEB_PORTS_FREE
-> START_RUNTIME_CHILD
-> WAIT_EXACT_RUNTIME_READY
-> START_PRODUCTION_WEB_CHILD
-> WAIT_WEB_HEALTH_AND_BOOTSTRAP_READY
-> CREATE_CYCLE_CLIENTS
-> CALL_BOUND_HANDLER(origin, observation_sink)
   -> LAUNCH_FRESH_BROWSER_CONTEXT_PAGE
   -> ATTACH_BROWSER_PAGE
   -> NAVIGATE_AND_EXECUTE_COMMON_DRIVER
   -> FINALLY_CLOSE_PAGE_CONTEXT_BROWSER
   -> CONFIRM_BROWSER_CLOSED
   -> ENTER_CONFIRMED_SENTINEL
-> WAIT_HANDLER_SETTLE
-> VERIFY_NO_LATE_EVENT
-> CLOSE_SINK_AND_PRECONDITION_CLIENT
-> REMOVE_ALL_SENTINELS
-> VERIFY_BROWSER_PROOF_COMPLETE
```

固定回收顺序：

```text
CLOSE_OBSERVATION_AND_PRECONDITION_CLIENTS
-> TERMINATE_WEB_SIGTERM
-> WAIT_WEB_EXIT
-> TERMINATE_RUNTIME_SIGTERM
-> WAIT_RUNTIME_EXIT
-> REMOVE_FAULT_CHALLENGE_IF_PRESENT
-> SIGKILL_ONLY_THE_SAME_CHILD_IF_TIMEOUT
-> VERIFY_CHILD_EXIT_IDENTITIES
-> VERIFY_RUNTIME_AND_WEB_PORTS_RELEASED
```

SIGKILL只能用于同一接口启动、PID与启动证明闭合且SIGTERM超时的child。端口READY不得用固定sleep、HTTP 200单项或stdout模糊包含判断；必须复用现有exact Runtime READY、Web health/bootstrap和端口探测契约。

## 8. D10B Ownership与唯一顺序

### 8.1 Owner

1. D10A仍由父Node owner在preflight中采样；
2. D10B `BEFORE/DURING/AFTER`均由`runControlledLifecycleSession()`调用同一个module-private Gate snapshot reader采样；
3. Gate Observation Artifact writer同样由该接口唯一拥有并在Playwright spec进程内执行；
4. spec不得直接读取Gate root、拼装snapshot、写tmp/final或补齐缺失DURING；父Node owner只能在Playwright退出后只读验证。

### 8.2 采样与回收顺序

```text
VERIFY_SESSION_INPUTS_AND_HANDLER_MAP
-> SAMPLE_BEFORE
-> for each schedule and INITIAL/REOPEN:
     PREPARE_OR_REUSE_ATTEMPT_STORAGE
     START_AND_READY_RUNTIME_WEB
     RUN_HANDLER
     VERIFY_BROWSER_PROOF_COMPLETE
     CLOSE_OBSERVATION_AND_PRECONDITION_CLIENTS
     CLEANUP_CURRENT_CYCLE
     VERIFY_PORTS_RELEASED
     SAMPLE_DURING
-> CLEANUP_ALL_STARTED_CHILDREN
-> SAMPLE_AFTER
-> BUILD_GATE_OBSERVATION_OBJECT
-> WRITE_EXCLUSIVE_TMP
-> FILE_FSYNC_CLOSE_AND_REREAD_VERIFY
-> NO_REPLACE_RENAME_TO_gate-observation.json
-> DIRECTORY_FSYNC
-> RETURN_RESULT
```

`DURING`只在handler成功、Page绑定、临时关闭确认、handler settle前零迟到事件、sink关闭、sentinel全部移除和Browser proof最终成立，且当前cycle child全部终止、两个端口释放后采样。因此数组始终是已完整结束cycle的有序前缀。Gate漂移或handler业务失败后立即停止后续cycle；若Browser证明完整且其余cleanup成功，仍采样唯一AFTER并写Schema-valid `FAILED` Artifact。Browser证明、cleanup、端口释放、AFTER采样或Artifact原子提交不闭合时，不得采样当前DURING、不得生成可消费FAILED证据，按`EVIDENCE_TRANSACTION/4`失败并保留staging隔离。

## 9. 返回值与错误码

### 9.1 唯一返回值

成功写入并复核Gate Artifact后，接口只返回深冻结对象：

```text
ControlledLifecycleResult={
  status: "PASS_MATCHED"|"FAILED",
  completed_schedule_ids: ["FL-SCH-01", ...],
  completed_cycle_count: 0..12,
  gate_observation_ref: {kind,path,byte_length,sha256},
  cleanup: {
    runtime_started_count: 0..12,
    runtime_terminated_count: 0..12,
    web_started_count: 0..12,
    web_terminated_count: 0..12,
    released_port_count: 0..12,
    residual_process_count: 0,
    residual_listener_count: 0
  }
}
```

`gate_observation_ref.kind=GATE_OBSERVATION`，path固定为evidence staging root相对路径`fault-launcher/gate-observation.json`。`PASS_MATCHED`要求6个schedule、12个cycle、12个Runtime/Web start/terminate和12个端口值释放全部闭合；`FAILED`只允许真实完成前缀，且cleanup两个residual count仍必须为0。

`cleanup`中的四个process count只统计lifecycle接口启动的Runtime/Web child，不统计Chromium或Playwright test child。`released_port_count`按Descriptor中12个全局互异的`runtime_port/web_port`数值去重计数，范围固定为`0..12`。INITIAL与REOPEN复用同一schedule的两个端口，两个cycle各自都必须执行释放验证，但重复验证不得把计数扩大为24。Browser关闭由sink的对象引用与事件证明作为cycle准入，并由既有attempt Browser/Network observation承接；不新增Gate Artifact字段。Playwright test child终止由父Node在只读staging verifier前复核。`completed_schedule_ids`只包含INITIAL和REOPEN均完整完成的schedule；`completed_cycle_count`允许在FAILED时为奇数。

### 9.2 稳定错误码

| 场景 | 稳定错误码/结果 |
| --- | --- |
| 参数、handler map、schedule或origin形状错误 | `E2E_ORCHESTRATION_INPUT_INVALID` |
| Context/Manifest/Descriptor/raw ref或身份join漂移 | `E2E_ORCHESTRATION_REF_MISMATCH` |
| attempt root已存在、residual或重复case/ordinal | `E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH` |
| Runtime/Web spawn、READY、提前退出或非零退出 | 内部`E2E_ORCHESTRATION_PROCESS_FAILED`；cleanup闭合时Artifact failure code=`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED` |
| handler抛错、返回非undefined或sink越界使用 | Artifact failure code=`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED` |
| Page未绑定、重复/late/跨cycle绑定，Browser/Context/Page对象或关闭事件不闭合，confirm后出现sentinel事件，或sentinel提前移除/未完整移除 | 内部`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID`并升级为`EVIDENCE_TRANSACTION/4`，不得采样当前DURING或提交可消费Artifact |
| BEFORE/DURING/AFTER与D10A不等 | Artifact failure code=`PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN` |
| child身份不闭合或端口未释放 | `E2E_ORCHESTRATION_PORT_NOT_RELEASED`并升级为`EVIDENCE_TRANSACTION/4`，不得提交可消费Artifact |
| AFTER、tmp/fsync/reread/rename/directory fsync失败 | `EVIDENCE_TRANSACTION/4` |

业务证据内的首错优先级固定为Gate mutation高于同cycle handler结果；后续业务/执行错误只追加既有`failures[]`，不得覆盖首项。Browser证明失败属于证据事务失败，优先于handler业务错误与Gate mutation；cleanup或其他证据事务不可信时同理。无论先前业务首错为何，最终调用均以`EVIDENCE_TRANSACTION/4`失败、不返回`ControlledLifecycleResult`且不提交可消费Artifact。

## 10. Stage A Guard

在本接口及对应Runner测试完成前：

```text
Stage A commit = FORBIDDEN
Stage A patch SHA = NOT_CREATED
D10B = NOT_RUN
Controlled evidence root = NOT_CREATED
```

允许继续完成D01~D09/D10A的preflight工具、输入和BLOCKED/READY计算验证，但缺A commit时D01不得伪造`READY`，D10A READY也不得启动Runtime/Web/Playwright。只有以下条件全部满足后才允许形成A commit：

1. 七项`M/M/M/M/M/A/A`delta精确；
2. lifecycle接口签名、handler map、六方法sink、Page事件绑定、Browser关闭证明、12-cycle顺序、D10B writer和cleanup测试通过；
3. controlled新增文件只调用该接口，没有第二套spawn/READY/cleanup/client/artifact逻辑；
4. `git diff --check`、contract validate和source clean通过。

## 11. 验收矩阵

正例至少覆盖：6 schedule/12 cycle严格串行、同attempt storage复用、每cycle fresh Runtime/Web与spec-owned fresh Chromium/context/page、exact READY、spec回调只见origin/sink、六方法sink深冻结、Page在route/navigation/API前恰绑定一次、wait方法只消费同Page有序网络事件、finally关闭后以同对象恰确认一次、三个关闭事件和零pending观测闭合、confirm后业务采样冻结、sentinel持续到handler settle、零late flag、sink关闭后完整teardown、12个唯一端口去重计数、14项D10B、完整cleanup与PASS返回；另覆盖handler业务失败但Browser证明完整时生成真实FAILED前缀。

反例至少覆盖：错误/额外handler、spec直接调用prepare helper、spec构造precondition client、browser从PATH/default cache启动、缺失/重复/late attach、非Page或已关闭Page、跨cycle或第二Page绑定、wait方法消费另一个Page/HTTP旁路、错误对象confirm、缺失/重复confirm、缺Page close/Context close/Browser disconnected事件、pending请求、confirm后业务采样继续写入、confirm与sentinel安装之间存在监听空窗、confirm后任一网络/关闭迟到事件、sentinel在handler settle前移除、sink关闭后sentinel残留、handler settle时browser残留、Browser证明失败后仍采样DURING或写FAILED Artifact、Runtime先于端口探测、Web先于Runtime READY、REOPEN先于INITIAL cleanup、handler返回非undefined、Gate漂移、Runtime/Web提前退出、SIGTERM超时、错误PID、端口残留、把24次释放检查计为24个端口、DURING提前采样、伪造未完成前缀、spec直接写Artifact、AFTER/atomic write失败。

文档验收必须执行`npm run contract:validate`、本地Markdown链接检查、活动冲突扫描与`git diff --check`。本轮不执行Runtime、Playwright或`194/388`，因为没有实现改动。

## 12. 回滚、事实与非结论

回滚只撤销本设计修正及索引/状态同步，不删除历史commit、工作树实现、release root或用户数据。回滚后Stage A恢复为`BLOCKED_BY_CONTROLLED_LIFECYCLE_INTERFACE_CONTRACT_MISSING`，不得退回spec自行编排。

事实：`9048bb3... -> f4c978e... -> 2f698cf... -> 8be0b83...`已形成首轮O/C/S/A candidate；首轮A的生命周期接口已实现，但Node 22全套回归复现release discovery与四路径source guard冲突，必须按后继修正规格重写为七路径A后才能接纳。R尚未创建。

非结论：本设计冻结不等于接口实现、A commit、D10B、controlled Playwright、production `194/388`、Report、Gate、Candidate、Activation、Capability、production发布或ISO符合性证明。
