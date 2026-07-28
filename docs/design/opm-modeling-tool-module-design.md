# OPM 单机建模工具模块详细设计

文档版本：`v0.5-draft`

文档状态：M01-M12 职责与 P0 开发边界冻结

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档范围

本文档在顶层技术架构基础上细化 M01-M12 的职责、输入输出、依赖、内部组件、逻辑数据所有权、关键流程、异常边界和一期优先级。

本文档中的组件名和契约名用于约束职责，不是已冻结代码类名、HTTP API、数据库表名或异步消息主题。

## 2. 关联文档

1. `docs/design/opm-modeling-tool-architecture.md`
2. `docs/requirements/opm-online-modeling-tool-requirements.md`
3. `docs/requirements/opm-common-semantic-core.md`
4. `docs/requirements/opm-profile-capability-matrix.md`
5. `docs/requirements/iso-19450-2024-conformance-matrix.md`
6. `docs/requirements/opm-requirement-acceptance-matrix.md`
7. `docs/design/opm-modeling-workbench-page-design.md`
8. `docs/design/opm-modeling-workbench-state-model.md`
9. `docs/design/opm-modeling-workbench-field-region-detail.md`
10. `docs/design/opm-modeling-workbench-component-interaction.md`
11. `docs/design/opm-modeling-tool-application-api-contract.md`
12. `docs/design/opm-modeling-tool-persistence-contract.md`
13. `docs/design/opm-native-exchange-package-contract.md`
14. `docs/design/opm-core-metamodel-field-schema.md`
15. `docs/design/opm-profile-package-field-schema.md`
16. `docs/design/opm-rule-definition-field-schema.md`

## 3. 设计前提

1. 首期为单用户、单设备、本地运行；
2. 模块部署在同一应用运行时，模块边界是代码和测试边界；
3. Semantic Model 是唯一正式事实源；
4. 两配置档共享公共核心，但规则、图形、文本和扩展独立；
5. OPD、导航树、System map、model view、文本和问题列表均为投影；
6. 正式语义编辑必须先完成阻断校验和文本生成，再原子提交；
7. 本轮不选择具体编程语言、框架、图形库和数据库。

## 4. 模块总览

| 模块 | 模块内主要组件 | 拥有的数据 | 禁止职责 |
| --- | --- | --- | --- |
| M01 应用壳与工作台 | App Shell、Workbench Router、View Adapter、Command Feedback | 临时 UI 状态、视口状态 | 不拥有 Semantic Model，不直接访问存储 |
| M02 项目与工作区 | Project Application、Workspace Session、Search Application | 活动项目/模型会话引用 | 不实现 OPM 规则 |
| M03 编辑会话与命令 | Command Bus、Draft Session、Undo Manager、Commit Coordinator | 候选修订、命令栈、脏状态 | 不持久定义规则，不直接生成文本句式 |
| M04 公共语义内核 | Element Model、Fact Model、Invariant Guard、Identity Service | Element、Fact、核心不变量 | 不包含 UI 布局和配置档专属图形 |
| M05 OPD 上下文与投影 | Context Model、Occurrence Model、Refinement Manager、Projection Builder | Context、Occurrence、Refinement Edge、语义布局 | 不复制 Element/Fact 作为图私有事实 |
| M06 配置档与规则治理 | Profile Registry、Capability Catalog、Rule Registry、Conversion Analyser | Profile Package、Rule Definition、规则版本 | 不执行 UI 命令，不保存模型版本 |
| M07 校验与符合性 | Validation Pipeline、Finding Service、Conformance Aggregator | Finding、Validation Report、Conformance Summary | 不修改模型来“自动通过”规则 |
| M08 OPL/OPT 生成与追踪 | Text Planner、Sentence Generator、Paragraph Composer、Trace Index | Text Artifact、Text Trace | 不接受直接文本编辑作为事实 |
| M09 版本、基线与历史 | Autosave、Snapshot、Diff、Baseline、Operation History | Revision、Snapshot、Baseline、Operation Record | 不把 Undo 栈当作耐久审计记录 |
| M10 交换、备份与恢复 | Native Package、Import Staging、Exporter、Backup/Restore | Import Plan、Export/Backup Manifest | 不在校验前覆盖活动模型 |
| M11 架构方法与语义资产 | Architecture Classification、Method Check、Decision Record、Asset Publisher | 方法标记、问题处置、发布包描述 | 不把方法建议混入语言合规错误 |
| M12 本地持久化与任务执行 | Project Store Adapter、File Gateway、Atomic Writer、Task Runner | 持久化实现、索引、临时任务状态 | 不拥有业务规则或产品状态机 |

