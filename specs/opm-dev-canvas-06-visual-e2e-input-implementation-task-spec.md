# Spec: DEV-CANVAS-06 Visual/E2E 输入与 Manifest 实现（历史版本）

> 文档状态：`HISTORICAL/SUPERSEDED`。
>
> 本规格只保留 Common Fixture 首轮实现快照。Visual/E2E 合并 builder 及 Visual Manifest `0.1` 输出目标已被 `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md` 取代，不得继续作为活动开发入口、完成未勾选 builder 项或生成 production Manifest。当前 Visual builder 只能输出 `0.2/0.2.0`；E2E 由独立入口保持 `0.1/0.1.0`。

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

本节记录原始目标，不再授权实现：版本化 Common Fixture Catalog、8 个公共 Visual fixture、16 个公共 E2E base/input fixture，以及当时计划的 Visual/E2E 合并 Manifest builder。Common Fixture 已完成项仍是历史实现事实；合并 builder 与 Visual `0.1` 目标永久终止。

## 2. 范围

- `tests/e2e/release/dev-canvas-06/fixtures/**` 的版本化公共 fixture 与 factory 源；
- `scripts/release-canvas06-visual-e2e-manifest.mjs` 及正反例测试；
- `package.json` 的 manifest 命令；
- 本规格、对应 checklist 和 `GATE-06-03` 实现状态。

## 3. 非目标

- 不生成或接受 `1242` golden PNG，不生成 Golden Environment 实体；
- 不实现 Visual/E2E 浏览器 runner、Report 或 READY verifier；
- 不修改 Profile/Rule/Grammar/Symbol、API、SQLite、Vue 和既有 P0 E2E；
- 不生成 Candidate/Activation，不启用 Capability。

## 4. 约束

1. Common Fixture Catalog 的 source binding 必须来自 READY Handoff `active_binding`，禁止硬编码 Profile/Rule 版本；
2. Builder 只读 Handoff root 和 source root，所有输出只能写入 evidence root；
3. 未提供合法 Golden Environment 时 Visual Manifest 必须拒绝生成，不得伪造 golden；E2E Manifest 不接受 Golden Environment 参数；
4. family case 必须通过 Coverage Catalog、Golden Manifest、Golden Replay 的 exact join 派生；缺项、重复、expectation 或两次 transaction 不一致即退出码 `3`；
5. 本切片不以 Schema 编译、Manifest 生成或 BLOCKED 结果宣称 `GATE-06-03` READY。

## 5. 验收

1. catalog 通过 Common Fixture Schema，固定包含 `8/16` 条目、factory/fixture SHA 和 Handoff active binding；
2. builder 对可控 test bundle 生成通过 Visual/E2E Manifest Schema 的 `378/194` 固定矩阵；
3. Visual 缺 golden、E2E 带 golden、上游 join 不一致均被拒绝；
4. 自动化测试和 `git diff --check` 通过。

## 6. 回滚

回退本规格列出的 fixture、脚本、测试、命令与 checklist 增量；不影响 Handoff、Profile 或运行时数据。

## 7. 事实与假设

### 事实

1. `dev-canvas-05-handoff.json` 当前为 `READY_FOR_DEV_CANVAS_06`，含 34 个 eligible Capability 和 `178/130/48` 上游证据；
2. `GATE-06-03` 已冻结 Common Catalog、Golden Environment、Manifest 字段与生成算法；
3. 本规格创建时不存在 release fixture、Manifest builder 或 release runner；该陈述是历史快照，当前状态必须读取替代规格和对应活动 checklist。

### 假设

无。公共 fixture 的具体 factory 内容由已冻结规格授权在本实现包落地。
