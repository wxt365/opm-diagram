# DEV-CANVAS-06 Recovery Execution 设计

文档版本：`1.5`

设计状态：`FROZEN`

实现状态：`NOT_IMPLEMENTED`

对应开发包：`DEV-CANVAS-06-RECOVERY-RUNNER-01`

输入闭包规格：`specs/opm-dev-canvas-06-recovery-template-input-closure-bugfix-task-spec.md`

Factory输出闭包规格：`specs/opm-dev-canvas-06-recovery-factory-output-design-closure-bugfix-task-spec.md`

Reopen/HTTP JCS闭包规格：`specs/opm-dev-canvas-06-recovery-reopen-http-jcs-design-closure-bugfix-task-spec.md`

Projection Digest闭包规格：`specs/opm-dev-canvas-06-projection-digest-closure-bugfix-task-spec.md`

Launch协议闭包规格：`specs/opm-dev-canvas-06-execution-contract-design-correction-bugfix-task-spec.md`

## 1. 文档定位

本文是 `GATE-06-05 Recovery/Rollback` 的 fixture factory、fault injection、强停 launcher、snapshot 和 artifact 采集的唯一执行级设计。DEV-CANVAS-06 release checklist继续承接28个case、READY算法和Gate边界；活动机器输入为Manifest `0.2`、Reopen Expectation Catalog `0.1`以及Gate Fixture/Report/Attempt Materialization/Tree Descriptor `0.1`。Manifest `0.1`仅保留历史读取，不再是builder/verifier目标。

本文冻结未来实现，不表示fixture、launcher、runner、artifact、Recovery Manifest/Report或真实强停执行已经存在。任何受控实现结果都不自动生成Candidate、Activation、Capability enablement或ISO 19450:2024符合性证据。

## 2. 目标与非目标

### 2.1 目标

1. 用两份版本化不可变template确定性物化每个attempt的模型和test-only gate输入；
2. 用exact release Runtime JAR的正式命令/SQLite路径触发8个PRE_COMMIT、7个SQLITE和3个SERVICE_RECOVERY case；
3. 用独立OS子进程、可复核reach proof和父进程强停完成4个FORCED_RESTART case；
4. 通过与production rollback evaluator同源的纯函数adapter完成6个ROLLBACK case，真实production gate保持不变；
5. 为56个attempt采集可由Recovery Report raw ref引用的封闭artifact tree。

### 2.2 非目标

- 不新增或暴露产品HTTP fault API、管理端开关、生产配置、环境变量旁路或可加载test-only Gate Fixture的production loader；
- 不修改SQLite V1 DDL、事务顺序、Revision/Head/Receipt语义、Profile资产或Handoff；
- 不用mock repository、内存数据库、Java exception、正常shutdown或父runner内模拟替代forced termination；
- 不在runner中修复WAL/journal/marker/Head，不删除失败前后证据；
- 不把Schema正例或现有repository单测当作`GATE-06-05`执行证据。

## 3. 组件与职责

| 组件 | 计划位置 | 唯一职责 | 禁止职责 |
| --- | --- | --- | --- |
| Manifest/Fixture Builder | `scripts/release-canvas06-recovery-manifest.mjs` | 信任链、template raw ref、28-case Manifest和Gate Fixture原子构建 | 执行case、注入fault |
| Recovery Orchestrator | `scripts/release-canvas06-recovery-run.mjs` | 固定顺序运行56 attempt、调度子进程、采集artifact、写Report | 直接写SQLite、伪造reach proof |
| Recovery Verifier | `scripts/verify-canvas06-recovery.mjs` | 只读复算Schema、raw ref、snapshot、outcome和READY | 修复artifact、重跑case |
| Fixture Factory | `tests/recovery/release/dev-canvas-06/factories/recovery-fixture-factory.mjs` | 校验template并向fresh attempt root物化输入 | 修改template、解释observed结果 |
| Runtime Test Composition | `services/local-runtime/src/test/java/org/opm/localruntime/recovery/**` | test-only fault port、reachpoint和snapshot adapter | 进入production JAR/默认Spring context |
| Recovery Test Launcher | `services/recovery-test-launcher` | child main、eager raw-body filter、parsed-body advice、reach latch和受控Spring装配 | 进入Runtime/release JAR或默认Spring context |
| Forced-stop Launcher | `tests/recovery/release/dev-canvas-06/launcher/**` | 以product JAR+test launcher classpath启动/强停child | 正常shutdown替代强停 |
| Rollback Evaluator Adapter | test-only composition | 调用production同源纯evaluator | 调用activate或修改真实gate |
| Artifact Collector | Orchestrator内部模块 | 原样捕获日志、proof、SQLite文件清单和snapshot | 事后改写业务证据 |

所有test composition class、launcher class、request guard和fault adapter必须由打包测试证明不在`LOCAL_RUNTIME_JAR`及release ZIP。产品代码允许的唯一最小改动是把既有内部逻辑抽为无副作用port/evaluator并保持默认实现；不能新增公开API。

## 4. 两份不可变 Template

### 4.1 唯一路径与身份

```text
tests/recovery/release/dev-canvas-06/templates/0.1.0/
  recovery-model-template.json
  recovery-gate-template.json
```

| Template | 固定身份 | Manifest映射 |
| --- | --- | --- |
| model | `OPM-DEV-CANVAS-06-RECOVERY-MODEL-TEMPLATE-001/0.1`、`template_version=0.1.0`、`fixture_id=RECOVERY-FIXTURE-MODEL` | `fixture_catalog[RECOVERY-FIXTURE-MODEL].source_ref` |
| gate | `OPM-DEV-CANVAS-06-RECOVERY-GATE-TEMPLATE-001/0.1`、`template_version=0.1.0`、`fixture_id=RECOVERY-FIXTURE-GATE` | `fixture_catalog[RECOVERY-FIXTURE-GATE].source_ref` |

两份authoring source固定为上述clean source root内路径。Manifest builder验证后把原始bytes不变复制到：

```text
<evidence-root>/dev-canvas-06/recovery/fixtures/templates/0.1.0/
  recovery-model-template.json
  recovery-gate-template.json
```

Manifest中的每份`source_ref`固定为上述evidence-root副本的封闭普通文件ref：

```text
{kind="RECOVERY_TEMPLATE",path,byte_length,sha256}
```

`path`相对evidence root，必须精确等于`dev-canvas-06/recovery/fixtures/templates/0.1.0/<fixed-file>`；`sha256`对原始bytes计算，且副本raw bytes必须与clean source固定path逐byte相等。Factory还必须复算：

```text
template_payload_sha256=sha256(JCS(template中除template_payload_sha256外全部字段))
fixture_digest=sha256(JCS({fixture_id,source_ref,template_payload_sha256,expected_result_digests}))
```

Manifest `fixture_catalog[].source_ref/fixture_digest/expected_result_digests` 必须与该复算结果深度相等。版本目录一经进入任一Manifest不得改bytes；变更必须新建版本目录并升`template_version`，禁止覆盖`0.1.0`、latest/current pointer或按目录扫描自动选版。

### 4.2 唯一机器输入与固定摘要

完整 JSON 不在 Markdown 复制第二份；以下两个文件是 `0.1.0` authoring bytes 的唯一事实源：

| Template | authoring source | raw bytes | raw SHA-256 | `template_payload_sha256` | evidence-copy `fixture_digest` |
| --- | --- | ---: | --- | --- | --- |
| Model | `tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-model-template.json` | `27745` | `76d906ad7ef8eb14028433458b23aebf8c9dd3db22a75d9d95f7d81a1785bc4a` | `cafdb6a845be9e6cd53b327c447aae2f3a81aa9c8a97527e9c18c341c829c234` | `bff0fb2a1c602bf4a0c0ff118bb80c47eda83e48ed9e2e98912281283d21fbbd` |
| Gate | `tests/recovery/release/dev-canvas-06/templates/0.1.0/recovery-gate-template.json` | `9116` | `69bf9389d5e19f8b8b589349e689c030a1be5456aa2332315dc5cb3aad9172b5` | `410f014d6d1b89e882c64661747d053acaa7750c3a591750446359b14459a743` | `454438e640b43dbb00c8376de9c648341b2423c21e7621e43ae432b74eea54fd` |

上表 `fixture_digest` 的 `source_ref.path` 固定使用第4.1节 evidence-copy path，不是 authoring source path。raw bytes、payload SHA、expected digest 或 evidence-copy path 任一变化都必须升 template version；不能原地重算并覆盖 `0.1.0`。

### 4.3 Model Template 与四条 Command

Model template 顶层字段固定为：

```text
schema_id, schema_version, template_id, template_version, fixture_id,
source_date_epoch, profile_binding, source_build_binding,
project_identity, model_identity,
request_digest_policy, result_digest_policy, deterministic_id_policy,
command_scenarios[4], expected_commits,
expected_result_digests, template_payload_sha256
```

`command_scenarios[]` 固定按 `STATE/PROCEDURAL/CONTROL/STRUCTURAL_FAN` 顺序；每项完整字段为：

```text
scenario_id, command_family, project_id, model_id, context_id,
base_revision_ref, base_revision_identity,
capability_derivation_input,
command_request, request_digest,
deterministic_id_sequence,
expected_result, expected_result_digests
```

四项唯一映射如下，完整 payload 以 Model template bytes 为准：

