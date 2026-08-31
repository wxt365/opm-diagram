# Checklist: DEV-CANVAS-06 E2E Runner CLI Source Closure

状态：`R2_IMPLEMENTED / HISTORICAL_FOR_PRODUCTION / R3_CUMULATIVE_DELTA_CLOSURE_REQUIRED`

## Spec Mapping

- 当前规格：[E2E Runner CLI Source Closure](../../specs/opm-dev-canvas-06-e2e-runner-cli-source-closure-task-spec.md)。
- Task Type：`feature`。
- Active Playbooks：`testing (primary)`、`design-module-docs`。

## Design Closure

- [x] R不能amend，R2唯一parent=R。
- [x] CLI、活动 Manifest v02 preflight、Report 0.2 聚合器与Unified source-chain owner固定为九个`M`；Preflight 不得回退至历史 Manifest 0.1，Report owner必须收敛历史`0.1/146/48`与活动`0.2/137/57`冲突。
- [x] 复用既有Runner规格的参数、事务、退出码和Report边界。
- [x] 禁止修改Runtime、Schema、Driver和release输入。

## Implementation Acceptance

- [x] R2 CLI与source-chain owner实现：`6918ee26153f880802ebadbc8fc01407e4f5b906`唯一parent=R，stage patch=`75cfb71f948be97805297e4abd90d9dd176585ab71748c5a55cea9190da688e6`。
- [x] 九路径delta、参数反例与零输出通过：Node 22下CLI无参数稳定`exit 2`且仅输出`E2E_RUN_ARGUMENT_INVALID\tCLI\t-\t-`。
- [x] Runner、Report、Preflight、Unified Input定向回归通过；Manifest v02 production重建仍必须从clean R2 source重新执行。
- [x] R2 production 编排在 staging 前以 `FINAL_RUNNER_CUMULATIVE_DELTA` 拒绝：真实集合为 85 项、历史常量为 83 项，零输出。
- [ ] 真实194/388、Report、Gate、Candidate、Activation和Capability仍不提升；后继见 R3 checklist。
