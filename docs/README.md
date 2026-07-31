# OPM 单机建模工具文档索引

更新时间：2026-07-31

## 1. 文档目的

本文档是 OPM 单机建模工具需求、标准、架构和后续开发准备材料的统一入口。

当前全部设计责任已按 `design/opm-design-freeze-baseline.md` 冻结：`20` 项为 `FROZEN_INCLUDED`、`10` 项为 `FROZEN_DEFERRED`、`0` 项为 `BLOCKED`，全局开发门为 `READY_FOR_DEVELOPMENT`。该状态只表示开发输入闭合；对应机器资产、完整 ISO 证据、发布候选和真实性能结果仍以各开发包的实施报告为准。

## 2. 正式入口

### 2.0 全量设计冻结与开发准入

1. `design/opm-design-freeze-baseline.md`：唯一设计冻结状态源、当前/延期范围、浏览器矩阵、责任 owner、机器契约目标、开发准入算法和变更入口。
2. `../specs/opm-all-design-freeze-task-spec.md` 与 `checklists/opm-all-design-freeze-checklist.md`：本次冻结规格、Spec Mapping、差异关闭和验证记录。

### 2.1 产品需求

1. `requirements/opm-online-modeling-tool-requirements.md`：产品目标、范围、功能、非功能和验收基线。
2. `requirements/opm-requirement-acceptance-matrix.md`：`FR/NFR/CAP` 逐项验收追踪。

### 2.2 标准与语义

1. `requirements/opm-profile-capability-matrix.md`：ISO 与中文草案配置档能力目录。
2. `requirements/iso-19450-2024-conformance-matrix.md`：ISO Clause 4-14 与 Annex A 子条款规则组。
3. `requirements/opm-common-semantic-core.md`：公共事实、条件归一化和配置档专属隔离边界。

### 2.3 架构与模块

1. `design/opm-modeling-tool-architecture.md`：系统边界、分层、模块依赖、事务和架构决策。
2. `design/opm-modeling-tool-module-design.md`：M01-M12 职责、逻辑契约、数据所有权和关键流程。

### 2.4 页面与交互

1. `design/opm-modeling-workbench-page-design.md`：P01-P06 页面组、工作台 IA、主动作、守卫和回流。
2. `design/opm-modeling-workbench-state-model.md`：导航、编辑、保存、文本、校验、选择、弹层和任务状态。
3. `design/opm-modeling-workbench-field-region-detail.md`：页面区块、字段来源、编辑性和动作守卫。
4. `design/opm-modeling-workbench-component-interaction.md`：组件树、交互事件、模块契约映射和原型关注点。
5. `design/opm-complete-canvas-toolchain-design.md`：State、图标工具链、关系候选、16/8/10 全量能力映射、字段/事件/键盘/响应式和验收矩阵。

### 2.5 应用与数据契约

1. `design/opm-modeling-tool-application-api-contract.md`：应用命令/查询、包络、revision/幂等、任务和错误语义。
2. `design/opm-modeling-tool-persistence-contract.md`：逻辑数据对象、Revision 提交包、原子事务、迁移和恢复。
3. `design/opm-native-exchange-package-contract.md`：原生包 Manifest、内容分区、身份、兼容性和 staging 导入。

### 2.6 字段级 Schema

1. `design/opm-core-metamodel-field-schema.md`：Model、Element、Fact、Context、Text、Validation 和 Revision 字段、不变量与迁移。
2. `design/opm-profile-package-field-schema.md`：Profile Identity、96 项 Capability、Symbol、Grammar、Adapter、依赖闭包与迁移。
3. `design/opm-rule-definition-field-schema.md`：103 个规则组及后续原子规则的 Selector、声明式 AST、Finding、Evidence 与依赖 DAG。

### 2.7 开发技术与机器契约

1. `design/opm-development-technology-baseline.md`：ARC-007/008/009、运行拓扑、技术栈和工程结构。
2. `design/opm-physical-data-and-migration-design.md`：SQLite、资产目录、迁移、`.opmp` 和恢复。
3. `design/opm-symbol-and-text-generation-implementation-contract.md`：P0 与完整画布的 symbol/marker/label slot/route、Control/Structural concrete OPL、precedence、Token/Trace 和 golden manifest。
4. `contracts/schemas/*.json`：Revision、Profile、Rule Set JSON Schema 2020-12。
5. `contracts/examples/*.json`：三个通过 Schema 验证的代表样例。
6. `contracts/openapi/opm-local-api-v1.yaml`：P0 本地 HTTP OpenAPI 3.1。
7. `contracts/migrations/sqlite/*`：SQLite Flyway V1 与验证 SQL。

