# Spec: DEV-CANVAS-06 Final Production Source Chain Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

设计状态：`FINAL_PRODUCTION_SOURCE_CHAIN_FROZEN / STAGE_A_RUNNER_OWNERSHIP_CLOSED`

实现状态：`C_S_A_R0_R_R2_CREATED / R2_PRODUCTION_REBUILD_PENDING / PRODUCTION_194_388_NOT_RUN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Common/External 集成 source、Fault Launcher contract/2A 与最终 E2E Runner 之间的source identity分叉及Stage A的Runner source ownership冲突，冻结唯一连续生产链：

```text
9048bb3 integrated origin
  -> rebuilt Fault contract
  -> rebuilt Gate Observation schema conformance
  -> Fault Launcher 2A
  -> final E2E Runner
```

本规格只修正 source identity、stage allowlist、patch identity、External Store 校验和最终生产重建顺序，不修改 Fault Launcher 产品语义、Manifest/Report Schema、Runner Source Set、公共 API、SQLite DDL、Profile 业务 bytes、Gate 或 Capability 状态。

## 2. 最小复现与 Root Cause

### 2.1 已复现事实

1. `9048bb355aff18d5c00fbbaeb1660b979f4e6daa`以`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`为唯一 parent，完成既有`17=14 M+3 A` Common/External 集成 source；
2. 从该 commit 的 fresh clean worktree 与 external release store 已生成 Manifest `0.2/0.2.0`，其`source_build.source_commit=9048bb3...`、`cases.length=194`、`summary.attempt_count=388`；
3. 旧 Fault 链固定为`0dcaa27... -> 63851f8... -> 586d6de... -> 2A`，而`9048bb3...`与`0dcaa27...`是同 parent 的 sibling，不是该链祖先；
4. 旧 Common/External 规格要求最终 commit 必须直接 parent 于`e598...`且 delta 恰为17项；后继 Fault contract、2A 与 Runner source bytes 无法同时满足该限制；
5. Manifest、source HEAD、Runner 与 Report 又必须逐字符绑定同一最终 source commit，祖先关系或相同业务行为不能替代 source identity 相等。
6. Stage A原allowlist只有两个新增文件，但controlled Playwright spec按Preflight契约必须调用既有Runner owner；Runner owner及测试原先只在Stage R可修改，A无法合法形成受控调用接口，只能复制Runner语义或调用未冻结接口。

### 2.2 Root Cause

旧设计分别冻结了Common/External单提交闭包和Fault 2A三段闭包，但没有为“已形成的集成origin之后继续追加Fault contract、2A与完整Runner”建立统一parent chain；同时把Runner owner的全部修改权推迟到R，却要求A阶段新增spec调用该owner。结果是Git identity和source ownership两条局部约束组合后不可满足。

### 2.3 为什么此前未发现

`17=14 M+3 A`冻结时Fault contract与Runner后继bytes尚未形成；Fault D01冻结时新的External Store实际重建commit尚未接纳；首次source-chain闭包只检查路径集合和最终六方join，没有沿“controlled spec -> Runner owner”调用关系复核A阶段修改权限。

## 3. Fix Strategy

1. 接纳`9048bb3...`为唯一 final-production chain origin，`0dcaa27.../63851f8.../586d6de...`降为历史不可消费链；
2. 从 origin 依次重建 Fault contract、schema conformance、2A 和 Runner，五个节点都必须 single-parent；
3. Source-chain 校验 owner 在新的 Fault contract 阶段形成，使2A提交可以生成与自身 source identity 一致的受控 Manifest；
4. 2A controlled evidence只绑定2A commit；最终 production Handoff、Intake、Runtime、Web、Common、Manifest、真实`194/388`与Report只绑定Runner final commit；
5. External Store不再验证“final直接parent=e598且只有17项”，改为验证本规格完整链、逐阶段allowlist、累计allowlist和patch SHA；
6. 旧`9048bb3...` Manifest保留为只读的`ORIGIN_BUILD_VERIFIED`证据，不得作为Runner final的production输入。
7. Stage A同时修改既有Runner owner及其测试，使新增controlled spec只能调用该owner而不复制编排语义；Stage R允许继续修改同两文件以完成production `194/388`，但必须保持Stage A controlled行为与测试逐项通过。

## 4. Origin Intake

### 4.1 Git身份

```text
origin_source_commit=9048bb355aff18d5c00fbbaeb1660b979f4e6daa
origin_parent_commit=e598b305a44ebb9c9845c1f5563bc36c3a89a2b4
origin_tree=1ca126fca2c04410423d7775261cf05dabdad682
origin_committer_epoch=1787882046
origin_patch_sha256=5f127fae46690230a8b43e91a2220d1802879454d20987ee5b850ae77710ae72
origin_delta=17=14 M+3 A
origin_status=READY_AS_FINAL_CHAIN_ORIGIN
```

`origin_patch_sha256`唯一算法为：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary <origin_source_commit>)
```

