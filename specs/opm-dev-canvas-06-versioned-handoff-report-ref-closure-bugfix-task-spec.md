# Spec: DEV-CANVAS-06 Versioned Handoff Report Ref Closure

文档状态：`FROZEN_WITH_POSTVERIFY_SUCCESSOR`

执行状态：`SOURCE_AND_RELEASE_ROOT_COMPLETE / FIXED_SWITCH_BLOCKED`

设计修订：`2026-08-20 FIXED_HANDOFF_POSTVERIFY_SUCCESSOR`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

修正已安装 `clean-a36a7f1fd709` 暴露的 Candidate Handoff 引用闭包缺陷，并冻结下一次 clean source、版本根生成、安装和固定 Handoff 切换的唯一执行契约：

1. Candidate Handoff 的全部直接 `fileRef` 必须位于同一 `releases/clean-<source12>/` 不可变版本根；
2. 10 个被 Handoff 直接引用的 Report/Schema/Asset 与 2 个 Gate 原始结果统一物化到 `handoff/reports/**`；
3. `handoff/reports/**` 纳入版本根固定布局、staging tree 校验和安装后 raw ref 重验；
4. 固定 Handoff 只原子替换 `dev-canvas-05-handoff.json`，不得复制、覆盖或切换固定 `handoff/reports/**` alias；
5. 本修正必须从 `a36a7f1fd709b72e66c57e5aea634da525c9c515` 产生新的 source commit 和新的 `clean-<new-source12>`；
6. 已安装 `clean-a36a7f1fd709` 永久保留、只读，不得覆盖、改写、删除或作为新 Handoff 的报告引用目标。

本规格只冻结修正和后续执行入口，不生成新 commit、版本根、Candidate、Activation，不启用 Capability，也不构成 production 或 ISO 19450:2024 符合性证据。

## 2. Root Cause

Family Production Input 重建把 Runtime、Evidence Bundle、Common 和 E2E Manifest 安装进版本根，但 Handoff generator 仍把 12 个证据文件复制到固定 `handoff/reports/**`，并按固定 Handoff 根生成 `reports/**` 引用。结果是：

- `clean-a36a7f1fd709/dev-canvas-05-handoff.json` 的 build artifact 已指向版本根；
- 同一 Handoff 的 Report/Schema/Asset 引用仍指向可变固定 alias；
- 固定 Handoff 切换后，validator 读取到固定 alias 中另一组 bytes，出现 length/SHA 不一致并回滚；
- 旧流程只验证“路径当前存在”，没有验证 source commit、handoff_id、版本根前缀和安装身份为同一闭包。

之前未被发现，是因为上游 Handoff/Intake 在隔离 worktree 中与当时固定 alias bytes 一致，production Manifest 预验也没有模拟“版本根已安装后仅切换固定 Handoff JSON”的真实解析边界。

首次冻结的`12=10 M+2 A`又遗漏了E2E production builder和verifier两个`loadReadyTrustChain()`调用点。规格要求production trust显式传递`STAGING/INSTALLED`模式，同时旧allowlist只允许修改trust owner，若在owner内部默认`INSTALLED`又违反第9.1节禁止fallback规则。该冲突已在隔离worktree由“缺少mode”和“mutable `reports/**`被拒绝”两类失败复现，因此source commit阶段继续阻断，必须先把两个调用点纳入精确delta。

## 3. 范围与非目标

### 3.1 允许修改

实现阶段只允许修改第 5.2 节 source delta 的 14 个文件；治理工作树允许同步本规格、Checklist 和第 13 章列出的状态文档。

允许修改：

- DEV-CANVAS-05 release builder、Handoff generator/validator；
- DEV-CANVAS-06 Intake 与 E2E production trust 的直接 Handoff ref 校验；
- E2E Manifest production builder/verifier调用点的显式`mode: 'INSTALLED'`参数；
- 对应 Node 测试与 package script；
- 新增唯一 versioned Handoff ref owner 及其测试；
- 版本根 layout/staging/install/reverify 的设计与状态文档。

