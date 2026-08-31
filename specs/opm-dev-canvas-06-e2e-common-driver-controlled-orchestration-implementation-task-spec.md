# Spec: DEV-CANVAS-06 E2E Common Driver与受控编排实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`DRIVER_UI_FACTORY_EXISTING/CONTROLLED_LIFECYCLE_NOT_STARTED`

Build准入：`BLOCKED_BY_STAGE_A_LIFECYCLE_IMPLEMENTATION`

受控194/388准入：`BLOCKED_BY_MANIFEST_V02_EXACT_CLEAN_BASE_FAULT_LAUNCHER_AND_ORCHESTRATION`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

只实现尚缺的controlled attempt编排，使现有Common Driver的16个Common case严格按`docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.8`与Stage A lifecycle closure执行。Common Driver、三个稳定UI selector、Fact删除入口、store与factory均作为只读前置消费；本包不重复实现。该实现只提供Runner可消费的受控进程编排与真实UI/API执行，不写Manifest/Report READY、不提升Gate。

## 2. 权威输入

1. Common Driver/Orchestration设计`v1.8`与Stage A Controlled Lifecycle Interface Closure；
2. E2E Runner实现规格的Manifest `0.2`、Attempt Artifact `0.2`、Report `0.2`边界；
3. Fault Launcher设计`v1.9`、Stage A lifecycle closure及后继实现规格；
4. OpenAPI `API-EDT-001/002`现有wire与当前Runtime首错顺序；
5. 活动Common Catalog `0.2.0`和Manifest v02 producer/verifier规格。

## 3. 精确修改边界

