# Spec: DEV-CANVAS-06 E2E Common Driver与受控编排实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NOT_STARTED`

Build准入：`READY_FOR_BUILD`

受控194/388准入：`BLOCKED_BY_MANIFEST_V02_AND_EXACT_CLEAN_BASE`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `frontend-vue`
- `testing`

## 1. 目标

实现Common Driver与controlled attempt编排，使16个Common case严格按`docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.2`执行，并补齐三个稳定UI selector和Fact删除入口。该实现只提供Runner可消费的真实UI/API动作及受控进程编排，不写Manifest/Report READY、不提升Gate。

## 2. 权威输入

1. Common Driver/Orchestration设计`v1.2`；
2. E2E Runner实现规格的Manifest `0.2`、Attempt Artifact `0.2`、Report `0.2`边界；
3. Fault Launcher设计`v1.1`及后继实现规格；
4. OpenAPI `API-EDT-001/002`现有wire与当前Runtime首错顺序；
5. 活动Common Catalog `0.2.0`和Manifest v02 producer/verifier规格。

## 3. 精确修改边界

### 3.1 非文档allowlist：`18 paths`

1. `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`
2. `tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs`
3. `scripts/canvas06-e2e-controlled-orchestration.mjs`
4. `scripts/canvas06-e2e-controlled-orchestration.test.mjs`
5. `scripts/release-canvas06-e2e-run.mjs`
6. `scripts/release-canvas06-e2e-run.test.mjs`
7. `scripts/canvas06-e2e-run-input.mjs`
8. `scripts/canvas06-e2e-run-input.test.mjs`
9. `scripts/canvas06-e2e-attempt-artifacts.mjs`
10. `scripts/canvas06-e2e-attempt-artifacts.test.mjs`
11. `tests/e2e/release/dev-canvas-06/playwright.release.config.ts`
12. `tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts`
13. `apps/web/src/modules/workbench/WorkbenchView.vue`
14. `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
15. `apps/web/src/stores/workbenchRuntime.ts`
16. `apps/web/src/stores/workbenchRuntime.spec.ts`
17. `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs`
18. `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.test.mjs`

`M/A`只在exact clean base形成后计算。文档只同步本规格checklist、Manifest v02规格/checklist、Runner/Fault checklist、测试策略、执行包、冻结基线和README。

### 3.2 允许的产品前端变化

仅允许：

1. 为State inspector name输入增加`data-testid=p03-state-inspector-name`；
2. 为State inspector根增加`data-testid=p03-state-inspector`；
3. 基于现有`DELETE_CONSTRUCT` capability/impact token，为已选Fact增加`data-testid=p03-fact-delete-impact`的影响摘要与“删除关系”按钮；
4. 请求、错误、保存状态继续使用现有`LocalRuntimeApi`与store状态机。

禁止新增API、修改DTO、改SQLite、增加test-only DOM控制、把driver注入生产bundle或改变非测试业务语义。

## 4. Driver实现

1. exports、CommonCase shape、16项顺序、初始状态、八类step、selector及有序`expected_apis[]`完全等于主设计；
2. `COMMON_CASES`在module初始化后递归freeze；
3. driver拒绝未知/缺/extra/reorder case，拒绝Manifest expectation、transaction或Catalog错误码与常量不等；
4. 任何动作通过Playwright locator或封闭`precondition_client`执行，不访问Vue store、window内部对象、SQLite或checkout；
5. `REPLACE_OPTION_ID/REPLACE_IMPACT_TOKEN`只在request发出前对当前case的单次API-EDT-002 body做受控替换，原body、实际body、response均进入artifact；其他请求或第二次触发立即失败；
6. `ADVANCE_HEAD`执行一个正式、可复核的API-EDT-002 no-op-independent写命令，完成后重新采集subject baseline；旧页面保留旧base/token，预期首错为`REVISION_CONFLICT`；
7. `SUBMIT_READONLY_COMMAND`从已验证Projection和binding构造与UI Consumption相同的正式request，证明Runtime返回409；UI同时必须显示readonly banner且工具禁用。

## 5. Common输入重建

factory只允许更新九个BLOCKED case的`expected_error_code`：

```text
AMBIGUOUS -> 字段省略
STALE_OPTION -> DOMAIN_REJECTED
STALE_TOKEN -> REVISION_CONFLICT
MISMATCHED_TOKEN -> DOMAIN_REJECTED
ASSET_MISSING -> TEXT_GENERATION_BLOCKED
TEXT_BLOCKED -> DOMAIN_REJECTED
REVISION_CONFLICT -> REVISION_CONFLICT
PERSISTENCE_FAILED -> PERSISTENCE_FAILED
READONLY -> READ_ONLY_REVISION
```

7个PASS与9个BLOCKED的事务分别使用`TX_COMMIT_1/TX_NO_COMMIT`。重建32个BASE/INPUT与Catalog refs属于后续release输出，不进入本source delta；唯一后继入口为`specs/opm-dev-canvas-06-common-e2e-input-rebuild-implementation-task-spec.md`及其checklist。历史0.1.0 bytes不得改写。

## 6. Controlled Orchestration实现

1. 实现主设计`prepareControlledAttempt()`签名，不增加Runtime/Web override CLI；
2. Runtime JAR、Web dist、Profile assets和四个driver只从已验证Manifest final root复制到fresh attempt；
3. copy前后分别验证source与destination single-link/type/length/SHA或tree digest；
4. attempt root排他创建且此前不存在；任何residual、link、跨report或duplicate ordinal拒绝；
5. INITIAL与REOPEN各启动一套新Runtime、production Web和Chromium，使用同一storage；
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
```

