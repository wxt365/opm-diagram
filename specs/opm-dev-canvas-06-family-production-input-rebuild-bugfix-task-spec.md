# Spec: DEV-CANVAS-06 Family Production Input 最小重建

文档状态：`FROZEN_FOR_EXECUTION`

执行状态：`UPSTREAM_REBUILD_COMPLETE / PRODUCTION_MANIFEST_NOT_STARTED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

从明确的 immutable base commit 和精确 source delta 创建新的 clean source commit，重建包含以下输入的 DEV-CANVAS-05 Handoff/Evidence Bundle/Intake，并生成、安装和重验唯一 production E2E Manifest `0.1.0`：

1. Evidence Bundle 内唯一 `handoff/reports/golden-replay.json`；
2. Evidence Bundle 内唯一 `golden/opm-e2e-family-fixture-identity-catalog.json`；
3. Family Identity Catalog `0.1/0.1.0` 对 `178 -> 2` base fixture 的完整 join；
4. 活动 Common Fixture Catalog `0.2.0` 的 `43=1+8+32+2` 文件根；
5. clean target Web dist、exact Runtime JAR和三个 family driver；
6. 安装后以固定 Handoff 路径重新验证 production Manifest。
7. GATE-05-01始终以显式TAP reporter执行，并将同一命令逐项写入机器报告，避免受控Node版本的默认reporter差异改变Gate计数。
8. 集成测试的Common、Controlled和Legacy helper只通过exact Intake `handoff_ref.path`解析本轮Candidate Handoff，禁止回退读取固定历史Handoff。

本规格替代“沿用 `opm-dev-canvas-05-clean-handoff-rebuild-task-spec.md` 即可纳入 Family Catalog/Builder”的错误解释。旧规格及其 `clean-1847172f5090` 结果保持历史只读。

## 2. Root Cause

旧 Clean Handoff 重建规格只授权修复 replay report archive entry，并把 source commit、版本根和验收结果固定到 `1847172f509005e8d50b525e274d41b9d73cf46c`。它没有授权：

- 将 Family Identity Catalog Schema/payload加入新的 source commit和Evidence Bundle；
- 将活动Common 43文件producer/verifier、E2E Manifest Builder/Verifier及driver加入source commit；
- 生成新的版本化Handoff/Intake；
- 安装新的固定路径Handoff；
- 对Family适配后的production Manifest执行正例和安装后重验。

因此旧规格不能扩展解释，本轮必须使用本独立规格。

首次按`36=3 M+33 A`执行已形成source commit `ef268177d9c9e64f6d72d64832328c790638cc70`和patch SHA `94ed125044ef3de97b09a14ef26ad55102392e0d29a7590710585d39a2661b2f`，第7.1节定向测试全部通过，且上游Bundle已生成；但`generate-dev-canvas-05-gate-evidence-reports.mjs`使用未显式指定reporter的`node --test`。受控Node 24默认输出为spec格式，而生成器按TAP正则计数，导致测试进程成功但报告记录`expected_cases=16/observed_cases=0`，Handoff以`GATE_05_01_EVIDENCE_MISSING`受控阻断。显式增加`--test-reporter=tap`后同一测试为`16/16`，因此根因是生成器命令与解析格式未闭合，不是Node 22缺失或Golden Contract失败。

首次retry已amend为source commit `70b73e806fee0ad12616d85923695095be07c62a`和patch SHA `52380c66a15422968364140e6459f1d693b07d03ae2ca814e3bdb7578aff904a`；37项身份、34项定向测试、GATE-05-01 TAP `16/16`、Bundle、READY Handoff和READY Intake均已闭合。随后第7.2节固定集成测试在执行任何Builder前暴露既有测试自相矛盾：`integrationInputs()`冻结错误文本为`CANVAS06 test roots must be absolute directories.`，断言却匹配`/absolute directory/`。唯一修正为将同一已allowlist测试文件中的断言改为`/absolute directories/`；不修改helper、生产行为、错误边界、路径集合或计数。

第二次retry已amend为source commit `7f4deb0b3f5eacb1790885dc09b8905f857de909`和patch SHA `5a71c2513c92e0675c073100e18dba4493bbed7681685d4f5a9b3217cdf5011d`；34项定向测试、GATE-05-01 TAP `16/16`、Bundle、READY Handoff和READY Intake再次闭合，plural断言也已越过。完整集成测试随后证明生产正例可读取exact Intake链，但`createCommonFixtureRoot()`、`createControlledBundle()`和`createLegacyProductionInput()`仍直接读取`<handoff-root>/dev-canvas-05-handoff.json`，导致Controlled/Legacy路径使用历史Runtime ref并以`runtime-jar differs from the exact Handoff artifact`遮蔽三个目标反例。唯一修正为三个helper先读取`CANVAS06_TEST_INTAKE_RELATIVE_PATH`指向的exact Intake，再按该Intake的`handoff_ref.path`读取Candidate Handoff；禁止固定basename回退、目录扫描、修改Runtime校验或放宽预期错误码。

## 3. 范围与非目标

### 3.1 允许

- 从第4章固定base commit创建专用clean source commit；
- 只在隔离source worktree amend第2章记录的当前retry source commit，保留GATE reporter和plural断言修复，并补齐三个测试helper的exact Intake -> Candidate Handoff解析，用最终amended commit替代前三次source/patch身份；
- 只提交第4.2节精确source delta；
- 在两个独立worktree和外部临时根中执行构建、预验、安装和重验；
- 新建 `handoff/releases/clean-<source-commit12>/`；
- 原子切换 `handoff/dev-canvas-05-handoff.json`；
- 更新本规格、Checklist和直接状态文档。

### 3.2 禁止

- 把当前主工作树的其他dirty文件、整个目录或未列明文件加入source commit；
- 修改Java、Vue、SQLite DDL、公共API、Profile既有fixture bytes、Grammar、Rule、Symbol或Capability语义；
- 修改或覆盖旧 `handoff/release/**`、`handoff/releases/clean-1847172f5090/**`、`clean-b940ac9bb734/**`；
- 从目录名反推source、Handoff、Intake、Catalog或Manifest身份；
- 生成E2E Report、Visual/Performance/Recovery READY Report、Candidate或Activation；
- 启用任何Capability或声明production/ISO 19450:2024符合性。
- 通过安装或切换到Node 22规避reporter漂移；受控Node版本可以变化，但GATE-05-01 reporter必须显式固定为TAP。

本任务不新增依赖，不修改 `package.json`、`package-lock.json`、Maven配置或 `.harness/**`。

本规格、Checklist和状态同步文档属于治理工作树，不进入第4章release source commit；否则会破坏37项exact delta。执行前必须计算本规格raw bytes SHA-256并记录为`executed_governing_spec_sha256`，执行全程只能使用该bytes版本；执行完成后的状态回填另记`current_spec_sha256`，不得反向重解释执行输入。治理文档提交与release source分支相互独立，不得把治理工作树的其他dirty bytes复制到source worktree。

## 4. Clean Source Commit

### 4.1 Immutable base

唯一base commit固定为：

```text
6d76bf6050adecfa5aa0acfb4b7b8a62d413df14
```

执行前必须满足：

```text
git rev-parse 6d76bf6050adecfa5aa0acfb4b7b8a62d413df14^{commit}
git merge-base --is-ancestor 6d76bf6050adecfa5aa0acfb4b7b8a62d413df14 <source-commit>
```

不得用`main`、`HEAD`、日期、tag或浮动branch替代该SHA。新source commit必须只有一个父提交；禁止merge commit。

### 4.2 Source delta allowlist

`git diff --name-status 6d76bf6050adecfa5aa0acfb4b7b8a62d413df14..<source-commit>`输出与下表条目必须分别规范化为UTF-8、LF并按path字典序排序，排序后逐项相等。`A/M`以base tree为准；不允许rename、copy、delete、submodule、目录通配符或额外路径。表格展示顺序不参与identity。

| 状态 | 路径 |
| --- | --- |
| `M` | `scripts/build-dev-canvas-05-release.mjs` |
| `M` | `scripts/generate-dev-canvas-05-gate-evidence-reports.mjs` |
| `M` | `docs/contracts/schemas/opm-dev-canvas-06-common-fixture-catalog.schema.json` |
| `M` | `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest.schema.json` |
| `A` | `docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json` |
| `A` | `docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle.schema.json` |
| `A` | `docs/contracts/schemas/opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json` |
| `A` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/golden/opm-e2e-family-fixture-identity-catalog.json` |
| `A` | `scripts/build-canvas06-common-visual-fixtures.mjs` |
| `A` | `scripts/verify-canvas06-common-visual-fixtures.mjs` |
| `A` | `scripts/canvas06-rfc8785.mjs` |
| `A` | `scripts/verify-canvas06-controlled-input-bundle.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-archive.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-compose.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-input.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-support.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-transaction.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-trust.mjs` |
| `A` | `scripts/release-canvas06-e2e-manifest-v01.mjs` |
| `A` | `scripts/verify-canvas06-e2e-manifest-v01.mjs` |
| `A` | `tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json` |
| `A` | `tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json` |
| `A` | `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.mjs` |
| `A` | `tests/e2e/release/dev-canvas-06/drivers/procedural-driver.mjs` |
| `A` | `tests/e2e/release/dev-canvas-06/drivers/control-driver.mjs` |
| `A` | `tests/e2e/release/dev-canvas-06/drivers/structural-driver.mjs` |
| `A` | `scripts/canvas06-rfc8785.test.mjs` |
| `A` | `scripts/common-visual-fixtures.test.mjs` |
| `A` | `scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs` |
| `A` | `scripts/verify-canvas06-controlled-input-bundle.test.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-input.test.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-transaction.test.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-archive.test.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-compose.test.mjs` |
| `A` | `scripts/canvas06-e2e-manifest-v01-trust.test.mjs` |
| `A` | `scripts/release-canvas06-e2e-manifest-v01.test.mjs` |
| `A` | `tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.test.mjs` |

总数固定为`37`：`4 M + 33 A + 0 D`。source commit创建前后均需按下式保存机器输出并断言集合相等：

```text
git diff --name-status 6d76bf6050adecfa5aa0acfb4b7b8a62d413df14..<source-commit>
git status --porcelain=v1 --untracked-files=all
git show --format= --no-ext-diff --binary <source-commit>
```

最后一条patch bytes的SHA-256作为`source_delta_patch_sha256`记录在执行Checklist；不新增自定义JSON证据格式。

第7.1节测试直接读取的两份固定资产必须以当前raw bytes进入source commit，禁止在重建阶段生成、格式化或替换：

| 固定测试资产 | raw SHA-256 |
| --- | --- |
| `tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json` | `5b3f081befd991a12ef36e4f512fb0c129dd22e60bdfe9af4731b993d970ac6a` |
| `tests/e2e/release/dev-canvas-06/fixtures/dev-canvas-06-common-fixture-catalog.json` | `9133096ad601b223b1e42112631acfff5506e80c403e4d9f529a1f398439f8ea` |

### 4.3 Source closure与测试去历史身份

完整source tree定义为`base tree + 第4.2节delta`，由40位source commit SHA唯一标识；不得再按运行时目录扫描扩大提交集合。执行前必须确认production Builder/Verifier/Common Builder/Verifier、GATE evidence generator及第7.1节固定测试的相对import和文件读取闭包全部位于37项delta或base tree；两份固定测试资产还必须复算为第4.2节记录的raw SHA-256。

`ef268177d9c9e64f6d72d64832328c790638cc70`、`70b73e806fee0ad12616d85923695095be07c62a`、`7f4deb0b3f5eacb1790885dc09b8905f857de909`及其patch SHA只保留为前三次失败尝试的历史证据，不得继续作为Handoff、Intake、Manifest或Report的source identity。最终amended source commit必须仍以`6d76bf6050adecfa5aa0acfb4b7b8a62d413df14`为唯一父提交，branch与detached target worktree都必须切换到最终commit并保持clean；随后按第4.2节37项集合重新计算`source_delta_patch_sha256`。禁止把任一旧patch SHA复制为新值。

`scripts/release-canvas06-e2e-manifest-v01.test.mjs`不得把`clean-b940ac9bb734`、`clean-1847172f5090`或任何本轮未知source前缀作为测试输入身份。测试必须从显式test root/ref读取本轮资产，legacy反例由测试在临时目录中构造；禁止复制旧版本根进入clean source worktree。

同一测试文件的`createCommonFixtureRoot()`、`createControlledBundle()`和`createLegacyProductionInput()`必须共用唯一解析顺序：读取`<CANVAS06_TEST_HANDOFF_ROOT>/<CANVAS06_TEST_INTAKE_RELATIVE_PATH>`的exact Intake -> 读取`intake.handoff_ref.path`指向的Candidate Handoff -> 使用其artifact/ref。禁止读取`<CANVAS06_TEST_HANDOFF_ROOT>/dev-canvas-05-handoff.json`、从release目录或basename反推Handoff，或在ref不闭合时回退历史固定文件。

## 5. 双 Worktree 与隔离根

必须从同一source commit创建两个独立worktree：

| 根 | 用途 | release启动时状态 |
| --- | --- | --- |
| `UPSTREAM_WORKTREE` | DEV-CANVAS-05 Bundle/Handoff/Intake生成 | clean |
| `TARGET_WORKTREE` | clean Web build、E2E Manifest source identity | clean；仅允许ignored `node_modules`、Web dist和Runtime target副本 |

另创建两个互不包含、均不位于任何worktree、handoff root或最终output root内的fresh根：

```text
COMMON_STAGING_ROOT
MANIFEST_OUTPUT_ROOT
```

禁止令`COMMON_STAGING_ROOT`位于source/output/handoff/controlled bundle root内；禁止令`MANIFEST_OUTPUT_ROOT`位于source/handoff/Common root内。这是E2E Builder现有path trust contract，不得由实现脚本放宽。

安装staging不属于Builder输入。其唯一路径固定为真实handoff根下：

```text
handoff/releases/.clean-<source-commit12>.tmp-<128-bit随机小写hex>
```

它与final版本根具有同一父目录和文件系统，且basename不得与任何既有final/staging重复；仅用于第7.5节同父atomic rename。

## 6. 版本化 Release Root

唯一版本根为：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-<source-commit前12位>/
```

final basename必须由40位source commit前12位派生，目录必须不存在。最终布局固定为：

```text
clean-<source-commit12>/
  dev-canvas-05-evidence-bundle.jar
  local-runtime-0.1.0-SNAPSHOT.jar
  dev-canvas-05-release-build.json
  dev-canvas-05-handoff.json
  dev-canvas-06-intake-report.json
  dev-canvas-06/
    common-fixtures/0.2.0/
      dev-canvas-06-common-fixture-catalog.json
      visual/**
      e2e/**
      sources/**
    e2e/manifests/<manifest-id>/
      dev-canvas-06-e2e-manifest.json
      inputs/**
```

`manifest-id`固定为`dev-canvas-06.e2e.<source-commit前12位>.<intake-report-raw-sha256前12位>`，不得由目录扫描或现有Manifest反推。

Common root必须恰为43个普通、非链接、单链接文件；Manifest final root必须与Builder原子输出逐byte相同。版本根一经安装不得修改或覆盖；重跑必须使用新的source commit。

## 7. 唯一执行顺序

### 7.1 Source与定向测试

1. 在既有专用source worktree确认`7f4deb0b3f5eacb1790885dc09b8905f857de909`、固定base和clean status；保留生成器显式TAP和plural断言修改，只修正第4.3节三个helper的exact Intake -> Candidate Handoff解析；
2. 复核三个helper均不再读取固定`dev-canvas-05-handoff.json`，且production/controlled/legacy Runtime ref都来自同一Candidate Handoff；
3. 再次amend为最终单父、非merge source commit；前三次commit只保留为superseded历史身份；
4. 将target worktree切换到amended commit，验证source delta精确相等、new patch SHA已记录、两个worktree初始clean；
5. 在source commit上执行以下不依赖本轮release root的固定测试；任一失败停止：

```text
node --test scripts/canvas06-rfc8785.test.mjs
node --test scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs scripts/verify-canvas06-controlled-input-bundle.test.mjs
node --test tests/e2e/release/dev-canvas-06/fixtures/factories/common-fixture-factory.test.mjs scripts/common-visual-fixtures.test.mjs
node --test scripts/canvas06-e2e-manifest-v01-input.test.mjs scripts/canvas06-e2e-manifest-v01-transaction.test.mjs scripts/canvas06-e2e-manifest-v01-archive.test.mjs scripts/canvas06-e2e-manifest-v01-compose.test.mjs scripts/canvas06-e2e-manifest-v01-trust.test.mjs
```

禁止把测试生成物、`handoff/releases/**`或当前主工作树其他dirty bytes纳入source commit。

### 7.2 DEV-CANVAS-05上游生成

在`UPSTREAM_WORKTREE`执行现有DEV-CANVAS-05 release build，输出到第6章版本根。`scripts/build-dev-canvas-05-release.mjs`必须同时归档`handoff/reports`和整个`0.2.0/golden`，因此Bundle内replay report和Family Catalog分别只能出现一次。

GATE-05-01唯一允许的子命令固定为：

```text
node --test --test-reporter=tap --test-name-pattern=GATE-05-01 scripts/validate-opl-golden-manifest.test.mjs
```

`scripts/generate-dev-canvas-05-gate-evidence-reports.mjs`的`spawnSync`参数必须与该命令一致；生成的GATE-05-01 Report `command`必须逐项等于：

```json
["node","--test","--test-reporter=tap","--test-name-pattern=GATE-05-01","scripts/validate-opl-golden-manifest.test.mjs"]
```

原始结果必须为TAP且包含`TAP version 13`，报告必须记录`expected_cases=16`、`observed_cases=16`、`passed_cases=16`、`failed_cases=0`、`errors=0`、`skipped=0`和`status=MATCHED`。实际命令、Report command、原始reporter格式或计数任一不一致，必须以`GATE_05_01_EVIDENCE_MISSING`阻断Handoff；禁止根据Node主版本选择不同解析器或静默回退默认reporter。

现有Handoff generator只读取历史固定alias `handoff/release/dev-canvas-05-release-build.json`。唯一允许的兼容步骤为：

1. 记录该历史descriptor raw SHA和`handoff/release/**` tree digest；
2. 在隔离`UPSTREAM_WORKTREE`内把新版本descriptor临时复制到固定alias；
3. 以固定输出相对路径生成candidate `handoff/dev-canvas-05-handoff.json`；
4. 立即恢复历史descriptor原bytes；
5. 断言历史`handoff/release/**` tree digest与步骤1相等；
6. 将candidate Handoff逐byte复制为版本根内`dev-canvas-05-handoff.json`。

该alias不得提交、不得进入版本根、不得留在失败现场。随后以`handoff`目录为`--handoff-root`、固定`dev-canvas-05-handoff.json`为`--handoff`生成版本根内Intake。Handoff必须`READY_FOR_DEV_CANVAS_06`，Intake必须`READY_FOR_RELEASE_VALIDATION`。

完成本轮版本根后执行唯一集成测试入口：

```text
CANVAS06_TEST_HANDOFF_ROOT=<UPSTREAM_WORKTREE内handoff根> \
CANVAS06_TEST_RELEASE_ROOT=<本轮clean-<source12>版本根> \
CANVAS06_TEST_INTAKE_RELATIVE_PATH=releases/clean-<source12>/dev-canvas-06-intake-report.json \
node --test scripts/release-canvas06-e2e-manifest-v01.test.mjs
```

三个环境变量均为必填、只用于测试输入定位，不参与production CLI或identity；测试必须拒绝缺失、相对/escape、symlink和不匹配ref。测试总数保持`23/23`，legacy production反例由测试临时构造，不读取历史`clean-*`版本根。

其中相对test root反例必须抛出`CANVAS06 test roots must be absolute directories.`，断言唯一固定为`/absolute directories/`。禁止改动helper文本、放宽绝对路径守卫，或用同时接受singular/plural的宽泛正则掩盖两者漂移。

### 7.3 Target build与Common root

在`TARGET_WORKTREE`执行固定target build：

```text
npm ci --ignore-scripts
npm run build
```

将上游版本根Runtime JAR逐byte复制到ignored `services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar`；SHA必须等于Intake锁定Handoff中的`LOCAL_RUNTIME_JAR`。此后`git status --porcelain=v1 --untracked-files=all`仍必须为空。

在`COMMON_STAGING_ROOT`执行Common Builder，输入candidate固定Handoff、固定`SOURCE_DATE_EPOCH=1782864000`；随后执行Common Verifier。构建前后必须分别记录43文件tree digest，Verifier前后digest相等。

### 7.4 Production E2E Manifest预验

Builder参数顺序固定为：

```text
node scripts/release-canvas06-e2e-manifest-v01.mjs \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <UPSTREAM_WORKTREE内handoff根> \
  --intake-report releases/clean-<source-commit12>/dev-canvas-06-intake-report.json \
  --source-root <TARGET_WORKTREE> \
  --source-date-epoch 1782864000 \
  --web-dist apps/web/dist \
  --runtime-jar services/local-runtime/target/local-runtime-0.1.0-SNAPSHOT.jar \
  --common-fixture-root <COMMON_STAGING_ROOT> \
  --common-fixture-catalog dev-canvas-06-common-fixture-catalog.json \
  --driver-root tests/e2e/release/dev-canvas-06/drivers \
  --output-root <MANIFEST_OUTPUT_ROOT> \
  --out dev-canvas-06/e2e/manifests/<manifest-id>/dev-canvas-06-e2e-manifest.json
```

随后必须执行：

```text
node scripts/verify-canvas06-e2e-manifest-v01.mjs \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <UPSTREAM_WORKTREE内handoff根> \
  --intake-report releases/clean-<source-commit12>/dev-canvas-06-intake-report.json \
  --manifest-root <MANIFEST_OUTPUT_ROOT>/dev-canvas-06/e2e/manifests/<manifest-id> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --require-production
```

Verifier前后Manifest tree digest必须相等。Manifest必须满足`194=178+16`、`388` attempt summary、Family fixture去重`2`、唯一`FAMILY_FIXTURE_IDENTITY_CATALOG` ref、完整43文件Common副本和三个driver顺序。

### 7.5 安装、固定Handoff切换与重验

1. 在真实`handoff/releases/`下创建第5章固定basename的fresh安装staging；
2. 逐byte复制上游版本根、Common 43文件根和Manifest final root，拒绝symlink/hardlink/extra；
3. 将candidate Handoff副本放入版本根，验证所有raw ref、Bundle entry和tree digest；
4. fsync全部普通文件、子目录、staging根和父目录；
5. 以单次atomic rename安装为第6章final版本根；
6. 以exclusive create保存旧固定Handoff到`handoff/.dev-canvas-05-handoff.backup-<old-raw-sha256>`，candidate写入`handoff/.dev-canvas-05-handoff.candidate-<new-raw-sha256>`；验证basename SHA与raw bytes、fsync两文件和父目录后，以candidate单次atomic rename替换`handoff/dev-canvas-05-handoff.json`；
7. 在真实handoff根运行Handoff validator和第7.4节production verifier；Verifier参数除root切换到真实安装根外不得改变；
8. 两项均成功后删除旧Handoff临时备份并fsync父目录。

backup文件的存在本身就是唯一`SWITCH_PENDING`标记；不新增另一种marker格式。任何进程启动或人工续跑发现该模式文件，必须先拒绝下游消费并用其bytes原子恢复旧固定Handoff，验证旧SHA、删除残留candidate、fsync父目录后，才能从步骤6重新开始。步骤5之前失败必须零final版本根、零固定Handoff变化。步骤6之后任一重验失败，必须按同一恢复流程恢复旧Handoff；新增版本根保留但标记为未激活，不得删除、覆盖或被下游引用。

## 8. 验收标准

1. amended source commit是base的单父后继，37项delta exact match，新patch SHA已冻结，source/target worktree clean；
2. source test不依赖任何固定历史`clean-*`身份；
3. GATE-05-01实际命令与Report command均为冻结TAP命令，原始输出和`16/16`计数闭合；
4. 固定集成测试的绝对目录反例精确匹配helper冻结文本，完整集成测试通过；
5. Bundle replay和Family Catalog entry各唯一一次，raw SHA与source/引用一致；
6. Handoff、Intake分别READY，固定production gate仍`DISABLED + []`；
7. Common root为43文件，Builder/Verifier前后tree digest不变；
8. production Manifest生成和预验通过，194/388、178/2、16 Common、唯一Catalog ref及三个driver闭合；
9. final版本根fresh、完整、不可变，旧version root和历史`handoff/release/**`digest不变；
10. 固定Handoff只在版本根完成安装后原子切换；安装后Handoff validator和production verifier再次通过；
11. 失败边界与第7.5节一致，固定Handoff可恢复到exact旧SHA；
12. Markdown链接、JSON Schema/JSON解析、定向测试和`git diff --check`通过。

## 9. 回滚

- source commit尚未用于生成证据：删除专用branch/worktree即可；不修改main；
- 版本根尚未安装：删除外部staging和临时worktree；固定Handoff不变；
- 版本根已安装但固定Handoff未切换：保留未激活版本根，不允许覆盖；
- 固定Handoff已切换但重验失败：按第7.5节恢复exact旧bytes；新版本根保持未激活；
- production Manifest已被后续Report引用：禁止删除任何版本根，只能以新source commit和新版本根替代。

## 10. 事实与状态边界

### 10.1 事实

1. 当前`main/origin/main`均为`6d76bf6050adecfa5aa0acfb4b7b8a62d413df14`；
2. 旧Clean Handoff规格已完成并绑定`1847172f509005e8d50b525e274d41b9d73cf46c`，不能授权本轮重建；
3. 首次source commit `ef268177d9c9e64f6d72d64832328c790638cc70`满足旧36项delta且定向测试通过，但上游Handoff因GATE-05-01 reporter漂移受控阻断；
4. 首次retry commit `70b73e806fee0ad12616d85923695095be07c62a`关闭reporter漂移并生成READY Handoff/Intake，但固定集成测试因自身singular/plural断言漂移阻断；
5. 第二次retry commit `7f4deb0b3f5eacb1790885dc09b8905f857de909`关闭plural断言并再次生成READY Handoff/Intake，但三个集成helper仍读取历史固定Handoff，造成Runtime ref漂移；
6. 三次失败尝试均未安装版本根、未切换主工作树固定Handoff，也未生成production Manifest；相关未安装版本根均保留在隔离备份；
7. 最终source commit为`a36a7f1fd709b72e66c57e5aea634da525c9c515`，patch SHA为`63dbbf49b99a51ccbb2bc72a9bb424df0979adaca883a40aa7c82e864391e74a`，保持`37=4 M+33 A`和固定base单父关系；
8. 定向`34/34`、GATE-05-01显式TAP `16/16 MATCHED`和完整集成`5/5`通过；Bundle、`READY_FOR_DEV_CANVAS_06` Handoff和`READY_FOR_RELEASE_VALIDATION` Intake已形成；
9. 主工作树固定Handoff未切换，production Common/Manifest、安装和production重验未开始。

### 10.2 未完成

- production Manifest正例和安装后重验尚未执行；
- Family Materializer、E2E Report、GATE-06-03、Candidate、Activation、Capability enablement、production release和ISO符合性仍未闭合。

## 11. Spec Mapping

| 需求 | 冻结位置 | 验证 |
| --- | --- | --- |
| source commit文件集合 | 第4章37项delta | base..source `name-status` exact match、两份固定测试资产raw SHA、新patch SHA、clean status |
| GATE-05-01跨Node稳定计数 | 第2、7.2节 | 实际命令、Report command、TAP raw、16/16和MATCHED逐项闭合 |
| 集成测试绝对目录反例 | 第2、7.1、7.2节 | helper冻结文本、exact断言和完整集成测试闭合 |
| 集成测试Candidate Handoff身份 | 第2、4.3、7.1、7.2节 | 三个helper从exact Intake `handoff_ref.path`解析同一Candidate，固定basename零读取 |
| 版本化release root | 第6章 | fresh basename、完整布局、tree/raw SHA、旧root不变 |
| Handoff/Intake重建 | 第7.2节 | READY状态、ref复算、历史alias恢复 |
| Common与Manifest输入隔离 | 第5、7.3、7.4节 | 独立root、43文件、production verifier、tree不变 |
| 固定Handoff切换 | 第7.5节 | fsync、atomic rename、旧SHA备份与恢复 |
| production重验 | 第7.4、7.5节 | 预验一次、安装后真实root再验一次 |
| 非目标与状态边界 | 第3、10章 | 零Report/Candidate/Activation/Capability/ISO提升 |
| 回滚 | 第9章 | 按阶段保留或恢复，不覆盖不可变版本根 |
