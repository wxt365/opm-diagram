# DEV-CANVAS-06 E2E Fault Launcher 设计

文档版本：`v1.9`

文档状态：`FROZEN_INCLUDED`

更新时间：2026-08-28

## 1. 定位

本文是活动 E2E Fault Plan `OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001/0.2` 的唯一 launcher/port 执行设计。Fault Plan Schema、字段、`plan_sha256`、`artifact_payload_sha256`和三类 case 映射不变；本文只冻结受控 child process 如何验证计划、装配 test-only fault port并产生真实产品错误。

本文后继并收紧历史 Attempt Artifact `v1.3`第5章和 E2E Runner 实现规格第7、8.3节。发生冲突时，以本文为活动 launcher 口径。

后继代码实现唯一入口为`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`及对应implementation checklist。该规格已冻结精确source delta、Spring Boot注册、显式context、Recovery隔离、Common重建和分层测试；不得继续从本文自行选择文件集合。

受控执行输入与 Gate 时序由`specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md`后继修正：Fault Launcher lane只接受Controlled Bundle `0.2`对Preflight Descriptor `0.1`的不可变raw ref，原D10拆为preflight `D10A`和Playwright执行期`D10B`；第17章进一步冻结唯一`--run-controlled`入口、actual Manifest v02字段级D05 join、Preflight Report `0.2`、父到Playwright的单一raw-ref Invocation Context和controlled evidence root原子事务。旧候选`63851f8...`及其`2 M`后继`586d6de...`只保留为Schema修正与patch对照，不得作为活动2A base。活动D01按Final Production Source Chain验证`O -> C -> S -> A`且不增加Preflight Report字段。本文的child/port产品语义不变。

最终production source identity由`specs/opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`后继取代：活动链唯一为`9048bb3... -> rebuilt Fault contract C -> rebuilt schema conformance S -> Fault 2A A -> final Runner R`。旧`0dcaa27.../63851f8.../586d6de...`仅保留历史语义与patch对照；36项raw-ref字段表、两个controlled新增路径、D10A/D10B和本文launcher/port语义不变。活动A-stage allowlist固定为`4=2 M+2 A`。C/S/A/R均未创建，不得从旧链继续Build。

Stage A lifecycle由`specs/opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-task-spec.md`进一步收紧：唯一接口为`runControlledLifecycleSession()`；Runtime/Web lifecycle、exact READY、INITIAL/REOPEN、Common Driver client factory、Runtime/Web child cleanup、12个唯一端口去重计数、D10B sampler和Gate Artifact writer均归Runner owner。controlled spec只提供预绑定handler、只接收origin与六方法observation sink；每cycle必须在route/navigation/API前通过`attachBrowserPage(page)`绑定真实Page，并在`finally`关闭fresh Chromium process/context/page后以相同对象调用`confirmBrowserClosed({browser,context,page})`。Runner只接纳同Page网络观测、对象引用和Page/Context/Browser关闭事件证明，不接管Browser。confirm初步接纳后立即冻结业务观测并移除采样监听，但必须无间隙保留仅置位`late_event_detected`的Page/Context/Browser sentinel，直到handler settle、零迟到事件复核和sink关闭；此后才移除全部sentinel并接纳最终proof。confirm后迟到事件、监听空窗、sentinel提前移除或最终残留均视为证明不闭合，固定为`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`，不得采样当前DURING或提交可消费Artifact。父Node只终止Playwright test child。接口完成前禁止A commit与D10B。

## 2. 设计原则

1. **默认不可达**：普通 `java -jar` 只装配 `E2EFaultPort.NOOP`；Fault Launcher不是生产功能。
2. **计划先于装配**：Plan、identity、nonce和challenge全部通过后，Spring才允许创建非NOOP port。
3. **产品路径真实**：UI、Controller、Service、校验、文本和Repository仍走正式路径；只在冻结层注入单一故障。
4. **不污染输入和数据**：不删除Profile资产、不chmod、不改SQLite schema/data、不新增HTTP route、不使用运行时setter。
5. **一次性且可证伪**：每进程只有一个port实例；错context、第二次触发和未触发都使attempt证据无效。
6. **配置不是认证**：nonce/challenge用于绑定Runner、Plan和child，不能替代OS权限、用户隔离或生产安全控制。

## 3. 角色与唯一 Owner

