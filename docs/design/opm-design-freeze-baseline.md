# OPM 单机建模工具全量设计冻结基线

2026-09-15 局部修正冻结：[P03 状态布局、Operation 与展示—特征符号](../../specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md)。替代 Attribute 布局规格的旧移动白名单；不变更发布、Capability enablement 或 ISO 符合性证据状态。执行证据见[checklist](../checklists/opm-p03-owned-state-layout-and-exhibition-bugfix-checklist.md)。

文档版本：`1.93`

初始冻结日期：`2026-07-30`

最近复核日期：`2026-09-11`

设计冻结状态：`FROZEN`

开发准入状态：`READY_FOR_DEVELOPMENT`

## 1. 文档定位

2026-09-11：新增 [混合保存与草稿恢复策略](opm-hybrid-save-and-draft-recovery-design.md)，冻结用户交互、逻辑身份、调度/事务、保留与兼容边界。该模式为 M09/M12 的后继 L3 变更：策略 FROZEN，机器 Schema/DDL、实现与迁移证据尚未交付；只能依 [HS-01~04 实施任务](../../specs/opm-hybrid-save-strategy-implementation-task-spec.md) 逐片进入开发，不得依据本文件的既有全局 READY 声明直接启用新保存模式。既有 32 项责任计数不据此重算，新增变更单独追踪于 [设计 Checklist](../checklists/opm-hybrid-save-strategy-design-checklist.md)。

2026-09-11：冻结 [P03 生成/消耗组合工具](../../specs/opm-p03-combined-transformation-tool-task-spec.md)。仅合并基础 001/002 的 UI 入口，按 Runtime 规范端点与手势方向选择，保留独立 Capability、Fact、Symbol、OPL/Trace；Catalog 16/8/10 不变，UI 常驻 4/4/5、展开 15/8/10。该冻结不改变发布或 ISO 证据结论，实施验证见 [Checklist](../checklists/opm-p03-combined-transformation-tool-checklist.md)。

本文档是 OPM 单机建模工具设计状态和开发准入的唯一事实源。需求、架构、页面、交互、语义、API、数据、测试、发布、任务规格和 checklist 继续承载各自的详细设计；它们不得单独改变全局设计冻结状态。

本基线是开发输入是否闭合的唯一判定源；当前32项责任已闭合为`22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`。恢复开发准入只表示允许按独立实现规格进入Build，不证明代码、机器资产、构建、测试、安装包、性能、发布或ISO 19450:2024符合性已经完成。

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
8. 分层测试、Golden Authoring、release-only Fixture Materializer、视觉/E2E/性能/恢复和发布 Gate 设计。

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

## 4. 当前设计责任矩阵

当前`22`项设计责任为`FROZEN_INCLUDED`，没有`BLOCKED`。`owner`是设计和变更责任角色，不表示多用户权限模型。

### 4.1 `FROZEN_INCLUDED`

| ID | 设计责任 | 冻结版本/来源 | Owner | 可执行验收 | 变更控制 |
| --- | --- | --- | --- | --- | --- |
| `DFR-001` | 单机、本地、单用户、loopback 产品边界 | 需求 `v1.0` 第 8、13 章；ARC-007 | Product + M01 | FR-LOCAL、NFR-SEC-001~006 | 新 task spec + 本基线升版 |
| `DFR-002` | 当前开发范围和 P01-P03/完整画布交付顺序 | 开发执行包 `v1.47` | Architecture | DEV-00~09、DEV-CANVAS-00~06 单包 DoD | 禁止跨包静默扩围 |
| `DFR-003` | P01-P06 页面、IA、状态、字段、组件职责、HEAD/EXACT URL 定位和 OPD 节点渲染注册架构 | 页面设计 `v1.0` + 状态/字段 `v1.1` + 组件交互 `v1.13` + OPD 节点渲染架构 `v1.6` + handoff `v1.13` | Frontend Architecture | 原型报告、P01-P06 状态与字段映射、canonical HEAD URL、只读 EXACT 深链、实际 Revision Header、Node/Capability Definition、committed/preview RenderSpec、Control Decorator、Registry、X6 adapter/gesture/context-menu intent contract | 页面、URL 或节点/关系渲染架构变更同时更新责任文档与 handoff |
| `DFR-004` | State、图标工具链、关系目录和 16/8/10 完整画布 UX | 完整画布设计 `v1.10` | M01/M05/M06 | `ACC-CANVAS-*`、主工具栏单排纯图标分组、`5/4/5`高频直达、完整纯图标`16/8/10`目录、双语tooltip、34项标准缩略符号、七阶段 gesture、26基础preview、右键/键盘统一构造生命周期、DEV-CANVAS-01~04 | Capability/事件/字段变更必须升版 |
| `DFR-005` | 浏览器、视口、缩放和可访问性矩阵 | 本文第 3 章 | Frontend + QA | NFR-UX-001~006、visual/cross-browser E2E | 浏览器或阈值变化必须升版本基线 |
| `DFR-006` | Thing/State/Fact/Modifier/Context/Occurrence/Revision 核心语义 | 公共语义内核 + 核心元模型字段 | M04/M05/M09 | MS-INV、CORE、roundtrip 正反例 | 语义身份或不变量不得由 UI/API 单边修改 |
| `DFR-007` | 两配置档 96 Capability 宇宙、Profile binding 和隔离 | 能力矩阵 + Profile 字段 Schema | M10 | 96 项唯一登记、未知能力封闭 | 来源或能力变化生成新 Profile version |
| `DFR-008` | ISO Clause 1~14、Annex A/B-D 边界和 103 规则组追踪 | ISO 矩阵 `v1.0` | Standards + M07 | 103 个 ISOR 唯一、证据缺失返回无法判断 | 标准解释变化需证据定位和矩阵升版 |
| `DFR-009` | 16 Procedural、8 Control、10 Structural 的语义、候选、提交和前端独立 Definition/Decorator | 能力矩阵 + 完整画布设计 + OPD 节点渲染架构 + P03关系手势/分组工具栏规格 | M04/M05/M06 | 34 Capability 正反例、exact Symbol glyph、端点与候选过滤、26基础preview/confirm、8 Control selected Fact路径、34项Registry隔离 | 禁止前端硬编码替代 Profile/Rule、未知Symbol fallback、option直接提交或按family聚合production renderer |
| `DFR-010` | Control 的 Fact/Modifier 唯一表示 | API/持久化/物理设计 | M04/M06/M12 | `control.capability` + `control.segment=PROCESS_INPUT` 成对、各唯一 | 不新增第二 Fact/edge/SQLite 表 |
| `DFR-011` | Structural 双向/互惠、fan/list/completeness 和稳定 Fact 身份 | 符号文本契约第 7 章 | M04/M05/M08 | Structural 合法变体、fan 身份和完整性正反例 | 句式、fan 或方向变化需 Grammar/Rule 同版变更 |
| `DFR-012` | concrete OPL、precedence、SentencePlan、UTF-8 Token/Trace 和 golden | 符号文本契约 + DEV-CANVAS-05 | M08 | GATE-05-01~06、replay/digest/零部分提交 | 模板、顺序或 range 变化生成新资产版本 |
| `DFR-013` | 应用命令/查询、Revision guard、幂等、错误和事务 | 应用 API 契约 `v1.3` | M02/M03/M06/M09/M12 | API operation、Catalog/option、impact/token、error、atomic commit 映射 | 应用语义先变更，再映射传输 DTO |
| `DFR-014` | 完整画布 OpenAPI 目标契约 | `opm-local-api-v1.yaml` 后继目标 + API 第 7.2 节 | M06 + API owner | selection-aware Catalog interaction/symbol/endpoint summary、option/base Fact/allowed modifier、State/Fact union、完整 delete impact/token/mode payload、正反 contract test | DEV-CANVAS-00及P03实现只能实现冻结目标，不得改语义 |
| `DFR-015` | Revision 0.2 目标机器表示和 0.1 兼容读取 | 核心字段 + 持久化 +物理设计 | M09/M12 | Fact `modifiers[]`、旧 reader、roundtrip、immutable | 发布独立 `/0.2` Schema；不得改写 0.1 历史 Revision |
| `DFR-016` | SQLite V1、不可变 Revision、Draft Head、原子提交和恢复 | 持久化 +物理设计 + V1 DDL | M09/M12 | migration、FK、immutable trigger、故障注入 | 当前语义扩展不修改 SQLite V1 |
| `DFR-017` | `.opmp` 1.0 原生交换、版本兼容和资产 exact binding | 原生交换契约 | M02/M10/M12 | ZIP/Canonical JSON/SHA-256、1.0 reader/writer、staging、digest、未知版本阻断、回滚 | 不得宣称为 ISO 或第三方标准交换格式 |
| `DFR-018` | 分层测试、fixture、visual/E2E/性能/恢复证据与Projection摘要边界 | 测试策略；Final Production Source Chain；Stage A/Stage R Source Guard；Fault Launcher `v1.9`；Common Driver `v1.11`；Family Driver `v1.6`；Family Error Code Mapping、Controlled Invocation、Common Precondition与API Exchange/Artifact Index Closure；活动Manifest/Attempt/Profile/Digest/Runner Source Set；Recovery Execution与Projection Digest Closure | QA + Runtime + Architecture | E2E最终source唯一为`9048bb3... -> C -> S -> A -> R`，O..A=`25=15 M+10 A`、R=`33=31 M+2 A`、O..R=`52=40 M+12 A`；A保持Fault lifecycle与Browser proof并闭合release discovery和七路径source guard；R先完成API/Runtime `5 M`与Final Runner source guard，再以Context `0.1`展开194/388、按driver_id dispatch并构造CaseExecution；RUN_SETUP identity、attached Page setup baseline、DIRECT/REQUEST_MUTATION一次性同源client、封闭receipt、API Exchange/Artifact Index与production bridge边界保持不变；Source Set为`0.2/24`且相对A为`11/13`，Service及Source Set外测试不得进入Source Set，Runtime JAR从R重建；FAULT_2A绑定A，最终六方join绑定R | Context/dispatch/client/bridge、Lifecycle签名/owner、Browser proof、Family/Common步骤/API/error/SETUP identity/transaction/reopen、Fault/Source chain、A/R allowlist、Source Set/Runtime JAR/Report版本、commit/patch SHA或identity变化必须升级对应规格，禁止重解释历史SHA |
| `DFR-019` | 工具链 release、enablement、rollback 和 6/12 smoke | DEV-CANVAS-06规格/checklist + Final Production Source Chain + Stage A Lifecycle + Common 02B/03C/输入重建 + Common编排Source Set闭包 + Common/External origin + 统一Source/Quarantine Marker + Manifest v02集成Source + Unified External Store职责子集 + Bootstrap Build Closure + Manifest v02/Common Driver/Runner/Fault Launcher + Versioned Handoff/Fixed Postverify + Recovery runner | Release + QA | GATE-06-01~06 READY算法；Visual `378/756`；E2E `194/388=137 PASS+57 BLOCKED`；旧`17=14 M+3 A`只作为`9048bb3...` origin；最终source按C/S/A/R连续链绑定R并完成六方join；external统一输入新进程Verifier；Manifest staging/installed双Verifier；三元组READY ref；Node 22/Bootstrap closure；Recovery `28/56` | production gate默认关闭；禁止独立9项/8项/旧17项或A冒充最终source、Source Set外编排helper、source内installed root、untracked例外、status过滤/ignore、root包含、旧CLI/path override、quarantine越权、直接Producer或fallback |
| `DFR-020` | 正式索引、handoff、开发门和冻结后变更 | 本文 + `docs/README.md` | Architecture | blocked/conflict/status 计数为 0 | 任一冻结输入变化先关闭开发门再评审 |
| `DFR-021` | Visual Golden Authoring、Common materialization、审批与不可变版本 | Golden Authoring `v1.4` + Visual Common Materialization `v1.10` + Common Visual Fixture`0.1` + 活动Adapter Request`0.2`/Adapter Test Input Bundle`0.1`/其余三份adapter`0.1` + Clone Result/Runtime Ready两份`0.1` Schema + Environment `0.2` + 02B/03C/03B/04/05规格 | QA + Release + Runtime | 8个完整Visual fixture、32个E2E asset、Common Setup Plan、唯一空Text Artifact与`text_traces=[]`、固定`1/1/0`计数、五类index逐列映射、8类UI step/exact数组、exact Java/Profile受控preflight、LOCAL_RUNTIME_JAR source join、derived JDK/Planner env、fresh 5/44/1242/72/144测试输入原子闭包、静态ESM/144次callback、四种launch mode、受控Clone CLI、动态loopback端口/READY/关闭、唯一Java exit owner、独立one-shot fault port、8 base/72 capture/144 clone、normalized Projection、唯一Node JCS owner与Node/Java parity、`srgb -> sRGB IEC61966-2.1`、candidate/approval/publish exact join | 历史Request`0.1`、旧fixture/Catalog`0.1.0`/Plan和历史43-file Common source布局不可作为活动输入；测试Builder未符合Runtime-JDK修正并通过验收前不得手工执行8/144；03B等待03C checklist；设计冻结不得提升production Gate |
| `DFR-022` | Release-only Golden Fixture Materializer | Fixture Materializer设计`v1.5` + Verifier Catalog `v1.1` + 03A实现规格 | Runtime + QA + Release | 130 exact archive fixture、non-web guard、Check 8接纳点、stable projection、Report pipeline、pending attestation、唯一四阶段cleanup/quarantine、semantic verifier `63=57+6`、稳定`GFMV_*`/优先级、并发与性能 | 禁止公共API/生产装配；pre-acceptance零Report；pending verifier不持久化且不替代完整verifier；不得伪造identity |

### 4.2 `BLOCKED`

