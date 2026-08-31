# Spec: GOLDEN-AUTHORING-03C Node Adapter 与一次性 Fault Hook 契约闭包修正

文档状态：`FROZEN`

实现状态：`NODE_ADAPTER_BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION / FAULT_HOOK_PARTIAL_NOT_ACCEPTED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

现有 03C 实现规格只写出 Node adapter 的高层职责，没有冻结模块导出、request、capture callback、normalized result、CLI 和稳定错误；实现者会被迫自行决定 03B/03C 的机器边界。现有一次性 fault 也只冻结了参数和行为，没有冻结独立 Java port、上下文、Spring 装配、revision INSERT 前调用点及文件 allowlist，因此不能直接实现。

Root Cause：早期设计把浏览器 capture 留给 03B、把 SQLite/fault 留给 03C，但没有把二者之间的进程内调用协议和产品 commit path 的窄注入协议机器化。之前的 checklist 只按“adapter/fault hook”整项记录，未逐字段检查可实现输入，因而没有在首轮设计冻结时发现。

## 2. Fix Strategy

1. 历史四份`0.1/0.1.0`封闭Schema保持只读；Adapter Request按后继受控输入修正规格升级为活动`0.2/0.2.0`，其余三份继续为`0.1/0.1.0`；
2. 冻结唯一模块函数、受控 contract CLI、144 次调用顺序、摘要算法、首错和零越权输出；
3. 冻结独立 `VisualCommonCommitFaultPort`、进程内一次性实现、Spring release-only 装配及 `SqliteRevisionCommitRepository` 唯一调用点；
4. 明确与 `E2EFaultPort`、`RecoverySqliteFaultPort`、03A Family、默认 Runtime 和公共 HTTP wire 的隔离；
5. 只恢复 03C 的实现资格，不把契约冻结写成 hook、adapter、base、clone、candidate 或 Gate 已实现。

本修正不影响公共 API、SQLite DDL、Revision Schema、Capture Plan、Common Fixture、Authoring Report、E2E/Recovery fault 语义或 production 配置。

## 3. 机器契约

唯一 Schema 为：

```text
docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-request.schema.json
docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-request-v02.schema.json
docs/contracts/schemas/opm-dev-canvas-06-common-visual-capture-invocation.schema.json
docs/contracts/schemas/opm-dev-canvas-06-common-visual-capture-observed-result.schema.json
docs/contracts/schemas/opm-dev-canvas-06-common-visual-adapter-normalized-result.schema.json
```

四份机器身份固定为：

| 契约 | `schema_id` | Schema/实体版本 |
| --- | --- | --- |
| Adapter Request（历史） | `OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001` | `0.1/0.1.0`，只读且拒绝production消费 |
| Adapter Request（活动） | `OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-REQUEST-001` | `0.2/0.2.0` |
| Capture Invocation | `OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-INVOCATION-001` | `0.1/0.1.0` |
| Capture Observed Result | `OPM-DEV-CANVAS-06-COMMON-VISUAL-CAPTURE-OBSERVED-RESULT-001` | `0.1/0.1.0` |
| Adapter Normalized Result | `OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-NORMALIZED-RESULT-001` | `0.1/0.1.0` |

所有对象和嵌套对象均`additionalProperties=false`。物理路径只存在于进程内request/invocation，不进入Plan、Report或approved evidence；Profile raw ref路径固定相对逻辑root `profile/assets`，Java executable ref path是唯一absolute normalized realpath。活动四契约组合不允许optional override、未知字段或`null`代替必填值。

## 4. Node Adapter 唯一 API

### 4.1 模块导出

`scripts/canvas06-common-visual-materialization.mjs` 唯一生产导出为：

```js
export async function runCommonVisualMaterialization(request, captureCallback)
```

约束：

1. `request`必须先通过活动Adapter Request `0.2`，历史`0.1`必须在零副作用边界拒绝；Request Runtime source ref固定为`LOCAL_RUNTIME_JAR`并与Handoff/Plan逐字段相等，staged/Runtime Ready `RUNTIME_JAR`只按raw identity闭合；`captureCallback`必须是恰一个函数且不可省略；
2. 03B 只能静态 ESM import 此函数并直接调用，禁止 child process/stdout、dynamic import、模块路径参数、环境变量或 callback 文件路径；
3. adapter先按受控输入修正规格验证exact Java 21 executable、Profile root/五项raw refs/tree/package/binding，再验证exact Plan raw ref、Plan `source_date_epoch`、Runtime JAR raw ref、活动Catalog `0.2.0`、8 fixture refs和`72`个Common capture；
4. `plan_path/runtime_jar_path/common_fixture_root/profile_asset_root/work_root`必须是受控real absolute non-link path并满足对应只读/fresh与containment规则；`work_root`必须fresh，禁止扫描sibling、cwd fallback、latest/mtime、PATH/父JAVA_HOME或checkout fixture/Profile fallback；
5. adapter 独占 8 base、attestation、144 attempt clone、Runtime child 和 callback 调度；callback 不得创建/选择 storage、修改 base、注入 fault 或决定 subject/fixture/Projection；
6. callback 独占生产 Web/browser、8 类 UI step、稳定等待、Projection/geometry读取和 PNG 写入；03C adapter 不接收 candidate root、不写 PNG、Environment、Authoring Report、Approval、approved root或Manifest。

### 4.2 Capture Invocation

adapter 对每个 Common capture 按 Plan 原顺序、attempt `1 -> 2` 构造一份 Capture Invocation `0.1`。固定顺序为：

```text
common_capture_ordinal=0, attempt=1
common_capture_ordinal=0, attempt=2
...
common_capture_ordinal=71, attempt=1
common_capture_ordinal=71, attempt=2
```

`captureCallback(invocation)` 每次恰调用一次，且任意时刻最多一个 callback 在执行。Invocation 中 capture/fixture/setup/Projection/focus/cell/critical region 必须分别与 Plan、Catalog 和 fixture 深度相等；attempt/storage/base attestation/tree/runtime URL 由 adapter 生成。`BLOCKED_FEEDBACK` 的 `fault_mode` 必须为 `BLOCKED_FEEDBACK_ONE_SHOT`，其余 63 个 Common capture均为 `NONE`。

### 4.3 Callback 返回

callback 必须返回一个且仅一个 Capture Observed Result `0.1`；不得返回数组、stream、undefined、class instance、Promise 外的第二通道或附加字段。adapter 在关闭 Runtime 前依次验证：

1. request/capture/subject/attempt identity 与 Invocation 完全相等；
2. `ui_setup_status=READY`、`stability_status=STABLE`；
3. normalized Projection 与 Invocation expected Projection先深度相等，再验证 RFC 8785 JCS SHA；
4. `observed_cells/focus_target_id/focus_anchor` 与 Plan相等；
5. PNG length/SHA、width/height、geometry SHA 均存在，具体 candidate 路径继续由 03B 固定布局承接；
6. `BLOCKED_FEEDBACK` 必须观察 `mode=BLOCKED_FEEDBACK_ONE_SHOT/trigger_count=1/error_code=PERSISTENCE_FAILED`，其他 subject 必须为 `NONE/0/null`。

callback throw/reject、返回非普通 JSON、缺字段、额外字段、identity 错、错误顺序、Projection/focus/cell/fault 不等均停止后续调度。adapter 仍必须关闭当前 Runtime、复核 base 未变，并禁止返回 READY normalized result。

### 4.4 Normalized Result

全部 8 base、144 callback 和关闭后验证通过后，函数只返回 Adapter Normalized Result `0.1`。`base_results`按 Catalog `visual_subjects`顺序，`attempt_results`按第 4.2 节顺序；每个 attempt 必须满足：

```text
base_tree_sha256_before == base_tree_sha256_after == 对应base_results.base_tree_sha256
runtime_shutdown_status == CLOSED
observed.capture_id/subject_id/attempt_ordinal == attempt identity
```

摘要固定为：

```text
base_set_sha256 = sha256(UTF8(JCS(base_results)))
attempt_set_sha256 = sha256(UTF8(JCS(attempt_results)))
result_payload_sha256 = sha256(UTF8(JCS(result中除result_payload_sha256外全部字段)))
```

JCS只能使用Visual Common `v1.9`的共享owner；先Schema，再semantic join，再复算三项摘要。返回`READY_FOR_CANDIDATE_TRANSACTION`只允许03B继续当前candidate transaction，不是Report/Gate READY。

### 4.5 Adapter Request `0.2`受控输入

活动Request必须携带`java_major_version=21`、`java_executable_ref={kind=JAVA_EXECUTABLE,absolute realpath,byte_length,sha256}`及`profile_asset_root/profile_asset_tree_ref/profile_asset_refs[5]`。Java raw identity、exact `-version` major 21、Profile五文件inventory/raw refs/tree/package/binding和direct-root assembler必须在创建base前闭合；Base/Clone/Web命令首token只能取Java ref path，Web `opm.assets.root`只能取Profile root。完整字段、tree公式、首错和零输出边界唯一由[`Adapter受控Java/Profile输入闭包规格`](./opm-dev-canvas-06-common-visual-adapter-controlled-java-profile-input-closure-bugfix-task-spec.md)承接，本文不维护第二套形状。

03C受控实现测试不得手写这些输入。唯一测试入口是[`Adapter受控测试输入Builder闭包规格`](./opm-dev-canvas-06-common-visual-adapter-test-input-builder-closure-bugfix-task-spec.md)定义的Bundle `0.1`：同一原子root必须包含fresh Profile五文件、fresh Common 43文件、由现有Planner生成的1242/72 Plan、Request `0.2`和144份完整Observed Result。该Bundle未实现并通过独立Verifier前，禁止用历史Plan、部分Request或动态callback补值执行`8/144`。

## 5. Node CLI

生产 authoring 不提供可序列化 callback CLI；唯一生产入口是第 4.1 节模块函数。脚本 CLI 只允许受控 contract/fixture 验证，恰好四种互斥模式：

```text
node scripts/canvas06-common-visual-materialization.mjs --validate-request <json>
node scripts/canvas06-common-visual-materialization.mjs --validate-capture-invocation <json>
node scripts/canvas06-common-visual-materialization.mjs --validate-capture-result <json>
node scripts/canvas06-common-visual-materialization.mjs --validate-normalized-result <json>
```

每次只能有一个模式和一个现存普通文件参数；重复、组合、额外参数、stdin、URL、目录、link、`--callback`、`--callback-module`、`--source-root`、`--candidate-root`均为`GOLDEN_COMMON_ADAPTER_INPUT_INVALID/2`。成功只向 stdout 写一行：

```text
COMMON_VISUAL_CONTRACT_VALID<TAB><REQUEST|INVOCATION|CAPTURE_RESULT|NORMALIZED_RESULT><TAB><raw_sha256>
```

CLI 不创建 base/clone、不开 Runtime/Web/browser、不调用 callback、不写输出文件，不构成 03C 集成或 release evidence。

## 6. 一次性 Fault Port

### 6.1 Java 契约

独立接口和上下文固定为：

```java
public record VisualCommonCommitFaultContext(
        String commandId,
        String projectId,
        String modelId,
        String baseRevisionId,
        String candidateRevisionId,
        int candidateRevisionSequence) {}

