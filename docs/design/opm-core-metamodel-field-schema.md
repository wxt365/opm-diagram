# OPM 核心元模型字段级 Schema

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；逻辑字段、Control Modifier 与 Revision 0.2 目标表示冻结

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-29

## Task Type

- `feature`

## 1. 文档范围

本文档将公共语义内核、Context 投影、文本追踪、校验和 Revision 提交包下钻为逻辑字段级 schema，作为后续 JSON Schema/Protobuf、领域类型、持久化 schema 和原生交换 schema 的单一设计输入。

本文档中的字段类型是逻辑类型，不等同数据库列类型或某种编程语言类型。

本文档不负责：

1. 不枚举 ISO 和中文草案的全部 96 项 Capability 实例；
2. 不定义符号像素、OPL/OPT 语法产生式或原子规则内容；
3. 不生成正式 JSON Schema、DDL、ORM 实体或迁移脚本；
4. 不把公共核心暴露为用户可选的第三配置档；
5. 不允许使用无 schema 的通用属性 Map 绕过 Profile 约束。

## 2. 关联文档

1. `docs/requirements/opm-common-semantic-core.md`
2. `docs/requirements/opm-profile-capability-matrix.md`
3. `docs/design/opm-modeling-tool-persistence-contract.md`
4. `docs/design/opm-modeling-tool-application-api-contract.md`
5. `docs/design/opm-profile-package-field-schema.md`
6. `docs/design/opm-rule-definition-field-schema.md`

## 3. Schema 约定

### 3.1 Schema 标识

每个可独立校验的逻辑对象必须携带或由所在分区声明：

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `schema_id` | SchemaId | 是 | 本文固定逻辑标识，如 `MS-ELEM-001` |
| `schema_version` | SchemaVersion | 是 | `major.minor`；与 storage/exchange/Profile/revision 版本分离 |
| `extensions` | OrderedList<ExtensionBlock> | 否 | 只能使用活动 Profile 声明的命名空间和 schema |

### 3.2 通用逻辑类型

| 类型 | 逻辑约束 |
| --- | --- |
| `StableId` | 非空、不包含可变名称和路径；在所属 identity scope 内唯一且删除后不复用 |
| `SchemaId` | 受控注册表中的稳定标识 |
| `SchemaVersion` | `major.minor`，禁止把应用版本作为 schema 版本 |
| `CapabilityRef` | `{capability_id, profile_id, profile_version}`；必须解析到 Profile Package |
| `RuleRef` | `{rule_id, rule_version}`；必须解析到 Rule Set |
| `RevisionRef` | `{model_id, revision_id}`；目标 Revision 不可变且存在 |
| `EntityRef<T>` | `{entity_kind, entity_id}`；entity_kind 与目标 schema 匹配 |
| `QualifiedName` | `{namespace, local_name}`；名称唯一范围由 Profile 决定 |
| `VersionRef` | `{id, version, digest?}`；digest 存在时必须匹配 |
| `DigestRef` | `{algorithm, digest}`；算法来自受控白名单 |
| `Instant` | 带时区的时间表示，仅用于记录和展示，不作冲突排序 |
| `LocalizedText` | `{locale, text}`；界面消息可本地化，模型名称不强制单一语言 |
| `TypedValue` | 第 3.3 节封闭联合类型，不接受任意可执行对象 |

### 3.3 `MS-COM-001 TypedValue`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `value_kind` | Enum | 是 | `STRING/INTEGER/DECIMAL/BOOLEAN/ENUM/ID_REF/STATE_REF/RANGE/LIST/RECORD` |
| `value` | 对应标量或结构 | 是 | 必须匹配 value_kind |
| `unit_ref` | QualifiedName | 条件 | 只有 Capability 属性 schema 允许单位时可用 |
| `schema_ref` | SchemaId+Version | RECORD 时是 | RECORD 必须引用受控 schema，不接受无定义对象 |

LIST 必须声明元素 TypedValue schema；RANGE 必须有兼容的 lower/upper、开闭区间标识和合法顺序。

### 3.4 `MS-COM-002 SourceProvenance`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `source_profile_id/version` | VersionRef | 是 | 原始配置档和版本 |
| `source_kind` | QualifiedName | 是 | 原始元素、关系、状态或修饰类型 |
| `source_entity_id` | StableId | 是 | 原始事实或构造标识 |
| `source_package_id` | StableId | 否 | 来自导入时记录 |
| `origin_namespace` | QualifiedName | 是 | 解释源 ID 的命名空间 |

`OPL_PRODUCTION` 是仅供 parser/import 写入 Fact `source_kind` 的受控值。使用该值时，`source_profile_id/version` 必须等于当前 Revision 绑定的 Profile，`source_entity_id` 必须是该 Profile Grammar 中与 Fact Capability 匹配的 exact concrete `template_id`；编辑器新建或拖线不得产生该值，也不得只凭 `source_entity_id`、端点方向或画布几何推断它。

