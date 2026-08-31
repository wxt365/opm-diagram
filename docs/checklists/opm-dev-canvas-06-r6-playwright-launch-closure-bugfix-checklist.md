# Checklist: DEV-CANVAS-06 R6 Playwright Launch Closure Bugfix

状态：`FROZEN_FOR_IMPLEMENTATION`

## Spec Mapping

- 当前规格：[R6 Playwright Launch Closure Bugfix](../../specs/opm-dev-canvas-06-r6-playwright-launch-closure-bugfix-task-spec.md)。
- Task Type：`bugfix`。
- Active Playbooks：`testing (primary)`、`design-module-docs`。

## Checklist

- [x] 默认 config 搜索、source `test-results` 污染与丢弃 child diagnostics 已由真实 production run 复现。
- [x] 显式 config、受控 outputDir、清理/diagnostic 与 R6 source-chain 已冻结。
- [x] R6=`8ab7da6f482887820a54c1d35d8ee683e5e0083f`，parent=R5，delta=`5 M`，patch=`9ad751d8c5e33ae44390d7f3434ff40a3d25c20c8932ee6326aa67954313d482`；Node 22回归 `70/70`、真实 source-chain和`git diff --check`通过，O..R6=`86=65 M+21 A`。
- [x] fresh R6 Manifest staging/installed 验证通过：`dev-canvas-06.e2e.8ab7da6f4828.1b54c41c1586`，SHA=`6e666a103889942ddaf455eaed48ef02d56af9d25a173f5d039de152652b05f0`。
- [x] R6 production run 首错已诊断为 `OPM_CANVAS06_E2E_PLAYWRIGHT_OUTPUT_DIR` 违反 Context-only 子进程环境；R6 不生成 Report，后继 R7 必须使用非 Context 命名空间变量。
