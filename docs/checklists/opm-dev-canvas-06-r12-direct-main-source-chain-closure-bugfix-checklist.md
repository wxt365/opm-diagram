# Checklist: DEV-CANVAS-06 R12 Direct Main Source-Chain Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## Spec Mapping

| 规格项 | 本轮承接 | 验证 |
| --- | --- | --- |
| 固定 direct merge identity | 精确 two-parent guard | Node 22 正反例 |
| 历史 R11 不变 | 先验证线性链，再进入 direct target | source-chain 回归 |
| 后继 delta 闭合 | R12 唯一 child 与六路径 allowlist | Git/source-chain 校验 |
| production CLI fail-closed | target 参数与 source/runner join | orchestrator 定向测试 |

## 范围

- 允许：R12 规格第 4 节六个 source 路径。
- 禁止：Schema、公共 HTTP API、SQLite DDL、Profile/fixture、Runner/Driver、生产配置、Report/Candidate/Activation/Capability。

## Build Checklist

- [ ] 增加 `DIRECT_MAIN_R11` 的唯一 target 分支。
- [ ] 冻结 merge ID、两个 parent 顺序、R12 direct-child 与四路径 delta。
- [ ] 同步 production Manifest orchestrator 参数守卫。
- [ ] 增加正反例。

## Verify Checklist

- [ ] Node 22 source-chain 与 orchestrator 定向回归通过。
- [ ] `git diff --check` 通过。
- [ ] R12 为 `44d8…` 的唯一 child，delta 恰为六路径。
- [ ] 不生成 production E2E Report、Candidate、Activation 或 Capability 状态变更。

## 回滚

回退 R12 单一提交；恢复 direct-main target 的拒绝。
