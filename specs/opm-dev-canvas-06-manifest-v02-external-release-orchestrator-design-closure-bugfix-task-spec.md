# Spec: DEV-CANVAS-06 Manifest v02 外置 Release Orchestrator 设计闭包

文档状态：`SUPERSEDED/READ_ONLY`

实现状态：`DO_NOT_IMPLEMENT`

Production执行状态：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`

后继规格：`opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-task-spec.md`

> 本规格冻结的`3=1 M+2 A`包没有授权修改统一Builder/Verifier，无法实现external store输入模式；后继`9=7 M+2 A`只保留为职责子集，最终由Common/External `17=14 M+3 A`集成Source闭包取代独立source路线。以下内容仅保留为冲突复现和历史审计，不得作为活动实现allowlist。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标与非目标

本规格修正 Manifest v02 集成Source重建中“clean source worktree同时承载installed release root”的物理根冲突，冻结：

1. clean `source-root`与`installed-profile-package-root`必须是两个独立物理根；
2. 唯一外层Manifest production orchestrator及其source owner；
3. 外层staging、staging verifier、fsync、atomic rename、installed verifier和失败隔离职责；
4. Producer/Verifier的source-clean判定只面向独立source-root，保持严格、零例外。

本规格不放宽现有Producer/Verifier，不修改Manifest/Report Schema、Profile业务bytes、OpenAPI、SQLite、Java、Vue或公共HTTP wire；不执行`194/388`、不生成Report/Gate/Candidate/Activation、不启用Capability，也不形成production发布或ISO 19450:2024符合性证据。

### 1.1 修改边界

- 允许实现修改：第3.1节精确`3=1 M+2 A` source allowlist；其中`package.json`只允许新增两条固定命令，测试只允许新增该节唯一Node test。
- 允许设计同步：本规格及其checklist、集成Source规格/checklist、Manifest v02规格/checklist、Toolchain checklist、冻结基线、测试策略、开发执行包和`docs/README.md`。
- 禁止修改：上述清单外全部路径，尤其`.harness/**`、`.gitignore`、lockfile、依赖、Manifest Producer/Verifier、统一Builder/Verifier、Schema、OpenAPI、SQLite DDL、Profile业务bytes、Java、Vue和release资产。
- Schema/API/数据库/公共配置：均不允许修改；`package.json`仅开放固定script键，不开放依赖、package manager或其他配置。
- 本设计闭包只执行文档结构、链接、计数、状态和差异边界验证；后继实现必须执行第8节正反例，当前不得用设计验证替代实现测试。

## 2. Root Cause 与复现事实

### 2.1 Root Cause

已实现集成source commit为：

```text
integrated_source_commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4
parent
  = 30f7edc5397bf4e2bd69e1c8cf5f09eaf8e875b9
source_delta
  = 8=3 M+5 A
source_delta_patch_sha256
  = 68231699973031cac3d9eaab8371b14ffdbfee5a2a186d6f9fdc81a2c7c87bbc
```

执行统一重建时，调用者把`--handoff-root`指向`source-root/packages/profiles/.../handoff`，使`clean-e598b305a44e`安装到Git worktree内。由此产生两个确定冲突：

1. `git status --porcelain=v1 --untracked-files=all`观测到恰好`65`个未跟踪installed input文件，Producer和Verifier在`SOURCE_CLEAN_HEAD`必然拒绝；
2. 旧设计把`manifest_release_parent`放在同一source内Profile路径，Producer在`PATHS`要求source、Common和output两两独立，因`output-root`为`source-root`子目录必然拒绝。

该冲突不能通过`.gitignore`、status path过滤、临时清理、移动已安装根、放宽root包含关系或跳过Verifier解决；这些做法会掩盖source污染或改变已安装证据bytes。此前未发现，是因为集成规格冻结了版本化逻辑路径和各内部事务，却没有把source worktree与installed release store的物理拓扑、外层事务owner和source-clean reachpoint作为同一组可执行前置条件联合验收。

### 2.2 Fix Strategy

1. 以`e598b305...`为本修正实现base，增加唯一外层orchestrator；
2. 新target source commit只承载source代码和ignored build outputs，不承载任何Handoff/Input/Manifest installed root；
3. 所有installed输入、quarantine sidecar、Profile Staging和Manifest release root只写入独立的external release store；
4. orchestrator依次调用现有统一Builder/Verifier、Manifest Producer/Verifier，保持各自CLI和语义边界；
5. 外层事务由orchestrator唯一拥有，Producer不得承担外层release安装或失败恢复。

## 3. Source Owner 与 Commit身份

### 3.1 精确实现allowlist

后继source delta固定为`3=1 M+2 A`：

| 预期 | 路径 | 唯一职责 |
| --- | --- | --- |
| `M` | `package.json` | 增加外层production orchestrator及其test命令 |
| `A` | `scripts/rebuild-canvas06-manifest-v02-production.mjs` | 唯一外层事务owner |
| `A` | `scripts/rebuild-canvas06-manifest-v02-production.test.mjs` | root、顺序、事务、故障和只读验收 |

原39项composite owner保持只读；增加两个新逻辑路径后，总owner closure固定为：

```text
41 unique logical paths
```

现有以下入口只读复用，不进入本delta：

```text
scripts/rebuild-canvas06-unified-production-inputs.mjs
scripts/verify-canvas06-unified-production-inputs.mjs
scripts/release-canvas06-e2e-manifest-v02.mjs
scripts/verify-canvas06-e2e-manifest-v02.mjs
```

禁止修改`.gitignore`、Manifest Producer/Verifier的`git status`检查、root独立守卫、错误码或事务逻辑。

### 3.2 package命令

在`release:canvas06:e2e:manifest:v02:verify`之后按现有两空格JSON格式依次增加：

```text
release:canvas06:e2e:manifest:v02:production
  = node scripts/rebuild-canvas06-manifest-v02-production.mjs

release:canvas06:e2e:manifest:v02:production:test
  = node --test scripts/rebuild-canvas06-manifest-v02-production.test.mjs
```

其余scripts、依赖、package manager和lockfile逐byte不变。实现checklist记录新`package.json` raw SHA。

### 3.3 新source commit

```text
orchestrator_base_commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4

orchestrated_source_commit
  = 本规格3项delta形成的新40位single-parent clean commit

source12
  = orchestrated_source_commit[0:12]

source_date_epoch
  = git show -s --format=%ct orchestrated_source_commit
```

新commit唯一parent必须是`orchestrator_base_commit`，禁止merge commit。source patch SHA仍只接受：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary <orchestrated_source_commit>)
```

旧`clean-e598b305a44e`是失败重试现场，只读保留；不得移动到external store、复制为新root、清理后复用或把其65文件从Git status中过滤掉。

## 4. 两个独立物理根

### 4.1 唯一root模型

```text
source_root
  = <absolute clean Git worktree at orchestrated_source_commit>

release_store_root
  = <absolute external non-Git release store>

installed_profile_package_root
  = <release_store_root>/profiles/profile.iso19450.2024.draft/0.2.0

handoff_root
  = <installed_profile_package_root>/handoff

versioned_input_root
  = <handoff_root>/releases/clean-<source12>

manifest_release_parent
  = <release_store_root>/manifests/e2e-v02

profile_staging_parent
  = <release_store_root>/.staging/profile-assets
```

`installed_profile_package_root`是按Profile identity分区的release安装命名空间，不是source Profile资产根；Producer的五项Profile source bytes仍只从`source_root/packages/profiles/...`读取。installed root当前只授权承载`handoff/**`和本规格派生的release资产，禁止把整个source Profile目录复制到该根。

### 4.2 物理独立判定

orchestrator必须在任何写入前对所有已存在segment执行`lstat`，禁止symlink/special；对两个root执行`realpath`后必须满足：

1. inode不同；
2. 字符路径不同；
3. `source_root`不等于、不包含、不位于`release_store_root`内；
4. `release_store_root`执行`git -C <root> rev-parse --is-inside-work-tree`不得返回`true`；
5. Common root、Manifest outer staging/final、Profile staging相互不同且互不包含；它们可共享`release_store_root`祖先；
6. outer staging与Manifest final parent必须位于同一filesystem，保证atomic rename。

禁止用未经解析的`..`、bind path别名、symlink、cwd、env、目录扫描、mount alias或字符串前缀替代realpath/entry-type判断。

### 4.3 Source clean唯一口径

Producer、Manifest Verifier和orchestrator对source-root使用相同判定：

```text
git -C <source_root> rev-parse HEAD
  == orchestrated_source_commit

git -C <source_root> status --porcelain=v1 --untracked-files=all
  == empty bytes
```

判定范围是完整独立source-root，不允许pathspec、exclude、ignore规则新增、过滤`packages/profiles/**/handoff/releases`或“仅允许65项”的例外。`node_modules/**`、`apps/web/dist/**`、`services/**/target/**`只能按既有Git ignore和Bootstrap Closure作为本次clean build派生产物存在；它们仍须通过raw/tree join，不能复用旧build。

orchestrator固定在以下四个reachpoint复查clean HEAD：

```text
SOURCE_PREFLIGHT
AFTER_UNIFIED_INSTALLED_VERIFY
AFTER_MANIFEST_STAGING_VERIFY
AFTER_MANIFEST_INSTALLED_VERIFY
```

任一非空即`CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_DIRTY/2`，且不得继续安装或写READY输出。

## 5. Orchestrator CLI与Owner边界

### 5.1 完整CLI

```text
npm run release:canvas06:e2e:manifest:v02:production -- \
  --source-root <absolute-clean-source-root> \
  --release-store-root <absolute-external-release-store-root> \
  --base-source-commit e598b305a44ebb9c9845c1f5563bc36c3a89a2b4 \
  --source-commit <orchestrated_source_commit> \
  --require-production
```

每个参数恰好一次；拒绝未知、重复、空值、`--x=y`、位置参数、相对root、错误base/source commit和缺少`--require-production`。禁止新增`--handoff-root`、`--common-root`、`--manifest-root`或任意路径override；所有子路径只按第4.1节从两个root和identity派生。

### 5.2 唯一职责

外层orchestrator负责：

1. 参数、commit、source clean、root topology和entry type；
2. external release store的fresh staging/final守卫；
3. 以external `handoff_root`调用统一Builder和installed Verifier；
4. 从installed READY Intake raw bytes派生`intake12/manifest_id/release_id`；
5. 创建外层Manifest staging并调用Producer；
6. 以独立子进程调用staging Verifier；
7. 完整staging tree fsync、atomic rename、parent fsync；
8. 以新独立子进程调用installed Verifier；
9. installed前后tree digest和source clean复核；
10. 只在全部成功后输出READY ref。

它不得读取/修改Manifest JSON字段、重新实现Profile/Common/Handoff语义、调用Verifier内部函数、写Gate状态、生成Report、自动恢复失败root或修改source-root。

### 5.3 子进程信任

四个子入口必须从`source_root/scripts`固定路径启动，普通单链接文件，raw SHA在启动前和每次调用后保持不变。每个子进程必须使用同一个Node 22 executable、受控`JAVA_HOME=JDK 21`和显式argv；拒绝shell、PATH脚本替换、环境参数注入或测试double进入production。

orchestrator捕获每个子进程`stdout/stderr/exit`，要求成功退出`0`且stdout符合对应冻结CLI；非零或额外输出按首错停止。staging与installed Manifest Verifier必须是两个不同PID的新进程。

## 6. 外层路径与唯一事务

### 6.1 派生路径

统一输入安装成功后：

```text
intake12
  = SHA-256(raw bytes of
      <versioned_input_root>/dev-canvas-06-intake-report.json)[0:12]

manifest_id
  = dev-canvas-06.e2e.<source12>.<intake12>

manifest_release_id
  = clean-<source12>-<intake12>

manifest_outer_staging_root
  = <manifest_release_parent>/.<manifest_release_id>.staging

manifest_release_root
  = <manifest_release_parent>/<manifest_release_id>

manifest_final_relative_root
  = dev-canvas-06/e2e/manifests/<manifest_id>

manifest_staging_final_root
  = <manifest_outer_staging_root>/<manifest_final_relative_root>

manifest_installed_final_root
  = <manifest_release_root>/<manifest_final_relative_root>

profile_asset_staging_root
  = <profile_staging_parent>/<manifest_release_id>
```

Producer参数固定映射：

```text
--handoff-root <handoff_root>
--intake-report releases/clean-<source12>/dev-canvas-06-intake-report.json
--source-root <source_root>
--source-date-epoch <source_date_epoch>
--common-fixture-root <versioned_input_root>/dev-canvas-06/common-fixtures/0.2.0
--profile-asset-root <profile_asset_staging_root>
--output-root <manifest_outer_staging_root>
--out <manifest_final_relative_root>/dev-canvas-06-e2e-manifest.json
--require-production
```

### 6.2 唯一顺序

```text
ARGS
-> RESOLVE_AND_LSTAT_TWO_ROOTS
-> ASSERT_EXTERNAL_STORE_NOT_GIT_WORKTREE
-> ASSERT_ROOT_TOPOLOGY_AND_SAME_FS
-> SOURCE_PREFLIGHT
-> ASSERT_TARGET_QUARANTINE_FINAL_TEMP_ABSENT
-> ASSERT_INPUT_AND_MANIFEST_FINAL_STAGING_ABSENT
-> RUN_UNIFIED_BUILDER_TO_EXTERNAL_HANDOFF_ROOT
-> RUN_UNIFIED_INSTALLED_VERIFIER
-> AFTER_UNIFIED_INSTALLED_VERIFY_SOURCE_CLEAN
-> DERIVE_INTAKE12_MANIFEST_ID_PATHS
-> CREATE_MANIFEST_OUTER_STAGING_PARENT
-> RUN_MANIFEST_PRODUCER_IN_OUTER_STAGING
-> ASSERT_PROFILE_STAGING_REMOVED
-> SPAWN_MANIFEST_STAGING_VERIFIER
-> RECOMPUTE_STAGING_TREE_AND_SOURCE_CLEAN
-> FSYNC_ALL_STAGING_FILES_POSTORDER_DIRECTORIES
-> ATOMIC_RENAME_OUTER_STAGING_TO_RELEASE_ROOT
-> FSYNC_MANIFEST_RELEASE_PARENT
-> SNAPSHOT_INSTALLED_TREE_DIGEST
-> SPAWN_MANIFEST_INSTALLED_VERIFIER
-> ASSERT_INSTALLED_TREE_DIGEST_UNCHANGED
-> AFTER_MANIFEST_INSTALLED_VERIFY_SOURCE_CLEAN
-> EMIT_READY_REF
```

统一Builder已安装`versioned_input_root`后若后续Manifest阶段失败，不得删除、移动或修改该输入根；它仍按自身Verifier和quarantine状态独立审计，但不能被本次标记为Manifest production READY。

### 6.3 Staging Verifier

staging Verifier必须读取：

```text
--handoff-root <external handoff_root>
--source-root <independent source_root>
--manifest-root <manifest_staging_final_root>
--profile-asset-root <manifest_staging_final_root>/inputs/upstream/profile-assets
```

它必须在outer rename前退出`0`，并证明Manifest root前后tree digest相等。禁止把Producer内部verify、Schema校验或同进程函数调用替代该独立子进程。

### 6.4 Installed Verifier

outer rename和parent fsync完成后，必须用全新子进程把`manifest-root/profile-asset-root`切换为installed路径，其余identity参数不变。Verifier前后的installed tree digest必须逐字符相等；成功后再次复查source clean。

只有该步骤退出`0`，orchestrator stdout才固定输出一行：

```text
<absolute-manifest-installed-final-root>\t<manifest-raw-sha256>\t<installed-tree-sha256>\n
```

不得输出`READY`自由文本、latest路径或Capability状态。

### 6.5 Transaction tree与最终三元组摘要

外层事务摘要只复用统一Source重建规格第6.3节的普通文件inventory/JCS算法，不新增第二种目录摘要实现。递归root分别固定为：

```text
pre_rename_transaction_root = manifest_outer_staging_root
installed_transaction_root  = manifest_release_root
```

两个root下每个entry固定为：

```json
{"path":"<root-relative-posix-path>","byte_length":123,"sha256":"<lowercase-hex>"}
```

只接受普通、非符号链接、`nlink=1`文件；拒绝空tree、symlink、hardlink、socket、device、FIFO和其他special。`path`不得为空、绝对、含`\\`、`.`或`..` segment；inventory按`path`的UTF-8 bytes升序，随后：

```text
transaction_tree_sha256 = SHA-256(UTF8(JCS(inventory)))
```

outer staging与installed release使用各自root-relative path，因此atomic rename前后inventory bytes及摘要必须完全相等。staging/installed Manifest Verifier各自对`manifest_*_final_root`的只读tree观测仍按其既有契约执行；它们不能替代orchestrator对完整transaction root的前后摘要。

最终stdout第三列`installed-tree-sha256`唯一等于对`installed_transaction_root`复算的`transaction_tree_sha256`。第二列`manifest-raw-sha256`唯一等于：

```text
SHA-256(raw bytes of
  <manifest_installed_final_root>/dev-canvas-06-e2e-manifest.json)
```

orchestrator必须证明：rename前transaction摘要、rename后/installed verifier前摘要、installed verifier后摘要三者逐字符相等；任一不等不得输出三元组。

## 7. 失败隔离与首错

### 7.1 Rename前

- 本轮新建outer staging：orchestrator只能通过exclusive `mkdir`成功后设置进程内`created_outer_staging_this_process=true`，同时保留该目录打开句柄及其`(st_dev, st_ino)`；清理前必须以`lstat`复核路径仍为同一普通目录、句柄身份相等且尚未rename。三项全部成立才允许删除并fsync父目录；不写owner marker或nonce文件。final零输出。
- crash residual或预存在staging：不得自动删除、续跑或覆盖，返回事务错误。
- 已安装统一输入根保持只读，不因Manifest失败回滚。

### 7.2 Rename后

parent fsync、installed verifier、tree不变或source-clean复核失败时：

1. 保留`manifest_release_root`原始bytes；
2. 不输出READY ref；
3. 不删除、移动、覆盖、改名或写入root内部；
4. 后继Runner/Gate只接受orchestrator成功stdout所记录的exact三元组，因此该root不可消费；
5. 恢复、删除或重新验证等待独立恢复规格和operator授权。

不得复用统一输入Quarantine Marker表示Manifest失败，不得在本规格发明第二套marker Schema。相同`manifest_release_id`不得重跑；存在final即fail-closed。

### 7.3 稳定错误与退出码

```text
CANVAS06_MANIFEST_ORCHESTRATOR_ARGUMENT_INVALID / 2
CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_INVALID / 2
CANVAS06_MANIFEST_ORCHESTRATOR_SOURCE_DIRTY / 2
CANVAS06_MANIFEST_ORCHESTRATOR_ROOT_INVALID / 2
CANVAS06_MANIFEST_ORCHESTRATOR_INPUT_FAILED / 3
CANVAS06_MANIFEST_ORCHESTRATOR_PRODUCER_FAILED / 3
CANVAS06_MANIFEST_ORCHESTRATOR_STAGING_VERIFY_FAILED / 3
CANVAS06_MANIFEST_ORCHESTRATOR_INSTALLED_VERIFY_FAILED / 3
CANVAS06_MANIFEST_ORCHESTRATOR_TRANSACTION_FAILED / 4
CANVAS06_MANIFEST_ORCHESTRATOR_INTERNAL_FAILED / 4
```

stderr第一行固定`<CODE>\t<STAGE>`；首错顺序只按第6.2节。不得把子进程错误改写为成功或继续后续阶段。

## 8. 验收矩阵

### 8.1 正例

1. 新source commit为`e598...`单parent的`3=1 M+2 A`；41项owner唯一；
2. source/release store realpath独立，release store不是Git worktree；
3. source在四个reachpoint的完整porcelain输出均为空；
4. external Handoff/Intake/Runtime/Web/Common通过installed unified verifier；
5. Producer接受独立source/Common/output roots；
6. staging和installed Manifest Verifier为不同PID且均退出`0`；
7. fsync/rename顺序、transaction inventory/JCS摘要、staging/installed tree digest和最终stdout三元组闭合；
8. source-root内不存在`handoff/releases/clean-<source12>`或Manifest output。

### 8.2 反例

覆盖：release store等于/位于/source包含source-root、release store是Git worktree、symlink/bind alias、跨filesystem rename、source含任一untracked文件、仅过滤65项、修改ignore、旧build输出、错误HEAD、external input/final/staging/profile staging已存在、错误source12/intake12、Common/Handoff跨root、Producer非零、staging verifier非零/写入、fsync失败、rename失败、installed verifier非零/写入、rename后source变脏、子进程同PID/mock、stdout extra、失败root被Runner消费，以及移动/复制旧`clean-e598...`。

## 9. 完成、回滚与Gate边界

仅当新source commit、external统一输入、outer transaction、staging/installed verifier和最终stdout三元组全部闭合，才可标记：

```text
IMPLEMENTED/MANIFEST_V02_PRODUCTION_INPUT_READY
```

回滚只允许删除未安装且可证明由本轮创建的outer staging。旧内嵌`clean-e598...`、external installed input、rename后的Manifest root、历史root、用户模型和证据均不得原地修改。

该状态仍只提供Runner production输入；不等于`194/388`、E2E Report、`GATE-06-03`、Candidate、Activation、Capability enablement、production发布或ISO符合性。

## 10. 当前状态

- `e598b305...`集成source commit：`IMPLEMENTED`。
- 内嵌`clean-e598b305a44e`：`REJECTED_BY_ROOT_ISOLATION/READ_ONLY_FAILURE_SCENE`。
- 外置Release Orchestrator旧3文件设计：`SUPERSEDED/DO_NOT_IMPLEMENT`。
- Orchestrator source commit：`NOT_CREATED`。
- External production input/Manifest：`NOT_RUN`。
- Manifest Producer直接执行：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`。
- Gate/Candidate/Activation/Capability/ISO：`NOT_RUN/NOT_ENABLED/EVIDENCE_MISSING`。
