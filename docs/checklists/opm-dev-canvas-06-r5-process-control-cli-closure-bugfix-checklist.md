# Checklist: DEV-CANVAS-06 R5 Process-Control CLI Closure Bugfix

状态：`FROZEN_FOR_IMPLEMENTATION`

## Spec Mapping

- 当前规格：[R5 Process-Control CLI Closure Bugfix](../../specs/opm-dev-canvas-06-r5-process-control-cli-closure-bugfix-task-spec.md)。
- Task Type：`bugfix`。
- Active Playbooks：`testing (primary)`、`design-module-docs`。

## Checklist

- [x] 缺口复现：Runner 拒绝 `--process-control-parent`，且现有 owner 自行在 Report 邻域创建根。
- [x] CLI、受控根隔离/清理和 R5 source-chain 规则已冻结。
- [x] R5=`0d7d8b4290c0cbc49dca4dcf887bc7fee4154efa`，parent=R4，delta=`6 M`，patch=`f013654e554e28798c00b0f4129c27d2ac0f87203ca6e9b0e0df4ed82fa2c6b5`。
- [x] Node 22 定向回归 `75/75`、真实 `assertSourceClean()` 与 `git diff --check` 通过；`O..R5=85=64 M+21 A`。
- [ ] fresh R5 Manifest staging/installed 验证通过。
- [ ] 新 Manifest 的真实 194/388 与 Report/Gate 证据完成。