## 5. 模块详细设计

### 5.1 M01 应用壳与工作台

目标：为项目、编辑、文本、问题、版本和导出提供统一本地交互入口。

主输入：应用查询结果、投影、命令结果、后台任务进度。

主输出：用户命令、查询条件、视口状态、文件选择结果。

必须满足：

1. 页面只通过应用层用例访问模型；
2. 正式状态、候选状态、保存中、保存失败和阻断状态可辨识；
3. 视口缩放不产生语义命令；
4. OPD 元素、文本语句和问题定位共享稳定追踪标识；
5. 键盘和鼠标均可完成核心操作；
6. 不仅依赖颜色表达错误、可见性或引用状态。

非目标：页面信息架构、组件树和视觉规范在页面设计包中定义。

### 5.2 M02 项目与工作区

目标：管理本地 Project、Model 和活动 Workspace Session。

主输入：创建、打开、重命名、归档、恢复、搜索和切换模型请求。

主输出：项目摘要、模型列表、活动模型句柄、Profile Binding 和搜索结果。

固定规则：

1. 创建 Model 时必须绑定 Profile 及版本；
2. 打开 Model 时验证格式、配置档、规则资产和恢复状态；
3. 同一活动 Model 首期只允许一个写 Session；
4. 配置档切换不是普通字段修改，必须调用 M06 转换分析并产生新修订；
5. Project 归档只改变工作区可见状态，不删除模型数据；
6. 搜索读取索引，不绕过稳定 ID 和 Context occurrence 定位。

### 5.3 M03 编辑会话与命令

目标：把编辑器意图编排成可验证、可撤销、可原子提交的模型命令。

内部组件：

| 组件 | 职责 |
| --- | --- |
| Command Bus | 按命令类型路由处理器并绑定 `command_id` |
| Draft Session | 持有活动修订、候选修订和脏状态 |
| Undo Manager | 保存当前会话可逆命令和逆操作，不承担版本历史 |
| Impact Resolver | 计算受影响 Element、Fact、Context、Sentence 和 Rule 集合 |
| Commit Coordinator | 串联 M06、M04、M05、M07、M08、M12 完成提交 |

命令最小包络：

- `command_id`：会话内幂等标识；
- `model_id`、`context_id`；
- `base_revision`：防止旧命令覆盖新修订；
- `command_type` 和结构化 payload；
- `profile_version`、`rule_version`；
- 本地发生时间仅用于记录，不用于冲突排序。

命令结果必须区分：成功、配置档禁止、语义拒绝、阻断校验、文本生成失败、修订冲突和持久化失败。

### 5.4 M04 公共语义内核

目标：维护 Element、Fact、身份和配置档无关的核心不变量。

主输入：已通过能力预检的结构化语义命令、导入归一化结果。

主输出：候选 Semantic Model、变更集和不变量问题。

拥有：

- Semantic Model、Profile Reference；
- Semantic Element、Object、Process；
- Semantic Fact、Transformation Fact、Enabling Fact；
- 稳定 ID、来源配置档和原始类型；
- 端点、方向、修饰和归一化等级。

固定不变量直接引用 `CORE-INV-001~008`。M04 只执行公共不变量；ISO 或中文专属端点、命名和文本规则由 M06/M07 负责。

M04 不保存：画布坐标、颜色、视口比例、生成文本内容、问题展示状态和文件路径。

### 5.5 M05 OPD 上下文与投影

目标：在不复制语义事实的前提下管理多 OPD、Occurrence、细化和导航投影。

内部模型：

