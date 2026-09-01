# Spec: DEV-CANVAS-06 Common Visual Adapter 受控测试输入 Builder 闭包 Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

设计状态：`ADAPTER_TEST_INPUT_BUILDER_FROZEN`

实现状态：`IMPLEMENTATION_PRESENT_NOT_ACCEPTED / 8_BASE_144_CLONE_NOT_RUN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

在执行03C Node adapter的`8 base/144 clone`受控验证前，新增唯一的测试输入Builder与只读Verifier。一次调用必须在同一原子输出根内生成并闭合：

1. 从clean source五个固定路径逐byte物化的fresh direct Profile root；
2. 由现有02B Builder生成并由现有Verifier复核的活动Common `43`文件root；
3. 由现有Capture Planner生成的Schema-valid `1242`项Plan，其中恰有`72`项Common capture且全部指向本轮fresh Common root；
4. Adapter Request `0.2`的Java/JAR/Profile/Plan/Common受控输入；
5. 按`common_capture_ordinal -> attempt_ordinal`固定顺序排列的`144=72*2`份完整Capture Observed Result `0.1`及其确定性测试PNG；
6. 封闭的Adapter Test Input Bundle `0.1`，作为测试callback和03C受控验证的唯一入口。

本规格只冻结机器契约、实现范围和验收；当前工作树虽已有Builder/Verifier实现字节，本设计修正不接纳或修改这些字节，也不实现Node adapter/Java Runtime或执行`8/144`。

## 2. Root Cause与复现

现有仓库只有以下局部输入能力：

- `build-canvas06-common-visual-fixtures.mjs`能原子生成`44=1 Catalog+8 Visual+32 E2E+2 source mirror+1 Common Setup Plan`；
- `canvas06-e2e-manifest-v02-profile.mjs`能验证一个已经存在的五文件direct root；
- `release-canvas06-golden-plan.mjs`能生成`1242=1170 Family+72 Common`的Plan，但Common Catalog只能从`source-root`定位；
- `canvas06-common-visual-materialization.test.mjs`只有缺callback、历史Request和Java raw-ref漂移等BLOCKED用例。

没有owner同时创建fresh Profile、fresh Common、与该Common exact join的新Plan、Request `0.2`和144份完整callback结果。继续使用历史Plan、手工Request、`{}` Profile文件或部分Observed Result会绕过raw ref、binding、Projection和零fallback边界。

此前未发现的原因：03C checklist分别检查了Profile reader、02B Builder、Planner和Adapter Request，却没有检查“一个测试调用能否从共同source/Handoff/epoch生成可消费的完整输入根”。

## 3. Fix Strategy与单一事实源

1. 新增`OPM-DEV-CANVAS-06-COMMON-VISUAL-ADAPTER-TEST-INPUT-BUNDLE-001/0.1/0.1.0`，全部字段封闭；
2. 新增唯一Builder和独立只读Verifier，Builder不得自验后跳过Verifier；
3. 复用02B Builder/Verifier、Profile closure reader、Capture Plan Schema和Observed Result Schema，不建立第二套Common/Profile/Plan/Observed语义；
4. Capture Plan保持`0.1/0.1.0`和`1242`项，不新增`72-only` Schema；
5. Planner只做支持显式外置Common root的最小重构；旧CLI的捕获集合、排序、摘要和除`planner_identity.runner_source_sha256`外的语义字段必须回归一致。由于Planner source bytes发生变化，历史输出的自引用source SHA必然变化，禁止宣称整份Plan byte-identical；
6. 固定callback只能从Bundle的144项descriptor做exact lookup并返回对应完整Observed Result；禁止动态补字段、从目录名推导、复用历史结果或根据实际observed值反填期望；
7. 所有输出先写单一staging root，经完整staging verifier、fsync和atomic rename后，再运行installed verifier；任一阶段失败不得留下可消费final root。
8. Request Runtime source ref与Planner JDK环境必须采用[`Runtime JAR Kind与Planner JDK环境闭包规格`](./opm-dev-canvas-06-common-visual-runtime-jar-kind-and-planner-jdk-env-closure-bugfix-task-spec.md)：source kind为`LOCAL_RUNTIME_JAR`，Planner `JAVA_HOME`只由exact `--java-executable`推导并通过五键子进程环境显式注入。

## 4. 修改边界

本设计闭包允许新增本规格、对应checklist和Bundle Schema，并同步03C Adapter/Fault、Adapter受控Java/Profile、03C Materializer、Visual Common主设计、测试策略、开发执行包、冻结基线、DEV-CANVAS-06 release规格/checklist、契约索引和文档索引。

后继实现只允许把原Adapter/Fault切片从`14=6 M+8 A`扩展为第11章的`19=8 M+11 A`。本设计任务：

- 允许修改Schema：仅新增Bundle `0.1` Schema；既有Request、Plan、Common、Observed和Normalized Schema只读；
- 允许修改API：否；公共HTTP、OpenAPI和生产callback API只读；
- 允许修改配置/依赖：否；本设计不改`package.json`，后继实现只允许增加已有Node命令且不得新增依赖；
- 允许修改文档：仅本节列出的设计、规格、checklist和索引；
- 允许修改测试：本设计只运行Schema正反例、契约、链接和差异验证；后继实现按第12章补测试；
- 禁止修改：`.harness/**`、`reference/**`、Profile/Common业务bytes、SQLite DDL、Migration、Vue、Spring/production配置、Candidate、Approval、Gate和Capability状态。

## 5. Builder与Verifier CLI

唯一Builder命令固定为：

```text
node scripts/build-canvas06-common-visual-adapter-test-input.mjs \
  --source-root <clean-source-absolute-realpath> \
  --handoff-root <readonly-handoff-root-absolute-realpath> \
  --intake-report <handoff-root内relative-path> \
  --java-executable <exact-java-21-absolute-realpath> \
  --runtime-jar <handoff-root内relative-path> \
  --change-id <GOLDEN-CANVAS06-YYYYMMDD-NNN> \
  --source-date-epoch <safe-integer> \
  --output-root <fresh-final-absolute-path>
```

唯一Verifier命令固定为：

```text
node scripts/verify-canvas06-common-visual-adapter-test-input.mjs \
  --source-root <same-clean-source-absolute-realpath> \
  --handoff-root <same-readonly-handoff-root-absolute-realpath> \
  --intake-report <same-relative-path> \
  --bundle-root <installed-or-staging-absolute-root> \
  --bundle adapter-test-input-bundle.json \
  [--expected-final-root <仅staging验证时必填的final-absolute-path>]
```

参数必须逐项出现一次。禁止把env、stdin、URL、glob、目录扫描、latest/mtime、`PATH/父JAVA_HOME`、历史Plan、历史Common/Profile root、callback module或任意override/fallback作为输入。Builder只允许从已验证`--java-executable`推导JDK root，并为Planner构造固定五键env；这不是外部输入或fallback。Verifier无`--expected-final-root`时只能验证installed root；有该参数时，`bundle-root`必须是本次Builder创建的唯一staging root。

## 6. 原子输出布局

```text
<output-root>/
  adapter-test-input-bundle.json
  adapter-request.json
  inputs/build/local-runtime.jar
  inputs/golden/capture-plan.json
  inputs/profile/assets/
    profile.json
    grammar/representative-opl-grammar.json
    normalization/representative-normalization.json
    rules/representative-rule-set.json
    symbols/representative-symbol-catalog.json
  inputs/common/
    <完整44文件root>
  callback-results/
    000/attempt-1/observed-result.json
    000/attempt-1/capture.png
    000/attempt-2/observed-result.json
    000/attempt-2/capture.png
    ...
    071/attempt-2/observed-result.json
    071/attempt-2/capture.png
```

除上述`2+1+1+5+44+288=341`个普通单链接文件和必要目录外不得有额外文件、link、hardlink、socket/device/FIFO、临时文件或Git metadata。`adapter_work_root=<output-root>.adapter-work`，不在final root内，Builder和Verifier成功返回时必须不存在；预存在即在任何staging写入前拒绝。

## 7. 受控输入与生成顺序

### 7.1 Source、Handoff、Java与Runtime

1. `source-root`必须clean，`HEAD`等于READY Handoff的`source_build.source_commit`；Builder/Verifier source均来自该commit；
2. READY Intake必须raw ref锁定READY Handoff，active binding、Runtime JAR ref和epoch不得从其他输入推导；
3. Java executable按活动Adapter Request `0.2`既有顺序验证absolute realpath、regular/non-link/executable、raw length/SHA和`-version major=21`；随后从其父两级推导JDK root，验证唯一`bin/jar`并为Planner构造固定`JAVA_HOME/PATH/LANG/LC_ALL/TZ`五键env，禁止继承父环境；
4. Runtime JAR source ref的kind固定为`LOCAL_RUNTIME_JAR`，并与Handoff build artifact、Plan `runtime_jar_ref`逐字段相等；Builder逐byte复制到`inputs/build/local-runtime.jar`并记录kind为`RUNTIME_JAR`的独立staged ref，两者只允许kind/path不同且raw length/SHA必须相等；
5. source/Handoff/Java/Runtime任一失败：零staging、零final、零work root。

### 7.2 Fresh Profile五文件root

Profile Source Set只接受clean source中既有Profile/Digest closure冻结的五个固定路径。Builder按固定映射复制到`inputs/profile/assets`，先逐项raw ref，再复用`loadProfileAssetClosure({manifestRootPath:'profile/assets'})`验证exact inventory、UTF-8 path顺序、tree、package digest和active binding。

Request中的`profile_asset_root=<output-root>/inputs/profile/assets`；五项`profile_asset_refs[].path`固定以`profile/assets/`开头，tree preimage固定`root_path='profile/assets'`。物理Bundle路径的`inputs/`前缀不进入Request tree identity。禁止把Profile package父目录直接当direct root。

### 7.3 Fresh Common 44文件root

Builder必须调用现有`buildCommonVisualFixtures({handoffPath,target:<staging>/inputs/common,epoch})`，不得复制历史root或重写fixture。随后必须以现有只读Verifier闭合：

```text
catalog_version=0.2.0
inventory=43
visual_subjects=8
e2e_cases=16
source mirrors=2
source_binding==Handoff.active_binding
```

`common_fixture_tree_ref.sha256=sha256(JCS(44项{path,byte_length,sha256}按UTF-8 path升序))`，`byte_length`为44项之和，tree path固定`inputs/common`；第44项固定为`dev-canvas-06-common-setup-plan.json`，不得排除。

### 7.4 新Capture Plan与外置Common root

Planner新增显式`--common-fixture-root <absolute-root>`，只允许与固定`--common-fixture-catalog dev-canvas-06-common-fixture-catalog.json`成对出现。提供时，Catalog和fixture只从该root读取并验证，Plan中的`common_fixture_catalog_ref.path`固定为Catalog basename；未提供时保持历史`source-root + common-fixture-catalog`语义。

Planner必须复用同一Plan composer，禁止测试Builder自行拼Plan。输出必须通过现有Capture Plan Schema并满足：

```text
captures=1242
family=1170
common=72
common subjects=8
每subject=3 viewports * 3 zooms=9
common capture顺序=Catalog subject顺序 -> viewport顺序 -> zoom顺序
```

72项Common的`common_fixture_catalog_ref/fixture_ref/expected_revision/Projection SHA/focus/anchor/cells/critical_regions`必须逐字段来自本轮fresh Catalog/fixture。禁止仅比较计数或SHA、复用历史Plan或把Common root写入clean source。

### 7.5 Adapter Request `0.2`

Request固定映射：

```text
plan_path=<output-root>/inputs/golden/capture-plan.json
plan_ref={kind=CAPTURE_PLAN,path=inputs/golden/capture-plan.json,...}
common_fixture_root=<output-root>/inputs/common
java_major_version=21
java_executable_ref=<本轮exact Java ref>
runtime_jar_path=<output-root>/inputs/build/local-runtime.jar
runtime_jar_ref=<Plan/Handoff exact LOCAL_RUNTIME_JAR source ref>
profile_asset_root=<output-root>/inputs/profile/assets
profile_asset_tree_ref/profile_asset_refs=<profile/assets逻辑身份>
work_root=<output-root>.adapter-work
source_date_epoch=<Plan exact epoch>
```

`request_id=dev-canvas-06.common-visual-adapter.test.<bundle_id后缀>`。Request raw ref固定为`ADAPTER_REQUEST/adapter-request.json`。Plan ref是Bundle内Plan raw ref；Runtime source ref与staged physical ref不得混为一个对象。Runtime Ready继续使用staged `RUNTIME_JAR`身份，只按raw length/SHA与Request source ref闭合，不比较kind/path。

## 8. 144份完整Observed Result

### 8.1 唯一索引与顺序

Bundle的`callback_observed_results`恰有144项，顺序固定为：

```text
(common_capture_ordinal=0, attempt_ordinal=1)
(common_capture_ordinal=0, attempt_ordinal=2)
...
(common_capture_ordinal=71, attempt_ordinal=2)
```

唯一key为`common_capture_ordinal|capture_id|subject_id|attempt_ordinal`。descriptor同时锁定`observed_result_ref`和`png_ref`；路径只能由ordinal和attempt按第6章固定格式生成，但Verifier必须从descriptor字段校验路径，callback不得从目录名反推identity。

### 8.2 Observed字段来源

每份Observed Result必须通过既有`0.1` Schema，且字段唯一来自同一Plan capture和fresh fixture：

- identity、Projection、Projection SHA、cells、focus、anchor逐字段等于Plan/fixture；
- `ui_setup_status=READY`、`stability_status=STABLE`；
- viewport尺寸固定为`1440x900/1280x800/390x844`，不得使用当前窗口观测值；
- `fault_observation`仅`BLOCKED_FEEDBACK`为`BLOCKED_FEEDBACK_ONE_SHOT/1/PERSISTENCE_FAILED`，其余为`NONE/0/null`；
- `cell_geometry_sha256=sha256(JCS({schema_id:'OPM-DEV-CANVAS-06-COMMON-VISUAL-TEST-GEOMETRY-001',schema_version:'0.1',capture_id,committed_cells:[{cell_id,layer,geometry}],transient_cells}))`，committed按UTF-8 `cell_id`升序，transient保持fixture顺序；
- `capture.png`必须是可解析PNG，IHDR width/height等于Observed width/height；Observed的`png_byte_length/png_sha256`逐byte等于同descriptor `png_ref`。

测试PNG只用于验证callback完整返回、raw ref和adapter semantic join，不得进入Candidate、Authoring Report、approved root、Visual Manifest或release evidence。Builder/Verifier输出与03B生产PNG根必须物理隔离。

### 8.3 固定callback

测试callback唯一行为：

```text
Invocation Schema和request_id/plan_ref通过
-> 以四字段key在Bundle descriptor中exact lookup恰一项
-> 验证Invocation与Plan/fixture/descriptor identity
-> 读取descriptor锁定的Observed raw bytes并复核ref/Schema/semantic join/PNG ref
-> 返回解析后的普通JSON对象
```

缺项、重复、144之外调用、顺序漂移、Invocation漂移、raw ref漂移或Observed/PNG不闭合立即失败。callback不得访问checkout、扫描callback目录、生成/修正Observed或记录actual值覆盖expected值。

## 9. Bundle `0.1`与摘要

Bundle字段由新增Schema承接。关键身份包括source commit/epoch、Builder/Verifier source refs、Java ref、Runtime source/staged refs、Profile tree/五refs、Common tree/Catalog ref、Plan ref、Request ref和144项callback descriptor。

```text
bundle_payload_sha256 = sha256(UTF8(JCS(Bundle中除bundle_payload_sha256外全部字段)))
```

所有file ref的SHA是raw bytes SHA；Profile/Common tree SHA和Bundle payload SHA是JCS preimage摘要，禁止互换。Schema只封闭形状和基数；路径映射、唯一key、排序、raw/tree/package/binding、Plan/Catalog/fixture/Request/Observed/PNG exact join必须由Verifier复算。

## 10. 原子事务、首错与错误码

唯一时序：

```text
CLI/schema/source/Handoff/Java/Runtime preflight
-> final/work/staging均fresh且隔离
-> create staging
-> derive/verify JDK root and jar; construct controlled Planner env
-> Profile 5
-> Common 44
-> Plan 1242/72
-> Runtime staged copy
-> Request 0.2
-> 144 Observed + 144 PNG
-> Bundle
-> staging verifier(expected-final-root映射)
-> fsync postorder
-> rename staging to final(no-replace)
-> fsync final parent
-> installed verifier(no映射)
```

Request中的五个绝对路径从创建时就写最终`output-root`，禁止rename后改写。staging verifier只允许把已验证的`expected-final-root`前缀精确映射到当前`bundle-root`，且仅用于读取`plan_path/common_fixture_root/runtime_jar_path/profile_asset_root`；`work_root`仍按最终绝对路径检查不存在。其他path不得重定位。installed verifier必须逐byte读取Request原始路径，禁止映射或fallback。

final rename前失败：删除且仅删除本次staging，final/work不存在。rename后parent fsync或installed verifier失败：final必须原子移动到唯一`sibling quarantine`，不得覆盖、修补或作为输入消费；隔离失败返回内部错误并保留现场。不得删除source、Handoff、Java、Runtime source、历史Plan/Common或用户数据。

稳定错误：

| Code | Exit | 边界 |
| --- | ---: | --- |
| `GOLDEN_COMMON_ADAPTER_TEST_INPUT_INVALID` | 2 | CLI、Schema、路径、source、Handoff、Java或fresh边界无效 |
| `GOLDEN_COMMON_ADAPTER_TEST_JOIN_MISMATCH` | 3 | Profile/Common/Plan/Request/Observed/PNG任一exact join不闭合 |
| `GOLDEN_COMMON_ADAPTER_TEST_TRANSACTION_FAILED` | 4 | mkdir/copy/write/fsync/rename/quarantine/installed verify异常 |

按本节时序首个失败为唯一primary error；禁止并行阶段竞态选择错误。

## 11. 后继实现 Allowlist

原Adapter/Fault实现切片保留14项，并新增以下5项：

```text
M scripts/release-canvas06-golden-plan.mjs
M scripts/release-canvas06-golden-plan.test.mjs
A scripts/build-canvas06-common-visual-adapter-test-input.mjs
A scripts/verify-canvas06-common-visual-adapter-test-input.mjs
A scripts/build-canvas06-common-visual-adapter-test-input.test.mjs
```

合计固定为`19=8 M+11 A`。新增三文件不进入Runner Source Set、production Authoring Report或Gate source identity，只是03C受控实现测试输入owner。若实现发现14项既有allowlist之外的产品缺陷，必须新开bugfix规格，不得扩大本包或放宽Verifier。

## 12. 验收矩阵

至少覆盖：

1. Bundle Schema Draft 2020-12 strict编译，1个完整正例；
2. Profile缺/多/乱序/link/hardlink、raw/tree/package/binding漂移；
3. Common非44文件、缺失或篡改Common Setup Plan、Catalog非`0.2.0`、source mirror/binding/ref漂移；
4. Plan非1242/72、Common顺序/fixture/Catalog/Projection/focus/cell漂移，历史Plan拒绝；
5. Request Java/JAR/Profile/Plan/Common/epoch/final path/work root单变量漂移；旧`RUNTIME_JAR` Request kind拒绝，Handoff/Plan/Request `LOCAL_RUNTIME_JAR`四字段闭合；
6. callback少于/多于144、重复key、顺序、Observed缺/多字段、identity/Projection/focus/cell/fault/geometry/PNG漂移；
7. staging映射越界、final/work/staging预存在、write/fsync/rename/parent fsync/installed verifier/quarantine故障；
8. legacy Planner模式除自引用source SHA外语义归一回归一致，外置Common模式生成新fresh exact join；父`JAVA_HOME`缺失/JDK17/恶意值不影响从exact Java 21推导的Planner env，derived jar负例零输出拒绝；
9. fixed callback对完整144项逐一exact lookup，不读取历史结果、不扫描目录、不反填；
10. Builder/Verifier成功后final可重复只读验证，source/Handoff/final bytes和Git状态不变。

实现后必须先通过上述测试和`npm run contract:validate`，才允许一次性执行真实`8 base/144 clone`。测试Builder的READY只表示`READY_FOR_ADAPTER_TEST`，不表示03C实现、03B、PNG Golden、Gate、Candidate、Activation、Capability、production或ISO符合性通过。

## 13. 回滚、事实与假设

回滚只删除Bundle Schema、三份新Node文件和Planner两文件的外置Common扩展，并同步回退本规格指针。历史Plan、Common、Profile、Handoff、Candidate、approved root和用户数据不得删除或改写；禁止以手工Request、历史Plan或放宽raw ref替代回滚后的缺失能力。

事实：当前02B Builder/Verifier、Profile closure reader、Capture Planner及Request/Observed Schema分别存在，Adapter Test Input Builder/Verifier实现字节也已出现；但现有实现仍存在Request Runtime kind冲突和Planner继承父`JAVA_HOME`问题，因此不能通过本规格验收。Node adapter完整semantic join和固定返回scheduler仍未验收。假设：无。真实Java/JAR SHA、source commit、Bundle SHA、8 base/144 clone结果和性能必须由后继clean实现及实际执行产生。
