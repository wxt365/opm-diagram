# OPM 公共语义内核定义

文档版本：`v0.4-draft`

文档状态：内部语义边界草案，逻辑字段级 schema 已形成，待机器可读验证

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档定位

本文档定义 ISO 19450:2024 配置档与中文 OPL 草案配置档之间可复用的内部语义内核，以及必须由配置档适配器保留的差异。

公共语义内核是实现层的无损事实模型，不是面向用户的第三种标准配置档，也不是两个配置档能力的并集。只有能够保持身份、方向、端点、生命周期、控制、上下文和文本来源语义的能力才能直接进入公共核心；其余能力必须带约束归一化或保持配置档专属表达。

## 2. 输入基线

1. `docs/requirements/opm-online-modeling-tool-requirements.md`
2. `docs/requirements/opm-profile-capability-matrix.md`
3. `docs/requirements/iso-19450-2024-conformance-matrix.md`
4. `docs/requirements/opm-requirement-acceptance-matrix.md`
5. `docs/design/opm-core-metamodel-field-schema.md`
6. `docs/design/opm-profile-package-field-schema.md`
7. `docs/design/opm-rule-definition-field-schema.md`
8. ISO 19450:2024 与仓库内两份中文草案资料

## 3. 核心原则

### 3.1 单一事实、双配置档解释

公共核心保存稳定身份和可验证语义事实。配置档适配器负责：

- 判断某事实能否在目标配置档中合法表达；
- 生成该配置档的图形符号和 OPL/OPT 文本；
- 执行名称、端点、修饰、上下文和控制规则；
- 在转换时给出无损、带约束、派生、有损或不可映射结论。

### 3.2 原始语义不可丢失

任一从配置档模型进入公共核心的事实必须保留：

- `stable_id`：跨 OPD 和版本稳定标识；
- `source_profile` 与 `source_profile_version`；
- `source_kind`：原始元素、关系或修饰类型；
- `source_fact_id`：来源 Model Fact 或中文草案事实标识；
- 原始端点、方向、限定状态和修饰；
- 归一化结论、前置条件和损失说明。

公共核心不得只保存“看起来相似”的通用关系名后删除来源类型。

### 3.3 图文均为派生表达

OPD 布局和 OPL/OPT 文本不是公共核心中的第二事实源。公共核心保存语义事实、上下文出现和必要的语义布局；配置档适配器派生具体图形与文本，并保留 `Fact -> OPD Construct -> Sentence` 追踪。

## 4. 归一化等级

| 等级 | 含义 | 是否进入公共核心 |
| --- | --- | --- |
| `CORE` | 两配置档语义可确认无损一致 | 直接进入 |
| `CONDITIONAL` | 满足明确端点、方向、修饰或生命周期条件时可无损归一化 | 条件通过后进入，并保留条件 |
| `DERIVED` | 一方不是独立公共类型，但可由公共事实组合无损派生 | 保存公共事实和派生规则，不伪造同名原生类型 |
| `PROFILE_ONLY` | 仅某配置档原生支持或语义差异无法统一 | 保存在配置档扩展区，不进入公共核心类型系统 |
| `LOSSY` | 只能丢失部分语义后转换 | 不覆盖源事实；仅生成显式转换候选 |
| `UNMAPPABLE` | 无可验证目标表达 | 阻断转换 |

## 5. 公共核心信息对象

| 核心编号 | 信息对象 | 最小语义 | 关键不变量 |
| --- | --- | --- | --- |
| CORE-MODEL-001 | Semantic Model | 一个模型的统一事实集合 | 绑定一个活动配置档及版本；不把多 OPD 保存为多个模型 |
| CORE-MODEL-002 | Profile Reference | 配置档、版本和规则版本引用 | 任一事实和基线均可追溯到解释它的规则版本 |
| CORE-ELEM-001 | Semantic Element | 稳定身份、名称、类型和来源 | 抽象元素不能绕过配置档实例化约束 |
| CORE-ELEM-002 | Object | 具有物理或信息存在语义的 Thing | 两配置档适配后仍保持同一身份和 Essence/Affiliation |
| CORE-ELEM-003 | Process | 表达转换或行为的 Thing | 必须由目标配置档规则验证参与对象和过程角色 |
| CORE-FACT-001 | Semantic Fact | 有类型、方向、端点和修饰的语义断言 | 端点存在；跨 OPD 重现不复制事实身份 |
| CORE-FACT-002 | Transformation Fact | consumes、produces 或 affects 的规范化转换角色 | 只有满足第 7.2 节条件时才视为跨配置档无损 |
| CORE-FACT-003 | Enabling Fact | agent 或 instrument 的规范化使能角色 | 主体能力、端点种类和生命周期条件必须保留 |
| CORE-CTX-001 | OPD Context | 特定细节范围的图形上下文 | 记录上下文种类、来源元素、父上下文和配置档语义 |
| CORE-CTX-002 | Element Occurrence | 元素或事实在 OPD 中的一次出现 | occurrence 有独立布局，但引用同一 Semantic Element/Fact |
| CORE-CTX-003 | Refinement Edge | 上下文之间的细化来源和方式 | process/object、unfold/in-zoom 等含义不能压缩成无类型父子边 |
| CORE-TEXT-001 | Text Trace | Fact、Construct、Sentence 和生成规则映射 | 文本内容由配置档生成，不作为可独立编辑事实 |
| CORE-VER-001 | Model Version | 模型事实、上下文、布局、配置档和校验快照 | 已发布基线不可原地改写 |
| CORE-VAL-001 | Validation Finding | 规则、对象、等级、说明和修复建议 | 规则版本和配置档版本可追溯 |

