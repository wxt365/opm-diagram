# Spec: DEV-CANVAS-06 R8 Family Proof Diagnostic Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

为真实 Family 受控运行的 `E2E_ORCHESTRATION_BROWSER_PROOF_INVALID` 提供唯一、封闭且非敏感的 proof 状态诊断，以确定首个不满足的闭合条件；不得改变任何成功、失败、报告、Candidate、Activation 或 Capability 语义。

## 2. 事实

R7 的真实 `194/388` 已进入 Playwright Family session，且不再触发 Context-only 环境守卫。首个 cycle 在 `finalizeProof()` 以通用 Browser/API proof 错误退出。现有公开 CLI 正确只输出稳定首行，无法据此选择行为修复。

## 3. 精确修改边界

R8 必须唯一 parent=R7=`d43aedbd9832f2e64126a61567c0a79a4b39a176`，路径恰为：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

## 4. 唯一诊断契约

当且仅当 `finalizeProof()` 因完整性条件失败时，抛出的同一 `E2E_ORCHESTRATION_BROWSER_PROOF_INVALID/4` Error 必须附带深冻结的 `proof_state`，键精确为：

```text
bound, confirmed, sentinel_active, late_event_detected,
pending_capture_count, pending_capture_error, waiter_count,
unresolved_network_count, reopen_mode, subject_before_bound,
subject_baseline_matches, common_mode, resolved_setup_baseline,
reopen_expectation_required, reopen_verification_state,
requires_precondition, precondition_state, precondition_complete
```

所有值必须为 Boolean 或非负安全整数。不得包含 URL、路径、请求体、响应体、ID、原始摘要、端口、异常文本或其他未冻结字段。非该分支错误不得获得该字段。

`precondition_state` 编码固定为 `READY=0`、`IN_FLIGHT=1`、`CONSUMED=2`、`CLOSED=3`；`reopen_verification_state` 编码固定为 `NOT_REQUIRED=0`、`READY=1`、`IN_FLIGHT=2`、`VERIFIED=3`、`FAILED=4`。任何未知内部状态必须拒绝诊断构造，而不得扩展枚举。

命令行入口继续仅输出：

```text
<stable error code>\tCLI\t-\t-
```

不输出 `proof_state`。仅受控的直接 Runner 调用可读取该字段。

## 5. Source-chain 与验收

`parent(R8)=R7`，`delta(R7,R8)` 为第 3 章四路径。四路径均已存在于累计集合，故 `O..R8` 仍为 `86=65 M+21 A`。source-chain verifier 必须先验证 R6、R7，再验证 R8；`runner-source-commit/source-commit` 均等于 R8。

Node 22 定向回归必须验证 exact `proof_state` shape、类型、深冻结、成功路径无此诊断，以及 CLI wire 不变。随后从 fresh R8 source/new store 重建 Manifest，并重跑真实 `194/388`。不得据 R8 或失败诊断生成 READY Report、Candidate、Activation、Capability 或 ISO 结论。