### 4.2 已生成Manifest的边界

已观测 Manifest raw ref：

```text
byte_length=426838
sha256=70dddf3d5d515aa5522575c47f14c3e4c107f44a061063442e306e54d10b1422
schema_id=OPM-DEV-CANVAS-06-E2E-MANIFEST-001
schema_version=0.2
manifest_version=0.2.0
source_build.source_commit=9048bb355aff18d5c00fbbaeb1660b979f4e6daa
case_count=194
attempt_count=388
```

该 Manifest证明`9048bb3...`的 External Store与Manifest producer/verifier链能够形成194项输入，不证明任何case已执行，也不构成最终production Manifest、E2E Report或Gate证据。Runner final形成后必须新建版本根，禁止复制、改写或复用该Manifest。

### 4.3 Fault 36项基线复算

新 origin 必须逐项复算历史Clean Base规格第6章36个`{path,byte_length,sha256}`。当前实算结果与旧origin相同：

```text
baseline_count=36
baseline_raw_refs_sha256
= SHA-256(RFC8785_JCS(固定顺序36项raw ref数组))
= 69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e
```

这是一项从`9048bb3...`重新观测得到的事实，不是对旧摘要的继承。任一单项漂移必须停止后继chain Build并新开baseline bugfix，不得改写表值或放宽比较。

## 5. 五节点连续链

| 角色 | 记号 | 唯一parent | 状态 |
| --- | --- | --- | --- |
| integrated origin | `O` | `e598b305...` | exact `9048bb3.../READY` |
| rebuilt Fault contract | `C` | `O` | `f4c978e9e7fd0f47a7db8bbd4999b8c9370efafc/CREATED` |
| rebuilt schema conformance | `S` | `C` | `2f698cff34aeb9a0916c9a45b507083f1bf937fa/CREATED` |
| Fault Launcher 2A | `A` | `S` | `db85405526c558275d8c20a8beb75601968e2e3a/CREATED` |
| Runner implementation | `R0` | `A` | `144e74bfa64dfb79bcea5ce572034768e4b3b016/CREATED` |
| final E2E Runner delta-owner closure | `R` | `R0` | `4b30d269c100e655e8c75060a96bcb2ae11e4aa0/CREATED` |
| Runner CLI source closure | `R2` | `R` | `6918ee26153f880802ebadbc8fc01407e4f5b906/CREATED` |

未来commit不得预填占位SHA。创建后必须把完整40位commit、tree、committer epoch、唯一parent、stage patch SHA及逐文件raw ref写入本规格checklist接纳记录。禁止merge、rebase后偷换、amend历史commit、replace/graft、shallow缺对象、cherry-pick额外路径或以branch/tag名称替代完整commit。

R0接纳记录：

```text
commit=144e74bfa64dfb79bcea5ce572034768e4b3b016
parent=db85405526c558275d8c20a8beb75601968e2e3a
tree=c46fd781dd81ce82945d8a96b5b5d6aa1f2919bd
committer_epoch=1788163222
stage_delta=63=52 M+11 A
stage_patch_sha256=5a3e0dde8c581d22b96cb5e37336709c439826c4b9c7f1670aedff09d1cca88f
R0_cumulative_delta=83=62 M+21 A
R0_source_patch_sha256=b690f151e06ceb8dd07bf2f897ee729497b9ff955bd0c505cad3974ca7d35161
```

