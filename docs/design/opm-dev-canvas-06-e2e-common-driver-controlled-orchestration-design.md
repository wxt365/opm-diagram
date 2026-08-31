# DEV-CANVAS-06 E2E Common Driver 与受控编排设计

文档版本：`v1.14`

文档状态：`FROZEN_FOR_IMPLEMENTATION`

适用版本：E2E Manifest `0.2/0.2.0`、Attempt Artifact `0.2`、E2E Report `0.2`

## 1. 目的

本设计关闭以下三个实现自由裁量点：

1. `DRIVER-COMMON` 对16个Common case的初始状态、页面动作、selector、API与错误码映射；
2. controlled bundle、活动Manifest、exact Runtime JAR、production Web dist与fresh attempt root之间的唯一信任和复制关系；
3. `INITIAL -> REOPEN`的进程、storage、事务基线和证据采集顺序。
4. Attempt `transaction-observation.before/after` 的唯一 SQLite 采样时点、cutoff和可执行CLI。

本设计不生成Manifest、Report、Gate、Candidate、Activation或Capability证据，不修改公共HTTP wire、SQLite DDL、产品默认配置或Recovery协议。

## 2. 已确认的冲突与修正决定

### 2.1 Manifest第四Driver冲突

活动Manifest Schema `0.2`的Common case要求`driver_id=DRIVER-COMMON`，但`driver_catalog`当前只允许三个Family driver。该Schema不能封闭证明Common driver source身份。

唯一修正：`driver_catalog`固定为四项、固定顺序：

```text
0 DRIVER-PROCEDURAL
1 DRIVER-CONTROL
2 DRIVER-STRUCTURAL
3 DRIVER-COMMON
```

第四项只包含`driver_id/source_ref`，`source_ref.kind=E2E_DRIVER_SOURCE`，`path=inputs/drivers/common-driver.mjs`。不得把Common driver藏入Family driver、Runner source ref、fixture factory或checkout fallback。

### 2.2 历史Common输入不足

历史Common BASE/INPUT只包含identity与expected result，不包含可复核初始图、页面动作或selector。因此：

- 历史`0.1.0` Catalog与32个fixture保持只读；
- 活动`0.2.0` Catalog仍承接base/input raw ref、事务和REOPEN结果；
- 动作语义唯一由`common-driver.mjs`内的冻结`COMMON_CASES`常量承接，并由Manifest第四driver raw ref锁定；
- Materializer只建立本节定义的`M0`最小初始模型；`SETUP`阶段通过真实产品API/UI建立case前置状态，完成后才采集事务基线；不得把SETUP计入subject事务。

### 2.3 错误码修正

活动Common输入按下列口径重建：

```text
AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED -> 无HTTP错误；UI_BLOCKED_AMBIGUOUS
STALE_OPTION_BLOCKED                -> DOMAIN_REJECTED
STALE_TOKEN_BLOCKED                 -> REVISION_CONFLICT
MISMATCHED_TOKEN_BLOCKED            -> DOMAIN_REJECTED
ASSET_MISSING                       -> TEXT_GENERATION_BLOCKED
TEXT_BLOCKED                        -> DOMAIN_REJECTED
REVISION_CONFLICT                   -> REVISION_CONFLICT
PERSISTENCE_FAILED                  -> PERSISTENCE_FAILED
READONLY                            -> READ_ONLY_REVISION
```

`AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED`的`expected_error_code`必须省略；其余八个BLOCKED case必须与上表逐字相等。该决定取代Fault Launcher实现规格中“除三个fault case外其他Common业务字段不变”的旧限制；只允许按本表修正错误码/空码，不改变case ID、case顺序和事务模板。

### 2.4 Attempt 摘要 preimage 闭包

活动 Attempt Artifact `0.2` 的 `semantic_comparison_digest` 必须排除证据路径。`assertion_results[]` 在 artifact 中仍保留完整 `evidence_refs[]`，但摘要 preimage 中唯一允许的投影为同序的：

```text
assertion_results = [{assertion_id, status}]
```

不得把 `evidence_refs`、attempt ordinal、PID、端口、时间或路径放入该 preimage。该规则取代历史 Attempt Artifact 设计中“包含 assertion results”可能被解释为包含完整对象的宽泛表述；producer 与 verifier 必须调用同一 owner，attempt 1/2 只允许证据路径不同而语义摘要相同。

`browser-environment.environment_fingerprint` 的唯一版本化 preimage 为：

```text
{
  schema_id: "OPM-DEV-CANVAS-06-E2E-BROWSER-ENVIRONMENT-FINGERPRINT-001",
  schema_version: "0.1",
  node_version,
  playwright_version,
  chromium_version,
  browser_executable_sha256,
  launch_args,
  viewport,
  zoom_id,
  locale,
  timezone,
  color_scheme,
  reduced_motion,
  web_server_source_sha256,
  web_dist_sha256
}
```

`environment_fingerprint=SHA-256(UTF8(JCS(preimage)))`。三个 SHA 字段分别来自同 artifact 对应 raw/tree ref 的 `sha256`；`launch_args` 保留实际冻结顺序，`viewport` 保留封闭四字段对象。case、attempt、origin、端口、文件 path/length、PID、时间和临时目录不得进入 fingerprint。

### 2.5 Attempt Snapshot Java CLI

`API-TXT-001` 的公共 wire 只包含简化 `sentences/traces`，不包含 `OplGoldenArtifactCanonicalWriter` 重建所需的完整 token、grammar、rule 和 fact 输入。Runner 禁止据此自行发明 OPL/Trace/Token writer。唯一补充入口固定为 exact Runtime JAR 内的：

```text
org.opm.localruntime.releaseevidence.E2EAttemptSnapshotCli
```

唯一命令参数为：

```text
--guard RELEASE_E2E_SNAPSHOT_ONLY
--storage <attempt-root>/storage
--project-id <exact materialized project>
--model-id <exact materialized model>
--context-id <exact materialized context>
--revision-id <待观测 revision>
--profile-asset-root <attempt-root>/profile/assets
--fixture-materialization <attempt-root>/fixture-materialization.json
--projection-response <attempt-root>/api-exchanges/<raw response>.json
```

CLI 必须验证全部路径参数绝对、规范化、同属一个 attempt root且均非链接；从 materialization 的 `project_db_ref/profile_asset_refs/materializer_identity.runtime_jar_ref` 逐 byte复核不可变base SQLite、五项 direct Profile 和当前 nested code-source外层JAR，再按第2.8节从已验证`project_id`与`ProjectDatabaseFactory(<attempt-root>/storage)`唯一推导working SQLite。它只能用规范绝对working数据库路径构造 `file:` URI并追加唯一查询参数 `immutable=1`，同时启用 Xerial `READONLY` open mode和连接内 `PRAGMA query_only=ON`；连接前后working `project.db-wal/project.db-shm/project.db-journal` 均必须不存在，禁止普通文件URL、可写open mode、删除sidecar或连接后再调用`Connection.setReadOnly(true)`。它从working连接取得指定 Revision document，使用 `SemanticRevisionReader + ProfilePackageAssembler + OplTextGenerationService` 重建完整 OPL/Token/Trace；Projection只从已保存的 exact `API-CTX-002` raw response读取并验证`meta.read_revision/data.context_id`。

