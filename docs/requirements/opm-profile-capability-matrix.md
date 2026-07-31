# OPM 配置档能力矩阵

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；96 项配置档能力设计冻结，完整资产和执行证据分阶段形成

全局设计状态、延期边界和开发准入以 `docs/design/opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-30

## Task Type

- `feature`

## 1. 文档定位

本文档定义 OPM 单机建模工具首期配置档允许的元素、关系、修饰机制和上下文能力，是产品需求规格中“当前配置档允许”这一约束的可枚举依据。

本文档不替代 ISO 19450:2024 原子 `shall` 规则、OPL EBNF 可执行语法、图形符号规范或自动化测试用例。矩阵中标记为 `MUST` 的能力仍需经过规则实现和测试后才能形成符合性证据。

各能力的验收入口由 `docs/requirements/opm-requirement-acceptance-matrix.md` 逐项承接；验收入口不等于已经获得测试通过证据。

ISO 子条款规则组追踪由 `docs/requirements/iso-19450-2024-conformance-matrix.md` 承接；公共语义的纳入、条件归一化和隔离边界由 `docs/requirements/opm-common-semantic-core.md` 承接。

## 2. 参考依据

1. `reference/ISO+19450-2024.pdf`
2. `reference/自动化系统与集成 对象过程语言-20250914.pdf`
3. `reference/基于OPL的架构建模方法20260425.pdf`
4. `docs/requirements/opm-online-modeling-tool-requirements.md`
5. `docs/requirements/iso-19450-2024-conformance-matrix.md`
6. `docs/requirements/opm-common-semantic-core.md`

## 3. 状态定义

| 状态 | 含义 |
| --- | --- |
| `MUST` | 首期配置档必须原生支持，是该配置档发布门槛 |
| `SHOULD` | 首期建议支持；未实现时必须在能力报告中明确标记 |
| `DERIVED` | 不作为独立公共类型，通过该配置档的其他标准构造表达 |
| `FORBIDDEN` | 该配置档禁止创建或静默导入 |
| `N/A` | 不适用于该配置档 |

实现层不得提供矩阵外的公共元素或关系类型。新增能力必须先更新矩阵、来源、转换影响和测试要求。

公共语义内核是实现层用于复用的内部无损事实模型，不是把两个配置档同名能力直接合并，也不是面向用户发布模型时可选择的独立标准。只有 `opm-common-semantic-core.md` 标记为 `CORE`，或满足全部 `CONDITIONAL` 前置条件的能力才能进入公共核心；不得仅凭名称相近认定为公共能力。

## 4. 元素能力矩阵

| 编号 | 元素能力 | ISO 配置档 | 中文草案配置档 | 关键约束 | 来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-ELEM-001 | Thing 抽象类型 | `DERIVED` | `MUST` | ISO 中 Thing 只能实例化为 Object 或 Process；中文草案允许事物结点 | ISO 6.2.2、7.3；中文草案第 8 章 |
| CAP-ELEM-002 | Object | `MUST` | `MUST` | 必须具备稳定身份、名称和配置档属性 | ISO 7.1；中文草案第 8 章 |
| CAP-ELEM-003 | Process | `MUST` | `MUST` | 过程必须按配置档连接被转换或相关事物 | ISO 7.2、8.1.2；中文草案第 8、10 章 |
| CAP-ELEM-004 | Object State | `MUST` | `DERIVED` | ISO State 从属于 Object；中文草案通过特征值域和值表达状态 | ISO 7.3.5；中文草案第 7、8 章 |
| CAP-ELEM-005 | Process State | `FORBIDDEN` | `DERIVED` | ISO 不显式定义 Process state；中文草案通过过程值域和值表达 | ISO 6.2.3；中文草案第 7、8 章 |
| CAP-ELEM-006 | Value Domain | `FORBIDDEN` | `MUST` | ISO 使用 Object State、Attribute Value/Range；中文草案允许独立值域结点 | ISO 7.3.5、11.3；中文草案第 8 章 |
| CAP-ELEM-007 | Value | `FORBIDDEN` | `MUST` | ISO 不允许独立 Value 结点；中文草案中 Value 是 Value Domain 的实例 | ISO 7.3.5；中文草案第 8、9 章 |
| CAP-ELEM-008 | Class | `DERIVED` | `MUST` | ISO 通过 Thing 与 classification-instantiation 表达；中文草案定义类能力 | ISO 10.3.5；中文草案第 8、9 章 |
| CAP-ELEM-009 | Flow | `FORBIDDEN` | `MUST` | ISO 通过 Procedural Link 表达流；中文草案允许 Flow 结点 | ISO 第 8、9 章；中文草案第 8 章 |
| CAP-ELEM-010 | Information | `DERIVED` | `MUST` | ISO 以 informatical Object 表达；中文草案允许信息事物及专用符号 | ISO 7.3.3；中文草案第 8 章 |
| CAP-ELEM-011 | 自由文本或图表 Annotation | `FORBIDDEN` | `MUST` | ISO 属性、标签和控制符注记不等同于自由注释元素；中文注释不得成为正式 Model Fact 或绕过配置档校验 | ISO 3.61、9 至 13 章；中文草案第 12 章 |

### 4.1 元素属性与标识

| 编号 | 属性能力 | ISO 配置档 | 中文草案配置档 | 关键约束 | 来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-PROP-001 | Perseverance | `MUST` | `DERIVED` | ISO 取值覆盖静态、动态和持久语义；中文草案由 Object/Process 类型表达主要差异 | ISO 7.3.3；中文草案第 7、8 章 |
| CAP-PROP-002 | Essence | `MUST` | `MUST` | 区分 physical 与 informatical；中文草案以物理事物和信息事物表达 | ISO 7.3.3；中文草案第 8 章 |
| CAP-PROP-003 | Affiliation | `MUST` | `MUST` | 区分 systemic 与 environmental，默认值按配置档管理 | ISO 7.3.3、7.3.4；中文草案环境事物定义 |
| CAP-PROP-004 | Initial/Default/Final State | `MUST` | `DERIVED` | ISO 直接修饰 Object State；中文草案通过值及过程控制语义表达 | ISO 7.3.5.3、7.3.5.4；中文草案第 7、8、10 章 |
| CAP-PROP-005 | 全模型名称唯一 | `MUST` | `FORBIDDEN` | ISO Thing 名称在模型内唯一 | ISO 6.2.2、7.3.3 |
| CAP-PROP-006 | OPD 命名空间内同类结点唯一 | `FORBIDDEN` | `MUST` | 中文草案允许不同 OPD 或不同结点类型重名，通过路径区分 | 中文草案第 12 章 |
| CAP-PROP-007 | 稳定机器标识 | `MUST` | `MUST` | 不替代标准名称；用于跨 OPD、版本、导入和映射追踪 | 产品追溯需求 |

## 5. ISO 19450:2024 关系能力矩阵

### 5.1 Procedural Link

| 编号 | 关系类型 | 合法端点概要 | 状态 | 来源 | 文本模态要求 |
| --- | --- | --- | --- | --- | --- |
| CAP-ISO-PROC-001 | Consumption Link | Object -> Process | `MUST` | 9.1.2 | 生成规范 Consumption OPL Sentence |
| CAP-ISO-PROC-002 | Result Link | Process -> Object | `MUST` | 9.1.3 | 生成规范 Result OPL Sentence |
| CAP-ISO-PROC-003 | Effect Link | Process <-> Object | `MUST` | 9.1.4 | 生成规范 Effect OPL Sentence |
| CAP-ISO-PROC-004 | Agent Link | Human/Group Object -> Process | `MUST` | 9.2.2 | 表达人类主体对过程的使能 |
| CAP-ISO-PROC-005 | Instrument Link | Non-agent Object -> Process | `MUST` | 9.2.3 | 表达非主体手段对过程的使能 |
| CAP-ISO-PROC-006 | State-specified Consumption | Object State -> Process | `MUST` | 9.3.1 | 句式必须包含指定输入状态 |
| CAP-ISO-PROC-007 | State-specified Result | Process -> Object State | `MUST` | 9.3.2 | 句式必须包含指定生成状态 |
| CAP-ISO-PROC-008 | Input-output-specified Effect | Input State -> Process -> Output State | `MUST` | 9.3.3.2 | 表达完整状态转换 |
| CAP-ISO-PROC-009 | Input-specified Effect | Input State -> Process -> Object | `MUST` | 9.3.3.3 | 表达已知输入状态的变化 |
| CAP-ISO-PROC-010 | Output-specified Effect | Object -> Process -> Output State | `MUST` | 9.3.3.4 | 表达已知输出状态的变化 |
| CAP-ISO-PROC-011 | State-specified Agent | Agent State -> Process | `MUST` | 9.4.1 | 表达主体处于指定状态时使能 |
| CAP-ISO-PROC-012 | State-specified Instrument | Instrument State -> Process | `MUST` | 9.4.2 | 表达手段处于指定状态时使能 |
| CAP-ISO-PROC-013 | Invocation Link | Process -> Process | `MUST` | 9.5.2.5.1 | 表达过程完成触发目标过程 |
| CAP-ISO-PROC-014 | Self-invocation Link | Process -> Same Process | `MUST` | 9.5.2.5.2 | 表达递归或重复调用 |
| CAP-ISO-PROC-015 | Overtime Exception Link | Process -> Exception-handling Process | `MUST` | 9.5.4.2 | 表达超过预期时长的异常处理 |
| CAP-ISO-PROC-016 | Undertime Exception Link | Process -> Exception-handling Process | `MUST` | 9.5.4.3 | 表达低于预期时长的异常处理 |

### 5.2 Control Link 组合

Event 和 Condition 是进入 Process 的 Transforming/Enabling Link 的控制修饰，不建立脱离基础关系的自由连接。

| 编号 | 控制关系族 | 可修饰的基础关系 | 状态 | 来源 |
| --- | --- | --- | --- | --- |
| CAP-ISO-CTRL-001 | Transforming Event | Consumption、Effect | `MUST` | 9.5.2.1 |
| CAP-ISO-CTRL-002 | Enabling Event | Agent、Instrument | `MUST` | 9.5.2.2 |
| CAP-ISO-CTRL-003 | State-specified Transforming Event | State-specified Consumption、三种 State-specified Effect | `MUST` | 9.5.2.3 |
| CAP-ISO-CTRL-004 | State-specified Enabling Event | State-specified Agent、Instrument | `MUST` | 9.5.2.4 |
| CAP-ISO-CTRL-005 | Transforming Condition | Consumption、Effect | `MUST` | 9.5.3.1 |
| CAP-ISO-CTRL-006 | Enabling Condition | Agent、Instrument | `MUST` | 9.5.3.2 |
| CAP-ISO-CTRL-007 | State-specified Transforming Condition | State-specified Consumption、三种 State-specified Effect | `MUST` | 9.5.3.3 |
| CAP-ISO-CTRL-008 | State-specified Enabling Condition | State-specified Agent、Instrument | `MUST` | 9.5.3.4 |

### 5.3 Structural Link

| 编号 | 关系类型 | 合法端点概要 | 状态 | 来源 | 文本模态要求 |
| --- | --- | --- | --- | --- | --- |
| CAP-ISO-STRUCT-001 | Unidirectional Tagged Structural | Object-Object 或 Process-Process | `MUST` | 10.2.1 | 保留方向和用户定义标签 |
| CAP-ISO-STRUCT-002 | Unidirectional Null-tagged Structural | Object-Object 或 Process-Process | `MUST` | 10.2.2 | 使用配置档规定的默认关系语义 |
| CAP-ISO-STRUCT-003 | Bidirectional Tagged Structural | Object-Object 或 Process-Process | `MUST` | 10.2.3 | 为两个方向分别生成语句 |
| CAP-ISO-STRUCT-004 | Reciprocal Tagged Structural | Object-Object 或 Process-Process | `MUST` | 10.2.4 | 生成互惠关系语句 |
| CAP-ISO-STRUCT-005 | Aggregation-participation | Whole Thing -> Part Things | `MUST` | 10.3.2 | 表达整体与组成部分 |
| CAP-ISO-STRUCT-006 | Exhibition-characterization | Exhibitor Thing -> Attribute/Operation Thing | `MUST` | 10.3.3 | 表达事物及其特征 |
| CAP-ISO-STRUCT-007 | Generalization-specialization | General Thing -> Specialized Things | `MUST` | 10.3.4 | 表达特化及继承 |
| CAP-ISO-STRUCT-008 | Classification-instantiation | Class Thing -> Instance Things | `MUST` | 10.3.5 | 表达类与实例 |
| CAP-ISO-STRUCT-009 | State-specified Characterization | Specialized Object -> 继承 Attribute 的 Value State | `MUST` | 10.4.1 | `{SpecializedObject} exhibits {value-state} {Attribute}.` |
| CAP-ISO-STRUCT-010 | State-specified Tagged Structural | Object/owned Object State；指定源状态、目标状态或双端状态 | `MUST` | 10.4.2 | 保留方向、标签和状态限定；不接受 Process |

ISO Structural Link 默认不得连接 Object 与 Process，Exhibition-characterization 是标准明确的例外。端点合法性必须由具体关系和条款规则进一步收窄。

## 6. 中文 OPL 草案关系能力矩阵

### 6.1 静态关系

| 编号 | 关系类型 | 合法端点概要 | 状态 | 来源 | OPT 要求 |
| --- | --- | --- | --- | --- | --- |
| CAP-CN-STATIC-001 | 表征关系 | Thing -> Object/Process Feature | `MUST` | 第 9 章“表征” | 表达事物具备特征 |
| CAP-CN-STATIC-002 | 描述关系 | Value Domain -> Thing/Object/Process | `MUST` | 第 9 章“描述” | 表达值域描述事物或特征 |
| CAP-CN-STATIC-003 | 组成关系 | Whole Node -> Part Nodes | `MUST` | 第 9 章“组成” | 支持完备、未穷举和顺序信息 |
| CAP-CN-STATIC-004 | 泛化/特化关系 | General Node <-> Specialized Nodes | `MUST` | 第 9 章“泛化与特化” | 表达分类和继承方向 |
| CAP-CN-STATIC-005 | 实例关系 | Class/Value Domain -> Instance/Value | `MUST` | 第 9 章“实例” | 表达事物实例和值实例 |
| CAP-CN-STATIC-006 | 位置关系 | Reference Physical Thing -> Located Thing/Process | `MUST` | 第 9 章“位置” | 保留位置参数和参考事物 |
| CAP-CN-STATIC-007 | 权属关系 | Human/Organization Thing -> Resource Thing | `MUST` | 第 9 章“权属” | 表达所有权或使用支配权 |

### 6.2 动态关系

| 编号 | 关系类型 | 合法端点概要 | 状态 | 来源 | OPT 要求 |
| --- | --- | --- | --- | --- | --- |
| CAP-CN-DYN-001 | 影响关系 | Process -> Thing/Feature；Thing -> Process；草案允许 Thing -> Thing 的隐式过程简写 | `MUST` | 第 10 章“影响关系组” | 表达改变或影响语义，简写必须能够展开为显式过程模型 |
| CAP-CN-DYN-002 | 观测关系 | Process/Thing -> Observed Thing | `MUST` | 10.1.5、10.1.6 | 作为影响关系构造型，不能误写为状态改变 |
| CAP-CN-DYN-003 | 消耗关系 | Thing/Object/Value Domain/Value -> Process | `MUST` | 10.1.3 | 表达事物消耗或信息删除 |
| CAP-CN-DYN-004 | 生成关系 | Process -> Thing/Object/Value Domain/Value | `MUST` | 10.1.3 | 表达事物或信息生成 |
| CAP-CN-DYN-005 | 手段关系 | Thing/Value/Information -> Process | `MUST` | 第 10 章“手段关系” | 表达过程运行所需手段且不被消耗 |
| CAP-CN-DYN-006 | 主体关系 | Human/Organization Thing -> Process | `MUST` | 第 10 章“主体关系” | 表达人类主体控制或主导过程 |
| CAP-CN-DYN-007 | 激活关系 | Process -> Process | `MUST` | 10.5.1 | 表达前置过程结束后触发后续过程 |
| CAP-CN-DYN-008 | 去激活关系 | Process -> Running Process | `MUST` | 10.5.2 | 表达前置过程结束后中断目标过程 |
| CAP-CN-DYN-009 | 激活翻转关系 | Process -> Process | `MUST` | 10.5.3 | 表达目标过程运行状态翻转 |
| CAP-CN-DYN-010 | 调用关系 | Process Instance -> Process Class | `MUST` | 第 10 章“调用关系” | 保留调用参数和返回值信息 |

### 6.3 一般性关系和扩展

| 编号 | 能力 | 合法端点概要 | 状态 | 来源 | 约束 |
| --- | --- | --- | --- | --- | --- |
| CAP-CN-GEN-001 | 单向一般性关联 | Any Node -> Any Node | `MUST` | 第 11 章 | 方向形式化，自定义标签语义必须显式 |
| CAP-CN-GEN-002 | 双向一般性关联 | Any Node <-> Any Node | `MUST` | 第 11 章 | 双向语义和标签必须保留 |
| CAP-CN-GEN-003 | 关联信息 | Information 通过一般性关联连接两个或更多相关 Node | `MUST` | 第 11 章 | 关联信息不得替代正式关系类型 |
| CAP-CN-GEN-004 | 关联算子过程 | Feature/Value Domain 经 Process 关联 | `MUST` | 第 11 章“关联算子” | 作为过程构造表达定量或逻辑关联 |
| CAP-CN-GEN-005 | 主体关系版型 | Agent Relation -> Controlled Stereotype | `SHOULD` | 第 10 章“主体的版型” | 首期仅允许受控版型，不开放底层任意语义扩展 |
| CAP-CN-GEN-006 | 导入关系 | Source OPD Node -> Target OPD Reference | `SHOULD` | 第 12 章“导入” | 保留来源身份、版本和可见性 |

## 7. 修饰机制矩阵

| 编号 | 修饰机制 | ISO 配置档 | 中文草案配置档 | 关键约束 | 来源 |
| --- | --- | --- | --- | --- | --- |
| CAP-MOD-001 | 多重性/参与约束 | `MUST` | `MUST` | 端点适用范围、默认值和表达式按配置档校验 | ISO 11；中文草案第 8、9 章 |
| CAP-MOD-002 | 路径标签 | `MUST` | `MUST` | 成对关联输入与输出路径，消除执行歧义 | ISO 13；中文草案 10.1.4 |
| CAP-MOD-003 | Event 修饰 | `MUST` | `MUST` | 仅允许修饰配置档规定的动态关系 | ISO 9.5.2；中文草案 10.7 |
| CAP-MOD-004 | Condition 修饰 | `MUST` | `MUST` | 必须保留失败时 wait/skip 语义差异 | ISO 9.5.3；中文草案 10.7.5 |
| CAP-MOD-005 | Stop Event 修饰 | `DERIVED` | `MUST` | ISO 使用标准控制/异常机制；中文草案允许 `-e` | ISO 9.5；中文草案 10.7.2、10.7.6 |
| CAP-MOD-006 | 非必要条件 | `FORBIDDEN` | `MUST` | 中文草案使用 `un`，不得静默进入 ISO | 中文草案“过程条件的必要性” |
| CAP-MOD-007 | AND/XOR/OR | `MUST` | `MUST` | ISO 仅三种逻辑；中文草案还允许完整布尔表达 | ISO 12；中文草案第 12 章 |
| CAP-MOD-008 | 完整布尔运算 | `FORBIDDEN` | `MUST` | 转换到 ISO 前必须检查是否可无损降级为 AND/XOR/OR | 中文草案第 12 章 |
| CAP-MOD-009 | 概率 | `MUST` | `MUST` | 概率扇出总和及随机过程规则按配置档校验 | ISO 12.7；中文草案“随机过程和概率” |
| CAP-MOD-010 | 状态指定关系 | `MUST` | `DERIVED` | ISO 直接连接 Object State；中文草案通过 Value Domain/Value 表达 | ISO 9.3、9.4、10.4；中文草案第 7、8 章 |
| CAP-MOD-011 | 关系细化 | `DERIVED` | `MUST` | 中文草案允许上下层关系细化；ISO 按上下文与事实一致性处理 | ISO 14.2；中文草案第 12 章 |

## 8. 上下文与模型能力矩阵

| 编号 | 能力 | ISO 配置档 | 中文草案配置档 | 来源 |
| --- | --- | --- | --- | --- |
| CAP-CTX-001 | SD 与 OPD process tree | `MUST` | `DERIVED` | ISO 14.1、14.2.2.6.1；中文草案第 12 章 |
| CAP-CTX-002 | OPD object forest | `MUST` | `DERIVED` | ISO 14.2.2.6.1；中文草案第 12 章 |
| CAP-CTX-003 | System map | `MUST` | `SHOULD` | ISO 14.2.2.6.1.5 |
| CAP-CTX-004 | 作为模型组成部分的 Model view | `SHOULD` | `FORBIDDEN` | ISO 14.2.2.6.1.5；中文草案第 12 章规定非根 OPD 必须对应细化结点 |
| CAP-CTX-005 | 状态显式/抑制 | `MUST` | `DERIVED` | ISO 14.2.1.1；中文草案值域/值及 OPD 机制 |
| CAP-CTX-006 | 展开/折叠 | `MUST` | `MUST` | ISO 14.2.1.2；中文草案第 12 章 |
| CAP-CTX-007 | 内缩放/外缩放 | `MUST` | `MUST` | ISO 14.2.1.3；中文草案第 9、12 章 |
| CAP-CTX-008 | OPD 局部命名空间 | `FORBIDDEN` | `MUST` | ISO 7.3.3；中文草案第 12 章 |
| CAP-CTX-009 | 公开/保护/私有可见性 | `FORBIDDEN` | `MUST` | 中文草案第 12 章 |
| CAP-CTX-010 | 模型库与受控导入 | `SHOULD` | `SHOULD` | 中文草案第 12 章 |

## 9. 跨配置档关键差异

| 差异 | 中文草案 -> ISO 处理要求 |
| --- | --- |
| Thing、Value Domain、Value、Flow 独立结点 | 阻断或显式映射为 ISO Object、Object State、Attribute 或 Procedural Link；不得静默删除 |
| Process State | 阻断或映射为可验证的 Object/Attribute 状态模型 |
| 表征、描述 | 评估映射为 Exhibition-characterization；无法保持语义时标记有损 |
| 位置、权属 | 评估映射为 Tagged Structural Link，并保留原始扩展来源；不能标记为 ISO 原生关系 |
| 一般性关联 | 评估映射为 ISO Tagged Structural Link；空标签、双向和互惠语义分别处理 |
| 激活、去激活、激活翻转 | 分别评估 Invocation、Control 或 Exception 组合；无直接等价时阻断 |
| 完整布尔运算 | 只有可证明等价为 AND、XOR、OR 时允许无损转换 |
| `-e`、`un` 等修饰 | ISO 无直接对应时阻断或生成显式有损转换项 |
| 命名空间和可见性 | 转换前执行全模型名称冲突检查并展开可见性引用 |

## 10. 验收门槛

1. 元素面板和关系菜单只能显示当前配置档中为 `MUST` 或已实现 `SHOULD` 的能力。
2. 每个 `MUST` 基础关系必须具备创建、端点过滤、序列化、重新打开、文本生成和规则校验测试。
3. 每种修饰机制必须验证允许组合和禁止组合，不能只验证图形符号可绘制。
4. ISO 配置档不得创建本矩阵标记为 `FORBIDDEN` 的元素、关系或修饰符。
5. 中文草案配置档中的扩展必须携带配置档来源，导入 ISO 配置档时生成逐项转换结论。
6. 配置档能力报告必须列出未实现的 `SHOULD`、规则版本和测试证据版本。
7. 未被本矩阵列出的能力必须被阻止，或先通过需求变更流程纳入矩阵。

## 11. 冻结延期与证据边界

- ISO 19450:2024 的 103 个规则组已冻结；原子 `shall/shall not` 目录和自动化参数集属于 `DFD-004`；
- 当前 34 Capability 的 concrete OPL subset 已冻结；Annex A 完整可执行 Grammar 属于 `DFD-005`；
- 当前开发范围的 Symbol descriptor、marker、label 和 fan 规则已冻结；完整 Clause 4 Symbol Catalog 与全标准视觉证据属于 `DFD-006`；
- 中文配置档 exact source 固定为 `自动化系统与集成 对象过程语言-20250914`，专属能力和正式 OPT 资产属于 `DFD-002`；来源内容变化必须升级 Profile version；
- 外部 OPM 工具交换格式与互操作属于 `DFD-008`；本矩阵只约束内部语义，不宣称工具互操作。

上述项目均为 `FROZEN_DEFERRED`，不是开发人员可以自行补全的开放问题；owner、重启条件和禁止实现边界以 `docs/design/opm-design-freeze-baseline.md` 第 5 章为准。