无。

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
AND design_responsibility_count == 32
AND frozen_included_count == 22
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
design_responsibility_count=32
frozen_included_count=22
frozen_deferred_count=10
blocked_count=0
unresolved_design_status_count=0
cross_document_conflict_count=0
development_gate=READY_FOR_DEVELOPMENT
```

2026-07-31 复核记录一：原生交换契约第 1 章曾保留“物理格式未冻结”的早期表述，与架构 ARC-008、物理数据设计第 10 章及该契约第 16.2 节冲突；冲突存续期间不得引用上述 `cross_document_conflict_count=0`。本次按 `specs/opm-design-conflict-remediation-and-conformance-refresh-task-spec.md` 删除开放选型表述、冻结首发 1.0/reader 1.0，并重新核对当时 30 项责任后恢复为 `0`。

2026-07-31 复核记录二：新增独立 Golden Authoring `DFR-021`，冻结无 PNG Capture Plan、固定 author 环境、Applicant/Approver 分离、INITIAL/SUPERSEDE 不可变版本和 Visual Manifest approved evidence 守卫；同步 DEV-CANVAS-06、测试策略与索引后，当前 31 项责任无开放状态或跨文档冲突。三类新 Schema/runner、approved golden 和 Visual Manifest 0.2 仍是实现缺口，不改变设计冻结结论。

2026-07-31 复核记录三：新增 release-only Golden Fixture Materializer `DFR-022`，冻结 130 个 exact Evidence Bundle `MS-REV-001/0.2` ref、确定性 Project/原样 Model-Revision 身份、non-web Runtime guard、空 storage、SQLite V1 seed、attempt clone 隔离、Materialization Report、Approval Record 0.2 集合覆盖和 Authoring Report 0.2 exact 引用。同步 Golden Authoring、DEV-CANVAS-06、测试策略和索引后，当前 32 项责任无开放状态或跨文档冲突；实现与真实报告仍缺失。

2026-08-01 复核记录四：Materialization Report `0.1` 强制 `fixture_identity`，而旧规格要求任一单项 preflight 失败写 BLOCKED Report，导致 Bundle/Archive/Fixture 尚未可信时无法构造真实证据。本次以独立 bugfix Spec 把 Check 8 PASSED 后冻结为唯一 reportable invocation 接纳点：Check 1~8 失败为 pre-acceptance 零 storage/report，Check 9 以后失败使用真实 fixture identity 写 BLOCKED Report，report-out 物理交付失败固定为 `GFM_REPORT_WRITE_FAILED/4` 和零最终 Report。Materializer 设计升为 v1.1；重新核对后责任仍为 `32=22+10`，开放状态和跨文档冲突均为 0。

2026-08-01 复核记录五：对 Materializer v1.1、Golden Authoring v1.1、DEV-CANVAS-06 和实现状态再次交叉审计，发现确定性/per-run evidence、Report engine 自失败、cleanup/quarantine、semantic verifier、并发停止、Approval/Authoring/Visual Manifest 0.2 producer 及 `20+10/22+10` 状态存在七类冲突。本次把两份主设计升为 `v1.2`，冻结 stable projection、content/engine/write 失败互斥、Quarantine Marker、唯一 verifier、candidate report -> Approval -> Publisher exact join 和 Visual Manifest 八字段；新增 03B/04/05 直接开发 spec/checklist，并同步测试策略、执行包、DEV-CANVAS-06、需求矩阵和索引。复核通过后责任仍为 `32=22+10`，`blocked/unresolved/cross_document_conflict` 均为 `0`；这只恢复设计开发门，不提升任何实现或发布状态。

2026-08-01 复核记录六：唯一 semantic verifier 已有检查范围和 `0/2/3/4`，但缺少受控 factory、稳定 verifier 错误目录、首错优先级、single/full-root 边界和 Report/root 可执行正反例；“额外项返回 3”还混淆了非法证据与合法不可消费状态。本次把 Materializer 升为 `v1.3`，新增 Verifier Catalog `v1.0`，冻结 57 个 case、`GFMV_*`、单变量变异、三种枚举顺序和前后 tree digest；额外/未知/unsafe 固定为 `2`，合法 BLOCKED/缺失/quarantine 固定为 `3`。该闭包仍属于 `DFR-022`，责任保持 `32=22+10`，`blocked/unresolved/cross_document_conflict` 均为 `0`；实现、真实 release 和 ISO 状态未提升。

2026-08-03 复核记录七：历史 Visual/E2E 输入实现规格仍授权合并 `0.1` builder，与生产 Visual Manifest `0.2` 目标冲突；E2E 版本和受控/生产 bundle 隔离也未唯一冻结。本次新增 Visual/E2E 输入修正规格，固定独立 builder、Visual `0.2/0.2.0`、E2E `0.1/0.1.0`、approved Report/Approval/Environment/Plan/130 Report/database transitive exact join，以及 `CONTROLLED_TEST/PRODUCTION_HANDOFF` 根、身份和禁止互用；旧规格降级为 `HISTORICAL/SUPERSEDED`。该修正归入 `DFR-018/019/021`，责任仍为 `32=22+10`，重新核对后 `blocked/unresolved/cross_document_conflict` 均为 `0`；builder、真实 Manifest/Report、Gate、Candidate、Activation 和 ISO 状态未提升。

2026-08-03 复核记录八：继续检查发现三个执行级缺口：E2E `0.1` 缺完整CLI/controlled archive与fixture布局/ref映射/单事务零输出；Materializer完整verifier与cleanup移动顺序形成循环；Recovery缺factory/template raw ref/fault hook/强停proof/artifact格式。本次新增E2E builder实现规格、Recovery Execution设计与runner规格，并把Materializer升为`v1.5`、Verifier Catalog升为`v1.1`，冻结`pending预验证 -> 原子移动residual -> 原子写marker -> 完整selected verifier`唯一顺序和`63=57+6`受控case。该闭包归入`DFR-018/019/022`，不新增责任项；重新核对后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict`均为`0`。设计冻结不表示builder、63/63、Recovery 28/56、Gate、Candidate、Activation、Capability或ISO证据已经完成。

2026-08-04 复核记录九：Recovery Execution `v1.0`虽然冻结了factory/fault/launcher流程，但没有两份template完整bytes、四条command payload、request digest算法、七类结果digest固定键和Gate 34项闭包，runner规格还授权实现阶段重新author template。本次以独立bugfix Spec新增两份不可变`0.1.0` JSON，将Execution升为`v1.1`，冻结RFC 8785 JCS request digest、规范化结果投影、deterministic ID port、raw/payload/fixture SHA和runner只读消费边界；同步后`DFR-018/019`无冲突，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict`均为`0`。template输入冻结不表示factory、runner、28/56、Recovery READY、Gate、Candidate、Activation、Capability或ISO证据已经完成。

2026-08-04 复核记录十：E2E Manifest `0.1` builder/verifier已经实现并完成定向`22/22`，但原正式入口仍将其与未实现Runner合并描述，且`194/388`执行缺少process/browser/storage隔离、Common/Family物化、raw artifact、Report可报告边界、失败优先级和只读verifier的直接开发规格。本次新增E2E Runner设计闭环bugfix及implementation spec/checklist，将测试策略升为`v1.3`，冻结self-contained Report transaction、真实identity边界和production/controlled守卫，E2E Runner子包达到`FROZEN_FOR_IMPLEMENTATION`。全局交叉复核同时确认`DFR-021`仍有两个未冻结输入：Visual Common Fixture Runtime Materialization没有唯一映射，且Capture Plan的`srgb`与Golden Environment的`sRGB IEC61966-2.1`没有canonical映射和比较算法。因此当前责任为`32=21 FROZEN_INCLUDED + 10 FROZEN_DEFERRED + 1 BLOCKED`，`unresolved=1`、`cross_document_conflict=1`，全局开发门关闭。局部Runner冻结不表示Runner已实现、production Manifest/Report已生成、194/388已执行或Gate/Capability/ISO状态提升。

2026-08-04 复核记录十一：以独立bugfix规格和Visual Common Materialization `v1.0`关闭`DFR-021`两个阻塞。Common Fixture新增`0.1/0.1.0`完整契约，唯一物化路径固定为exact Runtime JAR的release-only non-web SQLite V1；8个subject的Project/Model/Revision、元素/State/Fact、layout/index、UI setup、focus、normalized Projection、8个immutable base和`72*2=144`个fresh clone均已冻结。Plan raw `srgb`与唯一Chromium参数只允许映射到Environment canonical `sRGB IEC61966-2.1`，禁止trim/case/alias。新增02B/03C implementation spec/checklist，03B在两者通过前保持`BLOCKED_BY_DEPENDENCY`，旧fixture/Catalog和`GOLDEN-CANVAS06-20260803-001`保持不可变历史输入。交叉复核后恢复`32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。这不表示02B/03C/03B已实现、production 130项或8/144已执行、PNG/candidate/approved/Report已生成、Gate/Capability/ISO状态提升。

