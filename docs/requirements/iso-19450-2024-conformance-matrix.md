# ISO 19450:2024 条款级符合性矩阵

文档版本：`v0.1-draft`

文档状态：子条款规则组设计基线，尚无实现和执行证据

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档定位

本文档把 ISO 19450:2024 的规范性范围拆分为产品内部规则组，并建立标准条款、符合性门槛、配置档能力、产品需求、验收入口和证据类型之间的追踪关系。

当前粒度是“子条款规则组”，用于冻结规则域和测试责任边界；尚未把标准中的每个 `shall` 句拆成原子规则，也尚无规则实现、测试执行或互操作证据。因此本文档不能单独证明产品符合 ISO 19450:2024。

## 2. 规范性范围

| 标准范围 | 性质 | 本矩阵处理 |
| --- | --- | --- |
| Clause 4 | 规范性符号目录 | 纳入 `ISO-SYMBOLIC` |
| Clause 5 | 符合性类型 | 纳入产品发布判定 |
| Clause 6 | OPM 方法原则和基础概念 | 除 6.2.6 明示为 informative 外，纳入 `ISO-METHOD` |
| Clause 7-13 | Thing、Link、基数、逻辑和执行路径 | 纳入 `ISO-SYMBOLIC` 和语义规则 |
| Clause 14 | 上下文管理和方法 | 纳入 `ISO-METHOD`，其中图形和链接语义同时属于 `ISO-SYMBOLIC` |
| Annex A | normative OPL EBNF | 纳入 `ISO-OPL` |
| Annex B、C、D | informative | 仅作为解释、样例或元模型参考，不作为独立符合性门槛 |

Annex A 明确声明其 EBNF 不覆盖概率、Clause 13 执行路径和复杂参与约束。因此这些能力必须依据正文规范性条款验证，不能因 Annex A 没有产生式而跳过。

## 3. 规则与证据约定

### 3.1 规则编号

| 前缀 | 规则域 |
| --- | --- |
| `ISOR-CONF` | 符合性判定 |
| `ISOR-SYM` | 图形符号 |
| `ISOR-METHOD` | 建模原则和方法 |
| `ISOR-THING` | Object、Process、State 和通用属性 |
| `ISOR-PROC` | Procedural Link 和控制语义 |
| `ISOR-STRUCT` | Structural Link |
| `ISOR-CARD` | 基数和参与约束 |
| `ISOR-LOGIC` | AND、XOR、OR 和概率 |
| `ISOR-PATH` | 执行路径和路径标签 |
| `ISOR-CTX` | 上下文、细化、OPD 树和事实一致性 |
| `ISOR-OPL` | Annex A OPL 语法 |

### 3.2 符合性门槛

| 门槛 | 含义 |
| --- | --- |
| `SYMBOLIC` | 第 5 章 a)：只使用 Clause 4 符号和 Clause 7-12 元素，并保持标准语义 |
| `METHOD` | 第 5 章 b)：满足 `SYMBOLIC`，并遵守 Clause 6、14 的建模方法 |
| `TOOL-GUIDE` | 第 5 章 c)2)：工具用规则和交互引导用户达到完整符合 |
| `OPL` | 第 5 章 c)3)：按规范性 Annex A 支持 OPL，同时补正文未被 EBNF 覆盖的语义 |
| `PROFILE` | 第 5 章未直接列入上述符合性集合、但本产品 ISO 配置档声明支持的规范性能力；不能据此单独提升标准符合性等级 |

### 3.3 证据类型

| 证据 | 要求 |
| --- | --- |
| `RULE` | 参数化规则测试，至少包含合法、非法和边界样例 |
| `VISUAL` | 图形符号快照或像素/矢量结构断言 |
| `OPL-GOLDEN` | 标准模型到预期 OPL 的黄金文本断言 |
| `ROUNDTRIP` | 保存、重开或结构化导入导出后语义不变 |
| `E2E` | 本地界面的用户操作、提示、阻断和定位验证 |
| `MODEL-PACK` | 代表性完整模型通过规则集并保留报告 |
| `INTEROP` | 与声明支持的外部工具进行代表性模型交换 |

本矩阵当前所有规则组的证据状态均为 `NOT_RUN`。只有建立可执行规则编号、固定测试数据并产生上述证据后，才能更新为 `PASS/FAIL/BLOCKED`。

