# Spec: DEV-CANVAS-06 Common Visual Clone CLI 与 Web Runtime Protocol 闭包 Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

设计状态：`CLONE_AND_WEB_RUNTIME_PROTOCOL_FROZEN`

实现状态：`PARTIAL_IMPLEMENTATION / CONTROLLED_SINGLE_CASE_PROOF_ONLY`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 `GOLDEN-AUTHORING-03C` 从 Node adapter 进入真实 `8 base/144 clone` 调度前的四个确定缺口：

1. Java clone只有进程内方法，没有受控 packaged-JAR CLI；
2. Web Runtime没有固定启动、loopback端口分配、READY与关闭协议；
3. `LocalRuntimeApplication`对任意`release-golden-authoring` profile启动都立即`SpringApplication.exit`，与Common servlet Runtime长驻要求冲突；
4. `GoldenFixtureMaterializationException.exitCodeFor`没有覆盖`GOLDEN_COMMON_UI_SETUP_FAILED/3`，通过主JAR异常路径会错误返回`2`。

本修正不实现Node adapter、Java CLI、Web Runtime或144次调度，不修改公共HTTP wire、SQLite DDL、Capture Plan、Common Fixture或既有四份Adapter/Callback/Result Schema。

## 2. Root Cause

Visual Common `v1.5`只冻结了`clone/start/setup/normalize/capture/close`逻辑顺序，既有Adapter/Fault闭包只冻结Node函数、callback和fault port。两份设计都没有给Java clone和servlet Runtime分配唯一可执行边界。

同时，现有主入口把Spring profile当作进程生命周期模式，未区分有限任务与长驻服务；Common runner局部维护退出码switch，主入口又使用全局switch，形成两个错误码owner。

## 3. Fix Strategy

1. 新增封闭`ReleaseGoldenAuthoringLaunchMode`，profile只表示隔离域，mode唯一决定进程生命周期；
2. Base、Clone、Web分别使用`RELEASE_GOLDEN_COMMON_BASE/CLONE/WEB`，既有Family Materializer继续使用`RELEASE_GOLDEN_FIXTURE_MATERIALIZE`；
3. Clone只通过exact Runtime JAR的non-web CLI执行并原子写Clone Result；
4. Web只通过exact Runtime JAR的servlet CLI执行，`server.port=0`由OS分配端口，Java以Runtime Ready文件公布实际端口；
5. Node adapter只消费两个Schema-valid artifact，不解析stdout/stderr、不扫描端口、不从目录名推断身份；
6. `GoldenFixtureMaterializationException.exitCodeFor`成为GFM与Common错误的唯一exit owner，runner禁止保留第二份映射。

## 4. 封闭 Launch Mode

`release-golden-authoring`下`opm.runtime.mode`必须恰为以下之一：

| Mode | Web type | 生命周期 | 退出条件 |
| --- | --- | --- | --- |
| `RELEASE_GOLDEN_FIXTURE_MATERIALIZE` | `none` | 有限任务 | 既有GFM runner完成 |
| `RELEASE_GOLDEN_COMMON_BASE` | `none` | 有限任务 | 1个base与attestation完成 |
| `RELEASE_GOLDEN_COMMON_CLONE` | `none` | 有限任务 | 1个clone与Clone Result完成 |
| `RELEASE_GOLDEN_COMMON_WEB` | `servlet` | 长驻服务 | Node请求SIGTERM或启动失败 |

`LocalRuntimeApplication`只能对前三个有限mode调用`SpringApplication.exit(context)`；`RELEASE_GOLDEN_COMMON_WEB`成功启动后禁止主动退出。profile存在但mode缺失/未知/重复，mode与web type不匹配，或多个Common子mode开关同时出现，必须在创建storage、监听端口和写artifact前以`GOLDEN_COMMON_MODE_REJECTED/2`失败。

普通启动、production、03A validation、E2E Fault与Recovery的profile/mode保持原语义。禁止通过profile名、某个可选property是否存在、环境变量、system property或默认值推断生命周期。

`ReleaseGoldenAuthoringCondition`与`ReleaseGoldenAuthoringGuard`必须按mode排除三个Common子mode，不能只检查`visual-common-materializer`单一property；Family GFM不得在Common Base/Clone/Web中装配。

## 5. Java Clone CLI

### 5.1 唯一命令