2026-08-04 复核记录十二：在02B实现前置审计中确认，仓库只有Planner等脚本的局部`jcs()`和Java `Rfc8785JsonCanonicalizer`，不存在02B Builder/Verifier/Planner可共同导入的共享Node owner，且缺少Node生成digest与Java 03C复算的跨Runtime parity输入。本次以独立bugfix规格将Visual Common Materialization升为`v1.1`，冻结唯一Node模块`scripts/canvas06-rfc8785.mjs`及`canonicalizeJcs/sha256Jcs`导出、safe integer/有效Unicode值域、RFC 8785 UTF-16 key排序与拒绝边界、10项exact共用向量`tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`和Java继续复用既有canonicalizer的责任。历史`v1.0`记录保持不变，活动入口统一指向`v1.1`。交叉复核后责任仍为`32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；共享模块、向量、02B/03C/03B、production evidence、Gate、Capability和ISO状态均未提升。

2026-08-04 复核记录十三：Recovery Execution `v1.1`已冻结template与runner协议，但Factory返回仍使用开放描述，缺Attempt Materialization/Tree Descriptor机器形状、helper JAR身份、source mirror、Report普通ref映射、完整SQLite表集合/逐列映射、原子提交与只读首错。此次以独立bugfix规格新增两份`0.1` Schema，将Execution升为`v1.2`，冻结28 case到四base scenario、独立`services/recovery-test-tools`、固定JAR Manifest/source commit、21表精确集合、Handoff binding owner、Node/helper单写边界、fsync/no-replace/residual和verifier顺序；既有Manifest/Gate Fixture/Report三份`0.1` Schema及两份template bytes不变。`RECOVERY-IMPL-01`因此达到`DESIGN_READY/IMPLEMENTATION_NOT_STARTED`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。这不表示helper/factory/runner已实现、28/56已执行、Recovery READY、Candidate、Activation、Capability或ISO状态提升。

2026-08-04 复核记录十四：E2E Runner规格要求11类attempt JSON递归`additionalProperties=false`，但仓库此前只有Manifest/Report Schema和字段摘要，Materializer、launcher、collector与verifier仍可自行发明中间机器格式。本次以独立bugfix规格新增E2E Attempt Artifact执行设计`v1.0`和union Schema `0.1`，冻结filename/schema identity、三类fault映射、Family/Common materialization、Runtime/Browser/Network/Console/Transaction/Reopen/API、10个Index必需kind、JCS/SHA、Report投影与不可报告失败边界；11类root及反例并入Visual/E2E Schema定向验证并达到`12/12`。该闭包归入`DFR-018/019`，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。E2E Runner仍为局部基础层`IN_PROGRESS`，artifact producer/verifier、controlled/production 194/388、READY Report、Gate、Candidate、Activation、Capability和ISO状态均未提升。

2026-08-04 复核记录十五：Recovery Manifest `0.1`的`expected_reopen`允许任意对象，且HTTP设计要求比较raw body与JCS bytes，却未冻结Controller前捕获、严格解析、replay和零执行边界。本次以独立bugfix规格将Recovery Execution升为`v1.3`，保留历史Manifest `0.1`，新增活动Manifest `0.2`、Reopen Catalog `0.1.0`及Schema、HTTP Request Artifact union Schema，冻结三个profile、28项exact join、raw/payload/profile SHA、test-only eager filter/body advice与HTTP 422零Controller/Service/repository调用。两个P1因此关闭。交叉复核同时确认Recovery snapshot仍要求对含`double`布局的Projection计算JCS摘要，而共享Node/Java owner仅接受safe integer并拒绝浮点；`DFR-018`转为唯一`BLOCKED`，当前责任为`32=21 FROZEN_INCLUDED + 10 FROZEN_DEFERRED + 1 BLOCKED`，`blocked/unresolved/cross_document_conflict=1`，全局开发门为`BLOCKED_BY_DESIGN`。这不表示Runner已实现、28/56已执行、Recovery READY、Candidate、Activation、Capability或ISO状态提升。

2026-08-04 复核记录十六：以独立bugfix规格和Projection Digest Closure设计`v1.0/0.1`关闭`DFR-018`。新增封闭preimage Schema和parity vector Catalog Schema，layout四个有限binary64唯一编码为IEEE-754 raw bits的8-byte big-endian 16位小写hex tag，safe-integer JCS owner保持不变；4个正向量覆盖空Projection、正负零、subnormal、max finite和数组顺序，9个负向量冻结非有限数、shape、数值域和Unicode错误，Catalog payload/raw SHA闭合。Recovery Execution升为`v1.4`，E2E Attempt Artifact设计升为`v1.1`，两者的正式Projection摘要绑定同一版本；Recovery template既有scenario projection digest保持独立且bytes不变。交叉复核后恢复`32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`。这不表示Projection normalizer、Recovery/E2E runner、28/56、194/388、READY Report、Gate、Candidate、Activation、Capability、production release或ISO状态提升。

2026-08-07 复核记录十七：按`02B -> Recovery Launch -> E2E Java/Source Identity`顺序完成执行契约设计修正。Visual Common Materialization升为`v1.2`，冻结唯一空`text_artifact`、版本化JCS摘要、显式`text_traces=[]`及SQLite/Verifier `1/1/0`计数；Recovery Execution升为`v1.5`，新增Launch Request/Proof `0.1` Schema，冻结32-byte challenge、四阶段proof、single-writer原子发布和首错；E2E Attempt Artifact升为`v1.2`，历史Report `0.1`保持只读，活动Report升为`0.2`并新增Java executable mirror/ref和23项Runner Source Set `0.1`。Recovery Schema正反例`17/17`、Visual/E2E Schema正反例`15/15`通过。该修正归入`DFR-018/019/021`，不新增责任项；复核后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。02B/03C、Recovery 28/56、E2E 194/388、READY Report、Gate、Candidate、Activation、Capability、production和ISO状态均未提升。

2026-08-07 复核记录十八：继续审计02B直接开发输入，确认`index_seed`此前只有五个数组名和数量、UI setup只有步骤简写、Catalog source ref没有self-contained source owner；新完整fixture/source bytes若继续复用历史`catalog_version=0.1.0`还会违反同版本不可变规则。本次以独立bugfix Spec将Visual Common Materialization升为`v1.3`，新增Common Visual Fixture`0.1`机器Schema，冻结五类entry字段/排序/固定ID时间状态/null及Revision到SQLite V1逐列映射、8类step union与每subject exact JSON、实际generator/factory两份source mirror和只读verifier边界；Catalog机器Schema仍为`0.1`，历史`0.1.0`不可变，活动版本固定`0.2.0`。测试策略与执行包升为`v1.10`。该修正归入`DFR-018/019/021`，不新增责任；复核后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。Schema存在不表示02B validator/fixture/mirror/producer/verifier、03C/03B、base/clone、Report、Gate、Candidate、Activation、Capability、production或ISO状态提升。

2026-08-07 复核记录十九：继续审计活动Catalog `0.2.0`的机器ref，确认Schema强制携带16个E2E case，但Visual Common `v1.3`的02B输出根只包含Catalog、8个Visual和两份source mirror；`e2e_cases[].base_fixture_ref/input_ref`无法在受控root内解析，而verifier又禁止外部checkout。本次选择唯一方案“E2E assets纳入输出布局”，将Visual Common升为`v1.4`，冻结`43=1 Catalog+8 Visual+32 E2E+2 source mirror`、同一静态factory生成算法、24项factory ref一致性、全树verifier和零输出事务；E2E Manifest只接受已验证活动43文件root并逐byte复制完整树到`inputs/common/`。既有E2E Manifest `22/22`降为旧布局历史快照，当前实现为`CONTRACT_UPDATE_REQUIRED`。测试策略和开发执行包升为`v1.11`。该修正归入`DFR-018/019/021`，不新增责任；复核后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。这不表示02B、E2E Manifest新适配、03C/03B、Manifest/Report、Gate、Candidate、Activation、Capability、production或ISO状态提升。

2026-08-17 复核记录二十：继续审计Family Materializer直接开发输入，确认`MS-REV-001/0.2`和E2E Manifest case均不含`project_id`，而旧Runner/Artifact文档要求保留“fixture原Project”并禁止业务ID派生；Golden Materializer的`project.golden.fixture.<sha256>`只属于Authoring隔离库，不能填补该来源。另确认旧Artifact设计只禁止路径覆盖ordinal，未冻结下游producer必须从Fault Plan读取。本次以独立bugfix Spec新增Family Fixture Identity Catalog Schema `0.1`及活动`0.1.0`两项不可变输入，冻结Evidence Bundle -> Manifest唯一raw ref、178个Family base ref去重为2、Project只读Catalog、Model/Context/base Revision/sequence与fixture deep join、fixture可选parent字段缺失到Catalog显式`null`的唯一归一、`base_revision=fixture.revision_id`、Golden/Recovery/路径/SHA派生禁令及零SQLite边界；Artifact设计升为`v1.3`，Fault Plan成为attempt ordinal唯一机器来源。测试策略与开发执行包升为`v1.12`。该修正归入`DFR-018/019`，不新增责任；复核后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。Catalog尚未进入clean Handoff/Evidence Bundle/Manifest，Builder为`CONTRACT_UPDATE_REQUIRED`，Family Materializer切片为`BLOCKED_BY_DEPENDENCY`；这不表示Runner、194/388、READY Report、Gate、Candidate、Activation、Capability、production或ISO状态提升。

2026-08-17 复核记录二十一：Family Identity Catalog与E2E Manifest Builder的Common/Family适配已完成定向`23/23`，但旧Clean Handoff重建规格只授权replay report并绑定历史source commit，不能授权本轮source/Handoff/Intake/production Manifest重建。本次新增Family Production Input最小重建bugfix规格，固定base commit `6d76bf6050adecfa5aa0acfb4b7b8a62d413df14`、`36=3 M+33 A`精确source delta（新增第7.1节直接读取的JCS parity vectors与Common Fixture Catalog两份固定测试资产及其raw SHA）、双clean worktree、两个外部Common/Manifest隔离root、同父安装staging、版本化release布局、历史descriptor临时alias恢复、固定Handoff原子切换/回滚，以及production Manifest预验和安装后重验。E2E Builder状态改为`IMPLEMENTED_RELEASE_INPUT_REBUILD_REQUIRED`，重建执行状态为`NOT_STARTED`；测试策略和开发执行包升为`v1.13`。该修正归入`DFR-019`，不新增责任；复核后仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。这不表示新source commit、Bundle/Handoff/Intake、production Manifest、Family Materializer、194/388 Report、Gate、Candidate、Activation、Capability、production release或ISO状态提升。

2026-08-18 复核记录二十二：首次按36项delta形成source commit `ef268177d9c9e64f6d72d64832328c790638cc70`和patch SHA `94ed125044ef3de97b09a14ef26ad55102392e0d29a7590710585d39a2661b2f`，34项定向测试通过且上游Bundle已生成，但GATE evidence generator未显式指定Node test reporter；Node 24默认spec输出与TAP计数正则不匹配，造成进程成功而`observed_cases=0`，Handoff受控阻断。修正规格将生成器加入allowlist，delta冻结为`37=4 M+33 A`；GATE-05-01唯一命令冻结为`node --test --test-reporter=tap --test-name-pattern=GATE-05-01 scripts/validate-opl-golden-manifest.test.mjs`，Report command必须逐项相等，禁止依赖未安装Node 22或默认reporter。首次retry commit `70b73e806fee0ad12616d85923695095be07c62a`暴露plural断言漂移；第二次retry commit `7f4deb0b3f5eacb1790885dc09b8905f857de909`关闭该断言后暴露三个helper绕过Intake读取历史固定Handoff的Runtime ref漂移。最终source commit `a36a7f1fd709b72e66c57e5aea634da525c9c515`保持`37=4 M+33 A`，patch SHA为`63dbbf49b99a51ccbb2bc72a9bb424df0979adaca883a40aa7c82e864391e74a`；三个helper均改为按exact Intake `handoff_ref.path`读取同一Candidate Handoff，定向`34/34`、显式TAP `16/16 MATCHED`和完整集成`5/5`通过，Bundle、READY Handoff和READY Intake已重建。production Common/Manifest、安装和固定Handoff切换仍未开始。测试策略和开发执行包为`v1.15`。该修正归入`DFR-018/019`，不新增责任；复核后仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。这不表示E2E Report、Gate-06、Candidate、Activation、Capability、production或ISO状态提升。

2026-08-18 复核记录二十三：随后production Common、E2E Manifest和版本根`clean-a36a7f1fd709`已安装，production预验通过；固定Handoff切换后，Candidate仍以`reports/**`解析10个直接Report/Schema/Asset ref，与真实handoff根固定alias bytes的length/SHA不一致，validator失败并按原子回滚恢复固定Handoff SHA `0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326`。本次新增Versioned Handoff Report Ref Closure bugfix规格，冻结base `a36a7f1fd709...`、新source `12=10 M+2 A`、唯一direct ref owner、版本根`handoff/reports/**` 12文件集合、`17+43+exact Manifest tree`布局、STAGING/INSTALLED双模式、先安装重验后仅原子替换固定Handoff JSON，以及`clean-a36a7f1fd709`永久只读边界。测试策略和开发执行包升为`v1.16`。该修正归入`DFR-018/019`，不新增责任；复核后仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`，但Family production installation/fixed Handoff activation保持`VERSIONED_HANDOFF_REPORT_REF_CLOSURE_REQUIRED`。这不表示新source、版本根、E2E Report、Gate-06、Candidate、Activation、Capability、production或ISO状态提升。

2026-08-18 复核记录二十四：隔离验证确认`loadReadyTrustChain()`的production调用点位于E2E Manifest builder和verifier，旧`12=10 M+2 A`allowlist没有授权修改这两个调用点；而在trust内部默认`INSTALLED`会违反显式mode和禁止fallback规则。修正规格将delta收敛为`14=12 M+2 A`，新增`scripts/release-canvas06-e2e-manifest-v01.mjs`与`scripts/verify-canvas06-e2e-manifest-v01.mjs`，冻结production分支逐字传`mode: 'INSTALLED'`、controlled helper逐字传`mode: 'CONTROLLED'`、版本化物理resolver仍仅`STAGING/INSTALLED`，并固定production Manifest测试按clean source HEAD派生临时版本根、复制12个report seed、重算全部direct ref且不得形成release evidence。测试策略和开发执行包升为`v1.17`。该修正归入`DFR-018/019`，不新增责任；复核后仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。source commit仍为`NOT_STARTED`，固定Handoff、`clean-a36a7f1fd709`、Capability、Candidate、Activation、production和ISO状态均未变化。

2026-08-20 复核记录二十五：Versioned Handoff source`37c5412a9c12c1b3ae06d6f7abe734804fa53c7b`已按`14=12 M+2 A`形成，patch SHA为`8680d7f1253d445207055e4eacf831278c04919f7b5574b1b0ce624d81fa4bfe`；Node`v24.19.0`定向`13/13`、READY Handoff/Intake、production Manifest、`clean-37c5412a9c12`和安装后production verifier已闭合。Fixed Handoff Postverify tool source`2f2d0f96f9f4d6f86c1866ffea5bb51a9a5d970d`已按`4=1 M+3 A`形成，真实fixed switch、READY Report和live guard已闭合，fixed SHA为`4088e449...`且无pending marker。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；E2E Report、Gate、Candidate、Activation、Capability、production和ISO状态均未提升。

2026-08-20 复核记录二十六：在安装后的真实handoff根，以Intake锁定的`releases/clean-37c5412a9c12/dev-canvas-06-intake-report.json`、活动Manifest根、Node`v24.19.0`和JDK`21.0.7`重跑`verify-canvas06-e2e-manifest-v01.mjs --require-production`通过。核验确认Family Identity Catalog在exact Evidence Bundle中唯一存在，其raw SHA与Manifest副本相等；Manifest满足`194=178+16`、`388` attempts及Family base fixture `178 -> 2`。因此 Family Materializer 的输入依赖解除，可按 E2E Runner 实现规格进入 Build；Java Materializer、Runner、Report 与 `GATE-06-03` 均未执行，且 fixed Handoff、Candidate、Activation、Capability、production 和 ISO 状态不因本次核验提升。

2026-08-20 复核记录二十七：针对“active_binding不能承载Profile文件身份、OPL/Trace/Token摘要未形成跨语言闭包”的设计缺口，新增活动 Manifest/Attempt Artifact `0.2`、Profile asset tree/raw ref、Token preimage/parity Schema与固定向量。冻结 `--manifest`/`--profile-asset-root` 的 raw 校验和 zero-output 顺序；Profile tree digest、五项具体资产 kind、UTF-8 path排序、Profile package digest与`profile.json` raw SHA分离、active binding join、Artifact Index `10+1+5`/五类`asset_kind`，以及 OPL/Trace 复用 `OplGoldenArtifactCanonicalWriter`、Token JCS preimage 与 Node/Java parity输入。Visual/E2E定向契约测试`19/19`通过。历史 `0.1` bytes 保持只读，现有 CLI、Materializer、Artifact verifier 不得隐式升级；设计输入已闭合，但活动成功路径、Token writer、Java/source/artifact producer、Runner、真实 `194/388` 和 E2E Report 尚未实现或执行。该修正不改变 `32=22+10`、`READY_FOR_DEVELOPMENT`、`GATE-06-03`、Candidate、Activation、Capability、production 或 ISO 状态。

2026-08-21 复核记录二十八：继续审计活动 Family Materializer，确认既有Profile loader允许相对根向父目录搜索、`input_ref`未冻结Materializer自校验责任、JAR ref也未限定为运行进程code source。本次将Profile/Digest closure升为`v1.1`，冻结`DIRECT_PACKAGE_ROOT`只读attempt-local `profile/assets`五文件exact set、禁止checkout/classpath/安装目录fallback并复用完整`ProfilePackageAssembler`；FAMILY/COMMON统一必填`--input`并由Materializer对Manifest case raw ref执行path/byte/length/SHA自校验；成功JAR identity只取当前进程protection-domain code source且必须等于attempt-local `inputs/build/local-runtime.jar`，test classpath不得生成成功artifact。该设计修正不新增Schema字段、不改变`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；完整Materializer/Runner/194/388/Report/Gate/Candidate/Activation/Capability/production/ISO证据仍未完成。

2026-08-21 复核记录二十九：继续确认`materializer_identity.source_sha256`只有digest形状而没有preimage语义。三种候选中，单个`.class`不能覆盖嵌套class/direct loader/assembler依赖，Java source-set缺少attempt-local mirror/ref并会引入checkout信任；本次将Profile/Digest closure升为`v1.2`，唯一冻结`source_sha256=lowerhex(SHA-256(exact code-source Runtime JAR raw bytes[0,EOF)))`且必须等于`runtime_jar_ref.sha256`。producer以同一次raw观测生成两个字段，verifier从attempt root独立复算并闭合Manifest/ref/source三方；字段/path非法为`E2E_INPUT_INVALID/2`，文件/length/SHA/join不一致为`E2E_ENVIRONMENT_MISMATCH/3`，禁止`.java`、source-set、`.class` entry、Manifest值或其他JAR fallback。无需升级Attempt Artifact`0.2` Schema；该修正不改变`32=22+10`、开发门、Gate、Candidate、Activation、Capability、production或ISO状态。

2026-08-21 复核记录三十：确认活动Materializer缺少唯一确定性seed时间来源。本次将Profile/Digest closure升为`v1.3`，冻结`source_date_epoch=parseUtcWholeSecond(manifest.generated_at)`：`Instant.parse`成功、nano为0，且原始字符串必须逐字等于`Instant.ofEpochSecond(epoch).toString()`；因此只接受大写`Z`、无小数的UTC整秒，`.000Z`、fraction、offset和归一化表示均以`E2E_INPUT_INVALID/2`在SQLite前零输出拒绝。Runner不新增时间参数，只逐byte传递Manifest；派生epoch只作为Family/Common SQLite seed时间，不新增Schema字段。历史Manifest`0.1`的`.000Z` bytes保持只读，活动`0.2` builder输出canonical整秒。该修正不改变`32=22+10`、开发门、Gate、Candidate、Activation、Capability、production或ISO状态。

2026-08-21 复核记录三十一：JDK `21.0.7`通过Spring Boot `3.5.10` `PropertiesLauncher` fork exact Runtime JAR后，实际应用类CodeSource为`jar:nested:<attempt-local local-runtime.jar raw path>/!BOOT-INF/classes/!/`，与旧设计“CodeSource可直接作为普通JAR path”冲突。本次将Profile/Digest closure升为`v1.4`，唯一接受完整`jar:nested:<expected outer raw path>/!BOOT-INF/classes/!/`逐code point匹配；匹配后才各移除一次固定prefix/suffix，以严格`file:` URI raw-path roundtrip和`Path.of`单次解码反解析outer，并同时闭合attempt-local lexical/real path。`file:`、`jar:file:`、裸`nested:`、其他entry、额外链、非canonical URI、classpath和其他JAR全部fail-closed；SHA仍只观察外层physical Runtime JAR全部raw bytes。活动Schema/CLI/SQLite/错误码不变。该冻结只允许恢复forked-JAR成功集成测试及后续Materializer实现，不表示测试、Materializer、Runner、194/388、Report、Gate、Candidate、Activation、Capability、production或ISO完成。

2026-08-24 复核记录三十二：审计Fault Plan `0.2`、Runner旧Runtime命令、Common故障fixture和产品提交链后，确认launcher配置来源、普通启动装配、nonce/challenge raw bytes、Plan raw identity、三类注入层及一次性错误语义尚未形成唯一活动口径，且历史设计仍允许移除资产副本和启动前设置storage只读。本次新增Fault Launcher设计`v1.0`及独立bugfix规格/checklist，冻结九项参数仅来自command line、零配置NOOP与partial/unknown/production fail-closed、32-byte parent nonce/challenge和HMAC、Plan single-link/raw SHA/Schema/payload/semantic/三次drift首错链、三个产品层精确hook、一次性状态机、稳定协议错误码和正反例矩阵；历史错误注入文字已明确废止。测试策略和开发执行包升为`v1.21`，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。Fault Launcher、Spring port、六份fixture错误码修正、`LocalApiService`只读错误映射、真实UI/API、`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO均未实现或执行。

2026-08-24 复核记录三十三：Fault Launcher设计`v1.0`已关闭执行语义，但未授权实现跨越的Java、Spring资源、测试、Common fixture、Catalog和Manifest文件集合，不能作为代码Build入口。本次将设计升为`v1.1`，新增独立实现规格/checklist，冻结非文档source delta为40个精确逻辑路径、EnvironmentPostProcessor唯一`spring.factories`注册与`ConfigDataEnvironmentPostProcessor.ORDER + 1`顺序、raw args与PropertySources两阶段失败传播、named MapPropertySource verified-state、同一port实例与sealed `Disabled/Active`显式Context构造链、与Recovery port/hook完全隔离的三个最小注入点、三类Common错误码、六个fixture和Catalog/Manifest精确生成路径及新不可变版本根的原子重建顺序，以及unit、Spring slice、Repository/Profile integration、forked-JAR、controlled E2E五层验收。当前HEAD与已安装clean source均不包含完整活动Manifest/Attempt`0.2`及Runner前置输入，因此`M/A`不得从脏工作树推断，受控source commit固定为`BLOCKED_BY_BASE_INTAKE`。测试策略和开发执行包升为`v1.22`，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；Fault Launcher Java Build状态为`READY_FOR_BUILD/NOT_STARTED`，最终release重建等待活动Manifest v02 producer/verifier实现且禁止v01替代，`GATE-06-03=NOT_RUN`，未生成Candidate、Activation、Capability、production或ISO证据。

2026-08-24 复核记录三十四：活动Manifest `0.2`允许Common case引用`DRIVER-COMMON`但catalog仅有三项，活动Report `0.2`继续复用历史summary并写`146/48`，且Common 16 case没有逐项初始状态、页面步骤、selector、API/error、事务、REOPEN和exact JAR/Web attempt编排，构成真实设计阻塞。本次新增Manifest v02 producer/verifier独立实现规格/checklist与Common Driver/controlled orchestration设计`v1.1`、实现规格/checklist，冻结四driver、Profile五资产、`--source-date-epoch`、`178+16`、Common `7 PASS+9 BLOCKED`、Report `137 PASS+57 BLOCKED`、八类封闭step JSON、16 case exact mapping，以及controlled bundle、Manifest final root、exact Runtime JAR、production Web、fresh attempt root和same-storage REOPEN的唯一接口。Common factory两路径改由Common Driver包唯一拥有，Fault Launcher活动allowlist由40修正为38；记录三十三的40只表示被本记录取代的历史决定。测试策略和开发执行包升为`v1.23`，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。两项新实现均为`NOT_STARTED`，Fault Launcher状态不变；`GATE-06-03=NOT_RUN`，未生成Candidate、Activation、Capability、production或ISO证据。

2026-08-24 复核记录三十五：继续逐字段核对16项Common映射时确认，`REVERSE_DRAG_NORMALIZED`必须观测`API-EDT-001 GET`后再观测`API-EDT-002 POST`，而`v1.1`的单对象`expected_api`无法封闭表达两次响应。Common Driver设计升为`v1.2`，唯一改为有序`expected_apis[]`：数组与`WAIT_API`逐项同序相等，Reverse Drag固定两项，其余15个case各一项；`PRECONDITION_API` exchange只进入独立API artifact，不占用该数组或WAIT ordinal。Manifest v02 verifier生产/受控两类CLI同时由占位参数改为完整参数集合，precondition计数由误写四种修正为五种。测试策略和开发执行包升为`v1.24`，责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；所有相关实现仍为`NOT_STARTED`或既有局部状态，Gate、Candidate、Activation、Capability、production与ISO状态不变。

2026-08-24 复核记录三十六：Common Driver包已冻结并局部实现新的`7 PASS+9 BLOCKED` factory语义，但其规格明确不负责重建32个BASE/INPUT与Catalog raw ref；现有Builder对每个case重复调用factory，Verifier还维护独立`expectedE2e`/错误映射，无法证明活动43文件root与exact factory同源。本次新增Common E2E输入重建实现规格/checklist，冻结3路径allowlist、Builder/Verifier各case单次调用缓存、`0.2.0` Catalog和32文件唯一编码、全部generator/factory/Visual/E2E raw ref复算、43文件fsync/内部verify/atomic rename、旧bytes和Runner测试/Schema放宽拒绝边界。测试策略和开发执行包升为`v1.25`；工具Build为`READY_FOR_BUILD/NOT_STARTED`，生产重建等待exact clean factory source commit/SHA，Manifest v02生产准入同步增加该依赖。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；未生成活动Common root、Manifest、194/388、Report、Gate、Candidate、Activation、Capability、production或ISO证据。

2026-08-25 复核记录三十七：Common `0.2.0` 43文件root已在`daf383df...`上完成自身验证，但固定Handoff/Intake仍锁定旧source且Handoff只含Runtime/Evidence两artifact；Manifest v02又未冻结source-root具体构建与driver路径，不能把该Common root直接解释为统一production输入。本次新增统一Source生产输入重建规格/checklist，以`daf383df6d7faad866b84fceac0a2c9111a8c926`为base、实现后新clean commit为`unified_source_commit`，冻结`16=9 M+7 A`、显式TAP、Handoff `0.2`三artifact、Web tree JCS摘要、Runtime/Web/source-Handoff-final三方join、四driver和五Profile固定路径、Common同commit/factory/binding闭包、独立只读input root、原子安装、独立Verifier及十类稳定错误。Manifest v02规格同步固定production映射和校验顺序；Common状态收口为`COMMON_ROOT_SELF_VERIFIED`，统一production链保持`BLOCKED_BY_UNIFIED_SOURCE_PRODUCTION_INPUT_REBUILD`。测试策略和开发执行包升为`v1.26`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。本轮没有实现重建工具、生成Handoff/Intake/Runtime/Web/Manifest、执行194/388或提升Gate、Candidate、Activation、Capability、production和ISO状态。

2026-08-25 复核记录三十八：统一Source规格冻结了五个Profile source路径，但Manifest v02仍把`--profile-asset-root`写成“source内exact五资产package root”；实际五资产分布在Profile package的固定子路径，该共同物理root不存在，继续实现会迫使Producer复制整个业务包或放宽目录校验。本次将Profile/Digest closure升为`v1.5`：冻结clean source五文件Source Set、source-root外fresh Profile Asset Staging Root、五项source-to-logical映射、既有逻辑root JCS tree公式、source/staging/final三方raw/tree join、行为只读与唯一首错时序；Manifest v02 Producer创建Staging target，Verifier新增显式`--source-root`并独立复算source/final，Staging修正owner限定为总体17项allowlist内7个精确路径，现有Profile helper与Schema只读。统一Source包只提供Source Set identity，不生成Staging或把它写入Handoff/版本根。测试策略和开发执行包升为`v1.27`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。本轮未实现脚本、未生成新clean commit/Handoff/Intake/Runtime/Web/Manifest、未执行194/388，Gate、Candidate、Activation、Capability、production与ISO状态不变。

2026-08-25 复核记录三十九：Node 22 clean build验收复核确认，`apps/web/tsconfig.node.json`为`composite`并包含`vite.config.ts`但未设置`noEmit`，当前仓库还跟踪其派生`vite.config.js`；旧build验收没有前后文件集合、完整Runtime bytes或应用入口执行顺序证据，存在生成未跟踪`vite.config.d.ts`和Vite双配置源风险。本次新增Bootstrap Build Closure规格/checklist，冻结同源external classic `/opm-bootstrap.js`、source/dist执行语义、Runtime固定fixture `227 bytes/c74cff...`及四字段window shape、Node `22.22.0`/npm `10.9.4`根build、node_modules/dist/target派生产物allowlist、Git零untracked和浏览器阻塞顺序。后继source owner固定`7=3 M+3 A+1 D`，只修改build配置/测试/verifier并删除tracked派生JS，生产Bootstrap/index/main/Vite TS配置/API wire只读；该子包嵌入统一Source commit，使总体allowlist由`16=9 M+7 A`升级为`22=11 M+10 A+1 D`。测试策略与开发执行包升为`v1.28`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。设计已冻结但实现/clean build未执行，统一Source build新增前置`BLOCKED_BY_BOOTSTRAP_BUILD_CLOSURE_IMPLEMENTATION`；其余Gate、Candidate、Activation、Capability、production和ISO状态不变。

2026-08-25 复核记录四十：统一Source规格只写“rename后失败保留root并标记quarantine”，未冻结sidecar路径、字段、bytes、原子写入、Producer/Verifier前置守卫或恢复权限，继续实现会由脚本自行发明marker且可能扫描/覆盖失败根。本次新增Quarantine Marker Schema `0.1`，固定`handoff/releases/quarantine/clean-<source12>.json`、八字段、完整root tree摘要、六类failure code/三类stage、UTF-8确定性bytes、固定temp的exclusive write/fsync/reread/no-replace rename/directory fsync；任一marker写入失败为`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`。统一Builder/Verifier和Manifest v02 production Producer/Verifier必须在读取目标版本根前只构造同source12 final/temp exact path，存在即fail-closed，禁止目录扫描、follow link、latest/mtime、cleanup、覆盖和同identity重建；删除/移动等待独立恢复规格及operator授权。统一Source allowlist由`22=11 M+10 A+1 D`升级为`23=11 M+11 A+1 D`，测试策略与开发执行包升为`v1.29`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。本轮未实现marker writer/guard/recovery、未生成新source commit或production根，Gate、Candidate、Activation、Capability、production与ISO状态不变。

2026-08-26 复核记录四十一：统一Source实现commit `30f7edc...`与Manifest v02实现参考commit `1e040511...`从`daf383...`分叉且互不为祖先，继续分别构建会违反同一source commit trust，整体merge又会引入统一owner漂移和删除Quarantine Marker Schema。本次新增Manifest v02集成Source重建规格/checklist，冻结`30f7edc...`唯一线性base、`1e040511...`仅作byte reference、`23+17-1=39`项composite owner、唯一重叠`package.json`、相对base的`8=3 M+5 A`、单parent commit和raw binary patch SHA公式；同一新commit必须依次重建Handoff `0.2`、READY Intake、Runtime、Web、Common和独立`handoff/releases/manifests/e2e-v02/clean-<source12>-<intake12>` release root，并完成统一输入及Manifest installed verifier。历史`clean-30f7edc5397b`只冻结为只读逻辑身份，当前checkout未证明其已安装。测试策略和开发执行包升为`v1.30`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。新集成commit、production根、Manifest、194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成。

2026-08-26 复核记录四十二：集成source commit `e598b305...`已按`8=3 M+5 A`形成，patch SHA为`68231699...`；但统一重建把`clean-e598b305a44e`安装到同一source worktree，产生exact 65个untracked文件，Producer/Verifier在`SOURCE_CLEAN_HEAD`必然拒绝。旧Manifest release parent也位于source内，触发Producer source/output root包含拒绝。本次新增外置Release Orchestrator规格/checklist，冻结`e598...`为后继base、总41项owner、`3=1 M+2 A`、clean source与external non-Git release store双物理根、四次完整source clean、唯一orchestrator CLI、external Handoff/Input/Profile Staging/Manifest布局、staging与installed两个新进程Verifier、postorder fsync/atomic rename/parent fsync、完整transaction root inventory/JCS摘要、三元组stdout及rename前后失败隔离；rename前清理只接受本进程exclusive mkdir且目录句柄身份未变的outer staging，不引入未定义owner marker。Producer/Verifier守卫保持严格，禁止ignore/path filter或直接绕过。测试策略和开发执行包升为`v1.31`；责任仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。旧内嵌root只读保留，orchestrator、external production input、Manifest、194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成。

2026-08-26 复核记录四十三：复查`e598...`实际统一Builder/Verifier后确认，旧CLI仍接收source内`--handoff-root`和`base=daf383...`，Verifier还要求final位于source-root并允许该untracked root；因此记录四十二的`3=1 M+2 A`无法实现external store正例。本次新增Unified External Release Store Mode规格/checklist，将统一helper/Builder/Verifier及测试纳入allowlist，新delta冻结为`9=7 M+2 A`，base固定`e598...`，总owner仍41项；三条production CLI只接受external mode/source/release-store/base/source，禁止handoff/out/input override；完整source porcelain必须为空，不再允许final untracked例外。统一Builder唯一拥有input transaction和post-rename Quarantine Marker写入，并以新进程运行Unified Verifier；Manifest链只读marker并继续由outer orchestrator拥有Manifest双Verifier。旧3文件包标记`SUPERSEDED/DO_NOT_IMPLEMENT`。测试策略和开发执行包升为`v1.32`；责任仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。新commit、external input、Manifest及production证据均未生成。

2026-08-26 复核记录四十四：Common Driver实现规格要求新增独立controlled orchestration脚本，但Runner Source Set `0.1/0.1.0`固定23项并排除全部未列文件，导致实际production编排无法进入Report `0.2`的source identity。本次新增Runner Source Set闭包修正规格/checklist，将Common设计升为`v1.3`并选择最小修复：不升级Source Set或Report，`prepareControlledAttempt()`及全部编排唯一收敛到第1项`release-canvas06-e2e-run.mjs`；后继实现delta冻结为`8=7 M+1 A`，四个production路径进入既有Source Set，四个测试路径保持排除。现有Common Driver、三个selector、Fact删除入口、store和factory均只读，不重复修改。测试策略和开发执行包升为`v1.33`；责任仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。编排、controlled `194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据均未实现或执行。

2026-08-26 复核记录四十五：继续交叉核对Manifest、Runner与Report source identity，确认External Store `9=7 M+2 A`与Common编排`8=7 M+1 A`若分别形成两个commit，即使线性相邻也无法同时满足`clean source HEAD = Manifest source_build.source_commit = Report runner_identity.source_commit`。本次新增Common编排与External Store集成Source闭包规格/checklist，将Common设计升为`v1.4`，冻结唯一base=`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`、两个无交集职责子集、`17=14 M+3 A` composite allowlist、single-parent final commit、raw binary patch SHA、Handoff/Intake/Manifest/source HEAD/Report/final commit六方join，以及从同一final commit重建Handoff、Intake、Runtime、Web、Common、Manifest并运行Runner的唯一顺序。独立9项/8项source包均标记`SUPERSEDED_AS_STANDALONE_SOURCE_PACKAGE`；Source Set仍为`0.1/23`，Report仍为`0.2/0.2.0`。测试策略与开发执行包升为`v1.34`；责任仍为`32=22+10`、`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。17项commit、production input、Manifest、Runner Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成或执行。

2026-08-26 复核记录四十六：复查Fault Launcher旧38路径与clean commit后，确认`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`已包含其中36项，只有controlled Playwright spec和Node preflight/test owner两项不存在；继续保留38项可修改allowlist会允许静默改写已形成的产品、Runner和测试基线。本次新增Clean Base/Controlled Playwright闭包规格/checklist，接纳`0dcaa27...`的parent/tree/epoch/raw binary patch SHA，冻结36项`path/byte_length/sha256`及有序集合摘要`69491a...b411e`，活动delta唯一为`2 A`且final commit必须single-parent于base。新增测试发现基线缺陷时必须输出`FAULT_LAUNCHER_BASELINE_DEFECT_DETECTED`并新开bugfix规格扩展allowlist。controlled Playwright固定`FLCP-D01~D10`、封闭`BLOCKED_BY_DEPENDENCY/READY_TO_RUN`机器对象、阻断exit/stderr和零执行边界，十项READY后才允许执行三case、6 attempts、12 cycles。测试策略和开发执行包升为`v1.35`，本基线升为`1.48`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。Fault Launcher 2A、真实preflight、controlled Playwright、production `194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成或执行。

2026-08-26 复核记录四十七：继续检查controlled Playwright输入和Gate时序后，确认Bundle `0.1`/Manifest `0.2`均没有不可变preflight descriptor ref，且旧`FLCP-D10-GATE`错误地要求preflight证明执行前、中、后状态。本次新增Preflight Descriptor/Gate Observation闭包规格/checklist，将Fault Launcher设计升为`v1.2`，保持Manifest `0.2/0.2.0`不变，新增Controlled Bundle `0.2`对Descriptor `0.1`的唯一raw ref，并冻结JarIT Report `0.1`、Golden Environment/browser exact join、三case/6 attempts/12 cycles、12个互异端口和执行前Gate snapshot。D10拆为preflight `D10A`与Playwright artifact `D10B`，后者固定`1 BEFORE+12 DURING+1 AFTER`共14项观测和零mutation；漂移立即停止。后继contract实现allowlist固定`12=4 M+8 A`，`0dcaa27...`只保留为36项origin base，contract clean base未接纳前2A为`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。测试策略/开发执行包升为`v1.36`，本基线升为`1.49`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。四份Schema、producer/verifier、新base、2A、controlled结果、production Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成或执行。

2026-08-26 复核记录四十八：继续核对2A实现规格与后继closure后，确认旧CLI仍使用独立preflight模式和candidate/Runtime/Web/browser override，新closure只冻结input producer/verifier，actual Manifest没有唯一定位和D05字段级join；D10B也没有evidence parent、root identity、最终布局和目录级原子提交边界。旧Preflight Report仅记录base/candidate两段身份，无法证明`origin -> contract -> 2A`。继续复核发现Playwright独立子进程无法消费父进程内存中的已验证对象，且旧spec文件名不匹配既有`**/*.release.spec.ts`。本次将Fault Launcher设计升为`v1.3`，冻结2A唯一`--run-controlled`命令、`--manifest-root + fixed basename`输入、活动Manifest v02 controlled verifier、三个Manifest case与Descriptor两次attempt/12 cycle的字段级D05、Preflight Report `0.2`的origin/contract/candidate三段身份、父到Playwright的单一raw-ref Invocation Context，以及由Manifest/Descriptor raw SHA确定的两文件controlled evidence root；spec固定命名为`fault-launcher.controlled.release.spec.ts`。D10B成功固定14项；Gate或Playwright提前失败只能记录真实DURING有序前缀并仍取得AFTER。Context与evidence文件temp/fsync/no-replace rename、目录fsync、staging verifier、postorder fsync、root rename、parent fsync和installed verifier顺序全部冻结；事务失败final不存在、staging保留不可消费。测试策略和开发执行包升为`v1.37`，本基线升为`1.50`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。本修正不创建contract、新base、2A、真实Manifest/evidence、production Report、Gate、Candidate、Activation、Capability、production或ISO证据。

2026-08-26 复核记录四十九：对候选contract commit `63851f8878dcf6da86e99d5ffa7795ac48200920`及临时2A失败现场做字段级复核，确认Gate Observation Schema对`PASS_MATCHED/FAILED`均强制12项DURING，`failure.code`仅允许Gate mutation，contract测试也未覆盖FAILED条件分支；因此该commit虽已形成`12=4 M+8 A`逻辑路径和局部定向测试，仍不能作为2A contract base。新增Contract Base Schema Conformance bugfix规格/checklist，固定`63851f8...=REJECTED_AS_2A_CONTRACT_BASE/SCHEMA_CONFORMANCE_DEFECT`，唯一后继delta为Schema与既有contract测试`2 M`；PASS必须恰12项DURING、零mutation、空failures，FAILED只允许真实`0..12`项有序前缀且failures非空，failure code固定Gate mutation或controlled Playwright execution failure，并以`3`正`7`负矩阵接纳。后继base必须single-parent于`63851f8...`且重算12项raw ref/集合摘要/patch SHA；现有临时2A工作树只保留为失败现场。测试策略和开发执行包升为`v1.38`，本基线升为`1.51`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。conformant successor、2A、controlled evidence、production Report、Gate、Candidate、Activation、Capability、production和ISO证据均未生成或执行。

2026-08-26 复核记录五十：复查`GOLDEN-AUTHORING-03C`后确认，Node adapter只有高层步骤，没有函数/CLI、callback invocation/result或normalized result字段级机器契约；`BLOCKED_FEEDBACK`也只有参数/行为，没有独立Java port、Spring guard、revision INSERT前调用点和精确allowlist。继续实现会迫使实现者自行发明03B/03C边界或复用E2E/Recovery fault语义。本次将Visual Common Materialization升为`v1.5`，新增四份`0.1/0.1.0` adapter/callback/result Schema和Adapter/Fault闭包规格/checklist，冻结唯一静态ESM函数、contract-only CLI、72个Common capture按Plan原序各attempt`1,2`共144次串行callback、三项JCS摘要、独立`VisualCommonCommitFaultPort`、完整command-line guard、一次性原子状态及`14=6 M+8 A`后继allowlist。测试策略与开发执行包升为`v1.39`，本基线升为`1.52`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。闭包包只冻结设计与机器Schema；其后工作树出现局部03C Java materializer和fault hook字节，但未按14项范围及03C checklist验收。Node adapter、8 base/144 clone、03B candidate、Gate、Activation、Capability、production和ISO证据仍未实现或执行，fault hook为`PARTIAL_NOT_ACCEPTED`。

2026-08-26 复核记录五十一：联合复算Fault Launcher D01与Git对象后确认，contract候选`63851f8...`的唯一parent为origin `0dcaa27...`，已接纳conformant base `586d6de...`的唯一parent为`63851f8...`；旧D01却要求`parent(586d6de)=0dcaa27...`，因此任何合法2A candidate都会在D01永久阻断。本次新增D01三段Source闭包bugfix规格/checklist，将Fault Launcher设计升为`v1.4`，冻结四节点`origin -> rejected contract candidate -> conformant contract base -> 2A candidate`及三段exact delta `12=4 M+8 A`、`2 M`、`2 A`。Preflight Report `0.2`不增加字段：继续记录origin、contract base `586d6de...`和future candidate，rejected `63851f8...`只从contract parent推导。`586d6de...`已复算tree/epoch/raw binary patch SHA，Node 22定向`13/13`、contract validate、diff-check和clean验证通过，状态提升为`READY_AS_2A_CONTRACT_BASE`。测试策略与开发执行包升为`v1.40`，本基线升为`1.53`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。2A仅为`DESIGN_UNBLOCKED/IMPLEMENTATION_INCOMPLETE`；当前v2 worktree只有两个未提交目标文件，没有final commit、真实D01 READY、controlled evidence、production Report、Gate、Candidate、Activation、Capability、production或ISO证据。

2026-08-26 复核记录五十二：复查03C真实调度入口后确认，`VisualCommonFixtureMaterializer.cloneAttempt()`只有进程内方法，Node adapter没有受控packaged-JAR Clone CLI；Web Runtime也没有固定启动、OS动态端口、READY与关闭机器协议。现行`LocalRuntimeApplication`对任意`release-golden-authoring` profile启动统一调用`SpringApplication.exit`，会使Common servlet Runtime立即退出；全局`GoldenFixtureMaterializationException.exitCodeFor`未覆盖`GOLDEN_COMMON_UI_SETUP_FAILED`并返回默认`2`，而局部runner另有返回`3`的switch，形成双owner。本次新增Clone/Web Runtime闭包bugfix规格/checklist及Clone Result/Runtime Ready两份`0.1/0.1.0` Schema，将Visual Common Materialization升为`v1.6`，冻结四种launch mode、Base/Clone有限任务与Web长驻、exact Java 21/outer JAR Clone CLI、双`127.0.0.1:0`端口、30秒READY、health/bootstrap四方判定、SIGTERM/10秒/SIGKILL关闭、sidecar/base复核及唯一Java exit owner；`GOLDEN_COMMON_UI_SETUP_FAILED`固定为`3`。测试策略与开发执行包升为`v1.41`，本基线升为`1.54`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。协议设计已冻结，但Node adapter状态为`BLOCKED_BY_CLONE_AND_WEB_RUNTIME_IMPLEMENTATION`；Clone CLI、Web Runtime、8 base/144 clone、03B candidate、Gate、Activation、Capability、production和ISO证据均未实现或执行。

2026-08-27 复核记录五十三：在Java Base/Clone/Web局部实现和单个`STATE_ROLES` packaged-JAR验证后继续检查Node生产入口，确认历史Adapter Request `0.1`仍没有exact Java 21 executable的绝对路径/raw identity，也没有Web Runtime五项Profile资产的受控root、raw refs和tree digest。实现者只能依赖PATH/JAVA_HOME、checkout、环境变量或目录扫描，不能安全进入144次调度。本次新增Adapter受控Java/Profile输入闭包规格/checklist及活动Request `0.2/0.2.0` Schema，历史`0.1`保持只读；冻结`java_major_version=21 + JAVA_EXECUTABLE absolute realpath/length/SHA`、exact `-version`验证、`profile_asset_root + profile/assets tree ref + 五raw refs`、既有JCS tree公式、package/binding/direct-root assembler join、Base/Clone/Web首token与Runtime Ready回连及零fallback/零输出边界。Visual Common Materialization升为`v1.7`，测试策略与开发执行包升为`v1.42`，本基线升为`1.55`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。Node adapter由设计阻塞转为`BLOCKED_BY_CONTROLLED_INPUT_IMPLEMENTATION`；144次调度、关闭矩阵、03B candidate、Gate、Activation、Capability、production和ISO证据均未实现或执行。

2026-08-27 复核记录五十四：继续检查03C受控验证入口，确认仓库虽分别存在Profile closure reader、02B 43文件Builder/Verifier、1242项Planner和Adapter Request/Observed Schema，但没有owner能在同一原子root内生成fresh Profile 5、活动Common 43、与该root exact join的1242/72 Plan、Request `0.2`及144份完整Observed Result。历史Plan、手工Request或callback动态补字段都会破坏raw ref与零fallback契约。本次新增Adapter Test Input Bundle `0.1` Schema及Builder闭包规格/checklist，将Visual Common Materialization升为`v1.8`，冻结340文件布局、Planner显式外置Common root、Profile/Common tree、Request final-path映射、144 descriptor/测试PNG/fixed callback、staging/fsync/rename/installed verifier及`19=8 M+11 A`后继allowlist。测试策略与开发执行包升为`v1.43`，本基线升为`1.56`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。Bundle Builder/Verifier尚未实现，Node adapter状态为`BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`；8/144、03B candidate、Gate、Activation、Capability、production和ISO证据均未实现或执行。

2026-08-27 复核记录五十五：在Adapter Test Input Builder/Verifier实现字节出现后复核真实链路，确认READY Handoff与Capture Plan均生成`runtime_jar_ref.kind=LOCAL_RUNTIME_JAR`，活动Request `0.2` Schema却强制`RUNTIME_JAR`，使三方逐字段exact join不可能成立；同时Builder只接收exact `--java-executable`，调用Planner时却继承父进程环境，而Planner从`JAVA_HOME/bin/jar`选择archive tool，显式JDK21与父JDK17可稳定复现失败。本次新增Runtime JAR Kind与Planner JDK环境闭包规格/checklist，保持Request `0.2`、Plan `0.1`、Bundle `0.1`、Runtime Ready `0.1`版本不变，冻结Request/Handoff/Plan source ref=`LOCAL_RUNTIME_JAR`逐字段相等、Bundle staged/Runtime Ready=`RUNTIME_JAR`且只按raw identity闭合；Builder从exact Java realpath父两级推导JDK root/bin/jar，并以恰`JAVA_HOME/PATH/LANG/LC_ALL/TZ`五键环境启动Planner，禁止继承父环境或fallback。Visual Common Materialization升为`v1.9`，测试策略与开发执行包升为`v1.44`，本基线升为`1.57`；责任仍为`32=22+10`，修正后`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。当前Builder/Verifier为`IMPLEMENTATION_PRESENT_NOT_ACCEPTED`；实现修正、完整验收、8/144、03B candidate、Gate、Activation、Capability、production和ISO证据均未完成。

