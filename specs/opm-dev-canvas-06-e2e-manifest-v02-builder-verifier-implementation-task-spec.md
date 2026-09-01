# Spec: DEV-CANVAS-06 E2E Manifest v02 Producer/Verifier实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NODE_CLOSURE_COMPLETE / PRODUCTION_REBUILD_PENDING`

Build准入：`READY_FOR_BUILD`

Production重建准入：`READY_FOR_CLEAN_R_EXTERNAL_STORE_REBUILD`

活动source输入：`opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`取代“17项commit即最终source”的限制。既有`9048bb3...` Manifest只作为origin build证据；最终production Manifest必须在新Runner commit `R`形成后，从clean `R`与fresh external store重建，并与Handoff、Intake、source HEAD和Report完成六方join。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

实现活动E2E Manifest `0.2/0.2.0`的独立producer与只读verifier，关闭：

1. Profile五资产/tree/package/binding exact join；
2. `DRIVER-COMMON`第四driver source identity；
3. `194=178 Family+16 Common`、活动Common `7 PASS+9 BLOCKED`语义；
4. exact Runtime JAR、production Web dist、四个driver、上游输入和Profile资产的单一final root；
5. `137 PASS_MATCHED+57 BLOCKED_MATCHED`的活动Report `0.2` READY常量修正。

本任务不执行194/388、不生成E2E Report、Gate、Candidate、Activation或Capability证据。

## 2. Root Cause与Fix Strategy

### Root Cause

1. Manifest `0.2`的case允许`DRIVER-COMMON`，`driver_catalog`却固定三项，Schema内部不可闭合；
2. 活动Report `0.2`复用历史`0.1` summary，其最大值和READY常量把16个Common全部计为PASS，与Common Catalog的7 PASS/9 BLOCKED矛盾；
3. 历史v01 producer/verifier不承接Profile asset tree/raw refs，不能通过改入口名称升级为v02；
4. Runner规格引用v02目标，但仓库没有独立实现规格和source边界。

之前未被发现，是因为Schema测试分别验证对象形状，没有执行“16个Common expectation -> Report READY聚合”跨Schema恒等式，也没有断言Common case的driver必须在`driver_catalog`中恰好出现一次。

### Fix Strategy

保留历史v01 writer/Schema/输出只读；新增v02入口与composer/input closure，修正未发布的活动v02 Manifest/Report Schema，增加跨Schema恒等式测试。producer先构造完整staging输入树，再compose、内部verify、fsync和rename；verifier独立复算，不调用producer写入路径。

## 3. 权威输入

1. `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json`；
2. `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md v1.5`；
3. `docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.7`与Stage A lifecycle closure；
4. Family Fixture Identity Catalog `0.1/0.1.0`与活动Common Catalog `0.2.0`；
5. 由统一Source生产输入重建规格形成的Handoff `0.2`、exact READY Intake、Runtime JAR和Web dist tree；
6. 活动Report Schema `opm-dev-canvas-06-e2e-report-v02.schema.json/0.2`。
7. 已通过独立Common E2E输入重建Verifier的活动`0.2.0` 44文件root（含Common Setup Plan）；其factory source必须与第四`DRIVER-COMMON`所属clean source commit中的factory raw bytes相等；
8. `specs/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-task-spec.md`冻结的source-root固定路径、Handoff/Web tree和exact join；
9. `specs/opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md`形成的`e598... -> 9048bb3...`与`17=14 M+3 A`只作为origin来源；最终production source、六方join和重建顺序唯一按Final Production Source Chain的`9048bb3... -> C -> S -> A -> R0 -> R`执行。

冲突时本规格只覆盖Manifest v02 producer/verifier、第四driver与137/57聚合修正；不重解释Profile摘要、Fixture、Fault或Runner Artifact语义。

## 4. 修改边界

### 4.1 精确非文档allowlist

仅允许下列`17`个逻辑路径进入本实现source delta；`M/A`只在exact clean base确定后计算：