## 4. 符合性与符号规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-SYM-001 | 4 | 只使用标准列出的 Object、Process、State、四类基本结构关系及 Procedural/Control/Exception Link 符号，并保持其标准含义 | SYMBOLIC | CAP-ELEM-002~004、CAP-ISO-PROC-*、CAP-ISO-STRUCT-*；FR-META-003~005 | VISUAL + RULE + OPL-GOLDEN |
| ISOR-CONF-001 | 5 a) | 部分符合要求 Clause 4 符号及 Clause 7-12 元素和语义全部受控，配置档外能力不得静默进入 | SYMBOLIC | FR-META-011~012、FR-VAL-004；AT-CROSS-002 | RULE + MODEL-PACK |
| ISOR-CONF-002 | 5 b) | 完整符合必须先满足部分符合，再满足 Clause 6 和 Clause 14 的方法要求 | METHOD | FR-OPD-001~015、FR-VAL-009、FR-METHOD-001~008 | MODEL-PACK + E2E |
| ISOR-CONF-003 | 5 c) | 工具制造商必须满足部分符合、引导用户达到完整符合，并按 Annex A 支持 OPL | TOOL-GUIDE + OPL | FR-META-012、FR-TEXT-001~007、主需求 11.2 | RULE + OPL-GOLDEN + E2E + MODEL-PACK |

## 5. Clause 6 方法与基础概念

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-METHOD-001 | 6.1.1 | 系统功能和建模目的决定模型范围与细节，模型应记录目的、受益者和主要利益相关方 | METHOD + TOOL-GUIDE | FR-OPD-010、FR-METHOD-005 | E2E + MODEL-PACK |
| ISOR-METHOD-002 | 6.1.2 | 同一模型统一表达功能、结构和行为，结构由对象及关联组成，行为由过程和转换组成 | METHOD | FR-ASSET-001、FR-META-010 | RULE + MODEL-PACK |
| ISOR-METHOD-003 | 6.1.3 | 系统功能以提供功能价值的过程表达，并关联受益者和价值 | METHOD + TOOL-GUIDE | FR-OPD-010、FR-METHOD-003 | RULE + E2E |
| ISOR-METHOD-004 | 6.1.4 | 明确区分系统功能与实现该功能的行为机制 | METHOD + TOOL-GUIDE | FR-METHOD-001~003 | RULE + E2E |
| ISOR-METHOD-005 | 6.1.5 | 区分系统内外部 Thing，并通过 Affiliation 表达系统边界 | METHOD | CAP-PROP-003；FR-OPD-010 | RULE + MODEL-PACK |
| ISOR-METHOD-006 | 6.1.6 | 通过上下文细化平衡清晰性和完整性，不以单张过载 OPD 替代分层模型 | METHOD + TOOL-GUIDE | FR-OPD-002~008、FR-EDIT-013 | E2E + MODEL-PACK |
| ISOR-METHOD-007 | 6.2.1 | OPM 模型必须以语义等价的 OPD 图形和 OPL 文本双模态表达 | SYMBOLIC + METHOD | FR-TEXT-001~006、NFR-REL-001 | RULE + OPL-GOLDEN + ROUNDTRIP |
| ISOR-METHOD-008 | 6.2.2 | 基本建模元素仅为 Thing 和 Link；Object/Process 指定 Thing，Link 指定 Thing 间关联 | SYMBOLIC | CAP-ELEM-001~003；FR-META-001 | RULE + ROUNDTRIP |
| ISOR-METHOD-009 | 6.2.3 | Thing 仅为 Object 或 Process；Object 可有 State，Process 表达 Object 转换，不存在 Process State | SYMBOLIC | CAP-ELEM-002~005；FR-META-010 | RULE + OPL-GOLDEN |
| ISOR-METHOD-010 | 6.2.4 | Link 分为 Procedural 与 Structural；Structural 不得依赖瞬时条件 | SYMBOLIC | CAP-ISO-PROC-*、CAP-ISO-STRUCT-* | RULE + OPL-GOLDEN |
| ISOR-METHOD-011 | 6.2.5 | 支持上下文细化、抽象和跨 OPD 全模型名称管理，Thing 名称在模型内唯一 | METHOD | CAP-PROP-005、CAP-CTX-001~007；FR-OPD-004 | RULE + E2E + MODEL-PACK |