```text
<request.java_executable_ref.path> -jar <exact-runtime.jar> \
  --spring.profiles.active=release-golden-authoring \
  --spring.main.web-application-type=none \
  --opm.runtime.mode=RELEASE_GOLDEN_COMMON_CLONE \
  --opm.release.golden-authoring=true \
  --opm.release.visual-common.clone=true \
  --opm.release.visual-common.request-id=<request-id> \
  --opm.release.visual-common.capture-id=<capture-id> \
  --opm.release.visual-common.subject-id=<subject-id> \
  --opm.release.visual-common.attempt-ordinal=<1|2> \
  --opm.release.visual-common.base-root=<absolute-verified-base-root> \
  --opm.release.visual-common.base-attestation=<absolute-attestation.json> \
  --opm.release.visual-common.attempt-storage-root=<absolute-fresh-storage-root> \
  --opm.release.visual-common.clone-result-out=<absolute-fresh-clone-result.json> \
  --opm.release.source-date-epoch=<same-integer>
```

以上应用参数必须各出现一次并来自`commandLineArgs`。Java首token只能来自已验证Adapter Request `0.2`的`java_executable_ref.path`，其raw identity和major 21必须已闭合。禁止`--force`、覆盖project/database、复用attempt、相对路径、symlink、环境变量覆盖、stdout JSON、exploded classpath和任意额外`opm.release.visual-common.*`参数。

### 5.2 Clone唯一顺序

```text
mode/raw args
-> Runtime JAR与Java 21已由Node request前置验证
-> base root/attestation raw ref与identity验证
-> base无WAL/SHM且tree digest=attestation
-> attempt root fresh/empty/non-overlap
-> copy immutable base tree
-> clone database/raw SHA/integrity/FK/sidecar/identity验证
-> base tree digest复算不变
-> Clone Result临时文件写入、file fsync、no-replace rename、parent fsync
-> exit 0
```

任一失败不得留下final Clone Result；只允许清理本次创建且仍可证明归本进程所有的fresh attempt root，不得修改或清理base、其他attempt、approved或用户storage。

### 5.3 Clone Result `0.1`

唯一Schema：

```text
docs/contracts/schemas/opm-dev-canvas-06-common-visual-clone-result.schema.json
schema_id=OPM-DEV-CANVAS-06-COMMON-VISUAL-CLONE-RESULT-001
schema_version=0.1
result_version=0.1.0
status=READY_FOR_RUNTIME
```

结果固定绑定request/capture/subject/attempt、epoch、base attestation/database refs、base before/after tree digest、attempt database ref、attempt tree digest和payload digest。`attempt_storage_ref`在既有Normalized Result中唯一投影为Clone Result的`attempt_database_ref`；它表示attempt storage内的权威`project.db` raw ref，不表示目录可按普通file ref散列。

`result_payload_sha256=SHA-256(RFC8785_JCS(result去掉result_payload_sha256))`。

## 6. Web Runtime 启动协议

### 6.1 唯一命令

```text
<request.java_executable_ref.path> -jar <exact-runtime.jar> \
  --spring.profiles.active=release-golden-authoring \
  --spring.main.web-application-type=servlet \
  --opm.runtime.mode=RELEASE_GOLDEN_COMMON_WEB \
  --opm.release.golden-authoring=true \
  --opm.release.visual-common.web-runtime=true \
  --server.address=127.0.0.1 \
  --server.port=0 \
  --management.server.address=127.0.0.1 \
  --management.server.port=0 \
  --management.endpoints.web.exposure.include=health \
  --management.endpoint.health.probes.enabled=true \
  --opm.storage.root=<absolute-attempt-storage-root> \
  --opm.assets.root=<absolute-verified-profile-asset-root> \
  --opm.release.visual-common.request-id=<request-id> \
  --opm.release.visual-common.capture-id=<capture-id> \
  --opm.release.visual-common.subject-id=<subject-id> \
  --opm.release.visual-common.attempt-ordinal=<1|2> \
  --opm.release.visual-common.launch-nonce=<64-lowerhex> \
  --opm.release.visual-common.clone-result=<absolute-clone-result.json> \
  --opm.release.visual-common.runtime-ready-out=<absolute-fresh-runtime-ready.json>
```

Java首token和`opm.assets.root`只能分别来自已验证Adapter Request `0.2`的`java_executable_ref.path`与`profile_asset_root`。Node在启动前必须按受控输入闭包规格复核Java raw identity/major 21、Profile五资产raw refs/tree/package/binding、outer Runtime JAR raw SHA、Clone Result和attempt storage；禁止默认`PATH/父JAVA_HOME/packages/profiles`、checkout fallback或目录扫描。Builder为Planner注入的受控`JAVA_HOME`只能从exact Java推导，不属于默认或外部输入。`profile_asset_refs`完全复用活动Request的UTF-8 path升序，固定kind顺序为`GRAMMAR_ASSET/NORMALIZATION_DATA/PROFILE_PACKAGE/RULE_SET/SYMBOL_ASSET`；禁止按类型重新排序或建立第二套ref bytes。

### 6.2 端口分配