`CAP-ISO-STRUCT-006` 当前只允许 tuple `OPL_PRODUCTION + opl.structural.exhibition.v1` 触发 Exhibition parser/import 重建。该 tuple 复用既有 SourceProvenance，不新增 Modifier、Fact 字段或 SQLite 列；其他 `source_kind` 继续表示原始构造类型并进入默认 Characterization 生成分支。未知 production、Profile 不一致或 production 与 Capability 不匹配必须阻断，不能回退为默认句式。

### 3.5 `MS-COM-003 NormalizationRecord`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `level` | Enum | 是 | `CORE/CONDITIONAL/DERIVED/PROFILE_ONLY/LOSSY/UNMAPPABLE` |
| `condition_refs` | OrderedList<RuleRef> | CONDITIONAL 时是 | 所有前置条件必须可执行和可追踪 |
| `derived_from` | OrderedList<EntityRef> | DERIVED 时是 | 不创建无来源同名类型 |
| `loss_description` | LocalizedText | LOSSY 时是 | 不得为空 |
| `target_block_reason` | LocalizedText | UNMAPPABLE 时是 | 转换必须阻断 |

### 3.6 `MS-COM-004 ExtensionBlock`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `namespace` | QualifiedName | 是 | 必须由活动 Profile 声明 |
| `extension_schema_id/version` | SchemaId+Version | 是 | 必须能离线解析 |
| `required` | Boolean | 是 | 影响正式语义时必须为 true |
| `payload` | TypedValue(RECORD) | 是 | 按 extension schema 校验 |
| `source` | SourceProvenance | 是 | 保留配置档来源 |

未知 required ExtensionBlock 阻断打开、导入和转换；optional opaque 扩展不能进入正式 Fact、ISO OPL 或符合性结论。

## 4. Model 与 Profile 绑定

### 4.1 `MS-MODEL-001 SemanticModelHeader`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `model_id` | StableId | 是 | Project 内唯一，跨 Revision 不变 |
| `identity_namespace` | QualifiedName | 是 | 解释模型内全部稳定 ID |
| `name` | NonEmptyText | 是 | 名称唯一性由 Profile/项目规则决定 |
| `description` | Text | 否 | 不参与语义身份 |
| `profile_binding` | MS-MODEL-002 | 是 | 每个 Revision 绑定一个活动 Profile |
| `root_context_id` | StableId | 是 | 必须引用本 Revision 中合法根 Context |
| `source_origin` | SourceProvenance | 否 | 导入或迁移模型使用 |
| `schema_set_ref` | MS-MODEL-003 | 是 | 固定本 Revision 使用的 schema 集 |

### 4.2 `MS-MODEL-002 ProfileBinding`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `profile_id/profile_version` | VersionRef | 是 | 指向不可变 Profile Package |
| `rule_set_id/version` | VersionRef | 是 | 与 Profile dependency 匹配 |
| `text_grammar_id/version` | VersionRef | 是 | ISO 为 OPL，中文草案为 OPT |
| `symbol_catalog_id/version` | VersionRef | 是 | Context 投影必须可解析 |
| `normalization_adapter_id/version` | VersionRef | 是 | 公共核心往返和转换使用 |
| `binding_digest` | DigestRef | 是 | 覆盖所有依赖引用 |

### 4.3 `MS-MODEL-003 SchemaSetRef`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `core_metamodel_version` | SchemaVersion | 是 | 本文 schema 版本 |
| `profile_schema_version` | SchemaVersion | 是 | Profile Package schema 版本 |
| `rule_schema_version` | SchemaVersion | 是 | Rule Definition schema 版本 |
| `extension_schemas` | OrderedList<VersionRef> | 否 | 所有 required 扩展必须列出 |
| `storage_schema_version` | SchemaVersion | 是 | 仅指本地持久化封装，不替代上述版本 |

## 5. Semantic Element

### 5.1 `MS-ELEM-001 SemanticElement`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `element_id` | StableId | 是 | Model 内唯一，跨 OPD/Revision 稳定 |
| `core_kind` | Enum | 是 | `OBJECT/PROCESS/PROFILE_ELEMENT`；ISO 不允许 PROFILE_ELEMENT 实例绕过 Thing 约束 |
| `capability_ref` | CapabilityRef | 是 | 必须是 Element 类且状态允许创建/保留 |
| `name` | QualifiedName | 是 | 唯一范围由 Profile Name Policy 执行 |
| `essence` | Enum | 条件 | `PHYSICAL/INFORMATICAL`；Capability 要求时必填 |
| `affiliation` | Enum | 条件 | `SYSTEMIC/ENVIRONMENTAL`；Capability 要求时必填 |
| `perseverance` | Enum | 条件 | `STATIC/DYNAMIC/PERSISTENT` 或 Profile 映射值 |
| `feature_ids` | OrderedList<StableId> | 否 | 只能引用同 Model 的 MS-FEAT-001 |
| `state_ids` | OrderedList<StableId> | 否 | 只能引用以本 Element/Feature 为 owner 的状态 |
| `property_values` | OrderedList<MS-ELEM-004> | 否 | 每项必须由 Capability Property Schema 声明 |
| `source` | SourceProvenance | 是 | 原生创建也记录当前 Profile 来源 |
| `normalization` | NormalizationRecord | 是 | PROFILE_ONLY 不伪装为公共 core_kind |
| `extensions` | OrderedList<ExtensionBlock> | 否 | 受控扩展 |

