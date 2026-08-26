# Spec: DEV-CANVAS-06 统一 Source 生产输入重建

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_BUILD/NOT_STARTED`

生产重建状态：`NOT_RUN`

后继Production入口：`UNIFIED_EXTERNAL_RELEASE_STORE_MODE_REQUIRED`

活动后继规格：`opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-task-spec.md`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

以 `daf383df6d7faad866b84fceac0a2c9111a8c926` 为唯一基线提交，实现并执行一次统一生产输入重建，形成一个新的 clean `unified_source_commit`，并从该提交的同一 clean source-root 生成：

1. 版本化 DEV-CANVAS-05 Handoff `0.2`；
2. 与该 Handoff raw bytes 闭合的 READY Intake `0.1`；
3. exact Local Runtime JAR；
4. exact production Web dist tree；
5. exact Common `0.2.0` 43 文件输入根；
6. 可供 E2E Manifest v02 Producer/Verifier读取的四个固定 driver 和五个 Profile asset source 路径。

本包只形成受控生产输入，不实现或运行 E2E Manifest v02 Producer/Verifier，不生成 `194/388` Attempt、Report、Gate、Candidate、Activation、Capability 或 ISO 19450:2024 符合性证据。

## 2. Root Cause 与 Fix Strategy

### 2.1 Root Cause

当前活动 Common root 来自 `daf383df...`，但固定 Handoff/Intake 仍锁定旧 source commit，且 READY Handoff 只包含 `LOCAL_RUNTIME_JAR` 与 `EVIDENCE_BUNDLE` 两项。Manifest v02规格又未冻结 source-root 内 Runtime、Web 和四个 driver 的具体路径，也未定义 source build、Handoff副本和Manifest副本的三方 exact join。

因此实现者只能猜测 Web权威来源或混用旧 Handoff、新 Common和当前 checkout build；这种输入链不能产生可信的 production Manifest。

之前未被关闭，是因为 Common 43文件重建只验证了自身 factory、binding和raw refs，没有负责重新生成上游 Handoff、Intake、Runtime或Web。

### 2.2 Fix Strategy

1. 把 `daf383df...` 固定为 `base_source_commit`，而不是最终 production identity；
2. 本包实现 source delta 提交后得到新的 clean `unified_source_commit`；
3. 所有生产输入只从 `HEAD=unified_source_commit` 的同一 clean source-root 生成；
4. 新增 Handoff `0.2`，在 `build_artifacts` 中锁定 Runtime raw ref、Evidence Bundle raw ref和Web tree ref；历史 Handoff `0.1`保持原字节只读；
5. Common root不进入 Handoff `build_artifacts`，通过同一 source commit、factory raw bytes和active binding闭合，避免 `Common Builder -> READY Handoff -> Common artifact -> Handoff` 循环；
6. Manifest v02在后继实现中完成 Handoff/Intake、source-root、Common、Profile和final copy的最终 exact join。

## 3. 身份术语与事实边界

```text
base_source_commit
  = daf383df6d7faad866b84fceac0a2c9111a8c926

unified_source_commit
  = 本规格实现delta提交后的新40位clean commit

source12
  = unified_source_commit前12位

source_date_epoch
  = git show -s --format=%ct unified_source_commit

versioned_input_root
  = packages/profiles/profile.iso19450.2024.draft/0.2.0/
    handoff/releases/clean-<source12>
