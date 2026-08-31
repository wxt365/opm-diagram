# Spec: DEV-CANVAS-06 E2E Runner CLI Source Closure

文档状态：`HISTORICAL_R2_INPUT / SUPERSEDED_FOR_PRODUCTION_BY_R3_CUMULATIVE_DELTA_CLOSURE`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

在已形成的最终 R=`4b30d269c100e655e8c75060a96bcb2ae11e4aa0`之后，补齐规格第4章要求的`release:canvas06:e2e:run`生产/controlled CLI。R2不得amend R；production最终source改为R2。

## 2. 精确修改边界

实现路径恰为`9 M`：

```text
M package.json
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-e2e-run-preflight.mjs
M scripts/canvas06-e2e-run-preflight.test.mjs
M scripts/canvas06-e2e-run-report.mjs
M scripts/canvas06-e2e-run-report.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

文档同步仅限本规格/checklist、Runner checklist、Final Production Source Chain spec/checklist。禁止修改Java、Vue、Schema、OpenAPI、SQLite、Profile、Driver、Manifest、Report、Handoff和既有release root。

## 3. R2 Source-chain 闭包

R2必须唯一parent=R。Unified Input verifier必须先精确验证`A -> R0`、`R0 -> R`，再验证`R -> R2`恰为第2章九个`M`。`runner-source-commit/source-commit`在`FINAL_RUNNER`时均指向R2。累计allowlist和patch identity从`O -> R2`实际Git diff重算，不能预填数量或SHA。

R2接纳记录：

```text
commit=6918ee26153f880802ebadbc8fc01407e4f5b906
parent=4b30d269c100e655e8c75060a96bcb2ae11e4aa0
tree=0c2be2d2551a477a711f072e2812532f02c0d1a1
committer_epoch=1788169086
stage_delta=9=9 M
stage_patch_sha256=75cfb71f948be97805297e4abd90d9dd176585ab71748c5a55cea9190da688e6
O_to_R2_unique_status_path_delta=85=64 M+21 A
```

R2 的九路径 stage delta 与 patch identity 保持冻结；其原先的累计 `83=62 M+21 A` 记录已由 [R3 Cumulative Delta Closure Bugfix](opm-dev-canvas-06-r3-cumulative-delta-closure-bugfix-task-spec.md) 纠正。R2 不再作为 production final source。

## 4. CLI

1. `package.json`新增唯一`release:canvas06:e2e:run`，执行`node scripts/release-canvas06-e2e-run.mjs`。
2. CLI只复用`parseRunOptions()`、既有Manifest/Profile预检、受控session、Report聚合和verifier；不得复制这些规则。活动`canvas06-e2e-run-preflight.mjs`必须从历史 Manifest 0.1 verifier 修正为活动 Manifest 0.2、Profile raw ref 和 source-chain 输入；活动`canvas06-e2e-run-report.mjs`必须从历史`0.1/146/48`修正为`0.2/137/57`，并由其既有定向测试闭合；入口不得自行拼装第二套预检或聚合语义。
3. production与controlled参数、preflight顺序、Report ID、staging、原子rename、退出码和stderr首行严格等于Runner实现规格第4、5、14、15章。
4. 入口必须import-safe；仅在直接执行时启动。参数或preflight失败不得创建staging、attempt、SQLite或Report。
5. CLI不提供单case Report 模式。活动 Report 0.2 只接受完整`194/388`调度；单case仅可通过既有生命周期定向测试验证，且不得写 Report。完整调度、Report或`GATE-06-03`状态必须等待后续验收证据。

## 5. 验收

1. 新命令可见且import无副作用。
2. production/controlled参数互用、未知参数、错误R2 source、dirty source和预检失败均返回稳定exit 2且零输出。
3. R2 source-chain正反例与九路径delta通过。
4. 既有Runner、Manifest v02与Unified Input定向测试通过。
5. 不生成Candidate、Activation，不启用Capability，不宣称ISO符合性。
