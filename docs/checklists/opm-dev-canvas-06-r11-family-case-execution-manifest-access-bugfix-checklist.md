# Checklist: DEV-CANVAS-06 R11 Family CaseExecution Manifest Access Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## Spec Mapping

| 规格项 | 本轮承接 | 验证 |
| --- | --- | --- |
| `case_entry` 是完整 `CaseExecution` | bridge 仅经 `manifest_case` 读取 viewport/zoom | Node 22 Runner 定向测试 |
| 禁止 fallback | 不读取顶层字段或其他输入 | source contract 反例 |
| R11 source chain | R10 单 parent、四路径 exact delta | unified source-chain 测试 |
| production 重验 | fresh source/store 的 Manifest 与 `194/388` | 真实命令和保留的首错证据 |

## 范围

- 允许：R11 规格第 4 节四个 source 路径；本 checklist 与对应任务规格。
- 禁止：Schema、公共 HTTP API、SQLite DDL、生产配置、Runtime 产品语义、Report/Candidate/Activation/Capability 状态。

## Build Checklist

- [ ] 定向复现：完整 `FamilyCaseExecution` 顶层不存在 viewport/zoom。
- [ ] 增加 nested `manifest_case` 读取和无 fallback 的回归断言。
- [ ] 修改 bridge 的唯一字段读取路径。
- [ ] 将 R11 加入 source-chain closure。

## Verify Checklist

- [ ] Node 22 Runner 定向回归通过。
- [ ] Node 22 unified source-chain 定向回归通过。
- [ ] `git diff --check` 通过，R11 delta 恰为四路径。
- [ ] R11 为 R10 的单一 child，cumulative source-chain 断言通过。
- [ ] fresh production Manifest 与真实 `194/388` 重验完成。

## 回滚

回退 R11 单一 source commit；不覆盖 R10 或历史 production evidence。
