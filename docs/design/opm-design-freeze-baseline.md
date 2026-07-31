# OPM 单机建模工具全量设计冻结基线

文档版本：`1.1`

初始冻结日期：`2026-07-30`

最近复核日期：`2026-07-31`

设计冻结状态：`FROZEN`

开发准入状态：`READY_FOR_DEVELOPMENT`

## 1. 文档定位

本文档是 OPM 单机建模工具设计状态和开发准入的唯一事实源。需求、架构、页面、交互、语义、API、数据、测试、发布、任务规格和 checklist 继续承载各自的详细设计；它们不得单独改变全局设计冻结状态。

本基线只证明开发输入已经闭合，不证明代码、机器资产、构建、测试、安装包、性能、发布或 ISO 19450:2024 符合性已经完成。

冻结状态只允许：

- `FROZEN_INCLUDED`：属于当前开发基线，开发必须遵守；
- `FROZEN_DEFERRED`：不属于当前开发基线，非目标、重启条件、owner 和禁止实现边界已经冻结；
- `BLOCKED`：缺少开发必需输入。任一 `BLOCKED` 都关闭全局开发门。

## 2. 冻结发布边界

### 2.1 当前开发基线

当前开发基线固定为单用户、单设备、本地优先、loopback 本地服务加桌面浏览器的 OPM 建模工具，包含：

1. P01 项目库、P02 项目详情、P03 建模工作台；
2. 一个 Model、多张 OPD、一个根 System Diagram、process tree、object forest、model view 和跨图稳定语义身份；
3. Object、Process、Object State、16 类 Procedural、8 类 Control、10 类 Structural；
4. 图标化工具链、关系分组搜索、服务端候选、检查器、撤销/重做、视口缩放和语义 in/out-zoom；
5. Semantic Model 单一事实源、OPD/OPL/Trace/Finding 投影、不可变 Revision、Draft Head 和 Baseline；
6. ISO 配置档下的只读实时 OPL、Token/Trace、golden 和原子提交；
7. P0 应用 API、完整画布目标 API、SQLite V1、版本化 Revision 文档，以及 `.opmp` ZIP、Canonical JSON、SHA-256、`exchange_format_version=1.0/minimum_reader_version=1.0` 原生交换边界；
8. 分层测试、视觉/E2E/性能/恢复和发布 Gate 设计。

P04-P06 的页面、状态、字段和组件设计已经冻结，但生产实现不属于当前开发包。开发必须按 `DEV-00~09`、`DEV-CANVAS-00~06` 的依赖和单包 Gate 逐步进行。

### 2.2 当前明确禁止

当前开发不得实现或声明：

1. 用户、角色、权限、租户、远程访问、云同步和多人协同；
2. 直接编辑 OPL/OPT 并反向改写语义模型；
3. 中文草案专属元素、关系、OPT 完整资产或生产启用；
4. 外部 OPM 工具互操作、本体发布或下游平台在线集成；
5. 静态数据加密、密钥管理、涉密或国产化部署符合性；
6. 完整 ISO 原子规则、完整 Annex A Grammar、完整 Clause 4 Symbol Catalog；
7. 部分符合、完全符合或工具制造商符合 ISO 19450:2024 的产品声明；
8. 当前目标平台之外的安装包可用性。

## 3. 浏览器、视口与可访问性矩阵

### 3.1 浏览器支持

浏览器测试基线由根 lockfile 的 `@playwright/test=1.57.0` 冻结：

| 引擎 | 冻结版本 | 当前发布阻断范围 | 支持结论 |
| --- | --- | --- | --- |
| Chromium | `143.0.7499.4` | 全部 P01-P03、完整画布、视觉、E2E、性能、恢复和 release smoke | 首发完整支持 |
| Firefox | `144.0.2` | P01-P03 核心主路径、Object/Process/State、16/8/10 候选与提交、OPL/Trace、重开 | 首发核心功能支持 |
| WebKit | `26.0` | P01-P03 核心主路径、Object/Process/State、16/8/10 候选与提交、OPL/Trace、重开 | 首发核心功能支持 |

版本口径是 Playwright 实际引擎版本，不以“现代浏览器”或任意厂商版本替代。Firefox/WebKit 不承担 Chromium 专属像素 golden 和性能阈值，但其核心主路径失败仍阻断对应发布候选。

每个平台 release candidate 必须记录目标 OS/build/arch 和浏览器完整版本。未在表中冻结的浏览器、版本、移动浏览器、内嵌 WebView 和无头浏览器不属于产品支持声明。

