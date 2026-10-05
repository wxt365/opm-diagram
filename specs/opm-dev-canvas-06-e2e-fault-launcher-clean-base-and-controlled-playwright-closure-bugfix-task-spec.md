# Spec: DEV-CANVAS-06 E2E Fault Launcher Clean Base与受控Playwright闭包修正

文档状态：`FROZEN`

设计修正状态：`COMPLETE`

后继状态：`SUPERSEDED_FOR_BUILD_BY_FINAL_PRODUCTION_SOURCE_CHAIN`

Build准入：`HISTORICAL_NOT_CONSUMABLE`

活动后继：`opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`已把`0dcaa27...`降为历史不可消费origin，并从`9048bb3...`重新复算相同的36项raw-ref基线及集合摘要。本文36项字段表和两个controlled新增路径继续作为历史来源；活动A-stage allowlist已扩为`4=2 M+2 A`，两个Runner `M`只由后继规格授权。旧commit链和本文原`2 A` delta不得作为后继2A或Runner的Build输入。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

旧Fault Launcher实现规格把38个逻辑路径全部定义为可修改source delta，同时把clean base intake保留为`BLOCKED_BY_BASE_INTAKE`。当前Git事实已经变化：commit `0dcaa27a92693feaf28b731ebed2f81a9ccea02c`包含旧38项中的36项，只有以下两项不存在：

```text
tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
```

继续按旧38项allowlist实现，会允许为补两个受控测试而静默改写已经进入clean base的36项产品、Runner和测试bytes，无法区分“补测试”与“修基线缺陷”。旧规格还只用自然语言记录controlled Playwright的`BLOCKED_BY_DEPENDENCY`，未冻结机器输出、依赖顺序、退出码和零执行边界。

后继修正说明：本规格继续作为`0dcaa27...`与`36 READ_ONLY_BASELINE + 2 A`的历史冻结来源；当前受控输入、D10拆分和Build准入以Preflight Descriptor/Gate Observation闭包及其Contract Base Schema Conformance后继规格为准。候选`63851f8...`因Schema conformance缺陷被拒绝，其`2 M` single-parent后继形成并接纳前，不得从本规格的旧READY结论启动2A。

## 2. Root Cause

### 2.1 问题原因

Fault Launcher规格创建时没有可接纳的活动base，因此用38项预计路径同时表达实现范围和未来测试范围。后续36项已在集成source中形成，但规格没有把“预计可修改路径”收敛为“36项不可变基线raw ref + 2项新增delta”。

### 2.2 为什么之前未被发现

已有checklist按功能测试通过项更新实现状态，但没有重新对exact clean commit执行38路径存在性分类，也没有把Playwright依赖阻断作为独立机器对象验证。

## 3. Fix Strategy

唯一修正如下：

1. 接纳完整`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`为Fault Launcher clean base intake；
2. 旧38路径集合重新分类为`36 READ_ONLY_BASELINE + 2 A`；
3. 36项以第6章raw ref及集合摘要锁定，2A实现不得修改任一baseline byte；
4. 新测试若发现36项中的代码缺陷，当前2A任务立即停止，必须新建独立bugfix规格扩展allowlist；
5. 为controlled Playwright新增封闭依赖预检和`BLOCKED_BY_DEPENDENCY`机器输出，依赖未齐时零Runtime/Web/Browser/SQLite/attempt执行；
6. Source Set、Report、Manifest、Attempt Artifact、OpenAPI、SQLite、Profile和公共HTTP wire均不升级或修改。

## 4. Clean Base Intake

### 4.1 Git身份

```text
base_source_commit=0dcaa27a92693feaf28b731ebed2f81a9ccea02c
base_parent_commit=e598b305a44ebb9c9845c1f5563bc36c3a89a2b4
base_tree=ed8a3093e37a858a1a26f40c2c549ded9de8c4b8
base_committer_epoch=1787730276
base_patch_sha256=28d64b7cd68a1cd67a94086d61b1853f5fec3b14f37e5cc68ebd61e5ccd09ed9
base_intake_status=READY
```

`base_patch_sha256`固定为以下命令raw stdout bytes的SHA-256：

```text
git show --format= --no-ext-diff --binary 0dcaa27a92693feaf28b731ebed2f81a9ccea02c
```

`0dcaa27...`恰有一个parent且等于`e598...`。`git diff --name-status e598... 0dcaa27...`必须保持既有`17=14 M+3 A`集成Source集合，不由本规格重解释。

### 4.2 活动输入指纹