### 5.2 `MS-STATE-001 StateAssertion`

State 不是独立 Thing。该 schema 表达对象/特征的从属状态或配置档等价值语义。

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `state_id` | StableId | 是 | Model 内唯一，跨 Revision 稳定 |
| `owner_ref` | EntityRef<Element/Feature> | 是 | ISO 只能归属合法 Object/Attribute；Process State 保持 PROFILE_ONLY |
| `capability_ref` | CapabilityRef | 是 | State/Value 类能力 |
| `name_or_value` | QualifiedName 或 TypedValue | 是 | 与 Capability schema 匹配 |
| `state_roles` | Set<Enum> | 否 | `INITIAL/DEFAULT/FINAL`；组合由 Profile 规则限制 |
| `value_domain_ref` | EntityRef<Feature/ProfileElement> | 否 | 中文值域/值使用，不能静默变为 ISO Thing |
| `source` | SourceProvenance | 是 | 保留原始 State/Value 表达 |
| `normalization` | NormalizationRecord | 是 | 条件映射明确 |

### 5.3 `MS-FEAT-001 FeatureDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `feature_id` | StableId | 是 | Model 内唯一 |
| `owner_element_id` | StableId | 是 | 引用存在的 Element |
| `feature_kind` | Enum | 是 | `ATTRIBUTE/OPERATION/PROFILE_FEATURE` |
| `capability_ref` | CapabilityRef | 是 | Characterization/Feature 能力 |
| `name` | QualifiedName | 是 | 唯一范围由 Profile 决定 |
| `value_schema_ref` | SchemaId+Version | 否 | 属性值存在时必填 |
| `source/normalization/extensions` | 对应公共结构 | 是/条件 | 不丢失原始语义 |

### 5.3.1 完整画布 Feature 最小落地边界

`DEV-CANVAS-04` 仅启用 `ATTRIBUTE` 与 `OPERATION` 两种 FeatureDefinition，且必须归属一个现有 Element。Feature 不是 Element，不得使用 `OBJECT` 或 `PROCESS` 代替 Feature endpoint。

Feature 的 `state_ids` 由 owner 关系派生，不写入 `FeatureDefinition`；归属 Feature 的 State 必须为 Value State。首期不开放 `PROFILE_FEATURE`、Feature 更新/删除、value schema 编辑或独立 Feature OPL/Trace。

`MS-STATE-001.owner_ref` 在本包扩展为 `EntityRef<Element/Feature>`：

| owner_ref.target_kind | 允许 capability | State 语义 |
| --- | --- | --- |
| `ELEMENT` | `CAP-STATE-001` | 既有 Object State |
| `FEATURE` | `CAP-FEAT-STATE-001` | Feature Value State |

Feature Value State 只能归属 `ATTRIBUTE/OPERATION` Feature；它可作为 `CAP-ISO-STRUCT-009` 的 `FEATURE_VALUE_STATE` 端点，不能作为 Procedural/Control 或既有 Object State 的端点。

### 5.4 `MS-ELEM-004 PropertyValue`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `property_id` | StableId | 是 | Owner 内唯一 |
| `property_schema_ref` | PS-CAP-002 Ref | 是 | 必须来自 Element Capability 的 PropertySchema |
| `value` | TypedValue | 是 | 类型、范围、基数满足 schema |
| `source` | SourceProvenance | 条件 | 导入/归一化值必须记录 |

禁止增加 `Map<String, Any>` 类型的业务属性。新增正式属性必须先进入 Profile Capability/Property Schema。

## 6. Semantic Fact 与修饰

### 6.1 `MS-FACT-001 SemanticFact`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `fact_id` | StableId | 是 | Model 内唯一，跨 OPD 重现不复制 |
| `fact_family` | Enum | 是 | `TRANSFORMATION/ENABLING/STRUCTURAL/CONTROL/LOGICAL/PROFILE_FACT` |
| `capability_ref` | CapabilityRef | 是 | 必须是 Relation/Fact 类能力 |
| `endpoints` | OrderedList<MS-FACT-002> | 是 | 数量、角色、顺序和类型满足 Endpoint Schema |
| `direction` | Enum | 是 | `DIRECTED/BIDIRECTIONAL/UNDIRECTED/PROFILE_DEFINED`；必须被 Capability 允许 |
| `modifier_ids` | OrderedList<QualifiedName> | 否 | 在本 Fact scope 内引用 MS-MOD-001 `modifier_id`，组合合法且顺序规范化 |
| `condition_id` | StableId | 否 | 引用独立 MS-COND-001 谓词；不得仅为表达 ISO Event/Condition Control 类型而创建 |
| `logical_group_ids` | OrderedList<StableId> | 否 | 引用 MS-LOGIC-001 |
| `source` | SourceProvenance | 是 | 保存原始关系类型和 ID |
| `normalization` | NormalizationRecord | 是 | 端点、方向、修饰均纳入结论 |
| `extensions` | OrderedList<ExtensionBlock> | 否 | Profile 受控 |

