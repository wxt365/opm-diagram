# Spec: DEV-CANVAS-06 Manifest v02 集成 Source 重建

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`SOURCE_INTEGRATION_IMPLEMENTED/EXTERNAL_ORCHESTRATOR_NOT_STARTED`

生产重建状态：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`

活动后继规格：`opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md`

历史后继规格：`opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-task-spec.md`（`SUPERSEDED/READ_ONLY`）

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标与非目标

本规格已把统一 Source 生产输入链和 E2E Manifest v02 Producer/Verifier 收敛到线性clean source commit `e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`。该commit已承载统一输入owner和Manifest v02 owner；production执行还必须遵守后继外置Release Orchestrator规格，source-root只用于clean source/build，installed输入和Manifest必须写入独立external release store：

1. Handoff `0.2`、READY Intake、exact Runtime JAR、Web dist 和 Common `0.2.0` 43 文件输入根；
2. 与上述输入逐 byte/tree/ref 闭合的 E2E Manifest `0.2/0.2.0` production final root；
3. 两次独立只读验证：统一输入 installed verifier 和 Manifest v02 installed verifier。

本规格不执行 `194/388` Attempt、不生成 E2E Report、不运行 `GATE-06-03`，不生成 Candidate、Activation，不启用 Capability，也不形成 production 发布或 ISO 19450:2024 符合性证据。

## 2. Root Cause 与 Fix Strategy

### 2.1 Root Cause

统一输入实现链和 Manifest v02 实现链从共同祖先分叉。前者形成 commit `30f7edc...`，后者形成 commit `1e040511...`；二者互不为祖先。若直接 merge/cherry-pick 整条 Manifest 分支，会把统一输入 owner 的历史漂移和 Quarantine Marker Schema 删除一并带入。若继续使用两个 commit，又无法满足 Runtime、Web、Common、driver、Profile、Handoff、Intake 和 Manifest 必须来自同一 source commit 的 production trust 约束。

之前的两份规格分别冻结了 `23` 项统一输入 owner 和 `17` 项 Manifest owner，但没有冻结二者的交集计数、线性集成基线、集成 patch 身份和同 commit 重建顺序。

### 2.2 Fix Strategy

1. 以 `30f7edc5397bf4e2bd69e1c8cf5f09eaf8e875b9` 为唯一 `integration_base_commit`；
2. `1e040511b9b54eaf0939cdb525f093a4b3419fc2` 只作为 Manifest owner 的受控 byte reference，不作为 parent、merge parent 或 production identity；
3. 仅把相对 `30f7...` 的 exact `8=3 M+5 A` 集成到单 parent 新 commit；
4. composite owner closure 固定为 `23+17-1=39` 个唯一逻辑路径，唯一重叠为 `package.json`；
5. 从新 commit 的同一 clean worktree 重新构建和安装全部统一输入，再运行 Manifest v02 Producer/Verifier；
6. 历史根保持只读，新根和 Manifest 输出均使用不可覆盖的版本化路径及 exact quarantine guard。

## 3. 冻结身份与事实边界

```text
common_ancestor_commit
  = daf383df6d7faad866b84fceac0a2c9111a8c926

integration_base_commit
  = 30f7edc5397bf4e2bd69e1c8cf5f09eaf8e875b9

manifest_reference_commit
  = 1e040511b9b54eaf0939cdb525f093a4b3419fc2

integrated_unified_source_commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4

source12
  = integrated_unified_source_commit[0:12]

source_date_epoch
  = git show -s --format=%ct integrated_unified_source_commit

intake12
  = SHA-256(raw READY Intake bytes)[0:12]

manifest_id
  = dev-canvas-06.e2e.<source12>.<intake12>
```

`integrated_unified_source_commit`已确认只有一个parent且逐字符等于`integration_base_commit`，其source delta为`8=3 M+5 A`，patch SHA为`68231699973031cac3d9eaab8371b14ffdbfee5a2a186d6f9fdc81a2c7c87bbc`。

当前仓库已确认 `30f7...` 和 `1e040...` 都是有效 Git commit，且共同祖先为 `daf383...`。当前主工作树没有 `releases/clean-30f7edc5397b` 实体；因此 `clean-30f7edc5397b` 只冻结为历史逻辑身份和外部审计边界，不声明它已在当前 checkout 安装或通过 installed verifier。

## 4. Composite Allowlist

### 4.1 两层计数

计数必须分层，禁止互相替代：

| 层级 | 固定值 | 用途 |
| --- | --- | --- |
| Composite owner closure | `39 unique logical paths` | 证明统一输入 23 项与 Manifest v02 17 项的职责并集完整；相对共同祖先理解 owner 边界 |
| Integration source delta | `8=3 M+5 A` | 证明新 commit 相对 `integration_base_commit` 只引入必要 Manifest bytes |

公式固定为：

```text
|UNIFIED_OWNER_SET union MANIFEST_V02_OWNER_SET|
  = 23 + 17 - |{package.json}|
  = 39