R0遗漏了其自身`RUNNER_DELTA`的30项活动Common编排路径，导致Unified Input verifier以旧33项数组拒绝R0。禁止amend R0。唯一后继R固定为`2 M`：`scripts/canvas06-unified-production-input.mjs`与`scripts/canvas06-unified-production-input.test.mjs`。R必须先以常量精确校验`A -> R0=63=52 M+11 A`，再校验`R0 -> R=2 M`；两个R路径均已存在于R0 allowlist，故按唯一status/path集合计算的最终`O -> R`仍为`83=62 M+21 A`。不得新增CLI字段、依赖、Schema、公共API或任何其他路径。

R接纳记录：

```text
commit=4b30d269c100e655e8c75060a96bcb2ae11e4aa0
parent=144e74bfa64dfb79bcea5ce572034768e4b3b016
tree=dd70b0e522f7b6696867b19b71ad6cdb13d7898e
committer_epoch=1788163660
stage_delta=2=2 M
stage_patch_sha256=4c8d34d2536f92fb5031910eaafed37461e678c37dd5056314dec20c9059d652
final_cumulative_delta=83=62 M+21 A
final_source_patch_sha256=27a95313f9b1cbc48c666ae2d6a1d3012e34b9608c936dd04bbaa309244e3837
```

R2接纳记录：

```text
commit=6918ee26153f880802ebadbc8fc01407e4f5b906
parent=4b30d269c100e655e8c75060a96bcb2ae11e4aa0
tree=0c2be2d2551a477a711f072e2812532f02c0d1a1
committer_epoch=1788169086
stage_delta=9=9 M
stage_patch_sha256=75cfb71f948be97805297e4abd90d9dd176585ab71748c5a55cea9190da688e6
final_cumulative_delta=83=62 M+21 A
```

## 6. Stage C：Rebuilt Fault Contract

Stage C固定为`20=12 M+8 A`，包含旧contract 12项及source-chain-aware External Store 8项修改。

### 6.1 `12=4 M+8 A`既有contract职责

```text
A docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json
M package.json
A scripts/release-canvas06-e2e-fault-launcher-preflight-input.mjs
A scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs
M scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs
M scripts/verify-canvas06-controlled-input-bundle.mjs
M scripts/verify-canvas06-controlled-input-bundle.test.mjs
A scripts/verify-canvas06-e2e-fault-launcher-preflight-input.mjs
A scripts/verify-canvas06-e2e-fault-launcher-preflight-input.test.mjs
```

### 6.2 External Store source-chain owner：`8 M`

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/rebuild-canvas06-unified-production-inputs.mjs
M scripts/rebuild-canvas06-unified-production-inputs.test.mjs
M scripts/verify-canvas06-unified-production-inputs.mjs
M scripts/verify-canvas06-unified-production-inputs.test.mjs
M scripts/rebuild-canvas06-manifest-v02-production.mjs
M scripts/rebuild-canvas06-manifest-v02-production.test.mjs
```

新contract patch必须重新计算。历史`63851f8...`的`1a17f030...`只作为迁移对照，不得写入新chain的READY记录。Stage C除上述20项外零delta。

## 7. Stage S：Schema Conformance

Stage S固定为`2 M`：

```text
M docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
M scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs
```

语义继续是FAILED分支允许真实`0..12`项DURING有序前缀并支持`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED`。若Stage C对应两文件的结果bytes与历史contract一致，则Stage S patch SHA必须复算并等于：

```text
56138e19bd83241ffdd60bda3f156a3f9c0b768c6d083ea453893e428ce021e4
```

任一输入bytes不同不得沿用该SHA，必须停止并修订本规格；禁止“语义相同”替代raw patch相等。

## 8. Stage A：Fault Launcher 2A

Stage A由后继Release Discovery与Source Guard闭包修正为`7=5 M+2 A`：

```text
M scripts/canvas06-e2e-release-config.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