```

`unified_source_commit` 在实现提交前不得填写占位值、当前脏工作树 SHA、branch、tag或预期 SHA。执行 checklist 必须记录其完整40位值和本规格 source patch SHA。

现有 `releases/clean-daf383df6d7f/dev-canvas-06/common-fixtures/0.2.0` 仅是已通过自身 Verifier 的 Common输入；它不是本规格的最终 `versioned_input_root`，不得复制到新根后沿用旧 source identity。

## 4. 修改边界

### 4.1 实现 source delta 精确 allowlist

只允许以下 `23=11 M+11 A+1 D` 个非文档逻辑路径进入本包实现提交；source patch SHA必须在基于 `base_source_commit` 的 clean worktree 中复算并写入 checklist。新增Quarantine Marker Schema是统一Source失败根sidecar的唯一机器契约；后六项加共享`package.json`共同承接Bootstrap Build Closure嵌入切片，`package.json`只计一次：

| 预期 | 路径 |
| --- | --- |
| `A` | `docs/contracts/schemas/opm-dev-canvas-05-handoff-v02.schema.json` |
| `A` | `docs/contracts/schemas/opm-dev-canvas-06-unified-source-quarantine-marker.schema.json` |
| `M` | `scripts/build-dev-canvas-05-release.mjs` |
| `M` | `scripts/generate-dev-canvas-05-gate-evidence-reports.mjs` |
| `M` | `scripts/generate-dev-canvas-05-handoff.mjs` |
| `M` | `scripts/validate-dev-canvas-05-handoff.mjs` |
| `M` | `scripts/validate-dev-canvas-05-handoff.test.mjs` |
| `M` | `scripts/release-canvas06-intake.mjs` |
| `M` | `scripts/release-canvas06-intake.test.mjs` |
| `A` | `scripts/canvas06-unified-production-input.mjs` |
| `A` | `scripts/canvas06-unified-production-input.test.mjs` |
| `A` | `scripts/rebuild-canvas06-unified-production-inputs.mjs` |
| `A` | `scripts/rebuild-canvas06-unified-production-inputs.test.mjs` |
| `A` | `scripts/verify-canvas06-unified-production-inputs.mjs` |
| `A` | `scripts/verify-canvas06-unified-production-inputs.test.mjs` |
| `M` | `scripts/canvas06-e2e-manifest-v01-trust.mjs` |
| `M` | `package.json` |
| `M` | `apps/web/tsconfig.node.json` |
| `D` | `apps/web/vite.config.js` |
| `A` | `scripts/verify-opm-bootstrap-build-closure.mjs` |
| `A` | `scripts/verify-opm-bootstrap-build-closure.test.mjs` |
| `A` | `tests/e2e/opm-bootstrap-order.spec.ts` |
| `M` | `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalRuntimeBootstrapControllerTest.java` |

`canvas06-e2e-manifest-v01-trust.mjs` 只允许增加对 Handoff `0.2`和三项 artifact profile的只读验证；不得改变历史 Manifest `0.1` composer、输出字节或controlled trust语义。Bootstrap七路径子集只按`specs/opm-bootstrap-build-closure-bugfix-task-spec.md`修改；不得把该子包扩展到Bootstrap生产代码、`apps/web/vite.config.ts`、index/main、`.gitignore`或依赖版本。

### 4.2 只读消费

- `scripts/canvas06-e2e-manifest-v01-support.mjs` 的 `treeRef()`/`listTree()`公式；
- Common Builder、Verifier、factory及其测试；
- 四个 E2E driver；
- Profile五资产、Rule、Grammar、Symbol、Normalization；
- Versioned Handoff、Fixed Postverify既有设计和历史release root。

### 4.3 禁止修改

- 历史 `opm-dev-canvas-05-handoff.schema.json/0.1`、历史 Handoff/Intake/release root；
- Manifest v01/v02 Schema、Producer、Verifier、Runner、Fault、Recovery、Report、Gate、Candidate、Activation；
- OpenAPI、SQLite DDL/migration、Java/Vue业务语义、Profile业务bytes；
- `.harness/**`、依赖版本、lockfile、Maven坐标、公共HTTP wire；
- fixed Handoff切换、Capability enablement和ISO结论。

## 5. Clean Source 与固定 source-root 映射

### 5.1 Clean Source守卫

构建必须在独立 worktree执行，且在依赖安装和任何输出写入前满足：

```text
git rev-parse HEAD == unified_source_commit
git status --porcelain=v1 --untracked-files=all == ""
git merge-base --is-ancestor base_source_commit unified_source_commit == true
source delta == 第4.1节exact allowlist
```

禁止使用主工作树、dirty checkout、`HEAD~n`、branch、tag、mtime、目录扫描或已存在 build output 推断身份。`node_modules/**`、`target/**`、`dist/**`虽为ignored输出，仍必须由本次 clean build产生，禁止复用构建前残留；预检先要求这三个目标不存在。还必须要求`apps/web/vite.config.js`和`apps/web/vite.config.d.ts`均不存在，并先按Bootstrap Build Closure完成Node 22 source guard。

### 5.2 唯一相对路径

所有路径相对 `--source-root`，不得配置、扫描或fallback：

| 角色 | 唯一 source-root 相对路径 |
| --- | --- |
| Runtime JAR | `services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar` |
| Web dist | `apps/web/dist` |
| Procedural driver | `tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs` |
| Control driver | `tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs` |
| Structural driver | `tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs` |
| Common driver | `tests/e2e/release/dev-canvas-06/drivers/common-driver.mjs` |
| Common factory | `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs` |
| Common generator | `scripts/build-canvas06-common-visual-fixtures.mjs` |
| Profile manifest | `packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json` |
| Rule set | `packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json` |
| OPL grammar | `packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json` |
| Symbol catalog | `packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json` |
| Normalization adapter | `packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json` |

上述五项共同构成Profile Asset Source Set，只冻结clean source中的五个raw file identity，不要求、不得生成或宣称存在一个“source-root内且只包含五资产”的共同物理package root。本重建包只验证五项固定路径、raw bytes、Profile package/binding和同一`unified_source_commit`；供Manifest v02消费的Profile Asset Staging Root由后继Producer在source-root外fresh物化，不进入Handoff `build_artifacts`、versioned input root或本包tree identity。

五个Profile资产、四个driver和factory均已确认存在于 `base_source_commit` 的本表固定路径；Runtime与Web为构建输出，不应存在于 Git tree。任一路径后续漂移时本规格恢复 `BLOCKED`，不得由实现者改名、扫描或猜测。

### 5.3 固定构建命令

在 exact source-root、Node `22.x`、仓库 `packageManager=npm@10.9.4`、JDK 21环境中执行：

```text
npm ci --ignore-scripts
npm run build
npm run golden:coverage
npm run golden:replay
npm run compatibility:replay
npm run handoff:evidence
./mvnw -o -pl services/local-runtime package -DskipTests
```

实际完整 Node/JDK/OS值、lockfile SHA、pom SHA和上述规范 command string写入 `source_build`。`source_date_epoch`只取`unified_source_commit`的十进制committer epoch；Handoff与Intake的`generated_at`必须逐字符等于`Instant.ofEpochSecond(source_date_epoch).toString()`，Common Builder接收同一epoch。禁止这些三类机器文档使用当前时钟、mtime、环境变量或第二时间参数。Runtime、Evidence和Gate raw结果按本次clean build实际bytes锁定，不承诺跨两次独立执行byte-identical；同一`clean-<source12>`只允许安装一次且不得覆盖。不得要求 Node 24，不得用 Vite dev server、测试 classpath JAR或已有 dist/target替代本次输出。

GATE-05-01子进程参数和Report `command[]`必须逐项同为：

```text
node --test --test-reporter=tap --test-name-pattern=GATE-05-01 \
  scripts/validate-opl-golden-manifest.test.mjs
```

禁止依赖Node默认reporter；TAP进程退出、`16` observed、`0` fail和`0` skipped必须同时成立。

### 5.4 完整CLI

Builder：

```text
npm run release:canvas06:unified-input:rebuild -- \
  --source-root <absolute-clean-source-root> \
  --handoff-root <absolute-profile-handoff-root> \
  --base-source-commit daf383df6d7faad866b84fceac0a2c9111a8c926 \
  --source-commit <exact-unified-source-commit> \
  --out releases/clean-<source12> \
  --require-production
```

独立只读Verifier：

```text
npm run release:canvas06:unified-input:verify -- \
  --source-root <absolute-clean-source-root> \
  --handoff-root <absolute-profile-handoff-root> \
  --base-source-commit daf383df6d7faad866b84fceac0a2c9111a8c926 \
  --source-commit <exact-unified-source-commit> \
  --input releases/clean-<source12> \
  --require-production
```

每个参数恰好一次；拒绝未知、重复、空值、`--x=y`、位置参数、相对source/handoff root、source12不匹配和缺少`--require-production`。Verifier不得调用Builder/composer写入路径，不得写cache/temp/marker；验证前后完整input tree digest必须相等。

## 6. Handoff `0.2` 与 Web dist tree

### 6.1 版本策略

新增 `OPM-DEV-CANVAS-05-HANDOFF-001/0.2` Schema；历史 `0.1` Schema和历史文档保持原字节。Generator只生成活动 `0.2`，Intake production路径只接受 READY `0.2`；历史 `0.1`只允许显式 legacy audit，不得作为 Manifest v02 production输入。

除 `schema_version`和 `build_artifacts`约束外，Handoff `0.2`复用 `0.1` 的字段、34 Capability、binding、Gate、coverage、production disabled和report ref语义。

### 6.2 三项 build_artifacts

固定顺序、kind和版本根路径：

```text
0 LOCAL_RUNTIME_JAR
  releases/clean-<source12>/local-runtime-0.1.0-SNAPSHOT.jar

1 EVIDENCE_BUNDLE
  releases/clean-<source12>/dev-canvas-05-evidence-bundle.jar

2 WEB_DIST_TREE
  releases/clean-<source12>/web-dist
```

前两项是普通、非符号链接、`nlink=1` 文件raw ref。第三项仅在 Handoff `0.2.build_artifacts[2]` 使用同一 `{kind,path,byte_length,sha256}` 形状的封闭tree specialization；不得把目录按文件读取，不得用于其他Handoff字段。

### 6.3 Web tree唯一摘要

递归列出 Web root 下全部普通、非符号链接、`nlink=1` 文件；拒绝空tree、symlink、hardlink、socket、device、FIFO和其他special file。inventory entry固定为：

```json
{"path":"<tree-root-relative-path-with-/>","byte_length":0,"sha256":"<raw-file-sha256>"}
```

`path`不得为空、绝对、含 `\`、`.`或`..` segment。inventory按路径 UTF-8 bytes升序，序列化为既有 JCS，随后：

```text
byte_length = sum(entry.byte_length)
sha256 = SHA-256(UTF8(JCS(inventory)))
```

必须复用 `canvas06-e2e-manifest-v01-support.mjs` 的活动公式并增加固定 parity vectors；禁止另选ZIP、filesystem metadata、mtime、locale sort或Merkle算法。Web tree还必须拒绝 source map中的checkout绝对路径、Vite/HMR client和开发服务器入口。

### 6.4 权威来源与校验顺序

Web唯一权威来源是 exact clean source-root 本次 `npm run build`生成的 `apps/web/dist`。校验顺序固定：

```text
SOURCE_ROOT_IDENTITY
-> DIST_OUTPUT_FRESHNESS
-> ENTRY_TYPE_AND_PATH
-> EACH_RAW_LENGTH_SHA
-> SORTED_INVENTORY
-> TREE_LENGTH_SHA
-> COPY_TO_VERSION_STAGING
-> RECOMPUTE_STAGING_TREE
-> HANDOFF_REF_JOIN
```

Handoff中的逻辑 `path`指向安装后的不可变版本根；STAGING模式将 `releases/clean-<source12>/` 显式映射到本次 staging物理根。INSTALLED模式直接从真实 handoff root解析。禁止自动探测或模式fallback。

## 7. 版本化输入根布局

最终根恰为：

```text
releases/clean-<source12>/
  dev-canvas-05-evidence-bundle.jar
  local-runtime-0.1.0-SNAPSHOT.jar
  web-dist/**
  dev-canvas-05-release-build.json
  dev-canvas-05-handoff.json
  dev-canvas-06-intake-report.json
  handoff/reports/<exact 12 files>
  dev-canvas-06/common-fixtures/0.2.0/<exact 43 files>
```

本根是 Manifest v02的只读上游输入根，不包含 Manifest输出。后继 Producer必须写入另一个 fresh output root，禁止向该不可变输入根追加 `e2e/manifests/**`。历史规格中把Manifest放入同一版本根的布局不适用于本活动 v02输入事务。

`dev-canvas-05-release-build.json` 固定 `schema_version=0.2`，其 `source_build`和三项 `build_artifacts`必须与Handoff `0.2`逐字段相等。Common 43文件不进入该数组。

完整versioned input root摘要复用第6.3节inventory/JCS公式，但inventory覆盖根内全部普通文件且path相对`releases/clean-<source12>/`；该摘要只用于事务完整性，不替代任一内部raw/tree ref。

## 8. Common 与统一身份闭包

Common Builder只能在 `HEAD=unified_source_commit` 的同一 source-root进程中执行，使用本次 staging内 READY Handoff `0.2`和固定 `SOURCE_DATE_EPOCH`。输出仍恰为43个文件。

必须同时满足：

1. Common Catalog `source_binding`等于 Handoff `active_binding`；
2. Common factory mirror等于 `unified_source_commit`固定factory路径raw bytes；
3. Common generator mirror等于同一commit固定generator路径raw bytes；
4. Common Verifier按活动factory重算，`7 PASS+9 BLOCKED`及全部raw refs通过；
5. 现有 `clean-daf383df6d7f` root不得被复制或作为新root的raw source。

Common不反向进入Handoff，从而不存在身份循环。

## 9. Manifest v02 exact join

后继 v02 Producer/Verifier必须按以下唯一映射消费本规格输出：

| Source/Handoff输入 | Manifest final路径 | 必须相等 |
| --- | --- | --- |
| source-root Runtime JAR + Handoff `LOCAL_RUNTIME_JAR` | `inputs/build/local-runtime.jar` | 三方raw bytes、length、SHA |
| source-root Web dist + Handoff `WEB_DIST_TREE` | `inputs/build/web-dist` | 三方inventory、总length、tree SHA |
| 四个source-root driver固定路径 | `inputs/drivers/<same-basename>` | source/final raw bytes、length、SHA |
| Common 43文件root | `inputs/common/**` | exact 43 inventory和全部raw refs |
| Profile五资产固定Source Set | Producer先物化source-root外Profile Asset Staging Root，再写`inputs/upstream/profile-assets/**` | source/staging/final raw refs与逻辑tree三方相等、package、binding |
| READY Intake锁定的Handoff | `inputs/trust/handoff.json`、`intake-report.json` | raw ref和source commit |

四个driver不加入 Handoff `build_artifacts`。它们的信任来自：Producer明确 `--source-root`、source-root `HEAD`等于 Handoff `source_build.source_commit`、固定路径、final raw copy和Manifest `driver_catalog` ref；缺一即拒绝。

## 10. 唯一重建事务

```text
ARGS
-> EXACT_QUARANTINE_SIDECAR_GUARD
-> BASE_COMMIT_ANCESTRY
-> UNIFIED_SOURCE_CLEAN
-> SOURCE_ALLOWLIST_AND_PATCH_SHA
-> ABSENT_IGNORED_OUTPUTS
-> NPM_CI
-> BOOTSTRAP_SOURCE_CLOSURE_VERIFY
-> WEB_BUILD
-> BOOTSTRAP_POST_BUILD_CLOSURE_VERIFY
-> DEV_CANVAS_05_EVIDENCE_AND_RUNTIME_BUILD
-> SOURCE_RUNTIME_AND_WEB_VERIFY
-> CREATE_VERSION_STAGING
-> COPY_RUNTIME_EVIDENCE_WEB_REPORTS
-> WRITE_RELEASE_BUILD_0.2
-> WRITE_AND_VERIFY_HANDOFF_0.2_STAGING
-> WRITE_AND_VERIFY_READY_INTAKE_STAGING
-> BUILD_AND_VERIFY_COMMON_43_STAGING
-> VERIFY_SOURCE_PATHS_AND_ALL_JOINS
-> VERIFY_EXACT_STAGING_INVENTORY
-> FSYNC_FILES_AND_DIRECTORIES
-> ATOMIC_RENAME_TO_VERSION_ROOT
-> FSYNC_RELEASES_PARENT
-> SPAWN_INDEPENDENT_INSTALLED_VERIFIER
-> INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON
```

final、staging或pending residual已存在时拒绝覆盖。rename前失败删除本次新建 staging且final零输出；crash residual不自动续跑。rename后parent fsync、独立Verifier启动或installed reverify失败，必须保留原始root并按第10.1节写入sidecar quarantine marker，不得声明READY或被任何Producer/Verifier消费。

固定 Handoff `handoff/dev-canvas-05-handoff.json`不在本事务中切换；若后续需要切换，必须复用 Fixed Handoff Postverify规格另行执行。

### 10.1 Sidecar Quarantine Marker

Marker不进入失败版本根，唯一位置固定为Profile package root下：

```text
handoff/releases/quarantine/clean-<source12>.json
```

其中`source12=source_commit[0:12]`。禁止把marker写入`releases/clean-<source12>/**`、Handoff、Intake、Common、Manifest final root或固定Handoff；因此`pre_quarantine_tree_sha256`和原始失败根tree bytes不受marker写入影响。

唯一Schema为：

```text
docs/contracts/schemas/opm-dev-canvas-06-unified-source-quarantine-marker.schema.json
schema_id=OPM-DEV-CANVAS-06-UNIFIED-SOURCE-QUARANTINE-MARKER-001
schema_version=0.1
```

对象封闭且恰有八个字段，producer写入顺序固定为：

```text
schema_id
schema_version
status
input_root
source_commit
pre_quarantine_tree_sha256
failure_code
failure_stage
```

语义连接固定如下：

1. `status=QUARANTINED`；不得使用`PENDING/FAILED/READY`或布尔替代；
2. `input_root=releases/clean-<source12>`，无前导`handoff/`、无末尾`/`，其suffix必须逐字符等于`source_commit`前12位；
3. `source_commit`必须逐字符等于本轮`unified_source_commit`；
4. `pre_quarantine_tree_sha256`按第6.3/7节完整版本根inventory JCS公式，对atomic rename后、写marker前的原始失败根只读复算；不得使用预期SHA、staging SHA、mtime、目录SHA或marker SHA替代；无法完成该观测时marker写入失败；
5. `failure_code`只允许Schema中的六个post-rename稳定错误；`failure_stage`只允许`FSYNC_RELEASES_PARENT`、`SPAWN_INDEPENDENT_INSTALLED_VERIFIER`、`INSTALLED_REVERIFY_HANDOFF_INTAKE_WEB_COMMON`，二者必须记录导致quarantine的原始第一失败，不得写marker自身失败；
6. 不得增加时间、message、operator、retry、replacement root、raw path或任意extra字段。

Marker bytes固定为UTF-8、无BOM、2空格缩进、字段按上述顺序、单个末尾LF。唯一写入协议为：

```text
COMPUTE_AND_SCHEMA_VERIFY_IN_MEMORY
-> ENSURE_OR_CREATE_QUARANTINE_DIRECTORY_NOFOLLOW
-> FSYNC_RELEASES_PARENT_IF_CREATED
-> ASSERT_FINAL_MARKER_AND_EXACT_TEMP_ABSENT
-> O_EXCL_NOFOLLOW_CREATE quarantine/.clean-<source12>.json.tmp
-> WRITE_ALL_BYTES
-> FSYNC_TEMP_FILE
-> CLOSE
-> REREAD_RAW_AND_SCHEMA_SEMANTIC_VERIFY
-> ATOMIC_NO_REPLACE_RENAME_TO clean-<source12>.json
-> FSYNC_QUARANTINE_DIRECTORY
```

`quarantine/`缺失时只允许以普通目录创建并先fsync其父目录；任一路径segment为link/special、final marker或固定temp已存在、短写、fsync、复核、rename或directory fsync失败，统一返回`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`，stderr stage为失败步骤。不得覆盖marker、删除temp residual、修改失败根或回退为非原子写入。final marker已经完成rename但directory fsync失败时仍保留marker；消费者按存在即拒绝。

### 10.2 Exact Marker Guard与恢复权限

所有production消费入口固定从显式目标`clean-<source12>`构造以下两个exact path，不得列举`quarantine/`、扫描版本、读取`latest`、按mtime选择或从marker反推目标：

```text
handoff/releases/quarantine/clean-<source12>.json
handoff/releases/quarantine/.clean-<source12>.json.tmp
```

唯一顺序为：ARGS解析显式目标basename -> exact final/temp `lstat`且禁止follow link -> final或temp任一实体存在即拒绝 -> 才允许读取`clean-<source12>/**`。final marker存在时，统一Builder/Verifier返回`CANVAS06_UNIFIED_QUARANTINED/3`；temp residual存在或`lstat`发生I/O失败返回`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`。合法marker也只用于拒绝和独立恢复审计，不得被普通消费入口解释为可重试授权；非法、截断、link、directory或Schema-invalid marker同样fail-closed，禁止自动覆盖重建。

活动Manifest v02 production Producer/Verifier必须执行同一exact guard，具体错误和顺序由其规格第7.3、8~10节承接。controlled mode没有versioned production input root，不得读取该目录。

删除或移动失败`clean-<source12>`、final marker或temp residual，只能由后继独立`UNIFIED-SOURCE-QUARANTINE-RECOVERY-01`恢复规格和显式operator授权承接。当前rebuild、统一Verifier、Manifest Producer/Verifier、Gate和release runner全部只读拒绝；禁止自动cleanup、续跑、覆盖、同source identity重建或把quarantine根改名后继续消费。

## 11. 稳定错误与首错

| Code | Exit | 边界 |
| --- | --- | --- |
| `CANVAS06_UNIFIED_ARGUMENT_INVALID` | `2` | CLI、path、重复/未知参数 |
| `CANVAS06_UNIFIED_BASE_INVALID` | `2` | base ancestry、allowlist、patch SHA |
| `CANVAS06_UNIFIED_SOURCE_DIRTY` | `2` | wrong HEAD、dirty source、残留build output |
| `CANVAS06_UNIFIED_BOOTSTRAP_INVALID` | `3` | Node 22、Bootstrap source/dist/runtime wire/order或派生产物闭包失败 |
| `CANVAS06_UNIFIED_BUILD_FAILED` | `3` | npm/Maven/evidence/build失败 |
| `CANVAS06_UNIFIED_HANDOFF_INVALID` | `3` | Handoff `0.2`、三artifact或report refs失败 |
| `CANVAS06_UNIFIED_INTAKE_INVALID` | `3` | Intake非READY或raw Handoff join失败 |
| `CANVAS06_UNIFIED_WEB_TREE_INVALID` | `3` | Web entry、tree digest或copy join失败 |
| `CANVAS06_UNIFIED_COMMON_INVALID` | `3` | 43文件、factory、binding或语义失败 |
| `CANVAS06_UNIFIED_JOIN_MISMATCH` | `3` | source/Handoff/installed任一identity不一致 |
| `CANVAS06_UNIFIED_QUARANTINED` | `3` | exact sidecar marker存在，目标版本根不可消费或重建 |
| `CANVAS06_UNIFIED_TRANSACTION_FAILED` | `4` | staging、fsync、rename、quarantine失败 |

stderr首行固定 `<CODE>\t<STAGE>`；成功stdout只输出 versioned input root绝对路径、`unified_source_commit`和完整tree digest。按第10节顺序返回第一项失败，不并行竞争首错。

## 12. 测试与验收

### 12.1 必须先红后绿

1. Handoff只有历史两项时，活动 Intake production测试失败；
2. Handoff Web path指向目录但按raw file计算时失败；
3. source-root `HEAD`与Handoff source commit不同但四driver bytes恰好相同时仍失败；
4. 复制 `clean-daf383df6d7f` Common root到新版本根时source identity测试失败。

### 12.2 正例

- Handoff `0.2` Schema、三项artifact、READY guard通过；
- Node `22.22.0`根build、Bootstrap同源/入口顺序、Runtime `227 bytes/c74cff...`和派生产物闭包通过；
- Runtime/Web source-staging-installed三方join通过；
- READY Intake逐byte锁定新Handoff并记录同一 source commit；
- Common exact 43、binding、factory/generator mirror通过；
- 四driver和五Profile source路径存在且为普通单链接文件；
- 同一次clean build的Runtime、Evidence、Web、Handoff、Intake和Common在source/staging/installed三处保持exact bytes/tree digest。

### 12.3 反例

覆盖wrong base/HEAD/dirty、旧Handoff/Intake、artifact缺失/extra/reorder、Runtime drift、Web缺失/extra/link/hardlink/source-map绝对路径/HMR/tree drift、driver缺失/link/SHA drift、Common旧root/factory/binding/43 inventory drift、Profile path漂移、staging/final/residual、rename/fsync和installed reverify失败；还必须覆盖final marker/temp residual、marker link/directory/截断/extra/schema/id/source12/input root/tree/failure code/stage漂移、marker写入每一原子步骤失败、存在marker仍尝试重建，以及其他source12 marker存在但目标exact marker不存在的正交隔离。

### 12.4 必跑命令

```text
node --test scripts/canvas06-unified-production-input.test.mjs \
  scripts/rebuild-canvas06-unified-production-inputs.test.mjs \
  scripts/verify-canvas06-unified-production-inputs.test.mjs \
  scripts/validate-dev-canvas-05-handoff.test.mjs \
  scripts/release-canvas06-intake.test.mjs
npm run release:canvas06:common-visual:test
npm run release:canvas06:e2e:manifest:v02:test
npm run contract:validate
git diff --check
```

正式重建还必须记录 exact command、Node/JDK/OS、base/unified commit、source patch SHA、Handoff/Intake/Runtime/Web/Common摘要、43文件数、四driver raw SHA、Profile五资产raw SHA、installed verifier退出码和exact marker guard结果。单元测试、临时目录和当前 Common root不能替代该记录。

## 13. 完成、回滚与状态边界

只有实现allowlist提交、clean source build、原子安装和installed reverify全部完成，才可标记：

```text
IMPLEMENTED/UNIFIED_PRODUCTION_INPUT_READY_FOR_MANIFEST_V02
```

该状态只证明本规格23项统一输入链自身可消费。集成source commit`e598b305...`已形成，但旧Builder/Verifier仍绑定source内handoff root；活动production输入门必须由Unified External Release Store Mode后继规格形成新的单parent commit，并完成external统一输入与Manifest verifier闭包后解除。不得把本规格commit或source内installed root单独作为最终Manifest source identity，也不得提升 `194/388`、Report、GATE-06-03、Candidate、Activation、Capability、production release或ISO状态。

回滚时只允许删除本次尚未安装的staging。已安装错误根必须保留原始tree并以sidecar marker隔离，不能原地修改；其删除、移动和marker/temp处理等待独立恢复规格与operator授权。历史release root、固定Handoff、用户模型和现有 `clean-daf383df6d7f` Common root不得删除或覆盖。