```

同一路径无论被两个 owner 修改多少次，在逻辑并集中只计一次。不得把 `39` 称为相对 `30f7...` 的 Git patch 数，也不得把 `8` 称为完整 owner closure。

### 4.2 39 项唯一逻辑路径

| Owner | 路径 |
| --- | --- |
| Unified | `apps/web/tsconfig.node.json` |
| Unified | `apps/web/vite.config.js` |
| Unified | `docs/contracts/schemas/opm-dev-canvas-05-handoff-v02.schema.json` |
| Unified | `docs/contracts/schemas/opm-dev-canvas-06-unified-source-quarantine-marker.schema.json` |
| Unified + Manifest | `package.json` |
| Unified | `scripts/build-dev-canvas-05-release.mjs` |
| Unified | `scripts/canvas06-e2e-manifest-v01-trust.mjs` |
| Unified | `scripts/canvas06-unified-production-input.mjs` |
| Unified | `scripts/canvas06-unified-production-input.test.mjs` |
| Unified | `scripts/generate-dev-canvas-05-gate-evidence-reports.mjs` |
| Unified | `scripts/generate-dev-canvas-05-handoff.mjs` |
| Unified | `scripts/rebuild-canvas06-unified-production-inputs.mjs` |
| Unified | `scripts/rebuild-canvas06-unified-production-inputs.test.mjs` |
| Unified | `scripts/release-canvas06-intake.mjs` |
| Unified | `scripts/release-canvas06-intake.test.mjs` |
| Unified | `scripts/validate-dev-canvas-05-handoff.mjs` |
| Unified | `scripts/validate-dev-canvas-05-handoff.test.mjs` |
| Unified | `scripts/verify-canvas06-unified-production-inputs.mjs` |
| Unified | `scripts/verify-canvas06-unified-production-inputs.test.mjs` |
| Unified | `scripts/verify-opm-bootstrap-build-closure.mjs` |
| Unified | `scripts/verify-opm-bootstrap-build-closure.test.mjs` |
| Unified | `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalRuntimeBootstrapControllerTest.java` |
| Unified | `tests/e2e/opm-bootstrap-order.spec.ts` |
| Manifest | `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json` |
| Manifest | `docs/contracts/schemas/opm-dev-canvas-06-e2e-report-v02.schema.json` |
| Manifest | `scripts/validate-canvas06-visual-e2e-schemas.test.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-compose.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-compose.test.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-input.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-input.test.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-profile.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-profile.test.mjs` |
| Manifest | `scripts/release-canvas06-e2e-manifest-v02.mjs` |
| Manifest | `scripts/release-canvas06-e2e-manifest-v02.test.mjs` |
| Manifest | `scripts/verify-canvas06-e2e-manifest-v02.mjs` |
| Manifest | `scripts/verify-canvas06-e2e-manifest-v02.test.mjs` |
| Manifest | `scripts/canvas06-e2e-manifest-v02-invariants.test.mjs` |
| Manifest | `scripts/verify-canvas06-e2e-report.mjs` |
| Manifest | `scripts/verify-canvas06-e2e-report.test.mjs` |

### 4.3 相对 `30f7...` 的 exact integration delta

新 commit 只允许以下 `8=3 M+5 A`：

| 预期 | 路径 | byte source |
| --- | --- | --- |
| `M` | `package.json` | `manifest_reference_commit` exact raw bytes，并通过第4.4节语义守卫 |
| `M` | `scripts/canvas06-e2e-manifest-v02-input.mjs` | `manifest_reference_commit` exact raw bytes |
| `M` | `scripts/canvas06-e2e-manifest-v02-input.test.mjs` | `manifest_reference_commit` exact raw bytes |
| `A` | `scripts/canvas06-e2e-manifest-v02-invariants.test.mjs` | `manifest_reference_commit` exact raw bytes |
| `A` | `scripts/release-canvas06-e2e-manifest-v02.mjs` | `manifest_reference_commit` exact raw bytes |
| `A` | `scripts/release-canvas06-e2e-manifest-v02.test.mjs` | `manifest_reference_commit` exact raw bytes |
| `A` | `scripts/verify-canvas06-e2e-manifest-v02.mjs` | `manifest_reference_commit` exact raw bytes |
| `A` | `scripts/verify-canvas06-e2e-manifest-v02.test.mjs` | `manifest_reference_commit` exact raw bytes |

其余 9 个 Manifest owner 必须与 `integration_base_commit` 保持逐 byte 相等，不进入本次 patch。统一输入 owner 除 `package.json` 外必须全部与 `integration_base_commit` 逐 byte 相等；尤其禁止删除 Quarantine Marker Schema、回退 Bootstrap Closure 或改变 Handoff/Intake/Unified Builder bytes。

执行时必须在 clean integration worktree 复算 `git diff --name-status integration_base_commit..<new commit>`。结果与上表不完全相等时状态立即回到 `BLOCKED_BY_INTEGRATION_DELTA_DRIFT`，不得扩大 allowlist 或继续生产重建。

### 4.4 `package.json` 唯一合并规则

`package.json` 在 39 项并集中只计一次。目标文件必须逐 byte 等于`manifest_reference_commit:package.json`，固定raw SHA-256为：

```text
ec8b8112b5bc214249249de20a45a6d63c90352211996c18957c8e7b1ef11ed3
```

写入前还必须观测`integration_base_commit:package.json` raw SHA-256逐字符等于：

```text
3ad60ec95ebe78ceff73f53ae81a7750436da3a55ec0edb0b5f5a544beb96292
```

目标bytes必须保留 base 已有 Bootstrap 与统一输入命令，并增加/更新：

```text
release:canvas06:e2e:manifest:v02
release:canvas06:e2e:manifest:v02:verify
release:canvas06:e2e:manifest:v02:test
```

`release:canvas06:e2e:manifest:v02:test` 必须包含 input、profile、producer、verifier、invariants、Report verifier 和Schema测试。禁止删除或改名 `bootstrap:*`、`release:canvas06:unified-input:*`，禁止修改依赖版本、lockfile或 package manager。

## 5. Commit 与 Patch 身份

### 5.1 线性提交守卫

创建 commit 前后固定执行：

```text
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
git rev-list --parents -n 1 <integrated_unified_source_commit>
git diff --name-status <integration_base_commit>..<integrated_unified_source_commit>
```

必须同时满足：

1. 实现前 HEAD 等于 `integration_base_commit`，工作树为空；
2. 新 commit 的 parent 只有一个且等于 `integration_base_commit`；
3. diff 等于第 4.3 节 exact 8 项；
4. commit 后工作树为空；
5. 禁止 merge、rebase 后多 parent、whole-branch cherry-pick、branch/tag/working-tree bytes 作为身份。

### 5.2 Source Patch SHA

唯一 preimage 为：

```text
git show --format= --no-ext-diff --binary <integrated_unified_source_commit>
```

对 stdout 原始 bytes 计算 SHA-256，字段名固定为：

```text
source_delta_patch_sha256
```

不得使用 `git diff` 文本、文件列表、commit object SHA、平台换行转换、hex字符串bytes或重新序列化输出替代。checklist必须记录完整 commit、parent、8项 name-status 和64位 patch SHA。

## 6. 历史根、新根与 Quarantine Guard

### 6.1 历史边界

```text
historical_root_identity
  = releases/clean-30f7edc5397b