stdout 唯一成功 bytes 为现有 Attempt Artifact Schema `$defs.stateDigests` 的 JCS JSON加一个LF；stderr必须为空，禁止日志、提示或路径。CLI不写文件、不启动Spring/HTTP、不修改SQLite、不读checkout、不接受环境变量/fallback。参数/shape/ref/revision错误为`E2E_INPUT_INVALID/2`，JAR/Profile raw identity错误为`E2E_ENVIRONMENT_MISMATCH/3`，其他失败为`E2E_UNEXPECTED_RUNTIME_ERROR/4`。Runner与verifier分别独立调用同一CLI；Runner不得把stdout当作独立发布artifact或绕过已有Artifact Index。

### 2.6 Attempt Snapshot Node bridge

Runner owner 唯一调用接口固定为：

```text
buildE2eAttemptSnapshotCommand({
  prepared_attempt,
  java_executable,
  attempt_identity,
  revision_id,
  projection_response_ref
}) -> { command, cwd }

runE2eAttemptSnapshot(<同一输入>) -> Promise<StateDigests>
```

`projection_response_ref`必须是当前attempt内已落盘的`API_RESPONSE_BODY`单链接普通文件，且raw length/SHA与传入ref逐字段相等。Node只能以`PropertiesLauncher`从`<attempt-root>/inputs/build/local-runtime.jar`启动第2.5节CLI；不得使用classpath目录、其他JAR、环境变量、checkout或Node摘要实现。子进程最长120秒，stdout最多4096 bytes，成功必须`exit=0`、无signal、stderr为零bytes，且stdout逐byte等于`JCS($defs.stateDigests)+LF`。五个字段必须恰好为`revision_document_sha256/projection_sha256/opl_sha256/token_sha256/trace_sha256`且均为小写SHA-256。

非零退出、signal、timeout或输出超限统一映射为`E2E_ORCHESTRATION_PROCESS_FAILED/3`；`exit=0`但stderr非空、stdout非规范UTF-8/JCS、字段缺失/额外或digest不合法，统一映射为`EVIDENCE_TRANSACTION/4`。stdout只在内存中消费，不写独立artifact；Projection raw response继续由API Exchange与Artifact Index持有。

### 2.7 Transaction Snapshot Java CLI 与 Node bridge

SETUP与subject在同一个INITIAL Runtime进程内连续执行，不能在两者之间启动第二个Runtime、直接读取活动WAL、根据Manifest期望delta反推before，或新增公共/test-only HTTP。V1 Revision、Parent、Trace、Finding、Operation和Receipt均以不可变Revision identity闭合，因此唯一采样方式固定为：INITIAL Runtime正常停止且端口释放后，从最终SQLite按两个已验证Revision cutoff重建as-of快照。

唯一Java入口为exact attempt-local Runtime JAR内的：

```text
org.opm.localruntime.releaseevidence.E2ETransactionSnapshotCli
```

唯一参数为：

```text
--guard RELEASE_E2E_TRANSACTION_SNAPSHOT_ONLY
--storage <attempt-root>/storage
--project-id <materialized project>
--model-id <materialized model>
--before-revision-id <RUN_SETUP取得的subject_baseline_revision>
--after-revision-id <INITIAL subject终态的actual head revision>
--fixture-materialization <attempt-root>/fixture-materialization.json
```

CLI必须复用第2.5节的attempt/materialization/outer Runtime JAR/base raw SQLite校验、第2.8节working路径推导和working数据库的`immutable=1 + READONLY + query_only`零sidecar连接。它先取得before/after Revision的`revision_sequence`，要求两者属于同一model、`before_sequence <= after_sequence`，再要求`model_head`恰好为after Revision/sequence且该model是project内唯一目标。两个Snapshot分别按`revision_sequence <= cutoff_sequence`计算：

```text
revision_document_count = revision_document行数
revision_parent_count = revision_parent JOIN revision_document行数
text_artifact_count = 对每个cutoff内document_json先以SemanticRevisionReader验证完整Revision，
                      再统计raw text_artifact为object的行数
text_trace_count = text_trace_index JOIN revision_document行数
finding_count = finding_index JOIN revision_document行数
operation_count = operation_record.result_revision_id JOIN revision_document行数
receipt_count = idempotency_record.result_revision_id JOIN revision_document行数
draft_head_revision_id = cutoff revision id
head_sequence = cutoff sequence
```

所有JOIN必须同时限制`revision_document.model_id=<model-id>`；`operation_record`还必须限制`project_id/model_id`，Receipt通过非空`result_revision_id`连接。禁止按时间、command/API次数、目录、expected_transaction或`after-before`反推任一count。stdout唯一为`JCS({before:<countSnapshot>,after:<countSnapshot>})+LF`，上限4096 bytes，stderr为空；错误码与第2.5节一致。

Runner唯一接口固定为：

```text
buildE2eTransactionSnapshotCommand({prepared_attempt,java_executable,attempt_identity,before_revision_id,after_revision_id}) -> {command,cwd}
runE2eTransactionSnapshot(<同一输入>) -> Promise<{before,after}>
```

Node必须执行同一个attempt-local JAR并复核stdout的`before/after`字段各自恰好为活动Attempt Artifact `0.2`既有`$defs.countSnapshot`；不得新增同义`transactionSnapshot`定义。CLI输出只在内存中消费，由`createTransactionObservation()`计算observed delta并写正式artifact，不新增独立发布文件。非零进程结果映射`E2E_ORCHESTRATION_PROCESS_FAILED/3`，成功进程的非规范输出映射`EVIDENCE_TRANSACTION/4`。

### 2.8 Materialized base 与 working SQLite 身份闭包

活动 Attempt Artifact `0.2` 的 `storage` 唯一形状增加以下字段，历史`0.1` bytes保持只读：

```text
storage_root = "storage"
materialized_base_root = "storage/materialized-base"
project_db_ref.path = "storage/materialized-base/projects/<project_id>/project.db"
working_project_db_path = "storage/projects/<project_id>/project.db"
working_clone_byte_length = project_db_ref.byte_length
working_clone_sha256 = project_db_ref.sha256
```

`project_db_ref`只证明Materializer完成时的不可变base bytes，`kind=PROJECT_DB`。它不得再指向Runtime会修改的working数据库。working路径不是raw ref：SETUP和subject提交后其bytes预期变化，任何consumer都不得拿`project_db_ref.sha256`校验最终working bytes，也不得更新、覆盖或重写`fixture-materialization.json`。

Materializer唯一顺序为：在`materialized_base_root`内完成migration/seed/verify并关闭全部连接与sidecar；以同一`project_id`通过`ProjectDatabaseFactory`分别计算base与working路径；要求working目标此前不存在；将base复制到working同目录临时单链接普通文件，`fsync(file) -> atomic rename -> fsync(directory)`；重新打开两个文件执行raw length/SHA比较并要求相等；最后才允许working上的Projection/OPL/Trace回读和Materialization artifact原子写入。禁止hardlink、reflink身份假设、copy-on-write身份假设、先写artifact后clone或从目录扫描选择数据库。任一步失败按既有Materializer失败边界删除整个本attempt `storage`和artifact，不保留半成品。

