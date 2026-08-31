# Spec: DEV-CANVAS-06 E2E Common Driver与受控编排实现

文档状态：`IMPLEMENTING`

实现状态：`PARTIAL`

Build准入：`READY`

受控194/388准入：`BLOCKED_BY_EXACT_CONTROLLED_INPUTS_AND_REAL_BROWSER_EVIDENCE`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `frontend-vue`
- `backend-springboot`
- `testing`

本任务超过三个 playbook，因为同一 Attempt Artifact 闭包同时包含既有Vue动作、Node受控编排和exact Runtime JAR内的只读Snapshot CLI；三者共享同一194/388验收链，拆开会使摘要owner再次失配。

## 1. 目标

实现Common Driver与controlled attempt编排，使16个Common case严格按`docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.14`执行，并补齐三个稳定UI selector、Fact删除入口及Attempt Observation/Artifact Index闭包。该实现只提供Runner可消费的真实UI/API动作及受控进程编排，不写Manifest/Report READY、不提升Gate。

## 2. 权威输入

1. Common Driver/Orchestration设计`v1.14`；
2. E2E Runner实现规格的Manifest `0.2`、Attempt Artifact `0.2`、Report `0.2`边界；
3. Fault Launcher设计`v1.1`及后继实现规格；
4. OpenAPI `API-EDT-001/002`现有wire与当前Runtime首错顺序；
5. 活动Common Catalog `0.2.0`和Manifest v02 producer/verifier规格。

## 3. 精确修改边界

### 3.1 非文档allowlist：`50 paths`