上述名称用于需求层语义边界，不是已冻结的代码类名、API 字段或数据库表名。

## 6. 无条件公共能力

| 能力 | 等级 | 配置档来源 | 公共语义 | 追踪 |
| --- | --- | --- | --- | --- |
| Object | CORE | 两配置档均为 MUST | 具有稳定身份、名称、Essence 和 Affiliation 的对象 | CAP-ELEM-002、ISOR-THING-001 |
| Process | CORE | 两配置档均为 MUST | 表达转换或行为的过程 | CAP-ELEM-003、ISOR-THING-002 |
| Essence | CORE | 两配置档均为 MUST | physical/informatical 区分 | CAP-PROP-002、ISOR-THING-004 |
| Affiliation | CORE | 两配置档均为 MUST | systemic/environmental 区分 | CAP-PROP-003、ISOR-METHOD-005 |
| Stable Machine ID | CORE | 产品在两配置档均为 MUST | 跨 OPD、版本、导入和映射稳定标识 | CAP-PROP-007、FR-ASSET-002 |
| 多 OPD 模型 | CORE | 两配置档均有上下文组织 | 多个上下文共享同一语义事实源 | FR-PROJ-007、FR-OPD-012 |
| 图文追踪 | CORE | 两配置档均要求文本模态 | 事实、图形构造和文本句的多对多映射 | FR-TEXT-004~005、NFR-MAINT-002 |
| 版本与基线 | CORE | 产品治理能力 | 配置档和规则版本绑定的不可变快照 | FR-VER-002~006 |

## 7. 带约束的公共语义

### 7.1 State 与属性

| 来源能力 | 等级 | 进入公共核心的条件 | 配置档适配 |
| --- | --- | --- | --- |
| ISO Object State / 中文特征值域和值 | CONDITIONAL | 必须能够证明状态从属于同一 Object/Attribute，值域和值没有额外类或可见性语义 | 核心保存 `State Assertion`；ISO 输出 Object State，中文输出特征值域和值 |
| Initial/Default/Final | CONDITIONAL | 中文表达能保持 ISO 三种状态标记的精确含义 | 不能证明时保持 ISO profile extension，不自动降级 |
| Attribute | DERIVED | 两侧均可表达 Object 的 feature，且属性值可映射为状态 | 核心保存 feature 和 value assertion；适配器选择 Exhibition/表征或描述构造 |
| Process State | PROFILE_ONLY | ISO 明确无 Process State；中文通过过程值域和值表达 | 保持中文扩展，转 ISO 时阻断或要求显式重构 |

### 7.2 转换关系

| 公共角色 | ISO 来源 | 中文来源 | 无损条件 | 不满足时 |
| --- | --- | --- | --- | --- |
| consumes | Consumption Link | 消耗关系 | 中文源端是可映射 Object/State，目标是 Process，且表示实例消耗/删除 | LOSSY 或 UNMAPPABLE |
| produces | Result Link | 生成关系 | 中文源端是 Process，目标是可映射 Object/State，且表示实例创建 | LOSSY 或 UNMAPPABLE |
| affects | Effect/State-specified Effect | 影响关系 | 中文必须为显式 Process 与可映射 Object/Feature 的改变，不使用 Thing -> Thing 隐式过程简写 | 要求先展开显式 Process，否则阻断 |
| observes | 无直接同名基础 Link | 观测关系 | 只有存在经 ISO 规则验证的无状态改变构造映射时 | 默认 PROFILE_ONLY |

转换适配不得仅按中文关系名称映射，必须同时检查端点、对象存在性、状态前后条件、方向和控制修饰。

### 7.3 使能关系

| 公共角色 | ISO 来源 | 中文来源 | 无损条件 | 不满足时 |
| --- | --- | --- | --- | --- |
| agent | Agent Link | 主体关系 | 中文主体是可证明具智能决策能力的人或人群对象，且过程执行期间保持使能语义 | 保持中文主体扩展，不标为 ISO Agent |
| instrument | Instrument Link | 手段关系 | 中文手段可映射为非决策 Object，执行期间存在且不被消耗 | Value/Information 等端点无法映射时阻断 |

