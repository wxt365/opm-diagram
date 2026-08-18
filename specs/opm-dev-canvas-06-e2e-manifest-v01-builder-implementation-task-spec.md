# Spec: DEV-CANVAS-06 E2E Manifest 0.1 Builder 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`IMPLEMENTED_RELEASE_INPUT_REBUILD_REQUIRED`（活动Common 43文件root与Family Identity Catalog适配已完成定向`23/23`；production正例等待独立最小重建规格执行）

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现唯一 E2E Manifest `0.1` builder/verifier：从 `CONTROLLED_TEST` 或 `PRODUCTION_HANDOFF` 的 exact Intake/Handoff/Evidence Bundle、Family Fixture Identity Catalog `0.1/0.1.0`、clean target build和已通过02B verifier的活动Common Fixture Catalog `0.2.0` 43文件根确定性生成 `194=178+16` 个case的Manifest，并以单一目录级原子提交保证任一失败零输出。

唯一输出身份固定为：

```text
schema_id=OPM-DEV-CANVAS-06-E2E-MANIFEST-001
schema_version=0.1
manifest_version=0.1.0
generator_identity.runner_version=0.1.0
```

本规格不授权 Visual builder、E2E runner/Report、Golden Authoring、Candidate、Activation 或 production gate。

## 2. 设计输入

- `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md`；
- `specs/opm-dev-canvas-06-visual-e2e-contract-task-spec.md`；
- `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest.schema.json`；
- `docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json`；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.4`；
- `specs/opm-dev-canvas-06-common-catalog-e2e-asset-output-closure-bugfix-task-spec.md`；
- `docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json`；
- `docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json`；
- `specs/opm-dev-canvas-06-family-fixture-identity-source-closure-bugfix-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md` 的 `GATE-06-03`。

发生冲突时，本规格只细化 E2E `0.1` builder；Visual `0.2`、bundle identity和既有Schema仍以上述上游文档为准。Common输入布局和信任边界唯一采用Visual Common `v1.4`的活动43文件root，不得回退到checkout历史fixture目录。

## 3. 唯一 owner 与模块边界

| 模块 | 唯一职责 | 禁止职责 |
| --- | --- | --- |
| `scripts/release-canvas06-e2e-manifest-v01.mjs` | CLI、两类输入信任链、safe materialization、join、Manifest 构造和单次原子提交 | 运行浏览器、写 Report、读取 golden/approved 输入 |
| `scripts/verify-canvas06-e2e-manifest-v01.mjs` | 只读复算 Schema、ref、join、计数、排序、identity 和 input class | 修复、复制、解包、写临时文件、提升 Gate |
| 共享 exact-input 库 | raw ref、JCS/SHA、安全 path/archive、目录 tree digest | 选择 Manifest 类型/版本或写 final output |

历史 `scripts/release-canvas06-visual-e2e-manifest.mjs` 禁止创建或恢复。E2E builder 必须拒绝全部 Visual/Golden 参数：`--approved-version-root`、`--golden-authoring-report`、`--golden-environment`、`--capture-plan`、`--materialization-root`、`--golden-root`、`--visual-manifest`。

## 4. 完整 CLI

### 4.1 生产模式

```text
npm run release:canvas06:e2e:manifest -- \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读handoff_bundle_root> \
  --intake-report <handoff-root内相对READY intake path> \
  --source-root <clean target checkout> \
  --source-date-epoch <非负十进制秒> \
  --web-dist <source-root内相对production dist path> \
  --runtime-jar <source-root内相对exact LOCAL_RUNTIME_JAR path> \
  --common-fixture-root <只读02B活动43文件root> \
  --common-fixture-catalog <common-fixture-root内相对catalog path> \
  --driver-root <source-root内相对tests/e2e/release/dev-canvas-06/drivers> \
  --output-root <evidence_output_root> \
  --out <dev-canvas-06/e2e/manifests/<manifest-id>/dev-canvas-06-e2e-manifest.json>
```

### 4.2 受控模式

```text
npm run release:canvas06:e2e:manifest -- \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读canvas06-controlled-<identity> root> \
  --source-root <clean target checkout> \
  --source-date-epoch <非负十进制秒> \
  --web-dist <source-root内相对production dist path> \
  --runtime-jar <source-root内相对exact LOCAL_RUNTIME_JAR path> \
  --common-fixture-root <只读02B活动43文件root> \
  --common-fixture-catalog <common-fixture-root内相对catalog path> \
  --driver-root <source-root内相对tests/e2e/release/dev-canvas-06/drivers> \
  --output-root <fresh controlled_output_root> \
  --out <dev-canvas-06/e2e/manifests/<manifest-id>/dev-canvas-06-e2e-manifest.json>
