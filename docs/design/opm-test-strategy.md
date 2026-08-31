# OPM 单机建模工具测试策略

文档版本：`v1.56`

文档状态：`FROZEN`；全局设计门为`READY_FOR_DEVELOPMENT`；Recovery/E2E实现与`GATE-06-03/05`执行仍未完成，生产和ISO证据分开记录

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

Visual Common活动口径为`v1.9`：Request/Handoff/Plan的Runtime source ref统一为`LOCAL_RUNTIME_JAR`，Bundle staged ref及Runtime Ready保持`RUNTIME_JAR`并只按raw identity闭合；Adapter测试Builder必须从exact `--java-executable`推导JDK root/bin/jar，并以固定五键env启动Planner。现有Builder/Verifier实现未满足该修正前不得进入完整验收或执行`8/144`。

E2E final production source口径由Final Production Source Chain Closure、Stage A、Stage R Source Guard、Release Discovery与API Exchange/Artifact Index闭包、Family Driver和Controlled Invocation共同冻结：`9048bb3...`只作为origin，后继必须连续形成C/S/A/R；Stage为`20/2/7/29`，O..A=`25=15 M+10 A`，O..R=`48=36 M+12 A`。Fault controlled证据绑定A，最终Handoff/Intake/Manifest/source HEAD/Runner Report绑定R。

Family Driver `v1.6`冻结`178=33 PROC+35 CTRL+110 STRUCT`及UI/API/transaction/reopen；Runner-owned RUN_SETUP必须以正式CREATE_FACT response `affected_ids`与SETUP前后Revision Fact差集的唯一交集取得`setup_fact_id`，生成新的深冻结identity，并与subject baseline、API Exchange response ref和subject request逐字段绑定，禁止页面/fixture/path/SQLite顺序推断。Controlled Invocation冻结Context `0.1`、194/388 schedule、四Driver exact dispatch、完整Family/Common CaseExecution、Page attach后五参数对象、一次性同源client/API Exchange与production bridge。Stage R先以固定`5 M`闭合19项真实wire和既有Service回归，再以`2 M`更新Final Runner source guard，之后实现Context/bridge/Driver/Runner。

production bridge必须在Playwright child内导入Source Set第1项的import-safe Runner owner，调用其Context verifier与session；INITIAL在Page attach后只允许一次`resolve_invocation(page)`，REOPEN resolver固定为`null`。父Runner不得跨进程传递Page，bridge不得复制Driver loader或CaseExecution builder。

Stage A controlled lifecycle唯一接口为`runControlledLifecycleSession()`。接口拥有Runtime/Web READY、INITIAL/REOPEN、Common client factory、child cleanup及D10B sampler/writer；spec只接收origin与六方法observation sink。每cycle必须在route/navigation/API前attach真实Page，并在finally关闭Browser树后以相同对象confirm；Runner只接纳同Page网络事件、三类关闭事件和零pending证明。证明不闭合固定`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID -> EVIDENCE_TRANSACTION/4`。接口及Runner测试完成前禁止A commit和D10B。

更新时间：2026-08-29

## Task Type

- `feature`

## 1. 目标与边界

本文档冻结 OPM 单机建模工具 P0 与完整画布增量的测试层级、环境、夹具、关键场景、执行门槛和证据边界。P0 覆盖 P01-P03、Object/Process/Consumption/System Diagram、Revision、OPL、校验、本地 SQLite 与最小基线闭环；完整画布按 `DEV-CANVAS-00~06` 覆盖 State、16 类 Procedural、8 类 Control、10 类 Structural、结构化候选、符号、完整 OPL/Trace、视觉和大图性能。

测试通过不自动等同 ISO 19450:2024 符合性。只有映射到完整 Profile、Rule、Grammar、Symbol 和标准证据的专用 Conformance Suite 才能提供符合性证据。

## 2. 测试原则

1. Semantic Model 规则优先纯单元测试；
2. HTTP 参数、状态码、会话头和错误映射使用 Web/API 切片测试；
3. SQLite 方言、索引、触发器、外键和事务使用真实 SQLite，不使用 H2 替代；
4. 模块协作和原子提交使用 Spring Boot 集成测试；
5. P01-P03 主路径、图文联动、只读守卫以及完整画布主路径使用浏览器 E2E；
6. X6 Cell、DOM、viewport 和面板状态不得进入领域测试的事实输入；
7. 时间、ID、摘要、任务调度和文件位置必须可注入，避免不稳定测试；
8. 先执行定向测试，再扩大到模块、全量和打包 smoke；
9. 未执行的验证不得写成通过，旧报告不得作为当前 Revision 的证据。

## 3. 测试层级

| 层级 | 主要对象 | 最小工具 | 失败定位 | 对应开发包门槛 |
| --- | --- | --- | --- | --- |
| Schema/静态契约 | JSON Schema、OpenAPI、SQL、Profile/Rule 样例 | Ajv、Swagger Parser、SQLite CLI | 文件/路径/字段 | 必须 |
| 领域单元 | Element、State、Fact、Context、Command、Rule AST、OPL Planner | JUnit 5 | 类/规则/Case | 必须 |
| 前端单元 | store、command adapter、projection mapper、guard | Vitest | composable/store | 必须 |
| 组件 | Object/Process/State、16/8/10 relation symbol、工具链、检查器和弹层 | Vitest + DOM renderer | component/Capability | 必须 |
| Web/API 切片 | `/api/v1`、ErrorDetail、会话/Revision/幂等守卫 | Spring MVC test | operationId | 必须 |
| 持久层 | Flyway V1、repository、事务、不可变触发器 | SQLite 临时项目库 | migration/repository | 必须 |
| 模块集成 | 编辑 -> 规则 -> OPL -> Trace -> Revision -> 保存 | Spring Boot test | application use case | 必须 |
| 浏览器 E2E | P01-P03 与完整画布主路径、只读/阻断/冲突/恢复 | Playwright | page_id/scenario | 必须 |
| 安装 smoke | 单本地运行时、浏览器打开、关闭与重启 | 打包产物 + smoke script | package/runtime | 发布前必须 |
| Conformance | ISO Capability/Rule/Grammar/Symbol/evidence | 专用 suite | CAP/ISOR/atomic rule | ISO 声明前必须 |

## 4. 环境矩阵

| 环境 | 用途 | 数据 | 文件/网络 |
| --- | --- | --- | --- |
| JVM 单元 | 领域和文本纯逻辑 | 内存 fixture | 禁止真实文件/网络 |
| 前端单元/组件 | 状态与渲染 | 固定 DTO | mock 仅切断 HTTP |
| SQLite 集成 | 方言、迁移、事务 | 临时独立 `.db` | 临时资产目录 |
| Spring 集成 | 模块化单体用例 | 临时 SQLite | loopback 或进程内 |
| E2E | 真实浏览器主路径 | 每场景新项目 | loopback，仅测试目录 |
| 安装 smoke | 发布形态 | 空 install/storage/browser roots + 固定 P0 smoke fixture | loopback、单 origin、无外网依赖 |

每个测试必须使用独立项目库和资产目录。禁止复用开发者真实项目库、`~/OPM Studio` 或生产备份目录。

浏览器矩阵固定为 Playwright `1.57.0` 对应 Chromium `143.0.7499.4`、Firefox `144.0.2`、WebKit `26.0`。Chromium 运行全部发布 Gate；Firefox/WebKit 运行 P01-P03、Object/Process/State、16/8/10 候选与提交、OPL/Trace 和重开。默认浏览器不受支持时，launcher smoke 必须证明兼容性页阻断编辑、零写命令、loopback 地址可复制并可在支持浏览器重开。

## 5. 标准夹具