2026-08-28 复核记录五十六：联合检查Common/External集成commit、Fault contract链、Manifest/Runner/Report source join后确认，`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`与旧Fault origin `0dcaa27...`同parent于`e598...`并互为sibling；继续把`9048bb3...`限制为最终17项单提交，同时从旧链追加2A/Runner，会使Manifest、source HEAD与Report source identity无法同时相等。本次新增Final Production Source Chain Closure规格/checklist，接纳`9048bb3...`为唯一origin并冻结`O -> C -> S -> A -> R`连续single-parent链：Stage C=`20=12 M+8 A`、S=`2 M`、A=`2 A`、R=`7 M`，O..R累计=`28=18 M+10 A`；FAULT_2A只绑定A，最终Handoff/Intake/Manifest/source HEAD/Report只绑定R。新origin的36项Fault baseline已逐项复算，摘要保持`69491a...b411e`；既有194-case/388-attempt Manifest raw SHA=`70dddf...1422`只证明origin input build，不证明执行。Fault Launcher设计升为`v1.5`，测试策略与开发执行包升为`v1.45`，本基线升为`1.58`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和全局`READY_FOR_DEVELOPMENT`。C/S/A/R、controlled 2A、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据均未创建或执行。

2026-08-28 复核记录五十七：继续检查Stage A受控spec到Runner owner调用后确认，A仅允许两个新增文件时，新增Playwright/Node owner无法合法补齐既有`release-canvas06-e2e-run.mjs`的controlled invocation接口，只能复制Runner语义或调用未冻结接口，形成source ownership冲突。本次将A扩为`4=2 M+2 A`：修改Runner owner及其测试，新增controlled Node owner与Playwright spec；Preflight Report `0.2`字段不变，`implementation_delta`固定四项`M/M/A/A`。Stage R仍为`7 M`并再次修改两个Runner文件以完成production行为，但必须重跑并保持A controlled回归。O..A累计改为`24=14 M+10 A`，O..R唯一28项集合与`28=18 M+10 A`保持不变。Fault Launcher设计升为`v1.6`，测试策略与开发执行包升为`v1.46`，本基线升为`1.59`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。C/S/A/R、controlled execution、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录五十八：继续检查Stage A两个Runner `M`的可执行契约后确认，现有`prepareControlledAttempt()`只冻结attempt准备，未冻结完整Runtime/Web lifecycle接口；spec仍可自行选择READY、INITIAL/REOPEN、Common client、D10B sampler/writer和cleanup顺序。因此A即使满足`M/M/A/A`也不能安全提交。本次新增Stage A Controlled Lifecycle Interface Closure规格/checklist，唯一接口固定为`runControlledLifecycleSession({invocation_context,manifest,preflight_descriptor,cycle_handlers})`；spec的12个预绑定handler只接收origin与owner构造的observation sink，precondition client嵌入sink。接口唯一负责6 attempts/12 cycles、Runtime/Web exact READY、同storage REOPEN、child/端口cleanup、BEFORE/DURING/AFTER和Gate Artifact原子写入；spec handler逐cycle拥有并关闭fresh Chromium process/context/page，父Node只终止Playwright test child，三类child不得混淆。`released_port_count`按Descriptor 12个唯一端口去重，24次cycle释放验证不重复计数；cleanup或证据不可信固定`EVIDENCE_TRANSACTION/4`。`prepareControlledAttempt()`只允许接口内部调用。接口及Runner测试完成前禁止A commit与D10B，只允许继续D01~D10A工具验证且不得伪造D01 READY。Fault Launcher升为`v1.7`、Common Driver升为`v1.5`、测试策略与开发执行包升为`v1.47`，本基线升为`1.60`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。C/S/A/R、controlled evidence、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录五十九：沿Common Driver `waitForApi()`继续追踪Stage A handler输入后确认，首轮lifecycle sink只有业务观测和precondition四个顶层成员，Runner既拿不到spec-owned Playwright Page的真实网络事件，也无法复核Browser/Context/Page关闭；因此DURING仍可能建立在HTTP旁路或Browser残留上。本次保持handler `{origin,observation_sink} -> undefined`不变，将sink冻结为六个顶层成员，新增`attachBrowserPage(page)`与`confirmBrowserClosed({browser,context,page})`。spec必须在route/navigation/API前恰attach一次，在finally关闭Page/Context/Browser后以相同对象恰confirm一次；Runner从Page取得同树对象并监听request/response/requestfailed、Page close、Context close和Browser disconnected，只有同Page有序观测、三类关闭事件与零pending全部闭合后才接纳Browser proof、封闭sink并允许DURING。duplicate/late/cross-cycle attach、错误对象、缺失/重复confirm或残留观测固定`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`，优先于业务/Gate首错，零当前DURING且零可消费Artifact。不新增handler参数/返回值、Schema、Gate字段、IPC或source path。Fault Launcher升为`v1.8`、Common Driver升为`v1.6`、测试策略与开发执行包升为`v1.48`，本基线升为`1.61`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。Stage A commit仍为`FORBIDDEN`，C/S/A/R、D10B、controlled evidence、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录六十：继续检查`confirmBrowserClosed()`监听生命周期后确认，复核记录五十九同时要求confirm后移除全部监听与拒绝confirm后新事件；若监听已经全部移除，Runner无法观测迟到Page/Context/Browser事件，Browser proof不可执行。本次保持六方法sink、handler签名、Schema、Gate字段、IPC和source allowlist不变，将唯一监听状态机冻结为`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED`。confirm初步接纳后立即冻结业务观测缓冲并移除会采样或写artifact的监听，但必须无间隙保留覆盖Page `request/response/requestfailed/close`、Context `close`和Browser `disconnected`的最小sentinel；sentinel只置位`late_event_detected`，不得追加观测或满足wait。handler settle后固定执行`VERIFY_NO_LATE_EVENT -> CLOSE_SINK_AND_PRECONDITION_CLIENT -> REMOVE_ALL_SENTINELS -> MARK_BROWSER_PROOF_COMPLETE`；confirm后迟到事件、监听空窗、sentinel提前移除或最终残留统一`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`，零当前DURING且零可消费Artifact。Fault Launcher升为`v1.9`、Common Driver升为`v1.7`、测试策略与开发执行包升为`v1.49`，本基线升为`1.62`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。Stage A commit仍为`FORBIDDEN`，C/S/A/R、D10B、controlled evidence、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录六十一：继续检查Family `178`项从Manifest到真实UI/API执行的缺口后，确认三个Family Driver仍只有占位导出，旧Runner规格也未冻结case集合、五方join、selector、BLOCKED正式API负例、CTRL SETUP/subject transaction和PASS/BLOCKED reopen证据。本次新增Family Driver执行设计`v1.0`、实现规格和checklist，冻结`33/35/110=178`、`130 PASS+48 BLOCKED`及唯一步骤；Family Driver先把Stage R由`7 M`扩为`10 M`。同时查证Runtime/Golden Replay使用`MODIFIER_COMBINATION_INVALID`作为top code，但OpenAPI `ErrorDetail.code`尚未包含；唯一修正已纳入Stage R前置API contract `3 M`：只修改OpenAPI枚举、contract正反例和实际HTTP raw-body测试，禁止修改Runtime生产逻辑或由Driver改写为`DOMAIN_REJECTED`。因此Stage R最终为`13 M`，O..R由`28=18 M+10 A`修正为`34=24 M+10 A`，O..A保持`24=14 M+10 A`；设计输入无开放项，Build必须先完成API contract子切片再进入Driver。测试策略与开发执行包保持`v1.50`，本基线保持`1.63`；C/S/A/R、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录六十二：继续沿真实`LocalApiController -> LocalApiService.edit()`命令路径检查记录六十一的错误码假设后，确认活动Golden Replay `0.2`恰有`19=15 CTRL+4 STRUCT`项要求`MODIFIER_COMBINATION_INVALID`，但Service相关校验仍经`domain()`返回`DOMAIN_REJECTED/422`；只改OpenAPI和MVC预期不能形成真实wire闭包。新增Family Error Code Mapping与Source Closure bugfix规格/checklist，将Family Driver设计升为`v1.1`，冻结15个Control及4个Structural完整case ID、Control原子Modifier对、Structural标签/完整性谓词和endpoint/owner/Fact不存在/候选过期等排除集；MVC必须使用真实Service、临时SQLite、Project/Model/Element/Fact、`API-EDT-001`候选及`API-EDT-002`命令并读取同一raw ErrorEnvelope，禁止mock/直接抛异常/批量替换`domain()`。`LocalApiService.java`加入Stage R，使API/Runtime contract由`3 M`扩为`4 M`、Stage R由`13 M`扩为`14 M`、O..R由`34=24 M+10 A`扩为`35=25 M+10 A`；O..A仍为`24=14 M+10 A`。Runner Source Set保持`0.1/23`，Service不得加入Source Set，只通过同一clean R重建Runtime JAR并更新Manifest/Attempt/Report raw identity。测试策略和开发执行包升为`v1.51`，本基线升为`1.64`；记录六十一的`3 M/13 M/34`仅保留历史，活动口径由本记录取代。设计输入重新闭合为`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；19项真实HTTP、C/S/A/R、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未创建或执行。

2026-08-28 复核记录六十三：继续沿Manifest `194 case -> 388 attempt -> Playwright child -> Driver`检查后确认，Fault Context只覆盖3/6/12，Runner尚无production Context Schema/producer、driver_id exact loader、完整CaseExecution到五参数调用对象、可执行precondition client和纳入source identity的browser bridge。新增Family Controlled Invocation Closure规格/checklist，冻结Context `0.1`、显式process-control root、Manifest原序每case attempt 1后2的388项schedule、四Driver raw/export/case集合三方join、Family/Common CaseExecution、Page attach后的五参数call_context、每attempt至多一次且只经attached Page同源fetch的client、API Exchange receipt及唯一`family.controlled.release.spec.ts` bridge。该bridge进入Source Set第20项，四Driver顺延21~24，Source Set升级为`0.2/0.2.0/24`；Stage R扩为`18=16 M+2 A`，O..R扩为`39=27 M+12 A`，O..A不变。Common Driver升为`v1.8`、Family Driver升为`v1.2`、本基线升为`1.65`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。Context/Schema bytes/bridge/24项aggregate/Stage R和真实194/388均未实现或执行。

2026-08-28 复核记录六十四：对Source Set `0.2/24`的实际producer做字段级复核后确认，`scripts/canvas06-e2e-run-stage.mjs`仍硬编码`23`、`schema_version=0.1`和`source_set_version=0.1.0`，其定向测试也固定23项；记录六十三的Stage R未授权修改这两个owner，无法执行已冻结的24项Source Set。本次将stage owner及测试加入Controlled Invocation与Final Source Chain allowlist，Stage R由`18=16 M+2 A`修正为`20=18 M+2 A`，O..R由`39=27 M+12 A`修正为`41=29 M+12 A`；Source Set相对A修正为`8 changed/new + 16 unchanged`。同时关闭父Runner无法持有Playwright child Page的进程边界：bridge只可在child内导入Source Set第1项的import-safe Runner owner，调用其Context verifier/session，并在Page attach后通过一次性resolver取得完整CaseExecution与五参数对象；禁止跨进程序列化Page或复制loader/builder。Family Driver升为`v1.3`，测试策略与开发执行包升为`v1.53`，本基线升为`1.66`；记录六十三保留历史且由本记录取代。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。Schema bytes、stage owner、Context/bridge、C/S/A/R、真实194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未实现或执行。

2026-08-29 复核记录六十五：继续沿CTRL `RUN_SETUP -> subject`检查深冻结调用对象后确认，正式`EditCommandResult`没有独立`created_fact_id`，`data.affected_ids`由当前Runtime返回候选Revision全部Element/Fact ID且不冻结创建ID位置；旧`attempt_identity`又只有物化身份，若Driver自行取首项、从页面/fixture/path推断或在调用后回填冻结对象，SETUP Fact、subject baseline和API Exchange证据无法闭合。本次将Family Driver升为`v1.4`，冻结Runner-owned `MaterializedAttemptIdentity -> RUN_SETUP -> SetupBoundAttemptIdentity`转换：CTRL只以正式CREATE_FACT response `affected_ids`与SETUP前后Revision Fact差集的唯一交集取得`setup_fact_id`，新建递归深冻结对象，并把`setup_fact_id/subject_baseline_revision/setup_create_fact_exchange_ref`与raw response、API Exchange唯一entry、post-SETUP snapshot及subject request逐字段绑定；PROC/STRUCT/Common使用必填字段的显式`null/null/materialized base`形状。业务identity错误固定`E2E_FAMILY_SETUP_IDENTITY_INVALID`，证据不可信固定`E2E_FAMILY_SETUP_EVIDENCE_INVALID -> EVIDENCE_TRANSACTION/4`。本修正不升级Context/Manifest/Attempt/Report Schema，不新增source owner，Stage R仍为`20=18 M+2 A`、O..R仍为`41=29 M+12 A`、Source Set仍为`0.2/24`。测试策略与开发执行包升为`v1.54`，本基线升为`1.67`；责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`。Context/Family session/bridge、C/S/A/R、真实194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未实现或执行。

