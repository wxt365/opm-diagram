# Spec: DEV-CANVAS-06 Common编排与External Store集成Source闭包修正

文档状态：`FROZEN`

设计修正状态：`COMPLETE`

Build准入：`READY_FOR_BUILD/NOT_STARTED`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

当前有两个已冻结但尚未实现的source包：

1. Unified External Release Store Mode：以`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`为base，计划形成`9=7 M+2 A`的`external_store_source_commit`；
2. Common controlled orchestration：计划在另行选择的clean base上形成`8=7 M+1 A`的Common编排commit。

两个实现allowlist互不重叠，但不能独立提交后直接串行消费。E2E Runner规格固定要求：

```text
clean source HEAD
  == Manifest source_build.source_commit
  == Report runner_identity.source_commit
```

最小复现：先从`e598...`形成9文件commit并基于它生成Manifest，再以该commit为parent形成8文件Common编排commit。此时Runner必须从第二个commit读取新编排bytes，但Manifest仍锁定第一个commit，production preflight必然以wrong source拒绝。反过来先形成8文件commit，也会使既有External Store规格的`9=7 M+2 A`和唯一parent约束失败。

## 2. Root Cause

### 2.1 问题原因

前两份规格分别关闭了external store拓扑和Runner Source Set owner冲突，但没有对`Manifest source_build.source_commit`、Runner clean HEAD和Report source identity执行最终三方join。两个局部正确的独立source commit目标组合后形成全局身份冲突。

### 2.2 为什么之前未被发现

Common Source Set闭包只检查了23项source aggregate是否包含编排owner，没有继续检查Manifest production输入已经绑定哪个source commit；External Store闭包只检查9项owner和production input事务，没有预见后继Runner source bytes还会改变。

## 3. Fix Strategy

### 3.1 唯一决定

不生成可消费的中间9文件commit或独立8文件commit。两包必须在同一个从`e598...`创建的clean worktree中实现、验证并一次提交，形成一个最终集成source commit：

```text
integration_base_source_commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4

common_external_integrated_source_commit
  = 本规格17项delta形成的40位single-parent clean commit

parent(common_external_integrated_source_commit)
  = integration_base_source_commit
```

原`9=7 M+2 A`与`8=7 M+1 A`继续作为两个职责子集和测试映射，不再允许各自形成可消费source commit。活动source identity只允许最终`17=14 M+3 A`commit。

### 3.2 为什么不串行两个commit

Git祖先关系不能替代逐字符source identity相等。Manifest、Runner和Report均锁定完整40位commit；即使第二个commit仅修改测试或Runner文件，也不允许Manifest继续引用其parent。

## 4. 精确Composite Source Delta

### 4.1 External Store子集：`9=7 M+2 A`

```text
M package.json
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/rebuild-canvas06-unified-production-inputs.mjs
M scripts/rebuild-canvas06-unified-production-inputs.test.mjs
M scripts/verify-canvas06-unified-production-inputs.mjs
M scripts/verify-canvas06-unified-production-inputs.test.mjs
A scripts/rebuild-canvas06-manifest-v02-production.mjs
A scripts/rebuild-canvas06-manifest-v02-production.test.mjs
```

### 4.2 Common编排子集：`8=7 M+1 A`

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-e2e-run-input.mjs
M scripts/canvas06-e2e-run-input.test.mjs
M scripts/canvas06-e2e-attempt-artifacts.mjs
M scripts/canvas06-e2e-attempt-artifacts.test.mjs
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
A tests/e2e/release/dev-canvas-06/common-driver.controlled.spec.ts
```

两集合必须无交集，最终delta唯一为：

```text
17 unique paths = 14 M + 3 A
```

禁止修改Schema、OpenAPI、SQLite DDL、Profile/Rule/Grammar/Symbol、Common Driver、Vue selector/Fact删除/store、factory、Manifest v02 Producer/Verifier、`.gitignore`、lockfile或其他路径。

## 5. Commit与Patch身份

最终commit必须满足：

1. 恰有一个parent，逐字符等于`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`；
2. `git diff --name-status <base>..<final>`逐项等于第4章17项及状态；
3. `git status --porcelain=v1 --untracked-files=all`在提交前受控staging、提交后source root及生产重建每个reachpoint均为空；
4. 禁止merge commit、第二个source commit、cherry-pick当前main、dirty patch、submodule或Git replacement object；
5. 当前`HEAD=388dd8e54d277a2a6373eee5f43aab3e7b34e88c`与`e598...`互不为祖先，只是只读开发现场，不是本包base或patch来源。

source patch SHA固定为：

```text
SHA-256(raw stdout bytes of:
  git show --format= --no-ext-diff --binary <common_external_integrated_source_commit>)