| Owner | 职责 | 禁止职责 |
| --- | --- | --- |
| Runner process orchestrator | 生成Plan/nonce/challenge、启动child、等待READY、采集stderr/exit | 在产品层直接制造故障 |
| `E2EFaultLauncherConfigurationGuard` | 解析原始命令行、拒绝partial/unknown/错误来源配置 | fallback、读取环境变量补默认值 |
| `E2EFaultPlanVerifier` | 按固定顺序验证Plan raw/Schema/digest/identity/handshake | 修复、重写或归一化Plan |
| `E2EFaultLauncherConfiguration` | 在唯一Spring条件下创建attempt-local `E2EFaultPort` | 普通启动装配、公共API暴露 |
| `E2EFaultPort` | 在三个冻结产品层执行一次性注入和状态验证 | case路由、文件扫描、修改产品配置 |
| Runner verifier | 复核命令、日志、产品错误、零事务增量和reopen | 触发故障、补写证据 |

## 4. 启动分类

### 4.1 Fault-enabled INITIAL

只有以下三个 `INITIAL` cycle 使用 Fault Launcher：

```text
E2E-CANVAS-007.ASSET_MISSING
E2E-CANVAS-007.PERSISTENCE_FAILED
E2E-CANVAS-007.READONLY
```

固定命令形状：

```text
<verified-java> -jar <attempt-root>/inputs/build/local-runtime.jar
  --spring.profiles.active=release-e2e-fault
  --server.address=127.0.0.1
  --server.port=<runtime-port>
  --opm.storage.root=<attempt-root>/storage
  --opm.release.e2e.enabled=true
  --opm.release.e2e.guard=RELEASE_E2E_FAULT_ONLY
  --opm.release.e2e.plan=<attempt-root>/fault-plan.json
  --opm.release.e2e.plan-raw-sha256=<64 lowerhex>
  --opm.release.e2e.case-id=<exact case_id>
  --opm.release.e2e.attempt-ordinal=<1|2>
  --opm.release.e2e.parent-nonce=<64 lowerhex>
  --opm.release.e2e.challenge=<runner-process-root>/<case-path>/<ordinal>/fault-launcher.challenge
  --opm.release.e2e.challenge-response=<64 lowerhex>
```

九项 `opm.release.e2e.*` 参数必须各出现一次且只来自 Spring `commandLineArgs` property source。`spring.profiles.active`也必须在同一property source中恰出现一次、逐字等于单一值`release-e2e-fault`，不得与其他profile组合。禁止从`application.yml`、profile YAML、环境变量、JVM system property、远程配置、当前目录或默认值补齐profile或九项参数。

### 4.2 普通 INITIAL 与 REOPEN

其余191个`fault_kind=NONE` case的INITIAL，以及全部194个case的REOPEN，使用普通Runtime命令：

```text
<verified-java> -jar <attempt-root>/inputs/build/local-runtime.jar
  --server.address=127.0.0.1
  --server.port=<runtime-port>
  --opm.storage.root=<attempt-root>/storage
```

不得携带`release-e2e-fault` profile或任何`opm.release.e2e.*`键。REOPEN不重新武装故障；它只验证失败后Revision、Head、Projection、OPL和Trace保持不变。

## 5. 默认拒绝与 Spring 装配

### 5.1 配置状态

| 输入 | 结果 |
| --- | --- |
| 无fault profile且九项键全部不存在 | 正常启动，只装配`E2EFaultPort.NOOP` |
| fault profile或任一键存在，但完整tuple不闭合 | 启动失败`E2E_FAULT_CONFIGURATION_INVALID/2` |
| 未知`opm.release.e2e.*`键、重复键、profile或任一键来自非commandLineArgs来源 | 启动失败`E2E_FAULT_CONFIGURATION_INVALID/2` |
| profile、九项键、Plan和握手全部闭合 | 只装配一个attempt-local非NOOP port |

### 5.2 Spring 条件

唯一非NOOP配置类为`E2EFaultLauncherConfiguration`，必须同时满足：

```text
activeProfiles == ["release-e2e-fault"]
opm.release.e2e.enabled == "true"
opm.release.e2e.guard == "RELEASE_E2E_FAULT_ONLY"
E2EFaultLauncherConfigurationGuard == VERIFIED
E2EFaultPlanVerifier == VERIFIED
```