1. 应用端口固定传`server.port=0`，由OS在bind时分配；禁止Node预选、保留后释放、固定端口、范围轮询或失败重试换端口；
2. address必须为IPv4 literal`127.0.0.1`，禁止`localhost`、IPv6、wildcard和非loopback；
3. management固定显式`address=127.0.0.1`和独立`port=0`，health是唯一暴露endpoint且readiness probe显式启用；Runtime Ready分别记录应用和management实际端口；
4. 两个实际端口必须为`1..65535`且不同；任何非loopback connector或额外connector立即失败；
5. Node不得从日志、PID、目录名、默认配置或端口扫描推断端口。

### 6.3 Runtime Ready `0.1`

唯一Schema：

```text
docs/contracts/schemas/opm-dev-canvas-06-common-visual-runtime-ready.schema.json
schema_id=OPM-DEV-CANVAS-06-COMMON-VISUAL-RUNTIME-READY-001
schema_version=0.1
ready_version=0.1.0
status=READY
```

Java只能在以下条件全部满足后写READY：

1. command-line mode、identity、nonce、Runtime JAR、Profile五资产、Clone Result和attempt database复核通过；
2. Spring触发`ApplicationReadyEvent`；
3. application与management WebServer均已初始化且只绑定`127.0.0.1`动态端口；
4. storage只打开clone，base tree digest仍匹配；
5. fault mode与subject一致：`BLOCKED_FEEDBACK`装配一次性port，其余7 subject为NOOP。

Ready写入顺序固定为同目录temp、file fsync、no-replace atomic rename、parent fsync。已存在final/temp、写失败或identity漂移均不得覆盖，启动必须失败。

`ready_payload_sha256=SHA-256(RFC8785_JCS(ready去掉ready_payload_sha256))`。

### 6.4 Node READY 判定

Node使用单一30秒monotonic deadline、100ms固定poll。只有以下四项同时成立才可构造既有Capture Invocation `runtime_base_url`并调用callback：

1. child仍存活且PID等于Runtime Ready；
2. Runtime Ready通过Schema、payload SHA、nonce、request/capture/subject/attempt、JAR/clone/tree exact join，且五项Profile refs逐字段等于Request `0.2`、tree SHA等于Request `profile_asset_tree_ref.sha256`；其中Request/Handoff/Plan的Runtime source ref为`LOCAL_RUNTIME_JAR`，Runtime Ready仍为attempt-local `RUNTIME_JAR`，二者只比较raw `byte_length/sha256`，禁止比较或改写kind/path；
3. 对Ready记录的management base URL执行`GET /actuator/health/readiness`，必须无redirect、HTTP 200、JSON object且`status`逐字符等于`UP`；
4. 对application base URL执行`GET /opm-bootstrap.js`，必须无redirect、HTTP 200、media type为JavaScript，且现有四字段window binding wire shape与Runtime响应规则不变。

缺marker、child提前退出、超时、redirect、非200、错误media type、health非UP、bootstrap漂移或端口不可达统一为`GOLDEN_COMMON_UI_SETUP_FAILED/3`。禁止延长deadline、重启同attempt、换端口、使用stdout READY或降级为mock Runtime。

## 7. 关闭协议

callback返回或失败后，Node必须：

1. 停止后续HTTP/UI动作；
2. 对child发送一次SIGTERM并等待最多10秒；
3. 超时则发送SIGKILL，仅作为清理，当前attempt固定失败；
4. 确认child已退出、application与management端口均拒绝新连接；
5. 确认SQLite无WAL/SHM、attempt tree可复算、base before/after digest相等；
6. 仅在上述条件通过时写既有`runtime_shutdown_status=CLOSED`。

正常关闭接受Node观测到`exitCode=0`、`exitCode=null && signal=SIGTERM`，或在Node已成功发送本次唯一SIGTERM且未发送SIGKILL时观测到的`exitCode=143 && signal=null`。最后一种是JVM将已接收SIGTERM转换为进程状态码的受控等价观测，不得用于child自行退出、SIGKILL、重复信号或未发送SIGTERM的路径。其他exit/signal、端口残留、sidecar或base漂移均为`GOLDEN_COMMON_UI_SETUP_FAILED/3`。fault port关闭验证失败保持同一错误码并按首错保留。

## 8. 退出码唯一Owner

`GoldenFixtureMaterializationException.exitCodeFor`是GFM与Common materialization错误的唯一映射。`VisualCommonMaterializerRunner`、Clone Runner、Ready writer和Node adapter不得维护第二份Java switch。

Common映射固定为：

- input/schema/ref/mode/adapter input -> `2`；
- binding/color/storage/migration/seed/verify/clone/UI setup/projection/callback/result -> `3`；
- normalized result/internal -> `4`。