| Scenario | base Revision | command / semantic action | request digest | ID 数 |
| --- | --- | --- | --- | ---: |
| `RECOVERY-COMMAND-STATE-001` | `revision.base.golden.struct.003` | `CREATE_STATE`，在 `element.raw.material` 创建 `Recovery Ready/INITIAL` | `57320f851a1112a7a294d34818610a6ac276ef649323e8940420f65ac0ec3bbe` | `4` |
| `RECOVERY-COMMAND-PROCEDURAL-001` | `revision.base.golden.proc.001` | `CREATE_FACT`，`CAP-ISO-PROC-002` Result Object | `1e7f0d3bfac2bb1b0689892670d152edff553e67a44d647fc71d9d5012c3afc3` | `5` |
| `RECOVERY-COMMAND-CONTROL-001` | `revision.g-opl-proc-001-consumption-object-pass` | `UPDATE_FACT`，加入 `CAP-ISO-CTRL-001 + PROCESS_INPUT` 原子 pair | `b00e7b18b07f459e87a826d1f7558128f52f9ea66243fd7ea4f0a51bbeabd3ba` | `1` |
| `RECOVERY-COMMAND-STRUCTURAL-FAN-001` | `revision.g-opl-struct-005-aggregation-object-fan-3-complete-pass` | `UPDATE_FACT`，三分支 Aggregation 从 `COMPLETE` 改为 `INCOMPLETE` | `20de78334643a2f42856577872a618178df8d27ffb31754eff4568e0ec5d646f` | `5` |

不得把 Golden PASS candidate 的 `base_revision_fixture/input_revision_fixture` 关系解释为 Runtime command 增量。Recovery 只把经 raw ref 验证的 Revision 作为 scenario base；commit 后结果按本节规范化投影断言，不宣称等于另一份 Golden Revision bytes。

`KILL_AFTER_COMMIT` 固定使用 Procedural scenario，`PROJECTION_READBACK` 固定使用 Structural fan scenario。其余 fault case 由 Manifest case definition 指定四项之一；runner 不得按 observed 结果替换 command。

### 4.4 Capability Query、Option 与 Request Digest

Capability query 与 option 的 preimage 固定为：

```text
canonical_endpoint_ids = endpoint_ids 按 UTF-8 字节升序排序
capability_query_id =
  "capability.query." +
  hex(sha256(UTF8(project_id + ":" + model_id + ":" + base_revision_id + ":" +
                   (selection_id ?? "") + ":" + intent + ":" +
                   join(canonical_endpoint_ids, ":"))))[0:32]

state_option      = "option.state."      + hex(sha256(UTF8(capability_query_id)))[0:24]
procedural_option = "option.fact."       + hex(sha256(UTF8(capability_query_id + ":" + capability_id)))[0:24]
control_option    = "option.control."    + hex(sha256(UTF8(capability_query_id + ":" + capability_id)))[0:24]
structural_option = "option.structural." + hex(sha256(UTF8(capability_query_id + ":" + capability_id)))[0:24]
```

Request digest 唯一定义为：

```text
request_bytes  = UTF8(RFC8785-JCS(command_request))
request_digest = lowercase-hex(sha256(request_bytes))
```

Author/runner 必须把 `request_bytes` 原样写入attempt内`observations/api-request-body.json`，fsync后由HTTP client以该文件原始bytes发送；禁止`JSON.stringify`、ObjectMapper或其他客户端重新序列化。Runtime child按第4.4.1节完成raw与parsed两阶段证明；任一阶段不等属于`RECOVERY_FIXTURE_MISMATCH`，command零执行。禁止接受“语义相同但属性顺序不同”的第二个request digest。

#### 4.4.1 HTTP ingress唯一实现边界

HTTP ingress只允许由`services/recovery-test-launcher`中的`RecoveryCanonicalRequestFilter`和`RecoveryCanonicalRequestBodyAdvice`共同实现，不存在client-only、Controller参数扩展、产品filter、请求头自报SHA或事后日志推断的第二方案。

`RecoveryCanonicalRequestFilter`通过`FilterRegistrationBean`以`Ordered.HIGHEST_PRECEDENCE + 20`装配，只匹配exact command `POST /api/v1/projects/{projectId}/models/{modelId}/contexts/{contextId}/commands`且`Content-Type`必须精确为`application/json`。Filter必须在`DispatcherServlet`前完成：

1. 从已验证`launch-request.json`的child context取得`case_id/attempt_ordinal/command_scenario_id/expected_request_digest/request_body_ref`；HTTP header、query、环境变量和body内字段均不能覆盖；
2. 从Servlet input stream一次读取原始bytes，长度必须为`1..65536`，禁止BOM并使用REPORT模式严格UTF-8 decoder；
3. 使用exact Runtime JAR的Jackson parser并启用`StreamReadFeature.STRICT_DUPLICATE_DETECTION`，只允许一个完整JSON object且EOF后无第二token；
4. 使用exact Runtime JAR的`Rfc8785JsonCanonicalizer`对解析树生成`canonical_bytes`；
5. 同时证明`raw_bytes == canonical_bytes`、`sha256(raw_bytes) == sha256(canonical_bytes) == expected_request_digest`以及`request_body_ref`的path/length/raw SHA闭合；
6. 原子写`observations/api-request-ingress.json`并fsync，随后用只读raw byte副本构造一次性replayable request wrapper；wrapper的content length和input stream必须等于原始bytes，禁止再次编码。

Filter通过后把不可变`IngressProof`放入request attribute `org.opm.recovery.canonicalRequestProof.v1`。`RecoveryCanonicalRequestBodyAdvice.afterBodyRead`在Spring JSON converter完成、Controller方法调用前取得解析后的`Map<String,Object>`，用同一Java JCS owner计算`parsed_bytes/parsed_sha256`，必须再次满足`parsed_bytes == raw_bytes`和`parsed_sha256 == expected_request_digest`，再原子写`observations/api-request-parsed.json`。attribute缺失、类型错误、重复Advice调用或proof identity不等都必须拒绝。

Filter阶段失败不得调用filter chain；Advice阶段发生在filter chain已进入之后，但必须由受控resolver在Controller方法调用前终止。两类失败都不得调用Controller、Service或repository，固定返回test-only `HTTP 422 application/json`与JCS body `{"code":"RECOVERY_CANONICAL_REQUEST_REJECTED"}`，Report failure映射为`RECOVERY_FIXTURE_MISMATCH`，并证明`controller_invocation_count/service_invocation_count/repository_commit_call_count=0`。若guard缺失、重复装配、CodeSource不属于exact launcher JAR或普通main/default context出现该bean，child启动即以`RECOVERY_BUILD_MISMATCH/2`失败，零attempt、零Report。

`services/recovery-test-launcher`坐标固定为`org.opm:recovery-test-launcher:0.1.0-SNAPSHOT`，main固定为`org.opm.localruntime.recovery.RecoveryChildLauncherMain`，以`provided`依赖exact Runtime产品类；JAR除Manifest外只允许`org/opm/localruntime/recovery/**`。它与`recovery-test-tools.jar`职责隔离，二者不得互相打包；普通Runtime JAR和release ZIP不得包含launcher/filter/advice/class name或Maven坐标。

### 4.5 结果投影与固定 Digest 键

Model scenario 的 `expected_result` 固定只包含七个规范化投影，`expected_result_digests` 必须恰有以下七键且不得扩展：

```text
semantic_projection_sha256 = sha256(UTF8(JCS(expected_result.semantic_projection)))
projection_sha256          = sha256(UTF8(JCS(expected_result.projection)))
opl_sha256                 = sha256(UTF8(JCS(expected_result.opl)))
trace_sha256               = sha256(UTF8(JCS(expected_result.trace)))
finding_sha256             = sha256(UTF8(JCS(expected_result.finding)))
transaction_sha256         = sha256(UTF8(JCS(expected_result.transaction)))
normalized_outcome_sha256  = sha256(UTF8(JCS(expected_result.normalized_outcome)))
```

本节`expected_result.projection`固定是`{construct_kind,context_id,symbol_id,target_id,visible}`场景比较视图，不是`API-CTX-002`正式Projection data；其字段继续使用既有安全整数JCS公式，两份template `0.1.0` bytes和七键digest不修改。下文snapshot `projection_digest`才绑定Projection Digest Closure `0.1`。实现、Report和日志必须称前者为scenario projection digest，禁止两者互换。

这些投影是完整 Revision/Projection/OPL/Trace/Finding/SQLite snapshot 的受控比较视图，不替代其各自 Schema 和 raw ref 验证。Verifier 必须先从 observed artifact 独立构造完全同形投影，再比较对应digest；禁止只相信 Report 自报 digest。Model 顶层同名七键按 scenario 顺序对 `{scenario_id,sha256}` 数组再做 JCS/SHA 聚合，具体值已固化在 template。

### 4.6 Deterministic ID Port

产品内部只允许引入无 HTTP/配置暴露的 `RuntimeIdProvider.nextId(prefix)` 注入点，默认实现固定为 `UuidRuntimeIdProvider`，普通 main/default Spring context 行为不变。Recovery test composition 注入 `RecoveryDeterministicIdProvider`，按 scenario 的 `deterministic_id_sequence.ordinal` 严格消费并同时校验 `prefix`；越界、少消费、多消费或前缀不等均阻断为 `RECOVERY_FIXTURE_MISMATCH`。