### 3.2 默认浏览器不受支持

Launcher 仍只启动 loopback 服务并打开系统默认浏览器。前端在进入项目或工作台前执行浏览器版本和必需 Web API 检查：

1. 支持时正常进入应用；
2. 不支持或无法识别时显示阻断式兼容性页面，列出检测结果、支持矩阵、loopback 地址复制入口和重新检测命令；
3. 阻断页不得发出模型写命令，不得提供“忽略并继续”旁路；
4. 用户在受支持浏览器中打开同一 loopback 地址后才能进入应用；
5. 兼容性检查失败不得关闭本地服务、修改项目或生成 Operation Record。

### 3.3 视口与可访问性

| 基线 | 用途 | 发布守卫 |
| --- | --- | --- |
| `1440x900` | 桌面主验收、visual、性能、release smoke | 必须通过 |
| `1280x800` | 桌面最小布局和主路径 | 必须通过 |
| `390x844` | 窄视口设计回归 | 不代表移动端产品支持；不得全局横向溢出或内容遮挡 |
| `25%/100%/400%` | 画布缩放极值、marker/State/标签/fan/候选/检查器 | 必须通过 visual 与 canvas 非空检查 |

核心动作必须具备键盘路径和可访问名称；焦点可见；状态、错误和所有权不得只用颜色表达；陌生图标必须有 tooltip；文本和控件不得重叠。

## 4. `FROZEN_INCLUDED` 责任矩阵

以下 `20` 项均为当前开发输入。`owner` 是设计和变更责任角色，不表示多用户权限模型。

| ID | 设计责任 | 冻结版本/来源 | Owner | 可执行验收 | 变更控制 |
| --- | --- | --- | --- | --- | --- |
| `DFR-001` | 单机、本地、单用户、loopback 产品边界 | 需求 `v1.0` 第 8、13 章；ARC-007 | Product + M01 | FR-LOCAL、NFR-SEC-001~006 | 新 task spec + 本基线升版 |
| `DFR-002` | 当前开发范围和 P01-P03/完整画布交付顺序 | 开发执行包 `v1.0` | Architecture | DEV-00~09、DEV-CANVAS-00~06 单包 DoD | 禁止跨包静默扩围 |
| `DFR-003` | P01-P06 页面、IA、状态、字段和组件职责 | 页面四文档 + handoff | Frontend Architecture | 原型报告、P01-P06 状态与字段映射 | 页面变更同时更新四文档与 handoff |
| `DFR-004` | State、图标工具链、关系目录和 16/8/10 完整画布 UX | 完整画布设计 `v1.0` | M01/M05/M06 | `ACC-CANVAS-*`、DEV-CANVAS-01~04 | Capability/事件/字段变更必须升版 |
| `DFR-005` | 浏览器、视口、缩放和可访问性矩阵 | 本文第 3 章 | Frontend + QA | NFR-UX-001~006、visual/cross-browser E2E | 浏览器或阈值变化必须升版本基线 |
| `DFR-006` | Thing/State/Fact/Modifier/Context/Occurrence/Revision 核心语义 | 公共语义内核 + 核心元模型字段 | M04/M05/M09 | MS-INV、CORE、roundtrip 正反例 | 语义身份或不变量不得由 UI/API 单边修改 |
| `DFR-007` | 两配置档 96 Capability 宇宙、Profile binding 和隔离 | 能力矩阵 + Profile 字段 Schema | M10 | 96 项唯一登记、未知能力封闭 | 来源或能力变化生成新 Profile version |
| `DFR-008` | ISO Clause 1~14、Annex A/B-D 边界和 103 规则组追踪 | ISO 矩阵 `v1.0` | Standards + M07 | 103 个 ISOR 唯一、证据缺失返回无法判断 | 标准解释变化需证据定位和矩阵升版 |
| `DFR-009` | 16 Procedural、8 Control、10 Structural 的语义、候选和提交 | 能力矩阵 + 完整画布设计 | M04/M06 | 34 Capability 正反例、端点与候选过滤 | 禁止前端硬编码替代 Profile/Rule |
| `DFR-010` | Control 的 Fact/Modifier 唯一表示 | API/持久化/物理设计 | M04/M06/M12 | `control.capability` + `control.segment=PROCESS_INPUT` 成对、各唯一 | 不新增第二 Fact/edge/SQLite 表 |
| `DFR-011` | Structural 双向/互惠、fan/list/completeness 和稳定 Fact 身份 | 符号文本契约第 7 章 | M04/M05/M08 | Structural 合法变体、fan 身份和完整性正反例 | 句式、fan 或方向变化需 Grammar/Rule 同版变更 |
| `DFR-012` | concrete OPL、precedence、SentencePlan、UTF-8 Token/Trace 和 golden | 符号文本契约 + DEV-CANVAS-05 | M08 | GATE-05-01~06、replay/digest/零部分提交 | 模板、顺序或 range 变化生成新资产版本 |
| `DFR-013` | 应用命令/查询、Revision guard、幂等、错误和事务 | 应用 API 契约 `v1.0` | M02/M03/M06/M09/M12 | API operation、error、atomic commit 映射 | 应用语义先变更，再映射传输 DTO |
| `DFR-014` | 完整画布 OpenAPI 目标契约 | `opm-local-api-v1.yaml` 目标 `0.2.0` + API 第 7.2 节 | M06 + API owner | option/base Fact/allowed modifier、State/Fact union、正反 contract test | DEV-CANVAS-00 只能实现冻结目标，不得改语义 |
| `DFR-015` | Revision 0.2 目标机器表示和 0.1 兼容读取 | 核心字段 + 持久化 +物理设计 | M09/M12 | Fact `modifiers[]`、旧 reader、roundtrip、immutable | 发布独立 `/0.2` Schema；不得改写 0.1 历史 Revision |
| `DFR-016` | SQLite V1、不可变 Revision、Draft Head、原子提交和恢复 | 持久化 +物理设计 + V1 DDL | M09/M12 | migration、FK、immutable trigger、故障注入 | 当前语义扩展不修改 SQLite V1 |
| `DFR-017` | `.opmp` 1.0 原生交换、版本兼容和资产 exact binding | 原生交换契约 | M02/M10/M12 | ZIP/Canonical JSON/SHA-256、1.0 reader/writer、staging、digest、未知版本阻断、回滚 | 不得宣称为 ISO 或第三方标准交换格式 |
| `DFR-018` | 分层测试、fixture、visual/E2E/性能/恢复证据边界 | 测试策略 `v1.0` | QA +各模块 | 需求矩阵与 GATE-05/06 | 设计状态与执行状态分栏 |
| `DFR-019` | 工具链 release、enablement、rollback 和 6/12 smoke | DEV-CANVAS-06 规格/checklist | Release + QA | GATE-06-01~06 READY 算法 | Candidate 不等于 Activation；production gate 默认关闭 |
| `DFR-020` | 正式索引、handoff、开发门和冻结后变更 | 本文 + `docs/README.md` | Architecture | blocked/conflict/status 计数为 0 | 任一冻结输入变化先关闭开发门再评审 |