Runner在Materializer退出后、启动Runtime前必须独立复核：base raw ref、两个固定路径、base/working不同file identity、working单链接普通文件、零sidecar，以及working raw length/SHA仍等于`working_clone_*`和base ref。此后working可变，base永久只读。State/Transaction Snapshot Support持续逐byte验证base ref，但只从working数据库读取业务状态。

最终Report verifier必须分别验证：base路径与raw ref未漂移、base `quick_check=ok`/FK=0/seed时间闭合；working路径由identity唯一推导、零sidecar、`quick_check=ok`/FK=0，且Project/Model/Head与最终attempt证据闭合。它禁止比较最终working SHA与base SHA。base drift、working缺失、路径互换、两路径相同、clone声明不等或非法sidecar均固定为`E2E_FIXTURE_MISMATCH/3`；Snapshot调用时同类输入错误保持`E2E_INPUT_INVALID/2`。

### 2.9 Runtime cycle ownership nonce 闭包

活动`runtime-process.cycles[].parent_nonce`统一定义为Runner在spawn前为该cycle生成的32-byte随机进程所有权nonce。INITIAL与REOPEN各生成一次且必须不同；它们分别绑定该cycle的command、child handle、PID、health、termination和log refs。普通INITIAL与全部REOPEN不把该值注入Runtime配置；Runner通过同一child handle从spawn到stop的父进程证明持有它，禁止从PID、端口、路径、时间或Fault Plan派生。

三个Fault case的INITIAL是唯一附加join：`runtime-process.cycles[0].parent_nonce == fault-plan.nonce == fault launcher parent nonce`。其REOPEN仍使用新的普通cycle nonce，禁止复用Fault nonce、challenge或fault profile。非Fault case的Fault Plan `nonce`只承担Plan artifact identity，不得强制等于INITIAL cycle nonce。

`createRuntimeProcess({caseId,attemptOrdinal,cycles})`只接受两个同序cycle，要求两个`parent_nonce`均为lowerhex SHA-256形状且互不相同，不再接收单一`planNonce`参数。`reopen-observation.initial_process_nonce/reopen_process_nonce`必须逐字段复制这两个cycle值；Runtime Process ref也必须指向同attempt已写入的exact artifact。producer/verifier分别执行上述Fault conditional join和两cycle差异校验。该口径取代历史Attempt Artifact中“每个parent_nonce等于当前plan nonce”的宽泛表述。

### 2.10 Java/Chromium execution ref 与 evidence mirror

Controlled Invocation Context `0.1`中的`java_executable_ref/browser_executable_ref`继续描述实际执行文件，path必须是规范绝对路径。它们不能直接进入Attempt Artifact的相对`fileRef`。Context producer在发布Context raw bytes前必须先在同一Report staging root原子写入并回读以下全局mirror：

```text
inputs/runner/toolchain/java/<java-sha>/java[.exe]
inputs/runner/toolchain/java/<java-sha>/java-version.txt
inputs/runner/toolchain/java/<java-sha>/release
inputs/runner/toolchain/chromium/<browser-sha>/chromium[.exe]
```

Java三项语义、kind和`image_payload_sha256`继续严格复用E2E Runner实现规格第6.1节及Report `0.2` Schema。Chromium mirror kind固定为`E2E_BROWSER_EXECUTABLE_MIRROR`；它只保存实际可执行文件raw bytes，不从App bundle、目录tree、Playwright cache或basename搜索推导。两个mirror目录名分别等于原始执行ref SHA，目标文件必须此前不存在、单链接、非链接、逐byte相等并原子提交。Java source必须可执行，`java -version`必须exit 0、stdout零bytes、stderr证明major 21；`release`只允许从`<java-home>/release`固定位置读取。Chromium source同样必须可执行。

Context Schema不新增mirror字段：路径完全由已签入Context的两个SHA和上述公式唯一决定，避免第二个可选ref形状。Playwright child在登记Context前必须重新验证原始source和全部mirror raw bytes；Session在每次attempt前再次验证。`runtime-process.java_ref`固定使用Java mirror ref，`browser-environment.browser_executable_ref`固定使用Chromium mirror ref，禁止绝对path、attempt-local临时副本或checkout ref。任一source/mirror/version/release drift为`E2E_INVOCATION_CONTEXT_REF_MISMATCH/3`，且不得开始新的attempt。

### 2.11 Runtime、Browser cycle 机器证据闭包

Runner在每个cycle创建sink时生成唯一Browser Context ID，固定格式为：

```text
browser-context.<initial|reopen>.<64位小写十六进制CSPRNG>
```

ID必须在`attachBrowserPage(page)`前生成；attach时必须从`page.context().browser().version()`读取真实版本并精确等于`143.0.7499.4`。INITIAL与REOPEN的ID必须不同，两个cycle观测到的版本必须相同。ID不得由case、attempt、PID、端口、时间、目录或Manifest摘要派生。REOPEN sink必须保存`verifyReopen()`实际取得的完整`StateDigests`，Session只能从已完成proof的sink读取`browser_context_id/browser_version/reopen_state`，不得从预期值回填。

Runtime spawn前记录`started_at`并创建cycle nonce；spawn成功后立即同时监听stdout/stderr。每条流最多接受`1,048,576` bytes，零bytes也必须写入对应raw log；超限、监听错误或日志原子写入失败统一为`EVIDENCE_TRANSACTION/4`。Runtime停止并取得child close结果后记录`stopped_at`，`termination`只按真实`exitCode/signalCode`分类为`NORMAL/SIGNAL/EXIT_CODE`，不得把Runner发送的`SIGTERM`伪装为NORMAL。

`waitRuntimeReady()`只返回最终三次连续、解析后`status=UP`的health sample；每项`ordinal=1..3`，`observed_at`在对应HTTP响应完成解析后生成。任何非UP或不可达观测都清空当前连续序列，未达到三次即退出或超时不得写成功cycle。

`normalized_command[]`从实际spawn参数逐项投影，唯一规则为：执行Java替换为`java_ref.path`，attempt-local Runtime JAR及参数内attempt路径替换为Report相对路径，外置challenge路径固定替换为`<PROCESS_CONTROL_CHALLENGE>`，challenge response固定替换为`<HMAC_SHA256>`，其余非路径参数保持原字节顺序。结果中禁止保留绝对路径、环境变量展开值或checkout路径。`runtime_jar_ref`必须指向同attempt的`inputs/build/local-runtime.jar`，两个log ref必须是Report相对路径`attempts/<case>/<ordinal>/stdout|stderr/<cycle>.log`。

### 2.12 Network 与 Console 观测闭包

Network collector在每个cycle的Page attach时注册，按Playwright `request`事件分配attempt内连续`sequence`；REOPEN从INITIAL最后序号继续，禁止按API Exchange序号、URL排序或完成顺序重排。同源HTTP(S) URL规范化为`pathname+search`，且只允许当前production Web origin；其他origin保留去除fragment后的绝对URL并标记`REJECTED`。`resource_type`只按Playwright资源类型固定映射为Schema大写枚举，未知值为`OTHER`。