两个Runner `M`唯一承接controlled invocation所需的Runner owner接口、Invocation Context消费、attempt准备和对应回归；discovery test与两个C/A重叠的source guard `M`只关闭新增spec发现和七路径身份。不得在A实现完整production `194/388` Report聚合。两个`A`只负责受控父进程与Playwright spec，不得复制Runner的fixture、Runtime/Web、attempt或关闭语义。

Stage A唯一受控生命周期接口由`opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-task-spec.md`冻结为`runControlledLifecycleSession({invocation_context,manifest,preflight_descriptor,cycle_handlers})`。`prepareControlledAttempt()`只允许该接口内部调用；spec的12个预绑定handler各只接收`{origin,observation_sink}`，并逐cycle拥有和关闭fresh Chromium process/context/page。sink恰含六个顶层成员；spec必须在route/navigation/API前attach真实Page并在finally关闭三者后以相同对象confirm。Runner以同Page网络事件、对象引用、三类关闭事件及零pending接纳临时confirm，随即冻结业务观测并无间隙保留最小迟到事件sentinel；只有handler settle、零迟到事件复核、sink/precondition client关闭和全部sentinel移除后才接纳最终Browser proof。Runtime/Web spawn、exact READY、`INITIAL -> REOPEN`、Common Driver client factory、Runtime/Web child终止、12个唯一端口去重回收、D10B三类采样和Gate Artifact writer全部归该接口；父Node只拥有Playwright test child终止。confirm后迟到事件、监听空窗、sentinel提前移除或最终残留均使Browser proof不闭合，固定`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`且零当前DURING/零可消费Artifact。接口及其Runner测试未实现前，禁止创建A commit；只能继续D01~D10A工具和preflight验证，且不得伪造D01 READY或启动D10B。

Preflight Report继续使用文档级`0.2`字段，不升级Schema：

```text
origin_base_source_commit=O
contract_base_source_commit=S
candidate_source_commit=A
```

D01从`parent(A)=S`、`parent(S)=C`、`parent(C)=O`复算四节点三段；`implementation_delta`只表达`S -> A`的七个固定路径，按UTF-8 path bytes排序，expected status依次为`M/M/M/M/M/A/A`。36项baseline摘要继续为第4.3节实算值；新增discovery test不属于历史36项，两个unified owner与两个Runner允许在A按本节变更，其余历史baseline保持逐byte不变。

Stage A必须用`source_chain_target=FAULT_2A`生成与`A`同源的受控输入和Manifest，在lifecycle接口实现及A commit形成后完成D01~D09/D10A及controlled Playwright/D10B。该结果不允许冒充Runner final production证据。

## 9. Stage R：Final E2E Runner 与 Family Driver

Stage R经[Family Controlled Invocation闭包修正规格](opm-dev-canvas-06-family-controlled-invocation-closure-bugfix-task-spec.md)、[Service Regression/Source Guard闭包](opm-dev-canvas-06-stage-r-service-regression-source-guard-closure-bugfix-task-spec.md)、[Family Attempt Path Owner闭包](opm-dev-canvas-06-family-attempt-path-owner-source-closure-bugfix-task-spec.md)、[Stage R Release Discovery闭包](opm-dev-canvas-06-stage-r-release-discovery-closure-bugfix-task-spec.md)、[API Exchange/Artifact Index闭包](opm-dev-canvas-06-family-api-exchange-artifact-index-closure-bugfix-task-spec.md)、[Attempt Artifact Family Case ID/Archive Ref闭包](opm-dev-canvas-06-attempt-artifact-family-case-id-closure-bugfix-task-spec.md)、[Common Precondition Machine Contract闭包](opm-dev-canvas-06-common-precondition-machine-contract-closure-bugfix-task-spec.md)及[Common Driver与受控编排实现规格](opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md)第3.1节扩展为`63=52 M+11 A`：非文档`50=43 M+7 A`，文档同步`13=9 M+4 A`。后者是Stage R唯一完整allowlist；本规格不再保留已失效的33项子集，且不得扩展为整个Runner Source Set。