2026-08-29 复核记录六十六：Stage A `db854055...`形成后，Stage R首个真实HTTP失败测试确认Control仍返回`DOMAIN_REJECTED`，同时发现既有`LocalApiServiceTest.java`已有四条断言把目标19类中的Control非法组合固定为旧码；旧Stage R未授权更新该测试。进一步复核统一source guard确认`RUNNER_DELTA/FINAL_RUNNER_CUMULATIVE_DELTA`仍固定20/42，新增正确测试路径后会拒绝合法R。新增Stage R Service Regression与Source Guard Closure规格/checklist，将Service测试及source guard owner/test三个M加入R：Stage R最终为`23=21 M+2 A`，O..R为`43=31 M+12 A`，O..A保持25；API/Runtime contract扩为`5 M`，source guard子切片为`2 M`。Runner Source Set保持`0.2/24`，三项新增路径均不进入Source Set。Family Driver升为`v1.6`，测试策略与开发执行包升为`v1.56`，本基线升为`1.69`；设计冲突重新归零，但R、Context/bridge、真实194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未形成。

2026-08-30 复核记录六十七：Stage R新增`family.controlled.release.spec.ts`前复跑release discovery契约，确认Stage A验收仍固定唯一Fault test和`Total: 1 test in 1 file`；Family bridge匹配同一`**/*.release.spec.ts`，但旧Stage R allowlist不允许修改该验收文件，因此合法bridge与必跑Runner测试不可同时成立。新增Stage R Release Discovery Closure规格/checklist，只把`M scripts/canvas06-e2e-release-config.test.mjs`加入R，并冻结两个测试的basename、标题、原序与`Total: 2 tests in 2 files`。Stage R最终修正为`26=24 M+2 A`；该test已在Stage A累计集合出现，因此O..R保持`45=33 M+12 A`。C/S/A、O..A、Playwright config、Context/Manifest/Attempt/Report Schema及Source Set `0.2/24`保持不变，relative A仍为`9 changed/new +15 unchanged`。本基线升为`1.70`，责任仍为`32=22+10`，设计冲突重新归零；R、真实194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未形成。

