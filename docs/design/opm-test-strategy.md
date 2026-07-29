# OPM 单机建模工具测试策略

文档版本：`v0.4-draft`

文档状态：P0 与完整画布分阶段测试基线冻结；生产与 ISO 符合性证据待实现

更新时间：2026-07-29

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
| 安装 smoke | 发布形态 | 空目录 + 示例包 | loopback，无外网依赖 |

每个测试必须使用独立项目库和资产目录。禁止复用开发者真实项目库、`~/OPM Studio` 或生产备份目录。

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
| `complete-canvas-large-opd` | DEV-CANVAS-06 测试 factory | 300/600 需求基线与 1000/2000 设计压力集 |
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

桌面最小矩阵：`1440x900`、`1280x800`。窄视口设计回归：`390x844`，保证页面无全局横向溢出；P0 生产定位仍为桌面优先。完整画布还必须在 `25%/100%/400%` 对 State、全部 marker、长标签、fan、候选层和检查器执行 visual golden 与 canvas pixel 非空/遮挡检查。

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

### 10.2 可靠性与恢复

在 Candidate、Rule、Symbol/Grammar 解析、OPL、Trace、SQLite commit、Head update、Projection 回读和资产写入阶段注入失败；验证无部分 Revision、无错误 Head、候选可恢复且不会显示为 committed。对 option/impact token 过期、digest mismatch、State owner mismatch、fan 成员冲突和 Control 非法 segment 使用稳定错误断言。强制终止运行时后重启，检查任务终态、临时文件清理和最近耐久 Revision 重开。

### 10.3 安全

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
4. E2E-CANVAS-001~007、三视口、三缩放比例 visual golden 和 canvas pixel 检查通过；
5. NFR-PERF-001~004 达到第 10.1 节全部延迟、frame、任务时限、样本量和零失败门槛；
6. 失败注入证明任一阶段失败无 partial Revision，feature gate 回滚后已有数据保持只读可渲染；
7. 只有对应 Capability 的 Symbol/Rule/Grammar/golden 依赖闭包均通过时才可生产启用；
8. 完整工具菜单不等于 ISO 19450:2024 符合性，界面和报告继续按证据状态显示。

## 13. 事实与假设

### 13.1 事实

1. 当前已有 JSON Schema 样例、P0 OpenAPI、SQLite V1、无构建浏览器原型、DEV-00 前后端工程壳，以及尚未完成验收的完整画布 OpenAPI 部分草案；
2. 当前已有前端 lint/typecheck/unit/build/E2E 与 Maven test/verify 命令入口，但没有 P0 业务闭环、闭合的完整画布机器契约、CI 发布流水线或安装包；
3. SQLite 与发布数据库相同，持久层测试不采用 H2 替代。

### 13.2 假设/待实现

1. Java 21、SQLite/Flyway 与完整依赖组合可满足第 11 章后端验证，仍需对应开发任务实测；
2. 正式规模数据集和完整画布大图 fixture 将由 DEV-09/DEV-CANVAS-06 形成并冻结摘要；性能阈值和采样方法已冻结，但尚无执行结果；
3. X6 能满足完整 marker、fan、State containment 和大图性能，仍需组件、视觉、E2E 和性能证据；
4. 完整 ISO Conformance Suite 在 Profile/Rule/Grammar/Symbol 全量资产完成后独立建设。