### 6.2 `MS-FACT-002 FactEndpoint`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `endpoint_id` | StableId | 是 | Fact 内唯一 |
| `role` | QualifiedName | 是 | 如 source/target/consumer/result/agent/instrument；由 Capability 定义 |
| `target_ref` | EntityRef<Element/State/Feature/Fact> | 是 | 目标 kind 必须满足 endpoint schema；不允许悬空 |
| `ordinal` | NonNegativeInteger | 是 | Ordered endpoint 唯一且连续 |
| `path_label` | NonEmptyText | 否 | Capability 允许路径时使用 |
| `state_qualification` | EntityRef<State> | 否 | 状态属于相关 Element/Feature |
| `multiplicity` | MS-MOD-002 | 否 | Endpoint 允许多重性时使用 |

### 6.3 `MS-MOD-001 FactModifier`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `modifier_id` | QualifiedName | 是 | `target_ref` 内唯一的受控语义键；正式键必须来自 PS-CAP-004，如 `control.capability` |
| `capability_ref` | CapabilityRef | 是 | Modifier 类能力 |
| `target_ref` | EntityRef<Fact/Endpoint/LogicGroup> | 是 | 目标范围受 Capability 限制 |
| `value` | TypedValue | 是 | 按 Modifier Value Schema 校验 |
| `source/normalization` | 公共结构 | 是 | 保留来源和转换结论 |

#### 6.3.1 ISO Control Modifier Pair

ISO Event/Condition Control 不创建独立 Fact。它在一个合法的基础 Procedural Fact 上使用以下两个 MS-MOD-001 值对象：

| `modifier_id` | `capability_ref` | `value` | `target_ref` | 基数 |
| --- | --- | --- | --- | --- |
| `control.capability` | 所选 `CAP-ISO-CTRL-*` | 与 capability_ref 相同 | 基础 Fact | Control 存在时恰好 1 |
| `control.segment` | 同一 `CAP-ISO-CTRL-*` | 常量 `PROCESS_INPUT` | 同一基础 Fact | Control 存在时恰好 1 |

冻结规则：

1. 基础 Fact 的 `fact_id`、`fact_family`、`capability_ref` 和 endpoints 继续表达 Consumption/Effect/Agent/Instrument 等 Procedural 事实；ISO Profile 禁止为此使用 `fact_family=CONTROL`；
2. 两个 Modifier 必须同时出现、同时更新或同时删除，同一 Fact 不得出现第二组 Control pair；
3. pair 中两个 `capability_ref` 必须相同，且 `control.capability.value` 必须等于该引用的 Capability ID；`CAP-ISO-CTRL-001~004` 依赖 Event/CAP-MOD-003，`CAP-ISO-CTRL-005~008` 依赖 Condition/CAP-MOD-004；
4. 具体 Transforming/Enabling 和 State-specified 合法性由基础 Fact Capability、端点与 Profile Rule 联合判定；`control.segment` 在当前 ISO Profile 中只有 `PROCESS_INPUT`，Effect 输出 segment、Result Link 和自由画布 segment 均不得保存 Control；
5. `condition_id` 仅承载独立、可引用的谓词/subject expression。仅有 Control Link 时保持为空，不能与 `control.capability` 重复表达 Event/Condition；
6. Revision 摘要、Normalization、OPL/Trace 和 Rule Evidence 必须覆盖两个 Modifier；删除任一项形成的半对状态在 PRE_COMMIT 阻断。

### 6.4 `MS-MOD-002 Multiplicity`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `lower` | NonNegativeInteger | 是 | lower <= upper；未界定 upper 除外 |
| `upper` | NonNegativeInteger 或 UNBOUNDED | 是 | Profile 允许 UNBOUNDED 时可用 |
| `expression_root` | MS-MOD-003 | 否 | 只有 Capability 允许表达式基数时可用 |
| `is_default` | Boolean | 是 | 区分显式值和 Profile 默认 |

### 6.5 `MS-MOD-003 ModelValueExpression`

该表达式是模型中的数值/参与约束事实，不是 Rule Definition 的校验表达式。

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `node_id` | StableId | 是 | 表达式内唯一，节点图无环 |
| `node_kind` | Enum | 是 | `LITERAL/PROPERTY_REF/UNARY/BINARY/NARY` |
| `operator` | Enum | 条件 | `NEGATE/ADD/SUBTRACT/MULTIPLY/DIVIDE/MIN/MAX` |
| `arguments` | OrderedList<MS-MOD-003 Ref> | 条件 | 数量满足 operator 签名 |
| `literal` | TypedValue(INTEGER/DECIMAL) | LITERAL 时是 | 单位受 Capability 约束 |
| `property_ref` | EntityRef+PS-CAP-002 Ref | PROPERTY_REF 时是 | 只能读取同一 Model 中允许参与约束的数值属性 |
| `result_type` | Record | 是 | 固定 value_kind、Decimal 精度和可选 unit_ref，静态可判定 |