Family Driver执行设计与[Family Error Code Mapping与Source Closure修正规格](opm-dev-canvas-06-family-error-code-mapping-source-closure-bugfix-task-spec.md)已确认Golden Replay目标集合恰为`19=15 CTRL+4 STRUCT`，但真实Service校验路径仍可能返回`DOMAIN_REJECTED`。上述五个API/Runtime contract路径固定为Stage R最先执行的`5 M`子切片：同步OpenAPI Schema正反例、只在19项最窄谓词映射稳定top code，并以真实Service/SQLite/candidate/command HTTP raw body和既有Service回归证明正反边界。随后共享Attempt path owner/test、release discovery test和两个统一source guard路径必须接纳26/45集合。禁止批量替换`domain()`、改变未列领域错误或修改generated EDT contract。子切片失败时不得继续Family Driver/Runner、形成R或生成证据；禁止Driver改写wire事实。

职责固定为：

1. `package.json`增加唯一production/controlled Runner命令，不改依赖和lockfile；
2. `release-canvas06-e2e-run.mjs`完成既有owner内CLI、194/388严格串行调度、Runtime/Web/browser生命周期、attempt聚合和事务调用；
3. preflight只接受活动Manifest v02、完整source chain及最终source identity；
4. report owner只写活动Report`0.2/runner_version=0.2.0`并执行137 PASS/57 BLOCKED、194 case/388 attempt聚合；
5. 三个对应Runner测试文件覆盖正反例、首错、零输出和最终source join；
6. API/Runtime contract子切片先闭合`MODIFIER_COMBINATION_INVALID`的OpenAPI ErrorDetail、19项Service映射、Service回归与真实HTTP raw body，并证明未列领域错误保持原码；共享Attempt path owner随后接纳Family/Common两类ID，release discovery、API Exchange/Artifact Index、Family Archive Ref与统一source guard升级到31/50；
7. 三个Family Driver按`docs/design/opm-dev-canvas-06-e2e-family-driver-execution-design.md`实现`178=33+35+110`项五方exact join、真实UI/API路径、SETUP/subject transaction和PASS/BLOCKED reopen/evidence；定向验收收敛在已允许的`scripts/release-canvas06-e2e-run.test.mjs`，不新增helper或第二个Driver测试文件；
8. `LocalApiService.java`不属于Runner Source Set；R必须从同一clean tree重建Runtime JAR，并更新Handoff/Manifest/Attempt/Report的JAR raw identity。
9. 新增Context Schema `0.1`、唯一production bridge和Schema正反例，Runner owner生成/验证388项Context、按`driver_id`加载Driver并构造CaseExecution/五参数调用对象；
10. Runner Source Set升级为`0.2/0.2.0/24`，新增bridge为第20项，四Driver顺延至21~24；Report保持`0.2/runner_version=0.2.0`。

`release-canvas06-e2e-run.mjs`及其测试是A/R两个stage的显式重叠owner：`S -> A`必须产生非空controlled patch，`A -> R`必须产生非空production patch。R不得删除、旁路或放宽A已冻结的`--run-controlled`、Invocation Context、Runner owner调用、D10A/D10B或其正反例；Stage R验收必须先重跑Stage A controlled测试，再验收production路径。

升级后的Runner Source Set相对A的entry变化由上述第3.1节及活动Source Set Schema逐项约束，不能仅以24项Source Set替代63项Stage R allowlist。Fault基线中的E2E Materializer CLI及其定向测试、Common Driver/其测试、Common Setup Plan、Snapshot CLI、Projection Digest、生产bridge及其前端selector都只能由第3.1节指定路径进入；其余产品Java/Vue和未列Schema保持逐byte不变。Attempt Artifact `0.2`只允许API Exchange/Artifact Index、Family identity与本后继ref联合修正。若真实实现证明63项仍不足，必须再次新增bugfix规格，不得静默加入路径。

## 10. 累计 Final Allowlist