### 3.2 禁止修改

- 不修改 JSON Schema 字段、公共 API、SQLite schema、Java、Vue、Profile、Rule、Grammar、Symbol、fixture 或 Capability 语义；
- 不引入依赖，不修改 lockfile、Maven 配置或 `.harness/**`；
- 不回改已执行的 Family Production Input source commit 或其历史证据；
- 不修改 `clean-a36a7f1fd709/**` 的任何 bytes、metadata 或目录项；
- 不删除固定 `handoff/reports/**` 历史 alias，但新 Candidate Handoff 禁止引用它；
- 不从目录扫描、mtime、固定 alias、branch、tag 或当前 `HEAD` 猜测版本身份；
- 不生成 E2E/Visual/Performance/Recovery READY Report、Release Candidate 或 Activation；
- 不启用任何 Capability，不声明 production release 或 ISO 符合性。

### 3.3 “所有 raw ref”范围

本规格中的 Handoff raw ref closure 固定为 Handoff Schema 直接可达的下列字段：

```text
build_artifacts[]
revision_contract.schemas[]
gate_evidence[].evidence
coverage_summary.evidence[]
compatibility_summary.evidence
blockers[].evidence
```

READY Candidate 的 `blockers=[]`。Gate Report JSON 内部的 `source_refs[]` 和 `raw_result` 是该 Report 自身的 provenance，不是 Handoff 直接 `fileRef`，本次不改变其 Schema、路径语义或 source mirror。若未来要求这些嵌套 ref 也以安装根解析，必须另开版本化 provenance 规格，不得由本实现者扩展解释。

## 4. 缺陷复现基线

冻结复现输入：

```text
source_commit=a36a7f1fd709b72e66c57e5aea634da525c9c515
installed_release_root=releases/clean-a36a7f1fd709
fixed_handoff_restored_sha256=0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326
```

最小复现条件：

1. 读取 `clean-a36a7f1fd709/dev-canvas-05-handoff.json`；
2. 确认 build artifact 为 `releases/clean-a36a7f1fd709/**`；
3. 确认 revision/gate/coverage/compatibility 直接 ref 为 `reports/**`；
4. 将该 Candidate bytes 作为固定 Handoff 后从真实 handoff root 验证；
5. validator 因固定 alias Report 的 byte length/SHA 与 Candidate ref 不一致而失败并恢复旧固定 Handoff。

`clean-a36a7f1fd709` 是缺陷复现和历史安装证据，不是本规格的可变输入或新激活目标。

## 5. Clean Source Commit

### 5.1 Immutable base

唯一 base commit：

```text
a36a7f1fd709b72e66c57e5aea634da525c9c515
```

新 source commit 必须：

- 只有该 commit 一个 parent，禁止 merge commit；
- 在隔离 clean worktree 中创建；
- `source_commit !== a36a7f1fd709b72e66c57e5aea634da525c9c515`；
- 以新 SHA 前 12 位派生唯一 `clean-<source12>`；
- final root 和任何同名 staging 均必须事先不存在。

### 5.2 Source delta allowlist

`git diff --name-status <base>..<new-source>` 规范化、按 path 字典序排序后必须精确等于 `14=12 M+2 A`：

| 状态 | 路径 |
| --- | --- |
| `M` | `package.json` |
| `M` | `scripts/build-dev-canvas-05-release.mjs` |
| `M` | `scripts/generate-dev-canvas-05-handoff.mjs` |
| `M` | `scripts/validate-dev-canvas-05-handoff.mjs` |
| `M` | `scripts/release-canvas06-intake.mjs` |
| `M` | `scripts/canvas06-e2e-manifest-v01-trust.mjs` |
| `M` | `scripts/release-canvas06-e2e-manifest-v01.mjs` |
| `M` | `scripts/verify-canvas06-e2e-manifest-v01.mjs` |
| `M` | `scripts/validate-dev-canvas-05-handoff.test.mjs` |
| `M` | `scripts/release-canvas06-intake.test.mjs` |
| `M` | `scripts/canvas06-e2e-manifest-v01-trust.test.mjs` |
| `M` | `scripts/release-canvas06-e2e-manifest-v01.test.mjs` |
| `A` | `scripts/dev-canvas-05-versioned-handoff-refs.mjs` |
| `A` | `scripts/dev-canvas-05-versioned-handoff-refs.test.mjs` |