下表保留本规格指定历史 controlled source 的精确指纹。现行源码的 Fault Schema pin 已由[合并后修正规格](./opm-integrated-failed-items-bugfix-task-spec.md)及[实现规格第 4.1 节](./opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md#41-生产java与构建文件7-read_only_baseline)升级；不得把本表或旧发布证据套用于当前源码，也不得回写历史指纹。

| 输入 | byte_length | SHA-256 |
| --- | ---: | --- |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json` | `55716` | `3508290bf1d1d5f7d297ea48e69fdb4e1ebaf4f907b936b30cd4b769d6a916b4` |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-manifest-v02.schema.json` | `25926` | `3b053dc40a7ce28c94a8fc2b67e2f2a6b71cc68baa3c101f00c9e33f7468320d` |
| `docs/contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json` | `5308` | `93ffc6d2f1d2d5daeb42fab28befdf01a6751d2d9bb1806aa01a2acd7e7a1fc9` |
| `scripts/canvas06-e2e-run-input.mjs` | `21632` | `dbac67e2246b41865672e044488dfb3d5c4a77a18355a30e402889762ee9a212` |
| `tests/e2e/release/dev-canvas-06/playwright.release.config.ts` | `1197` | `85fbb74256f1c782fcb08e9b7e9446bb20330a7bb91b9d90547ccaf4ad1ac7bc` |
| `tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts` | `558` | `8150f83e39967be64a80a0bf32ccf42826bf4b642e8ebcfc8ae2dfd1dc7801da` |

活动身份继续固定为Manifest `0.2/0.2.0`、Attempt Artifact `0.2`、Runner Source Set `0.1/23`、Report `0.2/runner_version=0.2.0`和Profile/Digest closure `v1.5`。

### 4.3 Clean worktree证明

实施只能从fresh detached worktree或fresh branch checkout开始，并在修改前证明：

```text
git rev-parse HEAD
= 0dcaa27a92693feaf28b731ebed2f81a9ccea02c

git status --porcelain=v1 --untracked-files=all
= <empty bytes>
```

commit对象存在不替代worktree clean证明；当前dirty main、既有release root或其他branch bytes均不得作为2A输入。

## 5. 唯一实现Delta：`2 A`

只允许新增：

```text
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
```

最终实现commit必须满足：

1. 后继contract clean base的唯一parent逐字符等于完整`0dcaa27...`，2A final的唯一parent逐字符等于该已接纳contract base；
2. `git diff --name-status <contract-clean-base> <2A-final>`逐项等于上述两个`A`；
3. 第6章36项raw ref在final commit中逐项不变；
4. 禁止修改`package.json`，命令使用第8章冻结的直接Node入口；
5. 禁止merge commit、amend `0dcaa27...`、cherry-pick额外实现、dirty patch或Git replacement object；
6. final commit、2A patch SHA和两个新增文件raw ref由实现checklist记录，不预填占位值。

2A patch SHA固定为：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary <fault_launcher_2a_source_commit>)
```

## 6. 36项只读基线Raw Ref

raw ref字段固定为`path/byte_length/sha256`，顺序固定为下表顺序。集合身份固定为：

```text
baseline_raw_refs_sha256
= SHA-256(RFC8785_JCS(下表36个raw ref对象组成的有序数组))
= 69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e
```

| path | byte_length | sha256 |
| --- | ---: | --- |
| `services/local-runtime/pom.xml` | `3207` | `c1ae378873257ce2712c833fe853c51917edb36572bbd9f51c8df9cbbfe6938d` |
| `services/local-runtime/src/main/java/org/opm/localruntime/LocalRuntimeApplication.java` | `2335` | `f819ebbcdbf75fbf72d5a8a03149a9f3af8838f7bbe3fa62a5317ae739661110` |
| `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java` | `127751` | `da65bf89bbcd530be1fa96e8ba262431d3f827bc1ce4f0c86c1670511e55e3b7` |
| `services/local-runtime/src/main/java/org/opm/localruntime/command/CandidateRevisionCommitter.java` | `10241` | `8f9db46edf887bd81e8d07858ef54715dd4947f04c4570cc93056c8552310d88` |
| `services/local-runtime/src/main/java/org/opm/localruntime/command/RevisionCommitRepository.java` | `1708` | `9bd4ad0f6b0fb6423bca7fd20af9507928d4497a2dfc31d8fbd36dbb966dc7de` |
| `services/local-runtime/src/main/java/org/opm/localruntime/assets/ProfilePackageAssembler.java` | `8819` | `6b1a51cf83b26077e8af8b8382fead9fdf696291abb718622f850a19e612a503` |
| `services/local-runtime/src/main/java/org/opm/localruntime/storage/SqliteRevisionCommitRepository.java` | `24271` | `4e704624692e905b517ecab25a870bf36ad06c8f47fce0de6f88fbad2ccb3e19` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherArguments.java` | `3349` | `eeac986d4709065a24fe3c58e24070a090cbb50345a8bc1d5f885cf3906b9e60` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherErrorCode.java` | `727` | `5e8ca390f0412ebbd9060ad898e159854db298a5414106093bdac9036920e220` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherException.java` | `1439` | `b98824447ab3535e0f4216062034c73043d6e9bd21cb4b80fc863771c0b80905` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultContext.java` | `658` | `efd34ddf34641870e7c79e1250d1a1f1e4ea9bc6b3211c0a7e4ee1a2afa2fed1` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlan.java` | `1607` | `e74d2b773433397a6f518b3a62e0796cd5c365e3c2d877947d9b67d0e8f6c3d9` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlanVerifier.java` | `13805` | `c737bb38ca68689844e926dcceea57c194baa181858f2a346c65a02f9d2911cb` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPort.java` | `1222` | `aede207dd818fd33da3c72bdf34e83b1544bbaa13bed238767d914f25c0aa3d4` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/AttemptLocalE2EFaultPort.java` | `4971` | `103879ae614c4106505358ed6b2b9ab014e456a90eb3d5a7d98575d56c3b198e` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherEnvironmentPostProcessor.java` | `4485` | `d7862f12a2d0a6f0a9c7f53a8c358cc5d98611eaccca3eabb3faec9f2e36b864` |
| `services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherConfiguration.java` | `1424` | `e07f8f4863e08ebcddd5929ae29fa0cb5f99d01e5f359260b8abc44103f72872` |
| `services/local-runtime/src/main/resources/META-INF/spring.factories` | `140` | `d70cf09ff57474090e8f00e2472c1e4cbe0fac9d37acaffc81d08f08d578f97e` |
| `scripts/release-canvas06-e2e-run.mjs` | `24990` | `ae45907e9107f847458f562a06665842fa3ad420a50b71c4d2fb0515eacaeb40` |
| `scripts/release-canvas06-e2e-run.test.mjs` | `17670` | `ade07bc45fe430915abd9375f749a8ebd55d26bc6e27826e550f6ce2f8cb761f` |
| `scripts/verify-canvas06-common-visual-fixtures.mjs` | `16228` | `362b35af51ff34251cc40ff55cdc187bfb42e73bca28acaf5c99cdd005163499` |
| `scripts/canvas06-e2e-common-fixtures.test.mjs` | `6074` | `5f61bc0adb8884047c0dce949e4a53e600f3390eba405a4287beb80d2844230a` |
| `scripts/verify-canvas06-e2e-report.mjs` | `37823` | `393aefce97ff521b311d244541e004ff271713a448723699821aca60a62a1268` |
| `scripts/verify-canvas06-e2e-report.test.mjs` | `3739` | `4dca7f8f98561d367a0e845dc8e3e9901bcb3640bbddb09e1fe4e25c67a1877d` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherArgumentsTest.java` | `1871` | `84a95e60abd2e36f71b3c3cf3689a81276f35279b60fa165c92033bc443eafbc` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlanVerifierTest.java` | `8767` | `d77de8f225a55ff449be4a798db5353889c5eae1828e496d7cfe153d1641f771` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/AttemptLocalE2EFaultPortTest.java` | `2343` | `e873e531a0d5ea7299394c17cafea2651eda685f75408ac141e9858de1997585` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherConfigurationTest.java` | `433` | `526118253a731bf8fcde53addb236161fdf774bbe7c33913fd0ac12fd26007bc` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultLauncherJarIT.java` | `8983` | `a4eb7c32f67f328998a4fccf99e02b83779d924a41a8b6cd7757aa5c30010c6e` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultHookIntegrationTest.java` | `8909` | `7836d9d96205b9d5092afeaba8894357724c0940eee7d0327667e3c04c7a604b` |
| `services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultRecoveryIsolationTest.java` | `12415` | `6424cf989088c2881b1eeb78cbe4dffa091bcbb3749776b6e0552c6a4a0a80ec` |
| `services/local-runtime/src/test/java/org/opm/localruntime/LocalRuntimeApplicationTest.java` | `627` | `4d780069b6f91fda770e134ed6e43e2ba8699563381c5b144a1bf597b48e9023` |
| `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java` | `84302` | `0344f9862ebf08fa562ff1e5d7dda3f3775d8da4ce5dbf43ec78d97e1a2588fa` |
| `services/local-runtime/src/test/java/org/opm/localruntime/command/CandidateRevisionCommitterTest.java` | `13550` | `d92a3e73df88fab995f22e4f3a0a373c29d4c2919b20be59d5073304fc36dbdc` |
| `services/local-runtime/src/test/java/org/opm/localruntime/assets/ProfilePackageAssemblerTest.java` | `10754` | `f5e95dd85f0d41413886ea1763d56cdb8d78fad579466e4c22b3905cd305afc6` |
| `services/local-runtime/src/test/java/org/opm/localruntime/storage/SqliteRevisionCommitRepositoryTest.java` | `23489` | `c768ffc7d231b4f56de58b5d8b3e04b83ca60824d44ff471cf3885744df2dc70` |

