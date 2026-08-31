# Spec: DEV-CANVAS-06 R9 Family Proof Diagnostic Transport Closure Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

将 R8 已冻结的 `proof_state` 从受控 Playwright 子进程无歧义传递给直接调用的父 Runner，用于确定真实 Family proof 的首个失败条件；不得改变成功行为、报告、Candidate、Activation、Capability、ISO 结论或公共 CLI wire。

## 2. 事实

R8 实际运行证明 `proof_state` 已附在子进程的 Error，但 `runReleasePlaywright()` 仅接收子进程 stdout/stderr，父 Error 的 `proof_state` 为 `null`。R8 不能跨进程满足诊断目的。

## 3. 精确修改边界

R9 必须唯一 parent=R8=`6557b63d84ecd951b9f5125fd60a10790e20ba5f`，路径恰为：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

## 4. 传输契约

1. Runner 在既有 `PLAYWRIGHT_OUTPUT_DIR` 下唯一接受 `family-proof-diagnostic.json`；禁止新环境变量、目录扫描、checkout fallback 或持久化到 evidence root。
2. child 仅当捕获到 `E2E_ORCHESTRATION_BROWSER_PROOF_INVALID` 且存在 R8 exact `proof_state` 时写入该文件。JSON 必须为单行 JCS 加换行，形状精确为：

```json
{"schema_id":"OPM-DEV-CANVAS-06-FAMILY-PROOF-DIAGNOSTIC-001","schema_version":"0.1","proof_state":{}}
```

`proof_state` 必须逐字段复用 R8，不得增加字段。
3. child 写入须 `wx -> fsync -> rename -> directory fsync`；任一失败保留原错误，不伪造诊断。
4. 父 Runner 仅在 Playwright 非零退出时，且在删除 `PLAYWRIGHT_OUTPUT_DIR` 前，以唯一普通单链接文件、UTF-8、canonical bytes、exact schema/keys/R8 shape 验证并读取该文件。验证失败只保留原 `E2E_UNEXPECTED_RUNTIME_ERROR`，并把诊断视为缺失。
5. 验证成功时，父抛出的同一 `E2E_UNEXPECTED_RUNTIME_ERROR/3` 必须附带深冻结 `proof_state`；其 message 仍为既有 16 KiB 截断诊断。正常退出或不存在诊断文件时不得附带该字段。
6. 无论结果，父 Runner 都必须删除 outputDir 并重新验证其不存在；诊断不得进入最终 Report。
7. 顶层 CLI 继续仅输出 `<stable error code>\tCLI\t-\t-`。

## 5. 验收

Node 22 定向回归必须覆盖 child canonical write、父 exact read、缺失/多字段/非 canonical/多链接/错误码拒绝、成功路径无诊断与 outputDir 清理。`parent(R9)=R8`，delta 为第 3 章五路径，`O..R9` 仍为 `86=65 M+21 A`。之后从 fresh R9 source/new store 重建 Manifest 并运行真实 194/388；只有完整 Report verifier 通过后才评估 Gate。