### 7.4 Structural 语义

| 语义 | 等级 | 无损条件 | 配置档差异 |
| --- | --- | --- | --- |
| aggregation/composition | CONDITIONAL | Whole/Part 类型、Perseverance、完备性和顺序修饰均可保持 | 中文组成的额外顺序或未穷举信息必须保留 |
| generalization/specialization | CONDITIONAL | General/Specialization 同类、继承和限制语义一致 | ISO discriminating attribute 不得在中文适配中丢失 |
| classification/instantiation | CONDITIONAL | Class/Instance 身份及 Object/Process/Value 类别可精确区分 | 中文 Value 实例不能直接当作 ISO Thing instance |
| characterization | CONDITIONAL | Feature、Attribute/Operation 和值语义可对应 | 中文表征/描述不按名称直接合并为 Exhibition |
| tagged association | CONDITIONAL | 端点为同类 ISO Thing，方向和标签语义满足 ISO 10.2 | 位置、权属和一般性关联只在证明等价时生成转换候选 |

### 7.5 修饰和控制

| 能力 | 等级 | 公共条件 | 不能公共化的部分 |
| --- | --- | --- | --- |
| Multiplicity | CONDITIONAL | 端点、默认值、上下界和表达式可无损保持 | 配置档专属表达式保留在扩展区 |
| Path Label | CONDITIONAL | 输入输出路径配对和执行消歧语义一致 | 标签语法由适配器生成 |
| Event | CONDITIONAL | 只修饰目标配置档允许的基础关系，触发语义一致 | 中文 Stop Event `-e` 不自动进入 ISO |
| Condition | CONDITIONAL | wait/skip、必要性和状态限定可精确保持 | 中文 `un` 非必要条件保持 PROFILE_ONLY |
| AND/XOR/OR | CORE | 逻辑分组、方向和分支语义一致 | 图形和文本句式仍由配置档生成 |
| 完整布尔表达式 | PROFILE_ONLY | ISO 只原生支持 AND/XOR/OR | 仅能证明等价归约时生成无损转换 |
| Probability | CONDITIONAL | 概率作用对象、总和和随机选择规则一致 | OPL 不能仅依赖 Annex A 生成 |

### 7.6 上下文语义

| 能力 | 等级 | 公共核心处理 | 配置档适配 |
| --- | --- | --- | --- |
| 多 OPD 与跨图身份 | CORE | 保存 Context、Occurrence 和稳定事实身份 | 两配置档分别校验命名和引用规则 |
| Refinement Edge | CONDITIONAL | 保存 refineable、refinee、方式和父子上下文 | ISO 生成 process tree/object forest；中文生成草案 OPD 细化结构 |
| State expression/suppression | CONDITIONAL | 保存可见状态子集，不修改 State Fact | 中文通过值域和值显示机制适配 |
| Unfolding/folding | CONDITIONAL | 保存结构细化类型和可见 refinee | 两配置档使用各自句式和关系规则 |
| In-zooming/out-zooming | CONDITIONAL | 保存过程/对象上下文和语义布局 | ISO Process 垂直偏序必须保留 |
| System map | PROFILE_ONLY | 可读取公共上下文数据，但属于 ISO MUST 产品视图 | 中文配置档可选视图不能标为共同标准能力 |
| Model view | PROFILE_ONLY | 可复用公共事实和 occurrence | ISO SHOULD；中文草案不得作为原生 OPD 导出 |

## 8. 必须隔离的配置档专属能力

| 能力 | 所属配置档 | 隔离原因 | 转换策略 |
| --- | --- | --- | --- |
| 独立 Thing 抽象实例 | 中文草案 | ISO Thing 只能实例化为 Object 或 Process | 要求明确分类后再转换 |
| Value Domain、Value | 中文草案 | ISO 使用 Object State/Attribute Value，不允许独立同名结点 | 条件映射或阻断 |
| Flow 结点 | 中文草案 | ISO 通过 Procedural Link 表达流 | 显式重构后转换 |
| Process State | 中文草案派生 | ISO 明确无 Process State | 映射为 Object/Attribute 状态模型或阻断 |
| 自由 Annotation | 中文草案 | ISO 属性和标签不等同自由注释元素 | 保留为非 Model Fact 扩展，不进入 ISO 模型 |
| OPD 局部命名空间 | 中文草案 | ISO Thing 名称在全模型唯一 | 转换前全模型重名检查和重命名计划 |
| 公开/保护/私有可见性 | 中文草案 | ISO 无该可见性模型 | 展开引用并保留来源说明，否则阻断 |
| 位置、权属 | 中文草案 | ISO 无同名 Fundamental Structural Relation | 仅在 Tagged Structural 语义可证明时条件转换 |
| 一般性关联、关联信息、关联算子 | 中文草案 | 端点和标签范围宽于 ISO | 逐项判断，不能默认映射 |
| 激活、去激活、激活翻转 | 中文草案 | 与 ISO Invocation/Control/Exception 不完全等价 | 组合重构或阻断 |
| Stop Event、非必要条件 | 中文草案 | ISO 无直接 `-e`、`un` 对应 | 阻断或显式有损项 |
| 完整布尔运算 | 中文草案 | ISO 仅 AND/XOR/OR | 可证明归约时转换，否则阻断 |
| System map、Model view | ISO | 中文草案原生上下文规则不同 | 作为产品辅助视图或导出时排除原生声明 |