1. `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json`
2. `docs/contracts/schemas/opm-dev-canvas-06-e2e-report-v02.schema.json`
3. `scripts/validate-canvas06-visual-e2e-schemas.test.mjs`
4. `scripts/canvas06-e2e-manifest-v02-compose.mjs`
5. `scripts/canvas06-e2e-manifest-v02-compose.test.mjs`
6. `scripts/canvas06-e2e-manifest-v02-input.mjs`
7. `scripts/canvas06-e2e-manifest-v02-input.test.mjs`
8. `scripts/canvas06-e2e-manifest-v02-profile.mjs`
9. `scripts/canvas06-e2e-manifest-v02-profile.test.mjs`
10. `scripts/release-canvas06-e2e-manifest-v02.mjs`
11. `scripts/release-canvas06-e2e-manifest-v02.test.mjs`
12. `scripts/verify-canvas06-e2e-manifest-v02.mjs`
13. `scripts/verify-canvas06-e2e-manifest-v02.test.mjs`
14. `scripts/canvas06-e2e-manifest-v02-invariants.test.mjs`
15. `scripts/verify-canvas06-e2e-report.mjs`
16. `scripts/verify-canvas06-e2e-report.test.mjs`
17. `package.json`

Profile Asset Staging修正只能由上述17项中的以下`7`个owner实现，不得借机修改Profile业务helper、Schema或其他入口：

1. `package.json`
2. `scripts/canvas06-e2e-manifest-v02-input.mjs`
3. `scripts/canvas06-e2e-manifest-v02-invariants.test.mjs`
4. `scripts/release-canvas06-e2e-manifest-v02.mjs`
5. `scripts/release-canvas06-e2e-manifest-v02.test.mjs`
6. `scripts/verify-canvas06-e2e-manifest-v02.mjs`
7. `scripts/verify-canvas06-e2e-manifest-v02.test.mjs`

其中`canvas06-e2e-manifest-v02-input.mjs`唯一拥有五个source路径、source-to-logical映射、Staging隔离/fresh守卫和逐byte materialize纯函数；Producer只编排该owner，Verifier只调用其只读source/final复算路径。`canvas06-e2e-manifest-v02-profile.mjs`现有任意direct root五文件/tree/package/binding校验能力保持只读复用，不因物理root变化修改。`M/A`仍按完整17项实现source delta在exact clean base上计算；本7项是该修正的精确owner子集，不把17项错误改写为7项总delta。

文档只允许同步本规格checklist、Common Driver设计/规格/checklist、Runner/Fault Launcher规格与checklist、测试策略、开发执行包、冻结基线、Toolchain checklist和`docs/README.md`。

### 4.2 历史v01只读复用

v02允许只读导入以下纯helper：

```text
canvas06-e2e-manifest-v01-support.mjs
canvas06-e2e-manifest-v01-archive.mjs
canvas06-e2e-manifest-v01-transaction.mjs
canvas06-e2e-manifest-v01-trust.mjs
canvas06-e2e-manifest-v01-input.mjs
```

仅可复用path/ref/archive/trust/transaction、Family/Common case derivation与Family identity deep join。禁止修改这些文件，禁止导入v01 composer、release入口、verifier或v01 Schema，禁止把v01 manifest对象补字段后称为v02。

### 4.3 禁止

- OpenAPI、SQLite DDL/migration、Profile/Rule/Grammar/Symbol业务bytes；
- Vue、Java Runtime、Fault/Recovery、Golden、Candidate、Activation；
- 历史Manifest/Report Schema `0.1`、历史v01脚本、既有`clean-*`；
- 新依赖、网络下载、checkout fallback、目录扫描猜版本、自动升级旧Manifest；
- 手写READY、覆盖final root、修改输入root或让verifier写cache/temp。

## 5. Schema修正

### 5.1 Manifest v02

`driver_catalog`固定`minItems=maxItems=4`，第四个`commonDriver`的`driver_id=DRIVER-COMMON`。四项source ref的`kind=E2E_DRIVER_SOURCE`且路径依次为：

