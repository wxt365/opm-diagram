# Spec: DEV-CANVAS-06 R7 Playwright Output Environment Namespace Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修正 R6 Playwright outputDir 与 Family Context-only 子进程环境守卫的命名空间冲突，使受控 outputDir 不再被误认为第二条 Context 通道。

## 2. 事实

R6 实际 production run 已证明：`OPM_CANVAS06_E2E_PLAYWRIGHT_OUTPUT_DIR` 触发 `loadFamilyControlledInvocationContextFromEnvironment()` 的“只允许 Context ref”拒绝。Context-only 守卫正确，禁止放宽或增加白名单。

## 3. 精确修改边界

R7 必须唯一 parent=R6=`8ab7da6f482887820a54c1d35d8ee683e5e0083f`，路径恰为：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M tests/e2e/release/dev-canvas-06/playwright.release.config.ts
```

## 4. 唯一修正

1. outputDir 变量唯一固定为 `PLAYWRIGHT_OUTPUT_DIR`，不得使用 `OPM_CANVAS06_E2E_*`、`OPM_CANVAS06_*` 或其他 Context/fault 命名空间。
2. Runner 仅传递既有 Context ref 与该 non-OPM Playwright 变量；Family loader 继续拒绝任一额外 `OPM_CANVAS06_E2E_*`。
3. release config 仅在 `PLAYWRIGHT_OUTPUT_DIR` 为绝对路径时采用它；R6 的 outputDir、清理、显式 config、诊断截断和 source-root 零污染规则保持不变。

## 5. Source-chain 与验收

`parent(R7)=R6`，`delta(R6,R7)` 为第3章五路径；这些路径均已在 O..R6 中存在，故 `O..R7=86=65 M+21 A`。`runner-source-commit/source-commit` 必须等于 R7。

Node 22 定向测试必须覆盖 R7 source chain、Context-only 环境未放宽以及 outputDir 变量改名。随后从 fresh R7 source/new store 重建 Manifest，并重跑完整 `194/388`。不得生成 READY Report、Candidate、Activation、Capability 或 ISO 结论，除非真实证据完整通过。