`E2EFaultLauncherConfigurationGuard`唯一实现为Runtime JAR内通过Spring Boot既有metadata注册的`EnvironmentPostProcessor`，固定顺序为`ConfigDataEnvironmentPostProcessor.ORDER + 1`；它必须在profile-specific config加载完成后、bean definition解析前检查完整`MutablePropertySources`和原始`commandLineArgs`，并以stable code拒绝来源漂移、重复、partial或未知键。禁止改用Controller、`@PostConstruct`、Actuator、lazy bean或应用启动完成后的检查。普通配置通过`@ConditionalOnMissingBean(E2EFaultPort.class)`提供唯一`E2EFaultPort.NOOP`；因此partial配置不能因条件不匹配而静默落到NOOP。`application.yml`和任何production profile不得声明`opm.release.e2e.*`或`release-e2e-fault`。

## 6. Parent Nonce 与 Challenge

### 6.1 原始字节

Runner对每个attempt独立调用CSPRNG：

```text
parent_nonce_bytes = 32 random bytes
challenge_bytes    = 32 different random bytes
```

约束：

- 两者长度必须精确为32 bytes，且不得相等；
- `fault-plan.json.nonce = lowerhex(parent_nonce_bytes)`；
- `--opm.release.e2e.parent-nonce`同样为`lowerhex(parent_nonce_bytes)`；禁止大写、`0x`、Base64、UUID、空白或Unicode；
- challenge文件内容精确为`challenge_bytes`，不是hex文本、UTF-8、JSON或带换行文件；
- challenge文件位于Runner新建的`0700` process-control root，文件为`0600`、single-link regular file；不得位于source、Manifest、attempt evidence或production storage root；child READY后Runner删除该临时文件，final Report root不得包含它。

### 6.2 Challenge Response

固定公式：

```text
domain = ASCII("OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-001") || 0x00
message = domain || challenge_bytes || hexDecode(plan_raw_sha256)
challenge_response = lowerhex(HMAC-SHA-256(
  key = parent_nonce_bytes,
  message = message
))
```

Launcher从Plan、参数和challenge文件分别取得三条输入，独立复算并用常量时间比较32-byte response。禁止把hex字符串本身当HMAC message、使用平台默认编码、拼接路径、加入换行或回退普通SHA-256。

Plan nonce、参数nonce、HMAC、challenge长度/文件身份任一不一致均为`E2E_FAULT_HANDSHAKE_INVALID/3`。challenge不写日志；nonce和response日志只允许显示前8位诊断前缀。

## 7. Fault Plan 验证

### 7.1 固定路径与文件身份

Plan必须逐字位于：

```text
<attempt-root>/fault-plan.json
```

`attempt-root`由`opm.storage.root`的父目录预先构造，不从Plan、case目录名或cwd反推。Plan path必须是absolute normalized path，lexical/real parent都等于attempt root；basename必须是`fault-plan.json`。

文件必须满足：regular、非symlink、`unix:nlink=1`、size `1..4096` bytes、owner与child uid相同。受控环境不支持`unix:nlink`时拒绝，不允许跳过。Launcher使用NOFOLLOW打开一次并记录file key/size/mtime；不得先resolve realpath后换另一个句柄读取。

### 7.2 唯一首错顺序

```text
ARGS_SOURCE
-> MODE_AND_PROFILE
-> PLAN_PATH
-> PLAN_FILE_IDENTITY
-> PLAN_RAW_READ
-> PLAN_RAW_SHA
-> UTF8_AND_JSON
-> SCHEMA_0_2
-> ARTIFACT_PAYLOAD_SHA
-> PLAN_SEMANTIC_SHA
-> CASE_SCHEDULE_MAPPING
-> PARENT_NONCE
-> CHALLENGE_FILE
-> CHALLENGE_RESPONSE
-> PORT_ARM
```

具体规则：

1. raw bytes必须无BOM、严格UTF-8、无CR，序列化形状为一个JSON object加一个结尾LF；重复key拒绝；
2. `raw_sha256=SHA-256(raw bytes)`必须等于命令行`plan-raw-sha256`；它不是Plan内`plan_sha256`；
3. root必须通过活动`0.2` Fault Plan Schema和固定filename/schema identity；
4. `artifact_payload_sha256`按活动Schema既有公式复算；
5. `plan_sha256`按`{case_id,attempt_ordinal,fault_kind,target,trigger_count,nonce}`既有JCS公式复算；
6. case/ordinal逐字等于命令参数、Manifest schedule和attempt root定位输入；三类mapping必须与Schema一致且`trigger_count=1`；
7. nonce/challenge按第6章复核后才允许arm port。