```

### 4.3 参数约束

1. 每个参数只能出现一次；未知、缺失、重复、空值、`--x=y`、位置参数和未列出的 flag 固定退出 `2`；
2. `PRODUCTION_HANDOFF` 必须拒绝 `--controlled-bundle-root`；`CONTROLLED_TEST` 必须拒绝 `--handoff-root/--intake-report`；
3. `--source-root` 必须是 clean commit 的非 symlink 目录；Web dist、JAR和driver必须是其内non-symlink实体；`--common-fixture-root`是独立只读普通目录，必须通过Visual Common `v1.4` 02B semantic verifier，且不得等于或位于source/output/handoff/controlled bundle root内；
4. `--output-root` 可已存在，但 `dev-canvas-06/e2e/manifests/<manifest-id>` final root 必须不存在；受控模式还要求 output root 不等于、不位于 production evidence root；
5. `--out` 必须是 output root 内规范相对 path，且精确匹配固定 final path；禁止绝对路径、`..`、symlink parent、alternate filename 或已有目标；
6. 环境只能提供 `JAVA_HOME` 以定位 Java 21 `jar`，以及正常进程环境；任何环境变量都不能替代 CLI ref、模式、source epoch、Common root或output path；禁止新增`--e2e-root`、`--source-root`派生Common路径或目录扫描旁路。

只读 verifier 命令按模式固定为：

```text
npm run release:canvas06:e2e:manifest:verify -- \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读handoff_bundle_root> \
  --intake-report <handoff-root内相对READY intake path> \
  --manifest-root <final transaction root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --require-production

npm run release:canvas06:e2e:manifest:verify -- \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读canvas06-controlled-<identity> root> \
  --manifest-root <final transaction root> \
  --manifest dev-canvas-06-e2e-manifest.json
```

生产 verifier 必须重新验证READY Intake -> exact Handoff -> Evidence Bundle信任链，并逐byte比较final root的三份raw copy；受控 verifier必须重新验证descriptor/identity/`approved_version_ref=null`和三份raw ref，再逐byte比较final root。mode-specific输入不得省略或互换。`--require-production`只允许且必须用于`PRODUCTION_HANDOFF`；与`CONTROLLED_TEST`组合、生产模式缺失该flag或任一模式出现对方参数均固定退出`2`。受控成功只证明builder contract，不构成Gate证据。

## 5. Controlled bundle 与 archive 布局

### 5.1 Bundle root

E2E controlled bundle 必须为：

```text
tests/e2e/release/dev-canvas-06/bundles/controlled/
  canvas06-controlled-<bundle-identity-sha256>/
    controlled-bundle.json
    refs/
      intake/dev-canvas-06-intake-report.json
      handoff/dev-canvas-05-handoff.json
      release/dev-canvas-05-evidence-bundle.jar
```

`controlled-bundle.json.approved_version_ref` 必须显式为 JSON `null`。三个 ref 必须分别 exact 指向上述普通文件；文件名、目录和 raw bytes 都是受控输入的一部分，不允许 descriptor 指向 root 外、symlink、hardlink 到可写 output 或同名替代文件。

### 5.2 Evidence Bundle 内逻辑布局

受控 Evidence Bundle 必须以与生产 bundle 相同的 archive entry path 保存上游资产：

```text
packages/profiles/<profile-id>/<profile-version>/
  profile.json
  symbols/<symbol-catalog-file>.json
  golden/
    opm-opl-coverage-catalog.json
    opm-opl-golden-manifest.json
    opm-e2e-family-fixture-identity-catalog.json
    fixtures/<family-fixture>.json
  handoff/reports/golden-replay.json