## 7. 基线缺陷回流规则

新增测试只允许验证基线，不允许修复基线。任一测试失败若根因位于第6章36项，必须：

1. 输出`FAULT_LAUNCHER_BASELINE_DEFECT_DETECTED`并停止当前2A Build；
2. 不创建/amend/cherry-pick Fault Launcher 2A source commit；
3. 新建独立`bugfix`规格与Spec Mapping checklist；
4. 新规格必须冻结最小复现、Root Cause、精确扩展allowlist及`M/A/D`、受影响raw ref、回归测试、base supersession、patch SHA和回滚；
5. 只有新bugfix完成并形成新的clean base intake后，才能重开2A任务并重新计算36项基线集合；
6. 禁止用测试内mock、skip、条件分支、动态patch、checkout fallback或放宽断言绕过基线缺陷。

## 8. Controlled Playwright历史协议（已废止）

本章原有独立preflight CLI、`base_source_commit/candidate_source_commit`两段身份、Preflight Report `0.1`和“READY后由外部再启动Playwright”的协议已全部废止，不再构成Build输入。历史协议无法表达`origin -> contract -> 2A`三段source链，也没有controlled evidence output root。

活动唯一口径为后继`opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md`第17章：

1. 单一`--run-controlled`命令完成preflight与execution；
2. actual Manifest由`--manifest-root`和固定basename传入，并先通过活动v02 controlled verifier；
3. D05区分Manifest三个case字段与Descriptor两次attempt/12 cycle；
4. Preflight Report活动版本为`0.2`，记录origin/contract/candidate三段身份；
5. D10B写入由Manifest/Descriptor raw SHA确定的fresh controlled evidence root，并执行staging/installed双重验证；
6. 本规格第4至7章的origin base、36项raw ref和`2 A`边界继续有效，任何旧CLI或Report字段均不得实现。