| Fixture | 来源 | 用途 |
| --- | --- | --- |
| `minimal-iso-revision.json` | `docs/contracts/examples` | Object/Process/State/Consumption/SD/OPL 闭环 |
| `representative-iso-profile.json` | `docs/contracts/examples` | 代表性 Capability 加载与守卫 |
| `representative-iso-rule-set.json` | `docs/contracts/examples` | Rule AST、依赖和阻断 |
| `G-OPL-001~006` | 符号/文本契约 | 句式、marker 和 Trace golden |
| `G-OPL-PROC-001~016` | 符号/文本契约，由 DEV-CANVAS-05 形成机器 fixture | 16 类 Procedural 及全部受控变体 |
| `G-OPL-CTRL-001~008` | 符号/文本契约，由 DEV-CANVAS-05 形成机器 fixture | 8 类 Control 及允许的基础关系变体 |
| `G-OPL-STRUCT-001~010` | 符号/文本契约，由 DEV-CANVAS-05 形成机器 fixture | 10 类 Structural、fan、标签和完整性 |
| `complete-canvas-perf-small` | DEV-CANVAS-06 性能 factory | 工具切换、选择、检查器反馈和四类增量 OPL mutation |
| `complete-canvas-large-opd` | DEV-CANVAS-06 测试 factory | 300/600 需求基线与 1000/2000 设计压力集 |
| `complete-canvas-large-model` | DEV-CANVAS-06 性能 factory | 10 个 OPD、10,000 semantic construct、20,000 Fact 的保存/快照/全量校验 |
| `empty-project` | 测试 factory | P01/P02 空状态 |
| `baseline-project` | 测试 factory | 不可变基线与建草稿 |
| `conflict-project` | 测试 factory | revision/idempotency 冲突 |
| `broken-asset-package` | 测试资源 | digest、缺文件和路径穿越拒绝 |

Fixture 必须由稳定 ID 和固定时钟生成。golden 更新必须经过设计/标准变更评审，禁止为通过测试无说明覆盖。

## 6. 领域与文本用例

### 6.1 命令与不变量

1. 创建 Object/Process 生成稳定 Element 和 Occurrence；
2. 创建 Consumption 时只能归一化为 Object/State -> Process；
3. 缺端点、同类非法端点和 Profile 禁止返回结构化阻断；
4. 普通 viewport 操作不创建 Command、Revision 或 OPL；
5. `SEMANTIC_IN_ZOOM` 创建 Context/Occurrence/Revision 和文本段落；
6. Snapshot/Baseline 写入返回 `READ_ONLY_REVISION`；
7. base revision 过期返回 `REVISION_CONFLICT`，不覆盖当前 Head；
8. 同幂等键同摘要返回首次结果，不同摘要返回 `IDEMPOTENCY_MISMATCH`。

### 6.2 OPL 与 Trace

1. `G-OPL-001` 字节等于 `Processing consumes Raw Material.`；
2. `G-OPL-002` 字节等于 `Processing consumes available Raw Material.`；
3. 同一 Revision 重放 artifact、sentence 和 digest 完全一致；
4. Fact -> Sentence 与 Sentence -> Fact/Occurrence 映射闭合；
5. 未知 Capability、缺 Grammar、缺模板、Trace 不全均返回 `TEXT_GENERATION_BLOCKED`；
6. 生成失败时 Semantic Model、Text、Revision 和 Operation Record 均不提交；
7. P0 未覆盖的合句/排序场景返回 unsupported，不生成伪正式 OPL。

### 6.3 State 与完整画布命令

1. `CREATE_STATE/UPDATE_STATE` 只接受合法 Object/Attribute owner，ISO Profile 对 Process State 返回稳定阻断；
2. State 使用独立 `state_id`，不得进入 `CREATE_ELEMENT`、Element collection 或 element selection；
3. Initial/Default/Final、ordinal、显式/抑制和展开/折叠按 Profile/Rule 生成 Revision、OPL 和 Trace；普通 owner 内坐标只改变 Layout；
4. State-specified endpoint 保留 owner qualification，owner mismatch 不得静默改接 Object；
5. `CREATE_FACT/UPDATE_FACT` 只接受同一 capability query、option、base revision 和 binding 的规范端点；
6. Fundamental fan 是一个 Fact、一个 junction 和 ordered branches，成员更新保持 Fact ID；
7. Control 是基础 Fact 上唯一、成对的 `control.capability/control.segment` Modifier；基础 Fact ID/Capability 不变，不创建 CONTROL Fact，Effect 输出 segment 禁止 Event/Condition；
8. `DELETE_CONSTRUCT` 只接受 `API-EDT-001` 对同一 construct、影响摘要、Revision 和 binding 返回的未过期 impact token。

Control pair 至少覆盖以下正反例：

1. 8 个 `control.capability` 值分别与允许的 Consumption/Effect 输入段/Agent/Instrument 及 State 变体组合成功；
2. `control.segment` 只能为 `PROCESS_INPUT`，X6 `e/c`、OPL、Token 和 Trace 与所选 Control Capability 一致；
3. 缺任一项、重复键、未知 Control ID、两个 Modifier capability_ref 不同、value/ref 不同、option 的 Control/base Fact Capability 与 payload 不同均阻断；
4. Result、Effect 输出段、基础 Fact 类型不匹配、Event+Condition 双组、独立 CONTROL Fact 均阻断；
5. 仅为重复 Event/Condition 而提交 `condition` 被阻断；真正独立谓词按 Profile 单独验证；
6. 创建、更新、删除 Control pair 后 roundtrip 保持基础 fact_id，Revision/OPL/Trace/digest 原子变化；失败无 partial pair；
7. SQLite V1 表/列不变，重开从 `revision_document.document_json` 恢复 pair；机器 Revision Schema 不支持时测试必须失败而不是绕过校验。

### 6.4 完整能力 OPL golden

1. `G-OPL-PROC-001~016` 对 16 个 Procedural Capability 各有正例、端点反例和全部标准要求的受控变体；
2. `G-OPL-CTRL-001~008` 对 8 个 Control Capability 展开 20 个允许基础 Fact PASS case，并覆盖 Result/Effect 输出段、pair 缺失/重复/不匹配和 Event+Condition BLOCKED case；
3. `G-OPL-STRUCT-001~010` 对 10 个 Structural Capability 穷举 Profile 允许的方向、tag/null-tag、Reciprocal、`1/2/3` fan、完整/不完整集合和 State-specified coverage key，不得只做 10 个示例；
4. 每个 fixture 同时断言规范 Fact/Endpoint、Symbol/Marker/Label Slot/Route、具体模板、纯文本、Token、Trace、Rule 和 binding digest；
5. `14.2.4.1.4` Link 语义强度、`A.3.1` EBNF 运算符优先级和产品 SentencePlan 排序分别断言；测试中不得引用不存在的 Clause 15；
6. 缺 Symbol、Rule、Grammar、模板、Trace 或 digest 不匹配时，无 partial committed revision。
7. Token range 使用 UTF-8 byte 半开区间，严格有序、非重叠、合法字符边界并覆盖 Sentence 全 byte；Sentence Trace 闭合 Fact、适用的 Element/Feature/State/Modifier、Occurrence、Template、Grammar、Rule 和 digest；
8. 同 Revision + asset digests 至少连续重放两次，Sentence bytes、Token/Trace 顺序和 artifact SHA-256 一致。

## 7. API 契约用例

每个 OpenAPI operationId 至少覆盖：成功、输入非法、未找到、会话失败和适用的业务冲突。