`RecoveryDeterministicIdProvider`、其序列表 loader 和 test composition class 不得进入 Runtime/release JAR；`RuntimeIdProvider` 接口和 UUID 默认实现允许存在于产品 JAR。Revision、Endpoint、Occurrence、Layout 等运行时生成 ID 都必须通过该 provider；payload 已显式给出的 Fact ID 不再分配。操作记录 ID 继续由 `command_id` 哈希派生，不进入序列。时间、PID、端口和 artifact path 不进入 normalized outcome digest。

### 4.7 Gate Template

Gate template 顶层字段固定为：

```text
schema_id, schema_version, template_id, template_version, fixture_id,
source_date_epoch, handoff_identity, intake_identity,
production_gate_guard,
capability_order[34], eligible_capability_ids[34],
reverse_control_dependencies,
simulated_effective_state, rollback_algorithm, rollback_targets,
expected_results, result_digest_policy,
expected_result_digests, template_payload_sha256
```

`capability_order/eligible_capability_ids` 必须与 exact Handoff/READY Intake 的 `16 Procedural + 8 Control + 10 Structural` 顺序逐项相等。`reverse_control_dependencies` 必须包含全部16个 Procedural key，包括空数组；Control 合法依赖从 Handoff coverage key 的 PASS 基础 Capability 唯一派生。

Rollback target 固定为字典序首个 Structural=`CAP-ISO-STRUCT-001`、首个 Control=`CAP-ISO-CTRL-001`、首个具有反向依赖的 Procedural=`CAP-ISO-PROC-001`；后者有效关闭集合恰为 `PROC-001 + CTRL-001 + CTRL-005`。四个 expected result 的 remaining set digest、状态和计数均已固化在 Gate template；unknown/tampered 必须整体拒绝、零输出 manifest、前序 effective state 不变。

Gate 的 `expected_result_digests` 恰有：

```text
capability_order_sha256, eligible_capability_ids_sha256,
reverse_control_dependencies_sha256,
rollback_structural_sha256, rollback_control_sha256,
rollback_procedural_cascade_sha256, rollback_all_sha256
```

每个 preimage 已在 template `result_digest_policy.preimages` 唯一声明。`simulated_effective_state=ACTIVE_COMPLETE` 仅是 test template 输入；Manifest/Fixture Builder是Recovery Gate Fixture唯一生成者，Factory只允许校验并复制其attempt-local work copy。Gate Fixture必须`test_only=true`、`production_loader_expected_status=REJECTED`，真实production gate在56个attempt前中后均为`DISABLED + []`。

### 4.8 Reopen Expectation Catalog与Manifest `0.2`

唯一authoring source固定为：

```text
tests/recovery/release/dev-canvas-06/catalogs/0.1.0/
  recovery-reopen-expectation-catalog.json
```

Catalog identity固定为`OPM-DEV-CANVAS-06-RECOVERY-REOPEN-EXPECTATION-CATALOG-001/0.1`、`catalog_version=0.1.0`，原始bytes=`9308`、raw SHA-256=`9c5d95c454aa680b12a8d3b3bfb958c4f4ec8b8f971bc21e7bb464f6ef32622e`、`catalog_payload_sha256=f2b975996871ecb2a4f404984b9739ccecd68ecf27fc1a919b99e694f63ed26c`。唯一Schema为`docs/contracts/schemas/opm-dev-canvas-06-recovery-reopen-expectation-catalog.schema.json` `0.1`。

Builder逐byte复制到`<evidence-root>/dev-canvas-06/recovery/fixtures/catalogs/0.1.0/recovery-reopen-expectation-catalog.json`，Manifest `0.2`用kind=`RECOVERY_REOPEN_EXPECTATION_CATALOG`的普通fileRef和payload SHA引用；禁止读取cwd替代、按目录选版、格式化或覆盖。活动Manifest Schema固定为`docs/contracts/schemas/opm-dev-canvas-06-recovery-manifest-v02.schema.json`，identity=`OPM-DEV-CANVAS-06-RECOVERY-MANIFEST-001/0.2`、`manifest_version=0.2.0`。历史Manifest `0.1` raw bytes不改，仅允许历史reader识别，builder、runner和`--require-ready` verifier必须拒绝其作为活动输入。

Catalog恰有三个profile：

| Profile | JCS SHA-256 | 规则 |
| --- | --- | --- |
| `REOPEN-EQUALS-BEFORE` | `b13e8bd4e1f882f33a868485ae67a5ad4f0b91c1dca69ba80e628a4bb146ab96` | 13个计数/Head/digest字段逐项等于before；quick/FK固定；marker/temp为空 |
| `REOPEN-EQUALS-AFTER` | `23e6348c4d5a4ba897bb8fc078d590b9112a502e1370a536e092a83fa3173060` | 13个计数/Head/digest字段逐项等于after；quick/FK固定；marker/temp为空 |
| `REOPEN-RECOVERY-REQUIRED` | `0c0b9c542d4804cdae9cf3aa3f62fe5f2001197e3fa3aa10899036349179e07c` | 除marker外逐项等于before；marker为唯一受控Recovery marker；temp为空 |

28项映射以Catalog raw bytes为唯一机器owner：018/021只能映射`REOPEN-EQUALS-AFTER`，022只能映射`REOPEN-RECOVERY-REQUIRED`，其余25项只能映射`REOPEN-EQUALS-BEFORE`。每个Manifest case必须包含Catalog profile原对象`expected_reopen`及`expected_reopen_sha256=sha256(UTF8(JCS(expected_reopen)))`；Manifest case顺序、case ID、profile和digest必须与Catalog逐项深度相等。Schema通过不替代该semantic join。

## 5. Factory模块接口与输入闭包

Factory只导出以下三个async函数，参数名、必填性和返回形状不得扩展：

```text
loadRecoveryTemplate({
  evidenceRoot, manifestRef, templateSourceRef, expectedFixtureId
}) -> FrozenRecoveryTemplate

materializeRecoveryAttempt({
  evidenceRoot, modelTemplate, gateTemplate,
  gateFixtureRef, factoryHelperJarRef,
  caseDefinition, attemptOrdinal,
  attemptRoot, sourceDateEpoch
}) -> FrozenAttemptMaterialization

verifyAttemptMaterialization({
  evidenceRoot, materializationRef, attemptRoot
}) -> void
```

`gateFixtureRef`字段始终必传：ROLLBACK时必须为普通`fileRef`对象，其他category必须为`null`。`attemptRoot`必须精确等于`<evidenceRoot>/dev-canvas-06/recovery/attempts/<case-id>/<attempt-ordinal>`；函数不得接受root override、source checkout、URL、stdin、任意parsed template或已存在final root。

### 5.1 受控 Source Mirror

Manifest/Fixture Builder在原子提交Manifest/Gate Fixture前，必须从同一clean source checkout/build把以下上游或构建原始bytes复制到evidence root内与其ref完全相同的相对path；复制后逐byte复核，Manifest在这些输入全部通过后生成并最后提交，禁止Factory回退读取cwd或clean source：

1. Handoff、READY Intake与exact Runtime JAR；
2. 第5.6节同一source commit构建的`recovery-test-tools.jar`；
3. 第4.1节两份versioned template副本；
4. Model template四个`base_revision_ref`指向的MS-REV-001/0.2文件；
5. `packages/profiles/<active-profile-id>/<active-version>/profile.json`；
6. `profile.json.manifest.entries[]`中恰好四个required role：`RULE_SET/SYMBOL_ASSET/GRAMMAR_ASSET/NORMALIZATION_DATA`。

Profile五文件source ref的`kind`依次固定为`PROFILE_PACKAGE/RULE_SET/SYMBOL_ASSET/GRAMMAR_ASSET/NORMALIZATION_DATA`；path保持source checkout相对路径，raw byte length/SHA由`profile.json` manifest与Handoff active binding共同闭合。存在额外required role、缺项、重复role、package digest不等或任一ref越出evidence root时，Manifest构建零输出；Factory不得自行选择替代文件。

既有Manifest `0.1`不新增helper字段。Builder CLI必须接收`--factory-helper-jar <clean-checkout绝对产物>`，验证第5.6节JAR身份后复制到固定evidence path；Orchestrator在每次materialization前只从该固定path执行lstat/raw hash并构造完整`factoryHelperJarRef`，再传给`materializeRecoveryAttempt`。不存在第二个helper ref来源，禁止从Manifest扩展字段、cwd、Maven target或环境变量推断。

### 5.2 `loadRecoveryTemplate`与`FrozenRecoveryTemplate`

校验顺序固定为：root/path -> Manifest raw ref/Schema -> Handoff/Intake raw ref与READY状态 -> source build/Runtime JAR -> template raw ref/identity/payload -> template binding -> 四个base Revision -> Profile五文件/package digest。任何一步失败不得返回部分对象。

`FrozenRecoveryTemplate`恰有以下字段，所有object/array递归冻结：

```text
fixture_id
template_source_ref
template_payload_sha256
fixture_digest
manifest_ref
handoff_ref
intake_report_ref
source_build
runtime_jar_ref
active_binding
model_base_inputs[4]
profile_source_refs
template
```

