# Spec: DEV-CANVAS-06 R11 Family CaseExecution Manifest Access Bugfix

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修复 production Family Playwright child 将完整 `CaseExecution` 误作裸 Manifest case，直接读取 `case_entry.viewport_id` 和 `case_entry.zoom_id` 的缺陷。child 必须仅从 `case_entry.manifest_case` 读取这两个 Manifest 字段，使真实 `194/388` 可进入 Browser launch、Driver 调用和后续受控证据链。

## 2. 已复现事实与根因

1. R10 production Manifest 的 194 个 case 均为合法的 `VP-1440X900` 与 `Z-100`。
2. Runner 的 `buildControlledCaseExecutionCatalog()` 为每个 Family case 构造并深冻结 `FamilyCaseExecution`，其 Manifest case 位于 `manifest_case` 字段。
3. `ControlledCaseInvocation.call_context.case_entry === case_execution` 已冻结；bridge 收到的 `case_entry` 因而是完整 `FamilyCaseExecution`，不是裸 Manifest case。
4. 当前 bridge 读取顶层 `caseEntry.viewport_id` 和 `caseEntry.zoom_id`，两值均为 `undefined`，稳定抛出“Family cycle viewport/zoom不符合冻结Manifest。”

此前未发现的原因是 R9/R10 仅修复 child diagnostic transport 与 cleanup 首错优先，真实运行在 bridge 的首个字段读取处终止，尚未覆盖该 `CaseExecution` 包装层。

## 3. 唯一修复契约

1. bridge 的唯一读取路径为 `caseEntry?.manifest_case?.viewport_id` 与 `caseEntry?.manifest_case?.zoom_id`。
2. `manifest_case` 缺失、不是对象、viewport 不在既有 `VIEWPORTS` allowlist，或 zoom 不等于 `Z-100`，仍抛出原有稳定错误文本；不得静默回退顶层字段、环境变量、Catalog、fixture、目录名或默认 viewport。
3. `case_entry` 仍作为完整深冻结 `CaseExecution` 传给 `resolve_invocation()` 和 Driver；本轮不得改写、解包后替换或改变五参数调用对象。
4. 不新增导出、CLI 参数、Schema、公共 HTTP API、SQLite DDL、生产配置或 Capability 状态。

## 4. 精确修改边界与 source chain

R11 的唯一 parent 为 R10：`e09350d1159b864ebf820996ddd4cbb324591e83`。本轮 source delta 恰为：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
M scripts/release-canvas06-e2e-run.test.mjs
M tests/e2e/release/dev-canvas-06/family.controlled.release.spec.ts
```

其中：

- bridge 是唯一行为修复 owner；
- `release-canvas06-e2e-run.test.mjs` 是 bridge source contract 的最小长期回归；
- `canvas06-unified-production-input.{mjs,test.mjs}` 将 R11 纳入 `FINAL_RUNNER` source-chain，且把最终 cumulative delta 扩展为 R10 加 R11 的并集。

R11 后 `FINAL_RUNNER` 的 `runner-source-commit` 指向 R11 commit；它必须精确单 parent=R10。历史 R10 Manifest、Report、Candidate、Activation 和 external release store 均只读。

## 5. 验收

1. Node 22 定向 Runner 测试同时证明：`buildControlledCaseExecutionCatalog()` 输出 Family `manifest_case`；bridge 只读取该嵌套路径且无顶层 fallback。
2. Node 22 unified source-chain 测试证明 R11 parent、精确四路径 delta 和 cumulative allowlist。
3. `git diff --check` 通过，R11 commit 只含第 4 节四路径。
4. 以 fresh R11 source root 和 fresh external release store 重建 production Manifest，重新运行真实 `194/388`。
5. 真实运行若仍失败，保留首个原始错误并先冻结下一最小修复；不得生成 E2E Report、Candidate、Activation 或启用 Capability。

## 6. 回滚

回退 R11 单一 source commit 即恢复 R10 行为；不得覆盖已安装 release root 或已有诊断证据。