```

1. Catalog entry 只能通过 READY Handoff/Intake exact ref 和文件 identity 确定，禁止按 basename 扫描或取第一个匹配项；
2. Symbol entry 只能从 active `profile.json` 的 `SYMBOL_ASSET` required logical path 解析，identity/digest 必须等于 Intake active binding；
3. Family Identity Catalog entry路径固定为`golden/opm-e2e-family-fixture-identity-catalog.json`，必须通过`OPM-DEV-CANVAS-06-E2E-FAMILY-FIXTURE-IDENTITY-CATALOG-001/0.1` Schema、payload SHA，并绑定当前Golden Manifest raw SHA；禁止basename扫描或source checkout替代；
4. family fixture entry 只能取 178 个 Golden Manifest case 的 `base_revision_fixture/input_revision_fixture` ref 并去重；其中Family case的base `fixture_ref`深度去重集合当前恰为2，并与Identity Catalog SHA集合一一相等；
5. archive 可包含 DEV-CANVAS-05 其他 allowlisted release 资产，但 E2E materialization allowlist 只包含上述被引用 entry；
6. controlled 与 production 使用同一 archive safety、ref join、entry allowlist 和 materialized aggregate 算法，不允许 controlled-only 简化格式。

### 5.3 Common fixture 与 driver 输入

Common 输入不放入 Evidence Bundle，也不从clean target checkout读取。唯一输入是02B成功发布并通过Visual Common `v1.4` semantic verifier的活动43文件root：

```text
<common-fixture-root>/
  dev-canvas-06-common-fixture-catalog.json
  visual/<8个subject-id>.json
  e2e/<16个case-id>.base.json
  e2e/<16个case-id>.input.json
  sources/scripts/build-canvas06-common-visual-fixtures.mjs
  sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