其中`GOLDEN_COMMON_UI_SETUP_FAILED`必须逐字符映射`3`。未知code仍为`2`，但必须有测试证明未知code不能由成功解析后的Common受控路径产生。

## 9. 首错与零证据边界

首错顺序更新为：

```text
request/CLI/mode/JAR/Java/Profile refs
-> base/attestation
-> clone
-> Clone Result
-> Web command/port bind
-> Runtime Ready
-> health/bootstrap
-> callback UI setup/Projection/capture
-> shutdown/port close/sidecar/base digest
-> normalized result
```

任一attempt失败停止后续调度，不返回部分Normalized Result，不生成READY Authoring Report、Environment、Approval、approved root、Visual Manifest或Gate证据。已完成base与较早attempt保留为诊断输入，但不得被消费为candidate成功结果。

## 10. 实现修改边界

后继实现只允许触碰以下职责路径；已有用户工作区字节不得覆盖或回退：

```text
services/local-runtime/src/main/java/org/opm/localruntime/LocalRuntimeApplication.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/GoldenFixtureMaterializationException.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringCondition.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringGuard.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringLaunchMode.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonFixtureMaterializer.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonMaterializerRunner.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCloneRunner.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonRuntimeReadyWriter.java
services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonRuntimeReadyConfiguration.java
services/local-runtime/src/test/java/org/opm/localruntime/LocalRuntimeApplicationTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/GoldenFixtureMaterializationExceptionTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/ReleaseGoldenAuthoringLaunchModeTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonFixtureMaterializerTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonMaterializerRunnerTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonCloneRunnerTest.java
services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/VisualCommonRuntimeReadyJarIT.java
scripts/canvas06-common-visual-materialization.mjs
scripts/canvas06-common-visual-materialization.test.mjs
package.json
```

既有Adapter/Fault闭包的fault、LocalApiService和Repository路径继续属于原`14=6 M+8 A`职责基线；Adapter测试输入Builder闭包另增`2 M+3 A`，后继实现总范围唯一扩为`19=8 M+11 A`。本修正不授权修改公共Controller、OpenAPI、application.yml、SQLite DDL/Migration、E2E/Recovery fault、Profile业务bytes、Vue或production配置。具体clean base、source patch SHA及19项逐文件raw ref必须由后继实现任务在提交前冻结；不得从当前dirty worktree推断。

## 11. 验收矩阵

1. Base/Clone/GFM完成后主进程按各自ExitCodeGenerator退出；Web mode在READY后保持存活；
2. profile相同但mode错配、重复、缺失和web type错配全部在端口/storage前拒绝；
3. Clone CLI成功、base漂移、非空attempt、symlink、sidecar、错误attestation、结果已存在及写失败正反例；
4. OS动态分配两个loopback端口，两个并发测试attempt不冲突；固定/非零应用端口、localhost/wildcard/IPv6、额外connector全部拒绝；
5. Ready marker的temp/rename/fsync、nonce/PID/端口/JAR/Profile/clone/tree/payload单变量篡改全部拒绝；
6. child提前退出、30秒超时、health非UP、redirect、bootstrap漂移、端口扫描/日志READY替代均拒绝；
7. 正常SIGTERM关闭、强停、端口残留、WAL/SHM、base漂移和fault未触发关闭验证覆盖；
8. `GOLDEN_COMMON_UI_SETUP_FAILED`经runner、Spring启动异常cause chain和packaged JAR三条路径均exit `3`；
9. 8 base、144 clone/Runtime严格串行，任一失败停止且无partial normalized result；
10. default Runtime、03A Family、E2E Fault、Recovery、公共HTTP wire和production配置回归不变。

## 12. 回滚、风险与非结论

回滚只移除本协议新增mode/runner/writer/test及Node调用，恢复活动设计前必须重新把03C置为`BLOCKED_BY_DESIGN`。不得通过恢复profile统一退出、固定端口、stdout READY、忽略health/bootstrap、删除失败root或把错误码改回`2`实现回滚。

事实：当前工作树已有Java Base/Clone/Web mode、Clone Result与Runtime Ready局部实现，并记录一个`STATE_ROLES` packaged-JAR Base -> Clone -> Web受控验证；该单例不等于Node adapter、8 base/144 clone或关闭矩阵验收。Adapter Request `0.2`已冻结Java/Profile权威输入及`LOCAL_RUNTIME_JAR` source identity，但consumer和测试Builder尚未按Runtime kind/Planner JDK env修正完成验收。假设：无。

非结论：本设计冻结不表示Node adapter、Clone CLI、Web Runtime、8 base、144 clone、PNG、candidate、Report、Gate、Capability、production或ISO符合性已经实现或验证。