6.2.6 明示为 informative，仅用于实现和导航设计参考，不建立符合性规则组。

## 6. Clause 7 Thing 规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-THING-001 | 7.1.1~7.1.2 | Object 具有持续存在语义，使用矩形及标准标签格式表达 | SYMBOLIC | CAP-ELEM-002、CAP-PROP-001；FR-EDIT-001 | VISUAL + RULE + OPL-GOLDEN |
| ISOR-THING-002 | 7.2.1~7.2.2 | Process 转换一个或多个 Object，具有正持续时间，使用椭圆及标准标签格式表达 | SYMBOLIC | CAP-ELEM-003；FR-META-004 | VISUAL + RULE + OPL-GOLDEN |
| ISOR-THING-003 | 7.3.1~7.3.2 | 每个 Thing 必须通过 Object-Process test 分类为 Object 或 Process | SYMBOLIC + TOOL-GUIDE | CAP-ELEM-001~003；FR-META-010 | RULE + E2E |
| ISOR-THING-004 | 7.3.3 | 所有 Thing 具有 Perseverance、Essence、Affiliation；名称在全模型唯一并满足标准命名语义 | SYMBOLIC | CAP-PROP-001~005；FR-EDIT-007、009 | RULE + ROUNDTRIP |
| ISOR-THING-005 | 7.3.4 | Affiliation、Essence、Perseverance 的默认值按条款计算；默认属性通常不写入 OPL | SYMBOLIC + OPL | CAP-PROP-001~004；FR-TEXT-003 | RULE + OPL-GOLDEN |
| ISOR-THING-006 | 7.3.5.1~7.3.5.2 | Object 可为 stateful 或 stateless；State 只从属于 Object，并使用圆角状态符号与标准文本格式 | SYMBOLIC | CAP-ELEM-004~005；FR-META-010 | VISUAL + RULE + OPL-GOLDEN |
| ISOR-THING-007 | 7.3.5.3~7.3.5.4 | Initial、Default、Final State 的语义和图形标记必须区分并生成对应 OPL | SYMBOLIC + OPL | CAP-PROP-004；FR-TEXT-003 | VISUAL + RULE + OPL-GOLDEN |
| ISOR-THING-008 | 7.3.5.5 | Attribute 是 Object，Attribute Value 作为 State 表达；测量值保留单位和约束 | SYMBOLIC | CAP-ELEM-004、CAP-ISO-STRUCT-006；FR-META-010 | RULE + OPL-GOLDEN |

## 7. Clause 8-9 Procedural Link 规则

### 7.1 总体与执行语义

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-PROC-001 | 8.1.1 | Procedural Link 分为 Transforming、Enabling、Control 三类 | SYMBOLIC | CAP-ISO-PROC-*、CAP-ISO-CTRL-* | RULE + VISUAL |
| ISOR-PROC-002 | 8.1.2 | 每个 Process 至少连接一个 Transforming Link；同一抽象层 Object/State 相对同一 Process 仅承担一个 Procedural 角色 | SYMBOLIC | CAP-ELEM-003；FR-VAL-002 | RULE + MODEL-PACK |
| ISOR-PROC-003 | 8.1.3 | State-specified Procedural Link 必须连接指定 Object State 并保留状态语义 | SYMBOLIC | CAP-MOD-010、CAP-ISO-PROC-006~012 | RULE + OPL-GOLDEN |
| ISOR-PROC-004 | 8.2.1 | Event-Condition-Action 决定过程激活、前置条件求值、执行和事件消耗 | SYMBOLIC | CAP-ISO-CTRL-*、CAP-MOD-003~004 | RULE + MODEL-PACK |
| ISOR-PROC-005 | 8.2.2 | 每个 Process 具有非空 preprocess 和 postprocess Object 集，并据此定义前置与后置条件 | SYMBOLIC | FR-META-004、FR-VAL-002 | RULE + MODEL-PACK |
| ISOR-PROC-006 | 8.2.3 | Condition Link 失败采用 skip，非 Condition Link 不满足采用 wait；混合前置条件遵循强度规则 | SYMBOLIC | CAP-MOD-004、CAP-ISO-CTRL-005~008 | RULE + MODEL-PACK |