```

该身份及其任何外部实体均只读：不得复制到新根、覆盖、追加、删除、移动、修复或作为新 Manifest final root。只有显式提供的 absolute root、exact tree/raw refs和历史 verifier才能用于审计；禁止目录扫描、latest、mtime或“存在即READY”推断。

### 6.2 新统一输入根

```text
versioned_input_root
  = <external-release-store-root>/profiles/
    profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-<source12>
```

`source-root`与`external-release-store-root`必须是后继规格冻结的两个独立物理根。其布局、Handoff `0.2`三artifact、READY Intake、Runtime/Web/Common、原子安装和installed verifier继续完全遵守统一Source规格；Manifest输出禁止写入该输入根。旧的source内`clean-e598b305a44e`是只读失败现场，不是可消费输入。

### 6.3 Exact quarantine guard

在读取新统一输入根前，统一 Builder/Verifier和Manifest v02 production Producer/Verifier必须只从目标 `source12` 构造：

```text
<external-installed-profile-package-root>/handoff/releases/quarantine/clean-<source12>.json
<external-installed-profile-package-root>/handoff/releases/quarantine/.clean-<source12>.json.tmp
```

任一路径实体存在即 fail-closed；link、directory、截断、Schema-invalid、I/O错误均不得放行。禁止扫描 quarantine 目录、跟随链接、读取其他 source12、自动清理、覆盖或同 identity 重建。Marker bytes、写入协议和恢复权限只由既有 Quarantine Marker `0.1` 契约承接，本规格不创建第二套输入 marker。

## 7. 同 Commit 重建顺序

唯一顺序为：

```text
PREPARE_CLEAN_INTEGRATION_WORKTREE_AT_30F7
-> MATERIALIZE_EXACT_8_DELTA
-> VERIFY_39_OWNER_CLOSURE_AND_8_PATCH
-> RUN_MANIFEST_V02_AND_UNIFIED_SOURCE_TESTS
-> CREATE_LINEAR_INTEGRATED_COMMIT
-> REVERIFY_COMMIT_PARENT_DIFF_PATCH_SHA
-> CREATE_NEW_CLEAN_BUILD_WORKTREE_AT_ORCHESTRATED_SOURCE_COMMIT
-> ASSERT_NODE_22_AND_ABSENT_DERIVED_OUTPUTS
-> NPM_CI_AND_BOOTSTRAP_SOURCE_CLOSURE
-> BUILD_WEB_EVIDENCE_RUNTIME
-> ASSERT_EXTERNAL_RELEASE_STORE_INDEPENDENT
-> RUN_EXTERNAL_RELEASE_ORCHESTRATOR
-> RECORD_READY_INPUT_REFS
```

`RUN_EXTERNAL_RELEASE_ORCHESTRATOR`内部唯一拥有external Handoff/Intake/Runtime/Web/Common重建、统一输入installed verifier、Profile Staging、Manifest Producer、staging verifier、fsync/rename和installed verifier；本规格不得在其前后重复调用这些子步骤。Handoff、Intake、Runtime、Web、Common、四driver、五Profile source assets和Manifest `source_build.source_commit`必须逐字符连接到后继`orchestrated_source_commit`。任一阶段不得混用`clean-30f7...`、`clean-daf383...`、`1e040...`或`e598...`旧installed output、主工作树或已有`dist/target/node_modules`。完整物理root和orchestrator顺序以后继规格为唯一事实源。

## 8. Manifest Production Root 与事务

### 8.1 固定布局

production Manifest release root固定在独立external release store中；本节旧`profile-package-root`路径由后继规格取代：

```text
manifest_release_parent
  = <external-release-store-root>/manifests/e2e-v02

