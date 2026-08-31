# Spec: DEV-CANVAS-06 R10 Family Cycle Primary Failure Precedence Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修复 Family controlled cycle 在 cleanup 阶段用无绑定的 Browser proof 失败覆盖更早 Runtime、Web、Browser launch 或 handler 原始错误的问题。使真实 `194/388` 首错可被稳定诊断；不改变成功行为、Report、Candidate、Activation、Capability、ISO 结论或公共 CLI wire。

## 2. 已复现事实

R9 的真实 production Manifest 运行中，父 Runner 得到 `proof_state.bound=false`、`confirmed=false`、全部网络计数为零。该状态证明 handler 未完成 `attachBrowserPage`。`runFamilyInvocationCycle()` 已捕获较早失败，但 finally 的 `sink.finalizeProof()` 抛出 `E2E_ORCHESTRATION_BROWSER_PROOF_INVALID` 后覆盖了已有 `failure`，因此外层只能看到次生错误。

## 3. 精确修改边界

R10 必须唯一 parent=R9=`d1a9a960a70634a7e110944b6b8c6e6370fbfc2d`，路径恰为：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

## 4. 首错优先契约

1. cycle `try` 内首次异常为 `primary failure`，可来自 Runtime ready、Web ready、Browser launch、页面、driver、API、snapshot 或 handler 关闭证明。
2. finally 的 `sink.finalizeProof()`、子进程停止、端口复核、日志/过程证据写入属于 cleanup。存在 `primary failure` 时，任何 cleanup failure 均不得替换它，唯一例外是 `E2E_ORCHESTRATION_PORT_NOT_RELEASED`，该安全失败必须升级为最终错误。
3. 没有 `primary failure` 时，cleanup 的首个 failure 仍按既有 `asEvidenceFailure()` 映射为最终错误。
4. 未绑定 sink 的 `E2E_ORCHESTRATION_BROWSER_PROOF_INVALID` 是次生 cleanup failure；它不能触发 R9 child diagnostic writer，也不能覆盖 Browser launch/handler 的原始错误。
5. R9 的 `family-proof-diagnostic.json` 传输契约、16 KiB CLI message 截断和顶层 `<code>\tCLI\t-\t-` wire 不变。
6. source chain 增加 R10 四路径 stage closure；R8、R9 的既有 stage delta 保持独立。`9048bb… -> R10` 的累计 source delta 仍为 `86=65 M+21 A`。

## 5. 验收

- Node 22 定向测试覆盖：无 primary 时 cleanup 映射、已有 primary 时 Browser proof/一般 evidence failure 不覆盖、端口未释放唯一覆盖、R9/R10 source-chain parent 与 exact delta。
- `parent(R10)=R9`，R10 delta 仅为第 3 章四路径，累计 `86=65 M+21 A`。
- 以 fresh R10 source/new external store 重建 production Manifest，运行真实 `194/388`。只有完整 Report verifier 通过后才评估 Gate。