表达式禁止脚本、动态函数、网络、系统时间和随机数；零除、单位不兼容或循环引用阻断提交。

### 6.6 `MS-COND-001 SemanticCondition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `condition_id` | StableId | 是 | Model 内唯一 |
| `condition_kind` | Enum | 是 | `EVENT/CONDITION/EXCEPTION/PROFILE_CONDITION` |
| `necessity` | Enum | 条件 | `REQUIRED/OPTIONAL/PROFILE_DEFINED` |
| `behavior` | Enum | 条件 | `WAIT/SKIP/TRIGGER/STOP/PROFILE_DEFINED` |
| `subject_refs` | OrderedList<EntityRef> | 是 | 状态、对象、过程或允许的 Fact |
| `boolean_expression` | MS-COND-002 | 否 | Profile 允许时使用 |
| `source/normalization/extensions` | 公共结构 | 是/条件 | 完整布尔和 `-e/un` 保持 PROFILE_ONLY |

### 6.7 `MS-COND-002 ModelBooleanExpression`

这是模型语义，不是规则执行表达式。

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `operator` | Enum | 是 | `AND/OR/XOR/NOT/PROFILE_OPERATOR` |
| `operands` | OrderedList<StateRef/ConditionRef/NestedExpression> | 是 | AND/OR/XOR 至少 2 项；NOT 恰好 1 项 |
| `source` | SourceProvenance | 是 | Profile operator 保留来源 |

### 6.8 `MS-LOGIC-001 LogicalGroup`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `group_id` | StableId | 是 | Model 内唯一 |
| `operator` | Enum | 是 | `AND/XOR/OR/PROFILE_OPERATOR` |
| `direction_scope` | Enum | 是 | `INPUT/OUTPUT/BOTH/PROFILE_DEFINED` |
| `member_fact_ids` | OrderedList<StableId> | 是 | 至少 2 个存在 Fact，不能跨 Model |
| `probabilities` | OrderedList<Decimal> | 否 | Capability 要求时与成员一一对应并满足总和规则 |
| `source/normalization` | 公共结构 | 是 | 规则版本可追溯 |

## 7. OPD Context 与布局

### 7.1 `MS-CTX-001 OpdContext`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `context_id` | StableId | 是 | Model 内唯一，跨 Revision 稳定 |
| `context_kind` | Enum | 是 | `SYSTEM_DIAGRAM/PROCESS_REFINEMENT/OBJECT_REFINEMENT/MODEL_VIEW/PROFILE_CONTEXT` |
| `capability_ref` | CapabilityRef | 是 | Context 类能力 |
| `name` | QualifiedName | 是 | 唯一范围由 Profile 决定 |
| `namespace_scope` | QualifiedName | 条件 | 仅 Profile 声明 Context 命名空间时使用 |
| `occurrence_ids` | OrderedList<StableId> | 是 | 引用本 Context 的 occurrence |
| `view_definition_id` | StableId | MODEL_VIEW 时是 | 引用 MS-CTX-005 |
| `source` | SourceProvenance | 是 | 原生创建记录当前 Profile |

### 7.2 `MS-CTX-002 Occurrence`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `occurrence_id` | StableId | 是 | Context 内唯一 |
| `context_id` | StableId | 是 | 引用存在 Context |
| `target_ref` | EntityRef<Element/Fact/State/Feature> | 是 | 引用同 Model 正式实体 |
| `ownership` | Enum | 是 | `OWNED/REFERENCED/VIEW_DERIVED` |
| `construct_role` | QualifiedName | 是 | 由 Symbol/Context Capability 定义 |
| `layout_id` | StableId | 是 | 引用 MS-CTX-004 |

Occurrence 删除不等同目标事实删除。VIEW_DERIVED occurrence 不能成为事实 owner。

### 7.3 `MS-CTX-003 RefinementEdge`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `refinement_id` | StableId | 是 | Model 内唯一 |
| `parent_context_id/child_context_id` | StableId | 是 | Context 存在、不同且不形成非法循环 |
| `refineable_ref` | EntityRef<Element/Fact> | 是 | Profile 允许细化的对象 |
| `refinee_refs` | OrderedList<EntityRef> | 是 | 至少一个详细事实或元素 |
| `method` | Enum | 是 | `STATE_EXPRESSION/STATE_SUPPRESSION/UNFOLDING/FOLDING/IN_ZOOMING/OUT_ZOOMING/PROFILE_METHOD` |
| `tree_role` | Enum | 是 | `PROCESS_TREE/OBJECT_FOREST/PROFILE_STRUCTURE` |
| `semantic_order` | OrderedList<EntityRef> | 条件 | Process in-zoom 垂直偏序等语义布局 |
| `source` | SourceProvenance | 是 | 细化机制来源 |

### 7.4 `MS-CTX-004 OccurrenceLayout`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `layout_id` | StableId | 是 | Occurrence 一一引用或显式共享 |
| `geometric` | MS-CTX-004A | 是 | x/y/width/height/route/z-order 等纯视图字段 |
| `semantic` | MS-CTX-004B | 否 | 仅保存 Profile 明确规定有语义的布局 |
| `layout_version` | SchemaVersion | 是 | 与模型 Revision 分离 |