Schema validator只能读取Runtime JAR内与活动源Schema逐byte一致的受控resource；禁止读取checkout、网络、cwd或另一个Schema版本。后继实现不新增通用JSON Schema依赖：Java owner只封闭执行union Schema的`$defs.faultPlan`字段/类型/const/enum/oneOf规则，并以Node/Ajv正反例parity证明等价边界；不得宣称为通用Draft 2020-12引擎。

### 7.3 Drift 复核

child输出READY前、第一次目标触发前、正常shutdown验证前，都必须按同一路径重新打开Plan并复核file key/size/mtime/raw SHA。任一变化固定为`E2E_FAULT_PLAN_DRIFT/3`；不得继续触发、恢复旧bytes或使用启动时缓存掩盖路径漂移。

## 8. Fault Context 与一次性状态机

### 8.1 Exact Context

Runner-owned Common driver的command ID固定为：

```text
case_slug = lowerAscii(case_id).replaceEachRun([^a-z0-9], "-").trim("-")
command_id = "command.e2e." + case_slug + ".attempt-" + attempt_ordinal + ".action-001"
```

port context固定包含：

```text
case_id, attempt_ordinal, project_id, model_id,
base_revision_id, candidate_revision_id, command_id,
profile_id, profile_version, symbol_asset_sha256
```

Project/Model/base identity来自Materializer artifact和当前真实Head；candidate revision为base sequence+1的正式UI命令；Profile/Symbol identity来自当前Revision binding。路径、线程名、HTTP session、PID或调用次数不能替代context。

后继实现中活动context固定为`E2EFaultContext.Active`；普通NOOP路径使用不含业务identity的`E2EFaultContext.Disabled`单例。`Disabled`不是证据context，不得填入case、ordinal或占位业务ID；所有方法禁止以`null`表示NOOP。

### 8.2 状态机

```text
CREATED -> VERIFIED -> ARMED -> TRIGGERED -> VERIFIED_AT_SHUTDOWN
```

- 只有exact context第一次到达exact hook才能`ARMED -> TRIGGERED`；
- 非目标hook保持ARMED且正常继续；目标hook但context不等立即`E2E_FAULT_CONTEXT_MISMATCH/3`；
- TRIGGERED后任何hook再次到达立即`E2E_FAULT_ALREADY_TRIGGERED/3`，不得再次注入或静默放行；
- Runner在获得预期产品错误后立即正常停止INITIAL child；shutdown时必须`actual_trigger_count=plan.trigger_count=1`；否则`E2E_FAULT_NOT_TRIGGERED/3`；
- 状态只属于当前child内存，不使用static、SQLite、文件锁、环境变量或跨REOPEN复用。

READY标准行固定为：

```text
E2E_FAULT_LAUNCHER_READY\t<case_id>\t<attempt_ordinal>\t<plan_raw_sha256>
```

Runner必须先观察该行，再允许Browser执行目标动作。自由文本日志、health UP或端口监听不能替代READY。

## 9. 三类精确注入

| Case | 唯一注入层 | 精确时机 | 注入结果 | 产品API结果 |
| --- | --- | --- | --- | --- |
| `ASSET_MISSING` | `ProfilePackageAssembler`调用`OplSymbolCatalogAssetLoader.load()`边界 | Profile package/binding/Grammar/Rule已通过，打开exact `SYMBOL_ASSET`前 | port抛`ProfilePackageAssemblyException(PROFILE_ASSET_MISSING)`；不读写/删除资产 | HTTP `422`，`TEXT_GENERATION_BLOCKED`，`retryable=false` |
| `PERSISTENCE_FAILED` | `SqliteRevisionCommitRepository.commit()`事务内部 | receipt和Head复核通过、`writeRevision()`第一条INSERT前 | port抛`CommitPersistenceException(PERSISTENCE_FAILED)`；当前事务rollback | HTTP `500`，`PERSISTENCE_FAILED`，`retryable=true` |
| `READONLY` | `RevisionCommitRepository.currentHead()`返回边界 | 已从SQLite读取真实Head后、返回给`CandidateRevisionCommitter.guards()`前 | 只把exact context的Head投影为`writable=false`；不改SQLite | HTTP `409`，`READ_ONLY_REVISION`，`retryable=false` |