错误进入既有Attempt/Report failure precedence，不新增公共wire错误。

## 8. 测试矩阵

### 8.1 Unit

- 16项exact constant、递归freeze、case顺序、7/9、有序API数组、错误码和事务恒等式；
- selector只允许T/X/R，拒绝class/XPath/坐标/nth/sleep；
- 五种precondition一次性、case限制、raw before/after artifact；
- fresh path、copy/ref/tree、same storage/different process identity。

### 8.2 Vue

- 三个test id唯一存在；
- Fact delete只在能力enabled且有impact token时可提交；
- blocked/readonly/error不改变head，成功删除刷新Projection/Text/Revision；
- 不改变State、Relation、Control既有回归。

### 8.3 Controlled integration

- 每个Common case至少一个forked exact JAR + production Web + Chromium受控正例；
- 三个Fault case使用Fault Launcher，其他13个普通INITIAL，全部REOPEN普通启动；
- 16项两个attempt形成32个完整Attempt Artifact `0.2`；
- 受控全量194/388只在Manifest v02和Family driver均READY后运行。

### 8.4 反例

缺selector、重复locator、错误API/status/code、额外POST、precondition二次触发、SETUP计入delta、错误baseline、JAR/Web/Profile/driver drift、attempt已存在、REOPEN换storage/复用process、端口残留、Vite/HMR、外网和placeholder。

## 9. 必跑命令

```text
npm run test -- --run apps/web/src/modules/workbench/WorkbenchView.spec.ts apps/web/src/stores/workbenchRuntime.spec.ts
node --test tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs scripts/canvas06-e2e-controlled-orchestration.test.mjs
npm run release:canvas06:e2e:runner:test
npm run lint
npm run typecheck
npm run build
git diff --check
```

forked-JAR/controlled browser只在exact Runtime/Manifest输入可用时执行；单元通过不等于194/388、Report或Gate READY。

## 10. 回滚与状态

回滚删除新增driver/orchestration/spec，移除三个test id和Fact删除UI增量，恢复factory source；不删除已存在release root或用户数据。错误生成资产只能整体隔离。

本规格已具备Build输入；受控全量仍等待Manifest v02 producer/verifier、exact clean base与Fault Launcher实现。Capability保持未启用，`GATE-06-03=NOT_RUN`。