### 7.2 Transforming、Enabling 与 State-specified Link

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-PROC-007 | 9.1.2 | Consumption Link 由 Object 指向 Process，表示激活时消耗并生成规范 OPL | SYMBOLIC + OPL | CAP-ISO-PROC-001；AT-CAP-ISO-PROC-001 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-008 | 9.1.3 | Result Link 由 Process 指向 Object，表示完成时生成并生成规范 OPL | SYMBOLIC + OPL | CAP-ISO-PROC-002；AT-CAP-ISO-PROC-002 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-009 | 9.1.4 | Effect Link 双向连接 Process 与 Object，表示状态改变但不改变存在性 | SYMBOLIC + OPL | CAP-ISO-PROC-003；AT-CAP-ISO-PROC-003 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-010 | 9.2.2 | Agent 必须为具智能决策能力的人或人群对象，Agent Link 表达主体使能 | SYMBOLIC + OPL | CAP-ISO-PROC-004；AT-CAP-ISO-PROC-004 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-011 | 9.2.3 | Instrument 为非主体使能对象，过程执行期间保持存在 | SYMBOLIC + OPL | CAP-ISO-PROC-005；AT-CAP-ISO-PROC-005 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-012 | 9.3.1~9.3.2 | State-specified Consumption/Result 保留输入或生成状态及 wait/pre/postcondition 语义 | SYMBOLIC + OPL | CAP-ISO-PROC-006~007 | RULE + OPL-GOLDEN |
| ISOR-PROC-013 | 9.3.3.1~9.3.3.4 | Effect Link 支持输入输出均指定、仅输入、仅输出三种状态转换，端点与 OPL 必须匹配 | SYMBOLIC + OPL | CAP-ISO-PROC-008~010 | RULE + OPL-GOLDEN |
| ISOR-PROC-014 | 9.4.1~9.4.2 | State-specified Agent/Instrument 仅在指定状态下使能 Process | SYMBOLIC + OPL | CAP-ISO-PROC-011~012 | RULE + OPL-GOLDEN |

### 7.3 Control Link

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-PROC-015 | 9.5.1 | Event、Condition、Exception 是 Control Link；前两者修饰基础 Procedural Link，不作为自由关系 | SYMBOLIC | CAP-ISO-CTRL-*、CAP-MOD-003~004 | RULE + VISUAL |
| ISOR-PROC-016 | 9.5.2.1 | Consumption/Effect Event 在事件发生时触发并保持各自转换语义 | SYMBOLIC + OPL | CAP-ISO-CTRL-001 | RULE + OPL-GOLDEN |
| ISOR-PROC-017 | 9.5.2.2 | Agent/Instrument Event 在使能事件发生时触发 Process | SYMBOLIC + OPL | CAP-ISO-CTRL-002 | RULE + OPL-GOLDEN |
| ISOR-PROC-018 | 9.5.2.3 | 四类 State-specified Transforming Event 保留状态、转换和事件语义 | SYMBOLIC + OPL | CAP-ISO-CTRL-003 | RULE + OPL-GOLDEN |
| ISOR-PROC-019 | 9.5.2.4 | State-specified Agent/Instrument Event 保留状态和事件使能语义 | SYMBOLIC + OPL | CAP-ISO-CTRL-004 | RULE + OPL-GOLDEN |
| ISOR-PROC-020 | 9.5.2.5.1~9.5.2.5.2 | Invocation 在源 Process 完成时调用目标 Process；Self-invocation 保持同一 Process 身份 | SYMBOLIC + OPL | CAP-ISO-PROC-013~014 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-PROC-021 | 9.5.3.1 | Consumption/Effect Condition 使用 skip 语义并保持转换角色 | SYMBOLIC + OPL | CAP-ISO-CTRL-005 | RULE + OPL-GOLDEN |
| ISOR-PROC-022 | 9.5.3.2 | Agent/Instrument Condition 使用 skip 语义并保持使能角色 | SYMBOLIC + OPL | CAP-ISO-CTRL-006 | RULE + OPL-GOLDEN |
| ISOR-PROC-023 | 9.5.3.3 | 四类 State-specified Transforming Condition 保留状态、角色和 skip 语义 | SYMBOLIC + OPL | CAP-ISO-CTRL-007 | RULE + OPL-GOLDEN |
| ISOR-PROC-024 | 9.5.3.4 | State-specified Agent/Instrument Condition 保留状态、角色和 skip 语义 | SYMBOLIC + OPL | CAP-ISO-CTRL-008 | RULE + OPL-GOLDEN |
| ISOR-PROC-025 | 9.5.4.1 | Process Duration 支持最小、期望、最大时长及分布，并校验单位和值域 | SYMBOLIC | FR-META-005、FR-VAL-002 | RULE + ROUNDTRIP |
| ISOR-PROC-026 | 9.5.4.2~9.5.4.3 | Overtime/Undertime Exception 连接未按时完成的 Process 与异常处理 Process | SYMBOLIC + OPL | CAP-ISO-PROC-015~016 | RULE + VISUAL + OPL-GOLDEN |

