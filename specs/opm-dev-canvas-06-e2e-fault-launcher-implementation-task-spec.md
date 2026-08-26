# Spec: DEV-CANVAS-06 E2E Fault Launcher 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION/BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`

实现状态：`BASELINE_IMPLEMENTED/CONTROLLED_PLAYWRIGHT_NOT_STARTED`

Build准入：`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`

受控source commit准入：`ORIGIN_BASE_READY/CONTRACT_CLEAN_BASE_NOT_CREATED/2A_COMMIT_NOT_CREATED`

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`
- `design-module-docs`

## 1. 目标

实现 `docs/design/opm-dev-canvas-06-e2e-fault-launcher-design.md v1.2`，使三个 Common 故障 case 的 `INITIAL` cycle 在 exact Runtime JAR 中通过 test-only、fail-closed 的 Spring 装配产生真实产品错误，同时保证普通启动、191个 `NONE` INITIAL 和全部194个 `REOPEN` 永远只装配 NOOP。

本实现包只关闭 Fault Launcher、三个产品 hook、错误映射、Common 故障输入及受控验证，不生成 production `194/388` Report，不提升 `GATE-06-03`、Candidate、Activation、Capability 或 ISO 状态。

## 2. 权威输入

1. Fault Launcher 唯一语义输入：`docs/design/opm-dev-canvas-06-e2e-fault-launcher-design.md v1.2`；
2. Fault Plan 唯一机器输入：`OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001/0.2`，由活动 Attempt Artifact `0.2` union Schema承接；
3. Runner、Manifest、Profile asset、JAR identity和Attempt输出继续受 E2E Runner规格、Profile/Digest closure及既有Schema约束；
4. Common活动输入由 `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs` 唯一生成，活动Catalog版本仍为`0.2.0`；
5. Spring Boot版本固定为根POM锁定的`3.5.10`，EnvironmentPostProcessor注册采用该版本实际支持的`META-INF/spring.factories`；
6. `0dcaa27...`、36项只读raw ref和唯一`2 A`逻辑范围由Clean Base闭包规格冻结；Bundle `0.2`、Descriptor/JarIT/Gate Observation `0.1`、D10A/D10B和当前Build阻断以后继Preflight Descriptor/Gate Observation闭包规格为活动覆盖输入；
7. 后继contract包必须先形成新clean base intake，2A final commit以该commit为唯一parent。新base未形成前禁止创建、amend或cherry-pick 2A commit。

## 3. 非目标与硬禁止

禁止修改：

- `docs/contracts/openapi/**`及任何公共HTTP path、request、response或错误包络；
- `docs/contracts/migrations/sqlite/**`、SQLite DDL、migration和表列；
- 活动/历史Manifest、Attempt Artifact、Report、Fault Plan、Common Catalog JSON Schema；
- `services/recovery-test-tools/**`、`RecoverySqliteFaultPort`、`RecoverySqliteStage`、Recovery reachpoint及Launch协议；
- `application.yml`、任何production profile、环境变量协议、Actuator endpoint、JMX或公共管理接口；
- Vue业务代码、Golden Materializer、Recovery Factory、Release Candidate、Activation与Capability配置；
- 已安装的`clean-37c5412a9c12`、`clean-a36a7f1fd709`及任何既有不可变release root。

禁止实现方式：

- ThreadLocal、static mutable command context、路径/PID/线程名反推业务identity；
- 删除、移动、chmod或改写Profile资产；
- SQLite `query_only`、修改`model_head`或其他seed/schema/data；
- Controller短路、伪造HTTP响应、复用Recovery的`AFTER_*` hook；
- 从checkout、cwd、网络、环境变量或另一个Schema版本补齐Plan/Profile输入；
- 普通启动遇到partial fault配置后静默退回NOOP。

## 4. 精确 Source Delta Allowlist

旧38路径集合不再是可修改allowlist。活动实现边界固定为`36 READ_ONLY_BASELINE + 2 A`：第4.1至4.4节及第4.5节前12项均为只读基线，只有第4.5节最后两个controlled Playwright路径允许新增。未列文件以及36项基线一律禁止进入2A source commit。

origin base固定为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`。该base中旧38路径恰为36项存在、2项不存在；36项完整`path/byte_length/sha256`和有序集合摘要`69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e`由Clean Base闭包规格第6章唯一冻结。后继contract包必须以该origin base为唯一parent形成新clean base；最终2A commit再以新base为唯一parent，且相对新base的delta逐项等于两个`A`。Common factory及其测试仍由Common Driver实现规格唯一拥有。

### 4.1 生产Java与构建文件：`7 READ_ONLY_BASELINE`

1. `services/local-runtime/pom.xml`
2. `services/local-runtime/src/main/java/org/opm/localruntime/LocalRuntimeApplication.java`
3. `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
4. `services/local-runtime/src/main/java/org/opm/localruntime/command/CandidateRevisionCommitter.java`
5. `services/local-runtime/src/main/java/org/opm/localruntime/command/RevisionCommitRepository.java`
6. `services/local-runtime/src/main/java/org/opm/localruntime/assets/ProfilePackageAssembler.java`
7. `services/local-runtime/src/main/java/org/opm/localruntime/storage/SqliteRevisionCommitRepository.java`

上述bytes已进入base，本2A包不得修改。既有`services/local-runtime/pom.xml`资源映射只允许从`../../docs/contracts/schemas`选择`opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json`，并以原始bytes写入JAR路径`releaseevidence/schema/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json`；后继独立bugfix若需修复，也不得改依赖、插件版本或其他resource。

该活动Schema raw SHA-256固定为`3508290bf1d1d5f7d297ea48e69fdb4e1ebaf4f907b936b30cd4b769d6a916b4`。实现把该值写为`E2EFaultPlanVerifier.EXPECTED_SCHEMA_SHA256`常量；Schema bytes或常量任一变化都必须先升级本规格，不得运行时读取checkout补齐。

### 4.2 Fault Launcher Java：`10 READ_ONLY_BASELINE`

固定包：`services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/`

1. `E2EFaultLauncherArguments.java`
2. `E2EFaultLauncherErrorCode.java`
3. `E2EFaultLauncherException.java`
4. `E2EFaultContext.java`
5. `E2EFaultPlan.java`
6. `E2EFaultPlanVerifier.java`
7. `E2EFaultPort.java`
8. `AttemptLocalE2EFaultPort.java`
9. `E2EFaultLauncherEnvironmentPostProcessor.java`
10. `E2EFaultLauncherConfiguration.java`

不得增加第二个fault包、通用插件框架、公共SPI或预留扩展点。

### 4.3 Spring注册资源：`1 READ_ONLY_BASELINE`

`services/local-runtime/src/main/resources/META-INF/spring.factories`

只允许包含：

```properties
org.springframework.boot.env.EnvironmentPostProcessor=\
org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherEnvironmentPostProcessor
```

不得使用不存在的EnvironmentPostProcessor `.imports`约定，不得注册ApplicationListener、FailureAnalyzer或production auto-configuration。

### 4.4 Runner source：`6 READ_ONLY_BASELINE`

1. `scripts/release-canvas06-e2e-run.mjs`
2. `scripts/release-canvas06-e2e-run.test.mjs`
3. `scripts/verify-canvas06-common-visual-fixtures.mjs`
4. `scripts/canvas06-e2e-common-fixtures.test.mjs`
5. `scripts/verify-canvas06-e2e-report.mjs`
6. `scripts/verify-canvas06-e2e-report.test.mjs`
Common factory及16项映射只按Common Driver实现规格修改。Runner只允许增加challenge、raw SHA、命令组装、READY等待、INITIAL/REOPEN分支和进程证据；不得在本切片修改Report聚合、failure precedence或source set 23项Schema。

### 4.5 Java测试基线与受控E2E新增：`12 READ_ONLY_BASELINE + 2 A`

只读基线：

1. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherArgumentsTest.java`
2. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlanVerifierTest.java`
3. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/AttemptLocalE2EFaultPortTest.java`
4. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherConfigurationTest.java`
5. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherJarIT.java`
6. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultHookIntegrationTest.java`
7. `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultRecoveryIsolationTest.java`
8. `services/local-runtime/src/test/java/org/opm/localruntime/LocalRuntimeApplicationTest.java`
9. `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
10. `services/local-runtime/src/test/java/org/opm/localruntime/command/CandidateRevisionCommitterTest.java`
11. `services/local-runtime/src/test/java/org/opm/localruntime/assets/ProfilePackageAssemblerTest.java`
12. `services/local-runtime/src/test/java/org/opm/localruntime/storage/SqliteRevisionCommitRepositoryTest.java`

唯一允许新增：

1. `tests/e2e/release/dev-canvas-06/fault-launcher.controlled.spec.ts`
2. `scripts/canvas06-e2e-fault-launcher-controlled.test.mjs`

受控test/spec不进入Runner Source Set、不复制进production Report root，也不能冒充production evidence。

### 4.6 文档状态文件

实现任务只允许同步本规格checklist、Runner checklist、测试策略、开发执行包、冻结基线和`docs/README.md`。不得用状态文档扩展代码allowlist。

### 4.7 Clean Base Intake

base intake已接纳为：

```text
base_source_commit=0dcaa27a92693feaf28b731ebed2f81a9ccea02c
base_parent_commit=e598b305a44ebb9c9845c1f5563bc36c3a89a2b4
base_tree=ed8a3093e37a858a1a26f40c2c549ded9de8c4b8
base_committer_epoch=1787730276
base_patch_sha256=28d64b7cd68a1cd67a94086d61b1853f5fec3b14f37e5cc68ebd61e5ccd09ed9
base_worktree_clean=true
active_manifest_schema=0.2
active_attempt_schema=0.2
runner_input_owner=scripts/canvas06-e2e-run-input.mjs
runner_source_set=OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001/0.1
profile_digest_closure=v1.5
baseline_raw_refs_sha256=69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e
base_intake_status=READY
```

实施必须从该commit的fresh detached worktree或fresh branch checkout开始，修改前`git status --porcelain=v1 --untracked-files=all`必须为空。最终commit只允许两个`A`，不得amend base、修改36项、把当前dirty main整体提交或从其他checkout补bytes。若新增测试发现36项存在代码缺陷，必须输出`FAULT_LAUNCHER_BASELINE_DEFECT_DETECTED`并停止本包；只能新建独立bugfix规格/checklist，显式扩展allowlist、冻结新base和回归证据后修复，禁止mock、skip、动态patch或fallback绕过。

## 5. Spring启动与失败传播

### 5.1 两阶段Guard

1. `LocalRuntimeApplication.main(args)`在调用Spring前执行`E2EFaultLauncherArguments.scanRaw(args)`，只检查raw token的重复、未知、partial、profile/九项键shape与来源；检查成功不保存任何state，进程能进入Spring即构成raw scan已通过的唯一事实；
2. `E2EFaultLauncherEnvironmentPostProcessor`通过`spring.factories`加载，`getOrder()`固定返回`ConfigDataEnvironmentPostProcessor.ORDER + 1`；
3. PostProcessor在Config Data完成后检查完整`MutablePropertySources`，证明profile与九项键只存在于`commandLineArgs`，且YAML、system properties、system environment、JSON、test property或其他source均没有同名键；
4. PostProcessor再执行Plan path/raw/Schema/digest/identity/challenge验证；全部通过后创建不可变`E2EFaultPlanVerifier.VerifiedPlan`，并拒绝已存在同名source，再以唯一`MapPropertySource`名称`opmE2EFaultVerifiedState`、唯一key `opm.internal.release.e2e.verified-plan`保存该对象；禁止把它序列化为String、写入system property、static、ThreadLocal、文件或日志；
5. `E2EFaultLauncherConfiguration`只按source名称取得该对象，不做Environment宽泛key查找：source不存在时返回唯一`E2EFaultPort.NOOP`，source存在但对象缺失/类型不符时启动失败，类型正确时创建唯一`AttemptLocalE2EFaultPort`；该配置只声明一个`@Bean @ConditionalOnMissingBean(E2EFaultPort.class)`方法，不建立第二套active/default bean竞态；
6. Configuration不得重新读取Plan/challenge、重新解析命令行或补默认值。普通配置源即使伪造内部key也不能被消费；同名内部source只能由PostProcessor在本进程创建。

### 5.2 Fault Plan Schema验证Owner

本实现不新增通用JSON Schema依赖。`E2EFaultPlanVerifier`是Java侧唯一Fault Plan分支validator，执行顺序固定为：

1. 从当前Runtime JAR固定resource读取union Schema raw bytes，复算SHA并逐字等于`EXPECTED_SCHEMA_SHA256`；
2. 以Jackson strict duplicate detection解析Plan，拒绝BOM、CR、非法UTF-8、重复key、非object和非`object + LF` raw形状；
3. 顶层字段集合必须逐项等于`schema_id/schema_version/case_id/attempt_ordinal/fault_kind/target/trigger_count/nonce/plan_sha256/artifact_payload_sha256`，无缺失、无额外字段；
4. 逐项执行union Schema `$defs.faultPlan`的const、enum、integer、case ID regex和64位小写hex规则，禁止浮点、字符串整数、布尔或隐式类型转换；
5. 四个`oneOf` mapping逐项互斥；fault-enabled child只接受三个非NONE mapping且`trigger_count=1`，NONE mapping在后续schedule semantic阶段拒绝；
6. Schema shape通过后才进入payload/plan digest、Manifest schedule、nonce/challenge和drift检查。

Node/Ajv仍是活动Schema完整validator；`E2EFaultPlanVerifierTest`必须让三正例及`FL-N-006`的每个字段级反例同时经过Node/Ajv受控fixture和Java validator，断言accept/reject parity。该Java owner只承接Fault Plan分支，不得被表述为通用Draft 2020-12引擎，也不得复制到第二个Java类。

### 5.3 稳定失败

`E2EFaultLauncherException`固定携带`code/stage/caseId/attemptOrdinal/exitCode/reported`。raw scan或PostProcessor在抛出前使用UTF-8一次写入设计规定的stderr首行；`LocalRuntimeApplication`捕获`RuntimeException`后沿单一cause链由外到内查找首个`E2EFaultLauncherException`，以identity set拒绝cause环，只按`reported`决定是否补写并调用`System.exit(exitCode)`。未找到Fault Launcher异常时继续执行现有Golden Materializer异常查找；两者均未找到则原样重新抛出。禁止吞掉非launcher启动失败或让Spring默认exit `1`替代设计的`2/3/4`。

运行期protocol错误由`AttemptLocalE2EFaultPort`先写同一稳定行，再调用构造时注入的`IntConsumer terminator`；Spring配置唯一传入`Runtime.getRuntime()::halt`，单测传fake terminator。`AttemptLocalE2EFaultPort`必须实现Spring `DisposableBean`：`destroy()`执行第三次Plan drift复核和`actual_trigger_count==1`检查，通过才转为`VERIFIED_AT_SHUTDOWN`，失败写稳定行并`halt(3)`；禁止注册第二个JVM shutdown hook。产品故障注入不得halt：它们必须返回设计冻结的422/500/409。

## 6. Port与Recovery隔离

### 6.1 显式Context

`E2EFaultContext`固定为同文件内的sealed transport：`Disabled`单例只供NOOP路径使用且不包含/伪造业务identity；`Active`只能由非NOOP `E2EFaultPort.contextFor(command)`基于verified Plan、`CandidateRevisionCommand`、当前Profile binding和正式candidate构造，并包含设计冻结的十个字段。禁止`null`、ThreadLocal、static mutable context或由路径反推identity。传递路径和签名固定为：

```text
LocalApiService(e2eFaultPort)
  -> ProfilePackageAssembler(loader, e2eFaultPort)
  -> SqliteRevisionCommitRepository(databasePath, e2eFaultPort)
  -> CandidateRevisionCommitter(repository, assembler, e2eFaultPort)
CandidateRevisionCommitter.commit(command)
  -> context = e2eFaultPort.contextFor(command)
  -> RevisionCommitRepository.currentHead(modelId, context)
  -> ProfilePackageAssembler.assemble(binding, context)
  -> RevisionCommitRepository.commit(bundle, context)
```

`LocalApiService`的Spring构造器新增同一个`E2EFaultPort` bean并把对象identity逐层传递；既有一参/二参构造器保留并显式委托`E2EFaultPort.NOOP`。`ProfilePackageAssembler`、`CandidateRevisionCommitter`和`SqliteRevisionCommitRepository`既有构造器同样保留并委托NOOP，新构造器必须接收同一port实例。

`RevisionCommitRepository`新增带context的`currentHead(modelId, context)`与`commit(bundle, context)` default overload：只允许`Disabled`委托既有方法；收到`Active`却未被实现类override时必须稳定失败，禁止静默忽略。`SqliteRevisionCommitRepository`override两项带context方法；`RevisionCommitBundle`形状不变且不加入allowlist。非Spring Golden、Compatibility、Materializer和Recovery继续使用既有构造器和`Disabled`路径；不得改变公共HTTP wire。

### 6.2 三个最小Hook

1. `ProfilePackageAssembler`：Grammar与Rule加载成功后，取得exact `SYMBOL_ASSET` descriptor且调用`OplSymbolCatalogAssetLoader.load()`前调用`beforeSymbolAssetLoad(context, symbolRef)`；
2. `SqliteRevisionCommitRepository.currentHead(modelId, context)`：先从SQLite读取真实Head，再调用`projectCurrentHead(context, head)`；只允许返回同revision/sequence且`writable=false`的投影；
3. `SqliteRevisionCommitRepository.commit(bundle, context)`：同一事务内receipt/head复核后、`writeRevision()`前调用`beforeRevisionInsert(context)`。

Repository同时保留两个独立字段：`RecoverySqliteFaultPort recoveryFaultPort`与`E2EFaultPort e2eFaultPort`。构造顺序、类型、enum、context和调用点不得共享：E2E persistence hook在第一条INSERT前；Recovery hook仍只在既有`AFTER_* / BEFORE_HEAD_UPDATE`位置。

### 6.3 LocalApi映射

`LocalApiService.rejected()`唯一新增：

```text
READ_ONLY_REVISION -> ApiErrorCode.READ_ONLY_REVISION / HTTP 409 / retryable=false
```

既有`TEXT_GENERATION_BLOCKED`和`PERSISTENCE_FAILED`映射保持不变。不得新增OpenAPI code、DTO或HTTP字段。

## 7. Common Fixture、Catalog与Manifest重建

### 7.1 不可变边界

以下输入只读，不得原地修改：

- `tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json`历史`0.1.0`及其32个历史E2E bytes；
- `packages/**/handoff/releases/clean-37c5412a9c12/**`及其他既有`clean-*`；
- 既有fixed Handoff、Manifest和raw ref。

### 7.2 精确生成资产布局

以下是release生成输出，不进入第4章source commit。变量只允许按公式派生：

```text
SOURCE12 = lowerhex(new_clean_source_commit)[0:12]
INTAKE12 = lowerhex(sha256(raw READY Intake bytes))[0:12]
RELEASE_ROOT = packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-<SOURCE12>
COMMON_ROOT = <RELEASE_ROOT>/dev-canvas-06/common-fixtures/0.2.0
MANIFEST_ID = dev-canvas-06.e2e.<SOURCE12>.<INTAKE12>
MANIFEST_ROOT = <RELEASE_ROOT>/dev-canvas-06/e2e/manifests/<MANIFEST_ID>
```

Common builder必须从factory重新生成完整`43=1 Catalog+8 Visual+32 E2E+2 source mirror`文件树。按Common Driver设计`v1.0`，仅以下12个E2E fixture允许发生`expected_error_code`字段变化：

```text
e2e/E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED.base.json
e2e/E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED.input.json
e2e/E2E-CANVAS-006.STALE_TOKEN_BLOCKED.base.json
e2e/E2E-CANVAS-006.STALE_TOKEN_BLOCKED.input.json
e2e/E2E-CANVAS-007.ASSET_MISSING.base.json
e2e/E2E-CANVAS-007.ASSET_MISSING.input.json
e2e/E2E-CANVAS-007.REVISION_CONFLICT.base.json
e2e/E2E-CANVAS-007.REVISION_CONFLICT.input.json
e2e/E2E-CANVAS-007.PERSISTENCE_FAILED.base.json
e2e/E2E-CANVAS-007.PERSISTENCE_FAILED.input.json
e2e/E2E-CANVAS-007.READONLY.base.json
e2e/E2E-CANVAS-007.READONLY.input.json
```

Catalog固定为`<COMMON_ROOT>/dev-canvas-06-common-fixture-catalog.json`；它必须重算12项fixture raw ref、全部24项`factory_source_ref`及自身raw identity。Manifest固定为`<MANIFEST_ROOT>/dev-canvas-06-e2e-manifest.json`，必须为活动`0.2/0.2.0`，并把完整Common树逐byte复制到`<MANIFEST_ROOT>/inputs/common/`；Manifest中的Catalog ref和上述12项base/input ref必须只指向该副本。历史`0.1/0.1.0` builder、Manifest和已安装root不得作为活动输出或被改写。

活动producer/verifier唯一目标入口为`release-canvas06-e2e-manifest-v02.mjs`与`verify-canvas06-e2e-manifest-v02.mjs`，其独立实现规格与checklist已经冻结但代码尚未实现，因而只阻断第7.3节Manifest/release重建和最终完成态，不阻断第4至6章Fault Launcher Java Build；禁止以历史v01 builder替代。

### 7.3 原子顺序

1. 从第4.7节exact base的fresh clean worktree开始，只新增第4.5节两个`A`；36项raw ref必须逐项保持不变，Common factory映射必须已由上游Common Driver source commit闭合；
2. 运行第8章全部单元、slice、集成、forked-JAR和Node测试；
3. 形成新的clean source commit并记录exact source SHA/patch SHA；
4. 按既有Clean Handoff与Versioned Handoff重建规格，从该commit生成新的Runtime JAR、Evidence Bundle、versioned Handoff和READY Intake；
5. 在版本根外fresh staging中运行`build-canvas06-common-visual-fixtures.mjs`，生成新的43文件Common root；
6. verifier证明8个Visual bytes语义不变、10个非目标E2E case的20份bytes语义不变，只有六个case的BASE/INPUT共12个文件按Common Driver设计修正`expected_error_code`；factory mirror和Catalog raw SHA随源bytes重算；
7. Catalog保持`0.2.0`，重算12个fixture ref、24项factory ref及Catalog raw identity；禁止手工编辑Catalog；
8. 以新Handoff/Intake/Common root和已实现的活动v02 producer构建新的活动Manifest final root，重算Common tree、Catalog、12个case input/base ref、Runtime JAR、四个driver和source identity；禁止手工编辑Manifest或调用历史v01 builder；
9. production Manifest verifier先对staging执行，再以同父临时目录安装为新的`releases/clean-<source12>`，安装后重验；
10. fixed Handoff只按既有Postverify协议原子切换JSON；失败时回滚fixed JSON，新版本根保留隔离诊断，旧版本根始终不覆盖；
11. 完成上述顺序也只表示新production输入可用，不表示`194/388` Report或Gate READY。

任一步失败：后续Manifest/Report零提交，不得出现半更新Catalog、只更新fixture未更新ref、或新Manifest引用旧Common root。

## 8. 验证命令与矩阵

### 8.1 Java单元、Spring slice与Hook集成

```text
mvn -pl services/local-runtime -Dtest=E2EFaultLauncherArgumentsTest,E2EFaultPlanVerifierTest,AttemptLocalE2EFaultPortTest,E2EFaultLauncherConfigurationTest,E2EFaultHookIntegrationTest,E2EFaultRecoveryIsolationTest,ProfilePackageAssemblerTest,SqliteRevisionCommitRepositoryTest,CandidateRevisionCommitterTest,LocalApiServiceTest,LocalRuntimeApplicationTest test
```

必须覆盖：hex/HMAC、raw args、property source、Plan path/link/raw/Schema/digest、状态机、三hook、零事务增量、LocalApi 422/500/409和Recovery调用次数/位置不变。

### 8.2 Exact JAR与forked child

```text
mvn -pl services/local-runtime -am -DskipTests package
mvn -pl services/local-runtime -Dtest=E2EFaultLauncherJarIT test
```

Jar IT必须从`target/local-runtime-0.1.0-SNAPSHOT.jar`启动JDK21 child，证明：Schema resource与源Schema raw SHA一致；普通启动NOOP；完整tuple输出唯一READY；错误配置/Plan/challenge返回稳定首行和exit；不得用JUnit classpath代替成功JAR路径。

### 8.3 Common/Runner Node验证

```text
node --test scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
node --test tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.test.mjs scripts/canvas06-e2e-common-fixtures.test.mjs scripts/release-canvas06-e2e-run.test.mjs scripts/verify-canvas06-e2e-report.test.mjs
npm run release:canvas06:common-visual:test
npm run release:canvas06:e2e:runner:test
npm run release:canvas06:visual-e2e-schema:test
npm run contract:validate
```

### 8.4 Controlled E2E

```text
node scripts/canvas06-e2e-fault-launcher-controlled.test.mjs \
  --mode=preflight \
  --source-root=<exact clean 2A source root> \
  --candidate-source-commit=<40 lowerhex> \
  --manifest=<exact Manifest v02 final> \
  --controlled-bundle=<exact controlled bundle descriptor> \
  --runtime-jar=<attempt-local exact Runtime JAR> \
  --web-root=<production Web root> \
  --browser-root=<exact Playwright browser root> \
  --fixed-handoff=<absolute current fixed Handoff JSON> \
  --production-activation-root=<absolute read-only activation input root> \
  --attempt-parent=<fresh attempt parent> \
  --control-parent=<fresh control parent>
```

preflight必须先验证Bundle `0.2`和Preflight Descriptor `0.1`，再按活动闭包规格`FLCP-D01~D09、FLCP-D10A-GATE-PREFLIGHT`固定顺序验证十项依赖。任一依赖非READY时，stdout唯一为`RFC8785_JCS(report)+LF`，`status=BLOCKED_BY_DEPENDENCY`、`playwright_command=null`、exit=`3`，stderr首行为`E2E_FAULT_LAUNCHER_CONTROLLED_BLOCKED\tDEPENDENCY_PREFLIGHT`；且零Runtime/Web/Browser子进程、零SQLite、零attempt/control目录及零Manifest/Report/release写入。十项全READY时，report为`READY_TO_RUN`并给出唯一token数组：`node node_modules/@playwright/test/cli.js test tests/e2e/release/dev-canvas-06/fault-launcher.controlled.spec.ts --config=tests/e2e/release/dev-canvas-06/playwright.release.config.ts --workers=1 --retries=0`。READY只授权父Runner执行，不等于测试通过。Playwright还必须生成D10B的`1+12+1=14`项Gate Observation Artifact，任一漂移立即失败并停止后续cycle。

### 8.5 正反例矩阵

正例：

| ID | 层级 | 验收 |
| --- | --- | --- |
| `FLI-P-001` | unit | 三类Plan、HMAC和状态机确定性通过 |
| `FLI-P-002` | Spring slice | 零配置仅NOOP；完整tuple仅一个attempt port |
| `FLI-P-003` | Profile integration | ASSET_MISSING在Symbol load前返回422/TEXT_GENERATION_BLOCKED且资产bytes不变 |
| `FLI-P-004` | Repository integration | PERSISTENCE_FAILED在首条Revision INSERT前返回500并七项delta全0 |
| `FLI-P-005` | Repository/API | READONLY读取真实Head后投影false，返回409/READ_ONLY_REVISION且DB bytes不因注入改变 |
| `FLI-P-006` | forked JAR | READY、一次触发、正常shutdown计数闭合 |
| `FLI-P-007` | controlled E2E | 三类INITIAL产品结果与REOPEN不变性闭合 |

反例至少逐项覆盖设计`FL-N-001~016`，并追加：

| ID | 变量 | 结果 |
| --- | --- | --- |
| `FLI-N-017` | `spring.factories`缺注册或注册重复 | Jar IT失败，禁止形成实现完成证据 |
| `FLI-N-018` | JAR内Schema与源Schema raw SHA不同 | `E2E_FAULT_PLAN_SCHEMA_INVALID/2` |
| `FLI-N-019` | E2E port调用Recovery enum/hook或改变Recovery次数 | isolation test失败 |
| `FLI-N-020` | 仅改12个fixture但Catalog/Manifest ref未重算 | builder/verifier拒绝且final零提交 |
| `FLI-N-021` | 新Manifest引用旧Runtime/Common/versioned Handoff | production verifier拒绝 |

## 9. 完成定义

同时满足以下条件，才能把实现状态记为`IMPLEMENTED/CONTROLLED_VALIDATED`：

1. 第4章source delta逐项等于两个`A`，36项raw ref及集合摘要不变，无extra文件；
2. 第8.1~8.4所有非依赖阻断命令通过；controlled E2E不得跳过；
3. 三类产品错误、协议错误、一次性和零增量均有机器测试；
4. 普通/NONE/REOPEN与Recovery回归通过；
5. 新Common root、Catalog、Manifest按第7章在新不可变版本根闭合；
6. `git diff --check`、source clean与文档状态同步通过；
7. OpenAPI、SQLite DDL、production配置、公共HTTP wire和既有release root零变化。

未生成production `194/388`和READY Report时，`GATE-06-03`仍为`NOT_RUN`。

## 10. 回滚

1. 代码回滚只回退第4章两个新增文件，不改写36项base；
2. 新版本根已安装但未切fixed Handoff时，保持隔离且不激活；
3. fixed切换失败按Postverify既有backup恢复旧JSON；
4. 不删除、覆盖或改写任何旧`clean-*`、用户SQLite、Handoff evidence或Schema；
5. 回滚后普通Runtime必须重新证明零fault配置只装配NOOP。

## 11. 事实与非结论

事实：本文已冻结旧38个Fault Launcher逻辑路径的活动分类：36项为`0dcaa27...`中的只读raw-ref基线，只有两个controlled Playwright路径允许新增；Spring注册/顺序、verified-state传递、封闭Fault Plan validator、显式context构造链、Recovery隔离、三个hook、Common/Catalog/Manifest生成布局、重建顺序和分层验收均由base及活动设计承接。Common factory及其测试由独立Common Driver实现规格拥有。

事实：origin base已固定为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`，36项基线存在且只读；Preflight Descriptor contract实现和新clean base均未形成，因此2A Build为`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。四份新Schema、producer/verifier、新base、两个2A文件、2A final commit/patch SHA、真实preflight与Gate Observation、controlled Playwright结果均不存在；活动Manifest v02生产输入、真实`194/388` Report和`GATE-06-03` READY证据也未由本设计任务生成。

非结论：`FROZEN_FOR_IMPLEMENTATION`不等于Java代码、Spring装配、真实UI/API、production Report、Gate、发布或ISO完成。