不允许 D/R/C/submodule/extra。实现提交前必须再次检查上述测试的 import、production调用点和 raw file read 闭包；若发现14项之外的真实必需输入，必须暂停并修订本规格，不得运行时读取主 dirty worktree。

`source_delta_patch_sha256` 固定为以下命令 stdout 原始 bytes 的 SHA-256，值在执行 Checklist 中回填：

```text
git show --format= --no-ext-diff --binary <new-source-commit>
```

### 5.3 Base调用闭包

调用闭包只以第5.1节immutable base tree计算。执行前以下命令必须恰返回6处：trust定义1处、controlled内部调用1处、trust test调用2处、Manifest builder/verifier production调用各1处：

```text
git grep -n "loadReadyTrustChain(" a36a7f1fd709b72e66c57e5aea634da525c9c515 -- scripts
```

`scripts/canvas06-e2e-manifest-v01-trust.mjs`、其test及两个Manifest production调用文件均已在14项allowlist中。当前治理工作树中晚于base出现的E2E Report verifier不属于本次source tree或delta，不得从治理工作树复制进入isolated source；其未来mode迁移由所属E2E Runner实现规格承接。

### 5.4 已执行 source

本规格source实现已在隔离clean worktree形成并完成精确delta校验：

```text
source_commit=37c5412a9c12c1b3ae06d6f7abe734804fa53c7b
parent=a36a7f1fd709b72e66c57e5aea634da525c9c515
source_delta=14=12 M+2 A
source_delta_patch_sha256=8680d7f1253d445207055e4eacf831278c04919f7b5574b1b0ce624d81fa4bfe
```

对应`clean-37c5412a9c12`版本根已经形成。该执行结果不改变第10章后继postverify阻断，也不授权fixed Handoff切换。

## 6. 唯一 Ref Owner

新增 `scripts/dev-canvas-05-versioned-handoff-refs.mjs` 作为唯一 owner。Builder、Generator、Validator、Intake 和 E2E production trust 必须 import 同一模块，禁止复制正则、路径列表或 identity 算法。

`loadReadyTrustChain({ root, intakePath, handoffPath, mode })`的`mode`为必填且无默认值：

- `scripts/release-canvas06-e2e-manifest-v01.mjs`的production分支必须逐字传入`mode: 'INSTALLED'`；
- `scripts/verify-canvas06-e2e-manifest-v01.mjs`的production分支必须逐字传入`mode: 'INSTALLED'`；
- `loadControlledReadyTrustChain()`内部必须逐字传入`mode: 'CONTROLLED'`；
- 参数缺失、未知值或调用分支/mode不一致必须在读取Handoff direct raw ref前以稳定输入错误拒绝；禁止默认`INSTALLED`、按路径猜测mode或失败后fallback。

`CONTROLLED`只复用既有controlled bundle descriptor、Schema/status和Intake-to-Handoff raw ref相等校验，不进入版本化安装根resolver，也不得作为production正例。版本化物理ref resolver仍只有第9.1节的`STAGING/INSTALLED`两种模式。

### 6.1 Identity

owner 只接受小写 40 位 commit SHA：

```text
source12 = source_commit.slice(0, 12)
release_prefix = releases/clean-<source12>
handoff_id_suffix = <source12>
```

必须同时满足：

- `handoff.source_build.source_commit` 等于 descriptor/source worktree commit；
- `handoff.handoff_id` 末段等于 `source12`；
- 2 个 build artifact、10 个直接报告引用都以同一 `release_prefix/` 开头；
- 不接受其他 `clean-*`、固定 `reports/**`、绝对路径、反斜杠、`.`、`..`、空段、percent encoded escape 或 symlink/hardlink。