## 8. Clause 10 Structural Link 规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-STRUCT-001 | 10.1 | Structural Link 分为 Tagged Structural 与 Fundamental Structural Relation，默认连接同类 Thing，标准例外单独校验 | SYMBOLIC | CAP-ISO-STRUCT-* | RULE + VISUAL |
| ISOR-STRUCT-002 | 10.2.1~10.2.4 | 单向有/无标签、双向和 Reciprocal Tagged Structural Link 的方向、标签、端点和 OPL 分别受控 | SYMBOLIC + OPL | CAP-ISO-STRUCT-001~004 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-STRUCT-003 | 10.3.1~10.3.2 | Aggregation-participation 表达同 Perseverance 的 Whole 与 Parts，并管理完备/不完备 refinee 集 | SYMBOLIC + OPL | CAP-ISO-STRUCT-005 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-STRUCT-004 | 10.3.3.1~10.3.3.2 | Exhibition-characterization 表达 Exhibitor 与 Attribute/Operation；Attribute State 表达值 | SYMBOLIC + OPL | CAP-ISO-STRUCT-006、CAP-ELEM-004 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-STRUCT-005 | 10.3.4.1 | Generalization-specialization 连接同类 General 与 Specializations，并表达共同特征 | SYMBOLIC + OPL | CAP-ISO-STRUCT-007 | RULE + OPL-GOLDEN |
| ISOR-STRUCT-006 | 10.3.4.2 | Specialization 继承 General 的属性、状态、关系和过程角色，冲突须按规则处理 | SYMBOLIC | CAP-ISO-STRUCT-007 | RULE + MODEL-PACK |
| ISOR-STRUCT-007 | 10.3.4.3 | Discriminating Attribute 限制 Specialization，并校验互斥或覆盖约束 | SYMBOLIC | CAP-ISO-STRUCT-007、CAP-MOD-007 | RULE + MODEL-PACK |
| ISOR-STRUCT-008 | 10.3.5.1~10.3.5.2 | Classification-instantiation 区分 Class 与 Instance，支持 Object Class 和 Process Class 模式 | SYMBOLIC + OPL | CAP-ISO-STRUCT-008、CAP-ELEM-008 | RULE + OPL-GOLDEN |
| ISOR-STRUCT-009 | 10.4.1 | State-specified Characterization 连接指定 State 与 Feature，并在 OPL 中保留状态限定 | SYMBOLIC + OPL | CAP-ISO-STRUCT-009 | RULE + OPL-GOLDEN |
| ISOR-STRUCT-010 | 10.4.2.1~10.4.2.8 | 单向、双向、Reciprocal Tagged Structural Link 的源/目标/双端状态指定组合分别受控 | SYMBOLIC + OPL | CAP-ISO-STRUCT-010 | 参数化 RULE + OPL-GOLDEN |

