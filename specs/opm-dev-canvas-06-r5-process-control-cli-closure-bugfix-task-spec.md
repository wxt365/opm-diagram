# Spec: DEV-CANVAS-06 R5 Process-Control CLI Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

将已冻结的 `--process-control-parent` 纳入 production/controlled Runner 的唯一 CLI，并将该调用方受控根与 Invocation Context 的实际临时子目录建立可审计的隔离关系。

## 2. 精确修改边界

R5 必须唯一 parent=R4=`a76358782c34227d8888daa184648469bed3390a`，代码路径恰为 `6 M`：

```text
M scripts/canvas06-e2e-run-input.mjs
M scripts/canvas06-e2e-run-input.test.mjs
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

禁止修改 Java、Vue、Schema、OpenAPI、SQLite、Profile、Driver、Handoff、Manifest/Report 业务语义、R4 或既有版本根。

## 3. CLI 与受控根

1. `--process-control-parent <absolute path>` 是 production 与 controlled run 必填值，未知、缺失、重复、空值、`--x=y` 或相对路径均为 `E2E_RUN_ARGUMENT_INVALID/2`，且在 Manifest/Browser/Runtime/staging 前拒绝。
2. 该路径必须是调用前已存在、非符号链接、单目录项、可读写、为空的普通目录；它与 source、Manifest、Profile、output root 不得相同或互为祖先/子孙。违反为 `E2E_RUN_ARGUMENT_INVALID/2`，零 Runner 输出。
3. Runner 在通过 CLI 和 preflight 后，只能以该根为父创建自身唯一 `mkdtemp` 子目录。Invocation Context 只记录该子目录，现有 fault/challenge/child-ready/reachpoint 语义不变。
4. finally 只删除该自有子目录，并复核调用方根仍存在且为空；不得删除、重命名或写入调用方根以外的路径。清理异常为既有 `EVIDENCE_TRANSACTION/4`。

## 4. R5 Source-chain

R4 必须作为固定 final-chain base：

```text
parent(R4)=R3; delta(R3,R4)=2-path R4 closure
parent(runner)=R4; delta(R4,runner)=6-path R5 closure
delta(O,runner)=85-path FINAL_RUNNER_CUMULATIVE_DELTA
```

R5 六个路径均已在 O..R4 以 `M` 出现，因此累计 unique status/path 保持 `85=64 M+21 A`。`runner-source-commit/source-commit` 在 `FINAL_RUNNER` 时必须等于 R5；R4 仅为历史 base。

R5 接纳记录：

```text
commit=0d7d8b4290c0cbc49dca4dcf887bc7fee4154efa
parent=a76358782c34227d8888daa184648469bed3390a
stage_delta=6=6 M
stage_patch_sha256=f013654e554e28798c00b0f4129c27d2ac0f87203ca6e9b0e0df4ed82fa2c6b5
O_to_R5_unique_status_path_delta=85=64 M+21 A
```

## 5. 验收

1. Node 22 tests 覆盖 production/controlled 正例、缺失/相对/非空/重叠根拒绝、唯一 child 根与 finally 清理。
2. source-chain 测试验证 R4 base、R5 6M 与最终 85 项；`git diff --check` 通过。
3. 从 fresh R5 source/new external store 重建 Manifest，再运行完整 194/388。R4 Manifest 保留历史，不得复用。
4. 不生成 Candidate、Activation 或 Capability，不声明 ISO 符合性。
