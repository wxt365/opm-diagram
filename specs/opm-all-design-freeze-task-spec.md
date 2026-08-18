# Spec: OPM 全量设计冻结与开发准入

规格版本：`1.0`

规格状态：`FROZEN_INCLUDED`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景

仓库已经形成 P0、完整画布、DEV-CANVAS-05/06 和发布 Gate 的大部分设计，但正式索引、执行包和验收矩阵仍同时存在 `READY/FROZEN/NEXT/DEFERRED/待冻结/未闭环` 等口径。开发人员不能从局部 Gate `FROZEN` 推导整个产品设计已经冻结。

用户要求先冻结当前产品范围内全部设计，再允许开发。本任务建立唯一全量冻结基线，把每项设计职责归入可执行的受控状态，并在所有阻断项关闭前保持开发门关闭。

## 2. 冻结状态模型

每项设计职责只能使用以下状态：

- `FROZEN_INCLUDED`：属于当前开发基线，目标、范围、字段、状态、交互、契约、验收和变更规则已经冻结；开发必须遵守；
- `FROZEN_DEFERRED`：不属于当前开发基线，但非目标、禁止实现边界、重启条件和后续 owner 已冻结；不得进入当前开发；
- `BLOCKED`：仍缺少必需设计输入或跨文档口径冲突；任何一个 BLOCKED 都使全局开发门保持关闭。

`DRAFT/NEXT/PROPOSED/待冻结/待补/未闭环` 只能作为审计发现，不能出现在最终准入清单的状态列。实现未完成、测试未执行和机器证据未生成不自动等于设计 BLOCKED，但必须与设计状态分栏记录。

## 3. 目标

1. 建立全量设计冻结基线和唯一开发准入算法；
2. 冻结当前发布范围、明确冻结延期范围，不保留隐含未来范围；
3. 关闭浏览器支持矩阵、完整画布机器契约、ISO 规则层级和其他正式索引中的设计口径冲突；
4. 让需求、架构、页面、状态、字段、组件、API、持久化、Profile/Rule/Grammar/Symbol、交换、测试、发布和标准证据边界具有明确 owner、版本和变更入口；
5. 在设计全量冻结前显式阻止开发，在冻结后只允许按 task spec 和依赖 Gate 顺序开发；
6. 不把设计冻结表述为代码完成、发布通过或 ISO 19450:2024 符合性证明。

## 4. 范围

### 4.1 包含范围

- `docs/README.md` 正式入口与状态；
- `docs/requirements/**` 的产品范围、浏览器矩阵、配置档、ISO 规则层级和验收映射；
- `docs/design/**` 的架构、模块、页面、状态、字段、组件、API、持久化、交换、Profile/Rule/Grammar/Symbol、测试、发布与执行包；
- `docs/contracts/**` 中作为设计事实源的 OpenAPI、JSON Schema、代表性样例和契约索引；
- `specs/**`、`docs/checklists/**` 中当前开发包的范围、依赖、DoD、回滚和开发守卫；
- `reference/ISO+19450-2024.pdf` 的只读标准证据核对。

### 4.2 非目标

- 不修改 Java、Vue、TypeScript、JavaScript runner、SQL migration、构建配置、依赖或测试代码；
- 不生成 Release Schema、安装包、golden、性能样本、运行报告或 ISO PASS 证据；
- 不把尚未执行的实现或测试改写为已通过；
- 不修改 `.harness/**`；
- 不复制 ISO 受版权保护的正文，只记录条款定位、规则标识、判定职责和证据类型。

## 5. 修改边界

允许修改：

- `specs/opm-all-design-freeze-task-spec.md`；
- `docs/checklists/opm-all-design-freeze-checklist.md`；
- 为关闭冻结差异所必需的 `docs/README.md`、`docs/requirements/**`、`docs/design/**`、`docs/contracts/**`；
- 必要时同步既有 DEV task spec/checklist 的设计状态和开发守卫。

禁止修改：

- `.harness/**`、`apps/**`、`services/**`、`packages/**`、`scripts/**`、`tests/**`；
- 根 `package.json`、lockfile、Maven POM、SQLite DDL/Flyway；
- 用户工作树中与本任务无关的既有改动。

本任务允许修改文档和机器可读设计契约；不允许修改运行 API 实现、数据库 schema、配置或依赖。

## 6. 必须关闭的设计 Gate

| Gate | 必须冻结的输入 | 退出条件 |
| --- | --- | --- |
| `DF-01 Scope` | 当前发布范围、延期范围、非目标、兼容边界 | 每项范围为 `FROZEN_INCLUDED/FROZEN_DEFERRED` |
| `DF-02 Product/UX` | 页面、状态、字段、组件、浏览器/视口/可访问性矩阵 | 无 `待冻结`，验收可执行 |
| `DF-03 Semantic/ISO` | Profile、Capability、Rule、Grammar、Symbol、OPL/Trace、ISO 规则层级与声明边界 | 规则 owner、版本、证据和延期边界明确 |
| `DF-04 API/Data` | 应用命令、OpenAPI、Revision/Fact/Modifier、SQLite/交换/版本兼容 | 逻辑契约与机器契约差异为零或冻结延期 |
| `DF-05 Quality/Release` | 测试层级、fixture、性能、恢复、发布包、Gate、失败码 | 阈值、状态、算法和证据边界冻结 |
| `DF-06 Cross-doc` | 正式索引、执行包、handoff、spec/checklist 状态 | 权威状态无冲突、引用可追踪 |
| `DF-07 Development Gate` | 全量冻结报告和开发准入 | `blocked_count=0` 才能 `READY_FOR_DEVELOPMENT` |