共同事务结果固定：

```text
revision_delta=0
revision_parent_delta=0
text_artifact_delta=0
text_trace_delta=0
finding_delta=0
operation_delta=0
receipt_delta=0
draft_head_changed=false
```

禁止替代实现：

- `ASSET_MISSING`不得删除/移动/改写Profile文件，不得重算ref，不得在Controller伪造422；
- `PERSISTENCE_FAILED`不得在validation前、Revision INSERT后、Head更新后或HTTP层触发，不得复用Recovery的AFTER_*强停hook；
- `READONLY`不得chmod storage/DB、设置SQLite query_only、改`model_head`/snapshot/baseline数据或在Controller短路；
- 三类都不得新增公共route、Actuator endpoint、JMX、环境变量开关或生产配置键。

现有Common E2E BASE/INPUT fixture中的`expected_error_code=DOMAIN_REJECTED`是实现待修正输入：后继实现必须分别更新为本表三个产品错误码，并重建受影响的Common Catalog/Manifest raw refs；在完成前不得执行production Report。

## 10. Launcher 协议错误

stderr第一行固定：

```text
<CODE>\t<STAGE>\t<case-id或->\t<attempt-ordinal或->
```

| Code | Exit | 首错范围 |
| --- | ---: | --- |
| `E2E_FAULT_CONFIGURATION_INVALID` | 2 | profile、参数来源、缺失、重复、未知或production配置 |
| `E2E_FAULT_PLAN_PATH_INVALID` | 2 | path、basename、containment、link/type/nlink/size/owner |
| `E2E_FAULT_PLAN_SCHEMA_INVALID` | 2 | UTF-8/JSON/Schema/fixed identity |
| `E2E_FAULT_PLAN_DIGEST_MISMATCH` | 3 | raw SHA、payload SHA或plan SHA不一致 |
| `E2E_FAULT_IDENTITY_MISMATCH` | 3 | case/ordinal/Manifest schedule/mapping不一致 |
| `E2E_FAULT_HANDSHAKE_INVALID` | 3 | nonce、challenge或HMAC不一致 |
| `E2E_FAULT_PLAN_DRIFT` | 3 | READY前、trigger前或shutdown前Plan变化 |
| `E2E_FAULT_CONTEXT_MISMATCH` | 3 | 目标hook的业务context不一致 |
| `E2E_FAULT_ALREADY_TRIGGERED` | 3 | 第二次目标触发 |
| `E2E_FAULT_NOT_TRIGGERED` | 3 | shutdown时实际次数不等于计划 |
| `E2E_FAULT_INTERNAL_ERROR` | 4 | 未分类I/O或内部错误 |

协议错误不是产品API错误，不能写入case的`expected_error_code`。出现任一协议错误时，该attempt为执行证据不完整；Runner不得用可归类产品BLOCKED结果掩盖，也不得提交READY Report。

## 11. 正反例矩阵

### 11.1 正例

| ID | 场景 | 预期 |
| --- | --- | --- |
| `FL-P-001` | ASSET_MISSING INITIAL完整握手并执行一次UI动作 | READY后一次触发，422/TEXT_GENERATION_BLOCKED，零事务增量，shutdown验证通过 |
| `FL-P-002` | PERSISTENCE_FAILED INITIAL | 第一个Revision INSERT前一次触发，500/PERSISTENCE_FAILED，rollback，Head不变 |
| `FL-P-003` | READONLY INITIAL | 真实Head投影只读一次，409/READ_ONLY_REVISION，SQLite bytes不因准备动作变化 |
| `FL-P-004` | 任一NONE INITIAL | 普通`java -jar`，只有NOOP，无fault配置 |
| `FL-P-005` | 三类故障后的REOPEN | 普通`java -jar`，不重新武装，Projection/Text/Trace与失败前一致 |

### 11.2 反例