## 5. `FROZEN_DEFERRED` 责任矩阵

以下 `10` 项均已冻结为延期，不是开放问题。

| ID | 延期责任 | Non-goal | Owner | Restart trigger | Prohibited implementation |
| --- | --- | --- | --- | --- | --- |
| `DFD-001` | P04-P06 生产实现 | 当前发布不交付完整差异、符合性和导入导出页面 | Product + M01 | 独立页面开发 spec、API/数据依赖和验收获批 | 不得把原型或 mock 宣称为生产完成 |
| `DFD-002` | 中文草案专属能力与正式 OPT 资产 | 当前发布不启用中文专属结点、关系、规则和文本 | Standards + M10 | 以 `自动化系统与集成 对象过程语言-20250914` 为 exact source 的版本化 Profile 包和独立执行包获批 | 不得混入 ISO Profile 或复用 ISO 符号冒充等价 |
| `DFD-003` | 直接编辑 OPL/OPT | 文本保持只读投影 | Product + M08 | 双向解析、冲突、Trace、撤销和安全模型的独立设计获批 | 不得通过文本绕过命令、规则或 Revision guard |
| `DFD-004` | ISO 约 `511` 个原子 `shall/shall not` 规则目录 | 当前只冻结 103 规则组和承载 Schema | Standards + M07 | 逐条标准定位、稳定 ID、判定逻辑、版权边界和 fixture 评审完成 | 不得由 103 规则组或数量目标推导原子 PASS |
| `DFD-005` | Annex A 完整可执行 Grammar | 当前只实现已冻结 Capability 的 concrete subset | Standards + M08 | 完整 production、正文补充语义、parser/generator 和 golden 经独立 spec 冻结 | 不得从 template ID 猜句式或宣称完整 Annex A |
| `DFD-006` | Clause 4 完整 Symbol Catalog 与全标准视觉证据 | 当前只实现开发基线所需 Symbol descriptor/asset | Standards + M05 | 规范符号、锚点、组合、缩放、字体和视觉证据目录获批 | 不得以通用图标或单一示意符号冒充标准目录 |
| `DFD-007` | ISO 19450:2024 符合性声明 | 当前发布固定为 `EVIDENCE_MISSING/无法判断` | Standards + QA | 原子规则、Grammar、Symbol、互操作和可追溯 PASS evidence 完整 | 不得显示部分/完全/工具制造商符合 |
| `DFD-008` | 外部 OPM 工具互操作和本体平台发布 | 当前只支持 `.opmp` 原生包和离线边界 | Product + M10 | 指定工具/格式/版本、映射、冲突和往返验收独立冻结 | 不得把 `.opmp` 或源 Baseline 声明为第三方/本体发布包 |
| `DFD-009` | 静态加密、密钥管理、涉密与国产化部署 | 当前产品不提供 data-at-rest encryption，也不适用于涉密环境 | Security + M12 | 数据分级、威胁模型、密钥生命周期、备份恢复和目标环境要求获批 | 不得声称数据库、资产目录或备份已加密/涉密合规 |
| `DFD-010` | 远程访问、协同和跨目标平台安装支持 | 当前只允许 loopback、单用户和逐平台候选 | Product + Release | 用户/权限/冲突合并/网络安全或新 target_os 的独立设计与发布 Gate 获批 | 不得开放非 loopback 监听或把一个平台 smoke 外推到其他平台 |