### 2.8 原型、handoff 与执行包

1. `../prototype/`：P01-P06 无构建交互原型。
2. `design/opm-prototype-acceptance-report.md`：桌面/移动、状态和交互验收结果。
3. `design/opm-frontend-handoff.md`：P0 与完整画布增量的 route/store/X6/API 交付标注。
4. `design/opm-test-strategy.md`：分层测试、fixture、E2E 和发布门槛。
5. `design/opm-development-execution-pack.md`：DEV-00~09、DEV-CANVAS-00~06 的范围、DoD、联调、回滚和就绪矩阵。

### 2.9 执行记录

1. `checklists/opm-online-modeling-tool-requirements-checklist.md`：Task 1-18 的 Spec Mapping、范围和验证记录。
2. `checklists/opm-complete-canvas-toolchain-design-checklist.md`：完整画布设计补齐的 Spec Mapping、覆盖和验证记录。
3. [`DEV-CANVAS-05 规格`](../specs/opm-dev-canvas-05-opl-trace-golden-task-spec.md) 与 `checklists/opm-dev-canvas-05-opl-trace-golden-checklist.md`：OPL/Trace/golden 机器实现边界。
4. [`DEV-CANVAS-06 规格`](../specs/opm-dev-canvas-06-toolchain-release-task-spec.md) 与 `checklists/opm-dev-canvas-06-toolchain-release-checklist.md`：工具链、视觉、E2E、性能和发布边界。

## 3. 建议阅读顺序

### 3.1 产品与标准评审

1. 全量设计冻结基线；
2. 产品需求规格；
3. 配置档能力矩阵；
4. ISO 条款级符合性矩阵；
5. 公共语义内核；
6. 需求验收矩阵。

### 3.2 架构设计评审

1. 产品需求规格第 6、9、11、12、13、14 章；
2. 公共语义内核；
3. 顶层技术架构；
4. 模块详细设计；
5. ISO 条款级符合性矩阵和需求验收矩阵。

### 3.3 进入 P0 开发

按以下顺序进入 P0 开发：

1. 全量设计冻结基线；
2. 首批开发执行包；
3. 开发技术基线与顶层架构；
4. 模块详细设计；
5. 前端 handoff 与页面四文档；
6. OpenAPI、JSON Schema 和 SQLite V1；
7. 符号/OPL 实现契约；
8. 测试策略；
9. 原型验收报告。

### 3.4 进入完整画布开发

1. 全量设计冻结基线第 2、6、8 章；
2. 完整画布工具链设计；
3. 符号与文本生成实现契约第 3、5、7、9、10 章；
4. 前端 handoff 第 7.4 章及 Store/X6/接口扩展；
5. 开发执行包 `DEV-CANVAS-00~06`；
6. 核心元模型、Profile 能力矩阵和应用 API 契约；
7. `DEV-CANVAS-00` 将冻结的 OpenAPI/Revision 0.2 目标转为版本化机器契约、generated client 和正反 contract test。

## 4. 当前设计职责

| 设计职责 | 承接文档 | 状态 |
| --- | --- | --- |
| 全量设计状态与开发门 | 全量设计冻结基线 | `FROZEN_INCLUDED`；唯一状态源 |
| 产品顶层需求 | 产品需求规格 | `FROZEN_INCLUDED` |
| 配置档能力目录 | 配置档能力矩阵 | `FROZEN_INCLUDED`；中文专属生产启用为 `FROZEN_DEFERRED` |
| ISO 子条款规则组 | ISO 条款级符合性矩阵 | `FROZEN_INCLUDED`；原子规则与符合性声明为 `FROZEN_DEFERRED` |
| 公共语义边界 | 公共语义内核 | `FROZEN_INCLUDED` |
| 逐项验收入口 | 需求验收矩阵 | `FROZEN_INCLUDED`；执行结果单独记录 |
| 顶层技术架构与模块 | 顶层架构、技术基线、模块设计 | `FROZEN_INCLUDED` |
| 页面、状态、字段与组件 | 页面四文档 + handoff | `FROZEN_INCLUDED`；P04-P06 生产实现为 `FROZEN_DEFERRED` |
| 完整画布专题设计 | 完整画布工具链设计 | `FROZEN_INCLUDED` |
| Control/Structural OPL 输入 | 符号与文本契约 | `FROZEN_INCLUDED` |
| 应用 API 与完整画布目标机器契约 | 应用 API + OpenAPI + 冻结基线第 6 章 | `FROZEN_INCLUDED`；0.2 发布/生成/测试待实现 |
| Revision/持久化/交换 | 字段、持久化、物理与交换契约 | `FROZEN_INCLUDED`；Revision 0.2 机器发布待实现 |
| 原型、handoff、测试与执行包 | 验收报告 + 三份开发准备文档 | `FROZEN_INCLUDED` |
| DEV-CANVAS-05/06 Gate | 两份 spec + checklist | `FROZEN_INCLUDED`；运行证据以对应报告为准 |
| 完整 ISO Grammar/Symbol/Conformance | 冻结基线 `DFD-004~007` | `FROZEN_DEFERRED` |
| 完整画布实现与发布证据 | DEV-CANVAS-00~06 | 实施状态，不参与设计冻结；未执行项保持 `NOT_RUN` |