## 9. 配置档适配器契约

每个配置档适配器必须提供以下逻辑能力，具体 API 在后续架构设计中冻结：

1. `validate(fact, context)`：按配置档和规则版本校验元素、端点、修饰和上下文。
2. `normalize(source_fact)`：返回公共事实、归一化等级、前置条件和来源追踪。
3. `denormalize(core_fact)`：判断是否能无损生成目标配置档事实，不能时返回明确原因。
4. `render_opd(context)`：根据配置档符号和语义布局生成 OPD 表达。
5. `generate_text(context)`：生成 ISO OPL Paragraph/Sentence 或中文 OPT 章节。
6. `analyse_conversion(model, target_profile)`：逐项返回 `CORE/CONDITIONAL/DERIVED/LOSSY/UNMAPPABLE` 结论。

适配器失败不得产生部分写入；转换预检不得修改源模型。

## 10. 公共核心不变量

| 编号 | 不变量 | 阻断条件 |
| --- | --- | --- |
| CORE-INV-001 | 同一语义元素跨 OPD 复用稳定身份 | 创建无来源的新副本代替引用 |
| CORE-INV-002 | 任一 Fact 的端点、方向、类型和修饰完整 | 归一化后缺失任一语义字段 |
| CORE-INV-003 | 任一归一化事实保留来源配置档、版本和原始类型 | 无法追溯原始语义 |
| CORE-INV-004 | OPD Construct 和 OPL/OPT Sentence 可追溯到 Fact 与规则版本 | 存在正式图形或文本但无事实来源 |
| CORE-INV-005 | 配置档专属能力不进入另一配置档而无转换结论 | 静默接受或静默删除扩展 |
| CORE-INV-006 | 视口布局和语义布局分离保存 | 普通移动改变语义，或语义偏序被当作纯布局 |
| CORE-INV-007 | 已发布基线绑定事实、配置档、规则和文本版本 | 规则升级原地改变旧基线结果 |
| CORE-INV-008 | 转换、导入和基线生成具有原子性 | 失败后出现部分目标模型 |

## 11. 验收映射

| 验收主题 | 数据 | 预期结果 | 追踪 |
| --- | --- | --- | --- |
| 无条件公共能力往返 | TD-ISO-BASE + TD-CN-BASE | Object、Process、Essence、Affiliation、身份和上下文无损保存 | FR-META-001、FR-ASSET-002 |
| 条件转换 | TD-CROSS | 每个事实记录条件、来源和转换结论，不满足条件时不进入目标模型 | AT-CROSS-001、003 |
| 专属能力隔离 | TD-CROSS + TD-INVALID | PROFILE_ONLY 能力不出现在目标配置档公共面板、导入结果或文本中 | AT-CROSS-002 |
| 图文追溯 | TD-MULTI-OPD | 每个正式 Construct/Sentence 可回到同一核心 Fact | FR-TEXT-004~005、NFR-MAINT-002 |
| 版本稳定性 | TD-VERSION | 配置档或规则升级不改写旧基线核心事实和结论 | NFR-MAINT-004 |

## 12. 当前边界与下一步

- 本文冻结需求层语义边界；核心、Profile 和 Rule 的逻辑字段由三份 `docs/design/*field-schema.md` 承接，P0 代表性机器 Schema、OpenAPI 和 SQLite V1 已冻结并通过设计资产验证；生产代码类、完整 Schema 覆盖和运行时类型生成由 DEV-00~09 承接。
- `CONDITIONAL` 能力仍需逐项建立可执行前置条件和正反例，未完成前不能默认进入公共核心。
- 中文资料仍为草案，草案版本变化必须升级适配器规则并重新执行转换影响分析。
- 顶层架构、模块职责、页面交互、应用 API、逻辑持久化、原生交换契约、三份逻辑字段级 Schema、代表性机器样例、原型验收、handoff 和开发执行包已经形成；下一步按 DEV-00~09 进入生产代码开发并补充运行证据。