## 6. 机器契约冻结与实现边界

### 6.1 OpenAPI 0.2

完整画布目标 OpenAPI 固定为 `0.2.0`：

1. `CommandCapabilityOption` 包含 `base_fact_capability_ref` 和封闭 `allowed_modifiers[]`；
2. Control option 必须返回 `control.capability`、`control.segment` 同一 `atomic_group_id`，两者 `min_occurs=max_occurs=1`；
3. `control.capability.value_options` 只能是 `CAP-ISO-CTRL-001~008` 中与 option 相同的一项，`control.segment.value_options=[PROCESS_INPUT]`；
4. 非 Control option 禁止 `base_fact_capability_ref` 和 Control 原子组；
5. State/Feature/Fact create/update/delete 使用封闭 command union；
6. `CREATE_FACT.modifiers` 和 `UPDATE_FACT.replacement.modifiers` 以整组原子提交；
7. Projection 中的开放显示 Map 不得作为写入 DTO 或语义事实源。

仓库中的 `0.2.0-draft` 文件是实现输入，不是已验收产物。DEV-CANVAS-00 负责按上述冻结语义发布机器契约、generated client 和正反 contract test；不得在实现阶段重新决定字段或 Control 规则。

### 6.2 Revision 0.2

目标 Revision Schema 固定为独立 `$id=https://opm.local/schemas/opm-revision/0.2`、`schema_version=0.2`：

1. Fact 保留稳定 `fact_id`，包含 `modifiers[]`；
2. Control pair 保存在被修饰基础 Procedural Fact 上，不创建 Control Fact；
3. pair 必须各唯一、成对、值域封闭并参与 canonical digest；
4. 0.1 reader 兼容边界为“无 pair 等于无 Control”；半对、重复键或未知值阻断；
5. 历史 0.1 Revision 不可改写，0.2 writer 不降级写回 0.1；
6. SQLite V1 `document_json` 承载 0.2，不新增表、列或 migration。

当前 `opm-revision.schema.json` 的 `$id/schema_version=0.1` 即使已出现 `modifiers[]`，也不等于 0.2 发布完成。DEV-CANVAS-00/03 必须创建独立版本、兼容 reader/writer 和 roundtrip 证据。

## 7. ISO 证据边界

1. ISO 19450:2024 正文为 Clause 1~14；不存在 Clause 15；
2. Annex A 是 normative OPL EBNF；Annex B~D 是 informative；
3. 当前 103 个 `ISOR-*` 是规则组，不等于原子规则，也不等于 PASS；
4. “约 511”只作为待复核的原子拆分工作量目标，不作为当前规则总数或符合性事实；
5. 当前完整画布 concrete OPL、precedence、Token/Trace 和 golden 是受控产品子集；不代表完整 Annex A；
6. 当前 34 Capability 的 symbol/marker/label/fan 设计是开发输入；不代表完整 Clause 4 Symbol Catalog；
7. 产品符合性固定为 `EVIDENCE_MISSING/无法判断`，直到 `DFD-004~007` 重启并取得完整证据。