同源API response完成后，Network项的`request_body_ref/response_body_ref/operation_id/revision`必须逐字段复用同一个API Exchange capture；不得第二次读取、重序列化或另写body。非API静态资源的body ref、operation和revision均为`null`。response缺失的`requestfailed`项固定`status=null/failure_code=NETWORK_REQUEST_FAILED`。同源正常HTTP(S)为`ALLOWED`；外源请求、WebSocket、Service Worker、Download和Popup一律`REJECTED`并分别累加counter。有效matched attempt五个counter必须全部为0，且全部request为`ALLOWED`。

Console collector与Network collector同生共灭，INITIAL/REOPEN共享attempt内连续事件序号。`console.error/console.warning/pageerror/dialog/download/popup`分别映射Schema枚举；消息不保存正文，只计算`SHA-256(UTF8(String(message)))`，`source_ref=null`。上述事件全部为`REJECTED`；零事件写空数组。任何异步采集首错、confirm后迟到事件或未完成capture继续使用Browser proof/Evidence首错边界，不允许丢弃事件后生成matched artifact。

### 2.13 Attempt Observation assertion 与字段提取闭包

活动Manifest的194项case只允许以下10个`assertion_id`，顺序必须逐项等于对应case的`assertion_ids[]`，Schema、producer和verifier均不得接受未知、缺失、重复或重排：

```text
REVISION_COMMITTED
TRANSACTION_MATCHED
PROJECTION_MATCHED
TEXT_TRACE_MATCHED
ERROR_CODE_MATCHED
TRANSACTION_ZERO
HEAD_UNCHANGED
PROJECTION_UNCHANGED
REVISION_OR_BLOCKED_MATCHED
REOPEN_MATCHED
```

INITIAL在完成SETUP并绑定`subject_baseline_revision`后、调用Driver前，必须先通过正式`API-CTX-002/API-TXT-001/API-VER-001`和第2.6节exact Runtime JAR Snapshot bridge采集唯一`subject_before_state`。采集完成后的API Exchange序号才是`subject_exchange_start`。不得把Materializer base摘要当作subject before：Control和部分Common SETUP已合法推进Head，二者可能不同。`ADVANCE_HEAD`是唯一允许重绑subject baseline的precondition：其正式提交成功后、后续UI subject命令前，sink必须立即以新Revision重采三类API和Snapshot，原子替换`subject_before_state/subject_transaction_baseline_revision`；Transaction before和Attempt `base_revision`必须使用重绑后的Revision。其他precondition不得重绑或替换before。Driver完成后按同一方式采集`subject_after_state`；REOPEN继续采集`reopen_state`。

subject command只从INITIAL的`exchanges[subject_exchange_start..]`选择`operation_id=API-EDT-002/method=POST`。仅`ADVANCE_HEAD` precondition的exact `exchange_ref`必须排除；`SUBMIT_TEXT_BLOCKED_COMMAND`和`SUBMIT_READONLY_COMMAND`本身就是subject command，不得排除；request mutation的最终UI POST仍是subject command。`AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED`必须为零条，其余193项必须恰好一条。SETUP、candidate、Projection/Text/Revision读取和REOPEN请求均不得作为subject command。

Attempt字段唯一提取规则如下：

| 字段 | 唯一输入 |
| --- | --- |
| `base_revision` | 实际`subject_transaction_baseline_revision`；普通case等于SETUP bound revision，`ADVANCE_HEAD`等于其正式提交的新Revision |
| `head_revision` | `subject_after_state.revision_id`，并等于Transaction after Head和Reopen Head |
| `committed_revision` | subject response `.meta.committed_revision`；不存在写`null` |
| `command_id` | subject raw request `.command_id`；无subject command写`null` |
| `option_id` | subject raw request `.payload.selected_option_id`；字段不存在写`null` |
| `impact_token_id` | subject raw request `.payload.impact_token`；字段不存在写`null` |
| `top_error_code` | subject raw response `.error.code`；成功或无subject command写`null` |
| `detail_error_code` | 固定`null`；活动公共`ErrorEnvelope`没有独立detail code wire，禁止从Manifest期望、message、locator或规则引用反推 |
| before/after/reopen五组摘要 | 三个实际StateDigests的`revision_document/projection/opl/token/trace`逐字段复制 |
| `transaction` | `transaction-observation.observed_transaction` |

每类assertion的判定和证据refs固定为：

| Assertion | PASS条件 | `evidence_refs[]`固定顺序 |
| --- | --- | --- |
| `REVISION_COMMITTED` | 唯一subject response为`200/COMMITTED`，`committed_revision=head_revision`，Transaction为Manifest提交事务 | subject request、subject response、Transaction Observation |
| `TRANSACTION_MATCHED` | Transaction `matches=true` | Transaction Observation |
| `PROJECTION_MATCHED` | before/after Projection摘要不同，after/reopen相等 | before Projection response、after Projection response、Reopen Observation |
| `TEXT_TRACE_MATCHED` | before/after的OPL或Trace至少一项不同，且after/reopen的OPL/Token/Trace全相等 | before Projection response、after Projection response、Reopen Observation |
| `ERROR_CODE_MATCHED` | 唯一subject response的HTTP状态与`.error.code`等于CaseExecution冻结期望 | subject request、subject response、API Exchange Index |
| `TRANSACTION_ZERO` | 八项observed transaction为零/false且`matches=true` | Transaction Observation |
| `HEAD_UNCHANGED` | Transaction before/after Head ID和sequence均相等 | Transaction Observation |
| `PROJECTION_UNCHANGED` | before/after的Revision document、Projection、OPL、Token、Trace五摘要全相等 | before Projection response、after Projection response、Transaction Observation |
| `REVISION_OR_BLOCKED_MATCHED` | PASS按`REVISION_COMMITTED+TRANSACTION_MATCHED`；BLOCKED按期望错误或唯一AMBIGUOUS零command分支，同时满足`TRANSACTION_ZERO+HEAD_UNCHANGED+PROJECTION_UNCHANGED` | 有subject时subject request、subject response，随后Transaction Observation；AMBIGUOUS仅Transaction Observation |
| `REOPEN_MATCHED` | 新process、新Browser context且after/reopen四组摘要全相等 | Runtime Process、Reopen Observation |

所有evidence ref必须是当前attempt内已落盘文件的Report相对raw ref，不允许统一指向API Index、引用`attempt-observation.json`自身或用路径占位。producer从上述条件计算每项`PASS|FAILED`；全部PASS时，expected `PASS/BLOCKED`分别得到`PASS_MATCHED/BLOCKED_MATCHED`，否则为`FAILED`。`observed_status/status`必须相等。verifier独立读取raw request/response并重算，不信任producer结果。

### 2.14 Artifact Index 完整文件闭包