```text
inputs/drivers/procedural-driver.mjs
inputs/drivers/control-driver.mjs
inputs/drivers/structural-driver.mjs
inputs/drivers/common-driver.mjs
```

任一case的`driver_id`必须在catalog中恰好命中一次。178个Family只使用前三项；16个Common只使用第四项。

### 5.2 Report v02

活动v02不得继续`$ref`历史v01 summary。v02新增自己的封闭`summary`，范围和READY常量固定：

```text
case_count=194
family_case_count=178
family_pass_expectation_count=130
family_blocked_expectation_count=48
common_case_count=16
attempt_count=388
pass_matched_count max/READY=137
blocked_matched_count max/READY=57
failed/skipped/retry READY=0
```

恒等式：`130+7=137`、`48+9=57`、`137+57=194`。历史Report `0.1`保持原bytes只读且不得被v02 verifier接受为活动READY。

## 6. 完整CLI

### 6.1 Producer

```text
npm run release:canvas06:e2e:manifest:v02 -- \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读版本化handoff root> \
  --intake-report <root内READY intake相对路径> \
  --source-root <clean target source> \
  --source-date-epoch <非负十进制UTC整秒> \
  --common-fixture-root <已验证活动0.2.0的44文件root> \
  --profile-asset-root <fresh且不存在的Profile Asset Staging Root绝对路径> \
  --output-root <release root> \
  --out dev-canvas-06/e2e/manifests/<manifest-id>/dev-canvas-06-e2e-manifest.json \
  --require-production

npm run release:canvas06:e2e:manifest:v02 -- \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读controlled root> \
  --source-root <clean target source> \
  --source-date-epoch <非负十进制UTC整秒> \
  --common-fixture-root <已验证活动0.2.0的44文件root> \
  --profile-asset-root <fresh且不存在的Profile Asset Staging Root绝对路径> \
  --output-root <fresh controlled output> \
  --out dev-canvas-06/e2e/manifests/<manifest-id>/dev-canvas-06-e2e-manifest.json
```

### 6.2 Verifier

```text
npm run release:canvas06:e2e:manifest:v02:verify -- \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读版本化handoff root> \
  --intake-report <root内READY intake相对路径> \
  --source-root <clean target source> \
  --manifest-root <final manifest root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --profile-asset-root <manifest-root/inputs/upstream/profile-assets> \
  --require-production

npm run release:canvas06:e2e:manifest:v02:verify -- \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读controlled root> \
  --source-root <clean target source> \
  --manifest-root <final manifest root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --profile-asset-root <manifest-root/inputs/upstream/profile-assets>
```

每个参数恰好一次；拒绝未知、重复、空值、`--x=y`、位置参数、mode互用、production缺`--require-production`和controlled携带该flag。Producer的`--profile-asset-root`是由本次调用创建的Staging target，启动时必须不存在；Verifier的同名参数必须逐字符解析为`<manifest-root>/inputs/upstream/profile-assets`既有final root。两者都不得位于`--source-root`内，Producer root还不得位于Handoff、Common、output、Manifest final/staging root内。参数/path失败在任何Staging、SQLite或Runtime前退出`2`。

## 7. Final Root布局

```text
<manifest-id>/
  dev-canvas-06-e2e-manifest.json
  inputs/
    trust/intake-report.json
    trust/handoff.json
    trust/evidence-bundle.zip
    upstream/family/**
    upstream/family-identity-catalog.json
    upstream/profile-assets/<exact 5 files>
    common/<exact 43 files>
    build/local-runtime.jar
    build/web-dist/**
    drivers/procedural-driver.mjs
    drivers/control-driver.mjs
    drivers/structural-driver.mjs
    drivers/common-driver.mjs
```

