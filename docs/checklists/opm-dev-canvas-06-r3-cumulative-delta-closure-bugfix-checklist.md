# Checklist: DEV-CANVAS-06 R3 Cumulative Delta Closure Bugfix

状态：`R3_CREATED / HISTORICAL_FOR_PRODUCTION / R4_FINAL_CHAIN_CLOSURE_REQUIRED`

## Spec Mapping

- 当前规格：[R3 Cumulative Delta Closure Bugfix](../../specs/opm-dev-canvas-06-r3-cumulative-delta-closure-bugfix-task-spec.md)。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。

## Checklist

- [x] 根因已复现：R2 的两个 preflight 路径在 `O..R` 不存在，`O..R2` 实际为 `85=64 M+21 A`。
- [x] R3 的 source allowlist 固定为两个既有 `M`，R2 不 amend。
- [x] `FINAL_RUNNER_CUMULATIVE_DELTA` 的唯一合成规则、85 项结果与 UTF-8 顺序已冻结。
- [x] R3=`e201360...` parent=R2 且 delta=`2 M`；其定向测试与 `git diff --check` 通过。
- [x] R3 作为 final source 在 staging 前被 direct-parent 假设拒绝，未创建输出；R4 接管 final chain 闭合。
- [ ] 从 clean R3 source 重建新的 production Manifest。
- [ ] 使用新 Manifest 完成真实 `194/388`、Report 与独立 Gate 证据。

## 状态边界

R2 的 production Manifest 编排因累计集合冲突在 staging 前拒绝，零输出。该失败不产生 Candidate、Activation 或 Capability 状态；R3 完成前，R2 仅为历史 source 输入。
