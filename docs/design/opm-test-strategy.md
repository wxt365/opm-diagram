# OPM 单机建模工具测试策略

文档版本：`v0.1-draft`

文档状态：P0 开发测试基线冻结

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 目标与边界

本文档冻结 OPM 单机建模工具首批开发的测试层级、环境、夹具、关键场景、执行门槛和证据边界。测试策略覆盖 P01-P03、Object/Process/Consumption/System Diagram、Revision、OPL、校验、本地 SQLite 与最小基线闭环。

测试通过不自动等同 ISO 19450:2024 符合性。只有映射到完整 Profile、Rule、Grammar、Symbol 和标准证据的专用 Conformance Suite 才能提供符合性证据。

## 2. 测试原则

1. Semantic Model 规则优先纯单元测试；
2. HTTP 参数、状态码、会话头和错误映射使用 Web/API 切片测试；
3. SQLite 方言、索引、触发器、外键和事务使用真实 SQLite，不使用 H2 替代；
4. 模块协作和原子提交使用 Spring Boot 集成测试；
5. P01-P03 主路径、图文联动和只读守卫使用浏览器 E2E；
6. X6 Cell、DOM、viewport 和面板状态不得进入领域测试的事实输入；
7. 时间、ID、摘要、任务调度和文件位置必须可注入，避免不稳定测试；
8. 先执行定向测试，再扩大到模块、全量和打包 smoke；
9. 未执行的验证不得写成通过，旧报告不得作为当前 Revision 的证据。

## 3. 测试层级

| 层级 | 主要对象 | 最小工具 | 失败定位 | P0 门槛 |
| --- | --- | --- | --- | --- |
| Schema/静态契约 | JSON Schema、OpenAPI、SQL、Profile/Rule 样例 | Ajv、Swagger Parser、SQLite CLI | 文件/路径/字段 | 必须 |
| 领域单元 | Element、Fact、Context、Command、Rule AST、OPL Planner | JUnit 5 | 类/规则/Case | 必须 |
| 前端单元 | store、command adapter、projection mapper、guard | Vitest | composable/store | 必须 |
| 组件 | Object/Process node、Consumption edge、面板和弹层 | Vitest + DOM renderer | component | 必须 |
| Web/API 切片 | `/api/v1`、ErrorDetail、会话/Revision/幂等守卫 | Spring MVC test | operationId | 必须 |
| 持久层 | Flyway V1、repository、事务、不可变触发器 | SQLite 临时项目库 | migration/repository | 必须 |
| 模块集成 | 编辑 -> 规则 -> OPL -> Trace -> Revision -> 保存 | Spring Boot test | application use case | 必须 |
| 浏览器 E2E | P01-P03 主路径、只读/阻断/恢复 | Playwright | page_id/scenario | 必须 |
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
| `empty-project` | 测试 factory | P01/P02 空状态 |
| `baseline-project` | 测试 factory | 不可变基线与建草稿 |
| `conflict-project` | 测试 factory | revision/idempotency 冲突 |
| `broken-asset-package` | 测试资源 | digest、缺文件和路径穿越拒绝 |

Fixture 必须由稳定 ID 和固定时钟生成。golden 更新必须经过设计/标准变更评审，禁止为通过测试无说明覆盖。

## 6. P0 领域与文本用例

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

## 7. API 契约用例

每个 OpenAPI operationId 至少覆盖：成功、输入非法、未找到、会话失败和适用的业务冲突。

| API | 必测行为 |
| --- | --- |
| API-PRJ-001/002/003 | 分页稳定、创建幂等、项目不存在 |
| API-PRJ-006/007/009 | 初始 Revision/Context、Profile 资产缺失、打开模式 |
| API-CTX-001/002 | `read_revision` 一致、历史只读投影 |
| API-EDT-001/002 | Capability 过滤、revision/profile/rule/idempotency 守卫、原子结果 |
| API-TXT-001 | revision 新鲜度、Trace、生成阻断 |
| API-VAL-001 | `202 + task_id`、固定输入、过期结果不覆盖当前 |
| API-VER-001/004 | 不可变 Revision、基线门槛、无部分基线 |
| API-TSK-001/004 | 状态查询、SSE 断线后回查、终态一致 |

全局断言：16 个 operationId 唯一；5 个写操作声明 `localSession`；写请求校验 `Host/Origin/X-OPM-Session`；错误响应不暴露堆栈和敏感本地路径。

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

桌面最小矩阵：`1440x900`、`1280x800`。窄视口设计回归：`390x844`，保证页面无全局横向溢出；P0 生产定位仍为桌面优先。

## 10. 非功能验证

### 10.1 性能

性能数据集和阈值以需求 NFR 为准。首批至少测量：打开项目、打开 100/500/1000 Construct 的 Context、单命令提交、增量 OPL、全量校验、1000 条 Finding 筛选和 100 Revision 列表。

结果必须报告数据规模、机器、冷/热启动、P50/P95 和失败率。原型响应时间不作为生产性能证据。

### 10.2 可靠性与恢复

在 Candidate、Rule、OPL、SQLite commit、Head update 和资产写入阶段注入失败；验证无部分 Revision、无错误 Head、可从最近耐久点恢复。强制终止运行时后重启，检查任务终态与临时文件清理。

### 10.3 安全

1. 非 loopback 绑定失败；
2. 缺/错 `X-OPM-Session` 拒绝；
3. 非允许 Host/Origin 拒绝写请求；
4. ZIP 路径穿越、绝对路径、符号链接、压缩炸弹和摘要不符拒绝；
5. 日志和 ErrorDetail 不包含会话值、完整敏感路径和模型正文。

## 11. 计划命令与 CI 门槛

以下命令是开发脚手架必须提供的稳定入口，当前文档仓库尚未包含生产工程，因此本轮没有执行：

```text
npm run lint
npm run typecheck
npm run test
npm run test:e2e
mvn test
mvn verify -P integration
mvn flyway:validate -P sqlite-test
```

CI 顺序：静态契约 -> 前后端单元/组件 -> SQLite/API/模块集成 -> 浏览器 E2E -> 打包 smoke。任一 P0 阶段失败即阻断合并；Conformance Suite 独立报告，不得被普通测试绿色替代。

## 12. 完成定义

1. 新增行为具有与风险匹配的自动化测试；
2. P0 API 成功和主要失败路径已覆盖；
3. SQLite V1、外键、触发器和事务已在真实 SQLite 验证；
4. E2E-001~010 在发布候选上通过；
5. 没有跳过测试、隔离失败和未解释 flaky；
6. 测试报告记录命令、版本、环境、输入和结果；
7. ISO 页面不出现无证据的“符合”；
8. 回滚/恢复演练通过后才允许发布安装包。

## 13. 事实与假设

### 13.1 事实

1. 当前已有 JSON Schema 样例、OpenAPI、SQLite V1 和无构建浏览器原型验证；
2. 当前尚无生产前端、后端、CI 和安装包，因此本策略中的生产测试未执行；
3. SQLite 与发布数据库相同，持久层测试不采用 H2 替代。

### 13.2 假设/待实现

1. 开发脚手架将提供第 11 章命令；
2. 正式规模数据集在 P0 领域模型稳定后生成；
3. 完整 ISO Conformance Suite 在 Profile/Rule/Grammar/Symbol 全量资产完成后独立建设。
