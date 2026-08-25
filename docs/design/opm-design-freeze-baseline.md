# OPM 单机建模工具全量设计冻结基线

文档版本：`1.38`

初始冻结日期：`2026-07-30`

最近复核日期：`2026-08-24`

设计冻结状态：`FROZEN`

开发准入状态：`READY_FOR_DEVELOPMENT`

## 1. 文档定位

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
| `DFR-002` | 当前开发范围和 P01-P03/完整画布交付顺序 | 开发执行包 `v1.25` | Architecture | DEV-00~09、DEV-CANVAS-00~06 单包 DoD | 禁止跨包静默扩围 |
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
| `DFR-018` | 分层测试、fixture、visual/E2E/性能/恢复证据与Projection摘要边界 | 测试策略`v1.25`；Visual Common `v1.4`；历史E2E Artifact `v1.3/0.1`、活动Manifest/Attempt `0.2`与Profile/Digest Closure `v1.4`；Common Driver `v1.2`及Common E2E输入重建规格；Fault Launcher `v1.1`及实现规格；Family Identity Catalog `0.1/0.1.0`、Report `0.2`、Runner Source Set `0.1`；Fixed Handoff Postverify Report`0.1`；Recovery Execution `v1.5`与Launch Request/Proof `0.1`；Projection Digest Closure `v1.0/0.1` | QA + Runtime + Architecture | safe-integer JCS不放宽；Common五类index/8类UI step/43文件root；Common 16 case精确动作/有序API/事务/REOPEN；新factory到32个BASE/INPUT和全部raw ref的原子重建；Family Project Catalog/178 -> 2/deep join；Profile/input/JAR direct trust；四driver与Report `137/57`；Fault配置/nonce/challenge/Plan raw identity/三个精确hook；Manifest UTC整秒；Recovery 28/56、E2E 194/388及只读verifier | Projection/source/time/index/step/numeric位置/encoding、Profile/input/JAR trust、Common映射、Fault Launcher协议、Family identity Catalog、postverify Report或E2E Report identity变化必须升级对应版本，禁止重解释历史SHA |
| `DFR-019` | 工具链 release、enablement、rollback 和 6/12 smoke | DEV-CANVAS-06规格/checklist + Common 02B/03C/输入重建 + Manifest v02/Common Driver/Runner/Fault Launcher规格 + Versioned Handoff与Fixed Postverify闭包规格 + Recovery runner规格 | Release + QA | GATE-06-01~06 READY算法；Visual `378/756`；E2E `194/388=137 PASS+57 BLOCKED`；controlled attempt exact JAR/Web/fresh root；Recovery `28/56`；Handoff direct raw ref仅指向同一不可变版本根；Fault Launcher只允许三个故障INITIAL且普通/REOPEN只装配NOOP | Candidate不等于Activation；production gate默认关闭；partial/unknown/production fault配置fail-closed；禁止v01替代v02、旧Common SHA、fixed Intake、`sameRef()`放宽和路径fallback；release/test-only materializer/fault launcher不得进入默认生产装配 |
| `DFR-020` | 正式索引、handoff、开发门和冻结后变更 | 本文 + `docs/README.md` | Architecture | blocked/conflict/status 计数为 0 | 任一冻结输入变化先关闭开发门再评审 |
| `DFR-021` | Visual Golden Authoring、Common materialization、审批与不可变版本 | Golden Authoring `v1.4` + Visual Common Materialization `v1.4` + Common Visual Fixture`0.1` + Catalog历史`0.1.0`/活动`0.2.0` + Environment `0.2` + 02B/03C/03B/04/05规格 | QA + Release + Runtime | 8个完整Visual fixture、32个E2E asset、唯一空Text Artifact与`text_traces=[]`、固定`1/1/0`计数、五类index逐列映射、8类UI step/exact数组、`43=1+8+32+2` root、24项factory ref、8 base/72 capture/144 clone、normalized Projection、唯一Node JCS owner与Node/Java parity、`srgb -> sRGB IEC61966-2.1`、candidate/approval/publish exact join | 旧fixture/Catalog`0.1.0`/Plan和旧Common source布局不可改写或作为活动输入；活动Catalog只用`0.2.0`；03B等待02B/03C；设计冻结不得提升production Gate |
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

当前允许按已冻结独立实现规格恢复Recovery `RECOVERY-IMPL-01`，并继续其他已解锁切片；每个切片仍须独立Build/Verify，不能引用全局设计准入冒充实现或release完成。

## 9. 实现与证据状态

设计状态与实现状态必须分栏。当前设计冻结结论不修改以下事实：