从`O`到最终`R2`的累计diff固定为`83=62 M+21 A`。其中`O -> R0=83=62 M+21 A`已实算，`R0 -> R=2 M`与`R -> R2=9 M`只再次修改既有owner，不新增累计status/path。Stage S修改Stage C新增路径，Stage A再次修改两个C阶段unified source owner和release discovery test，R0又修改这些重叠owner，`package.json`与Stage C重叠，且两个Runner owner同时在Stage A、R0与R2修改，因此不能简单相加stage计数。Stage A累计为`O..A=25=15 M+10 A`。

累计allowlist不是第二份人工复制清单。唯一可执行定义是：第6章的C allowlist、第7章的S allowlist、第8章的A allowlist、[Common Driver与受控编排实现规格](opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md)第3.1节的R0 `63=52 M+11 A` allowlist、本章冻结的R `2 M` allowlist和R2 `9 M` CLI allowlist，按`O..R2`实际Git diff去重后形成的有序`83=62 M+21 A`数组。验证器必须先后重算`A..R0`、`R0..R`、`R..R2`和`O..R2`，禁止保留或消费本节历史52项文本清单。

比较必须使用UTF-8 path byte order的有序`status + TAB + path`数组，禁止rename/copy推断、extra、missing、状态替换或只比较数量。

## 11. Source-chain校验契约

### 11.1 唯一Git算法

External Store Builder、Verifier和Manifest outer orchestrator必须使用显式source root的exact object database并禁用replace：

```text
git --no-replace-objects rev-parse HEAD
git --no-replace-objects rev-list --parents -n 1 <commit>
git --no-replace-objects diff --no-renames --name-status <from>..<to>
git --no-replace-objects show --format= --no-ext-diff --binary <commit>
git status --porcelain=v1 --untracked-files=all
```

禁止branch/tag/abbrev、commit message、mtime/latest、远端ref、graft/replace、shallow缺对象、目录名或祖先存在即放行。

### 11.2 两种封闭target

```text
source_chain_target=FAULT_2A
  HEAD=A
  verify O -> C -> S -> A
  cumulative delta O..A = 25=15 M+10 A

source_chain_target=FINAL_RUNNER
  HEAD=R
  verify O -> C -> S -> A -> R0 -> R
  cumulative delta O..R = 83=62 M+21 A
```

统一Builder、Verifier和Manifest outer orchestrator的唯一CLI字段固定为：

```text
--source-chain-target FAULT_2A|FINAL_RUNNER
--origin-source-commit <O完整40位SHA>
--fault-contract-source-commit <C完整40位SHA>
--schema-conformance-source-commit <S完整40位SHA>
--fault-2a-source-commit <A完整40位SHA>
--runner-source-commit <R完整40位SHA>  # 仅FINAL_RUNNER必填，FAULT_2A禁止出现
--source-commit <A或R完整40位SHA>
```

每项恰好一次，未知、重复、空值、缩写SHA、错误target字段组合均返回既有`CANVAS06_UNIFIED_ARGUMENT_INVALID/2`并在任何staging创建前终止。parent、stage allowlist、累计allowlist、patch SHA、target HEAD或`source-commit`不匹配统一返回既有`CANVAS06_UNIFIED_BASE_INVALID/2`；source porcelain非空返回既有`CANVAS06_UNIFIED_SOURCE_DIRTY/2`。三类失败均为零staging、零final、零quarantine marker。禁止环境变量、配置文件、Git历史扫描或fallback补齐。`source-commit`必须在`FAULT_2A`时逐字符等于A，在`FINAL_RUNNER`时逐字符等于R。

### 11.3 Patch身份

每个新commit必须记录：

```text
stage_patch_sha256
= SHA-256(raw stdout bytes of:
    git show --format= --no-ext-diff --binary <stage-commit>)

final_source_patch_sha256
= SHA-256(raw stdout bytes of:
    git diff --no-ext-diff --binary O R)
```

必须分别记录`C/S/A/R` stage patch SHA和最终累计patch SHA。禁止使用commit SHA、tree SHA、文件摘要集合或`git patch-id`替代。