`model_base_inputs[]`严格按Model template scenario顺序，每项恰有`scenario_id/source_ref/base_revision_identity`；`profile_source_refs`恰有`profile_ref/rule_set_ref/symbol_catalog_ref/text_grammar_ref/normalization_adapter_ref`。Model template的`source_build_binding`以及Gate template的`handoff_identity/intake_identity`必须与Manifest、raw Handoff和READY Intake深度相等；仅验证template固定SHA而不比较当前Manifest信任链不构成通过。

Binding唯一owner为READY Intake引用的exact Handoff active binding。Manifest、Model template、四份base Revision、五份Profile资产、exact Runtime JAR中`RuntimeActiveBindingProvider.current()`和helper使用`FileProfilePackageLoader(fixture/assets/packages/profiles)`得到的binding都只是该owner的受控副本或断言，必须逐`id/version/sha256/binding_digest`相等。任何一方不一致均为`RECOVERY_FIXTURE_MISMATCH/2`，禁止以Runtime常量、template或Profile文件反向改写Handoff，也禁止使用`LocalApiService`默认cwd资产根。

### 5.3 Case到Base Scenario唯一映射

Manifest `0.1`不新增字段；Builder和Factory必须按以下表由case ID确定`base_scenario_id`，禁止按observed结果、category默认值或数组位置推断：

| Base Scenario | Case |
| --- | --- |
| `RECOVERY-COMMAND-STATE-001` | `005,009,013,017,020,022,026` |
| `RECOVERY-COMMAND-PROCEDURAL-001` | `001,002,003,004,008,010,014,018,025,027` |
| `RECOVERY-COMMAND-CONTROL-001` | `007,011,015,019,024,028` |
| `RECOVERY-COMMAND-STRUCTURAL-FAN-001` | `006,012,016,021,023` |

`018`继续固定Procedural，`021`继续固定Structural fan。`023/024/025`分别使用与回退目标同family的历史Revision，`026`使用State证明全量回退不破坏历史State，`027/028`分别使用Procedural/Control证明拒绝路径零写入。28项必须恰好出现一次；变更映射必须升Recovery Execution设计版本，不能只改runner。

### 5.4 `materializeRecoveryAttempt`输出

所有attempt均使用上述映射物化一个Model base；ROLLBACK额外把Builder生成并通过Gate Fixture Schema的原始bytes复制为work copy。Factory不得从Gate template自行author Gate Fixture，也不得调用production loader写gate。

返回值必须是`fixture/materialization.json`按[Attempt Materialization Schema](../contracts/schemas/opm-dev-canvas-06-recovery-attempt-materialization.schema.json)解析后的完整对象，没有其他字段、非序列化属性或“至少包含”扩展。唯一摘要为：

```text
case_definition_sha256 = sha256(UTF8(JCS(caseDefinition)))
materialization_key = sha256(UTF8(JCS({
  manifest_sha256, model_template_sha256, gate_template_sha256,
  base_revision_sha256, runtime_jar_sha256, factory_helper_jar_sha256,
  case_id, base_scenario_id, attempt_ordinal, source_date_epoch
})))
materialization_id =
  "dev-canvas-06.recovery-materialization." + case_id + "." +
  attempt_ordinal + "." + materialization_key[0:12]
materialization_payload_sha256 =
  sha256(UTF8(JCS(materialization中除materialization_payload_sha256外全部字段)))
```

`FrozenAttemptMaterialization`与Schema对象完全同形并递归冻结；它只证明fault前输入已物化，不是Recovery Report、attempt结果或release结论。

`source_date_epoch`必须同时等于Model template和Gate template中的冻结值，并满足`Instant.ofEpochSecond(source_date_epoch) == Instant.parse(Manifest.generated_at)`；任一不等为`RECOVERY_FIXTURE_MISMATCH/2`。Manifest `0.1`没有同名字段，禁止虚构该字段或只比较格式化日期字符串。

### 5.5 Profile资产Attempt副本

Profile source五文件保持只读，逐byte复制到：

```text
fixture/assets/packages/profiles/<profile-id>/<version>/
  profile.json
  <四个manifest logical_path>
```

`profile_assets.asset_root`以attempt root为基准固定为`fixture/assets/packages/profiles`。副本ref相对evidence root，kind与source相同，path必须位于`<attempt-root>/fixture/assets/packages/profiles`，byte length/SHA必须与source ref逐项相等。`profile_assets.package_digest`按现有Profile manifest算法计算：entry按`logical_path` UTF-8升序，对每项拼接`logical_path + "\n" + byte_length + "\n" + sha256 + "\n"`后做SHA-256；结果必须等于active binding的Profile SHA。

### 5.6 MS-REV到SQLite V1唯一映射

Node Factory必须通过exact Runtime JAR产品类与test-only Recovery factory helper调用`ProjectDatabaseFactory/Flyway`；禁止Node直接实现DDL、调用公共HTTP API、复用Golden Materializer project ID或把helper打入产品/release JAR。

helper唯一源码模块固定为`services/recovery-test-tools`，Maven坐标固定为`org.opm:recovery-test-tools:0.1.0-SNAPSHOT`，入口固定为`org.opm.localruntime.recovery.RecoveryFactoryMaterializerMain`。它以`provided`方式编译依赖`org.opm:local-runtime:0.1.0-SNAPSHOT`，只允许产出helper自身class与`META-INF/MANIFEST.MF`，不得打包产品class、第三方依赖或Spring Boot loader。clean checkout中的唯一构建命令固定为：

```text
./mvnw -B -ntp -pl services/recovery-test-tools -am -DskipTests -Dproject.build.outputTimestamp=<source_date_epoch> -Dopm.recovery.sourceCommit=<manifest.source_build.source_commit> package
```

命令必须按上述argv在JDK 21执行；`source_date_epoch`采用第5.4节唯一值，`opm.recovery.sourceCommit`必须是当前clean checkout `HEAD`且与Manifest `source_build.source_commit`相等。源码产物固定为`services/recovery-test-tools/target/recovery-test-tools-0.1.0-SNAPSHOT.jar`，Builder逐byte复制到evidence root固定路径`dev-canvas-06/recovery/build/recovery-test-tools.jar`，ref kind固定为`RECOVERY_TEST_TOOLS_JAR`。JAR Manifest必须精确包含`Implementation-Title=OPM Recovery Test Tools`、`Implementation-Version=0.1.0-SNAPSHOT`、`OPM-Recovery-Contract-Version=0.1.0`和`OPM-Source-Commit=<40hex>`；缺项、重复项、值不等、raw ref不闭合均在任何staging写入前返回`RECOVERY_BUILD_MISMATCH/2`。`-am`生成的local-runtime产物仅用于helper编译，执行时仍只允许使用Manifest/Handoff绑定的exact Runtime JAR。

打包隔离检查必须证明：helper JAR除Manifest外只含`org/opm/localruntime/recovery/**`；exact Runtime JAR不含该package、helper JAR或helper Maven坐标；production release ZIP不含helper JAR、helper class或launcher test JAR。helper raw SHA只进入`factory_helper_jar_ref`和`materialization_key`，不改变跨Gate共用的产品`source_build`身份。

唯一调用命令为：

```text
<java21>/bin/java
  -Dloader.path=<absolute-recovery-test-tools.jar>
  -Dloader.main=org.opm.localruntime.recovery.RecoveryFactoryMaterializerMain
  -cp <absolute-exact-runtime-jar>
  org.springframework.boot.loader.launch.PropertiesLauncher
  --evidence-root <absolute-evidence-root>
  --attempt-staging-root <absolute-staging-root>
  --manifest <manifest-relative-path>
  --model-template <model-template-relative-path>
  --gate-template <gate-template-relative-path>
  --factory-helper-jar <absolute-recovery-test-tools.jar>
  --case-id <case-id>
  --case-definition-sha256 <sha256>
  --base-scenario-id <scenario-id>
  --attempt-ordinal <1|2>
  --source-date-epoch <integer>
  [--gate-fixture <gate-fixture-relative-path>]  # 仅ROLLBACK，其他category禁止
```

CLI不接受其他参数、环境变量覆盖、Spring profile、asset/storage override或output override。helper只允许写`attempt-staging-root/fixture/**`，直接生成两个descriptor和Attempt Materialization Schema-valid `materialization.json`；stdout/stderr仅为诊断文本，不作为机器证据。helper读取已验证的MS-REV-001/0.2 raw bytes，并以一个SQLite transaction按以下顺序写入：