manifest_release_id
  = clean-<source12>-<intake12>

manifest_release_root
  = <manifest_release_parent>/<manifest_release_id>

manifest_final_root
  = <manifest_release_root>/dev-canvas-06/e2e/manifests/<manifest_id>
```

Producer只能由后继规格冻结的外层orchestrator调用，并固定使用：

```text
--output-root <manifest_release_staging_root>
--out dev-canvas-06/e2e/manifests/<manifest_id>/dev-canvas-06-e2e-manifest.json
```

其中：

```text
manifest_release_staging_root
  = <manifest_release_parent>/.<manifest_release_id>.staging
```

Manifest final root内部布局继续完全遵守Manifest v02 Producer/Verifier规格，不新增、删除或重命名文件。

### 8.2 双层原子事务

本节职责由`scripts/rebuild-canvas06-manifest-v02-production.mjs`唯一承接，精确root topology、staging/installed Verifier新进程、fsync和首错以后继规格第4~7章为准。

1. final/staging/任何同 basename residual在启动时都必须不存在；
2. Producer只在 fresh `manifest_release_staging_root`内执行自身 staging -> verify -> rename事务；
3. 独立Verifier先对staging release root内的Manifest final root做只读验证；
4. staging release root全部文件和目录fsync后，原子rename为`manifest_release_root`并fsync parent；
5. 再从installed路径运行同一个独立Verifier；前后完整tree digest必须相等；
6. 只有installed verifier退出`0`后，才能把Manifest root/path/raw SHA记录为后继Runner输入。

禁止创建或更新 `latest`、fixed pointer、软链接或输入根内Manifest副本。Manifest release root存在不等于READY，后继消费者仍必须验证显式root、Manifest raw ref、source commit、Handoff/Intake和exact quarantine guard。

### 8.3 失败隔离

- 外层rename前失败：删除仅由本轮创建且可证明归属本轮的staging；final零输出；crash residual保留并阻断同identity重试。
- 外层rename后parent fsync或installed verifier失败：保留原始immutable final root，状态固定为`FAILED_INSTALLED_REVERIFY`，禁止覆盖、删除、移动、作为Runner/Gate输入或写READY引用。
- retry不得复用同一`manifest_release_id`。同identity恢复、删除或重新验证后发布必须由独立恢复规格和operator授权承接。
- 不得用统一输入 Quarantine Marker冒充Manifest输出失败marker；本规格不改变既有Marker Schema。

该隔离依赖“无mutable pointer、后继显式raw ref、消费前独立Verifier”三重守卫。未形成installed verifier成功记录的root不进入任何Gate输入集合。

## 9. 固定执行与验证命令

### 9.1 Source integration

```text
node --test \
  scripts/canvas06-e2e-manifest-v02-input.test.mjs \
  scripts/canvas06-e2e-manifest-v02-profile.test.mjs \
  scripts/release-canvas06-e2e-manifest-v02.test.mjs \
  scripts/verify-canvas06-e2e-manifest-v02.test.mjs \
  scripts/canvas06-e2e-manifest-v02-invariants.test.mjs \
  scripts/verify-canvas06-e2e-report.test.mjs \
  scripts/validate-canvas06-visual-e2e-schemas.test.mjs