`artifact-index.json`最后写入。输入必须恰好包含：10个核心JSON、Materializer五个`profile_asset_refs`、一个`PROFILE_ASSET_TREE`虚拟目录项、Runtime Process引用的INITIAL/REOPEN共四个stdout/stderr raw log，以及API Exchange Index和precondition引用的全部动态API raw refs；存在真实Failure Artifact时才允许追加该项。`inputs/**`和`storage/**`是受控运行输入/工作区，不进入Index，其余attempt普通文件必须逐项被Index覆盖。

核心capture phase固定为：Fault/Materialization=`MATERIALIZE`，Runtime/Browser=`RUNTIME`，Network/Console/Transaction/API Index=`ACTION`，Reopen=`REOPEN`，Attempt Observation=`FINALIZE`。INITIAL日志为`RUNTIME`，REOPEN日志为`REOPEN`；Profile tree/资产为`MATERIALIZE`；API raw refs为`ACTION`。JSON与Profile资产media type为`application/json`，log为`text/plain`。所有项`required=true`、path唯一、UTF-8严格升序；Index不得覆盖、索引自身或遗漏实际文件。

活动verifier必须先按raw bytes复核全部refs，再执行：核心文件名/identity、Profile tree、四日志到Runtime Process、API refs到Exchange/Precondition、Assertion evidence到Index的exact join。Materializer只证明base Head；Attempt最终Head必须与Transaction after、subject after和Reopen一致，不得强制等于Materializer base Head。`reopen_matches`只存在于Reopen Observation，Attempt Observation通过五组摘要独立复算，不新增同义字段。

### 2.15 Revision document digest 与 Report 投影修正

第2.13节的`PROJECTION_UNCHANGED`固定包含Revision document摘要，因此Attempt Observation `0.2`必须新增并强制以下三个字段：

```text
revision_document_before_sha256
revision_document_after_sha256
revision_document_reopen_sha256
```

三者分别逐字段复制subject before、subject after和REOPEN `StateDigests.revision_document_sha256`，并纳入`semantic_comparison_digest`版本内preimage。producer与verifier计算`PROJECTION_UNCHANGED`时必须同时比较Revision document、Projection、OPL、Token、Trace五组摘要，不得只比较四个既有字段或信任producer的assertion状态。

E2E Report仍保留`attempts[].reopen_matches`投影字段，但其唯一来源是Attempt Observation上述五组after/reopen摘要逐项相等；Report builder和verifier禁止读取不存在的`attempt-observation.reopen_matches`。Reopen Observation自己的`reopen_matches`继续独立闭合Projection、OPL、Token、Trace四组及新process/context证明。

## 3. Driver机器常量

### 3.1 顶层形状

`common-driver.mjs`必须导出且只导出以下执行入口和只读常量：

```text
COMMON_DRIVER_ID = "DRIVER-COMMON"
COMMON_DRIVER_VERSION = "0.2.0"
COMMON_CASES = Readonly<Record<case_id, CommonCase>>
executeCase({ page, case_entry, attempt_identity, observation_sink, precondition_client }) -> Promise<void>
```

`COMMON_CASES`必须恰好16项，与活动Common Catalog同序且无额外case。`executeCase`只能按exact `case_id`索引，不得由case名称片段、suite、expected status或fixture内容猜测动作。

### 3.2 CommonCase封闭字段

每项固定字段：

```json
{
  "case_id": "E2E-CANVAS-...",
  "initial_state": "M0|M_OBJECT|M_STATE|M_STATE_SUPPRESSED|M_OBJECT_PROCESS|M_STATE_OBJECT_PROCESS|M_FACT|M_DELETABLE_STATE|M_READONLY_TARGET",
  "setup_steps": [],
  "subject_steps": [],
  "expected_apis": [
    {
      "operation_id": "API-EDT-001|API-EDT-002",
      "method": "GET|POST",
      "ordinal": 1,
      "expected_http_status": 200,
      "expected_error_code": null
    }
  ],
  "expected_transaction": "TX_COMMIT_1|TX_NO_COMMIT",
  "reopen_assertion": "REOPEN_COMMITTED|REOPEN_UNCHANGED"
}
```

`expected_apis[]`长度只允许`1|2`，每项`additionalProperties=false`，并与`subject_steps`中的`WAIT_API`按出现顺序一一对应；`operation_id/method/ordinal`逐字段相等。`expected_http_status`是整数且只允许`200|409|422|500`，`expected_error_code`只允许`null|DOMAIN_REJECTED|REVISION_CONFLICT|TEXT_GENERATION_BLOCKED|PERSISTENCE_FAILED|READ_ONLY_REVISION`，具体组合以第5章表格为准。`REVERSE_DRAG_NORMALIZED`恰有两项，依次为`API-EDT-001/GET/1/200/null`和`API-EDT-002/POST/1/200/null`；其余15个case各恰有一项。`PRECONDITION_API`自身产生的exchange进入独立API artifact，不进入`expected_apis[]`，也不得改变对应`WAIT_API`的ordinal。字段缺失、额外字段、未知枚举、case顺序不等或常量可变，均为`E2E_DRIVER_MAPPING_INVALID/3`。

### 3.3 初始状态

`M0`由Common Materializer写入空业务模型、root Context、base Revision及可读空Projection；其他状态只能由SETUP在同一attempt storage中从`M0`建立：

| 状态 | SETUP完成后的固定语义 |
| --- | --- |
| `M_OBJECT` | 一个可编辑Object `object.common.owner` |
| `M_STATE` | `M_OBJECT`加State `state.common.subject`，名称`draft`，角色`INITIAL` |
| `M_STATE_SUPPRESSED` | `M_STATE`且当前Context中的State presentation为`SUPPRESSED` |
| `M_OBJECT_PROCESS` | Object `object.common.input`与Process `process.common.action` |
| `M_STATE_OBJECT_PROCESS` | `M_OBJECT_PROCESS`加State `state.common.subject`，Owner为`object.common.input`，名称`draft`，角色`INITIAL` |
| `M_FACT` | `M_OBJECT_PROCESS`加基础Fact `fact.common.subject` |
| `M_DELETABLE_STATE` | `M_STATE`且DELETE_CONSTRUCT capability返回enabled与有效impact token |
| `M_READONLY_TARGET` | `M_OBJECT_PROCESS`；只读性由Fault Launcher对真实head投影，不写seed标志 |

SETUP只能调用exact Runtime JAR的正式`API-EDT-001/002`，不得直写SQLite、调用test controller、修改Vue store或伪造Projection。SETUP完成后必须重新读取Workspace/Projection/Text/Revision并写`setup-baseline.json`，随后Runner才开始事务delta计数。

### 3.4 Common Setup Plan闭包

Common Setup Plan `v0.1`、Schema、44文件Common输入根、Manifest `common_setup_plan_ref`、builder/verifier及Runner SETUP executor已经闭合。Plan按16项Manifest原序冻结`initial_state -> 有序正式 API-EDT-001/002 -> Projection/Text/Trace/Revision baseline`，并以Catalog、Common Driver和active binding exact join；Runner不得回退到case名称、fixture目录、产品默认值、checkout读取、Vue store或SQLite直写。

