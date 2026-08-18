# Spec: DEV-CANVAS-06 Visual Common Materialization 与 Color Profile 设计闭环

文档状态：`FROZEN`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

### 1.1 问题

`DFR-021` 当前存在两个开发阻塞：

1. Common Fixture Factory 只生成 8 个 Visual subject 的元数据，没有冻结 Project/Model/Revision、元素/State/Fact、Occurrence/Layout、SQLite index、UI setup、focus target 和实际 Projection 的唯一映射；
2. Capture Plan `0.1` 固定 `color_profile=srgb`，Golden Environment `0.2` 固定 `color_profile=sRGB IEC61966-2.1`，但没有 canonicalization、比较和 fingerprint 输入规则。

现有生产 Capture Plan 的 Common `expected_projection_sha256` 只计算 `{subject_id,focus_target_id}`，不能证明 Runtime 已加载预期语义模型和 UI 状态；其 Common fixture bytes 也不满足完整可物化契约。

### 1.2 Root Cause

Golden Authoring 先冻结了 capture 数量、Catalog ref 和最终 Report，再把 Common Fixture Factory 留给 03B 实现，导致输入 Schema、SQLite 映射、瞬态 UI setup 和 Projection digest 没有独立 owner。Golden Environment `0.2` 后续引入标准 ICC 名称时，也没有同步 Plan 的 Chromium 启动别名。

### 1.3 为什么此前未发现

此前验证只证明 Catalog/Plan Schema、fixture raw ref 和固定计数闭合，没有沿“fixture bytes -> SQLite -> Runtime read path -> UI setup -> normalized Projection -> capture”执行链复核 Common subject；环境检查也只分别验证两个 Schema，没有执行跨 Schema semantic join。

## 2. 目标

1. 新增 Visual Common Fixture Materialization 与 Color Profile 唯一设计契约；
2. 冻结 8 个 subject 的完整语义/布局/UI setup/Projection 输入、SQLite V1 物化和 attempt 隔离；
3. 冻结 `srgb` 到 `sRGB IEC61966-2.1` 的唯一 canonicalization 和比较算法；
4. 新增 02B Contract/Planner 与 03C Runtime Materializer 两个直接实现包及 checklist；
5. 同步 Golden Authoring、03B、GATE-06-03 和全局状态；
6. 关闭 `DFR-021` 后恢复 `32=22+10`、`cross_document_conflict_count=0` 和 `READY_FOR_DEVELOPMENT`，但不提升任何实现或发布 Gate。

## 3. 修改边界

允许新增：

- 本规格与对应 checklist；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md`；
- 02B Common Visual Fixture Contract/Planner 实现规格与 checklist；
- 03C Common Visual Materializer 实现规格与 checklist。

允许同步：

- Golden Authoring 主设计；
- 03B Candidate Author 实现规格与 checklist；
- DEV-CANVAS-06 总 checklist、测试策略、开发执行包、冻结基线、需求文档和文档索引；
- 上一轮 E2E Runner 设计闭环规格/checklist 的历史状态指针。

禁止修改：

- `.harness/**`；
- `docs/contracts/**`、`scripts/**`、`tests/**`、`services/**`、`apps/**`、`package.json`；
- SQLite DDL/migration、公共 API、Vue 产品行为、Profile/Rule/Grammar/Symbol；
- 现有 Capture Plan、Catalog、fixture、candidate、approved、Manifest、Report、Candidate 或 Activation bytes；
- Capability enablement 和 ISO 结论。

本轮不引入依赖，不执行真实浏览器 authoring，不生成或覆盖 production 资产。

## 4. Fix Strategy

1. 保持 Common Fixture Catalog `0.1` 和 Capture Plan Schema `0.1`，新增被 `fixture_ref` 引用的 Common Visual Fixture `0.1` 内容契约；
2. 新 fixture 封闭承载 Project/Model metadata、完整 `MS-REV-001/0.2`、index seed、capture setup 和 expected projection；旧元数据 fixture 只保留为历史输入，不能进入新 Plan；
3. 唯一物化路径采用 exact Runtime JAR 的 release-authoring-only non-web materializer，直接写隔离 SQLite V1；公共 API 和生产默认装配保持不变；
4. transient candidate/catalog/finding/feedback 通过真实生产 Web 和受控 UI 动作建立；只允许 `BLOCKED_FEEDBACK` 使用一次性、进程内、release-only SQLite fault hook，禁止网络 mock 或 DOM 状态注入；
5. Planner 从 fixture 的封闭 `expected_projection` 计算 Common `expected_projection_sha256`；现有 `GOLDEN-CANVAS06-20260803-001` 不改写，后续以新 change ID 重建 Plan；
6. `srgb` 只作为 Plan/Chromium launch alias，唯一 canonical 值为 `sRGB IEC61966-2.1`；比较先执行封闭映射，Environment fingerprint 只写 canonical 值；
7. 02B 先实现 Schema/Factory/Catalog/Planner，03C 再实现 Runtime materializer/03B 集成；03B 在两包通过前保持 `BLOCKED_BY_DEPENDENCY`。

## 5. 验收标准

1. 设计文档完整回答版本、owner、fixture 字段、8 subject 语义/布局、SQLite 映射、UI setup、Projection digest、CLI、隔离、事务、错误、性能和回滚；
2. Color Profile 固定 raw alias、canonical 值、严格映射、比较、fingerprint 和失败边界；
3. 02B/03C 实现规格和 checklist 具备 Spec Mapping、依赖、范围、正反例、性能、回滚与 release boundary，并保持 `NOT_STARTED`；
4. 03B 不再含实现阶段可选的 Runtime/API/SQLite 路径或 color profile 解释；
5. 全局状态恢复为 `FROZEN/32=22+10/blocked=0/unresolved=0/conflict=0/READY_FOR_DEVELOPMENT`；
6. 明确旧生产 Plan、旧 Common fixture 和当前 Catalog 的 bytes 不被改写，必须由 02B 生成新输入；
7. Markdown 链接、计数、版本、状态、适用 Schema 回归和 `git diff --check` 通过。

## 6. 验证方式

本轮只修改设计文档，无需新增代码测试。必须执行：

1. `npm run release:canvas06:golden-authoring-schema:test`；
2. `npm run release:canvas06:visual-e2e-schema:test`；
3. 本轮文档相对链接、Markdown 表格和围栏检查；
4. `rg` 核对 8/72/144、版本、色彩映射、状态和失效文案；
5. `git diff --check`。

## 7. 回滚

删除本轮新增设计/实现入口并恢复同步文档原文。回滚后 `DFR-021`、`GATE-06-03` 和全局开发门回到 `BLOCKED_BY_DESIGN`；不回滚或删除任何 Schema、代码、SQLite、Plan、candidate、approved 或用户数据。

## 8. 事实与非结论

事实：当前 8 个 Visual fixture 只有元数据；当前 production Plan Common projection digest 只绑定 subject/focus；02B、03C 和 03B 完整 runner 均未实现。

本设计闭环不构成新 Common fixture、Plan、candidate、Approval、approved version、Visual Manifest/Report、GATE READY、Capability enablement、生产发布或 ISO 19450:2024 符合性证明。

> 历史状态指针（2026-08-07）：本规格冻结的是Visual Common Materialization首轮`v1.0`。当前唯一口径为`v1.4`，已追加JCS owner/parity、唯一空Text Artifact/计数、五类index、8类UI step和43文件self-contained root闭包；全局状态以冻结基线`v1.21`为准。本历史规格不构成新增契约的实现证据。