| API | 必测行为 |
| --- | --- |
| API-PRJ-001/002/003 | 分页稳定、创建幂等、项目不存在 |
| API-PRJ-006/007/009 | 初始 Revision/Context、Profile 资产缺失、打开模式 |
| API-CTX-001/002 | `read_revision` 一致、历史只读投影 |
| API-EDT-001/002 | Capability 过滤、revision/profile/rule/idempotency 守卫、结构化 option、State/Fact 封闭 payload、impact token、原子结果 |
| API-TXT-001 | revision 新鲜度、Trace、生成阻断 |
| API-VAL-001 | `202 + task_id`、固定输入、过期结果不覆盖当前 |
| API-VER-001/004 | 不可变 Revision、基线门槛、无部分基线 |
| API-TSK-001/004 | 状态查询、SSE 断线后回查、终态一致 |

全局断言：P0 OpenAPI 的 16 个 operationId 唯一，5 个写操作声明 `localSession`；写请求校验 `Host/Origin/X-OPM-Session`；错误响应不暴露堆栈和敏感本地路径。DEV-CANVAS-00 还必须验证 generated TypeScript/Java DTO 与版本化 OpenAPI 一致、旧 P0 payload 兼容、`CommandCapabilityOption` 字段封闭、Control/base Fact Capability 分离、Modifier 基数/原子组、State 不进入 `CREATE_ELEMENT`，以及 option/impact token 的 Revision 失效。

## 8. SQLite 与迁移用例

1. 空数据库执行 V1 后产生 20 个业务表和版本记录；
2. `PRAGMA foreign_key_check` 无输出；
3. Revision document update/delete 触发器阻断修改；
4. project/model/head/revision/snapshot/baseline 外键与唯一约束生效；
5. Operation Record 幂等范围唯一；
6. transaction 中任一步骤失败后 Head、Revision、Text Trace 和 Operation Record 全部回滚；
7. 重复执行 Flyway 不重复建表；
8. 不支持的高版本 `storage_schema_version` 拒绝打开；
9. 迁移前备份失败时不执行迁移；
10. 回滚采用备份恢复或前滚修复，不执行破坏性 down SQL。

## 9. 前端组件与 E2E

### 9.1 组件

1. Object/Process/State bbox、标签换行和最小尺寸；
2. Consumption closed-arrow 方向和边界交点；
3. `25%/100%/400%` 下 marker、标签与结点不遮挡；
4. 选择/Finding 高亮移除后基础符号恢复；
5. readonly 模式禁用语义控件但保留查看、比较、导出和建草稿；
6. `blocked` 与 `failed` 展示不同恢复动作；
7. 当前/过期文本和校验不能混成 current。
8. 16/8/10 relation descriptor 的 line、marker、annotation、label slot、route 和方向逐 Capability 匹配；
9. Control annotation 不产生重叠 edge，fundamental fan 不拆成多个正式 Fact；
10. State 始终受 owner content box 约束，角色叠加和 state-specified locator 不遮挡名称。

### 9.2 E2E 场景

| ID | 场景 | 关键断言 |
| --- | --- | --- |
| E2E-001 | 新建项目和模型 | P01 -> OV01 -> P02 -> OV02 -> P03；根 SD 与 Draft r1 |
| E2E-002 | 最小建模 | Object + Process + Consumption；Revision 与 OPL 同步 |
| E2E-003 | 视口缩放 | 比例变化，Revision/OPL/digest 不变 |
| E2E-004 | 语义缩放 | 确认后新 Context/Revision/OPL |
| E2E-005 | 命令阻断 | 候选保留，无 committed revision |
| E2E-006 | Revision 冲突 | 显示当前 revision，不静默覆盖 |
| E2E-007 | Finding 定位 | P05/P03 -> Context/Occurrence/Sentence |
| E2E-008 | 基线门槛 | 阻断时无基线，通过时不可变 |
| E2E-009 | 只读基线 | 禁止写入，可基于基线创建草稿 |
| E2E-010 | 重启恢复 | 打开最近耐久 Draft，不重复写命令 |
| E2E-CANVAS-001 | State 闭环 | 创建、改名、角色、显式/抑制、展开/折叠、重开 Projection/OPL/Trace 一致 |
| E2E-CANVAS-002 | Procedural | 从关系目录选择到提交，16 个主 Capability 逐项有独立数据驱动场景 |
| E2E-CANVAS-003 | Control | 8 个主 Capability 与全部允许基础关系变体可提交，非法 segment/组合被阻断 |
| E2E-CANVAS-004 | Structural | 10 个主 Capability、双向/互惠标签、fan 增删和完整性闭合 |
| E2E-CANVAS-005 | 候选归一化 | 反向拖线得到规范端点，多候选不自动提交，Revision 变化后 option 失效 |
| E2E-CANVAS-006 | 删除影响 | State/Fact 影响摘要可定位，过期或不匹配 impact token 被阻断 |
| E2E-CANVAS-007 | 故障与只读 | asset-missing、text-blocked、conflict、persistence-failed、readonly 均保留最近 committed Projection |

桌面最小矩阵：`1440x900`、`1280x800`。窄视口设计回归：`390x844`，保证页面无全局横向溢出；它不构成移动端产品支持。完整画布还必须在 `25%/100%/400%` 对 State、全部 marker、长标签、fan、候选层和检查器执行 visual golden 与 canvas pixel 非空/遮挡检查。

### 9.3 DEV-CANVAS-06 Visual/E2E 机器闭包

