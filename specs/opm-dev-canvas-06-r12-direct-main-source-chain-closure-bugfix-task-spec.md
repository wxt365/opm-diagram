# Spec: DEV-CANVAS-06 R12 Direct Main Source-Chain Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

在不再使用 worktree 开发的约束下，为当前目录的一次性 R11 集成 merge 建立可执行且不可混用的 production source-chain 分支。该分支只承认固定 merge commit，不改变历史 `FINAL_RUNNER` 的线性链语义。

## 2. 已复现事实

1. 当前目录集成 commit 是 `44d8bdaa6c6de66de7447604deaaf1578c1cc146`。
2. 它的 parent 顺序精确为：

```text
first  = df91091f7270ede59efe6d43678fb731ee496a86
second = bbb01599d5c6f3760f437d389b6bebdaa283e9ca
```

3. `bbb0159…` 是 R11，且其唯一 parent 为 R10。严格 `FINAL_RUNNER` 因要求 R11 的后继是其唯一 child，在当前 merge root 上稳定拒绝 `RUNNER_F11_PARENT`。
4. 当前目录 R11 合并后已以 Node 22 完成 Runner/source-chain `74/74` 与 Manifest v02 `12/12` 回归；这不替代 production source identity 的独立校验。

## 3. 受控分支

新增唯一 source-chain target：`DIRECT_MAIN_R11`。

1. 它只接受 `source_commit === runner_source_commit`，不接受 `FAULT_2A`、`FINAL_RUNNER` 或任何 implicit fallback。
2. 它先完整验证历史 `origin -> ... -> R10 -> R11` 的既有线性链，不修改任何历史常量、parent、delta 或错误码。
3. 随后必须精确验证固定 integration merge 的 commit ID、两个 parent 的顺序和数量；禁止只验证“包含 bbb0159”或按祖先搜索替代。
4. `runner_source_commit` 必须是该固定 merge 的唯一 child，且其 delta 恰为第 4 节四路径。merge root 本身由 commit identity 绑定，不以运行时重算的宽松路径集替代。
5. `DIRECT_MAIN_R11` 只能由 R12 后继 source 使用；历史 `FINAL_RUNNER`、`FAULT_2A`、已安装 root、Report、Candidate、Activation 与 Capability 不可重写。

## 4. 精确修改边界

R12 的唯一 parent 为固定 integration merge `44d8bdaa6c6de66de7447604deaaf1578c1cc146`，source delta 恰为：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/rebuild-canvas06-manifest-v02-production.mjs
M scripts/rebuild-canvas06-manifest-v02-production.test.mjs
A docs/checklists/opm-dev-canvas-06-r12-direct-main-source-chain-closure-bugfix-checklist.md
A specs/opm-dev-canvas-06-r12-direct-main-source-chain-closure-bugfix-task-spec.md
```

本规格与 checklist 必须与 source 改动同一提交，以满足 production source root 的零未跟踪文件约束。禁止修改 Schema、公共 HTTP API、SQLite DDL、Profile/fixture 字节、Runner/Driver、生产配置和 Gate 状态。

## 5. 验收

1. Node 22 定向测试证明 `DIRECT_MAIN_R11` 接受唯一 source commit、拒绝错 target、错 merge identity、parent 顺序或数量不符、R12 非直接 child 和 delta 漂移。
2. production Manifest orchestrator CLI 仅为该 target 接纳与 `FINAL_RUNNER` 相同的 runner/source commit join，其他参数形状保持 fail-closed。
3. R12 commit 的唯一 parent 为 `44d8…`，且 delta 恰为第 4 节六路径；`git diff --check` 通过。
4. 只有 R12 source-chain guard 通过后，才可评估当前目录 production rebuild 的其它前置；不得生成 E2E Report、Candidate、Activation 或启用 Capability。

## 6. 回滚

回退 R12 单一 child commit，即恢复对 direct-main target 的拒绝；固定 merge、R11 和所有已有 evidence 均不覆盖。
