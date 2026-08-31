# DEV-CANVAS-06 E2E Family Driver Implementation Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

Task Type：`feature`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 目标

按 [Family Driver执行设计](../docs/design/opm-dev-canvas-06-e2e-family-driver-execution-design.md) 实现三个Family Driver，使活动Manifest `0.2`的`178=33 PROC+35 CTRL+110 STRUCT` case具有唯一、可执行、可复核的UI/API路径，并把实现纳入Final Production Source Chain的Stage R。

## 2. 设计输入

1. Family Driver执行设计 `v1.4`；
2. E2E Runner实现规格活动版本；
3. E2E Manifest `0.2` Schema；
4. E2E Attempt Artifact `0.2` Schema与Profile/Digest Closure；
5. Stage A Controlled Lifecycle Interface；
6. Final Production Source Chain Closure；
7. OpenAPI `API-PRJ-009/API-CTX-001/002/API-EDT-001/002/API-TXT-001`；
8. Manifest锁定的Coverage Catalog、Golden Manifest、Golden Replay、Family Identity Catalog和178个input fixture；
9. Family Controlled Invocation Context、Driver dispatch、precondition client与production bridge闭包规格。

Build顺序硬前置：Stage R必须先完成本规格第3.1节API/Runtime contract `5 M`子切片及`2 M`source guard闭包，其定向测试全部通过后才允许进入第3.2节Family Driver `4 M`子切片。不允许在Driver内改写wire code来绕过该顺序。

### 2.1 非目标与兼容性

- 非目标：本Driver子切片不实现Runner生产调度、Stage A lifecycle、Common Driver、Context/Source Set Schema owner、Manifest/Attempt/Report producer、产品语义、SQLite DDL、Profile资产、Gate或Capability启用；Context/bridge由同一Stage R的独立闭包切片承接；
- API兼容：`ErrorDetail.code`只做新增枚举值的向后兼容扩展；Runtime只修正19个封闭非法组合的top code，不修改HTTP status、media type、ErrorEnvelope字段、其他领域错误或generated EDT contract；
- E2E兼容：四Driver均使用五参数接口；Runner必须构造完整Family/Common CaseExecution，Source Set活动版本升级为`0.2/24`，Manifest/Attempt/Report版本保持不变；
- 发布兼容：全部raw ref和aggregate只能从同一clean R tree重算，历史Manifest、Report和attempt root只读且不得覆盖。

## 3. 修改边界

### 3.1 API/Runtime contract 前置子切片

固定为`5 M`：

```text
M docs/contracts/openapi/opm-local-api-v1.yaml
M scripts/validate-contracts.mjs
M services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
M services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java
M services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
```

只允许按设计第6.5~6.6节和独立[错误码映射闭包规格](opm-dev-canvas-06-family-error-code-mapping-source-closure-bugfix-task-spec.md)增加`ErrorDetail.code=MODIFIER_COMBINATION_INVALID`、把精确`19=15 CTRL+4 STRUCT`项最窄Service校验映射为该top code，并补Schema及真实HTTP raw-body正反例。禁止批量替换`domain()`，未列领域错误必须保持原码；不修改generated contract、其他OpenAPI字段或错误码。

### 3.2 Family Driver 允许修改

本切片固定为`4 M`：

```text
M scripts/release-canvas06-e2e-run.test.mjs
M tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs
M tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs
```

三个Driver负责导出、case membership、步骤编排和断言调用；既有Runner test负责模块接口、178项exact join、步骤构造、正反例和source raw ref验收。不得新增Driver helper或独立test文件。

### 3.3 禁止修改

除第3.1节恰好四个路径外，禁止修改Common Driver、Runner生产owner、Playwright config/spec、Vue、其他Java、其他OpenAPI、SQLite、Manifest/Attempt/Report/Source Set Schema、Profile/Rule/Grammar/Symbol、fixture、Catalog、Handoff、release root、Gate和Capability状态。

若API/Runtime contract四个路径或Family Driver四个路径中的任一集合不足，停止Build并新开bugfix规格；禁止坐标点击、DOM class、message解析、checkout fallback、HTTP旁路或test controller绕过。

## 4. 导出与case集合

每module恰导出：

```text
driver
case_ids
executeCase({page,case_entry,attempt_identity,observation_sink,precondition_client})
```

三个`case_ids`必须与Manifest family子序列逐项相等，计数`33/35/110`，合计178；`driver` metadata按设计第3章逐字段相等。unknown、跨Family、重复、缺项、extra、错suite/capability prefix或非undefined返回均拒绝。

## 5. 实现顺序