- `Context`：SD、过程细化、对象细化或 model view；
- `Occurrence`：Element/Fact 在 Context 中的出现；
- `Refinement Edge`：refineable、refinee、细化方式和父子 Context；
- `Layout`：普通布局与语义布局分区；
- `View Definition`：筛选条件和稳定 Fact 来源。

投影：当前 OPD、process tree、object forest、System map、model view、上下文路径和出现位置索引。

规则：

1. process tree、object forest 和 model view 分别建模，不合成一棵无类型树；
2. ISO SD 单根约束由 M07 基于 M05 投影验证；
3. 删除 Context 前输出 owner、reference、refinement 和 view 影响；
4. Process in-zoom 垂直偏序进入语义布局，普通坐标不进入 Fact；
5. Element 改名通过稳定 ID 传播到全部 Occurrence；
6. View 删除不删除被引用 Fact。

### 5.6 M06 配置档与规则治理

目标：提供版本化 Profile Package、能力目录、规则目录和跨配置档转换分析。

`Profile Package` 逻辑组成：

| 组成 | 内容 |
| --- | --- |
| Identity | profile ID、版本、状态和兼容范围 |
| Capability Catalog | Element、Relation、Modifier、Context 能力及状态 |
| Symbol Catalog | 图形符号、锚点和组合规则引用 |
| Rule Set | 原子规则、严重等级、依赖和执行阶段 |
| Text Grammar | ISO OPL 或中文 OPT 句式与生成规则 |
| Normalization Adapter | source fact 与公共核心的归一化/反归一化规则 |
| Migration Rules | 配置档升级影响和迁移策略 |

规则执行阶段：

1. `COMMAND_FILTER`：面板、菜单和端点候选过滤；
2. `PRE_COMMIT`：结构、端点、命名、上下文和可生成性阻断；
3. `POST_COMMIT`：完整性、质量和方法建议；
4. `BASELINE_GATE`：全量规则和符合性汇总；
5. `CONVERSION`：目标配置档无损、有损和不可映射分析。

原子 `shall` 规则将归属 M06，但规则执行由 M07 负责。规则定义不得调用 UI 或直接写模型。

Profile Package 的字段、96 项能力闭包、符号/语法/适配器依赖和迁移由 `opm-profile-package-field-schema.md` 承接；Rule Definition 的五阶段 Selector、声明式 AST、Finding、Evidence 和依赖 DAG 由 `opm-rule-definition-field-schema.md` 承接。

### 5.7 M07 校验与符合性

目标：执行规则并产生可定位、可追溯、分级明确的结论。

校验流水线：

1. 公共核心不变量；
2. 当前配置档语法和语义规则；
3. OPD 上下文与跨图事实一致性；
4. 文本可生成性和追踪完整性；
5. 模型完整性与质量；
6. 架构方法建议；
7. ISO 符合性聚合。

`Validation Finding` 至少包含：finding ID、规则 ID/版本、等级、说明、修复建议、model/context/element/fact 定位、输入修订和配置档版本。

严重等级：

- `BLOCKING`：禁止正式提交或基线；
- `WARNING`：允许保存草稿，基线策略按规则决定；
- `SUGGESTION`：不影响语言合规；
- 方法建议使用独立 category，不与标准错误混合统计。

符合性汇总使用 `ISOR-*` 规则组及后续原子规则，只能输出部分符合、完全符合、不符合或无法判断；缺证据时不得输出符合。

### 5.8 M08 OPL/OPT 生成与追踪

目标：从候选或已提交语义修订确定性生成当前配置档文本。

内部步骤：

1. Text Planner 根据变更集选择受影响 Fact/Context；
2. Sentence Generator 按 Profile Grammar 生成句子；
3. Paragraph Composer 按 OPD 和全模型顺序组装；
4. Trace Index 保存 Fact/Construct/Sentence 多对多关系；
5. 输出 Text Artifact 和文本差异。

规则：