1. Visual release catalog 固定 `378` 个 case：Capability `34×3×3=306`，公共主题 `8×3×3=72`；每项两次隔离执行，共 `756` 条 attempt evidence。
2. Capability visual case 以 exact Symbol 主 descriptor 为基线，并按 READY Intake/Handoff 引用的 Coverage Catalog、Golden Manifest、Golden Replay 三表一对一 join 展开 130 个 PASS family variant；`visual_variant_key` 使用完整 coverage key。每个 capture 独立绑定 fixture/revision/focus/cell/golden/critical region，不能把不同 fixture 提升到 case 层。
3. E2E release catalog 固定 `194` 个 case：按 Handoff coverage keys 派生家族 `178=130 PASS+48 BLOCKED`，公共 `16`；每项两次隔离执行，共 `388` 条 attempt evidence。
4. 家族 suite 映射固定为 Procedural -> `E2E-CANVAS-002`、Control -> `003`、Structural -> `004`；公共 suite 固定为 State `001`、候选归一化 `005`、删除影响 `006`、故障/只读 `007`。
5. release visual/E2E 使用 production build、独立 browser context/project、固定时钟/locale/timezone/font/Chromium、`workers=1/retries=0`；dev server、人工观察、组件 mock 或重试后的绿色结果不能作为 Gate 证据。
6. 唯一case ID、像素容差、失败码和Report READY算法由`docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`的`GATE-06-03`承接；Visual builder、approved exact join与bundle class/root/identity由Visual/E2E输入修正规格承接。历史E2E Manifest `0.1` builder/verifier只读；活动E2E Manifest `0.2` producer/verifier、Profile五文件Source Set/source-root外Staging/source-staging-final三方join、四driver、exact JAR/Web final root和Report `137/57`由`specs/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md`及Profile/Digest closure `v1.5`承接。Candidate Handoff历史版本根由Versioned Handoff/Fixed Postverify规格承接；活动v02所需Handoff `0.2`、READY Intake、Runtime、Web、Common统一source链、固定source-root路径和三方join由统一Source生产输入重建规格承接，其Node 22根build、Bootstrap source/dist/Runtime bytes与window wire、入口顺序、派生产物和Git零漂移前置由Bootstrap Build Closure规格承接。E2E `194/388`执行、Fixture到SQLite、Runtime/Web/browser、活动Report `0.2`和只读verifier由E2E Runner规格承接；Common 16 case动作、有序API期望与controlled attempt编排由Common Driver设计`v1.8`、Stage A lifecycle closure及Runner Source Set闭包修正承接，session唯一归Source Set第1项。新Context `0.1`、194/388 schedule、Driver dispatch、Family/Common CaseExecution、五参数调用、一次性同源client、API Exchange和production bridge由Family Controlled Invocation闭包唯一承接；Runner Source Set活动口径为`0.2/24`，bridge为第20项，四Driver为21~24。旧`8=7 M+1 A`与External Store `9=7 M+2 A`只保留为`9048bb3...`origin前职责来源，最终source、六方join和重建顺序按`9048bb3... -> C -> S -> A -> R`执行。新factory到活动Catalog `0.2.0`、32个BASE/INPUT和全部raw ref的原子重建由Common E2E输入重建规格承接；活动Attempt Artifact `0.2`、Family identity/ordinal、Java executable、Runner Source Set和摘要由Profile/Digest closure、Family Identity Catalog及对应Schema承接。Golden Capture Plan、author、审批、不可变发布和变更边界由Golden Authoring `v1.4`承接，Family SQLite/Report物化由Golden Fixture Materializer `v1.5`承接，Common fixture/SQLite/Projection/Color、空Text Artifact、五类index逐列映射、8类UI step/exact subject数组、`43=1+8+32+2` self-contained root、活动Adapter Request `0.2`的exact Java/Profile受控preflight、Adapter Test Input Bundle `0.1`的fresh Profile 5/Common 43/Plan 1242/72/Observed 144原子闭包、其余三份adapter机器Schema、Clone Result/Runtime Ready、静态ESM/144次callback、Base/Clone/Web launch mode、动态端口/READY/关闭协议、独立one-shot fault port和唯一JCS/exit owner由Visual Common Materialization `v1.9`、03C Adapter/Fault、Clone/Web Runtime、Adapter受控输入及测试Builder闭包规格承接，Materialization verifier的原57项和6项pending case由catalog `v1.1`承接，测试策略不维护第二套字段或数值。
   前句中的Common Driver `v1.8`仅为历史实现规格起点；活动版本固定为`v1.11`，其attached Page baseline绑定、DIRECT/REQUEST_MUTATION、source locator、封闭ARMED/final receipt和baseline重绑定由Common Precondition closure后继取代。
   03C受控测试必须先由独立Builder/Verifier原子生成Bundle `0.1`，闭合clean source/Handoff/Java/Runtime、fresh Profile 5、Common 43、Plan 1242/72、Request `0.2`和144份完整Observed/PNG。历史Plan、手工Request、目录扫描或callback补值全部拒绝；Bundle READY只表示可进入Adapter测试，不是production evidence。
   Fault Plan字段/摘要仍由历史Attempt Artifact设计承接，活动Launcher配置、握手、Plan raw identity、Spring装配、注入和错误语义唯一由`docs/design/opm-dev-canvas-06-e2e-fault-launcher-design.md v1.9`承接；代码文件边界、Spring注册、显式Context、Recovery隔离、唯一controlled CLI、Manifest D05、Stage A lifecycle和evidence事务由Fault Launcher实现规格、Lifecycle Closure及Preflight Descriptor/Gate Observation闭包规格承接。最终source Git图、Stage C/S/A/R allowlist、双target和六方join只由Final Production Source Chain Closure承接。
7. Visual case 仍为 `378`、attempt 为 `756`；130 个 family variant 在三视口/三缩放下形成 `1170` capture，8 个公共 subject 形成 `72` capture，因此固定 `capture_count=1242`、`attempt_capture_count=2484`。
8. 178 个 family E2E 的 base/input fixture 来自 Handoff exact evidence bundle；178个base `fixture_ref`深度去重后当前恰为2。Family Project只来自Evidence Bundle内Family Fixture Identity Catalog，Model/Context/base Revision/sequence必须与exact fixture bytes深度一致，parent按“fixture字段存在则字符串、缺失则Catalog显式`null`”归一后相等，`base_revision=fixture.revision_id`；禁止fixture SHA、case、path、Golden或Recovery公式派生Project。expected transaction 取 Golden Replay 两次一致的 transaction，BLOCKED 还必须与 Golden Manifest 深度一致。普通 file ref 不得冒充 archive entry ref。
9. evidence bundle 必须先验证 raw SHA，再由 fixed Java 21 安全物化；builder 强制显式 `CONTROLLED_TEST/PRODUCTION_HANDOFF`，两类 bundle 使用不同 descriptor/identity/source/output root。绝对路径、`..`、重复 entry、symlink、超限 archive、跨 class 互用或受控证据提升立即阻断，source/handoff/approved root 保持只读。
10. 8个公共Visual与16个公共E2E必须来自版本化Common Fixture Catalog；每个公共action的expected status/error/transaction/reopen checkpoint在执行前冻结，禁止从observed结果反填。E2E Common固定把exact Factory `BASE`输出通过non-web test-only materializer写成确定性空模型，再由真实UI/API执行`INPUT`动作；Visual Common固定由02B完整fixture和03C release-only SQLite V1 materializer生成8个base/144 clone。02B活动输出固定为43文件root，包含1个Catalog、8个Visual、由同一静态factory确定性生成的32个E2E asset和两份source mirror；Catalog 24项factory ref只指同一mirror，全部ref在root内闭合，Builder/Verifier均禁止`--source-root`/外部E2E root并不得依赖checkout历史bytes。E2E Manifest必须先验证该root，再逐byte复制完整树到`inputs/common/`。两类Common不得在Runtime/API/SQLite之间临时选择或互用，Catalog`0.1`Schema不改写。
11. Capture Plan 必须在不读取既有 PNG 的条件下由 exact join 生成 `1242` 个 capture ID；1170 个 Family capture 必须去重为 130 个 exact `MS-REV-001/0.2` archive ref，由同一 Runtime JAR 的 non-web release-only Materializer 生成 130 个隔离 SQLite/Report。72个Common capture必须从8个完整fixture的normalized Projection计算digest，并使用8个immutable base和144个fresh clone；旧subject/focus占位digest必须拒绝。
12. Materializer 测试必须覆盖 Report/Quarantine Marker Schema、1170 -> 130 -> 9 集合算法、条件装配/零 HTTP、JAR/Bundle/entry/fixture/binding/空 storage preflight、七表事务故障注入、identity/reopen/integrity/FK/sidecar、stable projection/per-run evidence、Report content/engine/write 边界、pending-quarantine预验证、原子移动、marker、完整selected verifier的唯一四阶段cleanup/quarantine、semantic verifier `63=57+6` case catalog、并发停止、base/clone 隔离和 130 项性能门槛；Check 1~8 失败为 pre-acceptance 零 storage/report，Check 9 以后可归类失败使用真实 fixture identity 生成 Schema-valid BLOCKED Report。verifier case 必须从 controlled base clone、普通反例单变量、三种枚举顺序 top code 一致且前后 tree digest 相等；只有 full-root `--require-materialized` 通过的 130/130 Report/root 可消费。
13. author 使用130个成功Family Report/SQLite clone、8个Common base/144 clone和fixed clean build/Runtime/Chromium/font/clock/wait协议生成candidate；Common UI终态与normalized Projection必须深度相等再比较digest。Plan raw `srgb`和exact launch arg只能映射为Environment canonical `sRGB IEC61966-2.1`，trim/case/alias/重复参数均拒绝。Authoring Report必须记录2484/18逐attempt results、集合SHA和authored Golden Environment ref，Approval必须exact引用candidate report raw/payload/attempt SHA、Environment和五类refs，经Applicant/Approver分离审批后，Publisher只能排他发布新的immutable approved version。
14. Visual golden 只由显式 approved version 的 Golden Environment Index 解析 `1242` 个 PNG 和 9 个 blank baseline；目录扫描、mutable latest、环境指纹不一致、缺项、额外项、未审批或 SHA 不一致均不能生成 Manifest。
15. production Golden Environment、Approval Record、Authoring Report 和 Visual Manifest 目标均为 `schema_version=0.2`；Environment 必须封闭 OS/arch/browser executable SHA/font role/screenshot options 和 fingerprint，Approval 必须覆盖 candidate report、130 份 Report/SQLite base 和 PNG/blank/font，Authoring Report 必须 exact 引用它们，Visual Manifest 必须绑定八个冻结 provenance 字段、exact `APPROVED_PUBLISHED` Authoring Report 和 Golden Environment；validation runner 对 approved root 永久只读。
16. Visual builder只允许输出`0.2/0.2.0`；活动E2E producer只允许输出`0.2/0.2.0`并拒绝Golden Authoring参数，历史`0.1/0.1.0`只读。必须分别覆盖两类bundle正例、互用反例、Visual approved transitive tamper和所有失败零输出。E2E还必须覆盖四driver、Profile五资产、exact JAR/Web、`178+16`、Common `7/9`、Report `137/57`恒等式、单一final transaction root各staging failure point、194-case/ref重算及controlled成功被`--require-production`拒绝。旧合并builder和v01测试不得作为活动完成证据。
17. E2E Runner固定使用self-contained Report transaction root；每个attempt必须有fresh SQLite，INITIAL/REOPEN各使用fresh Runtime/production Web和spec-owned Chromium process/context/page，并以新进程读取同一storage。plan builder必须先原子写入并验证`fault-plan.json`，其余producer只从该文件读取`attempt_ordinal`并与Manifest schedule交叉校验，路径只做定位。活动11类JSON必须通过Attempt Artifact union Schema `0.2`并按固定文件名匹配root identity；历史`0.1`仅兼容读取。命令/option/token、Projection、OPL/Token/Trace、七项事务、process/browser/network/console/reopen/API exchange以strict raw artifact写入attempt `artifact_refs[]`；Artifact Index固定闭合16项必需集合、五类Profile asset及全部动态API/log/failure证据，`inputs/**`与`storage/**`由专用ref/verifier管理。只有388项均取得真实必填identity时才允许写Report，禁止为Schema必填字段填占位值；可归类case失败在完整执行后写BLOCKED，pre-acceptance或不完整执行final Report零输出。
18. 当前三类Authoring`0.1`Schema、Capture Planner、Materialization Report`0.1`Schema和Materializer`v1.5`已实现；semantic verifier catalog`v1.1`63/63、受控130项串行/并发4及contract/backend已闭环。Versioned Handoff source`37c5412a9c12c1b3ae06d6f7abe734804fa53c7b`已按`14=12 M+2 A`形成，Node 24定向`13/13`、READY Handoff/Intake、production Manifest、版本根`clean-37c5412a9c12`和安装后production verifier已闭合。Fixed Handoff Postverify tool/READY Report/live guard已执行，fixed SHA为`4088e449...`且无pending marker。历史 E2E Attempt Artifact设计`v1.3`/union Schema`0.1`、活动 Manifest/Attempt Artifact `0.2`、Profile asset/digest closure、Family Identity Catalog `0.1/0.1.0`、活动Report`0.2`和Runner Source Set`0.1`已冻结。活动 Profile raw 输入与 Token parity 尚未被现有 CLI/Materializer/Artifact verifier 消费；真实Golden实体、Visual/E2E Runner和真实Report仍未完成；本节不构成`GATE-06-03`PASS。

