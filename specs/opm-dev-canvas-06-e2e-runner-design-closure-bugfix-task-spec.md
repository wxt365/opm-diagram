# Spec: DEV-CANVAS-06 E2E Runner 设计闭环修正

文档状态：`FROZEN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

### 1.1 问题

E2E Manifest `0.1` builder/verifier 已实现并完成受控验证，但 `GATE-06-03` 仍缺少独立的 E2E Runner 开发入口。既有总 checklist 只冻结了 `194` case、`388` attempt、失败码和 READY 聚合，没有完整冻结以下执行语义：

1. production/controlled run CLI 与只读 verifier CLI；
2. exact Manifest 信任链、Runtime/Web 启动和环境预检；
3. 每 attempt 的 SQLite、Runtime、Web、浏览器、端口和 artifact 隔离；
4. Family driver 与 Common Fixture Factory 的唯一执行映射；
5. 命令、候选、OPL、Trace、Projection、网络、console、重开和事务证据的持久化格式；
6. Report `0.1` 字段映射、first-failure precedence、BLOCKED/零 Report 边界和原子提交；
7. verifier 的只读语义、`--require-ready` 边界和 tree digest 不变性。

### 1.2 Root Cause

Visual/E2E 总契约先冻结了 Gate 的外部结果和 Schema，后续 E2E Manifest builder 又单独闭合了输入物化；两者之间没有为真正执行 `194/388` 建立独立 Runner owner 和事务边界。旧状态文案还把已完成的 Manifest builder 与未实现的 Runner/Report 合并描述，导致开发入口和实施状态不一致。

### 1.3 为什么此前未发现

此前检查以 Schema、Manifest 输入闭包和 Gate 高层矩阵为主，没有按可执行包逐项验证“输入 builder -> runner -> raw artifact -> Report writer -> semantic verifier”的完整职责链。

## 2. 目标

1. 新增 E2E Runner 实现规格和实现 checklist，达到 `FROZEN_FOR_IMPLEMENTATION`；
2. 保持 E2E Manifest/Report Schema `0.1` 不变，通过 attempt `artifact_refs[]` 引用完整机器证据；
3. 同步 DEV-CANVAS-06 总 checklist、测试策略、开发执行包、设计冻结基线和文档索引的职责与状态；
4. 明确设计冻结不等于 Runner 已实现、`194/388` 已执行、Report READY、Gate 关闭、Candidate/Activation、Capability 启用或 ISO 符合性证明。

## 3. 修改边界

允许修改：

- `specs/opm-dev-canvas-06-e2e-runner-design-closure-bugfix-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-e2e-runner-design-closure-bugfix-checklist.md`；
- `specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-e2e-runner-implementation-checklist.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/requirements/opm-online-modeling-tool-requirements.md`；
- `docs/design/opm-test-strategy.md`；
- `docs/design/opm-development-execution-pack.md`；
- `docs/design/opm-design-freeze-baseline.md`；
- `docs/README.md`。

禁止修改：

- `.harness/**`；
- E2E Manifest/Report、Common Fixture 或其他 JSON Schema；
- `scripts/**`、`tests/**`、`services/**`、`apps/**`、`package.json`；
- SQLite DDL/migration、Profile、Rule、Grammar、Symbol、Handoff、Evidence Bundle；
- production gate、Candidate、Activation 和 Capability 状态。

本轮不引入依赖，不修改公共 API，不运行真实浏览器 release case，不生成任何生产 Report。

## 4. Fix Strategy

1. 以 E2E Manifest `0.1`、E2E Report `0.1` 和 DEV-CANVAS-06 `GATE-06-03` 为唯一上游契约；
2. 在独立实现规格中冻结 Runner、Reporter、Verifier 和 release Playwright config 的 owner、CLI、输入、隔离、执行、证据、聚合、事务、错误及验收；
3. 将 Schema 未直接承载的细粒度观察值冻结为版本化 raw artifact，由每个 attempt 的 `artifact_refs[]` exact 引用；
4. 修正正式入口中“Manifest builder 未闭合”的失效状态，分别记录 Manifest builder 已实现、Runner 未实现、production execution 未运行；
5. 把复核发现的 Visual Common Fixture Runtime Materialization 缺口与 `color_profile` 跨契约冲突归回 `DFR-021`，关闭全局开发门，但不撤销 E2E Runner 子包的局部冻结结论；
6. 不改 Schema，不重解释已冻结 case、failure code 或 READY 算法。

影响范围为 DEV-CANVAS-06 E2E release execution 的设计和全局设计状态索引；不影响 Runtime、前端、数据库或 Gate 实现/执行状态。

## 5. 验收标准

1. Runner 规格完整回答 CLI、owner、版本、信任链、production/controlled 隔离、Runtime/Web/browser 启动、attempt 隔离、driver/factory 映射、稳定等待、外网阻断、证据格式、Report 映射、聚合、failure precedence、退出码、事务和回滚；
2. 实现 checklist 包含 Spec Mapping、实现任务、正反例、release boundary，并保持 `NOT_STARTED`；
3. 当前 bugfix checklist 完整映射本规格并记录文档验证结果；
4. 正式入口不再称 E2E Manifest builder 未实现，也不把 Runner 设计冻结写成实现或执行完成；
5. 全局状态唯一记录为 `32=21 FROZEN_INCLUDED + 10 FROZEN_DEFERRED + 1 BLOCKED`、`cross_document_conflict_count=1`、`BLOCKED_BY_DESIGN`，且 `DFR-021` 是唯一 blocked responsibility；
6. Markdown 链接、Schema 引用、数字 `194/388/34/146/48` 和版本 `0.1/0.1.0` 一致；
7. `git diff --check`、文档链接检查和适用 E2E Schema 回归通过。

## 6. 验证方式

本轮是文档修正，无需新增自动化测试。必须执行：

1. `npm run release:canvas06:visual-e2e-schema:test`，确认未改变既有 E2E Manifest/Report Schema 行为；
2. 对本轮文档执行相对 Markdown 链接存在性检查；
3. 用 `rg` 检查版本、计数、状态边界和失效文案；
4. `git diff --check`。

## 7. 回滚

删除本轮新增的两个设计闭环文件和两个 Runner 实现入口，并恢复六个同步入口的原文。本轮不含 Schema、代码、数据或发布状态变更，不需要数据回滚。

## 8. 事实与非结论

事实：E2E Manifest builder/verifier 已实现且定向验证为 `22/22`；E2E Runner/Reporter/verifier 尚未实现；production `194/388` 未执行，E2E Report 未生成。E2E Runner 子包已完成局部设计闭环，但 `DFR-021` 仍缺 Visual Common Fixture Runtime Materialization 唯一映射，且 `srgb` 与 `sRGB IEC61966-2.1` 缺少 canonical 映射和比较算法，因此全局开发门为 `BLOCKED_BY_DESIGN`。

本规格不构成 `GATE-06-03` handoff、Candidate、Activation、Capability enablement、生产发布或 ISO 19450:2024 符合性证明。

> 历史状态指针（2026-08-17）：本规格记录发现`DFR-021`缺口时的快照。当前唯一状态源为冻结基线`v1.21`、Visual Common Materialization`v1.4`、E2E Attempt Artifact`v1.3`、Family Identity Catalog`0.1/0.1.0`、活动Report`0.2`和Runner Source Set`0.1`；口径为`32=22+10/READY_FOR_DEVELOPMENT`。E2E Manifest Family Catalog适配、E2E Java/source/artifact producer、02B/03C/03B和production Gate仍未完成。
