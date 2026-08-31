# DEV-CANVAS-06 Stage R Service Regression 与 Source Guard Closure Bugfix Task Spec

状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`IMPLEMENTATION_NOT_STARTED`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`
- `backend-springboot`

## 1. 目标

关闭 Stage R 错误码实现与既有 Service 回归测试、Final Runner source guard 之间的 source ownership 缺口。允许更新现有 `LocalApiServiceTest.java` 中与冻结 `19=15 CTRL+4 STRUCT` 目标集合重叠的旧错误码断言，并使统一 source guard 精确接纳新增测试路径。

本规格不扩大错误码目标集合，不修改 Runner Source Set、公共请求/响应形状、SQLite、Profile、Golden、Manifest、Attempt Artifact 或 Report 版本。

## 2. 已查证冲突

1. `LocalApiServiceTest.java` 已有四条真实 Service 断言，把 `DUPLICATE_CONTROL_CAPABILITY`、`NON_INPUT_SEGMENT`、`BASE_CAPABILITY_MISMATCH` 和 `EVENT_CONDITION_COMBINATION` 固定为旧 `DOMAIN_REJECTED`；
2. `LocalApiService.java` 按 Family Error Code Mapping 规格改为 `MODIFIER_COMBINATION_INVALID` 后，这四条测试必然失败；
3. 现有 Stage R allowlist 只包含 `LocalApiControllerTest.java`，禁止更新上述既有回归测试；
4. `scripts/canvas06-unified-production-input.mjs` 的 `RUNNER_DELTA` 和 `FINAL_RUNNER_CUMULATIVE_DELTA` 固定为旧20/42路径；新增 Java 测试路径后，Final Runner source guard 必然拒绝正确 R；
5. source guard owner及其测试在Stage A已存在，但必须在Stage R形成非空后继patch，才能接纳新的R，而不能通过运行时fallback或放宽extra path校验解决。

## 3. 唯一修正

在既有 Stage R `20=18 M+2 A` 基础上增加恰好三个 `M`：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
```

新活动计数固定为：

```text
Stage = 20/2/7/23
Stage R = 23=21 M+2 A
O..A = 25=15 M+10 A
O..R = 43=31 M+12 A
Runner Source Set = 0.2/0.2.0/24
```

其中：

- API/Runtime contract 子切片从 `4 M`扩为`5 M`，新增 `LocalApiServiceTest.java`；
- Final Runner source guard 子切片为额外 `2 M`，必须在生产输入重建前完成；
- 两个source guard路径已属于O..A累计集合，因此O..R只因新增Java测试路径从42增至43；
- 三个新增Stage R修改均不进入Runner Source Set；Service与Service测试只通过同一clean R构建和测试闭合。

## 4. Service 测试边界

允许修改的既有断言仅包括Family Error Code Mapping规格第4章的19类目标谓词。至少同步以下既有四项：

```text
DUPLICATE_CONTROL_CAPABILITY
NON_INPUT_SEGMENT
BASE_CAPABILITY_MISMATCH
EVENT_CONDITION_COMBINATION
```

必须继续证明以下排除集保持 `DOMAIN_REJECTED`：

```text
candidate query/option stale or mismatch
endpoint kind or normalization mismatch
State owner mismatch
duplicate/unknown Structural label slot
unsupported Structural direction
Fact capability mismatch/not found
```

禁止按错误消息字符串重分类，禁止修改生产测试夹具以绕过真实 Service，禁止把全部 `DOMAIN_REJECTED` 断言改为新码。

## 5. Source Guard 边界

`RUNNER_DELTA` 必须按UTF-8 path bytes排序并精确包含23项；`FINAL_RUNNER_CUMULATIVE_DELTA` 必须精确包含43项。测试至少证明：

1. 23/43计数与有序唯一性；
2. `LocalApiServiceTest.java` 只出现在R与累计集合，不出现在FAULT_2A集合；
3. 缺该路径、extra path、错误status或旧20/42集合均拒绝；
4. `LocalApiService.java`、两个Java测试和两个source guard路径都必须相对A产生非空R bytes；
5. `FAULT_2A` target及A的七路径身份保持不变。

禁止默认接受未知路径、目录扫描、从Git历史猜测新集合或继续硬编码旧42计数。

## 6. 修改边界

本设计修正允许新增本规格/checklist并同步活动设计、规格、checklist和索引。后继Stage R实现新增允许修改的source路径仅为第3章三项；原20项保持不变。

禁止修改其他产品Java、Vue、DDL、Profile、Golden、Manifest/Attempt/Report Schema、Common Driver、Fault产品语义或A及更早commit。

## 7. 实现顺序与验收

唯一顺序：

```text
ADD_FAILING_REAL_HTTP_TEST
-> FREEZE_THIS_CLOSURE
-> UPDATE_EXISTING_SERVICE_REGRESSION_TESTS
-> IMPLEMENT_NARROW_19_CASE_MAPPING
-> UPDATE_OPENAPI_AND_NODE_CONTRACT_CASES
-> UPDATE_FINAL_RUNNER_SOURCE_GUARD_23_43
-> RUN_API_SERVICE_CONTRACT_REGRESSION
-> CONTINUE_CONTEXT_BRIDGE_DRIVER_RUNNER
```

最低验证：

```text
npm run contract:validate
./mvnw -pl services/local-runtime -Dtest=LocalApiServiceTest,LocalApiControllerTest test
node --test scripts/canvas06-unified-production-input.test.mjs
git diff --check
```

验收只证明设计与实现切片闭合，不证明R commit、真实194/388、Report、Gate、Candidate、Activation、Capability、production或ISO符合性。

## 8. 回滚

R形成前，回滚本修正新增的三个source路径及活动设计口径。R形成后不得原地改写；必须创建后继commit、重建Runtime JAR和全部生产输入，并重新执行installed verifier。禁止删除历史A/R或继续消费与source guard不一致的版本根。