1. 先实现第3.1节API/Runtime contract四文件正反例并重跑contract/MVC定向验证；
2. 在Runner test中建立占位Driver失败测试和178项exact join fixture；
3. 实现三个module的封闭exports与membership；
4. 实现PROC 16 PASS/17 BLOCKED；
5. 由Controlled Invocation的Runner owner先完成CTRL基础Fact SETUP identity绑定，Driver只消费深冻结`SetupBoundAttemptIdentity`并实现20 PASS/15 BLOCKED；
6. 实现STRUCT 94 PASS/16 BLOCKED；
7. 复用六方法sink、API exchange、transaction/reopen断言，不新建lifecycle或artifact；
8. 重跑Stage A controlled回归和Runner定向测试；
9. 只有Stage R其余owner也完成后，才按Final Source Chain形成R commit并重建production输入。

## 6. 验收矩阵

### 6.1 接口/输入

- 三module只有三个named export，无default/extra；
- case集合`33/35/110`、PASS`16/20/94`、BLOCKED`17/15/16`；
- 五方exact join、两次Replay一致、Family identity与fixture raw ref闭合；
- Driver收到的identity必须是Runner-owned `Materialized -> RUN_SETUP -> SetupBound`转换后的同一深冻结对象；CTRL三项SETUP字段有效，PROC/STRUCT为显式null/base形状；
- unknown/duplicate/missing/extra/order/ref/SHA/expectation drift在浏览器前拒绝。

### 6.2 UI/API

- 130 PASS只通过真实UI触发subject；
- 48 BLOCKED先建立合法UI候选，再只执行一次正式API负例；
- selector只使用设计第5章；
- API操作、HTTP状态、top/detail error与设计第6.4节一致；
- OpenAPI `ErrorDetail.code`、Runtime wire和Golden Replay对`MODIFIER_COMBINATION_INVALID`一致，且仅设计第6.6节19项改码；Stage R前置API/Runtime contract子切片的Schema/raw-body正反例已通过；
- 没有候选或按钮disabled不能自动判为BLOCKED matched。

### 6.3 Transaction/Reopen/Evidence

- CTRL SETUP提交发生在subject before snapshot之前；
- CTRL `setup_fact_id`由正式CREATE_FACT response `affected_ids`与SETUP前后Revision Fact差集唯一交集取得，并与`subject_baseline_revision`、SETUP response raw ref、API Exchange唯一entry和subject request `base_revision`逐字段闭合；禁止首项、DOM、fixture、path、SHA或SQLite顺序推断；
- PASS事务`1/1/1/1/0/1/1/true`；BLOCKED事务全零；
- PASS reopen等于subject result，BLOCKED reopen等于subject baseline；
- 11类Attempt root、API raw body、assertion refs、Artifact Index和两次semantic digest闭合；
- Browser proof、cleanup或artifact事务失败时零可消费attempt/Report。

### 6.4 Source chain

- Stage R exact delta为`25=23 M+2 A`，包括既有23项及Family Attempt Path Owner闭包两项；
- `O..R=45=33 M+12 A`，`O..A=25=15 M+10 A`；
- Runner Source Set活动版本为`0.2/24`，R raw refs/aggregate必须从同一clean R tree重算；
- `LocalApiService.java`不加入Runner Source Set；它只通过同一clean R重建后的Runtime JAR raw identity进入Manifest/Attempt/Report；
- 三Driver source ref同时与Manifest `driver_catalog[0..2]`和Report mirror一致。

## 7. 验证命令

后继Build至少执行：

```text
node --test scripts/release-canvas06-e2e-run.test.mjs
npm run contract:validate
./mvnw -pl services/local-runtime -Dtest=LocalApiServiceTest,LocalApiControllerTest test
npm run release:canvas06:e2e:runner:test
npm run lint
npm run typecheck
npm run build
git diff --check
```

`194/388`只在完整R、fresh production输入和Manifest installed verifier全部通过后执行，不能以unit fixture替代。

## 8. 回滚与状态

回滚Driver实现必须与Controlled Invocation闭包协调重新计算Stage R patch、24项Source Set和Runtime JAR identity；已形成R时必须新建后继commit和版本根，不得只回滚Service/Driver并继续消费旧JAR或旧aggregate；不修改或删除不可变Manifest、Report、attempt root或用户SQLite。

本规格设计状态为`FROZEN_FOR_IMPLEMENTATION`。当前三个Driver仍是占位实现，19项真实HTTP映射、Stage R、真实`194/388`、Report、Gate、Candidate、Activation、Capability、生产与ISO证据均未形成。