19. 本轮执行契约修正的统一入口为`docs/design/opm-dev-canvas-06-execution-contract-design-correction.md v1.0`；它按02B、Recovery Launch、E2E Java/Source顺序冻结机器语义，不替代各Owner文档。
20. 02B测试必须覆盖8个完整fixture Schema/bytes、32个E2E asset factory重算、43文件inventory、Catalog/source mirror/ref/payload/binding、24项factory ref相等、subject语义/布局、五类index entry逐字段/排序/固定ID时间状态/null、8类UI step shape和每subject exact数组、`72=8*3*3`Planner join、旧占位digest拒绝、Color Profile唯一映射、原子零输出、determinism和只读tree digest；必须拒绝source/E2E root override、历史author/bytes、cwd/env/dynamic source、缺失/额外/link/escape/Git metadata。E2E Manifest回归还必须覆盖完整43文件tree copy、source/target digest、历史`0.1.0`/旧布局拒绝和新契约零输出事务。03C测试必须覆盖活动Request `0.2`、exact Java path/type/realpath/raw/major、Profile root/inventory/五raw refs/tree/package/binding和零fallback/零输出，四种release launch mode、有限任务退出与Web长驻、Revision JCS到SQLite逐列映射、8个SQLite V1 base、attestation、packaged-JAR Clone CLI、144 fresh clone、Clone Result/Runtime Ready、OS动态双loopback端口、30秒READY、health/bootstrap、SIGTERM/10秒/SIGKILL、SQLite sidecar/端口关闭、其余三份adapter Schema、静态ESM与CLI四模式、callback严格顺序/首错/result摘要、`GOLDEN_COMMON_UI_SETUP_FAILED/3`唯一映射、独立default NOOP与一次性fault port、E2E/Recovery隔离、rollback和`5 s/30 s/1 s/512 MiB`阈值。受控通过不等于production执行。
21. E2E Manifest/Runner定向测试必须新增Family Identity Catalog正例，以及缺ref、额外/重复entry、payload/source Manifest SHA/fixture SHA错误、Project重复或使用`project.golden.fixture.*`/`project.recovery.*`、Model/Context/base Revision/sequence/parent归一值 drift反例；Fault Plan测试必须覆盖缺失、partial、Schema/payload错误、ordinal与case/path/schedule不一致，并证明SQLite/Runtime及后续artifact均为零输出。Catalog存在但未进入exact Handoff/Evidence Bundle不得用source checkout补齐。
22. Fixed Handoff postverify必须覆盖：路径不同但raw相等正例；fixed/versioned/Manifest copy任一byte、length、SHA drift；fixed Intake、跨版本ref、source12/handoff_id/Manifest identity drift；缺失/目录/link/escape；production verifier非零或输出异常；运行中subject drift；pre-acceptance零Report、可报告BLOCKED、Report Schema/payload/atomic failure；READY Report后pending恢复时live guard拒绝孤立Report。真实正例必须继续由production verifier读取installed Intake/versioned Handoff，禁止fixed path、fixed Intake、`sameRef()`放宽和fallback。
23. 活动 E2E Manifest/Attempt Artifact `0.2` 必须覆盖五类 Profile raw ref 各恰好一次、UTF-8 path排序、Profile tree/raw SHA、package/raw digest分离、active binding join、Attempt内逐byte副本、Artifact Index `10+1+5`必需项、五类`asset_kind`及动态API/log/failure闭包；历史`0.1`必须拒绝活动字段。OPL/Trace摘要只接受`OplGoldenArtifactCanonicalWriter` bytes，Token摘要必须比较preimage、JCS bytes、SHA、稳定错误码和pointer。当前Schema/Token Node定向为`19/19`，Java Token writer、symlink/raw/tree/binding semantic verifier和真实attempt producer仍是后继实现验收，不得把Schema通过写成production证据。
24. E2E Fault Launcher只允许三个故障case的INITIAL cycle使用；其余191个NONE INITIAL和全部194个REOPEN使用普通`java -jar`并只装配NOOP。活动origin固定为`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`，36项基线摘要为`69491a...b411e`；Stage C=`20=12 M+8 A`、S=`2 M`、A=`7=5 M+2 A`。A必须修改Runner owner及其测试、release discovery test与两个unified source guard，并新增controlled Node owner与Playwright spec；新增文件只能调用Runner owner，禁止复制编排语义。Preflight `implementation_delta`恰为七项`M/M/M/M/M/A/A`，Report字段不变。R再次修改Runner owner时必须先重跑A阶段controlled正反例。C/S已形成，首轮A candidate待七路径重写，真实controlled结果尚未生成。
25. Common Driver必须对16项`COMMON_CASES`执行exact equality回归：初始状态、SETUP/subject baseline、八类封闭step JSON、T/X/R selector、与`WAIT_API`一一对应的有序`expected_apis[]`、错误码、`7 PASS+9 BLOCKED`、`TX_COMMIT_1/TX_NO_COMMIT`和REOPEN逐项匹配；`REVERSE_DRAG_NORMALIZED`固定GET/POST两项，其余15项各一项。既有Driver/UI/factory只读。`runControlledLifecycleSession()`只能由`release-canvas06-e2e-run.mjs`承接，`prepareControlledAttempt()`只允许其内部调用；observation/precondition client逐cycle由接口构造，spec不得复制。受控编排必须证明Runtime JAR/Web dist只来自活动Manifest、attempt fresh、INITIAL/REOPEN使用新Runtime/Web且storage相同、端口无残留。
26. Common E2E输入重建必须证明Builder/Verifier静态绑定同一exact factory owner，各自在单个进程内按16 case顺序每case调用一次并缓存；32个BASE/INPUT必须以UTF-8/LF/2空格/末尾单LF逐byte重算，Catalog `0.2.0`的generator、24项factory、8项Visual和32项E2E raw ref必须从fresh staging实际bytes复算。正例覆盖43文件、7/9、八个错误码与Ambiguous省略错误码、两次byte-identical和只读tree digest；反例覆盖旧factory/旧SHA、本地error map、raw byte/编码/ref/inventory/link/source drift及全部原子failure。禁止修改Runner测试、放宽Schema/Verifier或从observed结果回填；工具测试通过不等于exact clean factory生产重建完成。
27. 统一Source生产输入重建必须以`daf383df...`为base、以实现后的新clean commit为唯一`unified_source_commit`；正例覆盖Handoff `0.2`三artifact、READY Intake、Runtime raw、Web tree、Common 43、四driver和五Profile固定路径，以及同一次clean build的source/staging/installed/final exact join。Web tree固定使用普通单链接文件inventory、UTF-8 path排序和JCS摘要；反例覆盖旧两artifact Handoff、旧Intake与新Common混用、wrong HEAD/dirty、已有dist/target、Runtime/Web/driver/Common/Profile drift、link/special、staging/rename/fsync/installed reverify失败。当前Common root自身验证通过不等于统一production输入READY。
28. Profile五资产不得被解释为source内共同物理root。Manifest v02测试必须从clean source五个固定路径逐byte创建source-root外fresh Staging Root，证明其恰含五个固定逻辑文件、source/staging/final raw refs与逻辑tree三方相等、package/binding闭合，且seal后无写入。反例必须覆盖Staging预存在、位于source/Handoff/Common/output/final内、source或copy中途漂移、缺/extra/link/hardlink、路径映射、tree/package/binding和Verifier source/final不一致；Verifier必须显式接收clean `--source-root`独立复算。Staging物理路径、权限位和mtime不进入identity，Schema与Profile业务bytes保持只读。
29. Bootstrap Build Closure必须在Node `22.22.0`/npm `10.9.4`的独立clean worktree执行根`npm run build`，并同时证明：source/dist只保留同源external classic `/opm-bootstrap.js`、Bootstrap在应用入口前执行、Runtime固定fixture为`227` UTF-8 bytes且SHA=`c74cff...`、window binding恰含四个有序字段、构建后Git无tracked/untracked漂移、`vite.config.js/.d.ts`均不存在，新增派生产物只位于node_modules、`apps/web/dist`和services target。禁止修改ignore或build后删除emit掩盖问题；Verifier只读且反例覆盖Node/config/HTML/dist/wire/order/source和link drift。
30. 统一Source rename后失败必须保留原始`clean-<source12>`tree，并只在固定sidecar `handoff/releases/quarantine/clean-<source12>.json`写封闭Marker `0.1`。测试必须覆盖八字段Schema、source12/input root/tree/failure code/stage join、UTF-8固定bytes、temp exclusive write/file fsync/reread/no-replace rename/directory fsync、每步失败固定`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`；production Builder/Verifier和Manifest v02 Producer/Verifier必须在读取版本根前只构造同source12 final/temp exact path，任一实体存在即拒绝。禁止扫描quarantine目录、follow link、latest/mtime选择、覆盖重建或自动删除/移动失败根；其他source12 marker不得阻断目标。恢复必须等待独立规格和operator授权。
31. Manifest v02 production正例必须先完成集成Source重建。测试同时证明`23+17-1=39`项composite owner和相对`30f7edc...`的`8=3 M+5 A`线性patch，唯一重叠`package.json`保留Bootstrap/统一输入并增加Manifest命令；新commit必须单parent且patch SHA由`git show --format= --no-ext-diff --binary`原始stdout复算。随后只从同一clean commit重建Handoff `0.2`、READY Intake、Runtime、Web、Common和Manifest。历史`clean-30f7edc5397b`只读且不能复制；Manifest写入独立版本化release root，外层staging验证、原子rename、installed verifier和失败隔离均必须通过。任一分叉commit产物混用、旧根存在、Manifest root存在或Schema通过都不能替代production READY。
32. Unified External Release Store测试必须先复现`e598...`旧Builder/Verifier的source内handoff绑定和final untracked例外，再证明`9=7 M+2 A`职责子集关闭该冲突。正例要求base=`e598...`、owner=41、三条CLI同source/release store、完整source porcelain在全部reachpoint为空、external统一输入由新进程Verifier验证、Builder唯一写post-rename quarantine、Manifest链只读marker、Manifest staging/installed Verifier为不同PID且均退出0，且input/Manifest三元组与transaction摘要闭合。反例覆盖旧CLI/base=daf、final untracked例外、path filter/ignore、root alias/link/Git/cross-fs、wrong parent/9项漂移、marker越权、Verifier写入/同进程、pre/post-rename marker错误、stdout extra和失败root消费。旧内嵌root不得移动、复制、清理或作为external seed；该9项不得独立形成production source commit。
33. `e598... -> 9048bb3...`继续作为17项origin intake。final production正例必须验证`9048bb3... -> C -> S -> A -> R`全部single-parent、Stage R=`33=31 M+2 A`、O..A=`25=15 M+10 A`、O..R=`52=40 M+12 A`及各stage/final patch SHA。R先完成API/Runtime contract与source guard，再闭合Context/bridge/Driver/Runner；24项Source Set相对A恰11 changed/new与13 unchanged。Service、Java测试及Common Driver test不得加入Source Set，Runtime JAR必须从同一R重建。缺Context Schema、bridge未入Source Set、stage owner仍生产0.1/23、source guard仍接受旧20/42、release discovery仍只接纳一个测试、Artifact Index仍固定恰16、非388 schedule、Node HTTP precondition、mutation被实现为直接POST、extra path或dirty source均为反例。
34. Fault Launcher controlled Playwright只接受Controlled Bundle `0.2`对Preflight Descriptor `0.1`的不可变raw ref，并只暴露唯一`--run-controlled`入口。preflight依赖固定为D01~D09/D10A；任一非READY时输出Preflight Report `0.2`、exit=`3`且零执行/evidence。READY后父进程原子发布Invocation Context；spec验证Context后只构造12个预绑定handler并调用`runControlledLifecycleSession()`。接口在任何Runtime/Web前采样BEFORE；每cycle先完成真实Page attach、同Page网络观测、相同Browser/Context/Page临时confirm和零pending，立即冻结业务观测并无间隙保留最小迟到事件sentinel；handler settle后按零迟到事件复核、sink关闭、全部sentinel移除、最终Browser proof、Runtime/Web cleanup及端口释放顺序闭合，再采样DURING；全部child与端口回收后采样AFTER，并唯一写Gate Artifact。PASS固定`1+12+1`，业务FAILED只允许真实完成前缀；confirm后迟到事件、监听空窗、sentinel提前移除或最终残留，以及其他Browser proof、cleanup或Artifact事务不闭合，均为`EVIDENCE_TRANSACTION/4`且零可消费Artifact。活动D01验证`O -> C -> S -> A`和`M/M/A/A`，接口完成前禁止A commit与D10B。

