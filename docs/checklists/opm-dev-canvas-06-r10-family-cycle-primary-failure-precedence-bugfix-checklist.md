# Checklist: DEV-CANVAS-06 R10 Family Cycle Primary Failure Precedence Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## Spec Mapping

| 规格项 | 本轮承接 | 验证 |
| --- | --- | --- |
| 原始失败不得被 Browser proof cleanup 覆盖 | Runner 选择唯一最终 cycle failure | Node 22 定向回归与真实运行 |
| 未清理端口优先 | 唯一 safety override | 定向回归 |
| R9 诊断 wire 不变 | 不修改 child diagnostic 契约 | Runner 回归 |
| R10 source chain | 四路径 closure、parent=R9、累计 86 | source-chain 断言 |

## 范围

- 允许：R10 规格列出的四个 source 路径；本 checklist 与对应 task spec。
- 禁止：Schema、公共 HTTP API、SQLite DDL、生产配置、Report/Candidate/Activation/Capability 状态。

## Build Checklist

- [ ] 复现 R9 `bound=false` 次生 Browser proof 覆盖问题。
- [ ] 补首错优先的定向测试。
- [ ] 实现唯一 failure 选择规则。
- [ ] 更新 R10 source-chain closure。

## Verify Checklist

- [ ] Node 22 Runner 定向回归通过。
- [ ] Node 22 unified source-chain 定向回归通过。
- [ ] `git diff --check` 通过，delta 精确为四路径。
- [ ] parent=R9 且累计 86 路径 source-chain 断言通过。
- [ ] fresh production Manifest 与真实 194/388 重验完成。

## 回滚

回退 R10 单一 source commit；不覆盖 R9 Manifest、Report、Candidate 或 Activation。