| 顺序 | 表 | 唯一字段来源 |
| ---: | --- | --- |
| 1 | `project_metadata` | `project_id=scenario.project_id`；`name=project_id`；`normalized_name=ASCII lower(project_id)`；`description="DEV-CANVAS-06 Recovery attempt base."`；`status=ACTIVE`；`default_profile_id/default_profile_version=active_binding.profile.id/version`；`created_at/updated_at=fixed_time` |
| 2 | `profile_package` | `profile_id/package_version/package_digest=active_binding.profile.id/version/sha256`；`lifecycle_status=DRAFT`；`package_json`为attempt副本`profile.json`严格UTF-8原文；`installed_at=fixed_time` |
| 3 | `rule_set_package` | `rule_set_id/rule_set_version/rule_set_digest=active_binding.rule_set.id/version/sha256`；`lifecycle_status=DRAFT`；`package_json`为Rule副本严格UTF-8原文；`installed_at=fixed_time` |
| 4 | `grammar_package` | `grammar_id/grammar_version/grammar_digest=active_binding.text_grammar.id/version/sha256`；`text_modality=OPL`；`manifest_json`为Grammar副本严格UTF-8原文；`installed_at=fixed_time` |
| 5 | `model_catalog` | `model_id=base.model_id`；`project_id=scenario.project_id`；`name=base.model_id`；`normalized_name=ASCII lower(base.model_id)`；`description="DEV-CANVAS-06 Recovery base model."`；`status=ACTIVE`；`profile_binding_json=UTF8(JCS(base.profile_binding))`；`created_at/updated_at=fixed_time` |
| 6 | `revision_document` | `revision_id/model_id/revision_sequence/schema_version`取base原值；Profile/Rule四列取active binding；`schema_set_json=UTF8(JCS(base.schema_set_ref))`；`profile_binding_json=UTF8(JCS(base.profile_binding))`；`document_json`为base ref严格UTF-8原文；`document_digest=base_revision_ref.sha256`；`commit_reason=RECOVERY_FACTORY_BASE`；`immutable=1`；`created_at=fixed_time` |
| 7 | `model_head` | `model_id=base.model_id`；`draft_head_revision_id=base.revision_id`；`head_sequence=base.revision_sequence`；`updated_at=fixed_time` |

`fixed_time=Instant.ofEpochSecond(source_date_epoch).toString()`，所有JSON列均保存无BOM的严格UTF-8文本；只有完整文档和三份package资产使用原文，JSON子树必须调用exact Runtime JAR中的`org.opm.localruntime.releaseauthoring.Rfc8785JsonCanonicalizer.canonicalize`，禁止helper复制算法、使用Jackson默认序列化、平台换行或locale排序。

`revision_parent`固定为0行，包括base Revision声明非null `parent_revision_id`的sequence 2场景；这是`SINGLE_REVISION_SNAPSHOT`，其父Revision不在attempt中，不允许写悬空FK或补造父Revision。`named_snapshot/baseline/operation_record/idempotency_record/background_task/asset_manifest/element_index/fact_endpoint_index/occurrence_index/finding_index/text_trace_index`均固定0行。`schema_metadata`必须恰有migration写入的`storage_schema_version/1.0/1970-01-01T00:00:00Z`一行；`flyway_schema_history`必须恰有`installed_rank=1/version=1/description=initial schema/type=SQL/script=V1__initial_schema.sql/success=1`一行。Symbol和Normalization没有V1独立表，只通过Profile package与attempt asset root参与binding；禁止新增表。

允许的SQLite普通表集合必须精确等于V1的20张domain表加`flyway_schema_history`，禁止额外普通表。计数固定为：`schema_metadata`、`flyway_schema_history`和上述七张seed表各1行，其余12张domain表各0行。transaction任一写入失败必须rollback；关闭连接后必须`quick_check=ok`、foreign key check 0、21张表计数与上述关键行逐字段匹配、DB/WAL/SHM/journal sidecar均不存在。`storage.storage_root`以attempt root为基准固定为`fixture/storage`；`project.db`固定为`fixture/storage/projects/<scenario.project_id>/project.db`，ref kind=`RECOVERY_PROJECT_DB`。

### 5.7 `base_snapshot`唯一算法

`base_snapshot`字段必须逐字段复用Recovery Report `0.1` Schema的`$defs.snapshot`，不允许子集、别名或额外字段。值按当前Head计算：

```text
revision_document_count = count(revision_document)
revision_parent_count   = count(revision_parent)
text_artifact_count     = count(head及历史document_json中text_artifact为object的Revision)
text_trace_count        = count(text_trace_index)
finding_count           = count(finding_index)
operation_count         = count(operation_record)
receipt_count           = count(idempotency_record)
draft_head_revision_id/head_sequence = model_head
revision_digest         = Head revision_document.document_digest
projection_data         = LocalApiService.projection(...).data
projection_digest       = sha256ProjectionV01(projection_data)
opl_digest              = sha256(JCS(Head document_json.text_artifact ?? null))
trace_digest            = sha256(JCS(Head document_json.text_traces ?? []))
sqlite_quick_check      = "ok"
foreign_key_check_count = 0
recovery_marker_refs    = []
temporary_artifact_refs = []
```

`sha256ProjectionV01`必须逐项执行[Projection Digest Closure设计](opm-dev-canvas-06-projection-digest-closure-design.md)`v1.0/0.1`：验证封闭`API-CTX-002/0.2.0-draft` data，只把layout四个有限binary64编码为`{"$binary64":"<16hex>"}`，再调用既有Java safe-integer JCS owner。禁止直接对含`double`的data调用JCS、默认decimal string、取整、容差或数组排序。

Factory只读调用正式Projection逻辑，不写Revision或索引；base marker/temp非空即物化失败。第9章before/after/reopen继续使用同一snapshot reader和同一Projection Digest `0.1` preimage。摘要失败固定映射`RECOVERY_FIXTURE_MISMATCH`；不得写空digest、placeholder snapshot或继续调度该case。

### 5.8 Tree Descriptor与Report ref映射

两个descriptor必须通过[Recovery Tree Descriptor Schema](../contracts/schemas/opm-dev-canvas-06-recovery-tree-descriptor.schema.json)：

```text
fixture/descriptors/asset-tree.json
fixture/descriptors/input-tree.json
```

Descriptor的`root_path`和`entries[].path`均以attempt root为基准解释，不是evidence root ref。`asset-tree.root_path=fixture/assets`且必须恰有5项，只列五个Profile文件；`input-tree.root_path=fixture`且非ROLLBACK必须恰有10项、ROLLBACK恰有11项，依次列model template、gate template、base Revision、五个Profile文件、`asset-tree.json`、project.db，以及ROLLBACK的gate work copy。明确排除`input-tree.json`自身和稍后写入的`materialization.json`。每个entry的path相对descriptor root，必须是non-symlink、link count为1的普通文件；`PROJECT_DB` media type只能为`application/vnd.sqlite3`，其他entry只能为`application/json`。

`entries[]`按path原始UTF-8 byte升序且path唯一；大小写折叠后冲突、绝对path、反斜杠、空segment、`.`、`..`均拒绝。算法固定为：

```text
tree_sha256 = sha256(UTF8(JCS(entries)))
descriptor_payload_sha256 =
  sha256(UTF8(JCS(descriptor中除descriptor_payload_sha256外全部字段)))
```

Recovery Report `0.1`不修改，普通`fileRef`映射固定为：

| Report字段 | kind | 唯一目标 |
| --- | --- | --- |
| `isolated_root_ref` | `RECOVERY_ARTIFACT_INDEX` | runner完成后写入的`artifact-index.json`，不是目录或Factory input descriptor |
| `asset_copy_ref` | `RECOVERY_ASSET_TREE_DESCRIPTOR` | `fixture/descriptors/asset-tree.json` |
| `project_db_ref` | `RECOVERY_PROJECT_DB` | `fixture/storage/projects/<project-id>/project.db` |

### 5.9 Atomic Materialization事务

1. evidence root、attempt parent和全部祖先必须是runner排他拥有的non-symlink目录；final attempt root必须不存在；
2. staging固定为同parent的`.recovery-materialize.<case-sha12>.<ordinal>.<128-bit-nonce>`，nonce只用于避免碰撞，不进入任何digest；
3. Node Factory是staging与final root唯一owner：依次复制/校验template和base、复制/校验Profile、复制Gate work copy；Java helper是SQLite与三个机器JSON唯一writer：依次创建SQLite、写`asset-tree.json`、写`input-tree.json`、最后写`materialization.json`；双方不得写入对方负责的path，Orchestrator不得直接写`fixture/**`；
4. 每个JSON通过同目录temp file写入，flush+file fsync后no-replace rename；SQLite transaction提交、checkpoint/关闭且sidecar消失后再进入descriptor阶段；
5. 所有普通文件fsync；POSIX必须fsync各已修改目录和staging parent，Windows必须使用同卷`FlushFileBuffers + MOVEFILE_WRITE_THROUGH`等价adapter；无法证明durability即`RECOVERY_UNEXPECTED_RUNTIME_ERROR/4`；
6. rename前调用与第5.10节同一私有semantic evaluator验证staging；其中所有final ref通过固定`staging -> final`逻辑映射读取，禁止改写materialization bytes。通过后以同文件系统single no-replace atomic rename提交final attempt root，再fsync final parent；Orchestrator随后调用公开`verifyAttemptMaterialization`验证final root；
7. rename前任一失败只删除本次staging，final root零输出；清理失败保留以`.recovery-materialize.*`命名的诊断residual并返回exit 4，后续调用见到任一residual必须拒绝，不得删除或复用。rename后parent fsync失败必须由OS adapter把本次final原子移为同parent residual；若无法移动，保留final但返回exit 4，且Orchestrator不得消费或生成Report，人工清理前同case/attempt禁止重试；
8. final root已存在、staging/residual存在、跨文件系统、symlink、rename不支持或并发调用全部拒绝，禁止覆盖、合并、repair或fallback copy。

### 5.10 `verifyAttemptMaterialization`首错与只读边界

Verifier只接受`materializationRef`指向final root内`fixture/materialization.json`的普通fileRef。首错顺序固定为：

