# Spec: DEV-CANVAS-06 R3 Cumulative Delta Closure Bugfix

文档状态：`HISTORICAL_R3_INPUT / SUPERSEDED_FOR_PRODUCTION_BY_R4_FINAL_RUNNER_CHAIN_CLOSURE`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

修正 R2 CLI 闭包后 Final Runner 累计 source allowlist 的遗漏。R3 已形成，但其 direct-parent 假设由 R4 取代；R3 不再作为 production final source。

## 2. 事实与根因

1. R2=`6918ee26153f880802ebadbc8fc01407e4f5b906` 相对 R 的 stage delta 恰为 9 个 `M`，其中包括 `scripts/canvas06-e2e-run-preflight.mjs` 及其测试。
2. 这两个路径此前不在 `O..R` 累计集合内。因此 `git diff --no-renames --name-status O..R2` 实际为 `85=64 M+21 A`，不是 R2 规格误记的 `83=62 M+21 A`。
3. `FINAL_RUNNER_CUMULATIVE_DELTA` 只合并至 R 的 `RUNNER_DELTA_OWNER_CLOSURE`，遗漏了已冻结的 `RUNNER_CLI_DELTA`；R2 的逐段校验可以通过，但最终累计校验必然以 `FINAL_RUNNER_CUMULATIVE_DELTA` 失败。

## 3. 精确修改边界

R3 必须唯一 parent=R2，生产源码路径恰为 `2 M`：

```text
M scripts/canvas06-unified-production-input.mjs
M scripts/canvas06-unified-production-input.test.mjs
```

文档仅允许新增本规格与 checklist，并将 R2/Final Production checklist 的 R2 最终生产状态标记为历史。禁止修改 Java、Vue、Schema、OpenAPI、SQLite、Profile、Driver、Manifest/Report 业务语义、R2 的九路径 delta、任何既有 release root 或 Handoff。

## 4. 唯一修正

1. `FINAL_RUNNER_CUMULATIVE_DELTA` 必须按 UTF-8 path byte order 由 `FAULT_2A_CUMULATIVE_DELTA`、`RUNNER_DELTA`、`RUNNER_DELTA_OWNER_CLOSURE` 与 `RUNNER_CLI_DELTA` 唯一合成。
2. `O..R3` 的 unique `status + TAB + path` 集合精确为 `85=64 M+21 A`。R3 仅重写两个既有 `M` 路径，故 `O..R3` 与 `O..R2` 的 status/path 集合相同。
3. 测试必须锁定 `FINAL_RUNNER_CUMULATIVE_DELTA.length === 85`，并证明两个 preflight 路径出现在最终集合中；缺失、额外、错误 status 或非 UTF-8 byte order 均须被原有 source guard 拒绝。
4. `runner-source-commit` 与 `source-commit` 在 `FINAL_RUNNER` 时必须逐字符等于 R3。不得通过环境变量、fallback、目录扫描或手工删除两个 preflight 路径继续消费 R2。

## 5. 生产重建与验收

1. R3 形成后，从 R3 创建新的 clean source worktree 与新的空 external release store。
2. 运行 v02 production Manifest 编排，必须重建 Handoff、Intake、Runtime JAR、Web、Common 输入、Manifest staging 与 installed verifier；不得复用 R2 或更早的输出。
3. 通过后，才以新的 Manifest 运行完整 `194/388`；不得生成单 case Report。
4. R3 的定向 Node 22 测试、source chain 负例、`git diff --check` 均必须通过。
5. 本规格不生成 Candidate、Activation，不启用 Capability，也不构成 production 或 ISO 19450:2024 符合性证明。

## 6. 回滚与边界

若 R3 验证失败，R3 版本根须按既有失败隔离契约处理；不得 amend R2、覆盖已安装根，或把 R2 误标记为可消费 production source。真实 `194/388`、Report、GATE-06-03、Candidate、Activation 与 Capability 仍须等待后续独立证据。