### 6.2 固定报告集合

版本根 `handoff/reports/` 必须恰有 12 个普通、非 symlink、`nlink=1` 文件：

```text
active-grammar.json
golden-contract.json
golden-contract.tap
golden-coverage-catalog.json
golden-coverage.json
golden-manifest.json
golden-replay.json
revision-compatibility.json
revision-v01.schema.json
revision-v02.schema.json
trace-closure.json
trace-closure.xml
```

Handoff 直接引用其中 10 个 JSON；`golden-contract.tap` 和 `trace-closure.xml` 由对应 Gate Report 的 provenance 引用，不重复加入 Handoff direct ref 数组。目录中缺项、额外项、重复 basename、非普通文件、symlink、hardlink、length/SHA 不一致均阻断。

### 6.3 直接引用映射

| Handoff 字段 | 固定目标 basename |
| --- | --- |
| `revision_contract.schemas[version=0.1]` | `revision-v01.schema.json` |
| `revision_contract.schemas[version=0.2]` | `revision-v02.schema.json` |
| `gate_evidence[GATE-05-01].evidence` | `golden-contract.json` |
| `gate_evidence[GATE-05-02].evidence` | `golden-replay.json` |
| `gate_evidence[GATE-05-03].evidence` | `golden-coverage.json` |
| `gate_evidence[GATE-05-04].evidence` | `trace-closure.json` |
| `gate_evidence[GATE-05-05].evidence` | `golden-replay.json` |
| `gate_evidence[GATE-05-06].evidence` | `revision-compatibility.json` |
| `coverage_summary.evidence[]` | `golden-coverage-catalog.json`、`golden-manifest.json`、`active-grammar.json`、`golden-coverage.json`、`golden-replay.json` |
| `compatibility_summary.evidence` | `revision-compatibility.json` |

同一 basename 可被多个语义字段引用，但所有重复引用的 `path/byte_length/sha256/kind` 必须逐字段完全相等。每个 path 固定为：

```text
releases/clean-<source12>/handoff/reports/<basename>
```

## 7. 版本根固定布局

新版本根必须恰按以下布局形成：

```text
releases/clean-<source12>/
  dev-canvas-05-evidence-bundle.jar
  local-runtime-0.1.0-SNAPSHOT.jar
  dev-canvas-05-release-build.json
  dev-canvas-05-handoff.json
  dev-canvas-06-intake-report.json
  handoff/
    reports/
      <第 6.2 节 12 个文件>
  dev-canvas-06/
    common-fixtures/0.2.0/**
    e2e/manifests/<manifest-id>/**
```

固定基础文件数为 `17=5 root files+12 report files`；完整 tree 文件数为：

```text
17 + 43 Common files + exact Manifest tree file count
```

staging descriptor 必须记录并验证三部分的 sorted relative path、byte length、SHA-256 和 tree digest。除 `handoff`、`dev-canvas-06` 两个固定目录外不得出现其他 root entry；除第 6.2 节集合外不得出现其他 report entry。

## 8. Builder 与 Generator 契约

### 8.1 Release Builder

唯一 CLI：

```text
node scripts/build-dev-canvas-05-release.mjs \
  --handoff-root <absolute-handoff-root> \
  --release-root releases/clean-<source12>
```

Builder 必须：

1. 从 clean source worktree `HEAD` 取得 source commit；
2. 用 owner 验证 release root identity；
3. 拒绝已存在 final/staging basename；
4. 执行既有 coverage/replay/compatibility/Gate/Runtime build；
5. 写 2 个 build artifact、descriptor 和 12 个 report 文件；
6. 在返回成功前验证 12 文件集合、raw SHA 和 descriptor artifact ref；
7. 不写固定 `handoff/release/**`、`handoff/reports/**` 或固定 Handoff。

### 8.2 Handoff Generator

唯一 CLI：

```text
node scripts/generate-dev-canvas-05-handoff.mjs \
  --handoff-root <absolute-handoff-root> \
  --release-root releases/clean-<source12> \
  --out releases/clean-<source12>/dev-canvas-05-handoff.json
```