1. ISO 只生成英文 OPL，中文配置档生成 OPT；
2. 每个 Sentence 绑定生成规则和输入 Fact；
3. 每个 OPD 生成对应 Paragraph/章节；
4. 无法生成合法文本返回阻断结果，不输出占位正式句；
5. Annex A 不覆盖的概率、路径和复杂约束使用正文规则和黄金文本；
6. 文本缓存的修订或规则版本不匹配时必须重建。

### 5.9 M09 版本、基线与历史

目标：区分会话撤销、草稿保存、命名快照、不可变基线和操作记录。

| 对象 | 可变性 | 创建条件 | 用途 |
| --- | --- | --- | --- |
| Draft Revision | 可继续产生新修订 | 每次正式编辑提交 | 当前工作状态 |
| Autosave Checkpoint | 不原地改语义，指向最新耐久修订 | 自动保存成功 | 异常恢复 |
| Named Snapshot | 不可变 | 用户命名并填写说明 | 阶段比较 |
| Baseline | 不可变 | 全量阻断校验通过并由用户确认 | 发布和下游消费 |
| Operation Record | 追加 | 本地动作完成或失败 | 诊断和追溯 |

Diff 以稳定 ID 对齐 Element、Fact、Context 和 Occurrence；布局差异与语义差异分开呈现。规则升级不能重写旧 Baseline 的结论，只能生成新规则重检报告或迁移版本。

### 5.10 M10 交换、备份与恢复

目标：以 staging 和 manifest 保证外部文件边界安全、可验证和原子。

导入阶段：

1. 文件安全检查；
2. 格式和版本识别；
3. 解包到隔离 staging；
4. 结构、标识和配置档校验；
5. 归一化并建立 Import Plan；
6. 全量阻断校验和文本试生成；
7. 用户确认后创建新草稿或新项目；
8. 原子提交并记录结果。

导出阶段读取不可变修订快照。SVG/PNG/PDF、文本和资产包均带模型、配置档、规则和生成时间元数据。

备份必须覆盖项目数据、Profile Binding、版本、基线和必要资产；恢复默认创建新项目，覆盖式恢复需额外确认并保持回退点。

### 5.11 M11 架构方法与语义资产

目标：在语言合规之外提供任务/功能/产品架构方法检查和受控资产输出。

职责：

- 架构层分类和跨层追溯；
- `6x1` 角色检查；
- 功能信息模式、边界和实现追溯建议；
- 架构问题、方案、依据、决策和豁免；
- OPM 基线到本体平台发布包的准备。

方法规则输出独立 category。OPM 模型或基线在未完成映射、校验和发布前，只能标记为本体上游语义源。

### 5.12 M12 本地持久化与任务执行

目标：实现上层端口，不承载 OPM 业务规则。

端口：

- `ProjectStore`：事务读写修订、快照、基线和索引；
- `AssetStore`：受控管理图像、报告、导入和备份文件；
- `AtomicWriter`：临时写入、校验、提交或替换；
- `Clock`：本地时间；
- `TaskRunner`：执行可取消的只读长任务；
- `RecoveryScanner`：启动时识别未完成事务和临时文件。

单个 Model 同时只允许一个写事务。读任务使用不可变修订。TaskRunner 返回结果前必须检查输入修订是否仍与目标视图匹配。

## 6. 逻辑数据所有权

| 数据对象 | 唯一所有者 | 可读取模块 | 备注 |
| --- | --- | --- | --- |
| Project/Model metadata | M02 | M01、M09、M10、M11 | Profile Binding 是模型创建必填 |
| Element/Fact | M04 | M03、M05、M07、M08、M10、M11 | 只能通过 M04 命令修改 |
| Context/Occurrence/Layout | M05 | M01、M03、M07、M08、M10、M11 | Layout 区分普通与语义字段 |
| Profile/Capability/Rule | M06 | M02-M11 | 版本化只读资产，升级走迁移 |
| Finding/Conformance | M07 | M01、M09、M10、M11 | 绑定输入修订和规则版本 |
| Text Artifact/Trace | M08 | M01、M09、M10、M11 | 只读派生物 |
| Revision/Snapshot/Baseline/Operation | M09 | M01、M02、M03、M10、M11 | Baseline 不可变 |
| Idempotency Receipt | 各应用命令所有者，M12 实现 | M02、M03、M09、M10、M11 | 与业务写同事务登记，避免重复提交 |
| Import/Export/Backup Manifest | M10 | M01、M09、M12 | 不保存第二份 Semantic Model |
| Method Record/Asset Mapping | M11 | M01、M09、M10 | 与语言 Finding 分离 |
| 物理存储与索引 | M12 | 仅通过端口 | 不暴露给 M01 |