public interface VisualCommonCommitFaultPort {
    VisualCommonCommitFaultPort NOOP = context -> {};
    void beforeRevisionInsert(VisualCommonCommitFaultContext context);
}
```

唯一 active 实现为 `OneShotVisualCommonCommitFaultPort`。它与 `E2EFaultPort`、`RecoverySqliteFaultPort`没有继承、适配、delegate或共享状态关系。所有既有 constructor 默认注入 `NOOP`；禁止 static、ThreadLocal、全局 registry、setter、公共 API或跨进程状态。

### 6.2 装配守卫

三项 fault 参数全部缺失时只装配 `NOOP`。任一出现时，以下参数必须全部来自 Spring `commandLineArgs` 且逐 byte 相等：

```text
spring.profiles.active=release-golden-authoring
opm.release.golden-authoring=true
spring.main.web-application-type=servlet
opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert
opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed
opm.release.visual-common.fault-max-invocations=1
```

同时必须满足 `opm.release.visual-common-materializer` 缺失、`E2EFaultPort==NOOP`。缺项、重复、非 command-line 覆盖、non-web、E2E active或参数漂移必须在接受请求前以`GOLDEN_COMMON_MODE_REJECTED/2`失败，禁止退回NOOP继续运行。普通/default/production、03A、Family、Visual validation和其他subject启动不得携带三项fault参数。

### 6.3 唯一调用点与状态机

`LocalApiService` 只把注入的 port 传给 `SqliteRevisionCommitRepository`。repository 在既有 receipt/head recheck 后，保持以下唯一顺序：

```text
CandidateRevisionCommitter validation成功
-> OPL/Text generation成功
-> SQLite BEGIN与receipt/head recheck成功
-> E2EFaultPort.beforeRevisionInsert(existing context)
-> VisualCommonCommitFaultPort.beforeRevisionInsert(context from exact bundle)
-> writeRevision
-> existing Recovery reachpoints/remaining rows/COMMIT
```

Visual active port 只匹配以下六项：

```text
commandId=command.visual.blocked-feedback.persistence-failed
projectId=project.visual.blocked-feedback
modelId=model.visual.blocked-feedback
baseRevisionId=revision.visual.blocked-feedback
candidateRevisionId为非空且不等于baseRevisionId
candidateRevisionSequence=2
```

状态机固定为 `ARMED -> TRIGGERED`。非目标 context 返回且不消耗次数；首个 exact context 先以实例内原子 CAS 转为 `TRIGGERED`，再抛出：

```text
CommitPersistenceException(
  CommitFailureCode.PERSISTENCE_FAILED,
  "Visual Common controlled persistence failure",
  null)
