# Checklist: DEV-CANVAS-06 R8 Family Proof Diagnostic Closure Bugfix

状态：`FROZEN_FOR_IMPLEMENTATION`

## Spec Mapping

- 当前规格：[R8 Family Proof Diagnostic Closure](../../specs/opm-dev-canvas-06-r8-family-proof-diagnostic-closure-bugfix-task-spec.md)。
- Task Type：`bugfix`。
- Active Playbooks：`testing (primary)`、`design-module-docs`。

## Checklist

- [x] R7 真实运行已排除 Context-only 环境守卫，并复现通用 proof 错误。
- [x] R8 的四路径 source-chain、proof_state 形状和 CLI wire 边界已冻结。
- [ ] R8 source commit、Node 22 定向测试和 source-chain 验证通过。
- [ ] fresh R8 Manifest staging/installed 验证通过。
- [ ] R8 真实 194/388 已给出首个可行动 proof_state 或通过 Report。