## 7. 逻辑契约

### 7.1 同步用例契约

| 契约 | 发起方 | 处理方 | 结果 |
| --- | --- | --- | --- |
| OpenProject | M01 | M02 | Workspace Session 或格式/恢复问题 |
| ExecuteEditCommand | M01 | M03 | committed revision 或结构化错误 |
| ValidateModel | M01/M09 | M07 | Validation Report |
| CreateSnapshot | M01 | M09 | Named Snapshot |
| CreateBaseline | M01 | M09 | Baseline 或阻断 Finding |
| AnalyseProfileConversion | M01/M10 | M06/M07 | Conversion Report |
| ImportProject | M01 | M10 | Import Plan，确认后新草稿/项目 |
| ExportArtifact | M01 | M10 | Export Manifest 和本地文件位置 |
| RestoreBackup | M01 | M10 | 新项目或经确认的替换结果 |

### 7.2 进程内领域事件

| 事件 | 生产者 | 消费者 | 用途 |
| --- | --- | --- | --- |
| DraftRevisionCommitted | M03 | M01、M09 | 更新工作台和自动保存状态 |
| TextProjectionUpdated | M08 | M01 | 刷新对应 Paragraph/Sentence |
| ValidationCompleted | M07 | M01、M09 | 更新问题视图和证据摘要 |
| BaselineCreated | M09 | M01、M10、M11 | 启用导出或发布包准备 |
| ConversionAnalysed | M06 | M01、M10 | 展示转换结论 |
| ProjectRestored | M10 | M02、M09 | 打开恢复后的独立项目 |

这些事件仅用于同一进程内解耦，不是持久化消息、不使用 Kafka，也不建立最终一致性写模型。需要耐久的数据必须在原子事务中保存。

## 8. 关键流程

### 8.1 创建 ISO 模型

1. M02 创建 Project/Model 候选并绑定 ISO Profile；
2. M06 加载能力、规则、符号和 OPL Grammar；
3. M04 创建空 Semantic Model；
4. M05 创建唯一 SD Context；
5. M08 生成空或最小 SD Paragraph；
6. M07 执行创建期规则；
7. M12 原子提交初始修订；
8. M09 建立草稿 checkpoint。

### 8.2 创建细化 OPD

1. M03 接收选中 Object/Process 的 refine 命令；
2. M06 判断当前配置档允许的细化方式；
3. M05 创建 Context 和 Refinement Edge；
4. M05 更新 process tree 或 object forest 投影；
5. M07 校验唯一根、父子来源和事实一致性；
6. M08 生成 refinement OPL/OPT 及新 Context 文本；
7. M12 原子提交。

### 8.3 生成基线

1. M09 固定目标 Draft Revision；
2. M07 使用固定 Profile/Rule Version 全量校验；
3. M08验证全部正式 Fact 可生成文本且追踪完整；
4. M07 聚合配置档和 ISO 符合性状态；
5. 无 BLOCKING Finding 时，M09 构建 Baseline Manifest；
6. M12 原子写入不可变 Baseline；
7. 失败时不产生半基线，保留报告。

### 8.4 配置档转换

1. M06 对源修订逐 Fact 归一化；
2. M06 按目标 Profile 反归一化并分类结论；
3. M07 在隔离候选中执行目标规则；
4. M08 试生成目标文本；
5. M10 形成无损、扩展、有损、不可映射报告；
6. 只有用户确认且无阻断项时创建新目标模型版本；
7. 源模型和源基线始终不变。

## 9. 并发、幂等与事务