`profile_asset_tree_ref.path=inputs/upstream/profile-assets`。Producer先从clean source五个固定分散路径逐byte物化独立Profile Asset Staging Root，再从该只读root复制到final；不要求也不允许Staging物理位于source-root。tree SHA按Profile/Digest设计`v1.5`的同一逻辑root JCS inventory公式计算，五项raw ref按UTF-8 path升序；source/staging/final五项raw ref与tree identity三方相等，剥离root prefix后再与`profile.json.manifest.entries[]`、Handoff active binding逐项闭合。

Runtime JAR为single-link普通文件raw ref；Web dist为封闭tree ref且不得含link、source map中的checkout绝对路径、Vite/HMR或额外文件。四个driver逐byte复制自clean source中固定路径，Common source必须等于Common Driver实现规格冻结的活动bytes。

### 7.1 Production source-root唯一映射

production模式不得由实现者配置或扫描构建产物路径；`--source-root`内固定映射为：

```text
services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar
apps/web/dist
tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs
tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs
tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs
tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs
```

Profile Source Set不是单一source内package root，固定为：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json
packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json
```

Producer把五个source path按Profile/Digest设计`v1.5`固定映射到`--profile-asset-root`下的`profile.json`、`rules/**`、`grammar/**`、`symbols/**`、`normalization/**`；禁止复制整个Profile package目录、改变业务bytes或把source父目录直接传给Profile loader。Verifier用显式`--source-root`独立复算source/final映射，不读取Producer staging root。

`git rev-parse --verify HEAD`必须逐字符等于Handoff `0.2.source_build.source_commit`和统一重建记录的`unified_source_commit`，且source-root在Producer启动时为clean。production `--source-date-epoch`必须等于该commit的committer epoch和统一重建记录值；不得由调用者另选时间。Runtime与Web必须先分别和Handoff `LOCAL_RUNTIME_JAR` raw ref、`WEB_DIST_TREE` tree ref相等，再复制到final root并复核三方相等；四driver不进入Handoff artifact数组，只允许以同一source commit、固定路径和Manifest final raw ref闭合。

### 7.2 Web tree与Handoff exact join

Handoff Web ref路径固定为`releases/clean-<source12>/web-dist`，Manifest final ref路径固定为`inputs/build/web-dist`；两者路径不同，但inventory、总`byte_length`和`sha256`必须相等。tree摘要复用统一重建规格第6.3节公式：普通单链接文件inventory按UTF-8 path排序，`sha256=SHA-256(UTF8(JCS(inventory)))`。禁止使用目录mtime、ZIP SHA、locale排序或只比较文件数。

production校验顺序固定为：exact quarantine sidecar guard -> READY Intake raw ref -> Handoff `0.2` Schema/READY -> unified source commit -> Handoff Runtime/Web refs -> source-root Runtime/Web -> 四driver -> Common 44/setup plan/factory/binding -> final copy。任一前项失败时不得创建staging。

### 7.3 Unified Source Quarantine Sidecar Guard

production Producer和Verifier在读取版本根内READY Intake、Handoff或任一artifact前，必须从显式`--handoff-root` basename `clean-<source12>`构造并`lstat`以下两个exact sibling path：

```text
<handoff-root-parent>/quarantine/clean-<source12>.json
<handoff-root-parent>/quarantine/.clean-<source12>.json.tmp
```

final marker或temp residual任一实体存在即返回`E2E_MANIFEST_INPUT_QUARANTINED/3`，link、directory、截断或Schema-invalid marker也不得读取后放行；`lstat`本身I/O失败返回`E2E_MANIFEST_IO_FAILED/4`。只有二者均明确`ENOENT`，才允许读取目标版本根；读取Handoff后还必须证明完整`source_commit`前12位等于路径source12。该guard只使用显式目标构造exact path，禁止扫描`quarantine/`、枚举`clean-*`、读取latest、跟随link、按mtime选择、自动删除/移动marker或以同source identity覆盖重建。

Marker Schema、八字段、原子写入和恢复权限唯一由统一Source重建规格第10.1~10.2节及`opm-dev-canvas-06-unified-source-quarantine-marker.schema.json`承接。Manifest Producer/Verifier只做fail-closed拒绝，不执行恢复。controlled mode不读取production quarantine目录。

## 8. Producer唯一顺序

```text
ARGS -> MODE -> EXACT_QUARANTINE_SIDECAR_GUARD -> EXTERNAL_TRUST -> SOURCE_CLEAN_HEAD -> LOCKFILE
-> HANDOFF_0.2_RUNTIME_WEB_JOIN -> SOURCE_ROOT_FIXED_PATHS
-> COMMON_0.2.0_43_VERIFY -> FAMILY_IDENTITY_DEEP_JOIN
-> SOURCE_PROFILE_5_RAW -> SOURCE_PROFILE_PACKAGE_BINDING
-> RUNTIME_JAR -> WEB_DIST -> FOUR_DRIVERS -> OUTPUT_FRESH
-> PROFILE_STAGING_ROOT_ABSENT_ISOLATED -> MATERIALIZE_PROFILE_5
-> PROFILE_STAGING_FSYNC_REVERIFY -> PROFILE_TREE -> PACKAGE_DIGEST -> BINDING_JOIN
-> CREATE_STAGING -> COPY_ALL_INPUTS -> REVERIFY_COPIES
-> REVERIFY_SOURCE_PROFILE_STAGING_FINAL_THREE_WAY_JOIN
-> REMOVE_PROFILE_STAGING_AND_FSYNC_PARENT
-> DERIVE_178_FAMILY -> DERIVE_16_COMMON -> ASSERT_7_9
-> COMPOSE_0.2 -> SCHEMA_VERIFY -> INTERNAL_SEMANTIC_VERIFY
-> FSYNC_TREE -> ATOMIC_RENAME -> PARENT_FSYNC
```

Manifest `generated_at=Instant.ofEpochSecond(--source-date-epoch).toString()`；参数只接受无符号规范十进制非负整数，且必须满足既有`source_date_epoch=parseUtcWholeSecond(generated_at)`逐code point往返规则。该参数只属于Manifest producer；Runner和Materializer仍不得新增时间输入，只逐byte消费Manifest。禁止当前时钟、mtime或目录顺序影响bytes。

rename前失败删除本次staging且final root不存在；crash residual不自动删除或续跑；rename后parent fsync失败保留root但退出`4`且不声明成功。final/staging/residual存在均拒绝覆盖。

## 9. Verifier唯一顺序

```text
ARGS -> MODE -> EXACT_QUARANTINE_SIDECAR_GUARD -> ROOT_TYPE -> TREE_DIGEST_BEFORE -> MANIFEST_RAW
-> SCHEMA_0.2 -> ID/PATH -> EXTERNAL_TRUST -> RAW_COPIES
-> SOURCE_BUILD/JAR/WEB -> FOUR_DRIVER_REFS -> COMMON_43
-> FAMILY_IDENTITY -> SOURCE_PROFILE_5 -> FINAL_PROFILE_5/TREE/PACKAGE/BINDING
-> SOURCE_FINAL_PROFILE_RAW_AND_TREE_JOIN
-> CASE_ORDER/COUNT/EXPECTATION/DRIVER -> FIXTURE_REFS
-> SUMMARY/TRANSACTION -> EXACT_TREE -> TREE_DIGEST_AFTER
```

verifier前后tree digest必须相等。production verifier要求READY Intake exact链与`--require-production`；controlled verifier要求descriptor identity和`approved_version_ref=null`且禁止production/READY结论。

## 10. 失败码与退出码

稳定首错：

```text
E2E_MANIFEST_ARGUMENT_INVALID
E2E_MANIFEST_INPUT_CLASS_INVALID
E2E_MANIFEST_INPUT_QUARANTINED
E2E_MANIFEST_INTAKE_INVALID
E2E_MANIFEST_SOURCE_BUILD_INVALID
E2E_MANIFEST_COMMON_FIXTURE_INVALID
E2E_MANIFEST_FAMILY_IDENTITY_INVALID
E2E_MANIFEST_PROFILE_ASSET_INVALID
E2E_MANIFEST_DRIVER_INVALID
E2E_MANIFEST_JOIN_MISMATCH
E2E_MANIFEST_SCHEMA_INVALID
E2E_MANIFEST_TRANSACTION_INVALID
E2E_MANIFEST_IO_FAILED
```

Profile source/raw/tree/package/binding或source-staging-final映射漂移使用`E2E_MANIFEST_PROFILE_ASSET_INVALID/3`；exact quarantine marker或temp residual存在使用`E2E_MANIFEST_INPUT_QUARANTINED/3`；Staging target已存在、root重叠或非fresh使用`E2E_MANIFEST_TRANSACTION_INVALID/3`；materialize/copy/read/remove/fsync/lstat失败使用`E2E_MANIFEST_IO_FAILED/4`。Profile Staging删除在final rename前完成，删除或parent fsync失败必须零final且不得声明成功。其余`2`为参数/path/schema/class，`3`为semantic/ref/join，`4`为I/O/fsync/internal。stderr第一行固定`<CODE>\t<STAGE>`；成功stdout只输出final Manifest绝对路径与raw SHA。

## 11. 测试与验收

### 11.1 必须先红后绿

1. Common case使用`DRIVER-COMMON`但catalog缺第四项时Schema/semantic失败；
2. READY使用`146/48`时v02 Report失败，`137/57`通过；
3. v02入口导入v01 composer/verifier时source-boundary测试失败。

### 11.2 正例

- controlled与production各一套完整194 case Manifest；
- `178/16`、Family `130/48`、Common `7/9`、四driverexact；
- Profile source/staging/final五raw/tree三方相等，package/binding闭包；
- exact JAR/Web tree和43 Common tree；
- 同输入两次生成Manifest raw bytes相同；
- verifier只读且前后tree digest相等。

### 11.3 反例

覆盖参数/mode互用、v01输入、driver缺失/extra/reorder/SHA漂移、Common case引用Family driver、Profile source缺项/extra/link/hardlink/固定路径漂移、Staging预存在/位于source或output内、复制前后source漂移、Staging/final缺/extra/link/path/SHA/tree/package/binding drift、Verifier不带source-root或使用不同source、Common历史0.1.0、43 tree drift、Family 178->2 join drift、JAR/Web link/extra/SHA、dirty/wrong source、错误case数/顺序/7-9 expectation、146/48旧常量、staging/final/residual、rename/fsync和verifier写入；production还必须覆盖exact marker/temp存在、marker为link/directory/截断/Schema-invalid、lstat失败、其他source12 marker隔离、禁止scan/cleanup/覆盖，以及controlled mode不读取production quarantine目录。

### 11.4 必跑命令

```text
npm run release:canvas06:e2e:manifest:v02:test
npm run release:canvas06:visual-e2e-schema:test
npm run release:canvas06:e2e:runner:test
npm run contract:validate
git diff --check
```

代码未改Vue/Java，不要求在本切片运行浏览器194/388或Java集成；完整仓库验证由合并前clean source执行。

## 12. 回滚

删除v02新增入口/helper/test与package命令，恢复本任务对未发布活动v02 Schema的修改；不得删除或改写历史v01资产、既有release root或用户模型。已生成错误v02 root只能整体隔离，以新source identity重建，不得原地修补。

## 13. 状态边界

本规格完成仅表示Manifest v02 producer/verifier和活动137/57机器口径可实现。`e598... -> 9048bb3...`的17项集成及既有194-case Manifest只构成origin build证据，不是最终production source。production正例必须等待C/S/A/R全部形成，从fresh clean `R`与独立release store重建external统一输入，完成新进程Unified Verifier、外层staging与两个Manifest Verifier，并使Handoff、Intake、Manifest、source HEAD、Report和R六方逐字符相等；独立9项、8项、旧17项commit或A均不得消费为最终source。不得据此宣称E2E Report、`GATE-06-03`、Candidate、Activation、Capability、production发布或ISO 19450:2024符合性。