`MS-CTX-004A` 的变化不得改变 Fact、文本或语义校验；`MS-CTX-004B` 至少包含 semantic_property_ref、TypedValue 和 RuleRef，变化必须走完整语义事务。

### 7.5 `MS-CTX-004A GeometricLayout`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `x/y/width/height` | Decimal | 是 | 有限值，尺寸满足 Symbol 最小值 |
| `rotation` | Decimal | 否 | 仅 Symbol Catalog 允许时使用 |
| `z_order` | Integer | 是 | Context 内稳定排序，不能表达执行顺序 |
| `route_points` | OrderedList<Point> | 否 | 关系折点；不得改变端点和方向 |
| `label_offsets` | OrderedList<StableId+Point> | 否 | 只调整视觉标签位置 |
| `collapsed` | Boolean | 否 | 只改变当前构造展示，不替代 Folding 语义命令 |

### 7.6 `MS-CTX-004B SemanticLayout`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `semantic_property_ref` | PS-CAP-002 Ref | 是 | Profile 明确声明为语义布局字段 |
| `value` | TypedValue | 是 | 类型、范围和单位满足 PropertySchema |
| `rule_refs` | OrderedList<RuleRef> | 是 | 至少一个解释或校验规则 |
| `source` | SourceProvenance | 是 | 记录原始布局语义来源 |

### 7.7 `MS-CTX-005 ViewDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `view_definition_id` | StableId | 是 | Model 内唯一 |
| `selection_expression` | MS-CTX-006 | 是 | 仅选择既有稳定事实，不执行脚本 |
| `source_fact_ids` | OrderedList<StableId> | 是 | 与表达式结果一致 |
| `source_context_ids` | OrderedList<StableId> | 是 | 可追踪来源 |
| `generated_text_scope` | Enum | 是 | `PARAGRAPH/SECTION`，由 Profile 决定 |

### 7.8 `MS-CTX-006 ViewQueryNode`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `node_id` | StableId | 是 | ViewDefinition 内唯一，AST 无环 |
| `node_kind` | Enum | 是 | `ID_SET/CORE_KIND/CAPABILITY/CONTEXT_SOURCE/AND/OR/NOT` |
| `entity_ids` | OrderedSet<StableId> | ID_SET 时是 | 必须引用同一 Model 正式实体 |
| `core_kinds` | Set<Enum> | CORE_KIND 时是 | 使用 MS-ELEM-001/MS-FACT-001 封闭枚举 |
| `capability_refs` | OrderedSet<CapabilityRef> | CAPABILITY 时是 | 与 Model ProfileBinding 匹配 |
| `context_ids` | OrderedSet<StableId> | CONTEXT_SOURCE 时是 | 只能读取源 Context |
| `arguments` | OrderedList<MS-CTX-006 Ref> | 逻辑节点是 | AND/OR 至少 2 项，NOT 恰好 1 项 |
| `result_order` | Enum | 根节点是 | 固定 `STABLE_ID_ASC/CONTEXT_THEN_STABLE_ID` |

ViewQuery 只能返回既有 Element/Fact/State/Feature 引用，不得构造新 Fact、访问外部数据或依赖当前时间。

## 8. 文本与追踪

### 8.1 `MS-TEXT-001 TextArtifact`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `artifact_id` | StableId | 是 | input_revision + scope + grammar 唯一 |
| `input_revision` | RevisionRef | 是 | 不可变输入 |
| `profile/rule/grammar refs` | VersionRef | 是 | 必须与 Revision binding 匹配 |
| `modality` | Enum | 是 | `OPL/OPT` |
| `scope` | Enum+EntityRef | 是 | `CONTEXT/SUBTREE/MODEL` |
| `paragraph_ids` | OrderedList<StableId> | 是 | 顺序确定性 |
| `artifact_digest` | DigestRef | 是 | 正式文本完整性 |

### 8.2 `MS-TEXT-002 Paragraph` 与 `MS-TEXT-003 Sentence`

| 对象 | 必填字段 | 约束 |
| --- | --- | --- |
| Paragraph | paragraph_id、context_id、ordinal、sentence_ids | 每个正式 Context 有对应 Paragraph/章节 |
| Sentence | sentence_id、text、ordinal、generation_rule_refs、input_fact_ids | 文本只读；无 Fact/Rule 来源不得成为正式 Sentence |

### 8.3 `MS-TRACE-001 TextTrace`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `trace_id` | StableId | 是 | artifact 内唯一 |
| `fact_ids` | OrderedSet<StableId> | 是 | 至少一个 Fact |
| `construct_refs` | OrderedSet<Context+Occurrence> | 是 | 至少一个图形构造 |
| `sentence_ids` | OrderedSet<StableId> | 是 | 至少一个 Sentence |
| `rule_refs` | OrderedSet<RuleRef> | 是 | 生成和组合规则可追踪 |

## 9. 校验与符合性