## 9. Clause 11-13 约束、逻辑与路径规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-CARD-001 | 11.1 | Structural/Procedural Link 的 Object multiplicity 端点、默认值和图形标记符合规则 | SYMBOLIC + OPL | CAP-MOD-001 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-CARD-002 | 11.2 | 上下界、区间、集合或表达式参与约束语法和值域合法；不支持表达式不得静默简化 | SYMBOLIC | CAP-MOD-001；FR-META-005 | RULE + ROUNDTRIP |
| ISOR-CARD-003 | 11.3 | Attribute Value 和 multiplicity constraint 正确关联数值、单位和参与限制 | SYMBOLIC | CAP-MOD-001、CAP-ISO-STRUCT-006 | RULE + OPL-GOLDEN |
| ISOR-LOGIC-001 | 12.1 | 同类 Procedural Link 的 AND fan 表达全部参与或并发语义 | SYMBOLIC + OPL | CAP-MOD-007 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-LOGIC-002 | 12.2 | XOR 与 OR fan 严格区分唯一选择和一个或多个选择 | SYMBOLIC + OPL | CAP-MOD-007 | RULE + VISUAL + OPL-GOLDEN |
| ISOR-LOGIC-003 | 12.3 | Diverging/Converging XOR、OR 的源汇点、方向和同步语义正确 | SYMBOLIC | CAP-MOD-007 | RULE + MODEL-PACK |
| ISOR-LOGIC-004 | 12.4 | State-specified XOR/OR fan 的每个分支保留指定状态 | SYMBOLIC + OPL | CAP-MOD-007、CAP-MOD-010 | RULE + OPL-GOLDEN |
| ISOR-LOGIC-005 | 12.5 | Control-modified fan 只组合允许的 Event/Condition 和基础关系 | SYMBOLIC | CAP-MOD-003~004、007 | RULE |
| ISOR-LOGIC-006 | 12.6 | State-specified Control-modified fan 同时保留状态、逻辑和控制语义 | SYMBOLIC + OPL | CAP-MOD-003~004、007、010 | RULE + OPL-GOLDEN |
| ISOR-LOGIC-007 | 12.7 | 状态或 Link 概率合法、总和和随机选择规则正确；不得因 Annex A 无产生式而省略 | SYMBOLIC | CAP-MOD-009 | RULE + MODEL-PACK |
| ISOR-PATH-001 | 13 | Path Label 成对关联输入与输出 Procedural Link，标签、路径配对和执行消歧正确 | PROFILE | CAP-MOD-002 | RULE + VISUAL + MODEL-PACK |