### 3.1 非文档allowlist：`8=7 M+1 A`

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-e2e-run-input.mjs
M scripts/canvas06-e2e-run-input.test.mjs
M scripts/canvas06-e2e-attempt-artifacts.mjs
M scripts/canvas06-e2e-attempt-artifacts.test.mjs
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
A tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts
```

七个`M`必须在exact clean base中已跟踪，唯一`A`必须不存在。四个production文件已属于Runner Source Set `0.1`的23项；四个测试文件继续属于Source Set排除集。不得修改Source Set Schema或Report Schema，不得新增Source Set外production helper。

### 3.2 只读前置

以下路径不进入本source delta：

1. `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`及其测试；
2. `apps/web/src/modules/workbench/WorkbenchView.vue`及其现有测试；
3. `apps/web/src/stores/workbenchRuntime.ts`；
4. `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs`及其测试；
5. Runner Source Set `0.1`与E2E Report `0.2` Schema。

现有三个selector和Fact删除入口只做回归验证。禁止新增不存在的`workbenchRuntime.spec.ts`来扩大本包，也禁止借本包修改API、DTO、SQLite、产品前端业务语义或factory输出。

## 4. Driver只读契约

现有driver的exports、16项顺序、八类step、selector、有序`expected_apis[]`、一次性precondition、`ADVANCE_HEAD`、READONLY与递归freeze必须继续完全等于主设计。Runner只能导入并执行，不得复制常量、修正expectation、从路径推断case或把driver逻辑搬入编排owner。任何不一致使controlled case失败并回流原owner，不授权在本包修改driver。

## 5. Common输入只读边界

Common factory的`7 PASS/9 BLOCKED`、九项错误/空码和`TX_COMMIT_1/TX_NO_COMMIT`已经实现；活动43文件root已由独立Common E2E输入重建包生成并自验证。本包只读消费Manifest锁定的final bytes，不修改factory、32个BASE/INPUT、Catalog ref或历史`0.1.0` bytes，也不把self-verified root解释为production Manifest、Report或Gate证据。

## 6. Controlled Orchestration实现

1. 在`scripts/release-canvas06-e2e-run.mjs`内实现后继Stage A规格的`runControlledLifecycleSession()`签名；`prepareControlledAttempt()`只作为其内部步骤，不增加独立orchestration文件、第二CLI或Runtime/Web override CLI；
2. Runtime JAR、Web dist、Profile assets和四个driver只从已验证Manifest final root复制到fresh attempt；
3. copy前后分别验证source与destination single-link/type/length/SHA或tree digest；
4. attempt root排他创建且此前不存在；任何residual、link、跨report或duplicate ordinal拒绝；
5. lifecycle接口为INITIAL与REOPEN各启动一套新Runtime和production Web并使用同一storage；spec handler从预绑定的exact browser executable为每个cycle启动fresh Chromium process/context/page，在route/navigation/API前调用owner sink的`attachBrowserPage(page)`，并在`finally`关闭三者后以相同对象调用`confirmBrowserClosed({browser,context,page})`；lifecycle接口只监听/校验Page网络与关闭事件，不得接管或伪造Browser cleanup。confirm只形成临时`CONFIRMED_SENTINEL`：业务采样立即停止，最小迟到事件sentinel无间隙保留到handler settle和sink关闭；Runner复核零迟到事件并移除全部sentinel后才接纳最终Browser proof；
6. SETUP完成并验证后采集subject baseline；`ADVANCE_HEAD`类case在advance后重置subject baseline；`SUBMIT_TEXT_BLOCKED_COMMAND`只提交设计冻结的活动Manifest input，不允许driver临时发明payload；
7. 固定等待使用API response、Projection revision和两个animation frame，不使用sleep；
8. 停止后证明端口无listener、child已退出、artifact闭合；不得终止未知进程。

## 7. 原子与失败边界

preflight/fresh-root创建前失败零attempt输出。创建后失败只保留父Report staging中的真实artifact，由父Runner决定继续case或放弃整个staging；本模块不rename final Report、不生成placeholder、不单独提交attempt。

稳定错误码：

```text
E2E_DRIVER_MAPPING_INVALID
E2E_DRIVER_SELECTOR_INVALID
E2E_DRIVER_API_MISMATCH
E2E_DRIVER_TRANSACTION_MISMATCH
E2E_ORCHESTRATION_INPUT_INVALID
E2E_ORCHESTRATION_REF_MISMATCH
E2E_ORCHESTRATION_ATTEMPT_NOT_FRESH
E2E_ORCHESTRATION_PROCESS_FAILED
E2E_ORCHESTRATION_PORT_NOT_RELEASED
E2E_ORCHESTRATION_BROWSER_PROOF_INVALID
```

错误进入既有Attempt/Report failure precedence，不新增公共wire错误。

## 8. 测试矩阵

### 8.1 Unit

- 现有16项exact constant、递归freeze、case顺序、7/9、有序API数组、错误码和事务恒等式回归；
- selector只允许T/X/R，拒绝class/XPath/坐标/nth/sleep；
- 五种precondition一次性、case限制、raw before/after artifact；
- fresh path、copy/ref/tree、same storage/different process identity。

### 8.2 既有Vue回归

- 三个test id唯一存在；
- Fact delete只在能力enabled且有impact token时可提交；
- blocked/readonly/error不改变head，成功删除刷新Projection/Text/Revision；
- 不改变State、Relation、Control既有回归。

不得修改Vue或store；缺少既有selector/Fact删除行为时，本包失败并回流产品owner。

### 8.3 Controlled integration

- 每个Common case至少一个forked exact JAR + production Web + Chromium受控正例；
- 三个Fault case使用Fault Launcher，其他13个普通INITIAL，全部REOPEN普通启动；
- 16项两个attempt形成32个完整Attempt Artifact `0.2`；
- 受控全量194/388只在Manifest v02和Family driver均READY后运行。

### 8.4 反例

缺selector、重复locator、错误API/status/code、额外POST、precondition二次触发、SETUP计入delta、错误baseline、JAR/Web/Profile/driver drift、attempt已存在、REOPEN换storage/复用process、端口残留、Vite/HMR、外网和placeholder。

## 9. 必跑命令

```text
npm run test -- --run apps/web/src/modules/workbench/WorkbenchView.spec.ts
node --test tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs scripts/release-canvas06-e2e-run.test.mjs scripts/canvas06-e2e-run-input.test.mjs scripts/canvas06-e2e-attempt-artifacts.test.mjs
npm run release:canvas06:e2e:runner:test
npm run lint
npm run typecheck
npm run build
git diff --check
```

forked-JAR/controlled browser只在exact Runtime/Manifest输入可用时执行；单元通过不等于194/388、Report或Gate READY。

## 10. 回滚与状态

回滚只回退本包八路径的编排实现与测试，将切片恢复为`BLOCKED_BY_ORCHESTRATION_NOT_IMPLEMENTED`；不得删除或回退只读Common Driver、selector、Fact删除入口、store、factory、既有release root或用户数据。错误生成资产只能整体隔离。

本规格的8路径职责子集与历史17项集成commit只作为`9048bb3...` origin来源，不再构成活动Build入口。唯一Build入口为Final Production Source Chain：Stage A在两个Runner `M`中实现并测试Fault `runControlledLifecycleSession()`；Stage R按Family Controlled Invocation闭包继续production行为并保持A回归。接口完成前禁止A commit与D10B。Stage A仍消费历史Source Set `0.1/23`身份；Final R必须升级为`0.2/24`并纳入唯一production bridge。Report保持`0.2/runner_version 0.2.0`；Capability保持未启用，`GATE-06-03=NOT_RUN`。