缺失、raw ref漂移、case重排、候选不唯一、命令响应非COMMITTED、Projection/Text/Trace或revision list不闭合时，仍分别以`E2E_ORCHESTRATION_COMMON_SETUP_PLAN_MISSING`、`E2E_COMMON_SETUP_PLAN_REF_MISMATCH`、`E2E_COMMON_SETUP_PLAN_INVALID`或SETUP evidence错误fail-closed。该闭包只解除Common SETUP设计阻断，不等于完整Attempt Artifact、真实`194/388`、Report或Gate证据。

## 4. Selector与Step词汇

### 4.1 Selector

仅允许三类selector：

```text
T(id)       = page.getByTestId(id)
X(targetId) = page.locator('[data-cell-id="' + cssEscape(targetId) + '"]')
R(role,name)= page.getByRole(role,{name,exact:true})
```

禁止CSS class、中文自由文本模糊匹配、XPath、坐标点击、`.first()`/`.nth()`、sleep和基于DOM顺序的selector。`X()`必须先从已验证Projection取得exact target ID，再要求locator唯一可见；不得用X6内部随机cell ID。

### 4.2 八类Subject Step

`subject_steps`只允许以下八类封闭JSON对象；每项`additionalProperties=false`，字段必须与对应形状完全相等：

```json
{"type":"CLICK_TEST_ID","test_id":"<non-empty>"}
{"type":"CLICK_CELL","target_id":"<exact projection target id>"}
{"type":"FILL_TEST_ID","test_id":"<non-empty>","value":"<string>"}
{"type":"SET_ROLE","role":"INITIAL|DEFAULT|FINAL","checked":true}
{"type":"SUBMIT_TEST_ID","test_id":"<non-empty>"}
{"type":"CLICK_ROLE","role":"button|checkbox|tab","name":"<exact accessible name>"}
{"type":"WAIT_API","operation_id":"API-EDT-001|API-EDT-002","method":"GET|POST","ordinal":1}
{"type":"PRECONDITION_API","kind":"ADVANCE_HEAD|REPLACE_OPTION_ID|REPLACE_IMPACT_TOKEN|SUBMIT_TEXT_BLOCKED_COMMAND|SUBMIT_READONLY_COMMAND","source_observation_ref":"<attempt内既有API observation id>"}
```

`SET_ROLE.checked`必须是JSON boolean，允许`true|false`；示例中的`true`不是常量，`STATE_CREATE_RENAME_ROLES`的`INITIAL=false`必须原样保留。`SET_ROLE`唯一selector为`T(p03-state-candidate|p03-state-inspector) + R(checkbox,role)`。`WAIT_API.ordinal`按同一subject内相同`operation_id+method`从`1`开始连续计数，禁止跳号。表5中的缩写必须机械展开成上述JSON后写入`COMMON_CASES`；表内断言属于expected observation，不得伪装成第九类step。

每步等待条件固定为：locator唯一且稳定两个animation frame；动作后等待指定API响应与Projection refresh完成。禁止固定毫秒sleep。`REPLACE_OPTION_ID/REPLACE_IMPACT_TOKEN`只改写下一条匹配的正式产品请求；`ADVANCE_HEAD`先提交独立正式命令再重置subject baseline；`SUBMIT_TEXT_BLOCKED_COMMAND/SUBMIT_READONLY_COMMAND`各发送一次由已验证Projection、binding和活动Manifest输入构造的正式`API-EDT-002`请求。其原始request/actual request/response必须进入API artifact，不能改写产品代码或绕过公共HTTP wire。

## 5. 16 Case精确映射

缩写：`C(id)=CLICK_CELL`、`T(id)=CLICK_TEST_ID`、`F(id,v)=FILL_TEST_ID`、`B(name)=CLICK_ROLE(button,name)`、`W(op,m,n)=WAIT_API`、`P(kind)=PRECONDITION_API(kind,最近一个已验证API observation ref)`。`TX_COMMIT_1`固定为`1/1/1/1/0/1/1/true`；`TX_NO_COMMIT`固定为八项全零且`draft_head_changed=false`。表中的UI、API和REOPEN文字均为必须写入assertion artifact的expected observation，不是自由文本提示。

| Case | 初始状态 | Subject页面序列 | 预期API/错误 | 事务 | REOPEN |
| --- | --- | --- | --- | --- | --- |
| `E2E-CANVAS-001.STATE_CREATE_RENAME_ROLES` | `M_STATE` | `C(state.common.subject) -> F(p03-state-inspector-name,ready) -> SET_ROLE(INITIAL,false) -> SET_ROLE(DEFAULT,true) -> SET_ROLE(FINAL,true) -> B(保存 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`UPDATE_STATE`；SETUP创建State，subject只计一次rename/roles提交 | `TX_COMMIT_1` | `REOPEN_COMMITTED`，名称和三角色exact匹配 |
| `E2E-CANVAS-001.STATE_EXPLICITNESS_EXPANSION` | `M_STATE_SUPPRESSED` | `C(object.common.owner) -> T(p03-suppressed-state-state.common.subject) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`STATE_EXPLICIT`；按钮身份来自`API-CTX-002.data.suppressed_states`，不得伪造Occurrence | `TX_COMMIT_1` | `REOPEN_COMMITTED`，presentation=`EXPLICIT` |
| `E2E-CANVAS-001.STATE_MOBILE_CREATE_REOPEN` | `M_OBJECT` | `C(object.common.owner) -> T(p03-tool-state) -> C(object.common.owner) -> F(p03-state-name,mobile-ready) -> SET_ROLE(INITIAL,true) -> B(创建) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`CREATE_STATE`；viewport=`VP-390X844` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State可见且不溢出画布 |
| `E2E-CANVAS-001.STATE_TEXT_TRACE_ROUNDTRIP` | `M_STATE_OBJECT_PROCESS` | `C(state.common.subject) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1) -> T(p03-tab-text) -> T(p03-opl-sentence)` | `API-EDT-002/200/null`，`CREATE_FACT`；Fact端点必须包含State及其Owner | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State/owner/OPL/Trace/selection digest匹配 |
| `E2E-CANVAS-005.REVERSE_DRAG_NORMALIZED` | `M_OBJECT_PROCESS` | `C(process.common.action) -> T(p03-tool-procedural-relation) -> C(object.common.input) -> T(p03-relation-resolve) -> W(API-EDT-001,GET,1) -> T(p03-relation-option-CAP-ISO-PROC-002) -> W(API-EDT-002,POST,1)` | `API-EDT-001/200`后`API-EDT-002/200/null`，`CREATE_FACT`；endpoints必须按option规范化 | `TX_COMMIT_1` | `REOPEN_COMMITTED`，方向与endpoint ordinal匹配 |
| `E2E-CANVAS-005.AMBIGUOUS_OPTIONS_NOT_AUTOCOMMITTED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-procedural-relation) -> C(process.common.action) -> T(p03-relation-resolve) -> W(API-EDT-001,GET,1)` | `API-EDT-001/200/null`；UI结果`UI_BLOCKED_AMBIGUOUS`、option数`>=2`、`API-EDT-002 POST`调用数`0` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-005.STALE_OPTION_BLOCKED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-procedural-relation) -> C(process.common.action) -> T(p03-relation-resolve) -> P(REPLACE_OPTION_ID) -> T(p03-relation-option-CAP-ISO-PROC-001) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-006.STATE_IMPACT_CONFIRMED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`DELETE_CONSTRUCT/STATE` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，State不存在且Trace闭合 |
| `E2E-CANVAS-006.FACT_IMPACT_CONFIRMED` | `M_FACT` | `C(fact.common.subject) -> T(p03-fact-delete-impact) -> B(删除关系) -> W(API-EDT-002,POST,1)` | `API-EDT-002/200/null`，`DELETE_CONSTRUCT/FACT` | `TX_COMMIT_1` | `REOPEN_COMMITTED`，Fact不存在且Text/Trace闭合 |
| `E2E-CANVAS-006.STALE_TOKEN_BLOCKED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> P(ADVANCE_HEAD) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/409/REVISION_CONFLICT` | `TX_NO_COMMIT`相对于advance后的subject baseline | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-006.MISMATCHED_TOKEN_BLOCKED` | `M_DELETABLE_STATE` | `C(state.common.subject) -> T(p03-state-delete-impact) -> P(REPLACE_IMPACT_TOKEN) -> B(删除 State) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.ASSET_MISSING` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/TEXT_GENERATION_BLOCKED`；Fault=`ASSET_MISSING` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.TEXT_BLOCKED` | `M_OBJECT_PROCESS` | `P(SUBMIT_TEXT_BLOCKED_COMMAND) -> W(API-EDT-002,POST,1)` | `API-EDT-002/422/DOMAIN_REJECTED`；request固定引用活动Manifest input、真实binding和不满足文本前置规则的候选，不启用Fault Launcher | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.REVISION_CONFLICT` | `M_OBJECT_PROCESS` | `P(ADVANCE_HEAD) -> C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/409/REVISION_CONFLICT` | `TX_NO_COMMIT`相对于advance后的subject baseline | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.PERSISTENCE_FAILED` | `M_OBJECT_PROCESS` | `C(object.common.input) -> T(p03-tool-consumption) -> W(API-EDT-002,POST,1)` | `API-EDT-002/500/PERSISTENCE_FAILED`；Fault=`PERSISTENCE_FAILED` | `TX_NO_COMMIT` | `REOPEN_UNCHANGED` |
| `E2E-CANVAS-007.READONLY` | `M_READONLY_TARGET` | `P(SUBMIT_READONLY_COMMAND) -> W(API-EDT-002,POST,1)` | `T(p03-readonly-banner)`唯一可见、`T(p03-tool-consumption)`唯一且disabled；`API-EDT-002/409/READ_ONLY_REVISION`；Fault=`READONLY`只影响head projection | `TX_NO_COMMIT` | `REOPEN_UNCHANGED`且REOPEN不启用fault |