npm run release:canvas06:unified-input:test
npm run contract:validate
```

### 9.2 Production rebuild

production公开入口只能是外置Release Orchestrator规格冻结的`release:canvas06:e2e:manifest:v02:production`命令；统一输入 Builder/Verifier和Manifest v02 Producer/Verifier仅作为其固定路径只读子入口，参数沿用各自冻结CLI。实际执行记录必须包含orchestrator及全部子进程完整argv、Node/JDK/OS、commit/parent/patch SHA、Handoff/Intake/Runtime/Web/Common摘要、Profile五raw refs、四driver refs、Manifest path/raw/tree SHA、staging/installed两个Manifest Verifier退出码和exact quarantine guard结果。

### 9.3 负例

至少覆盖：错误共同祖先/base/reference commit、dirty source、merge commit、8项缺失/extra/M-A漂移、39项重复计数、`package.json`命令丢失、Quarantine Marker Schema删除、旧根复制、source12/intake12/manifest-id漂移、输入与Manifest root重叠、staging/final/residual已存在、错误Runtime/Web/Common/Profile/driver/Handoff/Intake commit、producer失败、外层rename/fsync失败、installed verifier失败及失败root被Runner拒绝。

### 9.4 正例

必须证明：

1. `39`项owner closure和`8=3 M+5 A` source patch同时成立；
2. 新commit单parent为`30f7...`，patch SHA可复算；
3. 新`clean-<source12>`输入根通过installed unified verifier；
4. Manifest ID、release root、Handoff、Intake和source commit逐项闭合；
5. Manifest staging与installed两次verifier均退出`0`且tree digest不变；
6. 历史`clean-30f7edc5397b`和其他`clean-*` bytes不变。

## 10. Gate、完成和回滚边界

只有 source commit、统一输入 installed verifier、Manifest双层事务和installed verifier全部完成，才可标记：

```text
IMPLEMENTED/MANIFEST_V02_PRODUCTION_INPUT_READY
```

该状态只允许后继 E2E Runner把显式Manifest root作为production输入。它不等于 E2E `194/388`执行、Report READY或`GATE-06-03` READY。

回滚只允许删除尚未安装且可证明由本轮创建的staging。已安装输入根、Manifest root、历史根、固定Handoff、用户模型和任何证据资产不得原地修改；失败installed root按第8.3节隔离，等待独立恢复规格。

## 11. 当前状态

- Composite owner和8项集成delta：`IMPLEMENTED`。
- `integrated_unified_source_commit`：`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`。
- 新Handoff/Intake/Runtime/Web/Common根：`NOT_RUN`。
- source内`clean-e598b305a44e`：`REJECTED_BY_ROOT_ISOLATION/READ_ONLY_FAILURE_SCENE`。
- Unified External Release Store闭包：`FROZEN_FOR_IMPLEMENTATION/NOT_STARTED`。
- Manifest v02 production Producer/Verifier：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`。
- E2E `194/388`、Report、`GATE-06-03`：`NOT_RUN`。
- Candidate、Activation、Capability、production发布、ISO符合性：`NOT_PROVEN/NOT_ENABLED`。