```text
CLI/evidenceRoot/attemptRoot
-> root ancestry/final path/residual/symlink
-> materialization raw ref/JSON Schema/payload SHA
-> case/category/scenario/attempt/materialization ID
-> Manifest/Handoff/Intake/source build/Runtime JAR
-> factory helper JAR fixed path/raw ref/Manifest/source commit/package isolation
-> template/base Revision/Profile source refs与binding
-> Runtime active binding/FileProfilePackageLoader binding与Handoff owner逐字段相等
-> copied Profile refs/package digest
-> asset descriptor Schema/order/raw/tree/payload
-> input descriptor Schema/order/raw/tree/payload
-> project.db ref/sidecar/SQLite 21-table exact set/quick/FK/table counts/key rows
-> Project/Model/Revision/Head逐字段映射
-> base_snapshot逐字段复算
-> Gate work copy条件/ref/Schema/raw相等
-> verify前后attempt root全文件tree digest相等
```

Schema/path/ref错误映射`RECOVERY_INPUT_INVALID/2`；source build/JAR错误映射`RECOVERY_BUILD_MISMATCH/2`；template/base/Profile/binding/SQLite映射/Gate副本错误映射`RECOVERY_FIXTURE_MISMATCH/2`；验证期间tree变化映射`RECOVERY_READONLY_MISMATCH/2`；无法分类的I/O、fsync、digest或serializer错误映射`RECOVERY_UNEXPECTED_RUNTIME_ERROR/4`。同一输入必须返回同一首错；不得输出私有Report failure code、修改artifact或尝试修复。Orchestrator在配置任何fault前必须验证成功。

## 6. Attempt目录

```text
<evidence-root>/dev-canvas-06/recovery/attempts/<case-id>/<attempt-ordinal>/
  fixture/
    model-template.json
    gate-template.json
    base-revision.json
    materialization.json
    descriptors/
      asset-tree.json
      input-tree.json
    assets/packages/profiles/<profile-id>/<version>/**
    storage/projects/<project-id>/project.db
    gate/gate-fixture-work.json                 # 仅ROLLBACK
  control/
    launch-request.json
    child-ready.json
    reachpoint.json                             # 仅forced stop
    parent-observed.json                        # 仅forced stop
    termination.json                            # 仅forced stop
  observations/
    api-request-body.json
    api-request.json
    api-request-ingress.json
    api-request-parsed.json
    api-response.json
    process.json
  snapshots/
    before.json
    after.json
    reopen.json
    idempotent-replay.json                      # 仅018/021
    gate.json                                   # 仅ROLLBACK
  sqlite/
    before-files.json
    at-fault-files.json
    after-termination-files.json
    reopen-files.json
  logs/
    child.stdout.log
    child.stderr.log
  artifact-index.json
```

不存在的条件资产必须缺省，禁止空SHA、null ref或占位文件。Factory提交时只允许`fixture/**`；`control/observations/snapshots/sqlite/logs/artifact-index.json`由后续Runner阶段按case生成。Factory input descriptor不冒充最终attempt artifact index。

## 7. SQLite Fault Port

### 7.1 接口

production repository保持无fault默认实现。test-only composition注入：

```java
interface RecoverySqliteFaultPort {
    void reach(RecoverySqliteStage stage, RecoveryFaultContext context) throws IOException;
}
```

`RecoverySqliteStage`只允许：

```text
AFTER_REVISION_INSERT
AFTER_PARENT_INSERT
AFTER_TRACE_INSERT
AFTER_FINDING_INSERT
BEFORE_HEAD_UPDATE
AFTER_OPERATION_INSERT
AFTER_RECEIPT_INSERT
```

它们一一映射`RCV-CANVAS-009~015`，调用位置必须与现有`SqliteRevisionCommitRepository`事务写序相同。每个attempt只配置一个stage，只触发一次受控`IOException`；第二次reach是runner内部错误。fault port不得改SQL、connection、auto-commit、transaction数据或catch/rollback逻辑。

### 7.2 装配守卫

仅当test launcher classpath存在、`recovery-release` test composition显式装配、child challenge/token/case/attempt全部闭合时允许非NOOP port。普通main class、production/default profile、发布JAR直接启动或缺任一guard时只能装配NOOP或fail startup，不能读取`OPM_RECOVERY_*`环境变量或系统全局配置。

## 8. Forced-stop Reachpoint与Launcher

### 8.1 Reachpoint枚举

四个case只允许以下reachpoint：

| Case | Reachpoint | 必须窗口 |
| --- | --- | --- |
| 016 | `AFTER_REVISION_INSERT_BEFORE_PARENT` | Revision insert成功，同transaction尚未Parent |
| 017 | `AFTER_HEAD_UPDATE_BEFORE_OPERATION` | Head update成功，尚未Operation/Receipt/commit |
| 018 | `AFTER_CONNECTION_COMMIT_BEFORE_HTTP_FIRST_BYTE` | `connection.commit()`已返回，response首byte尚未写 |
| 019 | `IDLE_AFTER_CONFIRMED_RESPONSE` | 父进程已完整校验成功response，child无active command |

事务hook与forced-stop reachpoint是两个接口；016/017的reachpoint可以复用相同代码位置发proof，但不能通过抛异常触发。018必须在repository返回Committed后、HTTP body writer前设置不可越过的test latch；019由父进程在确认response后通过control challenge要求child进入idle latch。

### 8.2 Launcher输入

父runner固定使用：

```text
<java21>/bin/java
  -Dloader.path=<absolute-test-launcher-jar>
  -Dloader.main=org.opm.localruntime.recovery.RecoveryChildLauncherMain
  -cp <absolute-exact-runtime-jar>
  org.springframework.boot.loader.launch.PropertiesLauncher
  --launch-request <attempt/control/launch-request.json>
```

`PropertiesLauncher`必须来自exact Runtime JAR根部，product classes/dependencies必须从该JAR的`BOOT-INF`加载；禁止展开JAR后重组classpath。`test-launcher-jar`必须有raw fileRef并经archive检查证明不在runtime JAR/release ZIP。`loader.path/loader.main`只能由父runner生成，child guard必须复算CodeSource，拒绝额外loader path。

Launch Request唯一机器Schema为：

```text
docs/contracts/schemas/opm-dev-canvas-06-recovery-launch-request.schema.json
OPM-DEV-CANVAS-06-RECOVERY-LAUNCH-REQUEST-001/0.1
protocol_version=0.1
```

唯一文件固定为`control/launch-request.json`。`attempt_root`在JSON中必须为`.`，child从已经通过realpath/lstat的`--launch-request`父目录向上两级派生attempt root；禁止把绝对attempt path、cwd或环境变量写入请求。所有字段、条件和fileRef以Schema为准：case/category/attempt/source epoch、runtime/launcher/materialization refs、loopback port、32-byte challenge ref/SHA、128-bit boot nonce、fault、reachpoint、termination policy及`command_input`。

通过HTTP command入口的case必须使用非null`command_input{command_scenario_id,expected_request_digest,request_body_ref}`，三项与Model template、Catalog、Manifest case和`observations/api-request-body.json`逐项闭合；不走HTTP入口的case必须为JSON `null`，不存在省略或三个可选字段的混合形状。`launch_request_payload_sha256=sha256(UTF8(JCS(除自身外完整请求)))`；raw文件固定为UTF-8 JCS bytes，无BOM、无尾随换行。

### 8.3 Parent Challenge文件

1. parent使用OS CSPRNG生成恰好32 raw bytes，SHA-256写入Launch Request；禁止从case ID、时钟、PID、boot nonce或伪随机种子派生；
2. 唯一路径为`control/parent-challenge.bin`，fileRef kind=`RECOVERY_PARENT_CHALLENGE`、`byte_length=32`；POSIX权限必须`0600`，Windows必须使用当前父进程用户owner-only ACL；
3. 写入采用第8.5节同目录single-writer atomic publish，最终文件发布并复核后才能原子发布Launch Request；
4. child必须`lstat`普通文件、拒绝symlink/hardlink、验证owner权限/32 bytes/raw SHA，以NOFOLLOW单次读取并在内存中保持原始值；不得输出到stdout/stderr、JSON proof、Report、artifact index或crash dump；
5. parent验证`child-ready.challenge_loaded=true`及全部identity后立即删除challenge并同步`control/`目录；删除失败先终止child，再以`RECOVERY_UNEXPECTED_RUNTIME_ERROR/4`结束且不得继续到reachpoint；
6. child-ready前失败时parent必须先终止已证明归属的child再清理challenge。未能证明PID归属时不得终止未知进程，attempt保持诊断staging且最终Report零输出。

### 8.4 到达证明

四类JSON proof的唯一union Schema为：

```text
docs/contracts/schemas/opm-dev-canvas-06-recovery-launch-proof.schema.json
OPM-DEV-CANVAS-06-RECOVERY-CHILD-READY-001/0.1
OPM-DEV-CANVAS-06-RECOVERY-REACHPOINT-001/0.1
OPM-DEV-CANVAS-06-RECOVERY-PARENT-OBSERVED-001/0.1
OPM-DEV-CANVAS-06-RECOVERY-TERMINATION-001/0.1
```

child启动后先写`child-ready.json`；仅forced case继续按以下sequence写后三类proof：