### 5.1 Selector前置缺口

当前产品实现尚缺下列稳定test id，Common driver实现不得以临时selector绕过：

```text
p03-state-inspector-name
p03-state-inspector
p03-fact-delete-impact
p03-suppressed-state-<stable-state-id>
```

这些test id只增加可测试身份，不改变视觉、公共API或业务行为；其实现必须由Runner/前端后继切片的精确allowlist授权。缺任一selector时Common driver Build状态为`BLOCKED_BY_UI_SELECTOR`，不能用class、文本模糊匹配或坐标替代。

`p03-suppressed-state-<stable-state-id>` 的数据源只能是 `API-CTX-002.data.suppressed_states`。清单项固定为 `state_id/owner_ref/name_or_value/state_roles/explicitness=SUPPRESSED`；画布节点仍必须不存在。按钮提交 `STATE_EXPLICIT` 后重新读取 Projection，目标必须从 `suppressed_states` 消失并以真实 State occurrence 出现在 `constructs`。

### 5.2 STALE_TOKEN口径修正

当前Runtime先校验base head，再校验impact token。因此`ADVANCE_HEAD`后真实首错固定为`REVISION_CONFLICT`，不得把该case继续写成`DOMAIN_REJECTED`。如未来要单独证明过期impact token，必须提供不改变head的版本化token时效机制并新增case/Schema版本，不能重解释本case。

## 6. Controlled Orchestration接口

### 6.1 唯一入口

Runner内部新增纯编排owner：

```text
prepareControlledAttempt({
  controlled_bundle_root,
  manifest_root,
  manifest_path,
  profile_asset_root,
  report_staging_root,
  case_entry,
  attempt_ordinal,
  java_executable,
  browser_executable,
  runtime_port,
  web_port
}) -> PreparedAttempt
```

不新增`--runtime-jar`或`--web-dist-root`覆盖参数。两者唯一来源是已验证Manifest final root：

```text
runtime source = <manifest_root>/<source_build.local_runtime_jar.path>
web source     = <manifest_root>/<source_build.web_dist.path>
```

controlled bundle只证明Intake/Handoff/Evidence Bundle上游身份，不承载或覆盖Runtime JAR、Web dist、Profile asset、driver或attempt输出身份。

### 6.2 PreparedAttempt

输出固定为不可变对象：

```text
attempt_root=<report_staging_root>/attempts/<percent-case-id>/<attempt_ordinal>
runtime_jar=<attempt_root>/inputs/build/local-runtime.jar
web_dist=<attempt_root>/inputs/build/web-dist
profile_assets=<attempt_root>/profile/assets
driver_source=<attempt_root>/inputs/drivers/common-driver.mjs
storage=<attempt_root>/storage
initial_runtime=<attempt_root>/process/initial
reopen_runtime=<attempt_root>/process/reopen
```

`attempt_root`必须在调用前不存在；父目录存在且为空闲。编排器排他创建root，拒绝symlink/hardlink/special file、existing/residual、跨report路径和相同case/ordinal重复调用。

### 6.3 唯一顺序

```text
VERIFY_CONTROLLED_BUNDLE
-> VERIFY_MANIFEST_0.2_AND_PROFILE
-> VERIFY_SOURCE_REFS
-> CREATE_FRESH_ATTEMPT_ROOT
-> COPY_RUNTIME_JAR_AND_REVERIFY_RAW_REF
-> COPY_WEB_DIST_AND_REVERIFY_TREE_REF
-> COPY_PROFILE_AND_DRIVER_AND_REVERIFY
-> MATERIALIZE_M0_IN_FRESH_STORAGE
-> START_INITIAL_RUNTIME
-> START_PRODUCTION_WEB
-> START_FRESH_CHROMIUM
-> EXECUTE_SETUP
-> CAPTURE_SUBJECT_BASELINE
-> EXECUTE_SUBJECT
-> CAPTURE_INITIAL_ARTIFACTS
-> STOP_BROWSER_WEB_RUNTIME
-> START_FRESH_REOPEN_RUNTIME_WEB_BROWSER_ON_SAME_STORAGE
-> EXECUTE_REOPEN_ASSERTION
-> CAPTURE_REOPEN_ARTIFACTS
-> STOP_AND_VERIFY_NO_LISTENER
-> VERIFY_ATTEMPT_ARTIFACT_0.2
```

Runtime、Web server、Chromium在每个attempt都必须是新进程；REOPEN再新建第二组进程，但只读同一attempt storage。不得复用进程、browser context、cookie、cache、service worker或端口listener。