```

Catalog必须满足`schema_id=OPM-DEV-CANVAS-06-COMMON-FIXTURE-CATALOG-001/schema_version=0.1/catalog_version=0.2.0`、`summary=8/16`，source binding与exact Intake active binding相等，并由02B verifier闭合exact 43文件inventory、8个Visual、32个E2E、两份source mirror、24项factory ref和全部raw ref。Builder在写staging前验证源root前后tree digest不变，再把完整43文件树逐byte复制到final `inputs/common/`；不得只挑Catalog/E2E文件。历史`0.1.0`、旧Catalog/factory/32 E2E source布局、缺8个Visual或两份source mirror的root统一返回`E2E_MANIFEST_COMMON_FIXTURE_INVALID/2`。

三个driver仍从clean target checkout的`--driver-root`读取，分别映射`DRIVER-PROCEDURAL/CONTROL/STRUCTURAL`；公共case使用Catalog的factory，不新增`driver_catalog`第四项。

## 6. 单一 final transaction root

### 6.1 最终布局

生产和受控输出使用同一内部布局；区别仅由 `input-class.json` 的受控内存派生内容、外部模式和 root 所有权证明，不新增 Manifest 字段：

```text
<output-root>/dev-canvas-06/e2e/manifests/<manifest-id>/
  dev-canvas-06-e2e-manifest.json
  inputs/
    build/
      package-lock.json
      local-runtime.jar
      web-dist/**
    raw/
      intake/dev-canvas-06-intake-report.json
      handoff/dev-canvas-05-handoff.json
      release/dev-canvas-05-evidence-bundle.jar
    upstream/
      catalogs/coverage-catalog.json
      catalogs/golden-manifest.json
      catalogs/family-fixture-identity-catalog.json
      reports/golden-replay-report.json
      profile/profile.json
      profile/symbol-catalog.json
      fixtures/<archive-entry-path的percent-encoded稳定相对路径>.json
    common/
      dev-canvas-06-common-fixture-catalog.json
      visual/<8个subject-id>.json
      e2e/<common-case-id>.base.json
      e2e/<common-case-id>.input.json
      sources/scripts/build-canvas06-common-visual-fixtures.mjs
      sources/tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs
    drivers/
      procedural-driver.mjs
      control-driver.mjs
      structural-driver.mjs
```

`input-class.json` 不落盘；class 由 CLI、controlled descriptor 或 READY Intake/Handoff、final root 所有权和 refs 联合验证。`inputs/upstream/catalogs/family-fixture-identity-catalog.json`必须是Evidence Bundle内固定Catalog entry的逐byte副本；`inputs/common/`必须恰有43个普通非链接单链接文件，复制前后source/target tree digest相等，Catalog全部ref在target内保持同一相对结构并可复算。任何额外文件、symlink、hardlink、socket、device、FIFO、临时文件、lock 或未知 fixture 使 verifier 退出 `2`。

`inputs/build/**`也是同一事务的一部分：`package-lock.json`和`local-runtime.jar`逐raw byte复制，`web-dist/**`逐普通文件复制并保留规范相对path，不保留source mtime、owner或绝对path。`source_build.web_dist`使用既有fileRef形状的封闭tree specialization：`kind=WEB_DIST_TREE`、`path=inputs/build/web-dist`、`byte_length=全部普通文件byte_length之和`、`sha256=sha256(JCS([{path,byte_length,sha256}]按UTF-8 path排序))`。除该`WEB_DIST_TREE`外，所有fileRef都必须指向non-symlink普通文件并按raw bytes复算。

### 6.2 路径规范化

family fixture materialized basename 不是原 basename。其相对路径固定为 `fixtures/<percent-encoded-archive-entry-path>.json`，编码输入是 UTF-8 archive path，除 ASCII 字母数字、`.`、`-`、`_` 外逐 byte 使用大写 `%HH`；`/` 也编码为 `%2F`。两个不同 entry 不得得到相同路径。Manifest `archiveEntryRef.archive_entry_path` 保留原 path，`path` 指向 final transaction root 内物化文件。

## 7. Manifest 字段到输入 ref 的唯一映射

| Manifest 字段 | 唯一来源 |
| --- | --- |
| `schema_id/schema_version/manifest_version` | 固定`OPM-DEV-CANVAS-06-E2E-MANIFEST-001/0.1/0.1.0` |
| `manifest_id` | `dev-canvas-06.e2e.<source_build.source_commit前12位>.<intake_report_ref.sha256前12位>`；同时是final root basename |
| `generated_at` | CLI `--source-date-epoch`转换成UTC RFC 3339，禁止读取wall clock |
| `generator_identity` | `runner_version=0.1.0`；source commit取clean source HEAD；Node取实际full version；Playwright/Chromium取lockfile和其browsers metadata固定版本；OS取实际platform/arch/build；command取按第4章参数顺序规范化且路径相对各root的命令；runner source SHA取final source commit中的builder bytes |
| `intake_report_ref` | `inputs/raw/intake/dev-canvas-06-intake-report.json` raw fileRef；内容必须是 READY Intake |
| `handoff_ref` | `inputs/raw/handoff/dev-canvas-05-handoff.json` raw fileRef；与 Intake exact handoff ref 相等 |
| `upstream_source_build` | READY Intake 深度复制，不从 source checkout重建 |
| `source_build` | source commit取clean HEAD；`dirty_before_build=false`；`build_command="npm ci --ignore-scripts && npm run build"`；Node取actual full version；lockfile SHA复算`inputs/build/package-lock.json`；Web dist取上述`WEB_DIST_TREE`；Runtime JAR取`inputs/build/local-runtime.jar` raw fileRef且SHA等于Intake exact JAR |
| `upstream_input_refs[0]` | coverage materialized `archiveEntryRef` |
| `upstream_input_refs[1]` | Golden Manifest materialized `archiveEntryRef` |
| `upstream_input_refs[2]` | Golden Replay materialized `archiveEntryRef` |
| `upstream_input_refs[3]` | active Symbol materialized `archiveEntryRef` |
| `upstream_input_refs[4]` | `inputs/raw/release/dev-canvas-05-evidence-bundle.jar` 普通 fileRef |
| `input_materialization.bundle_ref` | 与 `upstream_input_refs[4].ref` 深度相等 |
| `input_materialization.java_version` | exact `${JAVA_HOME}/bin/java -version`规范化单行值，major必须为21，并与执行archive检查的`jar`同一JDK home |
| `input_materialization.entry_allowlist` | 上述 4 个上游文件、active profile、Family Identity Catalog、全部去重 family base/input fixture 的原 archive path，UTF-8 字典序 |
| `input_materialization.materialized_count` | allowlist 长度，不含 raw archive/Common/driver |
| `input_materialization.aggregate_sha256` | `sha256(JCS([{archive_entry_path,path,byte_length,sha256}] 按 archive_entry_path 排序))` |
| `input_materialization.temporary_directory_cleaned` | 固定`true`；仅在所有archive工作temp已删除且staging内只剩final allowlist materialization后才能构造Manifest；final transaction staging自身不属于该字段所称archive temp |
| `common_fixture_catalog_ref` | final root内`inputs/common/dev-canvas-06-common-fixture-catalog.json` raw fileRef；其活动43文件root已经逐byte复制并通过同一02B semantic verifier |
| `environment_policy` | 固定`locale=zh-CN/timezone=Asia/Shanghai/color_scheme=light/reduced_motion=reduce/device_scale_factor=1` |
| `fixture_refs[]` | 所有 `cases[].fixture_ref/input_ref` 的深度去重并加唯一Catalog普通fileRef后，按`path + NUL + sha256` UTF-8字典序排序；Catalog ref固定`kind=FAMILY_FIXTURE_IDENTITY_CATALOG/path=inputs/upstream/catalogs/family-fixture-identity-catalog.json` |
| `driver_catalog[]` | 三个 final root driver source fileRef，顺序固定 Procedural、Control、Structural |
| `suite_catalog[]` | `E2E-CANVAS-001~007` 数字序 |
| `coverage_summary` | 固定 `178/130/48/16`，并从 case 集合复算 |
| `transaction_policy` | `policy_id=DEV-CANVAS-06-E2E-TRANSACTION-POLICY-001`、`policy_version=0.1` |
| `summary` | 固定 `194/178/130/48/16/388/0/0/0/0/0`，不得写 observed 运行结果 |

普通 fileRef、`WEB_DIST_TREE` specialization 与 archiveEntryRef 不得互换。所有 `path` 相对 final transaction root；verifier必须lstat，普通文件读取raw bytes复算length/SHA，Web dist递归拒绝symlink/extra并复算sum/tree SHA。

## 8. Case 派生

### 8.1 Family `178`

1. Coverage Catalog 是主表，按既有顺序输出；以 `(capability_id,case_id,variant_key,expectation)` 与 Golden Manifest 一对一 join，再以 `case_id` 与 Golden Replay 一对一 join；
2. `fixture_ref/input_ref` 分别取 Golden Manifest base/input fixture 的 materialized archiveEntryRef；
3. 178个Family `fixture_ref`深度去重后当前恰为2；其SHA集合必须与Identity Catalog `entries[].fixture_sha256`一一相等，Catalog每项还必须与exact fixture的Model/Context/Revision/sequence深度一致，parent按“fixture字段存在则字符串、缺失则Catalog显式`null`”归一后相等；
4. `expected_transaction` 取 Replay 两次 attempt 深度相等的 transaction；BLOCKED 还必须与 Golden Manifest expected transaction 相等；
5. driver 由 capability family 唯一映射；viewport=`VP-1440X900`、zoom=`Z-100`；
6. PASS assertion IDs 固定 `REVISION_COMMITTED/PROJECTION_MATCHED/TEXT_TRACE_MATCHED/TRANSACTION_MATCHED/REOPEN_MATCHED`；BLOCKED 固定 `ERROR_CODE_MATCHED/TRANSACTION_ZERO/HEAD_UNCHANGED/PROJECTION_UNCHANGED/REOPEN_MATCHED`。

### 8.2 Common `16`

按 Common Catalog `e2e_cases[]` 顺序输出。`case_id`、base/input ref、expected transaction 和 assertion IDs 只能由 Catalog/factory contract 读取；Manifest `fixture_ref/input_ref`必须重定基到final root内`inputs/common/e2e/**`的逐byte副本，并保持raw length/SHA不变；`driver_id=DRIVER-COMMON`，不含 `capability_id/coverage_key`。Catalog action 不唯一或不能确定一个 case-level expected transaction 时构建失败，禁止选择首项或合并 observed 结果。

## 9. 零输出事务

builder 固定执行：

```text
参数/模式
  -> 输入 root 与 exact raw ref
  -> source build/活动Common 43文件root/driver preflight
  -> archive central-directory safety + allowlist/Catalog/fixture join
  -> 计算 manifest_id/final root 并确认 fresh
  -> 在 final root 同父目录排他创建 .<manifest-id>.tmp-<随机128位>
  -> 全部 build/raw copy/materialization/Common 43文件tree/driver copy 写入 staging
  -> 构造 Manifest
  -> Schema + semantic verifier 对 staging 完整只读验证
  -> 每个文件 fsync、从叶到根 fsync 目录
  -> 单次 atomic rename(staging root, final root)
  -> fsync final parent
```

1. 写 staging 前的失败为严格零输出；
2. staging 后任一失败必须只删除本次随机 staging root，final root、final Manifest 和 final input 均不存在；
3. rename 成功是唯一提交点；禁止分别提交 inputs 和 Manifest、写 current/latest pointer、覆盖 final root或从上次 staging 续跑；
4. rename 后 parent fsync 失败固定退出 `4`，final root保留但视为不可声明成功，必须人工隔离整个 final root，禁止重跑覆盖；
5. 进程崩溃留下的 `.tmp-*` 永远不是合法输入，后续 builder 在创建新 staging 前检测到同 manifest ID 的任一 temp 时退出 `2`，由人工删除；
6. verifier只接受final basename与`manifest_id`相等的完整root，拒绝staging、缺项和extra；并必须用第4.3节mode-specific外部信任根重新闭合input class与raw copy，不能从调用方flag单独相信class。

## 10. 稳定错误与退出码

```text
E2E_MANIFEST_ARGUMENT_INVALID
E2E_MANIFEST_INPUT_CLASS_INVALID
E2E_MANIFEST_CONTROLLED_BUNDLE_INVALID
E2E_MANIFEST_INTAKE_INVALID
E2E_MANIFEST_HANDOFF_MISMATCH
E2E_MANIFEST_SOURCE_BUILD_INVALID
E2E_MANIFEST_ARCHIVE_INVALID
E2E_MANIFEST_INPUT_REF_MISMATCH
E2E_MANIFEST_FAMILY_IDENTITY_INVALID
E2E_MANIFEST_JOIN_MISMATCH
E2E_MANIFEST_COMMON_FIXTURE_INVALID
E2E_MANIFEST_DRIVER_INVALID
E2E_MANIFEST_CASE_SET_INVALID
E2E_MANIFEST_SCHEMA_INVALID
E2E_MANIFEST_OUTPUT_NOT_FRESH
E2E_MANIFEST_ATOMIC_COMMIT_FAILED
E2E_MANIFEST_IO_ERROR
E2E_MANIFEST_INTERNAL_ERROR
```

退出码：`0=合法 final Manifest`、`2=参数/Schema/ref/root/class/安全非法`、`3=结构合法但 build/join/fixture/case/identity 不匹配`、`4=I/O、atomic commit 或内部错误`。stdout 仅允许成功时输出 final 相对 path；失败时 stdout 为空，stderr 第一行是稳定 code。

## 11. 实现范围

允许修改：两个 E2E builder/verifier 脚本及定向测试、必要的共享只读 helper、`package.json` 命令、本规格/checklist和实现状态同步。

禁止修改：E2E/Visual/Common/controlled Schema、Visual builder、Java/Vue/API/SQLite、现有 fixture bytes、Handoff/Profile、E2E runner/Report、Candidate/Activation、production gate和 `.harness/**`。缺少 driver 文件时由本实现包新增三个最小测试 driver；不得修改公共 fixture 语义。

## 12. 验收

1. 两类模式各有完整正例，相同受控 bytes 与 epoch 两次 clean 构建的 final tree digest 相同；
2. 参数重复/未知/模式互用/Golden 参数/路径逃逸/symlink/hardlink/非 fresh 输出均在提交前阻断；
3. controlled descriptor 缺 `approved_version_ref`、非 `null`、identity/raw ref 不闭合均退出 `2`；
4. archive duplicate/path traversal/symlink/size limit、Catalog/Replay/Symbol/fixture ref tamper 和 ordinary/archive ref 混用均阻断；Family Identity Catalog缺失、Schema/payload/Golden Manifest SHA错误、entry缺失/额外/重复、Project命名空间或fixture deep join错误均零final输出；活动Common正例必须证明`43=1+8+32+2`、source/target tree digest相等、16 case顺序和24项factory ref闭合；历史`0.1.0`、旧source布局、缺项/额外项/E2E tamper均在final root写入前阻断；
5. 178 family +16 common、130 PASS +48 BLOCKED、194 case、388 attempt summary、五类 upstream ref、case fixture union加唯一Identity Catalog raw ref和三个 driver 顺序可复算；
6. staging 每一阶段注入失败都满足 final root零输出；rename 成功后 verifier只读通过且前后 tree digest相等；
7. controlled verifier必须消费exact descriptor root且不能接受`--require-production`；production verifier必须消费exact READY Handoff/Intake并强制`--require-production`，跨模式root/参数全部拒绝；
8. 不生成 E2E Report、Candidate、Activation，不启用 Capability。

## 13. 事实与状态边界

当前 E2E Manifest `0.1` Schema、活动Common Fixture Catalog/fixture、controlled bundle descriptor/verifier和Family Identity Catalog适配已存在；定向`23/23`已证明Catalog从受控Bundle到Manifest raw ref、178 -> 2集合和fixture deep join。现有production Evidence Bundle不含Catalog，因此实现状态为`IMPLEMENTED_RELEASE_INPUT_REBUILD_REQUIRED`；唯一后续入口是`opm-dev-canvas-06-family-production-input-rebuild-bugfix-task-spec.md`。完成重建和production重验也只证明Manifest输入闭包，不表示E2E Report、GATE-06-03、浏览器E2E、生产发布或ISO 19450:2024符合性。
