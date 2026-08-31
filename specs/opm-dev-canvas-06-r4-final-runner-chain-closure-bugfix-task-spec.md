# Spec: DEV-CANVAS-06 R4 Final Runner Chain Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 R3 之后 Final Runner source-chain 的 parent 解析缺口，使 production `FINAL_RUNNER` 严格验证连续链 `O -> C -> S -> A -> R0 -> R -> R2 -> R3 -> R4`，而不把 R3 或 R2 当作最终可消费 source。

## 2. 事实与根因

1. R3=`e20136020ee71d9fa1fd3a03d15e5dbf57d4d3f8` 唯一 parent=R2，且 stage delta 恰为 `2 M`，它修正最终累计集合为 85 项。
2. R3 中的 `assertSourceClean()` 仍把传入的 `runner-source-commit` 直接要求为 `parent=R`，仅校验 `R -> runner` 的 R2 九路径 delta。
3. 传入 R3 时，该检查在任何 release staging 创建前以 `RUNNER_CLI_PARENT` 拒绝；因此 R3 的集合修正未形成可执行 final chain。

## 3. 精确修改边界

R4 必须唯一 parent=R3，代码路径恰为 `2 M`：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

禁止修改 R、R2、R3、Java、Vue、Schema、API、Profile、Driver、release root、Handoff 和 Manifest/Report 业务语义。文档仅允许本规格/checklist及将 R3标为历史输入的最小同步。

## 4. 唯一 source-chain 算法

1. 固定 R2=`6918ee26153f880802ebadbc8fc01407e4f5b906`、R3 的完整 commit SHA 与 R3 `2 M` delta。
2. `FINAL_RUNNER` 必须依次验证：

```text
parent(R0)=A; delta(A,R0)=63-path RUNNER_DELTA
parent(R)=R0; delta(R0,R)=2-path RUNNER_DELTA_OWNER_CLOSURE
parent(R2)=R; delta(R,R2)=9-path RUNNER_CLI_DELTA
parent(R3)=R2; delta(R2,R3)=2-path R3_CUMULATIVE_DELTA_CLOSURE
parent(runner)=R3; delta(R3,runner)=2-path R4_FINAL_CHAIN_CLOSURE
delta(O,runner)=85-path FINAL_RUNNER_CUMULATIVE_DELTA
```

3. R3、R4 的两个 delta 都只包含 Unified Input owner 及其测试。`O..R4` unique `status + TAB + path` 集合仍为 `85=64 M+21 A`，按 UTF-8 path byte order 精确比较。
4. `runner-source-commit/source-commit` 在 `FINAL_RUNNER` 时均必须等于 R4；不接受 R、R2、R3、缩写、分支名、环境变量或 fallback。

R4 接纳记录：

```text
commit=a76358782c34227d8888daa184648469bed3390a
parent=e20136020ee71d9fa1fd3a03d15e5dbf57d4d3f8
stage_delta=2=2 M
stage_patch_sha256=ee92f329d07a6a99ad9ddf53fa25d60ad49fbb1ad1535708433d4a152c67b36c
O_to_R4_unique_status_path_delta=85=64 M+21 A
```

## 5. 验收与边界

1. Node 22 定向测试必须锁定所有九个 source-chain 节点、两个新增的 `2 M` stage 和最终 85 项集合。
2. R4 的 parent、delta、patch SHA、clean worktree 与 source-chain 正反例必须通过；`git diff --check` 必须通过。
3. 之后从 fresh R4 source 与新的 external store 重跑 v02 production Manifest。真实 `194/388` 仅在新 Manifest 已 installed 验证后执行。
4. 本规格不生成 Candidate、Activation、Capability 或 ISO 19450:2024 符合性结论。