1. `child-ready.json`：固定sequence=`0`，Schema字段完整记录PID、nonce/challenge、runtime/launcher/launch request、storage root identity、active binding、actual loopback port和payload SHA；
2. 达到目标窗口时写`reachpoint.json`：固定sequence=`1`，Schema字段完整记录transaction phase、Revision/Head/Operation/Receipt observation、commit/HTTP byte窗口、SQLite file-set ref和payload SHA；随后阻塞于不可超时自动释放的test latch；
3. parent lstat/read/复算raw SHA与payload，确认PID仍活、nonce/challenge/runtime/case/attempt匹配，再原子写`parent-observed.json`并fsync；
4. parent只能在第3步成功后执行OS强停：POSIX=`SIGKILL`，Windows=`TerminateProcess`；等待child终止后写`termination.json`，记录requested primitive、observed signal/exit、PID、start/end monotonic、`parent_observed_ref`和残留进程扫描结果；reachpoint通过`parent_observed_ref -> reachpoint_ref`间接闭合，禁止增加未冻结的直接字段。

每个proof的`payload_sha256`均为`sha256(UTF8(JCS(除payload_sha256外完整对象)))`，raw bytes为JCS且无尾随换行。018要求`connection_commit_returned=true && http_response_bytes_written=0`；016/017要求commit=false且bytes=0；019要求commit=true、bytes至少1且父进程保存的成功response raw ref与idle challenge闭合。proof缺失、重复、字段不等、child提前退出、PID复用、正常exit、shutdown hook清理或无法确认response byte窗口均为`RECOVERY_FAULT_NOT_REACHED`。

### 8.5 单写原子发布与首错

challenge、Launch Request和四类proof只能由固定producer各写一次：challenge/Launch Request/parent-observed/termination由parent写，child-ready/reachpoint由child写。每个文件采用唯一协议：

```text
lstat final必须不存在
-> 在同一control目录CREATE_NEW临时文件 .<final>.tmp.<boot_nonce>.<producer>
-> 写入全部raw bytes
-> flush并fsync/force文件
-> 再次确认final不存在
-> 同卷atomic move且禁止replace
-> reopen final并复算raw SHA/payload SHA
-> 平台原语同步目录项
```

POSIX目录提交使用atomic rename/no-replace和directory fsync；Windows使用不覆盖目标的MoveFileEx/ReplaceFile等价atomic move并启用write-through。当前平台不能证明atomic move、write-through或owner-only challenge权限时，environment preflight以`RECOVERY_ENVIRONMENT_MISMATCH/2`拒绝，不能降级为直接写final、copy+delete或覆盖rename。临时文件和final均禁止symlink/hardlink，proof final已存在、move时出现目标、重复sequence或第二producer均不覆盖原件并立即失败。

Launch边界的唯一首错顺序为：

```text
launch-request Schema/raw/payload/path
-> challenge create/permission/length/SHA
-> runtime/launcher raw ref与CodeSource
-> case/attempt/materialization/fault/reachpoint/command join
-> final/temp路径fresh
-> child spawn与PID ownership
-> child-ready timeout/Schema/identity
-> challenge cleanup
-> reachpoint timeout/Schema/window
-> parent-observed atomic publish/readback
-> termination primitive/liveness/exit
-> termination proof atomic publish/readback
-> artifact index/ref closure
```

一个阶段出现第一个错误后不得继续后续阶段或用后续错误覆盖。前四项在run acceptance前分别映射`RECOVERY_INPUT_INVALID`、`RECOVERY_BUILD_MISMATCH`或`RECOVERY_FIXTURE_MISMATCH`并保持零最终Report；已接纳attempt中的child-ready/reachpoint/parent-observed/termination身份或窗口失败映射`RECOVERY_FAULT_NOT_REACHED`；原子writer、fsync、无法分类I/O映射`RECOVERY_UNEXPECTED_RUNTIME_ERROR`并保持零最终Report。重复proof不得写成第二条Report failure。

## 9. Snapshot与重开

1. `before/after/reopen`使用第5.7节同一只读snapshot reader和digest preimage，字段严格等于Recovery Report `0.1` Schema七计数、Head、四digest、quick/FK、marker/temp refs；
2. forced stop后先采集`at-fault/after-termination`文件清单和raw SHA，再启动全新JVM/connection/browser context重开；禁止先删除WAL/journal/marker/temp；
3. 018/021执行同command_id显式幂等回放并写`idempotent-replay.json`；回放不是runner retry；
4. snapshot JSON先在attempt内原子写，Report只引用raw ref并复制已验证值；Report writer不得反向修改snapshot；
5. `expected_reopen`只允许从第4.8节Catalog展开。字段resolver固定为：`BEFORE_SNAPSHOT/AFTER_SNAPSHOT`取同名observed字段；`CONSTANT_OK`取字符串`ok`；`CONSTANT_ZERO`取整数`0`；`EXACT_EMPTY`要求空数组；`EXACT_ONE_RECOVERY_REQUIRED_MARKER`要求恰一个kind=`RECOVERY_REQUIRED_MARKER`的普通fileRef，且path/SHA在artifact index中反向闭合。不存在默认值、宽松比较、大小写折叠或由observed结果选择profile；
6. verifier固定计算`reopen_snapshot_sha256=sha256(UTF8(JCS(reopen_snapshot)))`和`reopen_match_sha256=sha256(UTF8(JCS({case_id,expected_reopen_sha256,reopen_snapshot_sha256,matched})))`。`matched`只能由上述17字段全部通过产生；Report writer不得自报或覆盖；
7. normalized outcome digest只覆盖冻结的top/detail code、七delta、Head、`expected_reopen_sha256/reopen_snapshot_sha256/reopen_match_sha256`、idempotent/gate outcome，排除PID、端口、绝对path和时钟。

## 10. Rollback Evaluator Adapter

唯一纯接口为：

```text
evaluateRecoveryRollback({
  verifiedEffectiveManifest,
  scope,
  requestedCapabilityIds,
  handoffCapabilityOrder,
  reverseControlDependencies
}) -> FrozenRollbackEvaluation
```

实现必须调用production rollback builder/verifier使用的同一纯evaluator，不得复制算法。test adapter只把已验证Gate work copy映射为`verifiedEffectiveManifest`；production loader先对原Gate Fixture bytes返回`REJECTED`。Evaluator不得写文件或gate；Orchestrator把结果写入attempt-local observation。56个attempt前后真实production gate均为`DISABLED + []`，raw before/after proof进入artifact。

## 11. Artifact采集格式

### 11.1 `artifact-index.json`

每个attempt最后写一份封闭index：

```text
schema_id="OPM-DEV-CANVAS-06-RECOVERY-ARTIFACT-INDEX-001"
schema_version="0.1"
case_id
attempt_ordinal
generated_at
runtime_jar_ref
launcher_jar_ref?
template_source_ref
entries[]
tree_sha256
index_payload_sha256
```

`entries[]`按UTF-8 relative path排序，每项固定：

```text
{artifact_kind,path,media_type,byte_length,sha256,capture_phase,required_for_verdict}
```

`path`相对attempt root，禁止index自引用、绝对path、`..`、symlink和重复/大小写冲突。`tree_sha256=sha256(JCS(entries))`；`index_payload_sha256`对除自身外index JCS计算。`generated_at`取attempt结束实际UTC，仅不进入normalized outcome digest。

### 11.2 采集规则

1. 采集阶段固定`BEFORE/AT_FAULT/AFTER_TERMINATION/AFTER_REOPEN/AFTER_REPLAY/AFTER_GATE`；不适用阶段不生成文件；
2. `required_for_verdict=true`至少覆盖template materialization、before/after/reopen snapshot、API/process observation、forced proof/termination、idempotent replay或gate observation；
3. stdout/stderr原始bytes保存，单文件上限`16 MiB`；超过上限立即强停并以`RECOVERY_UNEXPECTED_RUNTIME_ERROR`失败，禁止截断后声称完整；
4. 日志必须脱敏parent challenge、完整绝对path和环境secret；脱敏只针对日志，proof/raw JSON不得通过字符串替换改变机器字段；
5. SQLite DB/WAL/SHM/journal在各阶段用file-set JSON记录path/type/length/raw SHA，不能把正在写的DB copy冒充一致快照；
6. artifact必须在attempt cleanup前采集。无论PASS/FAILED都保留不可变attempt root；runner不得只保留绿色case；
7. Recovery Report `artifact_refs/evidence_refs`必须引用index中存在且raw SHA相同的文件，verifier反向检查每个required entry都被适用case结果引用。

### 11.3 HTTP request三阶段artifact

`observations/api-request-body.json`的原始bytes必须逐byte等于Model template `command_request`的JCS bytes，不含wrapper、尾随换行或BOM。其fileRef固定kind=`RECOVERY_API_REQUEST_BODY`。

`api-request-ingress.json`由Filter在dispatch前原子写入，恰有：

```text
schema_id="OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-INGRESS-001"
schema_version="0.1"
case_id, attempt_ordinal, command_scenario_id, request_id, command_id,
expected_request_digest, request_body_ref,
method="POST", route_template, content_type="application/json",
raw_byte_length, raw_body_sha256, canonical_body_sha256,
validation_status="MATCHED|REJECTED",
strict_utf8, bom_absent, duplicate_keys_absent, single_json_object,
raw_equals_canonical, digest_matches_template, dispatch_authorized,
ingress_payload_sha256
```