Generator 只能从同一版本根的 descriptor 和 `handoff/reports/**` 读取输入；禁止读取 target report、固定 release descriptor、固定 report alias 或目录中其他版本。输出前必须用 owner 完成 identity、mapping、length/SHA 和 READY guard 校验。

## 9. Staging 与安装验证

### 9.1 两种解析模式

版本化Handoff raw-ref resolver只允许两种显式物理解析模式：

- `STAGING`：逻辑 ref 仍为 `releases/clean-<source12>/**`，物理读取将该前缀映射到显式 `release_staging_root`；不得声称 installed closure；
- `INSTALLED`：直接以真实 handoff root 解析 ref；禁止提供 staging 映射。

两种模式的 schema、identity、文件类型、path、length 和 SHA 规则完全相同。E2E production builder/verifier只能传`INSTALLED`；安装前Candidate/Intake/staging verifier只能传`STAGING`。controlled bundle调用使用第6章的显式`CONTROLLED` trust class，不属于物理resolver模式。禁止自动探测、fallback、“先固定 alias、再 staging”或根据目录形状切换mode。

### 9.2 Staging 固定位置

安装 staging 只能位于真实 handoff root 同父文件系统：

```text
releases/.clean-<source12>.tmp-<32 lowercase hex>
```

执行顺序固定为：

1. 创建全新 staging；
2. 复制 17 个基础文件、Common 43 文件和 exact Manifest tree；
3. fsync 每个文件和已创建目录；
4. 以 `STAGING` 模式验证 Candidate Handoff、Intake、全部 direct raw refs、Common 和 Manifest；
5. 验证 staging tree 无缺项、额外项、链接和 digest drift；
6. fsync staging 与 `releases/`；
7. 一次 atomic rename 到 `clean-<source12>`；
8. fsync `releases/`；
9. 以 `INSTALLED` 模式从真实安装根重验 Candidate Handoff、Intake、全部 direct raw refs、Common 和 production Manifest。

步骤 9 全部通过前不得触碰固定 Handoff。

## 10. 固定 Handoff 原子切换

本章原第7、8步把fixed path等价验证与installed Intake production trust合并为同一verifier输入，无法同时满足完整ref路径相等，已由后继规格替代：

```text
specs/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-task-spec.md
```

唯一允许改变的固定入口仍为：

```text
handoff/dev-canvas-05-handoff.json
```

切换前6步、backup marker和旧raw SHA恢复边界保持不变；切换后的唯一验证顺序改为：

1. 独立postverify runner读取fixed Handoff并证明其raw bytes与Intake锁定的versioned Handoff相等；
2. 同一runner证明Manifest内Handoff副本raw bytes相等；
3. production Manifest verifier继续以installed Intake和versioned Handoff执行`--require-production`；
4. runner生成`READY_FOR_SWITCH_FINALIZATION` Report后，按后继规格完成backup marker删除与live guard；
5. 任一失败恢复旧fixed exact SHA，BLOCKED/孤立READY Report不得作为当前active证据。

禁止同时复制或替换固定 `handoff/reports/**`、`handoff/release/**`、Common、Manifest 或其他 alias。固定 Handoff bytes 中每个直接 raw ref 必须指向已安装的新版本根；任何 ref 指向 `reports/**`、`clean-a36a7f1fd709` 或其他版本根均阻断。

禁止修改Intake、构造fixed Intake、放宽`sameRef()`、让production verifier读取fixed path或增加任何路径fallback。

## 11. 首错、失败与回滚

首错优先级固定为：

```text
ARGUMENT -> SOURCE_IDENTITY -> RELEASE_PATH -> REPORT_SET -> REF_SHAPE -> REF_BYTES
-> STAGING_TREE -> INTAKE -> COMMON -> MANIFEST -> INSTALL -> FIXED_HANDOFF -> POSTVERIFY
```

稳定边界：