## 7. 开发准入算法

```text
design_freeze_status == FROZEN
AND every(design_responsibility.status in {FROZEN_INCLUDED,FROZEN_DEFERRED})
AND blocked_count == 0
AND unresolved_design_status_count == 0
AND cross_document_conflict_count == 0
AND every(FROZEN_INCLUDED has owner/version/source/acceptance/change_control)
AND every(FROZEN_DEFERRED has non_goal/restart_trigger/owner/prohibited_implementation)
AND browser_matrix.status == FROZEN_INCLUDED
AND complete_canvas_machine_contract.status == FROZEN_INCLUDED
AND iso_conformance_claim.status == FROZEN_DEFERRED
AND implementation_evidence is reported separately
```

算法满足时开发门状态为 `READY_FOR_DEVELOPMENT`；否则固定为 `BLOCKED_BY_DESIGN`。准入只授权按照既有 `DEV-00~09`、`DEV-CANVAS-00~06` 依赖顺序开展实现，不授权跳过单包输入 Gate。

## 8. 验收标准

1. 新增全量冻结 checklist，含 Spec Mapping、责任矩阵、差异清单、验收、验证和回滚；
2. 浏览器矩阵具有明确支持/不支持范围、版本口径、自动化层级和默认浏览器回退行为；
3. 完整画布 OpenAPI/Revision/Control Modifier 的逻辑与机器契约差异被关闭或明确冻结延期，不能继续标为 `NEXT`；
4. ISO 规则组、原子规则、Annex A Grammar、Symbol 和符合性声明分别具有冻结状态；没有完整 ISO PASS 证据时必须继续禁止符合性声明；
5. 正式索引、执行包、测试策略、需求验收矩阵和相关 handoff 状态一致；
6. 当前开发范围的设计状态列没有 `DRAFT/NEXT/PROPOSED/待冻结/待补/未闭环`；机器产物版本、实施记录和历史审计文字不参与该状态计数；
7. Markdown 表格、围栏、相对引用和限定文件 `git diff --check` 通过；
8. 明确记录本任务未执行代码测试、构建、浏览器 E2E、性能、安装或发布验证。

## 9. 兼容性与变更控制

- API：只允许冻结设计契约；如机器 OpenAPI 发生兼容性变化，必须记录版本和 generated DTO 影响，不声称实现已同步；
- 数据：只允许冻结 Revision/Fact/Modifier 机器表示，不修改 SQLite DDL；
- 配置：不修改运行配置；
- 发布：开发门从 `BLOCKED_BY_DESIGN` 变为 `READY_FOR_DEVELOPMENT` 后，仍须逐包通过实现 Gate；
- 变更：冻结后任何范围、字段、状态、规则、API、Schema、阈值或验收变化必须建立新 task spec，生成新基线版本，不得原地静默修改。

## 10. 回滚

回退本任务新增的冻结规格、checklist 和设计文档增量，恢复此前状态；不回退用户代码、机器资产或运行数据。若回退导致任何设计职责重新出现未冻结状态，全局开发门自动恢复为 `BLOCKED_BY_DESIGN`。

## 11. 事实与假设

### 11.1 事实

1. DEV-CANVAS-06 `GATE-06-01~06` 的执行契约设计已经冻结；
2. 正式索引、执行包、浏览器矩阵和 ISO 延期边界已同步到全量冻结基线；
3. 当前工作树存在用户的代码与机器资产改动，本任务不得回退或冒充其验证结果；
4. ISO 19450:2024 正文为 Clause 1~14，Annex A 为规范性 OPL EBNF；不存在 Clause 15；
5. OpenAPI 已出现 `base_fact_capability_ref`、`AllowedModifier` 和 State/Fact command union，Revision 0.1 Schema 已出现 Fact `modifiers[]`；它们不等于 0.2 发布或运行证据完成。

### 11.2 冻结解释

本任务将“所有设计冻结”解释为：当前开发基线内所有必需设计均为 `FROZEN_INCLUDED`，未来范围必须为边界完整的 `FROZEN_DEFERRED`，不允许保留开放式设计状态。该解释不要求在设计任务中生成实现产物或 ISO 符合性证据。

## 12. 最终冻结结果

唯一状态源为 `docs/design/opm-design-freeze-baseline.md`：

```text
design_freeze_status=FROZEN
design_responsibility_count=30
frozen_included_count=20
frozen_deferred_count=10
blocked_count=0
unresolved_design_status_count=0
cross_document_conflict_count=0
development_gate=READY_FOR_DEVELOPMENT
```

该结果只授权按既有依赖创建和执行一个开发包；实现、测试、发布和 ISO 声明继续受各自 Gate 约束。

> 历史快照说明（2026-08-07 更新指针）：上述`30/20/10`是本任务完成时的冻结结果。当前唯一状态源`docs/design/opm-design-freeze-baseline.md`已升为`v1.21`，当前口径为`32/22/10`；不得用本历史Spec覆盖当前基线。