## 10. 非功能验证

### 10.1 性能

性能数据集和阈值冻结如下；这些是产品发布门槛，不是 ISO 19450:2024 要求。

| 场景 | 阈值 |
| --- | --- |
| 普通编辑用户可见反馈 | P95 `<=100 ms` |
| 有效语义变更到受影响文本可见 | P95 `<=500 ms` |
| 300 可见结点/600 关系 | pan/zoom frame P95 `<=32 ms`；选择反馈 P95 `<=100 ms`；零功能失效 |
| 1,000 可见 construct/2,000 edge | pan/zoom frame P95 `<=50 ms`；选择反馈 P95 `<=200 ms`；零功能失效、零 OOM |
| 10,000 结点模型 | 保存、快照、全量校验每次分别 `<=10 s`、`<=15 s`、`<=60 s`；各 5 次零失败 |

交互指标先预热至少 5 次，再采样至少 100 次并报告 P50/P95/Max；frame time 连续采样至少 30 秒。10,000 结点三类任务各执行至少 5 次，任一次失败、OOM、结果缺失或超时即 FAIL。

首批至少测量：打开项目、打开不同规模 Context、工具切换、关系目录搜索、`API-EDT-001` 候选返回、单命令提交、增量 OPL、全量校验、1000 条 Finding 筛选和 100 Revision 列表。