- atomic install 前失败：删除本轮 fresh staging，零新 final root，固定 Handoff SHA 不变；
- install 后、fixed switch 前失败：保留新 final root为未激活只读证据，固定 Handoff不变；
- fixed switch 后失败：用保存的旧 raw bytes经同目录 temp+fsync+atomic rename恢复，验证旧 SHA精确相等；新版本根保留且不得覆盖；
- 任一阶段不得删除、改写或以同名重建 `clean-a36a7f1fd709`；
- source/build/install缺陷重跑必须产生新的source commit和版本根；独立postverify工具或attempt失败可在subject bytes完全不变时按后继规格使用新tool commit或新attempt ID重跑，禁止修改既有版本根。

## 12. 测试与验收

### 12.1 定向自动化

新 source commit 必须执行：

```text
node --test scripts/dev-canvas-05-versioned-handoff-refs.test.mjs
node --test scripts/validate-dev-canvas-05-handoff.test.mjs
node --test scripts/release-canvas06-intake.test.mjs
node --test scripts/canvas06-e2e-manifest-v01-trust.test.mjs
node --test scripts/release-canvas06-e2e-manifest-v01.test.mjs
```

package.json 必须提供覆盖同一集合的稳定入口；不得改变既有 production CLI 的 release 语义或引入外部网络依赖。

### 12.2 Production Manifest versioned fixture

`scripts/release-canvas06-e2e-manifest-v01.test.mjs`的production正例不得继续读取固定Handoff或把`clean-a36a7f1fd709`/`clean-b940ac9bb734`作为活动身份。每个测试必须在fresh临时`handoff_root`内按以下唯一顺序构造versioned fixture：

1. 以测试进程所在clean source worktree的`git rev-parse HEAD`作为唯一`source_commit`，要求40位小写hex；
2. 派生`source12`和`releases/clean-<source12>`，禁止硬编码未来真实source SHA；
3. Runtime JAR和Evidence Bundle seed只能来自`CANVAS06_TEST_RELEASE_ROOT`；READY Handoff/Intake seed只能按`CANVAS06_TEST_HANDOFF_ROOT + CANVAS06_TEST_INTAKE_RELATIVE_PATH -> intake.handoff_ref.path`解析；12个report seed只能来自clean source worktree内tracked `packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/reports/<basename>`。创建版本根并逐byte复制这些seed；seed只提供测试bytes，复制后必须在临时根重新计算全部ref；
4. 从READY seed Handoff深复制，唯一修改`source_build.source_commit`、`handoff_id`、两个build artifact ref和第6.3节全部direct ref；所有path必须指向临时版本根，length/SHA按临时bytes重算；
5. 写临时版本根`dev-canvas-05-release-build.json`和`dev-canvas-05-handoff.json`，descriptor/Handoff/source12必须闭合；
6. 从READY seed Intake深复制，只更新`handoff_ref`及由Handoff raw bytes决定的identity字段，写入同一版本根`dev-canvas-06-intake-report.json`；禁止从目录名反推ref；
7. production builder和verifier均以临时`handoff_root`、versioned Intake相对路径调用，并在各自production分支显式传`mode: 'INSTALLED'`；
8. 正例完成后验证final Manifest引用临时versioned Handoff/Intake/Bundle，且不存在`reports/**`或旧`clean-*`ref。

该fixture仅是Node integration test输入，不是release authoring输出：不得复制到真实handoff root、不得写入Evidence Bundle、不得作为Gate/Report/Candidate/Activation证据。测试结束必须删除fresh临时根。

### 12.3 必须覆盖的反例