Stage A patch接纳还必须证明`git diff --no-renames --name-status S A`恰为第8章七项；R0 patch必须证明`git diff --no-renames --name-status A R0`恰为[Common Driver与受控编排实现规格](opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md)第3.1节的63项，其中52项为已跟踪修改、11项为新增。R patch必须精确为本章新增的两个`M`。R0的两个Runner、Source Set stage owner/test、共享Attempt path owner/test、release discovery test、Attempt Artifact Schema、Report verifier/test、统一source guard owner/test、API/Runtime contract、Materializer/Snapshot CLI及测试、Projection Digest、Common Setup Plan、四Driver与production bridge raw SHA必须分别不同于A；四Driver还必须与Manifest `driver_catalog[0..3]`和Runner Source Set闭合。`LocalApiService.java`及Materializer CLI必须通过最终R重建Runtime JAR raw identity闭合，Java测试不得加入Source Set。任一stage同路径bytes未变化、只改测试未改owner、只改owner未改测试，均返回`CANVAS06_UNIFIED_BASE_INVALID/2`。

## 12. 生产重建与六方Join

唯一顺序：

```text
VERIFY_O_INTAKE_AND_36_BASELINE
-> BUILD_AND_ACCEPT_C
-> BUILD_AND_ACCEPT_S
-> BUILD_AND_ACCEPT_A
-> BUILD_AND_VERIFY_FAULT_2A_CONTROLLED_MANIFEST_AND_EVIDENCE
-> BUILD_AND_ACCEPT_R
-> VERIFY_FINAL_CHAIN_AND_83_ALLOWLIST
-> CREATE_FRESH_CLEAN_WORKTREE_AT_R
-> CREATE_FRESH_EXTERNAL_RELEASE_STORE
-> REBUILD_HANDOFF_INTAKE_RUNTIME_WEB_COMMON_FROM_R
-> RUN_NEW_PROCESS_UNIFIED_VERIFIER_WITH_FINAL_RUNNER_TARGET
-> BUILD_MANIFEST_V02_FROM_R
-> RUN_STAGING_AND_INSTALLED_MANIFEST_VERIFIERS
-> RUN_PRODUCTION_194_388_FROM_R
-> BUILD_AND_VERIFY_REPORT_FROM_R
```

最终必须满足：

```text
Handoff.source_build.source_commit
= Intake resolved Handoff source_commit
= Manifest.source_build.source_commit
= source-root HEAD
= Report.runner_identity.source_commit
= R
```

Runner Source Set按活动`0.2/24` raw ref计算`runner_source_sha256`；它不等于Git commit SHA，但其所有bytes必须来自同一clean`R` tree。相对A只允许`release-canvas06-e2e-run.mjs`、Report verifier、preflight/stage/report、共享Attempt artifact五个生产owner、三个Family Driver和新增production bridge共10项entry变化或新增，其余14项逐byte不变；最终24项source/mirror ref与aggregate均从R复算。Runtime JAR与Web dist必须从`R`重建并进入Manifest final root，禁止复用`9048bb3...`版本根。

## 13. 取代关系

1. 取代Common/External集成规格中“最终commit直接parent=e598且最终delta只有17项”的活动限制；`e598 -> 9048`的17项只作为origin intake保留；
2. 取代Fault Clean Base、D01、Preflight和实现规格中`0dcaa/63851f8/586d6de`作为活动chain的决定；旧commit保持只读历史；
3. 不取代36项字段表、Fault产品语义、2A两个新增path、Preflight Report`0.2`字段、D10A/D10B、Manifest/Report/Source Set版本及Runner业务验收；Stage A新增两个Runner `M`只修正source ownership；
4. 取代Runner/Manifest规格中“六方等于17项final commit”，改为六方等于`R`；
5. 任何旧checklist的READY只保留历史含义，不得绕过本规格stage接纳。

## 14. 验收矩阵

正例至少覆盖：