1. `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
2. `apps/web/src/modules/workbench/WorkbenchView.vue`
3. `apps/web/src/shared/api/localRuntimeApi.ts`
4. `apps/web/src/stores/workbenchRuntime.ts`
5. `scripts/build-canvas06-common-visual-fixtures.mjs`
6. `scripts/canvas06-e2e-attempt-artifacts.mjs`
7. `scripts/canvas06-e2e-attempt-artifacts.test.mjs`
8. `scripts/canvas06-e2e-common-fixtures.mjs`
9. `scripts/canvas06-e2e-common-setup-plan.mjs`
10. `scripts/canvas06-e2e-common-setup-plan.test.mjs`
11. `scripts/canvas06-e2e-manifest-v02-compose.mjs`
12. `scripts/canvas06-e2e-release-config.test.mjs`
13. `scripts/canvas06-e2e-run-input.mjs`
14. `scripts/canvas06-e2e-run-input.test.mjs`
15. `scripts/canvas06-e2e-run-report.mjs`
16. `scripts/canvas06-e2e-run-report.test.mjs`
17. `scripts/canvas06-e2e-run-stage.mjs`
18. `scripts/canvas06-e2e-run-stage.test.mjs`
19. `scripts/canvas06-projection-digest-v01.mjs`
20. `scripts/canvas06-projection-digest-v01.test.mjs`
21. `scripts/canvas06-unified-production-input.mjs`
22. `scripts/canvas06-unified-production-input.test.mjs`
23. `scripts/common-visual-fixtures.test.mjs`
24. `scripts/release-canvas06-e2e-manifest-v02.mjs`
25. `scripts/release-canvas06-e2e-run.mjs`
26. `scripts/release-canvas06-e2e-run.test.mjs`
27. `scripts/validate-canvas06-visual-e2e-schemas.test.mjs`
28. `scripts/validate-contracts.mjs`
29. `scripts/verify-canvas06-common-visual-fixtures.mjs`
30. `scripts/verify-canvas06-e2e-manifest-v02.mjs`
31. `scripts/verify-canvas06-e2e-report.mjs`
32. `scripts/verify-canvas06-e2e-report.test.mjs`
33. `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
34. `services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01.java`
35. `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotCli.java`
36. `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotSupport.java`
37. `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCli.java`
38. `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/E2ETransactionSnapshotCli.java`
39. `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
40. `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
41. `services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/ProjectionDigestV01Test.java`
42. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EAttemptSnapshotCliTest.java`
43. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerCliTest.java`
44. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/E2EFixtureMaterializerJarIT.java`
45. `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs`
46. `tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs`
47. `tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs`
48. `tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs`
49. `tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs`
50. `tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts`

`M/A`只在exact clean base形成后计算。允许的文档同步严格限于以下`13`项：

1. `docs/checklists/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-checklist.md`
2. `docs/contracts/openapi/opm-local-api-v1.yaml`
3. `docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json`
4. `docs/contracts/schemas/opm-dev-canvas-06-e2e-common-setup-plan.schema.json`
5. `docs/contracts/schemas/opm-dev-canvas-06-e2e-controlled-invocation-context.schema.json`
6. `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json`
7. `docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json`
8. `docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md`
9. `docs/design/opm-dev-canvas-06-e2e-common-setup-plan-design.md`
10. `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md`
11. `docs/design/opm-dev-canvas-06-projection-digest-closure-design.md`
12. `specs/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md`
13. `specs/opm-dev-canvas-06-e2e-common-setup-plan-implementation-task-spec.md`

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
7. Driver返回后、Browser关闭前采集subject-final Projection/Text/Revision并形成JCS摘要；REOPEN新页面必须经sink一次性`verifyReopen()`复读并匹配，且零Driver/SETUP/precondition调用；
8. 固定等待使用API response、Projection revision和两个animation frame，不使用sleep；
9. 停止后证明端口无listener、child已退出、artifact闭合；不得终止未知进程。
10. `semantic_comparison_digest`只投影`assertion_results[].{assertion_id,status}`，不得把attempt路径带入；Browser Environment fingerprint严格使用主设计`v1.6`的版本化preimage。
11. after/reopen五类`StateDigests`只允许由主设计`v1.11`的 exact Runtime JAR Snapshot CLI输出；Node必须通过冻结的`buildE2eAttemptSnapshotCommand/runE2eAttemptSnapshot`调用桥校验raw Projection ref、进程结果和规范stdout，不得重写Java摘要owner。CLI读取SQLite时必须同时使用`file:...?immutable=1`、Xerial `READONLY`和`PRAGMA query_only=ON`，连接前后零WAL/SHM/journal；不得开放生产HTTP、写SQLite、清理sidecar或用连接后`setReadOnly`替代open-time只读。
12. Materializer与Snapshot CLI必须先以Projection Digest Closure `v1.1`的唯一API adapter验证`context_id/constructs/suppressed_states`正式wire，再把既有`{context_id,constructs}` digest view交给Projection Digest `0.1`；不得放宽核心normalizer或改写历史vector SHA。
13. `transaction-observation.before/after`只允许由主设计`v1.11`的Transaction Snapshot CLI在INITIAL Runtime停止后按`subject_baseline_revision/actual head revision`两个不可变sequence cutoff重建，并逐项复用活动Schema既有`$defs.countSnapshot`；Node桥不得读取SQLite、活动WAL或按expected delta反推count。共享attempt/JAR/SQLite只读校验收敛到`E2EAttemptSnapshotSupport`，State/Transaction两个CLI不得各自维护第二套安全规则。
14. Materializer必须按主设计`v1.11`第2.8节先生成不可变base SQLite，再原子克隆working SQLite；`project_db_ref`只引用base，Snapshot只读取working。Runner在Runtime启动前复核初始clone相等，最终Report verifier分别验证base raw identity和working SQLite语义，禁止用base SHA校验运行后的working bytes。
15. Runtime Process的INITIAL/REOPEN `parent_nonce`按主设计`v1.11`第2.9节分别生成且不同；仅Fault INITIAL与Fault Plan nonce相等。Reopen artifact必须复制两个Runtime cycle nonce，禁止单一Plan nonce同时冒充两个process identity。
16. Runtime/Browser cycle证据按主设计`v1.11`第2.11节生成：Browser Context ID、真实Chromium版本、REOPEN实际StateDigests、三次连续UP、1 MiB日志上限、真实termination和normalized command均不得由期望值或路径反推。
17. Context producer/loader按主设计`v1.11`第2.10节建立并复核Report全局Java/Chromium evidence mirror；实际执行保留绝对source path，Attempt Artifact只引用相对mirror ref。
18. Network/Console按主设计`v1.13`第2.12节从同一Playwright Page事件流采集；两个cycle序号连续，API raw ref只复用同一Exchange capture，外源和异常Browser事件一律拒绝。
19. Attempt Observation按主设计`v1.13`第2.13节在SETUP后/Driver前采集subject before；`ADVANCE_HEAD`后必须在后续subject命令前重采并重绑Transaction before。只从subject边界后的唯一command提取Revision/command/option/token/error；10类assertion逐项绑定exact evidence refs，公共wire不存在的`detail_error_code`固定为`null`。
20. Artifact Index按主设计`v1.13`第2.14节最后写入，覆盖10个核心JSON、5个Profile资产、1个Profile tree、4个Runtime log和全部API raw refs；除`inputs/**/storage/**`外不得遗漏或额外索引实际文件。
21. verifier必须独立重算subject选择、字段、assertion和全部raw join；Materializer base Head只在Materializer identity内以`base=head`自闭合，不强制等于SETUP后的subject base；Attempt final Head与Transaction after/Reopen闭合，禁止读取Attempt Schema不存在的`reopen_matches`。
22. Attempt Observation必须保存before/after/reopen三份Revision document摘要并纳入semantic digest；Report `reopen_matches`只由五组after/reopen摘要计算，禁止从不存在的Attempt同义字段读取。

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
- base/working固定路径、初始clone相等、base drift、working缺失、路径互换、sidecar及运行后working SHA变化正反例。
- Java 21 version/release与Chromium source mirror的正例，以及source drift、mirror drift、非可执行、错误major和重复目标反例。
- 10类assertion全集、Family/Common PASS/BLOCKED/AMBIGUOUS subject选择、SETUP/ADVANCE_HEAD排除、字段提取、证据ref顺序及FAILED反例。
- Artifact Index核心/Profile/log/API完整闭包，以及缺log、extra文件、evidence未索引、错误phase/media/raw SHA反例。

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

事实：Common Setup Plan `v0.1`、Schema、44文件输入根、Manifest raw ref、Runner SETUP executor、严格串行session、Attempt Artifact/Artifact Index和Report verifier闭包已经实现并通过定向验证，原`BLOCKED_BY_COMMON_SETUP_PLAN_IMPLEMENTATION`与`BLOCKED_BY_SESSION_AND_ATTEMPT_ARTIFACT_CLOSURE`前置已解除。真实`194/388`仍等待exact Runtime/Web/Chromium受控输入与真实浏览器执行；Capability保持未启用，`GATE-06-03=NOT_RUN`。

Common INITIAL sink 固定先以未绑定状态创建。`resolve_invocation(page)`完成正式 SETUP 后，Runner 必须先一次性绑定实际`setup baseline`，再一次性绑定深冻结`attempt identity`，最后才返回五参数 Driver context。不得在 sink 创建前预测`subject_baseline_revision`，handler 顶层不携带`attempt_identity`。
