# Spec: DEV-CANVAS-05 Clean Handoff/Evidence Bundle 重建

文档状态：`FROZEN_FOR_EXECUTION`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

从独立 clean source commit 重建一套 `READY_FOR_DEV_CANVAS_06` Handoff、Evidence Bundle、Runtime JAR、Release Build descriptor 和 `READY_FOR_RELEASE_VALIDATION` Intake，确保 Evidence Bundle 内包含并逐 raw byte 闭合：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/reports/golden-replay.json
```

该生成物只补齐 DEV-CANVAS-06 的上游外部冻结输入，不生成 Visual/E2E/Performance/Recovery Report、Candidate 或 Activation。

## 2. Root Cause

现有 Evidence Bundle 生成时没有归档 `0.2.0/handoff/reports`，导致 Handoff 旁存在合法 `golden-replay.json`，但 archive 内缺少 E2E/Golden Planner 冻结契约要求的同路径 entry。当前主工作树包含并行改动，不能直接作为 clean release source。

## 3. Fix Strategy

1. 在基于当前 `main` HEAD 的独立 worktree 和 `codex/dev-canvas-05-clean-handoff` 分支中，只提交 `scripts/build-dev-canvas-05-release.mjs` 的 Handoff reports 归档修复；
2. 从该 clean commit 运行既有 DEV-CANVAS-05 release 命令，输出到 fresh 版本化目录 `handoff/releases/clean-<source-commit12>/`；
3. 使用新 Release Build descriptor 重新生成固定路径 Handoff，并运行既有 Handoff validator；
4. 从 exact Handoff 生成 READY Intake，并将其保存在同一版本化 release 根；
5. 只有 archive entry、raw SHA、Handoff/Intake状态和 source clean 证明全部通过，才把生成物同步到当前工作树。

## 4. 修改边界

### 4.1 允许修改

- `scripts/build-dev-canvas-05-release.mjs`：只增加 `0.2.0/handoff/reports` bundle source；
- `packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/dev-canvas-05-handoff.json`；
- `packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-<source-commit12>/**`；
- 本规格、对应 checklist、文档索引和引用旧 Bundle 缺口的状态说明。

### 4.2 禁止修改

- Profile、Rule、Grammar、Symbol、Golden fixture、Revision Schema 和 SQLite；
- Java、Vue、公共 API、DEV-CANVAS-06 runner、production gate 和 `.harness/**`；
- 既有 `handoff/release/**` 历史生成物；
- 任何 Candidate、Activation、approved golden 或 Capability 状态。

本任务不新增依赖、不修改 schema/API/配置，不提交当前主工作树中的并行改动。

## 5. Spec Mapping

| 需求 | 实现点 | 验证 |
| --- | --- | --- |
| clean source | 独立分支首个 source commit | `git status --porcelain` 在 release 启动前为空，descriptor `dirty_before_build=false` |
| Bundle 含 replay | build source 增加 Handoff reports | `jar tf` exact entry唯一；解包 raw SHA等于 Handoff report ref |
| Handoff闭合 | generator消费新 descriptor | Schema、16类文件ref、6 Gate、34 Capability、READY状态通过 |
| Intake闭合 | intake runner消费exact Handoff SHA | 8/8 MATCHED、34/34 MATCHED、零 blocker、READY状态 |
| 不覆盖历史 | fresh版本化 release root | 旧 `handoff/release/**` tree digest不变 |

## 6. 执行顺序

```text
建立clean source commit
-> 运行golden/compatibility/handoff evidence与Runtime package
-> 构建fresh版本化Bundle/JAR/descriptor
-> 将新descriptor作为Handoff generator输入
-> 生成并验证READY Handoff
-> 生成并验证READY Intake
-> 校验archive exact entry/raw ref/source commit
-> 提交并同步不可变生成物
```

任一步失败均不得把部分生成物同步到当前工作树。版本化 release root 一经验证并提交不得覆盖；重跑必须使用新 source commit 或新目录。

## 7. 验收标准

1. release 启动前 source worktree clean，source commit可由仓库分支解析；
2. Evidence Bundle 中 replay exact entry出现一次，非 symlink，raw bytes SHA与 Handoff `GATE-05-02/05` evidence一致；
3. Runtime JAR、Bundle、12份 report/schema ref 的长度和SHA均可从 Handoff root复算；
4. Handoff 为 `READY_FOR_DEV_CANVAS_06`，6/6 Gate MATCHED、34/34 Capability eligible、production gate=`DISABLED + []`；
5. Intake为`READY_FOR_RELEASE_VALIDATION`，8/8 check MATCHED、34/34 capability MATCHED、零 blocker；
6. 旧 `handoff/release/**` 不被覆盖；失败不产生当前工作树中的部分版本根；
7. 定向 validator、archive检查和`git diff --check`通过。

## 8. Compatibility Impact

- API、Schema、数据库和运行配置：无影响；
- 发布顺序：新 Handoff/Bundle 必须整体消费，禁止新 Handoff 配旧 Bundle；
- 旧 Handoff：保留为历史 bytes，但当前固定路径切换到新 Handoff；旧 `handoff/release/**` 不删除；
- 下游：Golden Capture Planner、E2E Manifest builder和Recovery authoring只能消费新 exact Handoff及其版本化 build artifacts。

## 9. 回滚

回退当前固定路径 Handoff和本任务文档，删除尚未被下游引用的新增版本化 release root，并删除专用本地分支。若生成物已经被 Manifest/Report引用，只能保留旧版本并通过新版本替代，不得删除或覆盖。

## 10. Design Input Baseline

- DEV-CANVAS-05 Handoff Schema与生成/验证脚本；
- DEV-CANVAS-06 Intake Schema与runner；
- E2E Manifest 0.1 builder规格；
- Golden Capture Planner实现规格；
- DEV-CANVAS-06 Recovery Execution设计。

外部输入缺口只关闭本规格第1章所述 Handoff/Bundle 路径；Recovery两份`0.1.0` template已由Recovery Template/Input闭包修正规格冻结，Recovery Runner实现包只能只读消费。

## 11. 事实与假设

### 11.1 事实

1. 历史 Bundle SHA为`fa54b828de74eb0bad7ba3143ea0fd0cabe0110eab3349b5c7596f2e7ef0adb9`，archive内缺少目标 replay entry，后续仍必须拒绝；
2. 新 clean source commit 为`1847172f509005e8d50b525e274d41b9d73cf46c`，descriptor记录`dirty_before_build=false`；
3. 新 Bundle 位于`handoff/releases/clean-1847172f5090/`，包含唯一目标 replay entry，其raw SHA为`3e3c9d9e6e444e30ed86fbca9cf10e2923f236e7acd84630bdd68ee9efe5b3da`；
4. 新 Handoff为`READY_FOR_DEV_CANVAS_06`，新 Intake为`READY_FOR_RELEASE_VALIDATION`，production gate仍为`DISABLED + []`；
5. 当前主工作树仍不 clean；新生成物来自独立clean worktree和不可变提交，不把主工作树作为source build；
6. 本任务不构成 DEV-CANVAS-06 Visual/E2E/Performance/Recovery Gate、生产发布或 ISO 19450:2024 符合性证明。

### 11.2 假设

无。

## 12. 执行结果

版本化输出根：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-1847172f5090/
```

| 资产 | SHA-256 |
| --- | --- |
| Evidence Bundle | `f336780b3f3641accbdd7b4fa5432f3041d5701dcba0e474edfbef63543f7360` |
| Runtime JAR | `0cfe0f14f2190e64e4cbc39b8a8bfbb8c9a5b733607cb24c4801c872f87b3f49` |
| Release Build descriptor | `b04558d6ff29417372be6a0a0391b4c37b349dcd236a327d09573c895e25a76f` |
| 固定路径 Handoff | `aab281cf686d2b3c0e4ef1e9f62860d9318e3bed11c805e1dd53a40cd6f8e5a4` |
| Intake Report | `9bff5271d28723b6e076534566fb19a625ee8a66caffb846ce46431a92107887` |

source修复提交为`1847172f509005e8d50b525e274d41b9d73cf46c`；不可变生成物提交为`de095b04d3d055ffd49c7a20342b5b6092398639`。二者位于专用分支`codex/dev-canvas-05-clean-handoff`。