### 6.4 Production Web

Web server只能从attempt-local exact `web-dist`提供静态/SPA内容并同源代理exact Runtime；禁止Vite、HMR、源码编译、目录列表、网络下载和checkout fallback。启动成功必须同时证明：

- `index.html` raw SHA属于Manifest web tree；
- 页面加载的每个静态资源均在tree ref中；
- 所有请求仅到`127.0.0.1:<web-port>`，API只经同源代理到`127.0.0.1:<runtime-port>`；
- server停止后两个端口均无listener。

### 6.5 失败事务

完成`CREATE_FRESH_ATTEMPT_ROOT`前失败：零attempt输出。之后失败：保留当前report staging中的真实artifact供父Runner分类，但不得单独提交attempt或Report final root。基础设施失败导致必填identity无法取得时，父Runner必须放弃整个staging，不得写占位Report。

### 6.6 Family Controlled Invocation production bridge

Release Playwright 只能调用 Runner owner 导出的下列入口：

```text
runFamilyControlledInvocationSession({
  invocation_context,
  cycle_handler
}) -> Promise<void>
```

`invocation_context`必须是本进程通过
`loadFamilyControlledInvocationContextFromEnvironment()`成功读取、原始字节和输入信任链均已复核后返回的同一不可变对象。bridge不得接受手工构造、结构相等但未登记的Context，也不得重新从环境、checkout、环境变量或目录扫描补齐输入。`cycle_handler`必须是冻结的异步函数；每次只接收以下冻结调用对象：

```text
{
  cycle: "INITIAL" | "REOPEN",
  origin: "http://127.0.0.1:<web-port>",
  browser_executable_ref: <Context browser ref>,
  case_entry: <verified CaseExecution>,
  observation_sink: <attempt-local sink API>,
  resolve_invocation: Function | null
}
```

只有`INITIAL`的`resolve_invocation`是函数；它返回冻结对象
`{ execute_case, call_context }`，其中`execute_case(call_context)`必须返回`undefined`。
`REOPEN`的`resolve_invocation`必须为`null`，不得调用任何Driver、SETUP或precondition client。

INITIAL 的 sink 必须先以未绑定状态创建。`resolve_invocation(page)`在 Page 已 attach 且同源页面 READY 后恰好调用一次：Family 先执行`RUN_SETUP`；Common 先按 Common Setup Plan 执行正式 API SETUP。Runner 随后在同一 sink 内按`setup baseline -> attempt identity`的唯一顺序各绑定一次，再返回五参数`call_context={page,case_entry,attempt_identity,observation_sink,precondition_client}`。Common 的`subject_baseline_revision`只能取最后一条 SETUP 提交响应；无提交的`M0`只能取 materialized base revision。禁止在 sink 创建前预测 revision、从路径或页面推断 identity，禁止 handler 顶层携带尚未生成的`attempt_identity`。

一次性`execute_case`包装器必须先在Driver调用前按第2.13节采集subject before，再在 Driver 返回后、Browser关闭前读取 subject-final `API-CTX-002`、`API-TXT-001`与`API-VER-001`。`revision_delta=1`时 final revision只取subject POST的`meta.committed_revision`；`revision_delta=0`时取当前subject baseline，`ADVANCE_HEAD`产生的precondition提交必须从subject提交集合排除。Runner证明revision list包含该revision后，只能把已落盘`API-CTX-002` response raw ref交给第2.6节Node bridge，由exact Runtime JAR复算五类`StateDigests`作为reopen expectation；`API-TXT-001`只证明公共wire可读，不再作为Node摘要输入。REOPEN sink只暴露一次性`verifyReopen()`；handler在新页面READY后必须调用它，复读三类正式API并以同一bridge逐项比较revision document、Projection、OPL、Token和Trace摘要。未调用、重复调用、任一摘要漂移、额外Driver/SETUP/precondition或旧Browser复用均拒绝。

bridge以Context `execution_schedule`的ordinal严格串行执行，不得并行、跳过、重排、重试或从路径推导attempt ordinal。每个case的INITIAL先完成fresh attempt、Fault Plan、Materializer、Runtime/Web启动和`RUN_SETUP`；它把实际
`setup_fact_id`、`subject_baseline_revision`及相关API exchange绑定到attempt identity后，才调用handler。REOPEN必须使用同一attempt storage和新的Runtime/Web/Browser进程；只在INITIAL触发三个Fault case，所有REOPEN以普通Runtime启动。

session只能复用 loader 已登记的 Context trust：`CONTROLLED_TEST`复核 controlled bundle，`PRODUCTION_HANDOFF`复核 Intake/Handoff；不得把 production root 传给 Controlled Bundle verifier，也不得在两种模式之间fallback。Runner 返回给 handler 的`execute_case`必须是一次性受控包装器；handler 必须以返回的同一`call_context`恰好调用一次，Runner复核底层Driver返回`undefined`。只调用resolver、跳过Driver、重复调用或替换context均固定拒绝。

Runner负责Runtime/Web生命周期、端口释放、sink创建/最终证明及真实artifact写入；Playwright handler只创建Browser tree、attach Page、调用INITIAL Driver并关闭Browser tree。handler返回、Browser关闭证明、Runtime/Web退出和端口释放全部成功后，bridge才允许进入下一个cycle。任何Context、Driver、Materializer、Runtime、Web、Browser、API、artifact或cleanup失败均停止本次bridge；必填artifact不得以静态值、空文件或占位对象补齐。

本入口不写Report、不产生Gate/Candidate/Activation结论。Report聚合只能在全部388个attempt均得到Schema-valid、语义闭合的真实artifact后由父Runner执行。

## 7. 验收矩阵

正例至少覆盖：16项映射exact equality、三个selector owner、9个BLOCKED分支、7个PASS分支、两个attempt、fresh进程、same storage REOPEN、exact JAR与Web tree复制复核、controlled bundle与Manifest四方join。

反例至少覆盖：缺/extra/reorder case、错误selector、模糊/坐标selector、错误API operation/status/code、SETUP计入subject delta、错误baseline时机、JAR/Web override、checkout/Vite fallback、attempt root已存在、跨report root、REOPEN复用进程或换storage、controlled/production参数互用、symlink/hardlink、copy后SHA/tree drift、端口残留和placeholder artifact。

## 8. 状态边界

本设计冻结后：

- Family/Common Driver、Common Setup Plan与受控session语义：`FROZEN_FOR_IMPLEMENTATION/PARTIAL_IMPLEMENTATION`；
- 全量`194/388`：`BLOCKED_BY_EXACT_CONTROLLED_INPUTS_AND_REAL_BROWSER_EVIDENCE`；Attempt Artifact/Report verifier代码与受控正反例已闭合；
- Manifest v02 producer/verifier：等待独立实现规格执行；
- 缺失UI selector：`BLOCKED_BY_UI_SELECTOR`，只阻断Common driver受控成功路径；
- production `194/388`、E2E Report、`GATE-06-03`、Candidate、Activation、Capability、production与ISO证据：`NOT_RUN/NOT_ENABLED`。