`api-request-parsed.json`由Advice在Controller前原子写入，恰有：

```text
schema_id="OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-PARSED-001"
schema_version="0.1"
case_id, attempt_ordinal, command_scenario_id, request_id, command_id,
ingress_ref, expected_request_digest,
parsed_body_sha256, validation_status="MATCHED|REJECTED",
parsed_equals_raw, controller_authorized,
parsed_payload_sha256
```

`api-request.json`由parent在command结束或受控拒绝后原子写入，恰有：

```text
schema_id="OPM-DEV-CANVAS-06-RECOVERY-API-REQUEST-OBSERVATION-001"
schema_version="0.1"
case_id, attempt_ordinal, request_body_ref, ingress_ref, parsed_ref?,
validation_status="MATCHED|REJECTED",
http_status, response_ref?,
controller_invocation_count, service_invocation_count,
repository_commit_call_count,
observation_payload_sha256
```

三个`*_payload_sha256`均对排除自身字段后的对象执行`sha256(UTF8(JCS(...)))`。所有object及条件字段由`docs/contracts/schemas/opm-dev-canvas-06-recovery-api-request-artifact.schema.json` `0.1`唯一承接并递归`additionalProperties=false`；`parsed_ref`只在Advice产生artifact后存在，filter拒绝时必须缺省；`response_ref`只在收到完整response时存在。MATCHED要求两proof ref存在、全部布尔守卫为true且调用计数与case执行路径一致；REJECTED要求`parsed_ref`按失败阶段有条件缺省、HTTP状态422且Controller/Service/repository三个计数全为0。Artifact index必须以kind=`RECOVERY_API_REQUEST_BODY/RECOVERY_API_REQUEST_INGRESS/RECOVERY_API_REQUEST_PARSED/RECOVERY_API_REQUEST_OBSERVATION`逐项收录；runner/verifier不得从日志重建字段。

## 12. Runner顺序与事务

Runner固定按Manifest case顺序、每case attempt 1再2串行执行，不提供`--concurrency`、retry、skip或resume：

```text
Manifest/Gate Fixture/raw refs/environment preflight
  -> template load + fresh attempt materialization
  -> materialization verify + before snapshot
  -> Catalog join + request body raw file/fsync
  -> challenge + Launch Request Schema/semantic verify + atomic publish
  -> child启动 + child-ready verify + challenge cleanup
  -> ingress filter + parsed advice + command执行
  -> reachpoint verify + parent-observed + termination proof（forced case）
  -> artifact-first capture
  -> after snapshot
  -> forced新JVM重开或普通新JVM重开
  -> reopen/idempotent/gate断言
  -> artifact index
  -> attempt result
  -> 两attempt normalized digest比较
  -> Report构造、Schema+semantic verify、atomic rename
```

任一case失败仍必须在可安全取证范围内完成该attempt的artifact/index和BLOCKED Report，但停止调度后续case；不得补造缺失snapshot/ref。若连Manifest identity、template identity、JCS/SHA/Schema engine或Report atomic writer都不可信，最终Report零输出，stderr稳定失败，已采集artifact保留诊断但不能作为Gate证据。

## 13. 稳定失败映射

Recovery Report的16个稳定failure code固定为：

```text
RECOVERY_INPUT_INVALID
RECOVERY_ENVIRONMENT_MISMATCH
RECOVERY_BUILD_MISMATCH
RECOVERY_FIXTURE_MISMATCH
RECOVERY_FAULT_NOT_REACHED
RECOVERY_ERROR_CODE_MISMATCH
RECOVERY_TRANSACTION_DELTA_MISMATCH
RECOVERY_HEAD_MISMATCH
RECOVERY_REOPEN_FAILED
RECOVERY_IDEMPOTENCY_MISMATCH
RECOVERY_DATA_LOSS
RECOVERY_GATE_STATE_MISMATCH
RECOVERY_ROLLBACK_SCOPE_MISMATCH
RECOVERY_READONLY_MISMATCH
RECOVERY_NONDETERMINISTIC
RECOVERY_UNEXPECTED_RUNTIME_ERROR
```

不得新增runner私有failure code、自由文本code或把Java exception class写入Report code。执行级映射补充为：

- template raw ref/identity/payload/factory output不闭合 -> `RECOVERY_FIXTURE_MISMATCH`；
- Manifest `0.2`/Reopen Catalog raw/payload/profile/case join不闭合 -> `RECOVERY_INPUT_INVALID`；
- HTTP raw/canonical/parsed bytes或request digest不闭合 -> `RECOVERY_FIXTURE_MISMATCH`；
- canonical guard缺失、重复、CodeSource或装配边界不闭合 -> `RECOVERY_BUILD_MISMATCH`；
- Launch Request Schema/payload/path或challenge形状不闭合 -> `RECOVERY_INPUT_INVALID`；
- runtime/launcher ref、CodeSource或请求与case/materialization join不闭合 -> `RECOVERY_BUILD_MISMATCH`或`RECOVERY_FIXTURE_MISMATCH`，按第8.5节先到边界唯一选择；
- fault port未触发恰一次或reach proof不闭合 -> `RECOVERY_FAULT_NOT_REACHED`；
- OS终止primitive/exit/signal/liveness不闭合 -> `RECOVERY_FAULT_NOT_REACHED`；
- artifact/index/ref/tree不闭合 -> `RECOVERY_INPUT_INVALID`，无法可靠读取时`RECOVERY_UNEXPECTED_RUNTIME_ERROR`；
- template/attempt nondeterminism或两次normalized digest不同 -> `RECOVERY_NONDETERMINISTIC`；
- product JAR/launcher/source build不等 -> `RECOVERY_BUILD_MISMATCH`。

CLI退出码保持：`0=READY`、`2=输入/Schema/ref非法`、`3=已生成Schema-valid且语义闭合的BLOCKED Report`、`4=I/O/内部/Report不可交付错误`。

## 14. 测试矩阵与完成定义

矩阵总量固定为`28=8+7+4+3+6`，依次对应`PRE_COMMIT/SQLITE/FORCED_RESTART/SERVICE_RECOVERY/ROLLBACK`；每个case恰有2个隔离attempt，总计`56`。case ID、expected transaction/gate与READY聚合继续以DEV-CANVAS-06 release checklist的`GATE-06-05`为唯一事实源；expected reopen机器语义只以来自第4.8节的Catalog `0.1.0`为准，checklist不复制第二份profile对象。

实现必须至少证明：

1. 两份template、Reopen Catalog和Manifest `0.2`正例及raw/payload/path/version/Handoff binding/catalog join tamper反例；Projection Digest `0.1`的4个正向量、9个负向量和Node/Java全链路parity；
2. Factory两份新增Schema、helper JAR、21表SQLite、source mirror、四scenario映射、fresh root、原子零输出、template不变和双attempt隔离；
3. 七hook一一触发、单次触发、真实rollback和七项零delta；
4. Launch Request/Proof Schema、challenge权限和秘密清理、四reachpoint proof、atomic no-replace/readback、提前/延后/重复/伪PID/正常exit/response byte窗口反例；canonical body正例以及重排、空白、BOM、重复键、错误SHA、parsed差异、超限、filter/advice缺失和零执行反例；
5. artifact index path/raw SHA/tree/order/required ref/日志上限正反例；
6. rollback adapter同源性、production loader拒绝、真实gate before/after不变；
7. `28/28` case、`56/56` attempt、两次normalized digest相同且`--require-ready` verifier返回0。

设计完成：本文`v1.5`的template、Reopen Catalog、Manifest `0.2`、HTTP ingress、Factory输入/输出、SQLite映射、hook、Launch Request/Proof Schema、challenge、reachpoint、atomic single-writer、artifact、Projection Digest `0.1`和执行顺序已冻结；`RECOVERY-IMPL-01=DESIGN_READY`，实现状态仍以独立checklist为准，允许继续实现但不表示任何runner或evidence已经完成。

实现完成：还必须由独立implementation checklist记录exact source commit、Runtime/helper/launcher/template refs、命令、环境指纹、28/56结果和Report raw SHA。未执行真实exact release build时只能声称实现测试通过，不能关闭`GATE-06-05`。

## 15. 事实与假设

### 15.1 事实

1. 当前`SqliteRevisionCommitRepository`已有与七个SQLITE case对应的内部write hook位置，并有事务回滚单测模式；
2. 历史Recovery Manifest `0.1`保持可读；活动Manifest `0.2`、Reopen Expectation Catalog、Gate Fixture/Report/Attempt Materialization/Tree Descriptor/API Request/Launch Request/Launch Proof `0.1` Schema已存在，但完整launcher、强停、28/56和READY Report仍无完成证据；
3. 现有Report Schema没有独立Artifact Index字段，Report通过既有`artifact_refs/evidence_refs`引用本设计的raw JSON/files；
4. 本设计不修改历史Recovery `0.1` Schema、两份immutable template或SQLite V1；Launch Request/Proof为新增`0.1`机器输入，Manifest `0.2`与Reopen Catalog继续保持现行版本；
5. `ProjectDatabaseFactory/Flyway`和单Revision SQLite seed模式已有实现先例，但Recovery专用helper、source mirror和Factory尚未实现。

### 15.2 假设

无。