1. O完整metadata、17项origin delta、36项raw ref与摘要实算通过；
2. O->C、C->S、S->A、A->R四段parent与stage allowlist全部精确，A为`7=5 M+2 A`且R重跑A controlled回归；
3. FAULT_2A target只接受A并生成source=A的受控Manifest；
4. FINAL_RUNNER target只接受R并验证`83=62 M+21 A`累计allowlist；
5. Stage C/S/A/R和最终累计patch SHA全部从raw Git stdout复算；
6. 从R新建的Handoff/Intake/Runtime/Web/Common/Manifest及Report完成六方join；
7. 旧9048 Manifest保持只读且未被复制进R版本根。

反例至少覆盖：

1. 继续使用0dcaa/63851f8/586d6de旧链、sibling拼接或cherry-pick后省略parent验证；
2. R直接parent于9048、e598、C或S，或任一merge commit；
3. FAULT_2A传R、FINAL_RUNNER传A、source HEAD与target不等；
4. 任一stage只有计数相同但path/status不同；
5. 最终累计delta仍按17、28、31、34、52或任何非83项判断，或放行83项外extra；
6. 复用9048 Manifest、Runtime、Web或Common作为R资产；
7. patch SHA使用文本转码、trim、commit SHA或tree SHA；
8. source dirty、replace/graft、shallow缺对象、symlink/hardlink/special file或失败后残留可消费root；
9. Manifest、Runner、Report任一source commit不等于R；
10. 未完成真实388 attempts却生成READY Report或提升Gate。
11. A仍只有两个`A`、新增spec复制Runner语义、`implementation_delta`缺少两个Runner `M`或次序/状态错误；
12. R覆盖A阶段controlled入口、Invocation Context或测试，或以A/R同路径为由省略任一stage patch校验。
13. `LocalApiService.java`缺失、加入24项Source Set、19项外领域错误被改码，或R继续消费O/A Runtime JAR。
14. production bridge未进入Source Set、Context不是388项、Driver未按`driver_id` exact dispatch，或precondition client使用Node HTTP/跨origin/重试。

## 15. 修改边界

本设计任务只允许新增本规格/checklist并同步现有设计、规格、checklist、索引与冻结基线。禁止修改本轮任何Java/Node/Vue实现、Schema、package.json、release root、Git commit、Handoff、Manifest或Report bytes。

后继Build只能按第6至10章stage allowlist修改source。若实现发现allowlist不足或语义冲突，必须停止并新增bugfix规格；不得把当前dirty main、未提交实现或历史release root带入chain。

## 16. 回滚与状态边界

回滚本设计修正后，必须把Fault 2A、Runner和真实`194/388`恢复为`BLOCKED_BY_CROSS_CHAIN_SOURCE_IDENTITY_CONFLICT`；不得恢复旧sibling链或把9048 Manifest手工改写为未来commit。R形成后如需回滚错误码映射，必须以R为基础创建新的后继commit，并从该commit重建Runtime JAR及全部版本化生产输入；禁止原地覆盖R、只回滚Service却继续消费旧JAR，或删除不可变证据。

本规格冻结不表示2A controlled验证、production `194/388`、E2E Report、GATE-06-03、Candidate、Activation、Capability、production发布或ISO 19450:2024符合性已经完成。C/S/A/R已创建仅证明其Git parent、阶段allowlist与定向验证已闭合。

## 17. 事实与假设

### 17.1 事实

1. O、旧Fault三commit及其parent关系均可由当前Git对象复算；
2. O与旧origin的36项Fault baseline bytes相同，实算集合摘要为`69491a...b411e`；
3. O的external Manifest存在且包含194 case/388 attempt调度，source commit为O；
4. O与旧origin是siblings，旧Fault链不能直接成为O的后继；
5. A阶段新增受控spec必须调用既有Runner owner，原`2 A`边界无法授权必要owner修改；
6. C/S/A/R已创建且其single-parent关系、R阶段delta与累计delta已复算；真实`194/388`未执行。

### 17.2 假设

无。未来commit、patch SHA、Runtime/Web digest、Manifest/Report SHA必须由后继clean Build与实际执行生成，不能在设计阶段猜测。