- 任一 direct ref 为 `reports/**`；
- 任一 direct ref 指向 `clean-a36a7f1fd709` 或另一版本根；
- source12、handoff_id、descriptor、artifact/report 前缀不一致；
- 12 个 report 缺项、额外项、重复、symlink、hardlink、length/SHA drift；
- staging 中额外 root entry、错误目录层级或 tree digest drift；
- `STAGING`/`INSTALLED` 参数混用、隐式 fallback 或 path escape；
- production builder/verifier缺少mode、传`CONTROLLED/STAGING`或由trust默认`INSTALLED`；
- controlled helper缺少显式`CONTROLLED`或进入版本化物理resolver；
- production integration fixture仍读取固定Handoff、引用mutable `reports/**`、硬编码旧`clean-*`或把临时fixture作为release evidence；
- 版本根安装前切换固定 Handoff；
- 尝试覆盖既有 final root，尤其 `clean-a36a7f1fd709`；
- Intake 或 E2E production trust 接受 mutable report ref；
- fixed switch 后独立postverify失败但未恢复旧 SHA；
- 只凭postverify READY Report、未同时验证live fixed SHA和无pending marker即继续下游。

### 12.4 正例完成条件

只有以下全部成立，Checklist 才能记录 `COMPLETE`：

1. base..source 精确 `14=12 M+2 A` 且 source worktree clean；
2. 新版本根 basename 与新 source SHA闭合且不同于 `clean-a36a7f1fd709`；
3. staging/final 均满足 `17+43+manifest tree` 固定布局；
4. Candidate Handoff READY、Intake READY，全部 direct raw ref指向同一已安装版本根；
5. production Manifest 预验、安装后重验和后继独立fixed Handoff postverify全部通过；
6. 固定 Handoff SHA等于版本根 Candidate SHA；
7. `clean-a36a7f1fd709` 前后tree digest相等；
8. 未生成任何下游 READY Report/Candidate/Activation，Capability保持disabled。

## 13. 状态同步

冻结本规格时必须同步：

- `docs/README.md`；
- `docs/design/opm-design-freeze-baseline.md` 由后继修正升至 `1.27`；
- `docs/design/opm-development-execution-pack.md` 由后继修正升至 `v1.18`；
- `docs/design/opm-test-strategy.md` 由后继修正升至 `v1.18`；
- Family Production Input checklist 记录安装失败已由本后继规格承接；
- E2E Manifest Builder checklist在本规格执行完成后改为`FIXED_HANDOFF_POSTVERIFY_CLOSURE_REQUIRED`；
- 本规格Checklist记录已执行source/release证据，独立postverify后继规格与Checklist冻结剩余输入、Report和live guard。

全局 32 项设计责任不新增、不转为 `BLOCKED`；本问题属于 `DFR-018/019` 内部实现输入修正。全局开发门仍为 `READY_FOR_DEVELOPMENT`，但fixed Handoff切换、Family Materializer和production E2E Report在后继postverify真实闭合前保持阻断。

## 14. 回滚

设计回滚：回退本规格及第 13 章状态文档，并恢复上一版设计入口；不得改动任何已安装版本根。

实现回滚：按第 11 章恢复旧固定 Handoff exact bytes；新版本根保留为未激活不可变证据。禁止通过覆盖 `clean-a36a7f1fd709`、恢复 mutable report ref 或复制固定 reports alias完成回滚。

## 15. 事实与假设

### 15.1 事实

1. `clean-a36a7f1fd709` 已存在且其 source commit为完整 `a36a7f1fd709b72e66c57e5aea634da525c9c515`；
2. 该 Candidate Handoff 的 build artifact 已版本化，但直接报告引用仍为 `reports/**`；
3. 固定 Handoff切换已因Report length/SHA不一致回滚，当前固定 Handoff SHA为第4章值；
4. source commit`37c5412a9c12...`、新版本根、READY Handoff/Intake和production Manifest已经形成；
5. 当前fixed Handoff仍为旧SHA，未生成或激活Release Candidate/Activation，未启用Capability；
6. exact fixed Handoff不能直接替代Intake锁定的versioned path作为production verifier输入。

### 15.2 待执行验证

1. 独立postverify tool的`4=1 M+3 A` source、测试和Report尚未实现；
2. fixed原子rename、四方join、backup marker收尾和live guard尚未执行；
3. 本规格及后继设计冻结不证明E2E Report、Gate-06、Candidate、Activation、Capability、production或ISO符合性。