### 9.1 `MS-VAL-001 ValidationFinding`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `finding_id` | StableId | 是 | report 内唯一、确定性生成时可稳定复现 |
| `input_revision` | RevisionRef | 是 | Finding 不能脱离输入修订 |
| `rule_ref` | RuleRef | 是 | 指向实际执行规则 |
| `severity` | Enum | 是 | `BLOCKING/WARNING/SUGGESTION` |
| `category` | QualifiedName | 是 | LANGUAGE/METHOD/QUALITY/CONFORMANCE 等受控分类 |
| `message` | LocalizedText | 是 | 业务语言，不只返回规则代码 |
| `remediation` | LocalizedText | 否 | 修复建议或豁免条件 |
| `locators` | OrderedList<MS-VAL-002> | 是 | 至少定位 model/context/element/fact/sentence 之一 |
| `evidence_refs` | OrderedList<DigestRef/EntityRef> | 否 | 基线门槛使用 |

### 9.2 `MS-VAL-002 FindingLocator`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `model_id/context_id` | StableId | model 是，context 条件 | context 必须属于 model |
| `entity_ref` | EntityRef | 否 | Element/Fact/State/Occurrence/Sentence 等 |
| `field_path` | SchemaFieldPath | 否 | 必须解析到目标 schema 字段 |
| `trace_id` | StableId | 否 | 文本/图形联动使用 |

### 9.3 `MS-VAL-003 ValidationReport`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `report_id` | StableId | 是 | 不可变 |
| `input_revision/profile/rule refs` | 对应引用 | 是 | 新鲜度判断依据 |
| `scope` | Enum | 是 | `COMMAND_FILTER/PRE_COMMIT/POST_COMMIT/BASELINE_GATE/CONVERSION` |
| `finding_ids` | OrderedList<StableId> | 是 | 引用报告内 Finding |
| `severity_counts` | Record | 是 | 与 Finding 集合一致 |
| `rule_coverage` | MS-VAL-004 | 是 | 执行、跳过、失败和缺证据规则 |
| `conformance_summary` | Record | 条件 | 只在相应范围生成，缺证据不得输出符合 |
| `report_digest` | DigestRef | 是 | Baseline 引用 |

### 9.4 `MS-VAL-004 RuleCoverageSummary`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `applicable_rule_refs` | OrderedSet<RuleRef> | 是 | 按固定 Profile、Rule Set、阶段和 scope 计算 |
| `passed/failed/not_applicable` | OrderedSet<RuleRef> | 是 | 互不重叠 |
| `skipped/evaluation_error` | OrderedSet<RuleRef> | 是 | 任一非空时 Baseline 符合性不得判定通过 |
| `missing_evidence` | OrderedList<RuleRef+EvidenceTypeRef> | 否 | 缺证据不计为 passed |
| `coverage_digest` | DigestRef | 是 | 可由 RS-RUN-002 详细结果确定性投影 |

## 10. Revision 分区根

### 10.1 `MS-REV-001 RevisionDocument`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `revision_id/model_id/parent_revision_id` | StableId | 是/条件 | 父链无环；初始 Revision 无 parent |
| `revision_sequence` | PositiveInteger | 是 | Model 内单调，非全局时间 |
| `schema_set_ref/profile_binding` | 对应结构 | 是 | 固定解释上下文 |
| `model_header` | MS-MODEL-001 | 是 | model_id 一致 |
| `elements/states/features` | 对应对象集合 | 是 | ID 唯一、引用闭合 |
| `facts/modifiers/conditions/logic_groups` | 对应对象集合 | 是 | 引用闭合、Capability 合法 |
| `contexts/occurrences/refinements/layouts/views` | 对应对象集合 | 是 | 上下文结构合法 |
| `text_artifact/traces` | 对应对象集合 | 是 | 与本 Revision、Profile 和规则匹配 |
| `commit_validation_summary` | MS-VAL-003 摘要子集 | 是 | BLOCKING 为零才能提交 |
| `method_partition` | Versioned Record | 否 | 与语言事实分区 |
| `revision_digest` | DigestRef | 是 | 覆盖规范化逻辑内容 |

## 11. 跨对象不变量

| 编号 | 不变量 | 阻断阶段 |
| --- | --- | --- |
| MS-INV-001 | 所有 StableId 在声明 scope 内唯一且引用目标存在 | PRE_COMMIT/CONVERSION |
| MS-INV-002 | 同一语义实体跨 Context 只创建 Occurrence，不复制 Element/Fact | PRE_COMMIT |
| MS-INV-003 | StateAssertion 从属于合法 Element/Feature，不作为无 owner Thing | PRE_COMMIT |
| MS-INV-004 | Fact endpoint、方向、角色和 modifier 满足 Capability Schema | COMMAND_FILTER/PRE_COMMIT |
| MS-INV-005 | PROFILE_ONLY/LOSSY/UNMAPPABLE 语义保留来源，不进入其他 Profile 正式事实 | CONVERSION |
| MS-INV-006 | geometric layout 不影响 Fact/Text；semantic layout 进入完整事务 | PRE_COMMIT |
| MS-INV-007 | Context、Refinement、View 和 occurrence 引用闭合且结构无非法循环 | PRE_COMMIT/POST_COMMIT |
| MS-INV-008 | 每个正式 Sentence/Construct 可追溯到 Fact 和 Rule | PRE_COMMIT/BASELINE_GATE |
| MS-INV-009 | Revision 中所有分区使用同一 Profile/rule/schema set 和 input revision | PRE_COMMIT |
| MS-INV-010 | Baseline 引用不可变 Revision，schema 升级不得原地改写 | CONVERSION |
| MS-INV-011 | ISO Control 仅以基础 Fact 上唯一、成对的 `control.capability/control.segment` 表达；禁止独立 Control Fact、输出段 Control 和重复 condition | COMMAND_FILTER/PRE_COMMIT |