## 10. Clause 14 上下文与方法规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-CTX-001 | 14.1 | SD 完成系统顶层上下文，包含唯一系统功能过程、利益相关方、系统边界和必要环境 Thing | METHOD + TOOL-GUIDE | FR-OPD-001、009~010；CAP-CTX-001 | RULE + E2E + MODEL-PACK |
| ISOR-CTX-002 | 14.2.1 | Refinement-abstraction 只能使用标准成对机制，操作保持模型事实与上下文可追溯 | METHOD | FR-EDIT-013；CAP-CTX-005~007 | RULE + ROUNDTRIP |
| ISOR-CTX-003 | 14.2.1.1 | State expression/suppression 显示或隐藏状态子集，不改变 State 身份和全模型事实 | SYMBOLIC + METHOD | CAP-CTX-005；FR-EDIT-013 | E2E + ROUNDTRIP + OPL-GOLDEN |
| ISOR-CTX-004 | 14.2.1.2 | Unfolding/folding 通过四类 Fundamental Structural Relation 展开或抽象 refinee，OPL 只表达当前 OPD 可见 refinee | SYMBOLIC + METHOD | CAP-CTX-006、CAP-ISO-STRUCT-005~008 | RULE + E2E + OPL-GOLDEN |
| ISOR-CTX-005 | 14.2.1.3 | Process/Object in-zooming 与 out-zooming 建立标准细化上下文；Process 垂直布局表达时间偏序 | SYMBOLIC + METHOD | CAP-CTX-007；FR-EDIT-008、013 | RULE + E2E + OPL-GOLDEN |
| ISOR-CTX-006 | 14.2.2.1~14.2.2.2 | In-zoomed Process 的 implicit invocation、并行组、进入和返回执行控制由垂直位置及前置条件决定 | SYMBOLIC + METHOD | FR-META-006、FR-EDIT-008 | RULE + MODEL-PACK |
| ISOR-CTX-007 | 14.2.2.4.1 | 连接 in-zoomed Process 外轮廓的合法 Link 按分配语义作用于 subprocess；Consumption/Result 不得留在外轮廓 | SYMBOLIC + METHOD | FR-EDIT-003、FR-VAL-002 | RULE + E2E |
| ISOR-CTX-008 | 14.2.2.4.2 | Event Link 不得跨越 in-zoomed Process 边界从外部直接启动内部 subprocess | SYMBOLIC | CAP-MOD-003；FR-VAL-002 | RULE |
| ISOR-CTX-009 | 14.2.2.4.3 | In-zooming 状态转换 Process 时，输入和输出状态 Link 必须按可行时间顺序分配给 subprocess | SYMBOLIC + METHOD | CAP-ISO-PROC-008~010 | RULE + MODEL-PACK |
| ISOR-CTX-010 | 14.2.2.4.4 | 细化上下文保持 involved Object operational instance 的数量与生命周期一致 | METHOD | FR-ASSET-002、FR-VAL-003 | RULE + MODEL-PACK |
| ISOR-CTX-011 | 14.2.2.5 | Synchronous 与 asynchronous Process refinement 的控制方式和触发关系明确区分 | METHOD | FR-META-006、FR-OPD-011 | RULE + MODEL-PACK |
| ISOR-CTX-012 | 14.2.2.6.1.1 | OPD process tree 是以 SD 为唯一根的有向树，边从含 refineable 的父 OPD 指向细化子 OPD | METHOD | CAP-CTX-001；FR-OPD-001~003、009 | RULE + DATA + E2E |
| ISOR-CTX-013 | 14.2.2.6.1.2 | OPD object tree 实际形成多个对象根的 forest，并维护对象层级依赖 | METHOD | CAP-CTX-002；FR-OPD-002~003 | RULE + DATA + E2E |
| ISOR-CTX-014 | 14.2.2.6.1.3 | 模型名、OPD 名、SD 标签和层级规则正确；SD 仅含一个 systemic Process | METHOD | FR-OPD-001、004、009 | RULE + DATA |
| ISOR-CTX-015 | 14.2.2.6.1.4 | process tree 每条边具有标准 in-zooming/unfolding refinement 标签及对应 OPL | METHOD + OPL | FR-OPD-011、013 | RULE + OPL-GOLDEN |
| ISOR-CTX-016 | 14.2.2.6.1.5 | System map 显示各 OPD 的 Thing/Link 内容和出现位置；声明支持的 model view 保留筛选条件、Model Fact 和 OPL | METHOD + TOOL-GUIDE | CAP-CTX-003~004；FR-OPD-014~015 | E2E + DATA + OPL-GOLDEN |
| ISOR-CTX-017 | 14.2.2.6.2 | 每张 OPD 对应一个 OPL Paragraph，全系统 OPL 由所有 OPD 段落按明确顺序组成 | METHOD + OPL | FR-OPD-013、FR-TEXT-008 | OPL-GOLDEN + MODEL-PACK |
| ISOR-CTX-018 | 14.2.3 | 任一 OPD 中的 Model Fact 对全模型成立，不同 OPD 不得出现矛盾事实；细化事实可与抽象事实并存 | METHOD | FR-OPD-012、FR-VAL-003；NFR-REL-001 | RULE + MODEL-PACK |
| ISOR-CTX-019 | 14.2.4.1~14.2.4.1.1 | Out-zooming 后冲突 Procedural Link 按语义强度处理，Result/Consumption 高于 Effect，Result 与 Consumption 冲突归并为 Effect | SYMBOLIC + METHOD | FR-EDIT-013、FR-VAL-002 | 参数化 RULE + MODEL-PACK |
| ISOR-CTX-020 | 14.2.4.1.2 | Transforming 高于 Enabling；Agent 高于 Instrument；State-specified 高于基础 Link | SYMBOLIC + METHOD | CAP-ISO-PROC-001~012 | 参数化 RULE |
| ISOR-CTX-021 | 14.2.4.1.3~14.2.4.1.4 | 同类 Link 内 Event 高于基础 Link、Condition 低于基础 Link，并遵循完整优先级序列 | SYMBOLIC + METHOD | CAP-ISO-CTRL-* | 参数化 RULE + MODEL-PACK |

## 11. Annex A OPL 规则

