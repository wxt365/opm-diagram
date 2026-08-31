# Checklist: DEV-CANVAS-06 R13 Current-Directory Bootstrap Boundary Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## Spec Mapping

| 规格项 | 本轮承接 | 验证 |
| --- | --- | --- |
| 当前目录 Bootstrap inventory | 四个精确根排除 | Bootstrap 正反例 |
| fail-closed 保持 | 拒绝根级和未知 ignored 输入 | Bootstrap 反例 |
| R12 历史不变 | `DIRECT_MAIN_R12` 先验 R11/R12 | source-chain guard |
| 后继 allowlist | R13 八路径唯一 child | Git delta 与 Node 22 定向测试 |

## Build Checklist

- [x] 冻结四个非构建根，禁止通配和 fallback。
- [x] 保留任意其他 ignored/untracked 输入的拒绝。
- [x] 新增 `DIRECT_MAIN_R12` 参数与 source-chain guard。
- [x] 同步 outer Manifest orchestrator 参数守卫。

## Verify Checklist

- [x] Bootstrap Node 22 正反例通过。
- [x] source-chain 与 Manifest 参数定向回归通过。
- [x] R13 parent 与八路径 delta 精确匹配。
- [x] 不生成 E2E Report、Candidate、Activation 或 Capability 状态变更。

## 回滚

回退 R13 单一 child commit；恢复 R12 作为当前可消费 direct-main target。