## 12. Schema 兼容与迁移

### 12.1 兼容分类

本次 Control 冻结将草案期 `modifier_id` 身份明确为 `(target_ref, modifier_id)`，Revision inline 表示由 owning Fact 隐含 target。当前尚无已发布的 Modifier 机器 Schema，因此这是设计期校准；任何已按“Model 内全局 modifier_id”实现的试验代码都必须迁移并通过 roundtrip，不能同时保留两种身份口径。

| 变更 | 兼容级别 | 要求 |
| --- | --- | --- |
| 新增 optional 字段且默认不改变语义 | MINOR_COMPATIBLE | 升 minor，旧读取器可忽略但需保留 required 扩展 |
| 新增 enum 值 | CONDITIONAL | 读取器必须声明 unknown 策略；影响语义时升 major |
| 新增 required 字段 | MAJOR_MIGRATION | 升 major，提供确定性迁移和反例 |
| 删除/重命名字段 | MAJOR_MIGRATION | 先弃用，迁移保留来源，不就地丢弃 |
| 改变字段含义、单位、身份 scope 或引用目标 | BREAKING | 新 schema_id/major，禁止静默解释 |
| 收紧不变量 | MIGRATION_REQUIRED | 先扫描历史数据并生成 blocked 清单 |

### 12.2 迁移步骤

1. 读取旧 schema_set_ref 和 digest；
2. 选择显式 source -> target migration；
3. 在 staging 中转换全部分区并生成 Identity/Field Mapping；
4. 执行 MS-INV、Profile、Rule 和 Text 全量验证；
5. 生成迁移报告、输入/输出 digest 和阻断项；
6. 成功后创建新 Draft Revision 或新项目，不原地改写 Baseline；
7. 失败保留原数据和报告，无 DDL 或运行数据变更。

### 12.3 数据库迁移适用性

本任务没有数据库、DDL、索引或 Flyway 脚本变更，目标数据库仍未选择。未来将本 schema 映射到达梦/MySQL/PostgreSQL 等关系数据库时，必须另行评估字段类型、唯一约束、外键、事务和索引方言，不能从本逻辑 schema 推断数据库兼容性已经验证。

## 13. 验收映射

| Schema 域 | 上游需求 | 代表性验证 |
| --- | --- | --- |
| Element/State/Feature | CAP-ELEM-*、CAP-PROP-*、CORE-ELEM-* | 合法对象/过程、状态 owner、Profile 专属元素反例 |
| Fact/Endpoint/Modifier | CAP-ISO-*、CAP-CN-*、CAP-MOD-* | 端点、方向、组合、路径、逻辑和概率正反例 |
| Context/Occurrence | CAP-CTX-*、FR-OPD-* | SD、process tree、object forest、view 和跨图身份 |
| Text/Trace | FR-TEXT-*、CORE-TEXT-001 | Fact/Construct/Sentence 多对多完整性 |
| Validation | FR-VAL-*、ISOR-* | 规则版本、严重级别、定位和证据缺口 |
| Revision | FR-VER-*、NFR-REL-* | 原子提交、不可变 Baseline 和迁移回滚 |

## 14. 事实与建议

### 14.1 已确认事实

1. 公共核心不是面向用户的配置档，活动 Model 只能绑定 ISO 或中文草案 Profile；
2. State 是从属语义，不得无依据作为独立 Thing；
3. Element/Fact 是语义事实，Occurrence/Layout 是 Context 表达，Text/Finding 是带 Revision 的投影；
4. 当前已有 0.1 Revision 机器 Schema 和代表样例；完整 0.2 目标、兼容 reader/writer 与运行 roundtrip 仍待开发包验收；
5. 当前无数据库变更、Flyway migration 或 SQL。

### 14.2 冻结实现约束

1. `MS-*` 逻辑对象和字段是正式 machine-readable schema 的上游输入；
2. ViewQuery、TypedValue RECORD、Profile Extension 和模型值表达式必须按本文现有字段与封闭枚举转换，无法无歧义转换时关闭开发门，不得由实现自行增加开放 Map；
3. 核心字段应通过 ISO/CN 代表性模型、roundtrip 和破损引用数据集验证；
4. 物理 schema 固定为 SQLite V1；索引和查询优化只能在不改变语义身份、Revision 不可变性和 API 观察行为的前提下实施。