2026-08-30 复核记录六十八：实现Family sink后将真实API raw文件与attempt-local inputs/storage放入同一root，确认活动Schema只要求Index `minItems=16`，writer/verifier却错误固定恰16；同时Controlled Invocation要求单条`exchange_ref`，Schema缺少`API_EXCHANGE`和Index内的ref字段。新增Family API Exchange与Artifact Index Closure规格/checklist，保持Attempt Artifact `0.2` identity，冻结八字段exchange file、九字段Index entry、16项必需加动态API/log/failure refs以及`inputs/storage`专用运行支持边界；Stage R新增Attempt Schema、Report verifier及其测试三项，修正为`29=27 M+2 A`，O..R=`48=36 M+12 A`，Source Set保持24项但relative A改为`10/14`。本基线升为`1.71`，设计冲突重新归零；实现与真实194/388、Report、Gate、Candidate、Activation、Capability、production和ISO证据仍未形成。

2026-08-30 复核记录六十九：继续实现Common precondition时确认旧Runner把五类操作全部验证为Family candidate command并立即POST，且Common Driver把所有receipt都强制为完整HTTP response；这与两类下一条UI请求的一次性mutation不可同时成立。新增Common Precondition Machine Contract Closure规格/checklist，将Common Driver升为`v1.9`，冻结六个case/kind映射、三类`DIRECT_COMMAND`完整payload、两类`REQUEST_MUTATION`的`page.route -> route.continue({postData})`、固定source locator到attempt内actual raw ref解析、DIRECT/ARMED/final receipt、ADVANCE_HEAD事务baseline重绑定及首错。Stage R新增Common Driver一个M，最终修正为`32=30 M+2 A`，O..R=`51=39 M+12 A`；Source Set保持`0.2/24`且相对A为`11 changed/new +13 unchanged`。本基线升为`1.72`，历史`29/48/10+14`及后继`31/50`只保留为阶段记录，活动设计冲突重新归零；代码实现和真实194/388、Report、Gate、Candidate、Activation、Capability、production及ISO证据仍未形成。

2026-08-30 复核记录七十：实现Runner receipt前确认Common Precondition规格虽列出`resolved_source_refs`、`match`和final receipt名称，但未冻结字段级唯一形状，producer、Driver和Artifact writer仍会各自解释。本次在不升级Context/Manifest/Attempt/Report Schema、Stage R计数或Source Set的前提下，将Common Driver升为`v1.10`：DIRECT source refs固定为setup Projection exchange/response两个raw ref，mutation match固定五字段，final receipt固定十三字段并绑定原始/actual request ref、original value、正式response和exchange。设计冲突重新归零，本基线升为`1.73`；该内存契约闭包不构成代码通过、真实194/388、Report、Gate、Candidate、Activation、Capability、production或ISO证据。