| 规则组 | 条款 | 规范要求摘要 | 门槛 | 追踪 | 必需证据 |
| --- | --- | --- | --- | --- | --- |
| ISOR-OPL-001 | A.1~A.2 | OPL 是 OPD 的自动生成英文文本对应物，与 Clause 7-14 图形构造保持语义等价 | OPL | FR-TEXT-001~006、NFR-MAINT-002 | OPL-GOLDEN + MODEL-PACK |
| ISOR-OPL-002 | A.3.1 | EBNF 操作符、优先级、括号和 ISO/IEC 14977 语法按规范解释 | OPL | FR-TEXT-003 | Parser RULE |
| ISOR-OPL-003 | A.3.2~A.3.3 | 数字、名称、大小写、类型、参与限制和 special sequence 基础声明合法 | OPL | FR-EDIT-009、FR-TEXT-003 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-004 | A.4.1~A.4.3 | OPL document、paragraph、identifier 和 list 结构满足产生式 | OPL | FR-OPD-013、FR-TEXT-007~008 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-005 | A.4.4 | Thing、通用属性、类型和 State 描述句满足产生式 | OPL | CAP-ELEM-002~004、CAP-PROP-001~004 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-006 | A.4.5.1~A.4.5.2 | Consumption、Result、Effect 和 Change 等 Transforming Sentence 满足产生式 | OPL | CAP-ISO-PROC-001~003、006~010 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-007 | A.4.5.3 | Agent 与 Instrument Enabling Sentence 满足产生式 | OPL | CAP-ISO-PROC-004~005、011~012 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-008 | A.4.5.4 | Event、Condition、Invocation 和 Exception Sentence 满足产生式 | OPL | CAP-ISO-CTRL-*、CAP-ISO-PROC-013~016 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-009 | A.4.6.1~A.4.6.2 | 单向、双向、Reciprocal Tagged Structural Sentence 满足产生式 | OPL | CAP-ISO-STRUCT-001~004、010 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-010 | A.4.6.3~A.4.6.6 | Aggregation、Characterization、Exhibition、Specialization、Instantiation Sentence 满足产生式 | OPL | CAP-ISO-STRUCT-005~009 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-011 | A.4.7 | Unfolding、Folding、In-zooming、Out-zooming Context Sentence 满足产生式 | OPL | CAP-CTX-005~007；FR-EDIT-013 | Parser RULE + OPL-GOLDEN |
| ISOR-OPL-012 | A.1 明示限制 | 概率、执行路径和复杂参与约束按 Clause 11-13 的语义和黄金文本验证，不以 EBNF 缺失判定为无需支持 | OPL + SYMBOLIC | CAP-MOD-001~002、009 | RULE + OPL-GOLDEN + MODEL-PACK |

## 12. 覆盖与发布判定

### 12.1 子条款覆盖口径

- Clause 4、5、6、7、8、11、12、13 和 Annex A：按独立规范主题建立规则组。
- Clause 9、10、14：对具有独立端点、控制或上下文语义的叶子条款建立规则组；只汇总前文内容的 `summary` 子条款由对应叶子规则覆盖。
- 6.2.6 及 Annex B、C、D：标准明示为 informative，不建立发布阻断规则。
- 当前覆盖是规则组级，不是 511 个 `shall` 文本命中的逐句清单；下一阶段必须为每个规则组建立原子 `shall` 规则和参数化样例。
- Clause 13 是规范性正文，但第 5 章 a)、b) 没有把它列入部分符合或完整符合的条款集合；本产品因声明支持 Path Label 而将其作为 `PROFILE` 门槛，不使用该规则单独推导 ISO 符合性等级。

### 12.2 符合性结果

| 结果 | 判定条件 |
| --- | --- |
| 部分（符号）符合 | 所有 `SYMBOLIC` 规则通过，且无配置档外符号或元素被静默接受 |
| 完全符合 | 部分符合，并且所有 `METHOD` 规则通过 |
| 工具制造商符合 | 部分符合、`TOOL-GUIDE` 规则通过、所有 `OPL` 规则通过，并能形成可追溯证据包 |
| 不符合 | 任一适用的 MUST/shall 规则失败，或存在静默语义降级 |
| 无法判断 | 规则、测试数据、执行环境或证据缺失；不得提升为符合 |

### 12.3 当前结论

当前结论为“无法判断”：规则域和追踪关系已经建立，但全部证据状态为 `NOT_RUN`。产品不得显示或发布“已符合 ISO 19450:2024”的最终声明。

## 13. 下一层设计输入

1. 把每个 `ISOR-*` 规则组拆成原子规则编号，逐条登记标准 `shall/shall not` 原文定位和判定逻辑。
2. 为 Clause 4 建立矢量符号、锚点、线型和组合绘制规范。
3. 为 Annex A 建立可执行语法资产，并为正文未覆盖产生式的语义建立黄金文本集。
4. 固定 `TD-CAP-ISO`、代表性完整模型和非法模型包。
5. 实现规则后生成 `规则版本 + 测试版本 + 模型版本 + 证据链接` 的符合性报告。