## 5. 当前关键决策状态

| 决策 | 状态 | 来源 |
| --- | --- | --- |
| 单用户单机、本地优先 | 已确认 | 产品需求规格 |
| 统一语义事实源 | 已确认 | 产品需求规格、公共语义内核 |
| 两个用户配置档，公共核心不作为第三配置档 | 已确认 | 配置档能力矩阵、公共语义内核 |
| 本地优先模块化单体 | 已冻结逻辑决策 | 顶层技术架构 ARC-001 |
| 语义、文本、追踪和校验摘要按修订提交 | 已冻结逻辑决策 | 顶层技术架构 ARC-004 |
| loopback 本地应用服务 + 默认浏览器 | ACCEPTED | ARC-007、开发技术基线 |
| SQLite 项目库 + 资产目录 + `.opmp` ZIP；首发 exchange/reader 均为 `1.0` | ACCEPTED | ARC-008、物理数据设计、原生交换契约 v1.1 |
| Vue 3/X6 + Spring Boot/Java 21 + SQLite/Flyway | ACCEPTED | ARC-009、开发技术基线 |
| P01-P06 页面组和五区建模工作台 | 已通过原型验收 | 页面专题设计、验收报告 |
| 视口缩放与语义 in/out-zoom 使用不同状态和事件 | 已冻结交互边界 | 页面状态、字段和组件交互文档 |
| 应用 API 先冻结语义，P0 映射本地 HTTP | 已冻结 | 应用 API、OpenAPI |
| Revision 不可变，Draft Head 指向新 Revision 演化 | 已冻结逻辑边界 | 持久化契约 |
| 原生交换包不是 ISO 标准交换格式 | 已冻结声明边界 | 原生交换包契约 |
| Schema/storage/exchange/Profile/rule/model revision 版本相互独立 | 已冻结逻辑边界 | 三份字段级 Schema、持久化与交换契约 |
| 规则仅使用受控声明式 AST，不执行包内脚本和网络调用 | 已冻结安全边界 | Rule Definition 字段级 Schema |
| State 不是 Element，ISO Profile 禁止 Process State | 已冻结语义边界 | 核心元模型、完整画布设计 |
| 通用工具用图标，OPM 工具用 Symbol Catalog 缩略符号 | 已冻结 handoff | 完整画布设计、前端 handoff |
| 完整关系使用分组搜索目录和服务端候选，不平铺、不前端硬编码合法性 | 已冻结交互边界 | 完整画布设计 |
| 完整画布先闭合并验收 API-EDT-001/002，再按 Capability 分批启用 | 已冻结实施顺序 | 开发执行包 DEV-CANVAS-00~06 |
| ISO Control 使用基础 Fact 上的 `control.capability/control.segment` 成对 Modifier，不创建独立 Control Fact | 已冻结持久化边界 | 核心元模型、应用 API、逻辑/物理持久化契约 |
| ISO 19450:2024 不存在 Clause 15；Link 语义强度、EBNF 优先级和产品句序分离 | 已冻结标准解释边界 | 符号与文本契约 7.4、标准 Annex A |
| 完整画布性能门槛为产品阈值，不是 ISO 要求 | 已冻结验收边界 | 产品需求 NFR-PERF-001~004、DEV-CANVAS-06 规格 |

## 6. 维护规则

1. 需求编号、能力编号、规则组编号和模块编号不得在不同文档建立冲突定义。
2. 需求或配置档变化时，同步检查验收矩阵、符合性矩阵、公共内核和架构模块归属。
3. 架构决策状态必须使用 `ACCEPTED/PROPOSED/DEFERRED`，不得把推荐项静默写成事实。
4. 新增页面、接口、原型或开发准备文档后，必须同步本索引和建议阅读顺序。
5. 测试设计、规则实现和执行证据分开管理，不把“有验收入口”表述为“已经通过测试”。
6. 全局设计状态和开发门只由 `design/opm-design-freeze-baseline.md` 计算；任一冻结输入变化先关闭开发门，再评审和升版。