2026-08-30 复核记录七十一：继续按真实调用时序复核发现factory在`attachBrowserPage()`前接收`setup_baseline`，但旧文字又要求该参数已含当前attached Page捕获的Projection receipt，两条件不可同时满足。本次保持factory参数名、六方法sink、Schema和source allowlist不变，将Common Driver升为`v1.11`：factory只接收`active_binding/subject_transaction_baseline_revision`两字段seed，Page attach后由现有`waitForApi(API-CTX-002/GET/200) -> waitForProjectionRefresh()`绑定首个完整同源Projection为内部resolved baseline，后续refresh不得替换。设计冲突重新归零，本基线升为`1.74`；该时序闭包不提升实现或发布证据状态。

2026-08-30 复核记录七十二：Common Driver按DIRECT/ARMED分支实现后，既有`tests/e2e/release/dev-canvas-06/drivers/common-driver.test.mjs`稳定复现旧占位receipt回归，但Stage R未授权修改该test；弱化生产校验会破坏封闭receipt。最小source修正把该既有test加入Stage R但不加入Runner Source Set，R变为`33=31 M+2 A`、O..R变为`52=40 M+12 A`，Source Set仍为`0.2/24`且相对A为`11/13`。同时补齐Final累计allowlist此前遗漏的Attempt Schema、Report verifier/test和Common Driver四项，使机器列举与计数一致。本基线升为`1.75`，设计冲突重新归零；代码回归尚待修改并复验。

当前允许按已冻结独立实现规格恢复Recovery `RECOVERY-IMPL-01`，并继续其他已解锁切片；03C Node adapter必须先使Adapter Test Input Builder/Verifier符合Runtime/JDK修正并通过完整验收，再执行8/144；每个切片仍须独立Build/Verify，不能引用全局设计准入冒充实现或release完成。

2026-09-01 复核记录七十三：`DFR-017` 的物理格式虽已冻结，但仍缺 Manifest machine Schema、摘要预像、Decimal canonical JSON 与 ZIP 安全限额，不能安全实现。新增 EXCHANGE-01 机器契约、L3 实现规格和检查清单后，实现 `.opmp` ZIP Writer/Reader、JCS Manifest digest、Decimal entry canonicalizer、路径/重复/symlink/压缩限制、required extension/版本/依赖拒绝及 `MODEL_REVISION` 只读内存适配。定向 Java `7/7`、Schema `2/2`、全局 contract validate 与 diff check 均通过；`PROJECT_FULL`/`BASELINE_ASSET` 仍仅 inspection，SQLite 写入、导入提交、静态 golden 文件、生产发布和 ISO 证据均未实现或运行。设计责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`。

2026-09-02 复核记录七十四：沿当前集中式 `OpdCanvas.vue` 的节点 kind 分支、全量 Cell 重建和名称编辑路径复核后，确认既有设计只冻结了逻辑组件树、Symbol Descriptor 和 X6 非事实源边界，未冻结节点类型的独立代码责任、注册完整性、共享 adapter、编辑器隔离及修改影响范围。本次新增 OPD 节点定义与渲染注册架构 `v1.0`，明确 Node 仅是表现层图元且不改变领域 Element/State/Feature 分类，并将 DFR-003 细化为五种节点各一 Definition、三族关系定义、类型安全 Registry、纯 RenderSpec、共享 X6 adapter 和独立 Editor；正常更新目标改为 occurrence-keyed 增量调和，禁止 Vue 类继承、每实例文件、目录扫描、未知 kind 通用矩形 fallback 和 Profile 代码执行。技术基线、页面组件、完整画布 `v1.1`、符号契约 `v1.1`、前端 handoff `v1.1`及索引已同步。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；本轮没有修改或验证 Vue/TypeScript 实现，集中式 renderer 迁移、前端回归、visual/E2E、性能、Candidate、Activation、生产发布和 ISO 证据均未形成。

2026-09-02 复核记录七十五：继续复核关系组件的代码责任后，确认记录七十四初始采用的三个 family production renderer 会把 16 Procedural、8 Control、10 Structural 的不同端点、分段、fan、marker、label 和注记重新集中到大型条件分支，不能满足 Capability 级修改隔离。本次将 OPD 节点定义与渲染注册架构升为`v1.1`，以后继修正规格唯一冻结`16 Procedural Definition + 8 Control Decorator + 10 Structural Definition`及34项ID/文件一一映射；基础 Registry按Fact `capability_id`查找26项，Control Registry按`control.capability`查找8项，family只用于目录、共享helper和测试分组。Control Decorator必须保持基础`relationId/occurrenceId/family/symbolId/primaryCellId/capture anchor`，不得创建第二Fact、Occurrence或Relation Group；旧三个family renderer仅保留为被取代的历史决定，禁止双实现和fallback。技术基线、组件交互、完整画布、符号契约、前端handoff、索引及历史规格/checklist已同步。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；本轮仅冻结设计，未重构`OpdCanvas.vue`，也未形成前端代码回归、visual/E2E、性能、Candidate、Activation、生产发布或ISO符合性证据。

2026-09-03 复核记录七十六：确认既有`UPDATE_LAYOUT`仅授权根Context内owned Object/Process occurrence，Attribute虽有独立Layout和X6节点但被Runtime与前端白名单拒绝。本次新增P03 Attribute布局编辑L3规格/checklist，将应用API、完整画布、前端handoff和OPD渲染架构分别升为`v1.1/v1.3/v1.3/v1.2`，唯一扩展目标为`FEATURE + ATTRIBUTE_NODE + feature_kind=ATTRIBUTE`。wire继续只含`occurrence_id + layout{x,y}`，OpenAPI以机器扩展固定`OBJECT_NODE/PROCESS_NODE/ATTRIBUTE_NODE`；Runtime必须复核根Context、OWNED、occurrence role/target kind和目标Element/Feature，前端白名单不得替代授权。Operation、State、Fact、Referenced和跨Context继续拒绝；提交只改变Layout坐标并保持Feature owner、语义、OPL/Trace。责任仍为`32=22+10`，冻结后`blocked/unresolved/cross_document_conflict=0`和`READY_FOR_DEVELOPMENT`；代码、E2E和构建证据须以本规格checklist实际执行结果为准，不提升DEV-CANVAS-06、Candidate、Activation、production或ISO状态。

2026-09-03 复核记录七十七：沿当前P03关系入口、目录、Store候选和X6 preview复核后，确认两个“过程/结构关系”按钮都调用无族意图的`armRelationCreation()`，Runtime目录项不能进入创建，且除Consumption和Structural外的Procedural option会直接提交；通用虚线preview也没有按Capability复用标准Symbol。新增P03关系手势与统一候选L3设计修正规格/checklist及独立实现规格/checklist，将组件交互、完整画布、OPD渲染架构、符号文本、应用API和前端handoff分别升为`v1.3/v1.4/v1.3/v1.3/v1.2/v1.4`。唯一活动设计固定单一关系入口、selection-aware 16/8/10 Catalog、`idle -> relation-armed -> dragging -> endpoint-selected -> candidate-filtering -> candidate-preview -> confirmed|cancelled`、四类X6意图、26个基础Capability统一preview/confirm和8个Control selected Fact `UPDATE_FACT`路径；preview无Fact/Occurrence/capture anchor和正式OPL/Trace。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`并恢复`READY_FOR_DEVELOPMENT`；当前产品代码仍为`NONCONFORMANT_IMPLEMENTATION`，须按后继实现规格验收后才能声称该交互已实现，不提升DEV-CANVAS-06、Candidate、Activation、production或ISO状态。

2026-09-03 复核记录七十八：P03关系手势实现验证发现三端点Procedural在首次拖线取得两个端点后尚未达到Catalog `min_endpoints`，原七阶段状态机缺少继续选择转换。以最小L3修正冻结`endpoint-selected -> relation-armed`分支：仅在已选端点数小于Runtime Catalog `min_endpoints`时使用，只决定候选查询时机，不在前端判定端点合法性；达到最小数后仍必须进入`candidate-filtering`并接受Runtime normalization。责任计数、开发准入和发布/ISO边界不变。

2026-09-03 复核记录七十九：P03关系手势后继实现已按独立L3规格完成本地功能范围验证。OpenAPI/生成DTO/Runtime闭合selection-aware `16 Procedural + 8 Control + 10 Structural`目录；Vue/X6实现单一关系入口、七阶段状态机、四类意图、26基础Capability统一preview/confirm及8 Control selected Fact同Fact更新。契约、Java定向`27/27`、Vue`76/76`、lint/typecheck/build、Workbench Playwright `12/12`和diff检查通过；`local-runtime`全量`345`项仍有既有Fault Plan/JAR Schema与数据库version/recovery marker相关`4`项失败、`1`项错误，详见实现checklist。结论仅为`IMPLEMENTED/VERIFIED_LOCAL_FEATURE_SCOPE`，不构成DEV-CANVAS-06、Candidate、Activation、production或ISO证据。

