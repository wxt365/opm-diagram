# Task Checklist: OPM 全量设计冻结与开发准入

## Spec Mapping

- 规格：`specs/opm-all-design-freeze-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：把当前产品开发所需设计全部冻结，建立唯一开发准入状态。
- 范围：需求、架构、页面、状态、字段、组件、API、Revision/Fact/Modifier、Profile/Rule/Grammar/Symbol、交换、测试、发布、ISO 声明边界和正式索引。
- 非目标：Java/Vue/runner/SQL/配置/依赖实现，实际测试、安装、发布或 ISO PASS 证据。
- 约束：只有 `FROZEN_INCLUDED/FROZEN_DEFERRED` 是终态；任一 `BLOCKED` 使开发门保持关闭。
- 验收：规格第 8 节与本清单 `DF-01~07`。
- 验证：状态词审计、字段/ID/版本/引用一致性、PDF 条款核对、Markdown 表格/围栏、限定文件 `git diff --check`。
- 回滚：只回退本任务设计增量；回退后开发门自动恢复 `BLOCKED_BY_DESIGN`。

## 修改边界

- [x] 允许修改 `docs/README.md`、`docs/requirements/**`、`docs/design/**`、`docs/contracts/**`、必要的 `specs/**` 和 `docs/checklists/**`
- [x] 禁止修改 `.harness/**`、`apps/**`、`services/**`、`packages/**`、`scripts/**`、`tests/**`、构建配置、依赖和 SQLite migration
- [x] 不回退或覆盖用户工作树中的既有代码与机器资产改动
- [x] 文档与机器可读设计契约允许修改；运行实现、数据和发布状态不允许修改

## 初始设计差异台账

| Gap ID | 当前事实 | 冻结目标 | 初始状态 | 开发阻断 |
| --- | --- | --- | --- | --- |
| `DF-GAP-SCOPE-001` | 中文草案专属结点/关系未进入完整画布首发设计 | 冻结为明确延期范围、禁止实现边界和重启条件 | `BLOCKED` | 是 |
| `DF-GAP-UX-001` | `NFR-UX-005` 浏览器版本矩阵待冻结 | 冻结首发支持矩阵、自动化层级和默认浏览器回退 | `BLOCKED` | 是 |
| `DF-GAP-API-001` | 完整画布 OpenAPI 缺 Control 基础 Fact 引用与 Modifier 原子组 | 逻辑契约与机器 OpenAPI 字段、基数、错误和兼容一致 | `BLOCKED` | 是 |
| `DF-GAP-DATA-001` | 正式索引仍称 Revision Fact `modifiers` 未闭环 | 冻结版本化 Revision Schema 和 roundtrip 边界 | `BLOCKED` | 是 |
| `DF-GAP-ISO-001` | ISO 矩阵只有规则组，511 个 `shall` 原子规则未形成 | 冻结原子规则目录的当前/延期边界和符合性声明守卫 | `BLOCKED` | 是 |
| `DF-GAP-ISO-002` | Annex A 完整可执行 Grammar 尚未形成 | 冻结当前 concrete subset 与完整 Annex A 后续边界 | `BLOCKED` | 是 |
| `DF-GAP-SYMBOL-001` | 完整 ISO Symbol Catalog/视觉证据未形成 | 冻结当前 34 Capability 目录与完整标准目录后续边界 | `BLOCKED` | 是 |
| `DF-GAP-SEC-001` | 静态数据加密需求未冻结 | 明确首发非目标、风险、重启条件与不可声明事项 | `BLOCKED` | 是 |
| `DF-GAP-INDEX-001` | 正式索引/执行包同时存在 READY、NEXT、DEFERRED 和旧缺口 | 同一责任只保留一个受控冻结状态 | `BLOCKED` | 是 |
| `DF-GAP-GOV-001` | `.harness/repo-profile.md` 与真实仓库不一致且本任务禁止修改 | 冻结为治理延期，不允许产品设计状态掩盖该限制 | `BLOCKED` | 否 |

差异只能通过以下两种方式关闭：补齐为 `FROZEN_INCLUDED`，或明确非目标、禁止实现、owner、重启条件后变为 `FROZEN_DEFERRED`。不得仅删除“待冻结”文字或把实现未完成改写为设计完成。

### 最终差异关闭台账

| Gap ID | 最终状态 | 关闭依据 | 实施/证据限定 |
| --- | --- | --- | --- |
| `DF-GAP-SCOPE-001` | `FROZEN_DEFERRED` | 冻结基线 `DFD-002` | 中文专属能力不得进入当前发布 |
| `DF-GAP-UX-001` | `FROZEN_INCLUDED` | 冻结基线第 3 章、NFR-UX-005 | 跨浏览器证据按 release Gate 执行 |
| `DF-GAP-API-001` | `FROZEN_INCLUDED` | 冻结基线 6.1、应用 API 7.2 | OpenAPI 0.2 发布/生成/contract test 待 DEV-CANVAS-00 |
| `DF-GAP-DATA-001` | `FROZEN_INCLUDED` | 冻结基线 6.2、持久化/物理设计 | Revision 0.2 reader/writer/roundtrip 待 DEV-CANVAS-00/03 |
| `DF-GAP-ISO-001` | `FROZEN_DEFERRED` | `DFD-004/007` | 当前结论固定为 `EVIDENCE_MISSING/无法判断` |
| `DF-GAP-ISO-002` | `FROZEN_DEFERRED` | `DFD-005` | 当前只允许冻结 concrete subset |
| `DF-GAP-SYMBOL-001` | `FROZEN_DEFERRED` | `DFD-006` | 当前开发范围的 34 Capability Symbol 设计仍为 `FROZEN_INCLUDED` |
| `DF-GAP-SEC-001` | `FROZEN_DEFERRED` | `DFD-009` | 禁止静态加密、涉密或国产化合规声明 |
| `DF-GAP-INDEX-001` | `FROZEN_INCLUDED` | 冻结基线 + `docs/README.md` | 运行证据状态不参与设计冻结计算 |
| `DF-GAP-GOV-001` | `FROZEN_DEFERRED` | 冻结基线 11.1；本任务禁止修改 `.harness/**` | 后续 Harness 治理任务修正，不阻断产品开发 |

## DF-01 Scope

- [x] 冻结首发产品、Profile、页面、Capability 和发布形态范围
- [x] 对中文草案专属能力建立 `FROZEN_DEFERRED` 边界
- [x] 对 P04-P06、完整 ISO Conformance、跨平台安装和未来协作范围区分设计状态与实现状态
- [x] 每项延期具有 `owner/restart_trigger/prohibited_implementation/non_goal`
- [x] 当前开发范围内不存在隐含、未编号或“以后再定”的功能

## DF-02 Product/UX

- [x] P01-P06 页面、状态、字段、组件和主动作守卫均有正式来源
- [x] 冻结首发浏览器 engine/version/OS/自动化矩阵
- [x] 冻结默认浏览器不受支持时的启动器与页面行为
- [x] 冻结 `1440x900/1280x800/390x844` 与 `25%/100%/400%` 的用途边界
- [x] 冻结键盘、焦点、可访问名称、颜色非唯一编码和错误反馈基线
- [x] `NFR-UX-005` 不再出现“待冻结浏览器版本”

## DF-03 Semantic/ISO

- [x] 核心 Thing/State/Fact/Context/Occurrence/Revision 边界冻结
- [x] 16 Procedural、8 Control、10 Structural 的 Capability/Rule/Grammar/Symbol/OPL/Trace 责任冻结
- [x] Control 使用基础 Fact 上成对 Modifier 的唯一持久化表示冻结
- [x] ISO Clause 1~14、Annex A 规范性边界与 Annex B~D informative 边界核对
- [x] 规则组与原子 `shall` 规则的状态、owner、ID 和后续输入冻结
- [x] Annex A concrete subset 与完整 Grammar 的支持/禁止声明边界冻结
- [x] 完整 Symbol Catalog 当前范围和后续范围冻结
- [x] ISO 19450:2024 符合性声明保持 `FROZEN_DEFERRED`，无 PASS evidence 不得声明符合

## DF-04 API/Data

- [x] 应用 API 与 OpenAPI operation/union/error/幂等/Revision guard 对齐
- [x] `CommandCapabilityOption` 冻结 Control 基础 Fact、Modifier 原子组和完整依赖表达
- [x] Revision Fact 冻结 `modifiers`、身份、基数、版本和兼容读取边界
- [x] OpenAPI/Revision Schema 变更记录 generated DTO、旧 reader 和写入版本影响
- [x] SQLite V1 不变；新增语义通过版本化 Revision 文档承载的边界冻结
- [x] `.opmp` 交换包、Profile package 和历史 Revision exact binding 边界冻结
- [x] 正式索引不再把完整画布机器契约标记为 `NEXT`

## DF-05 Quality/Release

- [x] 测试层级、fixture、golden、E2E、视觉、性能、恢复与发布职责冻结
- [x] DEV-CANVAS-05 `GATE-05-01~06` 和 DEV-CANVAS-06 `GATE-06-01~06` 设计状态一致
- [x] Release Candidate Manifest/Report、6 case/12 attempt、失败码和 READY 算法冻结
- [x] 设计 `FROZEN` 与 implementation/report `BLOCKED/NOT_RUN` 分栏
- [x] 产品发布证据与 ISO Conformance evidence 不互相替代

## DF-06 Cross-doc

- [x] 新增唯一 `opm-design-freeze-baseline.md`，包含责任矩阵、状态和全局开发门
- [x] 同步 `docs/README.md`、开发执行包、前端 handoff、测试策略和需求验收矩阵
- [x] 同步旧的“草案/NEXT/待冻结/未闭环”状态，不删除仍真实的实现缺口
- [x] 所有正式文档指向同一冻结基线和变更入口
- [x] 需求、CAP、ISOR、API、Schema、Gate 和验收 ID 无冲突

## DF-07 Development Gate

- [x] `design_responsibility_count` 与冻结基线表格数量一致
- [x] `frozen_included_count + frozen_deferred_count == design_responsibility_count`
- [x] `blocked_count == 0`
- [x] `unresolved_design_status_count == 0`
- [x] `cross_document_conflict_count == 0`
- [x] 全局开发门=`READY_FOR_DEVELOPMENT`
- [x] READY 仅授权按既有 DEV 包依赖顺序开发，不授权跳过单包 Gate
- [x] 任一冻结输入变更时自动回到 `BLOCKED_BY_DESIGN`

## Verify

- [x] ISO PDF metadata、目录和 Annex A 关键页已只读核对
- [x] 修改文档 Markdown 表格列数一致
- [x] Code fence 成对
- [x] 相对文件引用可解析；未来机器资产明确标为待实现
- [x] 当前开发范围状态词审计无 `DRAFT/NEXT/PROPOSED/待冻结/待补/未闭环`
- [x] 限定修改文件 `git diff --check` 通过
- [x] 未执行代码测试、构建、E2E、性能、安装或发布，并在结论中明确

## 当前结论

`design_freeze_status=FROZEN`，`design_responsibility_count=30`，`frozen_included_count=20`，`frozen_deferred_count=10`，`blocked_count=0`，`development_gate=READY_FOR_DEVELOPMENT`。开发人员只能按既有依赖选择一个 DEV 包并建立独立 task spec；未通过实现 Gate 的能力不得启用。