## 9. 验收与验证

### 9.1 设计验收

1. base完整SHA、parent、tree、epoch、patch SHA均冻结；
2. 旧38项精确分类为36 present + 2 absent；
3. 36项raw ref和集合摘要完整；
4. 唯一2A实现delta保持为2A，其parent改为待接纳的contract clean base；
5. 基线缺陷只能经新bugfix规格扩展；
6. BLOCKED机器对象、D01~D09/D10A十项依赖、首错、退出码和零执行边界封闭；D10B由后继执行artifact承接；
7. READY命令不依赖`package.json`变更或网络下载；
8. Gate、Capability和ISO状态不提升。

### 9.2 文档验证

```text
git cat-file -e 0dcaa27a92693feaf28b731ebed2f81a9ccea02c^{commit}
git diff --name-status e598b305a44ebb9c9845c1f5563bc36c3a89a2b4..0dcaa27a92693feaf28b731ebed2f81a9ccea02c
git diff --check
```

本设计任务不新增2A文件、不创建source commit、不运行Playwright、不生成Runtime/Web/Manifest/Report或release root。

## 10. 回滚与状态边界

回滚本设计修正后必须恢复Fault Launcher切片为`BLOCKED_BY_ALLOWLIST_AMBIGUITY`，不得恢复“38项均可修改”路线后继续Build。

本规格完成只冻结36项基线和2A逻辑边界；候选contract `63851f8...`已形成但不可接纳，其Schema conformance后继base未实现前，2A不得进入Build。当前conformant successor、2A、controlled Playwright、production `194/388`、E2E Report、`GATE-06-03`、Candidate、Activation、Capability、production和ISO证据均为`NOT_CREATED/NOT_RUN`。

## 11. 事实与待实现

### 11.1 事实

1. `0dcaa27...`对象存在，唯一parent为`e598...`；
2. 38路径中36项存在、2项不存在；
3. 36项集合摘要为`69491a...b411e`；
4. 两个2A路径在base和当前工作树均不存在；
5. 基线包含活动Manifest/Attempt/Source Set Schema、Runner input owner、Playwright release config和Common controlled browser入口。

### 11.2 待实现

Schema conformance后继base、2A final commit、两个新增raw ref、2A patch SHA、真实preflight机器对象和controlled Playwright结果只能由后继实现产生，不得在设计文档中预填。