2026-09-03 复核记录八十：P03画布删除此前只有 `DELETE_CONSTRUCT` 名称、计数型 impact/token 和局部 State 表述，未区分 occurrence 与语义目标，亦未冻结依赖闭包、前端确认、Control 移除或后继 OpenAPI 原子同步边界。新增统一构造生命周期 L3 设计规格/checklist：Object/Process、Attribute/Operation、State、基础 Fact 的创建/删除矩阵，`REMOVE_OCCURRENCE/DELETE_TARGET/CASCADE` 三模式，完整且规范排序 impact 项、opaque token binding、零部分删除、Fact 删除与 Control `UPDATE_FACT` 移除，以及检查器/快捷键/X6 intent 边界均已冻结。应用 API、完整画布、组件交互、渲染架构、handoff 和索引同步至`v1.3/v1.5/v1.4/v1.4/v1.5`；现有 OpenAPI 0.2、生成 DTO、Runtime、Vue 与 E2E 不在本设计包内，后继 L3 原子实现规格才可修改。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`、`READY_FOR_DEVELOPMENT`；本轮不构成任何 Runtime、浏览器、DEV-CANVAS-06、Candidate、Activation、production 或 ISO 证据。

2026-09-03 复核记录八十一：统一构造生命周期原先要求检查器危险态删除图标，操作密度与画布选择流不匹配，且未冻结右键入口，可能诱发前端直接删 Cell 或旁路 impact/token。冻结修正为不提供独立删除图标：画布右键和 `Delete/Backspace` 统一打开 Runtime 驱动的构造操作菜单，选择 mode 后才打开 impact 确认；右键未选中构造先同步 selection，空白/未知/装饰 Cell 不劫持浏览器原生菜单，Control annotation 只提供基础 Fact 的“移除 Control”确认。完整画布、组件交互、渲染架构、handoff 与索引同步至`v1.6/v1.5/v1.5/v1.6`；OpenAPI、Runtime、Vue、X6和E2E仍为`DESIGN_FROZEN/NOT_IMPLEMENTED`。责任仍为`32=22+10`，`blocked/unresolved/cross_document_conflict=0`、`READY_FOR_DEVELOPMENT`；本轮不构成 Runtime、浏览器、发布或 ISO 证据。

2026-09-04 复核记录八十二：P03统一构造生命周期后继 L3 实现已完成本地功能范围验证。OpenAPI/生成 DTO 闭合 `REMOVE_OCCURRENCE`、`DELETE_TARGET`、`CASCADE` 与 exact impact payload；Runtime 按 committed occurrence 计算规范 impact/token，覆盖 Element、Feature、State、Fact、依赖阻断、级联、token stale 与 Control Modifier 移除；Vue/X6 仅经右键或 `Delete/Backspace` 打开 Runtime action menu 和 impact 确认。契约校验、Java Service/MVC `30/30`、Vue `77/77`、lint、typecheck、build、P03 Workbench Playwright `13/13` 与 diff 检查通过；独立 bootstrap 用例亦通过。全量 Playwright 的 DEV-CANVAS-06 三个受控发布 spec 因缺少 Runner 注入而按其自身契约拒绝，未计入本轮。结论仅为`IMPLEMENTED/VERIFIED_LOCAL_FEATURE_SCOPE`，不构成DEV-CANVAS-06、Candidate、Activation、production或ISO证据。

2026-09-05 复核记录八十三：用户将 P03 删除交互由“菜单后确认”修正为直接执行，并要求同端点多关系不可重合。新增直接删除与平行关系分轨 L3 规格/checklist；统一生命周期设计和实现规格同步为右键菜单项一次点击提交、`Delete/Backspace` 查询后按 `DELETE_TARGET -> CASCADE -> REMOVE_OCCURRENCE` 直接提交且不显示菜单，Runtime option/impact token/事务与 X6 非事实源边界保持不变。关系几何新增 Definition 后纯布局步骤：仅对无既有 route 的普通二元关系按无向端点对和稳定 identity 排序，以 `24px` lane 间距生成对称 midpoint；fan、Effect、自调用和复杂 route 不覆盖。组件交互、完整画布、渲染架构与前端 handoff 分别升为`v1.6/v1.7/v1.6/v1.7`。设计冲突为零并允许 Build；实现与验证状态以本轮 checklist 的实际结果为准，不提升 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 状态。

2026-09-05 复核记录八十四：P03 关系能力原先仍隐藏在单一“关系”入口和目录中，查找成本高；当前实现也没有 Fact route/vertices 的 `UPDATE_LAYOUT` 持久化契约，不能把自动分轨误称为可手动调线。本次新增分组关系工具栏与标准符号 L3 规格/checklist，将旧单一入口取代为三组常驻 `16 Procedural / 8 Control / 10 Structural` 工具带；Catalog 仍由 Runtime 原序和 selection-aware 结果驱动，26 个基础关系直接进入既有拖线候选，8 个 Control 只对已选 committed Procedural Fact 启用。34 个工具项按 exact `symbol_descriptor.id` 映射 ISO 基线所需 marker/shaft/state/control/fan 缩略 glyph，未知 ID 禁用且无通用箭头 fallback。较矮视口的 X6 内容最小高度固定为 `360px` 并由画布容器滚动，避免节点落入 OPL 面板后方。普通二元关系只提供稳定自动分轨；手动 vertex 编辑继续禁止，直到独立 L3 route layout 契约实现。完整画布、组件交互、符号契约和前端 handoff 分别升为`v1.8/v1.7/v1.4/v1.8`；本地实现和验证只按对应 checklist 记载，不提升 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 状态。

2026-09-05 复核记录八十五：三行全量常驻关系工具带仍占用过多画布高度且不符合高频工具操作习惯。本次将唯一活动交互修正为开发工具式单行工具栏：`Procedural / Control / Structural` 以两条竖线分隔，按稳定 Capability ID 常驻 `5/4/5` 个高频标准图标，每族组尾箭头按 Runtime 原序展开完整 `16/8/10` 目录；一次只开一组，外部点击、Escape 或选择项关闭，禁用组仍可展开查看原因。窄屏由单行内部横向滚动承载，目录浮层不参与画布高度，Runtime候选、selection-aware Control、34项exact Symbol、零提交边界和手动vertex延期均不变。完整画布、组件交互、符号契约和前端handoff分别升为`v1.9/v1.8/v1.5/v1.9`；Vue `85/85`、P03 Playwright `14/14`、lint、typecheck、build、桌面浏览器视觉与窄屏布局断言均通过。本结论仅为本地功能范围验证，不提升DEV-CANVAS-06、Candidate、Activation、production或ISO状态。

2026-09-05 复核记录八十六：独立第二排关系工具仍浪费主工具栏右侧空间，展开目录中的关系名称和数量也不符合高密度开发工具交互。本次将唯一活动布局冻结并实现为一排：`选择/平移 | 五类构造 | Procedural | Control | Structural | 缩放/适配`，整条工具栏在窄视口横向滚动。常驻与完整目录的关系项全部为纯标准图标，34项以稳定Capability ID显式映射中文名，并以“中文 / Runtime display_name”的`title/aria-label`提供双语提示；目录改为视口固定浮层，随主工具栏滚动重锚且不得被overflow裁剪。完整画布、组件交互、符号契约和前端handoff分别升为`v1.10/v1.9/v1.6/v1.10`；Runtime候选、Control selection-aware、Revision、标准符号与手动vertex延期边界不变。Node 22 根级测试`85/85`、P03 Playwright`14/14`、lint、typecheck、contract validate、build、桌面Chrome与390x844 Chromium视觉检查及diff检查均通过；本结论仅为本地功能范围验证，不提升DEV-CANVAS-06、Candidate、Activation、production或ISO状态。

2026-09-05 复核记录八十七：浏览器复核发现关系常驻按钮为`42px`、下拉符号为`52px`，明显宽于普通`32px`工具；tooltip同时使用Runtime缩写并暴露endpoint role、target kind和reason code，出现“施事 / Agent；AGENT_OBJECT”等非标准用户文案。本次冻结并实现34项Capability级中英文显示表，英文逐字节采用活动Profile名称，中文将Agent/Instrument等统一为“主体关系/手段关系”；tooltip只显示标准双语名称，禁用时第二行追加可读原因，禁止暴露机器字段。关系常驻按钮/符号固定为`34 x 32px / 32 x 18px`，下拉符号为`42 x 20px`，四列浮层最大`256px`。完整画布、组件交互、符号契约和前端handoff分别升为`v1.11/v1.10/v1.7/v1.11`。Node 22下34项组件回归、Vue`85/85`、P03 Playwright`14/14`、lint、typecheck、contract validate、build、桌面Chrome无障碍树与390x844 Chromium视觉/尺寸检查均通过；本结论仅为本地功能范围验证，不提升DEV-CANVAS-06、Candidate、Activation、production或ISO状态。

2026-09-07 复核记录八十八：P03 属性检查器原先即使关闭内容仍固定占用桌面右侧 `270px`，且属性访问只存在于该空栏内部。本次新增按需属性检查器 L2 规格/checklist：仅选择不打开 Dock，右键菜单首项与主工具栏图标显式打开，关闭保留 selection；State editing、关系/Control 候选及结构关系编辑可独立强制显示右侧任务区。关闭时 Grid 移除第三列，X6 使用容器 auto resize，打开/关闭均不产生 Revision；Delete/Backspace 直接删除和 Runtime impact/token 边界不变。组件交互和前端 handoff 分别升为`v1.11/v1.12`。Node 22 下 Vue `86/86`、P03 Playwright `14/14`、lint、typecheck、build、diff 检查和当前 `5173` Chrome 视觉复核通过；本结论仅为本地功能范围验证，不提升 DEV-CANVAS-06、Candidate、Activation、production 或 ISO 状态。

2026-09-11 复核记录八十九：P03 既有 URL 设计把活动 Draft 的实际 committed Revision 持续写入 query，混淆“跟随活动 Head”与“固定历史 Revision”，并使语义/布局提交改变地址。本次新增活动 HEAD 稳定 URL 与精确 Revision 深链 L3 设计规格/checklist，唯一冻结 HEAD canonical query 为 `?context=<context_id>`；`revision=head` 仅兼容输入并以 replace 规范化。Header 始终显示实际 committed Revision，提交只更新 Header、编辑基线和 Projection；历史 Revision、Named Snapshot、Baseline 和显式永久链接才使用只读 `?revision=<revision_id>&context=<context_id>`。精确 Revision 非法或跨 Model 时 fail-closed，Context 在目标 Revision 内规范化；viewport、选择、候选、工具和面板状态禁止进入 URL/history state。布局是否产生 Revision 保持独立。状态/字段、组件交互、模块设计和前端 handoff 分别升为 `v1.1/v1.1/v1.13/v1.1/v1.13`；旧 P0/P04 URL 条款标记为历史且被取代。责任仍为 `32=22+10`，`blocked/unresolved/cross_document_conflict=0`、`READY_FOR_DEVELOPMENT`；当前代码仍会写回精确 Revision，故本轮仅为 `DESIGN_FROZEN/IMPLEMENTATION_NOT_STARTED`，不构成前端、浏览器、DEV-CANVAS-06、Candidate、Activation、production 或 ISO 证据。

## 9. 实现与证据状态

设计状态与实现状态必须分栏。当前设计冻结结论不修改以下事实：

| 证据面 | 本任务结论 |
| --- | --- |
| Java/Vue/SQLite 代码 | P03关系gesture、统一构造生命周期、直接删除、平行关系分轨、主工具栏同排纯图标关系工具及按需属性检查器均为`IMPLEMENTED/VERIFIED_LOCAL_FEATURE_SCOPE`；Runtime impact/token/事务不变，Vue右键属性首项、Dock释放/恢复、右键一次点击和键盘无菜单直接删除、X6容器auto resize和普通二元关系稳定分轨、`5/4/5`高频直达、完整纯图标`16/8/10`下拉目录、34项标准双语tooltip、可读禁用原因及34项标准缩略glyph已通过本地自动化与浏览器视觉验证；关系手动vertex编辑仍未实现；HEAD/EXACT URL 新设计为`IMPLEMENTATION_NOT_STARTED`，当前前端仍会把 committed Revision 写回 URL；本任务不修改 SQLite |
| OpenAPI 0.2 generated client/handler | selection-aware Catalog、interaction mode、exact symbol和endpoint summary，以及完整 delete impact/mode/token payload均已生成并通过契约、Service与MVC定向验证 |
| Revision 0.2 reader/writer/roundtrip | 待 DEV-CANVAS-00/03 验收 |
| DEV-CANVAS-05 golden/Trace 机器证据 | 以对应 checklist 当前执行记录为准，本任务不重跑 |
| DEV-CANVAS-06 visual/E2E/performance/recovery/release | `9048bb3...`为origin，唯一活动链为`O -> C -> S -> A -> R`；O..A=`25=15 M+10 A`，R=`33=31 M+2 A`，O..R=`52=40 M+12 A`。A=`db854055...`保持Fault lifecycle和Browser proof；R先完成API/Runtime `5 M`与source guard，再实现Context `0.1`、194/388调度、Driver/CaseExecution、RUN_SETUP identity、DIRECT/REQUEST_MUTATION一次性同源client、API Exchange/Artifact Index和production bridge。Source Set目标为`0.2/24`且相对A为`11/13`，Service及Source Set外测试不进入Source Set，Runtime JAR从R重建。Common precondition设计已闭合，代码实现与完整调度仍在进行；C/S/A source已形成并验证，R/最终Manifest/Report与真实controlled/`194/388`均为`NOT_CREATED/NOT_RUN`。 |
| Golden Authoring Schema/runner/approved version | 三类`0.1` Schema、Capture Planner及Environment/Approval/Authoring/Visual Manifest `0.2` Schema已实现；Common Visual Fixture`0.1`、活动Adapter Request`0.2`、Adapter Test Input Bundle`0.1`、其余三份adapter`0.1`、Clone Result/Runtime Ready两份`0.1` Schema、launch/READY/关闭协议和共享JCS输入已冻结。Adapter测试Builder/Verifier实现已出现但Runtime kind与Planner JDK env未符合修正、尚未接纳；Java Base/Clone/Web已有局部实现和单例验证，Node adapter尚未消费完整Bundle/Request，8 base/144 clone为`NOT_RUN/NOT_ACCEPTED`，fault hook为`PARTIAL_NOT_ACCEPTED`；03B为`BLOCKED_BY_DEPENDENCY`，04/05及真实实体/approved version为`NOT_IMPLEMENTED/NOT_RUN` |
| Golden Fixture Materializer | `IMPLEMENTED/NOT_RELEASE_VALIDATED`；`v1.5` pending预验证、唯一四阶段quarantine、Catalog `v1.1` 63/63、受控130项串行/并发4及contract/backend已闭环；真实production 130项与release evidence尚未生成 |
| Recovery Execution | 历史五份`0.1` Schema、活动Manifest `0.2`、Reopen Catalog/API Request Artifact/Launch Request/Launch Proof `0.1` Schema已实现，Execution设计`v1.5`、Projection Digest `v1.0/0.1`、Catalog与两份`0.1.0` template输入已冻结；`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`，完整factory、fault/reachpoint、launcher、artifact、真实28/56及READY Report为`NOT_IMPLEMENTED/NOT_RUN` |
| `.opmp` 1.0 Schema/reader/writer/Revision roundtrip | `IMPLEMENTED/UNIT_VERIFIED`：EXCHANGE-01 已实现容器、inspection 与 `MODEL_REVISION` 内存适配；`PROJECT_FULL`/`BASELINE_ASSET` 提交、静态 golden、生产和外部互操作仍为`NOT_IMPLEMENTED/NOT_RUN` |
| production enablement | 默认 `DISABLED` |
| ISO 19450:2024 conformance | `EVIDENCE_MISSING/无法判断` |

## 10. 冻结后变更控制

1. 任何范围、字段、状态、Capability、规则、句式、API、Schema、浏览器、阈值、Gate 或验收变化，先把 `development_gate` 置为 `BLOCKED_BY_DESIGN`；
2. 建立新 task spec 和 Spec Mapping checklist，说明兼容、迁移、测试、回滚及受影响责任；
3. 更新责任文档、机器契约目标和本基线版本；
4. 重新计算 32 项责任和跨文档冲突；
5. 只有重新满足第 8 章算法才能恢复 `READY_FOR_DEVELOPMENT`；
6. 实现发现设计歧义时不得自行猜测，必须回到设计变更流程。

## 11. 事实与限定

### 11.1 事实

1. 需求、模块、P01-P06 页面四文档、完整画布、API、持久化、交换、字段 Schema、handoff、测试策略和开发包均已有正式承接文档；
2. Control/Structural concrete OPL、Token/Trace、golden、Golden Authoring `v1.4`、Visual Common Materialization `v1.10`、Common Visual Fixture、活动Adapter Request`0.2`、Adapter Test Input Bundle`0.1`与其余三份adapter`0.1`、Clone Result/Runtime Ready机器契约`0.1`、03C Adapter/Fault、Clone/Web Runtime、Adapter受控输入、测试Builder、Runtime-JDK及44-file inventory闭包、Golden Fixture Materializer `v1.5`、Verifier Catalog `v1.1`、历史E2E Manifest/Attempt Artifact `0.1`、活动Manifest/Attempt Artifact `0.2`与Profile/Digest closure、Manifest v02 producer/verifier及集成Source重建规格、Common Driver/controlled orchestration `v1.11`、Family Driver `v1.6`、Family Error Code Mapping及Controlled Invocation Closure、Stage A Lifecycle与Release Discovery/Source Guard、Runner Source Set `0.2/24`目标与Final Production Source Chain、Fault Launcher `v1.9`、活动Report `0.2`/Family Fixture Identity Catalog `0.1/0.1.0`、Recovery Execution `v1.5`与Launch Request/Proof `0.1`、Projection Digest `v1.0/0.1`均已冻结；
3. 当前 OpenAPI 已出现 `base_fact_capability_ref`、`AllowedModifier` 和 State/Fact command union；Revision 0.1 Schema 已出现 Fact `modifiers[]`；
4. 当前机器文件的存在不等于 generated client、handler、roundtrip、release 或 ISO 证据通过；
5. `.opmp` 首发物理格式和版本已经冻结；EXCHANGE-01 已提供 machine Schema、Reader/Writer 与 Revision 单元 roundtrip，Project/Baseline 持久化导入、静态 golden package、生产与外部互操作仍待实现；
6. `.harness/repo-profile.md` 与当前应用仓库事实不一致，本任务按边界不修改 `.harness/**`。该治理偏差不改变产品设计语义，但后续 Harness 治理任务必须修正。

### 11.2 假设/解释

“所有设计冻结”的目标解释为：当前开发基线的必需设计全部`FROZEN_INCLUDED`，未来范围全部以可审计边界`FROZEN_DEFERRED`；不要求在设计任务中提前完成延期能力的详细实现设计或生成运行证据。当前已达到该设计目标；实现和证据仍按各开发包与Gate独立判定。
2026-09-07 复核记录：用户验证表明统一候选确认门不符合常用画图工具的直接连线操作。新增 `opm-p03-direct-relation-commit-interaction-task-spec.md`，取代“唯一 option 也不得自动提交”的活动交互语义：普通关系最终端点松开后由 Runtime exact option refresh 直接创建；仅必填 duration、标签、多值方向、多个候选或失败恢复保留参数编辑；fan 默认 COMPLETE，并以 Shift 松开继续收集端点。Runtime、OpenAPI、Schema、SQLite、Profile、OPL/Trace 和 Control 路径不变。
2026-09-07 复核记录：实机复现 Tagged Structural 参数候选会阻断其他关系工具、向顶部插入反馈并强制展开右侧“创建关系”任务区。新增 `opm-p03-inline-relation-parameter-and-tool-switch-bugfix-task-spec.md`，冻结为未提交候选在工具切换时静默取消、零 Revision；必填参数使用画布内联浮层，Enter 提交、Escape/关闭取消且无创建确认按钮。组件交互与完整画布版本升为 `v1.12`；Runtime exact refresh、公共契约、SQLite、Profile、OPL/Trace 和 Control 路径不变。

2026-09-11 复核记录：新增 [P03 连线上关系名称编辑规格](../../specs/opm-p03-on-edge-relation-label-editing-task-spec.md)，将关系名称输入定位到实际 X6 路径，并冻结双击带标签结构关系后复用 Runtime UPDATE_FACT option 的 labels-only 更新。Enter 保存、Escape 取消、失焦保留、同名零提交、失败保留及过期授权拒绝；不强制展开属性栏。设计与实现已完成，本地验收见 [Checklist](../checklists/opm-p03-on-edge-relation-label-editing-checklist.md)。该记录不改变公共 API、模型持久化、URL 策略、Control 语义或发布证据状态。

2026-09-11 画布空间修正：按 [可折叠底部工作区规格](../../specs/opm-p03-collapsible-bottom-workspace-task-spec.md) 冻结底部面板展开位，原固定 240px 面板可收起为 38px 标签栏，校验状态并入同栏；只读提示改为 Header 锁形标签。首次保留展开 OPL，用户收起后同一会话的提交及版本切换保留该偏好；只替代现有导航流程对底部标签的 UI 重置，不改变 HEAD/EXACT 定位、模型写入守卫或 URL 契约。实现及本地验证见 [Checklist](../checklists/opm-p03-collapsible-bottom-workspace-checklist.md)。发布、Profile 与 ISO 证据状态不变。