性能使用 production/release build、Java 21、Node 22、lockfile 对应 Chromium、至少 8 逻辑 CPU/16 GB RAM/SSD，关闭 HMR、DevTools、CPU/network throttling 和节能模式。结果必须报告 exact 版本、数据规模、fixture/asset digests、机器、OS、冷/热启动、P50/P95/Max、失败率和原始样本。不同机器或版本不得混算同一 P95；原型或 dev build 响应时间不作为生产性能证据。

#### 10.1.1 DEV-CANVAS-06 Performance 机器闭包

1. Performance release catalog 固定 `4` 个 fixture、`7` 个 scenario、按 `(scenario_id, metric_id)` 计数的 `11` 个 metric instance 和 `7` 份 raw sample set；Manifest/Raw Samples/Report 使用独立机器 Schema。
2. UI/OPL/selection 使用浏览器 monotonic clock，frame 使用连续 `requestAnimationFrame` delta，保存/快照/校验使用 Node monotonic clock；单个 series 禁止混用计时域。
3. duration 统一保存为整数微秒；P50/P95 使用 nearest-rank，不插值、不删除 outlier、timeout、OOM 或失败样本。失败样本进入失败率并阻断 Gate。
4. 两档 OPD 的 frame 分别至少保留 `900/600` 个 30 秒 measured sample；非 frame measured sample 总计 `615`，三类大模型任务各 5 次零失败且结果完整。
5. 性能只能在继承 Intake upstream artifacts 的同一 clean DEV-CANVAS-06 target build、固定机器/浏览器/JVM/fixture/environment fingerprint 上汇总；不同指纹不得混算。
6. 唯一场景 ID、计时起止点、sample series 字段、P95 公式、环境守卫、失败码和 Report READY 算法由 DEV-CANVAS-06 checklist 的 `GATE-06-04` 执行契约承接。

### 10.2 可靠性与恢复

在 Candidate、Rule、Symbol/Grammar 解析、OPL、Trace、SQLite commit、Head update、Projection 回读和资产写入阶段注入失败；验证无部分 Revision、无错误 Head、候选可恢复且不会显示为 committed。对 option/impact token 过期、digest mismatch、State owner mismatch、fan 成员冲突和 Control 非法 segment 使用稳定错误断言。强制终止运行时后重启，检查任务终态、临时文件清理和最近耐久 Revision 重开。

#### 10.2.1 DEV-CANVAS-06 Recovery/Rollback 机器闭包

1. Recovery release catalog 固定 `28=8+7+4+3+6` 个 case，每项两个隔离 attempt，共 `56`；活动Manifest为`0.2/0.2.0`，历史Manifest `0.1`只读，test-only Gate Fixture和Report保持`0.1`，两次规范化outcome digest必须一致。
2. 前置资产/语义和 SQLite 七写阶段失败必须复用 DEV-CANVAS-05 的 Revision/Parent/Text/Trace/Finding/Operation/Receipt 七项零增量与 Head ID/sequence 口径；pre-repository case 还必须证明 repository 未调用。
3. 强停必须以 exact release JAR 启动独立 Local Runtime 子进程并由新 JVM/连接/context 重开；commit 前强停保持零增量，commit 后断连或 Projection 回读失败必须证明恰好一次提交和同 command_id 幂等回放。Report 固定记录 OS/filesystem、SQLite/JVM/runtime args 和 source artifact 的环境指纹。
4. 发布前 gate 演练只使用 production loader 明确拒绝的 test-only fixture，通过测试组合根调用与生产相同的 rollback evaluator；真实 production gate 在全部 attempt 前后保持 `DISABLED + []`。
5. 部分回退按前序 enabled 集合减 requested 与 Control 反向依赖闭包生成 `ROLLED_BACK_PARTIAL`；全量回退生成 `ROLLED_BACK`。历史含 disabled Capability 的 Revision 仍按 exact binding 只读渲染，新写入稳定阻断且零增量。
6. 唯一case ID、attempt字段、事务/重开快照、失败码和Report READY算法由DEV-CANVAS-06 checklist的`GATE-06-05`承接；两份immutable template及raw ref、历史五份`0.1`机器Schema、活动Manifest `0.2`、Reopen Catalog/API Request Artifact/Launch Request/Launch Proof `0.1` Schema、factory三个export、独立helper JAR、21表SQLite映射、原子事务、七个SQLite fault stage、四个forced-stop reachpoint/PropertiesLauncher协议、challenge、原子proof与artifact index由`opm-dev-canvas-06-recovery-execution-design.md v1.5`承接。
7. forced-stop正例必须由父进程验证PID/nonce/challenge/reach proof后使用SIGKILL或TerminateProcess；018还要证明`connection.commit()`已返回且HTTP首byte尚未写。exception、正常shutdown、mock crash或child自杀均是反例。
8. 每个attempt在cleanup前采集template/materialization、process/reach/termination、before/after/reopen/replay/gate snapshot、SQLite file-set和原始日志，并以排序raw ref和tree/payload SHA写`artifact-index.json`；失败case不得被丢弃或只保留最终绿色结果。
9. `expected_reopen`只能从不可变Catalog `0.1.0`的三个封闭profile展开：018/021比较AFTER，022比较RECOVERY_REQUIRED，其余25项比较BEFORE；Manifest必须携带逐profile JCS SHA并与Catalog raw/payload SHA exact join。
10. Recovery受控HTTP命令必须由test-only eager filter在Controller前校验raw bytes、严格UTF-8、BOM、重复键、单一JSON对象、JCS与template digest，再由body advice复核Spring解析对象；任一拒绝固定HTTP 422且Controller/Service/repository调用为0。该guard不得进入产品默认Spring context或release JAR/ZIP。
11. 正式`LocalApiService.projection(...).data`摘要固定使用Projection Digest Closure `v1.0/0.1`：layout四个有限binary64编码为IEEE-754 raw bits的8-byte big-endian 16位小写hex tag，再调用现有safe-integer JCS owner；正负零不同，非有限值、非layout浮点、unsafe integer和unknown字段稳定拒绝。
12. Node/Java实现必须读取同一`projection-digest-v01-parity-vectors.json`，通过4个正向量和9个负向量的input bits、preimage、canonical bytes、SHA、code/pointer parity；Common Visual normalized Projection继续使用独立safe-integer payload算法，禁止互用。
13. Projection Digest设计闭合后`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED`；真实28/56、Recovery READY和`GATE-06-05`仍为`NOT_RUN/BLOCKED_BY_EVIDENCE`，不能从设计状态推导通过。

