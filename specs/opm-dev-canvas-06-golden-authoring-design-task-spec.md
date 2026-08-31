# Spec: DEV-CANVAS-06 Golden Authoring 设计冻结

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

新增独立的 Golden Authoring 设计包，冻结 `GATE-06-03` Visual golden 从 Capture Plan 生成、受控 authoring、审批、不可变版本落盘到 Visual Manifest 消费的完整契约，使后续实现无需重新解释 `1242` 个 capture、环境固定、首轮批准、变更升版或失败拒绝边界。

## 2. 范围

- 新增 Golden Authoring 主设计，定义 Capture Plan、Approval Record、Authoring Report 三类机器资产的身份、字段、状态、引用和 SHA 闭包；
- 冻结从 READY Handoff 的 Coverage Catalog、Golden Manifest、Golden Replay Report 及 Common Fixture Catalog exact join 派生 `1242` 个 capture ID 的算法，且 Capture Plan 生成不依赖既有 PNG；
- 冻结 clean source build、Runtime JAR、fixture materialization、Chromium、字体、时钟、等待条件和 author/verify 命令；
- 冻结 `INITIAL` 与 `SUPERSEDE` 流程、审批职责、不可变版本目录和禁止 validation runner 覆盖规则；
- 冻结缺 capture、环境不一致、审批无效、SHA 不闭合时 Golden Environment 和 Visual Manifest 的拒绝条件；
- 同步 DEV-CANVAS-06 规格、checklist、测试策略、全局冻结基线与文档索引中的正式入口和责任边界，并对仍记录旧 `30/20` 快照的历史冻结记录及实现符合性报告增加明确的 superseded/范围限定。

## 3. 非目标

- 不实现 Capture Plan、Approval Record、Authoring Report 的 JSON Schema、builder、author、verifier 或 release runner；
- 不生成、更新、批准或删除任何 golden PNG、blank baseline、Golden Environment、Visual Manifest 或 Visual Report；
- 不修改既有 Visual/E2E Schema、Common Fixture、Profile/Grammar/Rule/Symbol、API、SQLite、Java、Vue、Playwright 配置或测试代码；
- 不生成 Candidate 或 Activation，不启用任何 Capability，不形成 ISO 符合性证明。

## 4. 修改边界

### 4.1 允许修改

- `specs/opm-dev-canvas-06-golden-authoring-design-task-spec.md`
- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md`
- `docs/design/opm-test-strategy.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/checklists/opm-dev-canvas-06-golden-authoring-design-checklist.md`
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`
- `specs/opm-all-design-freeze-task-spec.md`
- `docs/checklists/opm-all-design-freeze-checklist.md`
- `specs/opm-design-conflict-remediation-and-conformance-refresh-task-spec.md`
- `docs/checklists/opm-design-conflict-remediation-and-conformance-refresh-checklist.md`
- `docs/reports/opm-implementation-design-conformance-test-report.md`
- `docs/README.md`

允许修改文档；禁止修改公共 API、数据库 schema、运行配置、依赖和测试。

### 4.2 禁止修改

- `.harness/**`
- `docs/contracts/**`
- `scripts/**`
- `tests/**`
- `packages/**`
- `src/**`
- `backend/**`
- `package.json` 与锁文件

## 5. 强制设计输入

1. Capture Plan 必须从 READY Handoff 锁定的 Coverage Catalog、Golden Manifest、Golden Replay Report 和 Common Fixture Catalog 派生，不读取、扫描或校验既有 PNG 才能生成 capture 集合；
2. `1242` 个 capture ID 必须复用已冻结算法和顺序：`1170` 个 family capture 加 `72` 个 common capture，集合唯一且全闭包；
3. authoring 必须使用 clean source build、exact Runtime JAR、受控 fixture materialization、固定 Playwright/Chromium、字体文件 SHA、locale/timezone/color profile、冻结时钟和稳定等待条件；
4. 审批记录必须至少包含 change ID、模式、申请人、审批人、原因、旧/新集合 SHA、环境指纹、不可变输出路径和审批时间；申请人与审批人不得相同；
5. 首轮 `INITIAL` 允许排他创建首个 approved version；后续 `SUPERSEDE` 只能创建新版本并引用旧版本，任何已批准版本不得覆盖、删除或原地修改；
6. validation runner 对 approved golden root 永久只读，不具有批准或 authoring 权限；
7. 缺 capture、重复/额外 capture、环境不一致、未审批、审批身份冲突、旧/新 SHA 不闭合或路径可覆盖时，Golden Environment 与 Visual Manifest 均必须拒绝生成；
8. Golden Authoring 的设计冻结、机器资产实现、真实 authoring 执行、发布 READY 和 ISO 符合性证据必须分别表述。

## 6. 验收标准

1. 独立设计包完整定义输入输出、职责、状态机、目录、命令、字段、SHA 算法、失败码、并发/幂等、恢复和验收矩阵；
2. Capture Plan 可在 golden root 为空时确定 exact `1242` capture ID，且与现有 Visual `378/756/1242/2484` 口径无冲突；
3. Author 命令和等待协议可直接转为实现任务，不存在浏览器、字体、时钟、Runtime 或 fixture materialization 的待定输入；
4. INITIAL/SUPERSEDE 审批链和 immutable output path 可判定，validation runner 无任何写入路径；
5. Visual Manifest 的前置条件明确消费 exact approved Authoring Report 和 Golden Environment；任一失败边界都有稳定错误码和零输出要求；
6. 上游规格、release checklist、测试策略、冻结基线和索引引用一致；
7. 当时的历史 `30/20` 快照明确标注由冻结基线 v1.2 的 `31/21` 状态取代；后续状态继续由唯一冻结基线升版承接，既有实现符合性报告不得被误用为新增责任的重验结论；
8. 文档结构、术语、数量、路径和 Markdown whitespace 验证通过。

## 7. 兼容性与回滚

- API：无影响；本轮不修改公共 API。
- 配置：无影响；本轮不新增可执行配置。
- 数据：无影响；本轮不生成或迁移 golden 数据。
- 发布顺序：后续必须先实现并验证 Golden Authoring 三类 Schema/runner，再 author approved golden，最后才能生成 Visual Manifest。
- 回滚：回退本规格列出的文档增量；不得触碰现有 Visual/E2E 并行实现或 golden 资产。

## 8. 事实与假设

### 事实

1. 现有 `GATE-06-03` 已冻结 Visual `378` case、`756` attempt、`1242` capture 和 `2484` attempt capture；
2. 现有 release validation runner 对 golden 只读，golden 更新要求独立变更任务；
3. 当前 Golden Environment Schema 只索引环境、`1242` PNG 和 `9` 个 blank baseline，尚无独立 Capture Plan、Approval Record 和 Authoring Report 设计包；
4. 当前仓库存在未提交的 Visual/E2E Schema、Common Fixture 和实现清单改动，本任务不得覆盖或回退。

### 假设

无。机器资产名称、版本、目录、状态和算法均在本任务内作为设计决定冻结。

> 历史快照说明（2026-08-26 更新指针）：本规格记录首轮设计冻结当时状态。当前状态以Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Fixture Materializer `v1.5`、Verifier Catalog `v1.1`和冻结基线`v1.52`为准；03C只有局部未接纳Java字节，Node adapter/fault/8 base/144 clone未完成且03B等待依赖，不得用本历史Spec覆盖当前分栏状态。
