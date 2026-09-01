# Spec: GOLDEN-AUTHORING-03C Common Visual Materializer 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`IN_PROGRESS / NODE_ADAPTER_BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION / FAULT_HOOK_PARTIAL_NOT_ACCEPTED`

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-03C`：由 exact Runtime JAR 在 release-golden-authoring隔离profile下，以封闭Base/Clone/Web launch mode把02B的8个Common Visual Fixture分别物化为隔离SQLite V1 immutable base，写出可复核attestation，为72个Common capture的两个attempt创建144个fresh clone，并提供长驻Web Runtime、03B调用适配与`BLOCKED_FEEDBACK`唯一的一次性进程内fault hook。

本包不执行完整浏览器 capture，不生成 candidate、Authoring Report、Approval、approved version、Visual Manifest/Report 或 production Gate 证据。

## 2. 设计输入

唯一设计事实源为：

- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.10`；
- `specs/opm-dev-canvas-06-common-visual-adapter-and-one-shot-fault-contract-closure-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-clone-and-web-runtime-protocol-closure-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-adapter-controlled-java-profile-input-closure-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-adapter-test-input-builder-closure-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-runtime-jar-kind-and-planner-jdk-env-closure-bugfix-task-spec.md`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md` `v1.4`；
- `specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`；
- Common Visual Fixture `0.1/0.1.0`、Capture Plan `0.1/0.1.0` 和 SQLite V1；
- exact Runtime JAR、active binding 与 03A 已实现的 direct SQLite seed/clone/JCS 模式。

实现不得重新决定启动 guard、SQLite 表/顺序、ID、index、attestation、clone、fault hook、Projection、错误优先级、性能或 03B 调用边界。

## 3. 前置条件与依赖

1. 02B implementation checklist 全部通过，新 fixture/Catalog 能由只读 verifier 消费；
2. 全局开发门为 `READY_FOR_DEVELOPMENT`；
3. Java 21、exact Spring Boot Runtime JAR 和 SQLite V1 migration 可用；
4. 03A 的 `RuntimeActiveBindingProvider`、`ProjectDatabaseFactory`、RFC 8785 helper 和 clone verifier 只允许复用，不得改变其 Family 行为；
5. 02B已生成并验证`tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`；
6. 受控测试输入与 production authoring root 隔离，测试结果不得冒充 release evidence。
7. Clone Result与Runtime Ready两份`0.1/0.1.0` Schema由上述Clone/Web闭包规格冻结，producer和consumer必须消费exact schema bytes。
8. Node adapter只接受活动Adapter Request `0.2/0.2.0`；历史`0.1`不能进入production调用。
9. 受控03C测试只接受Adapter Test Input Bundle `0.1`及其installed verifier结果；不得手写Request、复用历史Plan或用部分Observed Result替代。

03B 必须保持 `BLOCKED_BY_DEPENDENCY`，直到本包和 02B checklist 都完成；依赖完成后也只恢复实现资格，不自动生成 production candidate。

## 4. 修改边界

允许修改：

- `services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/**`；
- `services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/**`；
- 为默认 no-op fault hook 和唯一 release-only injection point 所必需的 `storage/**` 或 `application/**` 最小修改及原有回归测试；
- 新增 `scripts/canvas06-common-visual-materialization.mjs` 及定向测试，作为 03B 唯一调用适配；
- `package.json` 中仅新增 03C 定向测试/验证入口，不新增依赖；
- 本规格、对应 checklist 和必要实现状态入口。

禁止修改：

- SQLite V1 DDL/Flyway migration、Revision/Profile/Rule/Grammar/Symbol；
- Common Fixture/Catalog/Capture Plan/Environment/Authoring Report 既有 Schema；
- 公共 HTTP API、Controller route、OpenAPI、Vue、默认 production 配置；
- 03A Family Materializer 的输入/报告/quarantine 语义；
- 03B candidate writer、Approval/Publisher、Visual Manifest/Runner；
- 现有 fixture/Catalog/Plan/release/approved bytes、Candidate、Activation、Capability 或 ISO 状态。

其中 Node adapter、受控测试输入Builder和one-shot fault的后继实现边界必须精确采用Adapter/Fault闭包规格第7节及测试输入闭包规格第11节的`19=8 M+11 A`；Clone CLI、Web Runtime、主入口生命周期和退出码owner只允许采用Clone/Web闭包规格第10节的职责路径。现有`VisualCommonFixtureMaterializer.java`、`VisualCommonMaterializerRunner.java`及其测试不属于Adapter/Fault的19项子切片，禁止借adapter/fault实现静默改写。

## 5. Runtime CLI 与装配

每个 base 的唯一 CLI 为：

```text
java -jar <exact-runtime.jar> \
  --spring.profiles.active=release-golden-authoring \
  --opm.runtime.mode=RELEASE_GOLDEN_COMMON_BASE \
  --opm.release.golden-authoring=true \
  --opm.release.visual-common-materializer=true \
  --spring.main.web-application-type=none \
  --opm.release.visual-common.fixture=<exact-fixture> \
  --opm.release.visual-common.storage-root=<new-empty-root> \
  --opm.release.visual-common.attestation-out=<fresh-path> \
  --opm.release.source-date-epoch=<same-integer>
```

Materializer只在profile、`RELEASE_GOLDEN_COMMON_BASE` mode、两个boolean、non-web和完整参数都来自command-line property source且精确匹配时装配。缺项、重复、非command-line覆盖、Web server配置或默认production启动均拒绝；不得注册controller、route、actuator/JMX写入口或监听端口。`release-golden-authoring`本身不再决定进程是否退出，生命周期只由封闭mode决定。

## 6. SQLite、Attestation 与 Clone

### 6.1 单 base 事务

1. 目标 subject root 和 attestation path 必须 fresh，storage root 必须为空且无 symlink；
2. 按 `SQLite V1 migration -> package rows -> project -> model -> revision -> head -> indexes -> staged verify -> COMMIT -> close -> read-only reopen` 唯一顺序执行；
3. Revision JCS bytes、binding、schema set、Project/Model/Revision identity、`generated_at`、主设计第4.2.1节空Text Artifact/Trace及第4.3/6.2节五类index entry逐字段/排序/固定ID时间状态/null/计数必须与fixture深度相等；
4. transaction、commit/reopen/integrity/FK/sidecar 任一失败回滚，只清理本次 fresh root；
5. 不走公共 API、随机 ID、普通 commit command 或 03A Family report pipeline。
6. base提交后必须复算`revision_document_count=1/text_artifact_count=1/text_trace_count=0`；`text_artifact_count`只统计`revision_document.document_json`中Schema-valid object，`text_trace_count`只统计`text_trace_index`行，禁止按Sentence或顶层数组计数。

### 6.2 Attestation

成功后原子写封闭 `attestation.json`：

```text
contract_version,subject_id,fixture_ref,project_id,model_id,revision_id,
database_ref,semantic_state_sha256,committed_projection_sha256,index_counts,
materializer_identity,source_date_epoch
```

03C verifier 必须复算数据库 raw ref、semantic state、committed Projection、identity/count、materializer JAR/source 和 epoch。Attestation 是内部受控 artifact，不是 Gate Report；Schema-like 校验通过不等于 release evidence。

### 6.3 Base 与 144 Clone

1. 先按 Catalog 顺序创建并验证 8 个 base，base 成功后只读；
2. 03B adapter 按 Plan capture 顺序、attempt `1,2` 创建 `72*2=144` 个 fresh clone；
3. clone 路径固定为 `<subject>/attempts/<capture-id>/<attempt>/storage`，只复制该 subject base storage；
4. clone 前后复算 base tree digest，Runtime 关闭后复算 attempt storage；
5. Runtime、Web process、browser context、view state 和 fault hook 不跨 attempt 复用；
6. 任一 base/clone失败阻断全部 Common authoring，禁止跳过或使用静态 screenshot 降级。

每个clone必须通过Clone/Web闭包规格第5节的packaged-JAR CLI执行并生成Schema-valid Clone Result，禁止Node直接复制、进程内调用、stdout结果或从目录名反推attempt。每个clone随后通过同规格第6节的`RELEASE_GOLDEN_COMMON_WEB`启动exact outer JAR，消费Clone Result和五项Profile资产并原子生成Runtime Ready；Node只有在PID、READY、readiness和bootstrap四项闭合后才能进入callback。

## 7. 一次性 Fault Hook

普通 Runtime commit path 新增独立`VisualCommonCommitFaultPort`，所有既有构造路径默认注入`NOOP`；只有 `BLOCKED_FEEDBACK` attempt 在 release authoring 受控启动中装配每进程唯一`OneShotVisualCommonCommitFaultPort`。固定启动值为：

```text
--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert
--opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed
--opm.release.visual-common.fault-max-invocations=1
```

三项必须与闭包规格第6.2节的完整Web command-line guard同时出现并 byte-for-byte 相等；Fault Configuration 接受七个固定Web identity/path key的存在和唯一来源，而Runtime Ready Writer唯一校验其具体值，只允许目标 subject/command。hook唯一调用顺序为`validation/text -> receipt/head recheck -> existing E2E hook -> Visual Common hook -> revision INSERT`；首个exact context原子触发一次 `PERSISTENCE_FAILED` 后永久禁用，第二次相同 command 走正常路径。其他 subject、Family、default/production Runtime、Visual validation runner 和 HTTP 请求不得装配或切换 hook。禁止通配符、环境变量覆盖、运行时 setter、公开 API、共享静态计数、复用`E2EFaultPort/RecoverySqliteFaultPort`和跨进程复用。

## 8. 03B 调用适配

`scripts/canvas06-common-visual-materialization.mjs`唯一生产导出固定为：

```js
export async function runCommonVisualMaterialization(request, captureCallback)
```

request必须通过Visual Common`v1.9`活动Adapter Request `0.2/0.2.0`；其`runtime_jar_ref.kind=LOCAL_RUNTIME_JAR`并与Handoff/Plan逐字段相等，physical staged JAR及Runtime Ready保持`RUNTIME_JAR`且只按raw identity闭合。callback invocation、callback observed result和normalized result继续通过三份`0.1/0.1.0`机器Schema。脚本CLI只允许Adapter/Fault闭包规格第5节四种单文件contract验证模式；生产03B只能静态ESM import，禁止dynamic callback、callback path、child process/stdout协议。该函数只承接以下固定职责：

1. 从 `Plan -> Catalog -> fixture exact ref` 派生 8 项，禁止 subject/fixture/Projection override；
2. 在创建base前验证Request `0.2`的exact Java 21 executable及Profile asset root/五raw refs/tree/package/binding，禁止PATH/父JAVA_HOME、checkout、env、目录扫描或fallback；测试Builder调用Planner时只可从exact Java父两级推导JDK root，并显式注入固定五键env；
3. 调用 exact Runtime JAR 创建 8 base并验证 attestation；
4. 对每个 capture/attempt 创建 fresh clone，生成正常 Runtime 启动参数；
5. 仅对 `BLOCKED_FEEDBACK` 注入第 7 章固定参数；
6. 按Plan Common capture原序、attempt`1,2`串行调用恰144次`captureCallback(invocation)`；每次返回必须通过Observed Result Schema及identity/Projection/focus/cell/fault深度join；
7. capture 后关闭 Runtime，校验 clone 结果和 base digest，再返回Schema-valid、三项JCS摘要闭合的 normalized result；
8. 不写 Environment、Authoring Report、candidate PNG、Approval、approved root 或 Manifest。

第4、7项不得自行选择端口或解析stdout：application/management固定loopback动态端口，Node按Runtime Ready发现端口；callback后固定SIGTERM/10秒，必要时SIGKILL并使attempt失败。关闭只接受`0/null`、`null/SIGTERM`，或唯一SIGTERM已成功发送且未SIGKILL时的JVM `143/null`等价观测，随后复核端口、SQLite sidecar、attempt tree和base digest。完整状态机只由Clone/Web闭包规格第6至9节承接。

调用顺序固定为：

```text
verify Request 0.2 Java/Profile -> Plan/Catalog/fixture/color mapping
-> build 8 immutable bases
-> verify 8 attestations
-> for each Common capture and attempt clone/start/setup/normalize/capture/close
-> verify all 144 results and base digests
-> return control to 03B candidate transaction
```

03C 的受控集成测试可用固定测试callback代替03B PNG writer，但该callback只能消费通过Bundle `0.1` installed verifier的144项descriptor并做exact lookup，不得通过CLI动态加载；不得 mock SQLite/Runtime read path、attestation、clone 或 fault hook。callback责任、输入/输出和禁止边界只由闭包规格第4节与测试输入闭包规格第8节承接。

## 9. 错误、原子性与退出码

首错优先级采用主设计：CLI/path/source owner -> Schema/source mirror/raw ref -> fixture payload -> Handoff/binding -> Runtime JAR -> color mapping -> target empty -> migration -> seed -> storage verify -> clone -> Runtime/Web ready -> UI setup -> Projection/focus/cell -> stability -> capture/determinism -> writer/internal。03C从已由02B verifier闭合的Catalog/fixture ref读取输入，不重新选择source，也不接收`--source-root`。

03C 必须实现并透传：`GOLDEN_COMMON_INPUT_INVALID/2`、`GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID/2`、`GOLDEN_COMMON_FIXTURE_REF_MISMATCH/2`、`GOLDEN_COMMON_MODE_REJECTED/2`、`GOLDEN_COMMON_BINDING_MISMATCH/3`、`GOLDEN_COLOR_PROFILE_MISMATCH/3`、`GOLDEN_COMMON_STORAGE_NOT_EMPTY/3`、`GOLDEN_COMMON_MIGRATION_FAILED/3`、`GOLDEN_COMMON_SEED_FAILED/3`、`GOLDEN_COMMON_STORAGE_VERIFY_FAILED/3`、`GOLDEN_COMMON_CLONE_FAILED/3`、`GOLDEN_COMMON_UI_SETUP_FAILED/3`、`GOLDEN_COMMON_PROJECTION_MISMATCH/3`、`GOLDEN_COMMON_INTERNAL_ERROR/4`。

adapter新增并透传：`GOLDEN_COMMON_ADAPTER_INPUT_INVALID/2`、`GOLDEN_COMMON_CAPTURE_CALLBACK_FAILED/3`、`GOLDEN_COMMON_CAPTURE_RESULT_INVALID/3`、`GOLDEN_COMMON_NORMALIZED_RESULT_INVALID/4`。首错、停止调度、关闭当前Runtime和零部分result语义以闭包规格第8节为准。

`GoldenFixtureMaterializationException.exitCodeFor`是唯一Java退出码owner，所有Common runner必须删除局部映射。`GOLDEN_COMMON_UI_SETUP_FAILED`经runner、Spring启动cause chain和packaged JAR主入口必须一致返回`3`；不得以默认分支返回`2`。

任何失败不得产生 READY Authoring Report、Environment、Approval、approved root 或 Manifest。已有路径、base、其他 attempt、03A storage 和用户数据不得删除、覆盖或修复；只允许清理本次创建且尚未提交的 fresh root。

## 10. 测试要求

### 10.1 条件装配与架构

- 完整 guard 唯一装配，逐项缺失/冲突/错误来源反例拒绝；
- GFM/Base/Clone三种non-web有限mode完成后退出，Common Web servlet mode在READY后长驻；
- Base/Clone authoring JAR零controller/route/port，Web mode只允许两个loopback动态connector；
- default/production/Web/03A 模式无 Common Materializer 或 fault hook；
- 普通 Runtime API、commit 和 03A Family 回归不变。

### 10.2 SQLite 集成

- 8 fixture分别验证Project/Model/Revision/Head、binding、Revision JCS/raw digest、固定时间、空Text Artifact摘要、`text_traces=[]`、固定`1/1/0`计数、五类index每列/顺序/null和Projection；
- migration/package/每类 row/commit/reopen/integrity/FK/sidecar 故障注入与 rollback；
- 非空、symlink、重复目标拒绝且原内容不变；
- attestation payload/ref/semantic state/identity/count 单变量篡改全部拒绝。
- Java `Rfc8785JsonCanonicalizer`只读消费02B同一parity vector，10项canonical JSON text/SHA与Node expected逐项相等；safe integer边界、UTF-16 key排序、lone surrogate及其他非法Java值拒绝，允许修正现有类但不得新增第二canonicalizer。

### 10.3 Clone 与 Fault

- `8/72/144`、路径、顺序、fresh clone、base digest 和双 attempt 隔离；
- 同 capture 两 clone互不影响，任一失败停止后续调度且已存在 base 不变；
- Clone Result与Runtime Ready Schema、payload摘要、identity/raw ref/nonce/PID/端口单变量篡改均拒绝；
- 两个OS动态loopback端口、30秒READY、health/bootstrap、SIGTERM/10秒/SIGKILL、端口与sidecar关闭矩阵通过；
- exact `BLOCKED_FEEDBACK` command 只失败一次，第二次正常；错误 subject/command/次数/默认模式全部拒绝或使用 no-op；
- 真实 UI setup/Projection 由后续 03B E2E 覆盖，本包验证 adapter 参数、Runtime状态和 normalized callback contract。
- 活动Request `0.2`及其余三份Schema正反例、Java/Profile单变量漂移与零输出、CLI四模式、静态导出、144次串行顺序、callback throw/reject/extra/missing/wrong identity和三项result摘要全部覆盖；
- Adapter Test Input Bundle Builder/Verifier必须生成fresh Profile 5、Common 44（含Common Setup Plan）、Plan 1242/72、Request `0.2`及144份完整Observed/PNG，并覆盖`LOCAL_RUNTIME_JAR` source exact join、staged raw join、derived JDK/Planner五键env、原子安装、installed reverify和零fallback负例；
- `GOLDEN_COMMON_UI_SETUP_FAILED`经runner、Spring cause chain和packaged JAR三条路径均返回exit `3`。

### 10.4 JAR 与性能

- 必须使用 Maven 产出的 exact Spring Boot JAR，不允许 exploded classpath 冒充；
- 受控 8 base全部 materialize/reopen，144 clone全部创建/验证；
- 单 base P95 `<=5 s`、8 项串行 `<=30 s`、单 clone加 ref复核 P95 `<=1 s`、额外 peak RSS `<=512 MiB`；
- 性能阈值属于 release tooling，不是 ISO 19450:2024 要求。

## 11. 验证命令

实现后至少执行：

```text
npm run release:canvas06:common-visual:test
npm run release:canvas06:common-visual:materialize:test
./mvnw -pl services/local-runtime test
./mvnw -pl services/local-runtime package
npm run contract:validate
npm run backend:verify
git diff --check
```

`runCommonVisualMaterialization(request, captureCallback)` 是唯一真实物化入口，只能由03B静态ESM import调用；它没有也不得新增生产物化CLI。`materialize:test`仅组合Adapter Test Input与Adapter定向测试，四种现有CLI仅可执行单文件机器契约验证。

## 12. 完成定义

release-only Java Materializer、8 base、attestation/verifier、144 clone、default no-op/一次性 fault hook、03B adapter、正反 JAR/SQLite/架构测试和性能全部通过，implementation checklist 记录 exact JAR/ref/计数/命令。完成后只可声明 `IMPLEMENTED/NOT_RELEASE_VALIDATED`；不得把受控 8/144 测试写成 production candidate、GATE READY、Capability enablement 或 ISO 证明。

## 13. 回滚

回滚删除 03C 新增 package、adapter、test/command 和默认 no-op injection point，并恢复被修改类的原行为。不得修改 SQLite V1、删除 03A/历史/approved/user storage，或通过关闭 guard、降低计数、共享 clone、禁用 fault test 来回滚失败。

## 14. 事实与假设

事实：Common Visual Fixture`0.1`及index/UI/source设计、活动Adapter Request `0.2`与其余三份adapter机器Schema、Adapter Test Input Bundle `0.1`、Clone Result/Runtime Ready两份机器Schema、四种launch mode、动态端口/READY/关闭协议和独立one-shot fault实现契约已冻结；当前工作树存在Common Visual Java Base/Clone/Web局部实现和未提交的`VisualCommonCommitFaultPort`链路字节，并已记录单个STATE_ROLES packaged-JAR验证。Adapter Test Input Builder/Verifier实现已出现，但Runtime source kind和Planner JDK环境尚未符合冻结修正，因此未接纳；Node adapter、fault hook、8 base/144 clone验收和完整03C checklist也尚未完成。假设：无；production exact JAR/Java/Profile refs、数据库ref、性能和authoring结果必须由未来实际执行产生。
