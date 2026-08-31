# Spec: DEV-CANVAS-06 R6 Playwright Launch Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

使 production Runner 唯一使用冻结的 release Playwright config，禁止向 source root 写入 `test-results`，并在子进程失败时保留稳定 machine error 首行与有界诊断正文。

## 2. 精确修改边界

R6 必须唯一 parent=R5=`0d7d8b4290c0cbc49dca4dcf887bc7fee4154efa`，路径恰为 `5 M`：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
```

禁止修改 Java、Vue、Schema、Profile、Driver、Handoff、Manifest/Report业务语义和既有版本根。

## 3. 唯一 Launch 协议

1. Runner 子进程必须显式传入 `--config tests/e2e/release/dev-canvas-06/playwright.release.config.ts` 和唯一 Family test path；禁止依赖 cwd config 搜索。
2. Runner 只向自有 process-control child 下传 `OPM_CANVAS06_E2E_PLAYWRIGHT_OUTPUT_DIR=<absolute child path>`。release config 仅在该环境变量为绝对路径时使用它作为 `outputDir`；否则保留既有默认值供非生产局部测试使用。
3. Runner 在 child 结束后移除其 outputDir。child 返回非零或 signal 时，错误首行为稳定 `E2E_UNEXPECTED_RUNTIME_ERROR`，正文只附加 UTF-8 截断至 16 KiB 的 stdout/stderr（按 stdout 再 stderr、去除 NUL）；不得将诊断写入 source root、Report final root、Handoff 或 Manifest。
4. 生产成功路径在 Playwright 返回 0 后必须证明自有 outputDir 已删除；清理失败为 `EVIDENCE_TRANSACTION/4`。失败事务仍由既有 Report staging rollback 清理。

## 4. R6 Source-chain

`parent(R6)=R5`，`delta(R5,R6)` 精确为第2章五路径。此前 config 路径不在 O..R5，故 `O..R6` unique status/path 为 `86=65 M+21 A`。Final chain verifier必须先验证 R5 的6M，再验证 R6 的5M；`runner-source-commit/source-commit` 均等于 R6。

```text
commit=8ab7da6f482887820a54c1d35d8ee683e5e0083f
parent=0d7d8b4290c0cbc49dca4dcf887bc7fee4154efa
stage_delta=5=5 M
stage_patch_sha256=9ad751d8c5e33ae44390d7f3434ff40a3d25c20c8932ee6326aa67954313d482
O_to_R6_unique_status_path_delta=86=65 M+21 A
```

## 5. 验收

1. 定向测试锁定 config 参数、受控 outputDir、无 source `test-results` 写入、失败诊断上限、成功/失败清理与 R6 source chain。
2. fresh R6 source/new external store 重建 Manifest；随后使用 R6 Manifest 重跑完整 `194/388`。
3. 真实失败只能作为失败证据，不生成 READY Report/Candidate/Activation/Capability/ISO 结论。