```

事务必须 rollback，Revision/Head/Text/Trace/Finding/Operation/Receipt delta全部为0。后续 exact context和所有非目标 context均NOOP；第二个相同command因此正常提交。进程关闭时 active port 必须验证恰触发一次；0次、2次、context漂移或base被改写均为`GOLDEN_COMMON_UI_SETUP_FAILED/3`。

## 7. 后继实现 Allowlist

后继实现只能修改以下精确路径；现有未列文件全部只读：

```text
M package.json
A scripts/canvas06-common-visual-materialization.mjs
A scripts/canvas06-common-visual-materialization.test.mjs
A services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCommitFaultContext.java
A services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCommitFaultPort.java
A services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/OneShotVisualCommonCommitFaultPort.java
A services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCommitFaultConfiguration.java
M services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
M services/local-runtime/src/main/java/org/opm/localruntime/storage/SqliteRevisionCommitRepository.java
A services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/OneShotVisualCommonCommitFaultPortTest.java
A services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCommitFaultConfigurationTest.java
M services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
M services/local-runtime/src/test/java/org/opm/localruntime/storage/SqliteRevisionCommitRepositoryTest.java
M services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultRecoveryIsolationTest.java
M scripts/release-canvas06-golden-plan.mjs
M scripts/release-canvas06-golden-plan.test.mjs
A scripts/build-canvas06-common-visual-adapter-test-input.mjs
A scripts/verify-canvas06-common-visual-adapter-test-input.mjs
A scripts/build-canvas06-common-visual-adapter-test-input.test.mjs
```

固定为 `19=8 M+11 A`。新增5项只承接受控测试输入生成、验证及Planner外置Common root最小扩展；不得进入production Report或Gate source identity。已有 `VisualCommonFixtureMaterializer.java`、`VisualCommonMaterializerRunner.java`及其测试不在本切片allowlist；如其缺陷阻断实现，必须新开bugfix规格，不得静默扩大。本包禁止修改 OpenAPI、Controller、SQLite DDL、Migration、E2E/Recovery fault、Profile/Rule/Grammar/Symbol、Vue和生产配置。

## 8. 错误与首错

在既有 03C 首错链中增加以下精确错误：

| Code | Exit | 边界 |
| --- | ---: | --- |
| `GOLDEN_COMMON_ADAPTER_INPUT_INVALID` | `2` | request/CLI/function参数或Schema无效 |
| `GOLDEN_COMMON_CAPTURE_CALLBACK_FAILED` | `3` | callback throw/reject/非普通JSON |
| `GOLDEN_COMMON_CAPTURE_RESULT_INVALID` | `3` | callback result Schema、identity或semantic join失败 |
| `GOLDEN_COMMON_NORMALIZED_RESULT_INVALID` | `4` | adapter无法生成Schema-valid/摘要闭合result |

优先级固定为：既有CLI/path/source/ref/binding/JAR/color/base/clone错误 -> Invocation构造 -> callback throw/reject -> callback result Schema -> Projection/focus/cell/fault semantic join -> Runtime关闭/base digest -> normalized result Schema/digest -> internal。失败不得调用后续callback或返回部分result；不得生成READY Report、Environment、Approval、approved root或Manifest。

## 9. 验收与测试矩阵

1. 活动Request `0.2`、Invocation、Observed、Normalized各至少`1`个完整正例；缺/多字段、错误版本、absolute/logical path混用、错误enum和条件分支反例全部拒绝，历史Request `0.1`不得进入production；
2. Java path/type/realpath/raw SHA/major和Profile root/inventory/raw/tree/package/binding单变量漂移均在base前拒绝且零副作用；
3. 模块导出恰一个生产函数，03B静态import；CLI四模式正例及组合/额外/dynamic callback反例；受控测试只消费Schema-valid且完整Verifier通过的Bundle `0.1`；
4. `72*2=144` callback严格串行、有序、无缺失/重复/额外，首错后零后续调用；
5. callback throw/reject、wrong identity、Projection只hash相等但payload不同、focus/cell/fault漂移全部稳定失败；
6. 8 base和144 clone refs、base before/after digest、Runtime关闭及三个result摘要可独立复算；
7. fault port exact首次失败、第二次成功、非目标不消耗、并发最多一次失败；
8. guard全缺为NOOP，partial/env/system property/default/production/non-web/E2E active均拒绝；
9. validation/text/head失败均不触发，hook仅在revision INSERT前；rollback后数据库delta全0；
10. E2E、Recovery、03A、普通commit和default Spring启动回归不变；
11. packaged JAR集成验证真实 `PERSISTENCE_FAILED` UI反馈、一次触发和进程关闭验证。

## 10. 完成、回滚与事实边界

本设计包完成只表示 Node adapter与一次性fault机器/实现契约为`FROZEN_FOR_IMPLEMENTATION`。03C实现仍必须按其implementation checklist完成；03B继续`BLOCKED_BY_DEPENDENCY`。

回滚本次后继增量只删除Bundle Schema、三份测试Builder/Verifier文件和Planner外置Common扩展；既有四份adapter Schema保持只读。后继代码回滚只允许回退第7章19项delta。不得删除base、candidate、approved、用户数据或修改既有E2E/Recovery证据。

事实：历史Request `0.1`与其余三份机器Schema已冻结，活动Request `0.2`及Java/Profile受控输入契约已补齐；Adapter Test Input Bundle `0.1`及其Builder/Verifier实现边界已冻结，实现字节已出现但Runtime kind与Planner JDK env仍不符合后继修正规格。当前工作树存在局部03C Java materializer字节，以及独立fault port/context、one-shot实现、Spring配置、`LocalApiService`注入和repository调用点等未提交实现字节。Node adapter仍未完成；fault hook尚未完成第7章`19=8 M+11 A`全量差异、回归矩阵、packaged-JAR/UI集成及03C checklist验收，因此只能记为`PARTIAL_NOT_ACCEPTED`，不能记为实现完成。推测/假设：无。真实JAR SHA、Bundle、base/attempt refs、性能、candidate与Gate状态必须由未来实际执行产生。