### 10.3 DEV-CANVAS-06 Release Candidate Smoke

1. 发布候选固定使用 Manifest、Report 和平台定向 ZIP；Web production dist 内嵌 Spring Boot JAR，由单一 loopback origin 提供，smoke 不得使用 Vite、源码目录、npm/Maven 或开发者数据。
2. case catalog 固定为 clean install/start/health/open/reopen/exit `6` 项；`LANE-01/LANE-02` 各在独立 install/storage/browser/process/port 中执行一遍，共 `12` 条 attempt evidence，无 retry、skip 或现有进程复用。
3. OPEN 使用真实 UI 创建 P0 Object/Process/Consumption 并记录 Revision、Projection、OPL、Trace digest；REOPEN 以新 Runtime 进程和浏览器上下文验证身份/digest 不变；EXIT 验证正常退出、无残留进程和 SQLite 完整性。
4. Manifest/Report 必须锁定 source build、`package-lock.json`、Maven inputs、Web dist tree、JAR、ZIP、target environment 以及 Intake/Visual/E2E/Performance/Recovery/Candidate 的 exact ref/SHA。
5. Candidate 必须为 `READY_FOR_ACTIVATION`，但 smoke 前中后 production gate 均为 `DISABLED + []`；Release Report READY 后才允许独立 Activation 命令消费 exact Candidate 和 Report。
6. 唯一 case ID、阈值、字段、20 个失败码和 READY 算法由 DEV-CANVAS-06 checklist 的 `GATE-06-06` 执行契约承接。产品发布证据不等于 ISO 19450:2024 符合性证据。

### 10.4 安全

1. 非 loopback 绑定失败；
2. 缺/错 `X-OPM-Session` 拒绝；
3. 非允许 Host/Origin 拒绝写请求；
4. ZIP 路径穿越、绝对路径、符号链接、压缩炸弹和摘要不符拒绝；
5. 日志和 ErrorDetail 不包含会话值、完整敏感路径和模型正文。

## 11. 计划命令与 CI 门槛

DEV-00 工程壳当前已提供以下稳定入口；本次设计文档任务不执行代码构建或测试，这些命令的当前通过状态必须由对应开发任务重新记录：

```text
npm run contract:validate
npm run lint
npm run typecheck
npm run test
npm run build
npm run test:e2e
./mvnw test
./mvnw verify
```

DEV-CANVAS-06 `GATE-06-06` 还冻结以下未来稳定入口；当前仓库尚未实现，不得列为已执行：

```text
npm run release:canvas06:assemble
npm run release:canvas06:smoke
npm run release:canvas06:verify -- --require-ready
```

CI 顺序：静态契约 -> 前后端单元/组件 -> SQLite/API/模块集成 -> OPL golden/视觉 -> 浏览器 E2E -> 性能门槛 -> 打包 smoke。P0 只执行已进入 P0 的门槛；完整画布按 DEV-CANVAS 依赖逐步加入，任何 enabled Capability 的必需阶段失败即阻断合并或发布。Conformance Suite 独立报告，不得被普通测试绿色替代。

## 12. 完成定义

### 12.1 P0

1. 新增行为具有与风险匹配的自动化测试；
2. P0 API 成功和主要失败路径已覆盖；
3. SQLite V1、外键、触发器和事务已在真实 SQLite 验证；
4. E2E-001~010 在发布候选上通过；
5. 没有跳过测试、隔离失败和未解释 flaky；
6. 测试报告记录命令、版本、环境、输入和结果；
7. ISO 页面不出现无证据的“符合”；
8. 回滚/恢复演练通过后才允许发布安装包。

### 12.2 完整画布

1. DEV-CANVAS-00 的 OpenAPI、generated DTO、兼容性和正反 contract test 通过后，才允许 State/Fact 联调；
2. State 与 16/8/10 每个 enabled Capability 都具有 descriptor、端点正反例、领域命令、Rule、Projection 和组件测试；
3. 三个完整 golden 主集合及所有 Profile 允许变体通过，且 Symbol/OPL/Token/Trace/digest 同 Revision 可重复；
4. E2E-CANVAS-001~007 的 `194/194` case 与 `388/388` attempt，以及三视口/三缩放 visual 的 `378/378` case 与 `756/756` attempt 全部通过；
5. NFR-PERF-001~004 的 `7/7` scenario、`11/11` metric instance、7 份 raw sample set 达到第 10.1 节全部延迟、frame、任务时限、样本量、完整性和零失败门槛；
6. Recovery/Rollback 的 `28/28` case 与 `56/56` attempt 证明失败无 partial Revision、强停可重开、幂等不重复提交，部分/全量 gate 回退后已有数据保持只读可渲染；
7. Release Candidate Manifest/Report Schema 合法，exact ZIP 的 `6/6` smoke case 与 `12/12` attempt 通过，Candidate 和 production gate 在 Activation 前保持 `READY_FOR_ACTIVATION + DISABLED + []`；
8. 只有对应 Capability 的 Symbol/Rule/Grammar/golden 依赖闭包均通过，且 Activation 引用 exact READY Release Report 时才可生产启用；
9. 完整工具菜单和产品发布报告不等于 ISO 19450:2024 符合性，界面和报告继续按证据状态显示。

## 13. 事实与假设

### 13.1 事实

1. 当前已有 JSON Schema 样例、P0/完整画布 OpenAPI 设计输入、SQLite V1、无构建浏览器原型和前后端工程；OpenAPI 0.2 发布、generated client/handler 与 Revision 0.2 roundtrip 仍按 DEV-CANVAS-00/03 验收；
2. 当前已有前端lint/typecheck/unit/build/E2E与Maven test/verify命令入口，DEV-CANVAS-06现行Gate设计输入均已冻结；活动Adapter Request `0.2`、Adapter Test Input Bundle `0.1`、Clone Result或Runtime Ready机器Schema存在不等于Builder/Verifier或03C已实现，Java Base/Clone/Web局部实现和单个STATE_ROLES验证也不等于Node consumer、fault完整验收、8 base/144 clone或checklist通过。历史E2E Manifest v01 builder已实现不等于活动v02 producer/verifier完成；当前Common 43文件root仅为self-verified，统一Handoff `0.2`/Intake/Runtime/Web/Common生产链尚未实现或执行。Common Driver、三个selector、Fact删除入口、store和factory已存在且在后继编排包中只读；controlled orchestration唯一归Runner Source Set第1项但尚未实现。Visual/E2E/Performance/Recovery/Release Candidate的真实release runner、production reports、production Web打包、CI发布流水线和安装包仍未形成；不得由部分Schema、03A Materializer/verifier、Common root或既有Driver/UI推导production Gate；
3. SQLite 与发布数据库相同，持久层测试不采用 H2 替代。

### 13.2 假设/待实现

1. Java 21、SQLite/Flyway 与完整依赖组合可满足第 11 章后端验证，仍需对应开发任务实测；
2. 正式规模数据集和完整画布大图 fixture 将由 DEV-09/DEV-CANVAS-06 形成并冻结摘要；性能阈值和采样方法已冻结，但尚无执行结果；
3. X6 能满足完整 marker、fan、State containment 和大图性能，仍需组件、视觉、E2E 和性能证据；
4. 完整 ISO Conformance Suite 在 Profile/Rule/Grammar/Symbol 全量资产完成后独立建设。