1. 首期每个活动 Model 只有一个写 Session；
2. UI、自动保存和后台任务仍可能并发，均以 revision token 协调；
3. `command_id` 在 Session 内幂等，重复提交不产生重复修订；
4. `base_revision` 不匹配时返回 `REVISION_CONFLICT`，不得自动覆盖；
5. 后台结果绑定输入 revision，过期结果不替换当前投影；
6. 导入、迁移、恢复和基线使用 staging + 原子提交；
7. 文件导出使用临时目标和原子 rename，失败清理临时文件；
8. 保存失败不丢弃内存候选和 Undo 栈。

## 10. 错误分类

| 错误码 | 所有者 | 含义 | 是否可重试 |
| --- | --- | --- | --- |
| DOMAIN_REJECTED | M04 | 违反公共核心不变量 | 修改命令后重试 |
| PROFILE_FORBIDDEN | M06 | 当前配置档禁止能力或组合 | 修改模型或配置档 |
| VALIDATION_BLOCKED | M07 | 提交或基线阻断规则失败 | 修复 Finding 后重试 |
| TEXT_GENERATION_BLOCKED | M08 | 无法生成合法 OPL/OPT | 修复语义或规则资产 |
| REVISION_CONFLICT | M03 | 命令基于旧修订 | 刷新后重新执行 |
| PERSISTENCE_FAILED | M12 | 原子保存失败 | 保留草稿后重试 |
| IMPORT_INVALID | M10 | 文件、格式、版本或语义无效 | 更换文件或迁移 |
| FORMAT_VERSION_UNSUPPORTED | M10 | 格式版本不受支持 | 使用受支持版本或迁移器 |
| BASELINE_BLOCKED | M09 | 不满足基线门槛 | 修复阻断项后重试 |

本表是模块核心错误分类；稳定应用错误码和页面状态映射由应用 API 契约承接，HTTP 状态码和传输 DTO 仍待 OpenAPI 阶段冻结。

## 11. 测试与验收关注点

| 层次 | 重点 |
| --- | --- |
| 领域单元测试 | M04 不变量、M05 上下文、M06 规则、M07 校验、M08 文本纯逻辑 |
| 模块集成测试 | M03 编辑提交事务、M09 基线、M10 staging 导入恢复 |
| 持久化集成测试 | 原子提交、幂等、故障注入、恢复和版本不变性 |
| 浏览器 E2E | 建模主路径、图文联动、问题定位、版本基线和备份恢复 |
| 参数化标准测试 | CAP-*、ISOR-*、Annex A 语法和禁止组合 |
| 性能测试 | 增量编辑、300/600 画布和 10,000 结点模型 |

本轮未新增或执行测试代码；验收入口继续使用 `opm-requirement-acceptance-matrix.md`。

## 12. 一期建设顺序

### 12.1 第一批：可保存的语义闭环

1. M04 公共语义内核；
2. M06 Profile/Capability/Rule 基础；
3. M05 Context/Occurrence 基础；
4. M08 最小 OPL/OPT 生成与追踪；
5. M07 提交前阻断校验；
6. M03 编辑事务；
7. M12 原子本地存储。

### 12.2 第二批：可用建模工作台

1. M01 OPD、文本和问题工作台；
2. M02 项目和模型生命周期；
3. M09 自动保存、快照、差异和基线；
4. process tree、object forest 和 System map 完整投影。

### 12.3 第三批：完整本地交付

1. M10 原生包、图文报告、备份恢复；
2. M11 架构方法检查和语义资产包；
3. 配置档转换预检；
4. SHOULD 能力和性能增强。

## 13. 风险与待细化项

- `ARC-007/008/009` 已由开发技术基线提升为 `ACCEPTED`；
- 核心元模型、Profile Package 和 Rule Definition 的机器可读 Schema 与代表样例已形成并验证；
- P0 图形符号、锚点、路由、视口/语义事件和 OPL 生成契约已形成；
- 页面 IA、状态、字段和组件交互已完成原型及 handoff 验证；
- 首批 OpenAPI、SQLite V1、物理容器、迁移和恢复设计已形成；
- 原子 `shall` 规则和 Annex A 可执行语法尚未实现；
- 下游本体映射模型和发布契约尚未设计。