| 证据面 | 本任务结论 |
| --- | --- |
| Java/Vue/SQLite 代码 | 未在本任务实现或复核 |
| OpenAPI 0.2 generated client/handler | 待 DEV-CANVAS-00 验收 |
| Revision 0.2 reader/writer/roundtrip | 待 DEV-CANVAS-00/03 验收 |
| DEV-CANVAS-05 golden/Trace 机器证据 | 以对应 checklist 当前执行记录为准，本任务不重跑 |
| DEV-CANVAS-06 visual/E2E/performance/recovery/release | Versioned Handoff、历史Manifest v01与Fixed Postverify证据已形成；活动Manifest v02 producer/verifier、Common Driver `v1.2`与controlled orchestration、Common E2E输入重建的设计/实现输入已冻结。Manifest v02和输入重建工具为`NOT_STARTED`，输入生产重建为`BLOCKED_BY_EXACT_CLEAN_FACTORY`；Runner基础层为`IN_PROGRESS`，Fault Launcher Java Build为`READY_FOR_BUILD/NOT_STARTED`且受控source commit为`BLOCKED_BY_BASE_INTAKE`；真实活动E2E `194/388`、READY Report、Gate、Candidate、Activation均为`NOT_RUN` |
| Golden Authoring Schema/runner/approved version | 三类`0.1` Schema、Capture Planner及Environment/Approval/Authoring/Visual Manifest `0.2` Schema已实现；Common Visual Fixture`0.1`Schema、共享Node JCS模块/10项vector和43文件Builder/Verifier已有局部实现，但新factory语义对应的32个E2E/全部raw ref尚未经独立重建包在exact clean输入上生成和闭合；03C为`NOT_STARTED`，03B为`BLOCKED_BY_DEPENDENCY`，04/05及真实实体/approved version为`NOT_IMPLEMENTED/NOT_RUN` |
| Golden Fixture Materializer | `IMPLEMENTED/NOT_RELEASE_VALIDATED`；`v1.5` pending预验证、唯一四阶段quarantine、Catalog `v1.1` 63/63、受控130项串行/并发4及contract/backend已闭环；真实production 130项与release evidence尚未生成 |
| Recovery Execution | 历史五份`0.1` Schema、活动Manifest `0.2`、Reopen Catalog/API Request Artifact/Launch Request/Launch Proof `0.1` Schema已实现，Execution设计`v1.5`、Projection Digest `v1.0/0.1`、Catalog与两份`0.1.0` template输入已冻结；`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`，完整factory、fault/reachpoint、launcher、artifact、真实28/56及READY Report为`NOT_IMPLEMENTED/NOT_RUN` |
| `.opmp` 1.0 Schema/reader/writer/golden roundtrip | `NOT_IMPLEMENTED/NOT_RUN`；物理格式已冻结不等于实现完成 |
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
2. Control/Structural concrete OPL、Token/Trace、golden、Golden Authoring `v1.4`、Visual Common Materialization `v1.4`、Common Visual Fixture`0.1`、Catalog历史`0.1.0`/活动`0.2.0`及43文件self-contained root、Common E2E输入重建实现规格、Golden Fixture Materializer `v1.5`、Verifier Catalog `v1.1`、历史E2E Manifest/Attempt Artifact `0.1`、活动Manifest/Attempt Artifact `0.2`与Profile/Digest closure、Manifest v02 producer/verifier实现规格、Common Driver/controlled orchestration `v1.2`及实现规格、Fault Launcher `v1.1`及实现规格、活动Report `0.2`/Runner Source Set `0.1`/Family Fixture Identity Catalog `0.1/0.1.0`、Recovery Execution `v1.5`与Launch Request/Proof `0.1`、Projection Digest `v1.0/0.1`均已冻结；
3. 当前 OpenAPI 已出现 `base_fact_capability_ref`、`AllowedModifier` 和 State/Fact command union；Revision 0.1 Schema 已出现 Fact `modifiers[]`；
4. 当前机器文件的存在不等于 generated client、handler、roundtrip、release 或 ISO 证据通过；
5. `.opmp` 首发物理格式和版本已经冻结，机器 Schema、reader/writer、golden package 与 roundtrip 仍待实现；
6. `.harness/repo-profile.md` 与当前应用仓库事实不一致，本任务按边界不修改 `.harness/**`。该治理偏差不改变产品设计语义，但后续 Harness 治理任务必须修正。

### 11.2 假设/解释

“所有设计冻结”的目标解释为：当前开发基线的必需设计全部`FROZEN_INCLUDED`，未来范围全部以可审计边界`FROZEN_DEFERRED`；不要求在设计任务中提前完成延期能力的详细实现设计或生成运行证据。当前已达到该设计目标；实现和证据仍按各开发包与Gate独立判定。
