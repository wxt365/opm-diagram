# Spec: DEV-CANVAS-06 Unified External Release Store Mode 设计闭包

文档状态：`SUPERSEDED_AS_STANDALONE_SOURCE_PACKAGE`

实现状态：`EMBEDDED_IN_17_PATH_INTEGRATED_SOURCE/NOT_STARTED`

Production执行状态：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`

取代规格：`opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-task-spec.md`中的`3=1 M+2 A`实现包

活动后继：`opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md`

本规格的external store拓扑、CLI、quarantine、事务、错误和9路径职责子集继续有效；第3.2节“9项delta独立形成production source commit”及所有据此产生的Build准入被活动后继取代。9项只能与Common编排8项在同一`e598...`clean worktree中联合验证并一次提交为`17=14 M+3 A`。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标、非目标与修改边界

本规格修正外置Manifest Orchestrator仍把既有统一Builder/Verifier视为只读入口的缺口，冻结一个新的最小闭包包：

1. 统一Builder、Verifier和共享helper新增唯一`EXTERNAL_RELEASE_STORE` production输入模式；
2. `base-source-commit`固定为`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`；
3. source-root与release-store-root物理独立，全部installed输入、quarantine和Manifest资产只进入external store；
4. Builder/Verifier/orchestrator均使用完整source-root严格clean口径，不再允许最终输入根作为source-root中的untracked例外；
5. unified input quarantine仍由统一输入事务唯一拥有，Manifest outer transaction不得复用或写入该marker。

本规格不修改现有Quarantine Marker Schema、Manifest/Report Schema、OpenAPI、SQLite、Profile业务bytes、Java、Vue、公共HTTP wire、依赖或lockfile；不执行Manifest、`194/388`、Report、Gate、Candidate、Activation，不启用Capability，也不形成production发布或ISO符合性证据。

允许实现修改仅为第3.1节`9=7 M+2 A`。允许设计同步仅为本规格/checklist、被取代规格/checklist、集成Source规格/checklist、统一Source规格/checklist、Manifest v02规格/checklist、Toolchain checklist、冻结基线、测试策略、开发执行包和`docs/README.md`。其余路径及`.harness/**`全部禁止修改。

## 2. Root Cause 与 Fix Strategy

### 2.1 已复现事实

`e598b305...`中的统一入口仍冻结并实现为：

```text
--source-root <source worktree>
--handoff-root <source-root内Profile handoff root>
--base-source-commit daf383df...
--out|--input releases/clean-<source12>
```

Builder据此把版本根和quarantine写入`handoff-root`；Verifier的`assertInstalledSourceIdentity()`又明确要求最终输入根位于source-root内，并只允许该根作为untracked例外。该语义与外置Orchestrator要求的“完整source-root porcelain为空、installed root位于external non-Git store”不能同时成立。

此前`3=1 M+2 A`只增加orchestrator和package命令，禁止修改统一Builder/Verifier，因而无法通过编排修复子入口自身的路径和clean契约。

### 2.2 Fix Strategy

1. 以`e598b305...`为唯一新闭包base；
2. 将统一helper、Builder、Verifier及其测试纳入同一source delta；
3. production CLI只接受`EXTERNAL_RELEASE_STORE`，删除`--handoff-root`、`--out`和`--input`路径自由度；
4. 从`release-store-root + Profile identity + source12`唯一派生所有输入和quarantine路径；
5. Builder安装后以新进程执行统一Verifier，Verifier保持只读；post-rename失败由Builder写统一marker；
6. Builder成功后，outer orchestrator才进入Manifest事务。

## 3. Source Owner、Commit与Patch身份

### 3.1 精确实现allowlist

新source delta固定为`9=7 M+2 A`：

| 预期 | 路径 | 唯一职责 |
| --- | --- | --- |
| `M` | `package.json` | 增加外层orchestrator及其test命令；既有统一命令名保持不变 |
| `M` | `scripts/canvas06-unified-production-input.mjs` | 新模式参数、root派生、严格clean和quarantine共享owner |
| `M` | `scripts/canvas06-unified-production-input.test.mjs` | 参数/root/quarantine正反例 |
| `M` | `scripts/rebuild-canvas06-unified-production-inputs.mjs` | external store Builder事务与post-rename marker owner |
| `M` | `scripts/rebuild-canvas06-unified-production-inputs.test.mjs` | Builder root/clean/transaction测试 |
| `M` | `scripts/verify-canvas06-unified-production-inputs.mjs` | external installed只读Verifier与严格clean |
| `M` | `scripts/verify-canvas06-unified-production-inputs.test.mjs` | Verifier source-clean/read-only测试 |
| `A` | `scripts/rebuild-canvas06-manifest-v02-production.mjs` | 唯一Manifest outer orchestrator |
| `A` | `scripts/rebuild-canvas06-manifest-v02-production.test.mjs` | outer root/顺序/双Verifier/失败隔离测试 |

相对`e598...`，7个既有owner按上表修改，其余32个既有composite owner逐byte不变。新增2个owner后，总owner closure仍为：

```text
39 existing logical paths + 2 new logical paths = 41 unique logical paths
```

禁止修改Manifest Producer/Verifier、统一输入Quarantine Marker Schema、`.gitignore`、依赖、lockfile或任一业务资产。

### 3.2 Commit身份

```text
closure_base_source_commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4

external_store_source_commit
  = 本规格9项delta形成的新40位single-parent clean commit

source12
  = external_store_source_commit[0:12]

source_date_epoch
  = git show -s --format=%ct external_store_source_commit
```

新commit唯一parent必须逐字符等于`closure_base_source_commit`，禁止merge commit。source patch SHA唯一为：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary <external_store_source_commit>)
```

checklist必须记录完整commit、parent、exact 9项name-status、`7 M+2 A`计数、64位patch SHA和新`package.json` raw SHA。

`e598...`只作为不可变Git commit对象；实现必须从该对象创建新的clean worktree。含65个untracked installed文件的旧隔离worktree不是可复用source-root，不得清理后继续、复制build输出或作为patch工作目录。

## 4. 唯一CLI与兼容边界

### 4.1 Unified Builder

```text
npm run release:canvas06:unified-input:rebuild -- \
  --input-mode EXTERNAL_RELEASE_STORE \
  --source-root <absolute-clean-source-root> \
  --release-store-root <absolute-external-non-git-release-store-root> \
  --base-source-commit e598b305a44ebb9c9845c1f5563bc36c3a89a2b4 \
  --source-commit <external_store_source_commit> \
  --require-production
```

### 4.2 Unified Verifier

```text
npm run release:canvas06:unified-input:verify -- \
  --input-mode EXTERNAL_RELEASE_STORE \
  --source-root <absolute-clean-source-root> \
  --release-store-root <absolute-external-non-git-release-store-root> \
  --base-source-commit e598b305a44ebb9c9845c1f5563bc36c3a89a2b4 \
  --source-commit <external_store_source_commit> \
  --require-production
```

### 4.3 Manifest Orchestrator

```text
npm run release:canvas06:e2e:manifest:v02:production -- \
  --source-root <absolute-clean-source-root> \
  --release-store-root <absolute-external-non-git-release-store-root> \
  --base-source-commit e598b305a44ebb9c9845c1f5563bc36c3a89a2b4 \
  --source-commit <external_store_source_commit> \
  --require-production
```

每个参数恰好一次；拒绝未知、重复、空值、`--x=y`、位置参数、相对root、错误mode/base/source commit和缺少production guard。production禁止`--handoff-root`、`--out`、`--input`、`--common-root`、`--manifest-root`或路径override。

`e598...`旧无mode CLI及`base=daf383...`只作为失败现场的历史实现语义，不提供production兼容fallback；不得自动转换为external mode。测试若需要复现旧冲突，只能使用固定fixture，不得调用旧CLI生成可消费资产。

## 5. External Root拓扑与物理守卫

```text
source_root
  = <absolute clean Git worktree at external_store_source_commit>

release_store_root
  = <absolute existing external non-Git directory>

installed_profile_package_root
  = <release_store_root>/profiles/profile.iso19450.2024.draft/0.2.0

handoff_root
  = <installed_profile_package_root>/handoff

releases_root
  = <handoff_root>/releases

versioned_input_root
  = <releases_root>/clean-<source12>

unified_staging_root
  = <releases_root>/.clean-<source12>.staging

quarantine_root
  = <releases_root>/quarantine

manifest_release_parent
  = <release_store_root>/manifests/e2e-v02

profile_staging_parent
  = <release_store_root>/.staging/profile-assets
```

任何写入前必须对已存在segment执行`lstat`并拒绝link/special；两个root执行`realpath`后必须字符路径不同、inode不同、互不包含。`release_store_root`执行`git -C <root> rev-parse --is-inside-work-tree`不得返回`true`。staging与对应final parent必须同filesystem。禁止通过symlink、bind alias、`..`、cwd、env、目录扫描、latest或字符串前缀绕过。

release store可以包含不同source12的历史不可变root，但目标final/staging/marker/temp必须按exact source12检查；禁止扫描或选择其他版本。旧source内`clean-e598b305a44e`不得复制为external seed。

## 6. Strict Source Clean唯一口径

Builder、Verifier和orchestrator统一执行：

```text
git -C <source_root> rev-parse HEAD
  == external_store_source_commit

git -C <source_root> status --porcelain=v1 --untracked-files=all
  == empty bytes

git rev-list --parents -n 1 <external_store_source_commit>
  == <external_store_source_commit> <closure_base_source_commit>

git diff --name-status <closure_base_source_commit>..<external_store_source_commit>
  == 第3.1节exact 9项及M/A状态
```

禁止pathspec、exclude、ignore新增、过滤Profile handoff/releases、允许某组untracked、或Verifier按final root放行。所有installed输入都在external store，因此任何tracked/untracked source漂移均拒绝。

`node_modules/**`、`apps/web/dist/**`、`services/**/target/**`只能作为既有ignore规则下由本次clean build生成的派生产物，并按Bootstrap、Runtime/Web raw/tree join验证；不得复用构建前残留。Builder至少在`SOURCE_PREFLIGHT`、`BEFORE_UNIFIED_RENAME`、`AFTER_UNIFIED_INSTALLED_VERIFY`复查；Verifier在tree digest前后复查；orchestrator继续在统一输入后、Manifest staging后和Manifest installed后复查。

任一失败返回`CANVAS06_UNIFIED_SOURCE_DIRTY/2`或orchestrator对应source-dirty错误，零READY输出。

## 7. Quarantine归属与事务边界

### 7.1 唯一归属

统一输入Marker Schema、八字段和bytes保持`0.1`不变。外置模式唯一位置为：

```text
<quarantine_root>/clean-<source12>.json
<quarantine_root>/.clean-<source12>.json.tmp
```

其中marker内部仍固定：

```text
input_root = releases/clean-<source12>
source_commit = external_store_source_commit
```

`input_root`相对`handoff_root`，不得改为release-store绝对路径，因而无需升级Schema。

### 7.2 Writer/Reader责任

- Unified Builder：统一输入atomic rename后发生`FSYNC_RELEASES_PARENT`、Verifier启动或installed reverify失败时，唯一有权按既有原子协议写marker；rename前失败零final且不写marker。
- Unified Verifier：只读检查exact final/temp marker，存在或非法即fail-closed；不得写、删、移或修复marker。
- Manifest Orchestrator/Producer/Verifier/Runner/Gate：只读检查同一exact marker/temp；不得写入统一marker，也不得用它标记Manifest失败。
- 恢复流程：删除或移动失败输入根、marker/temp仍只由独立恢复规格和operator授权承接。

若进程在atomic rename后、marker完成前强停，可能形成“final存在、marker不存在”的residual。该root因没有Builder成功三元组不得消费；后续相同source12因final已存在必须拒绝覆盖，并转交独立恢复流程。任何消费者都不得以“marker不存在”单独推断READY。

Builder必须在rename后以全新Node进程执行Unified Verifier，并捕获PID、argv、stdout、stderr和exit。Verifier成功前Builder不得输出成功三元组；失败时先复算失败根tree，再写marker。Builder成功stdout固定：

```text
<absolute-versioned-input-root>\t<external_store_source_commit>\t<input-tree-sha256>\n
```

Verifier成功stdout使用相同三元组且前后tree digest相等。禁止自由文本、latest或READY状态。

## 8. 外层唯一执行顺序

```text
ARGS
-> RESOLVE_TWO_ROOTS_AND_EXACT_PATHS
-> ASSERT_EXTERNAL_STORE_NON_GIT_AND_ROOT_ISOLATION
-> ASSERT_EXACT_QUARANTINE_FINAL_TEMP_ABSENT
-> SOURCE_PREFLIGHT
-> RUN_UNIFIED_BUILDER_EXTERNAL_MODE
   -> CLEAN_BUILD_AND_STAGE
   -> BEFORE_UNIFIED_RENAME_SOURCE_CLEAN
   -> FSYNC_AND_ATOMIC_RENAME_INPUT_ROOT
   -> FSYNC_RELEASES_PARENT
   -> SPAWN_UNIFIED_INSTALLED_VERIFIER_EXTERNAL_MODE
   -> AFTER_UNIFIED_INSTALLED_VERIFY_SOURCE_CLEAN
   -> EMIT_UNIFIED_TRIPLE
-> VALIDATE_UNIFIED_TRIPLE_AND_SOURCE_CLEAN
-> DERIVE_INTAKE12_AND_MANIFEST_PATHS
-> RUN_MANIFEST_PRODUCER_IN_OUTER_STAGING
-> SPAWN_MANIFEST_STAGING_VERIFIER
-> FSYNC_OUTER_TREE_AND_ATOMIC_RENAME
-> FSYNC_MANIFEST_RELEASE_PARENT
-> SPAWN_MANIFEST_INSTALLED_VERIFIER
-> ASSERT_INSTALLED_TREE_UNCHANGED_AND_SOURCE_CLEAN
-> EMIT_MANIFEST_TRIPLE
```

统一Builder独占input staging/final/marker事务；outer orchestrator独占Manifest staging/final事务。两者不得删除或回滚对方的root。Manifest rename后失败仍按既有规则保留immutable root、零READY ref且不写统一marker。

## 9. 稳定错误与首错

统一输入既有十二类错误码保持不变。新增模式不新增Schema错误码：

- mode、root参数或旧CLI：`CANVAS06_UNIFIED_ARGUMENT_INVALID/2`；
- base/parent/9项patch漂移：`CANVAS06_UNIFIED_BASE_INVALID/2`；
- source任何porcelain漂移：`CANVAS06_UNIFIED_SOURCE_DIRTY/2`；
- root相等/包含/link/non-Git失败或目标路径预存在：`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`；
- exact marker存在：`CANVAS06_UNIFIED_QUARANTINED/3`；
- temp、非法marker或marker I/O：`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`。

stderr首行仍固定`<CODE>\t<STAGE>`；首错只按第8节顺序，禁止并行竞争、fallback或把子进程失败改写为成功。Manifest orchestrator十类错误码保持原设计，但其`INPUT_FAILED/3`必须保留统一子进程原始stderr作为后续行。

## 10. 验收矩阵

### 10.1 正例

1. 17项final commit为`e598...`唯一parent，其中External Store职责子集恰为`9=7 M+2 A`，owner closure仍为41；
2. Builder/Verifier/orchestrator三条CLI均使用`base=e598...`和同一source commit；
3. source/release store独立且source所有clean reachpoint完整porcelain为空；
4. external Handoff/Intake/Runtime/Web/Common安装完成，Unified Verifier新进程退出0；
5. unified三元组、input tree、source commit和external path闭合；
6. marker/temp均不存在后才进入Manifest事务；
7. Manifest staging/installed两个新进程Verifier及最终三元组按后继外层契约闭合。

### 10.2 反例

覆盖旧CLI、错误mode、`base=daf383...`、wrong parent、9项缺失/extra/M-A漂移、source任一untracked、仅放行external/final路径、ignore/path filter、root相等/包含/symlink/bind/Git worktree/跨filesystem、旧source内root复制、target staging/final已存在、其他source12隔离、marker/temp存在或非法、Verifier写入、Builder未新进程验证、post-rename失败不写marker、pre-rename错误写marker、Manifest写统一marker、stdout extra和失败root被消费。

### 10.3 必跑命令

```text
node --test \
  scripts/canvas06-unified-production-input.test.mjs \
  scripts/rebuild-canvas06-unified-production-inputs.test.mjs \
  scripts/verify-canvas06-unified-production-inputs.test.mjs \
  scripts/rebuild-canvas06-manifest-v02-production.test.mjs
npm run release:canvas06:e2e:manifest:v02:test
npm run contract:validate
git diff --check
```

实现测试必须使用external临时目录作为release store，并证明source Git fixture在Verifier前后零tracked/untracked漂移。临时目录/schema单测不等于production rebuild。

## 11. 完成、回滚与当前状态

仅当活动后继的17项集成commit、external unified transaction、新进程Unified Verifier、Manifest outer transaction和两个Manifest Verifier全部闭合，才可标记：

```text
IMPLEMENTED/MANIFEST_V02_PRODUCTION_INPUT_READY
```

回滚只允许删除本轮尚未rename且可证明由本进程exclusive创建的staging。installed unified root、marker、Manifest root、历史root、用户模型和证据不得原地修改。

当前状态：

- `e598b305...`：`IMPLEMENTED_BASE/FAILURE_SCENE_READ_ONLY`；
- 旧`3=1 M+2 A`包：`SUPERSEDED/DO_NOT_IMPLEMENT`；
- 新`9=7 M+2 A`职责子集：`FROZEN/EMBEDDED_IN_17_PATH_INTEGRATED_SOURCE`；
- 独立9项source commit：`SUPERSEDED/DO_NOT_CREATE`；
- 17项集成source commit、external input、Manifest、Verifier证据：`NOT_CREATED/NOT_RUN`；
- `194/388`、Report、Gate、Candidate、Activation、Capability、production、ISO：`NOT_RUN/NOT_ENABLED/EVIDENCE_MISSING`。