```

实现checklist必须记录完整final commit、parent、17项name-status、`14 M+3 A`、patch SHA和`package.json` raw SHA。

## 6. 唯一实施与生产重建顺序

```text
VERIFY_E598_GIT_OBJECT
-> CREATE_FRESH_CLEAN_WORKTREE_AT_E598
-> APPLY_EXTERNAL_STORE_9_PATH_SUBSET
-> APPLY_COMMON_ORCHESTRATION_8_PATH_SUBSET
-> RUN_SUBSET_AND_COMPOSITE_TESTS
-> VERIFY_17_PATH_STAGING_AND_SOURCE_CLEAN
-> CREATE_ONE_SINGLE_PARENT_COMMIT
-> VERIFY_PARENT_NAME_STATUS_PATCH_SHA
-> CREATE_SECOND_FRESH_SOURCE_WORKTREE_AT_FINAL_COMMIT
-> VERIFY_SOURCE_CLEAN
-> CREATE_FRESH_EXTERNAL_RELEASE_STORE
-> REBUILD_HANDOFF_INTAKE_RUNTIME_WEB_COMMON_FROM_FINAL_COMMIT
-> RUN_NEW_PROCESS_UNIFIED_VERIFIER
-> BUILD_AND_VERIFY_MANIFEST_V02_FROM_FINAL_COMMIT
-> VERIFY_MANIFEST_SOURCE_COMMIT_EQUALS_FINAL_COMMIT
-> RUN_E2E_RUNNER_FROM_SAME_FINAL_COMMIT
-> VERIFY_REPORT_RUNNER_SOURCE_COMMIT_EQUALS_FINAL_COMMIT
```

禁止先以9项commit生成production input/Manifest后再追加Common commit；禁止复用source内`clean-e598...`失败根、当前dirty主工作树或已有external release root。

## 7. CLI与身份Join

Unified Builder、Unified Verifier和Manifest outer orchestrator继续使用External Store闭包冻结的CLI与root拓扑，但：

```text
--base-source-commit
  = e598b305a44ebb9c9845c1f5563bc36c3a89a2b4

--source-commit
  = common_external_integrated_source_commit
```

三者必须按本规格17项规则验证source commit，而不是旧9项规则。Manifest v02字段及Runner/Report必须满足：

```text
Handoff.source_build.source_commit
= Intake resolved Handoff source_commit
= Manifest.source_build.source_commit
= source-root HEAD
= Report.runner_identity.source_commit
= common_external_integrated_source_commit
```

Runner Source Set继续保持`0.1/0.1.0/23`，Report保持`0.2/runner_version=0.2.0`；版本不升级，因为变更bytes已经由source commit、23项raw ref和aggregate封闭。

## 8. 规格取代关系

1. Unified External Store规格的拓扑、CLI、quarantine、事务、错误和测试语义继续有效；其“独立9项commit为production source”的决定被本规格取代；
2. Common Source Set闭包的owner、8项职责子集和只读边界继续有效；其“另行选择base并独立形成8项commit”的决定被本规格取代；
3. 两份旧checklist的实现项只能在本17项集成包中联合完成，禁止分别标记source commit READY；
4. 历史`e598...`、当前main和任何失败release root保持只读。

## 9. 验收与验证

### 9.1 设计验收

1. base唯一为完整`e598...`；
2. composite allowlist精确为17项、`14 M+3 A`且两个子集无交集；
3. 只有一个final commit且唯一parent为`e598...`；
4. Manifest、Runner、Report source commit六方逐字符相等；
5. Source Set/Report Schema不升级，既有Driver/UI/factory保持只读；
6. 旧9项与8项独立commit准入均关闭；
7. production重建只从final commit和fresh external store执行。

### 9.2 文档验证

```text
git cat-file -e e598b305a44ebb9c9845c1f5563bc36c3a89a2b4^{commit}
git merge-base e598b305a44ebb9c9845c1f5563bc36c3a89a2b4 388dd8e54d277a2a6373eee5f43aab3e7b34e88c
git diff --check
```

本设计任务不实现17项source、不创建commit、不重建production input或Manifest、不执行Runner。

## 10. 回滚与状态边界

回滚本设计同步后，必须将两个source实现包恢复为`BLOCKED_BY_CROSS_COMMIT_SOURCE_IDENTITY_CONFLICT`，不得恢复独立9项/8项production commit路线。

设计完成不表示17项commit、external input、Manifest、controlled `194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO证据完成。

## 11. 事实与假设

### 11.1 事实

1. `e598...`Git对象存在，包含两个子集的全部14个既有`M`路径，三个`A`路径不存在；
2. 两子集路径无交集；
3. Runner preflight当前明确要求source HEAD等于Manifest source commit；
4. 当前main HEAD与`e598...`的merge-base为`daf383df6d7faad866b84fceac0a2c9111a8c926`，两者互不为祖先；
5. External Store 9项commit和Common 8项commit均尚未创建。

### 11.2 待实现结果

最终40位commit、17项patch SHA、`package.json` raw SHA、external release store和Manifest/Runner证据只能由后继实现产生，本设计不预填占位值。