| ID | 变量 | 稳定结果 |
| --- | --- | --- |
| `FL-N-001` | 只有profile、只有enabled或缺任一九项键 | `E2E_FAULT_CONFIGURATION_INVALID/2` |
| `FL-N-002` | profile或参数重复、未知prefix键、环境/YAML/system property来源 | `E2E_FAULT_CONFIGURATION_INVALID/2` |
| `FL-N-003` | production profile或普通REOPEN携带fault配置 | `E2E_FAULT_CONFIGURATION_INVALID/2` |
| `FL-N-004` | Plan absolute/path/basename/root不等 | `E2E_FAULT_PLAN_PATH_INVALID/2` |
| `FL-N-005` | Plan symlink/hardlink/directory/FIFO/owner/size错误 | `E2E_FAULT_PLAN_PATH_INVALID/2` |
| `FL-N-006` | Plan partial、BOM、CR、重复key、错误Schema | `E2E_FAULT_PLAN_SCHEMA_INVALID/2` |
| `FL-N-007` | raw SHA、payload SHA或plan SHA漂移 | `E2E_FAULT_PLAN_DIGEST_MISMATCH/3` |
| `FL-N-008` | case/ordinal/target/trigger/mapping与调度不一致 | `E2E_FAULT_IDENTITY_MISMATCH/3` |
| `FL-N-009` | parent nonce大小写/长度/值错误 | `E2E_FAULT_HANDSHAKE_INVALID/3` |
| `FL-N-010` | challenge缺失、不是32 raw bytes、link或HMAC错误 | `E2E_FAULT_HANDSHAKE_INVALID/3` |
| `FL-N-011` | READY后或trigger前替换/修改Plan | `E2E_FAULT_PLAN_DRIFT/3`，零注入 |
| `FL-N-012` | exact hook但Project/Model/Revision/command/binding不等 | `E2E_FAULT_CONTEXT_MISMATCH/3` |
| `FL-N-013` | 同一port第二次到达目标hook | `E2E_FAULT_ALREADY_TRIGGERED/3`，不二次注入 |
| `FL-N-014` | child关闭前未触发或触发数不为1 | `E2E_FAULT_NOT_TRIGGERED/3` |
| `FL-N-015` | ASSET删除文件、Persistence用AFTER_INSERT、Readonly用chmod/改表的替代实现 | contract test失败，不能形成attempt证据 |
| `FL-N-016` | fixture仍期待`DOMAIN_REJECTED` | semantic verifier拒绝，production Report零提交 |

## 12. 实现文件集合与测试层级

后继实现规格已冻结精确allowlist并承接：

- launcher配置/guard/plan verifier/challenge owner；
- `E2EFaultPort`及NOOP、attempt-local实现；
- Profile assembler、Repository commit/currentHead三个最小hook；
- `LocalApiService`对`READ_ONLY_REVISION`的精确API映射；
- Common driver command ID公式；
- 三份BASE和三份INPUT fixture错误码及其Catalog/Manifest raw ref重建；
- 单元测试、Spring context slice、forked-JAR launcher集成测试和Runner受控集成测试。

实现文件、注册资源、测试文件及Common/Catalog/Manifest重建边界只以`opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`第4至8章为准。本文不维护第二份路径清单。

最低测试分层：

1. pure unit：hex/HMAC、Plan摘要、路径、状态机和三类port；
2. Spring slice：零配置NOOP、完整tuple装配、partial/production拒绝；
3. Repository/Profile integration：三个精确hook及零增量；
4. forked-JAR：真实JDK21 child、READY、错误challenge/plan drift/二次触发；
5. controlled E2E：三类UI/API产品错误和REOPEN；
6. production verifier：更新后的Common raw refs、`194/388`和Report语义闭合。

## 13. 发布边界

Java launcher/port的36项产品基线已从新origin `9048bb3...`逐项复算，集合摘要仍为`69491a...b411e`。Stage C固定`20=12 M+8 A`，S固定`2 M`，A固定`4=2 M+2 A`：两个Runner owner ref允许修改，其余34项不变，并新增两个controlled文件。Preflight Report仍只记录origin、contract base和candidate，`implementation_delta`固定四项`M/M/A/A`；中间commit由Git parent推导。Stage R仍修改两个Runner owner以扩展production行为，但必须保持A阶段controlled回归。controlled evidence只绑定A，不得冒充绑定R的production E2E Report。C/S/A/R、受控测试、production `194/388`和Report分别完成前，不提升Gate、Candidate、Activation、Capability或ISO状态。