## 8. 开发准入算法

```text
design_freeze_status == FROZEN
AND design_responsibility_count == 30
AND frozen_included_count == 20
AND frozen_deferred_count == 10
AND blocked_count == 0
AND unresolved_design_status_count == 0
AND cross_document_conflict_count == 0
AND every(FROZEN_INCLUDED has owner/version/source/acceptance/change_control)
AND every(FROZEN_DEFERRED has non_goal/restart_trigger/owner/prohibited_implementation)
```

本基线计算结果：

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

2026-07-31 复核记录：原生交换契约第 1 章曾保留“物理格式未冻结”的早期表述，与架构 ARC-008、物理数据设计第 10 章及该契约第 16.2 节冲突；冲突存续期间不得引用上述 `cross_document_conflict_count=0`。本次按 `specs/opm-design-conflict-remediation-and-conformance-refresh-task-spec.md` 删除开放选型表述、冻结首发 1.0/reader 1.0，并重新核对 30 项责任后恢复为 `0`。

`READY_FOR_DEVELOPMENT` 只授权开发人员创建并执行一个满足依赖的任务规格。它不授权跳过 `DEV-*`/`DEV-CANVAS-*` 输入 Gate，不授权启用未通过 release evidence 的 Capability，也不授权 ISO 声明。

## 9. 实现与证据状态

设计状态与实现状态必须分栏。当前冻结结论不修改以下事实：

| 证据面 | 本任务结论 |
| --- | --- |
| Java/Vue/SQLite 代码 | 未在本任务实现或复核 |
| OpenAPI 0.2 generated client/handler | 待 DEV-CANVAS-00 验收 |
| Revision 0.2 reader/writer/roundtrip | 待 DEV-CANVAS-00/03 验收 |
| DEV-CANVAS-05 golden/Trace 机器证据 | 以对应 checklist 当前执行记录为准，本任务不重跑 |
| DEV-CANVAS-06 visual/E2E/performance/recovery/release | `NOT_RUN` 或以未来报告为准 |
| `.opmp` 1.0 Schema/reader/writer/golden roundtrip | `NOT_IMPLEMENTED/NOT_RUN`；物理格式已冻结不等于实现完成 |
| production enablement | 默认 `DISABLED` |
| ISO 19450:2024 conformance | `EVIDENCE_MISSING/无法判断` |

## 10. 冻结后变更控制

1. 任何范围、字段、状态、Capability、规则、句式、API、Schema、浏览器、阈值、Gate 或验收变化，先把 `development_gate` 置为 `BLOCKED_BY_DESIGN`；
2. 建立新 task spec 和 Spec Mapping checklist，说明兼容、迁移、测试、回滚及受影响责任；
3. 更新责任文档、机器契约目标和本基线版本；
4. 重新计算 30 项责任和跨文档冲突；
5. 只有重新满足第 8 章算法才能恢复 `READY_FOR_DEVELOPMENT`；
6. 实现发现设计歧义时不得自行猜测，必须回到设计变更流程。

## 11. 事实与限定

### 11.1 事实

1. 需求、模块、P01-P06 页面四文档、完整画布、API、持久化、交换、字段 Schema、handoff、测试策略和开发包均已有正式承接文档；
2. Control/Structural concrete OPL、Token/Trace、golden 和 DEV-CANVAS-05/06 Gate 设计已冻结；
3. 当前 OpenAPI 已出现 `base_fact_capability_ref`、`AllowedModifier` 和 State/Fact command union；Revision 0.1 Schema 已出现 Fact `modifiers[]`；
4. 当前机器文件的存在不等于 generated client、handler、roundtrip、release 或 ISO 证据通过；
5. `.opmp` 首发物理格式和版本已经冻结，机器 Schema、reader/writer、golden package 与 roundtrip 仍待实现；
6. `.harness/repo-profile.md` 与当前应用仓库事实不一致，本任务按边界不修改 `.harness/**`。该治理偏差不改变产品设计语义，但后续 Harness 治理任务必须修正。

### 11.2 假设/解释

“所有设计冻结”解释为：当前开发基线的必需设计全部 `FROZEN_INCLUDED`，未来范围全部以可审计边界 `FROZEN_DEFERRED`；不要求在设计任务中提前完成延期能力的详细实现设计或生成运行证据。
