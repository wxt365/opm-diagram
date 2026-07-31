# OPM Profile Package 字段级 Schema

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；Profile 字段与完整关系 Symbol Descriptor 冻结

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-28

## Task Type

- `feature`

## 1. 文档范围

本文档定义 ISO 19450:2024 配置档和中文草案配置档的版本化 Profile Package。它把能力、字段、端点、修饰、上下文、符号、文本语法、公共核心适配和迁移规则收敛为可离线解析的逻辑字段级 schema。

Profile Package 回答“当前配置档允许表达什么、如何解释、如何绘制、如何生成文本以及如何迁移”，不负责保存模型实例或执行规则。

本文档不负责：

1. 不把公共语义内核发布为第三配置档；
2. 不在本文重复 96 项 `CAP-*` 的业务定义；
3. 不把 Clause 4 符号目录及 Clause 7-10 的图形语义伪造为浏览器像素参数，也不在本文定义 Annex A 完整 EBNF；
4. 不生成 JSON Schema、Protobuf、DDL、Flyway 或运行时代码；
5. 不允许任意属性 Map、包内脚本或网络调用作为扩展机制。

## 2. 关联文档

1. `docs/requirements/opm-profile-capability-matrix.md`
2. `docs/requirements/opm-common-semantic-core.md`
3. `docs/requirements/iso-19450-2024-conformance-matrix.md`
4. `docs/design/opm-core-metamodel-field-schema.md`
5. `docs/design/opm-rule-definition-field-schema.md`
6. `docs/design/opm-native-exchange-package-contract.md`
7. `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
8. `docs/design/opm-complete-canvas-toolchain-design.md`

## 3. Schema 约定

### 3.1 通用类型

| 类型 | 逻辑约束 |
| --- | --- |
| `ProfileId` | 稳定、全局可区分；首期只发布 ISO 和中文草案两个产品配置档 |
| `PackageVersion` | `major.minor.patch`；发布后内容不可变，同版本同 digest |
| `SchemaRef` | `{schema_id, schema_version}`；必须解析到包内或依赖闭包中的 schema |
| `AssetRef` | `{asset_id, asset_version, digest}`；禁止绝对路径和外部网络地址 |
| `CapabilityRef` | `{capability_id, profile_id, profile_version}` |
| `RuleSetRef` | `{rule_set_id, rule_set_version, digest}` |
| `StandardRef` | `{standard_id, edition, locator, source_digest}`；locator 可定位章、条款或草案章节 |
| `LocalizedTextSet` | 至少一个 locale 的非空文本；ID 不从展示名称推导 |
| `DigestRef` | `{algorithm, digest}`；算法来自读取器白名单 |
| `TypedValueSchema` | `MS-COM-001 TypedValue` 的封闭约束，不接受任意对象 |

### 3.2 标识与不可变性

- `PS-*` 是本文逻辑 schema 标识，和 `CAP-*` 能力编号、Profile 版本、Rule 版本分离；
- `ACTIVE/DEPRECATED/RETIRED` Package 不可原地修改；任何资产或规则变化必须产生新版本和 digest；
- 同一 `profile_id + version` 只能解析到一个 Package digest；
- Model Revision 通过 `MS-MODEL-002 ProfileBinding` 固定 Package 及依赖，不读取“当前最新版本”。

## 4. Package 根与身份

### 4.1 `PS-PKG-001 ProfilePackage`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `schema_id/schema_version` | SchemaId+Version | 是 | 固定为本文 Package 根 schema |
| `identity` | PS-PKG-002 | 是 | Profile 与 Package 身份 |
| `lifecycle` | PS-PKG-003 | 是 | 状态和兼容窗口 |
| `dependencies` | OrderedList<PS-PKG-004> | 是 | 包含 Rule Set、Grammar、Symbol 和扩展 schema 依赖 |
| `capability_catalog` | PS-CAP-001 集合 | 是 | 对 96 项能力宇宙逐项给出状态和 schema |
| `name_identity_policy` | PS-POL-001 | 是 | 名称唯一范围、命名空间和稳定 ID 规则 |
| `symbol_catalog` | PS-SYM-001 | 是 | 图形资产与语义锚点目录 |
| `text_grammar` | PS-TEXT-001 | 是 | OPL 或 OPT 语法与生成映射 |
| `normalization_adapter` | PS-NORM-001 | 是 | Profile Fact 与公共核心双向映射 |
| `migration_catalog` | PS-MIG-001 集合 | 否 | 已支持的来源版本迁移 |
| `extension_schemas` | PS-EXT-001 集合 | 否 | 命名空间化受控扩展 |
| `manifest` | PS-PKG-005 | 是 | 闭包、条目和 digest |

### 4.2 `PS-PKG-002 ProfileIdentity`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `profile_id` | ProfileId | 是 | 跨版本稳定 |
| `package_version` | PackageVersion | 是 | 与同 ID 的已发布版本不冲突 |
| `display_names` | LocalizedTextSet | 是 | ISO 配置档和中文草案配置档明确区分 |
| `standard_refs` | OrderedList<StandardRef> | 是 | 标准版次、草案日期和来源摘要完整 |
| `text_modality` | Enum | 是 | `OPL/OPT`，必须与 Grammar 一致 |
| `identity_namespace` | QualifiedName | 是 | Package 内资产标识范围 |

### 4.3 `PS-PKG-003 PackageLifecycle`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `status` | Enum | 是 | `DRAFT/ACTIVE/DEPRECATED/RETIRED` |
| `released_at` | Instant | ACTIVE 后是 | 仅记录，不参与版本排序 |
| `supersedes` | VersionRef | 否 | 只能指向同 profile_id 的旧版本 |
| `minimum_reader_schema` | SchemaVersion | 是 | 读取器低于此版本必须阻断 |
| `support_window` | Record | 否 | 仅声明产品支持窗口，不改变语义 |

### 4.4 `PS-PKG-004 PackageDependency`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `dependency_role` | Enum | 是 | `RULE_SET/SYMBOL_ASSET/GRAMMAR_ASSET/EXTENSION_SCHEMA/NORMALIZATION_DATA` |
| `asset_ref` | AssetRef/RuleSetRef | 是 | 固定精确版本和 digest，不允许 latest/range |
| `required` | Boolean | 是 | 影响正式语义时必须为 true |
| `embedded` | Boolean | 是 | false 时仍必须能从已安装离线仓解析 |
| `load_order` | NonNegativeInteger | 是 | 仅处理资产装载，不表达规则优先级 |

所有 required 依赖的传递闭包必须在打开 Model 前离线解析完成。循环依赖、digest 不匹配或未知 required 依赖阻断加载。

## 5. Capability Catalog

### 5.1 `PS-CAP-001 CapabilityDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `capability_id` | StableId | 是 | 使用已登记 `CAP-*` 编号，跨 Profile 对齐 |
| `capability_kind` | Enum | 是 | `ELEMENT/PROPERTY/FACT/MODIFIER/CONTEXT/POLICY` |
| `names` | LocalizedTextSet | 是 | 不作为身份 |
| `status` | Enum | 是 | `MUST/SHOULD/DERIVED/FORBIDDEN/N_A` |
| `implementation_state` | Enum | 是 | `DECLARED/IMPLEMENTED/NOT_IMPLEMENTED`；不伪造测试结论 |
| `core_mapping_level` | Enum | 是 | `CORE/CONDITIONAL/DERIVED/PROFILE_ONLY/LOSSY/UNMAPPABLE` |
| `instance_schema_ref` | SchemaRef | 条件 | MUST/SHOULD 原生实例能力必须提供 |
| `property_schema_refs` | OrderedList<PS-CAP-002 Ref> | 否 | 允许的业务属性 |
| `endpoint_schema_ref` | PS-CAP-003 Ref | Fact 时是 | 端点、角色、顺序和方向 |
| `modifier_schema_refs` | OrderedList<PS-CAP-004 Ref> | 否 | 允许附加的修饰 |
| `context_schema_ref` | PS-CAP-005 Ref | Context 时是 | 上下文与细化约束 |
| `combination_rule_refs` | OrderedList<RuleRef> | 否 | 跨能力组合由规则判定 |
| `symbol_ref/text_rule_refs` | 对应引用 | 原生能力是 | 图形和文本可生成性闭合 |
| `normalization_mapping_refs` | OrderedList<PS-NORM-002 Ref> | 是 | FORBIDDEN/N_A 也要有明确阻断结论 |
| `source_refs` | OrderedList<StandardRef> | 是 | 产品自定义能力须标记产品来源 |
| `evidence_requirement_refs` | OrderedList<StableId> | MUST/SHOULD 是 | 指向能力报告所需证据类型 |

每个 Profile Package 必须对同一个 96 项能力宇宙逐项登记，不能只列允许项。当前宇宙分区为：ELEM 11、PROP 7、ISO-PROC 16、ISO-CTRL 8、ISO-STRUCT 10、CN-STATIC 7、CN-DYN 10、CN-GEN 6、MOD 11、CTX 10，共 96 项。

### 5.2 `PS-CAP-002 PropertySchema`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `property_schema_id/version` | SchemaId+Version | 是 | Owner 内稳定 |
| `owner_capability_ids` | OrderedSet<StableId> | 是 | 至少一个 Capability |
| `field_name` | QualifiedName | 是 | 不能与未命名 Map 合并 |
| `value_schema` | TypedValueSchema | 是 | 类型、枚举、范围、单位和元素 schema 封闭 |
| `cardinality` | `{min,max}` | 是 | 默认值也必须满足 |
| `default_value` | TypedValue | 否 | 区分显式值和 Profile 默认 |
| `semantic_role` | QualifiedName | 是 | 命名、身份、显示、行为或约束角色 |
| `mutability` | Enum | 是 | `CREATE_ONLY/REVISION_MUTABLE/DERIVED` |
| `validation_rule_refs` | OrderedList<RuleRef> | 否 | 不能替代基础类型校验 |

### 5.3 `PS-CAP-003 EndpointSchema`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `endpoint_schema_id/version` | SchemaId+Version | 是 | 每个 Fact Capability 唯一解析 |
| `roles` | OrderedList<RoleDefinition> | 是 | 每个角色声明 min/max、ordinal 和重复策略 |
| `target_predicate` | 受控 Type Predicate | 每个 role 是 | 仅按 core kind、Capability、State owner 和属性过滤 |
| `direction_set` | Set<Enum> | 是 | 只能使用核心允许方向 |
| `same_identity_constraints` | OrderedList<Record> | 否 | Self-invocation、同 Object 状态等约束 |
| `state_qualification_policy` | Enum | 是 | `FORBIDDEN/OPTIONAL/REQUIRED/ROLE_SPECIFIC` |
| `path/multiplicity_policy` | Record | 是 | 明确允许、禁止或条件使用 |

### 5.4 `PS-CAP-004 ModifierSchema`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `modifier_schema_id/version` | SchemaId+Version | 是 | 稳定 |
| `modifier_key` | QualifiedName | 是 | API/Revision 中稳定语义键；禁止客户端自定义 |
| `modifier_capability_id` | StableId | 是 | 指向 MOD/CTRL 能力 |
| `target_kinds/capabilities` | 受控集合 | 是 | 不允许自由目标 |
| `value_schema` | TypedValueSchema | 是 | Event、Condition、概率等结构明确 |
| `cardinality` | `{min,max}` | 是 | target scope 内执行 |
| `allowed_with/forbidden_with` | OrderedSet<CapabilityRef> | 否 | 复杂组合仍由 RuleRef 判定 |
| `combination_rule_refs` | OrderedList<RuleRef> | 否 | 规则必须在绑定 Rule Set 中存在 |

#### 5.4.1 ISO Control ModifierSchema 投影

每个 `CAP-ISO-CTRL-001~008` Capability Definition 必须解析两个配对的 PS-CAP-004：

| `modifier_key` | `modifier_capability_id` | `value_schema` | 基数 |
| --- | --- | --- | --- |
| `control.capability` | 当前 `CAP-ISO-CTRL-*` | 常量为当前 Capability ID | `{1,1}` |
| `control.segment` | 同一 `CAP-ISO-CTRL-*` | 常量 `PROCESS_INPUT` | `{1,1}` |

两项共享同一组 `target_kinds/capabilities` 和 `combination_rule_refs`，只能附加到该 Control Capability 允许的基础 Procedural Fact。`CAP-ISO-CTRL-001~004` 的规则依赖必须包含 `CAP-MOD-003`，`CAP-ISO-CTRL-005~008` 必须包含 `CAP-MOD-004`。Profile 不得开放第二个 segment 值、自由字符串 Control ID 或单项缺失的降级表示。

### 5.5 `PS-CAP-005 ContextSchema`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `context_schema_id/version` | SchemaId+Version | 是 | 稳定 |
| `context_kinds` | Set<Enum> | 是 | 映射 MS-CTX-001 |
| `allowed_root_roles` | Set<Enum> | 是 | SD、对象根、view 等 |
| `refinement_methods` | Set<Enum> | 是 | 配置档允许的成对机制 |
| `tree_policy` | Record | 是 | 单根树、多根森林、view 独立规则 |
| `namespace_policy_ref` | PS-POL-001 Ref | 是 | ISO 全模型和中文局部范围分离 |
| `semantic_layout_refs` | OrderedList<PS-CAP-002 Ref> | 否 | 仅声明有语义的布局属性 |
| `occurrence_policy` | Record | 是 | owner/reference/view-derived 允许范围 |

### 5.6 `PS-POL-001 NameIdentityPolicy`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `name_scope` | Enum | 是 | `MODEL/CONTEXT/TYPE_IN_CONTEXT/PROFILE_DEFINED` |
| `case_policy` | Enum | 是 | 冲突检查和文本生成一致 |
| `reserved_names/patterns` | 受控集合 | 否 | 正则能力必须使用受限语法和长度上限 |
| `namespace_visibility` | Enum | 是 | `NONE/PUBLIC_PROTECTED_PRIVATE` |
| `stable_id_policy` | Record | 是 | ID 不从名称、路径或布局生成 |
| `rename_rule_refs` | OrderedList<RuleRef> | 是 | 改名影响和冲突规则 |

## 6. 符号与文本资产

### 6.1 `PS-SYM-001 SymbolCatalog`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `catalog_id/version` | VersionRef | 是 | ProfileBinding 精确引用 |
| `entries` | PS-SYM-002 集合 | 是 | 所有可绘制 MUST/已实现 SHOULD 能力有映射 |
| `markers` | PS-SYM-004 集合 | 是 | Relation Descriptor 引用的 marker/annotation 全部可离线解析 |
| `rendering_units` | Enum | 是 | 逻辑单位明确，像素密度不改变语义 |
| `fallback_policy` | Enum | 是 | 未知 required 符号必须 `BLOCK`，不得用通用图形冒充 |
| `asset_digest` | DigestRef | 是 | 覆盖全部符号资产 |

### 6.2 `PS-SYM-002 SymbolDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `symbol_id/version` | VersionRef | 是 | 稳定 |
| `capability_refs/construct_roles` | 受控集合 | 是 | 图形构造与语义能力对应 |
| `primitive/asset_ref` | Enum+AssetRef | 是 | 仅允许矢量/参数化绘制资产，不执行脚本 |
| `bounds/min_size/aspect_policy` | Record | 是 | 支持稳定布局和文本容纳 |
| `anchors/ports` | OrderedList<Record> | 是 | 每个端口有角色、方向和连接限制 |
| `line_style/markers` | Record | 条件 | 关系符号必须声明 |
| `state_overlay/label_slots` | Record | 否 | 状态、标签和修饰位置 |
| `relation_descriptor` | PS-SYM-003 | 关系时是 | 冻结 line、marker、annotation、route、endpoint role 和文本模板族 |
| `semantic_layout_effect` | Boolean+PropertyRef | 是 | true 时必须引用受控语义布局字段和 RuleRef |
| `accessibility_label` | LocalizedTextSet | 是 | 不只依赖颜色区分 |

### 6.3 `PS-SYM-003 RelationSymbolDescriptor`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `descriptor_id/version` | VersionRef | 是 | 同版本内容不可变 |
| `capability_ref` | CapabilityRef | 是 | 必须与父 SymbolDefinition 的 relation Capability 一致 |
| `line_family` | Enum | 是 | `SOLID/LIGHTNING/PROFILE_DEFINED`；PROFILE_DEFINED 需要 required AssetRef |
| `source_marker_ref/target_marker_ref` | MarkerRef | 条件 | 二元关系按标准端点声明；无 marker 显式为空 |
| `junction_marker_ref` | MarkerRef | 条件 | fundamental fan 必填，二元关系禁止 |
| `control_annotation_ref` | MarkerRef | 条件 | Event/Condition 组合按基础关系输入段声明 |
| `completeness_annotation_ref` | MarkerRef | 条件 | 允许不完整 refinee 集合的 fundamental relation 使用 |
| `endpoint_roles` | OrderedList<EndpointRoleBinding> | 是 | role、ordinal、marker slot 与 PS-CAP-003 一致 |
| `label_slots` | OrderedList<PS-SYM-005> | 否 | 标签、State qualification、duration、completeness 等稳定槽位 |
| `route_family` | Enum | 是 | `BINARY_ORTHOGONAL/STATE_BINARY/STATE_EFFECT/PROCESS_INVOCATION/PROCESS_SELF_LOOP/PROCESS_EXCEPTION/BINARY_STRUCTURAL/FUNDAMENTAL_FAN/STATE_FUNDAMENTAL/STATE_STRUCTURAL/PROFILE_DEFINED` |
| `template_family_ref` | AssetRef+FamilyId | 是 | 指向同一 Profile 依赖闭包中的 OPL/OPT 模板族 |
| `rule_refs` | OrderedList<RuleRef> | 是 | 端点、组合、完整性和渲染语义守卫 |
| `source_locator` | StandardRef | 是 | 定位标准条款/图形来源，不保存页面截图测量值 |

约束：

1. `CAP-ISO-PROC-001~016`、`CAP-ISO-CTRL-001~008`、`CAP-ISO-STRUCT-001~010` 各自恰有一个主 RelationSymbolDescriptor；允许变体通过同 descriptor 的受控 variant 或独立 versioned child descriptor 表达；
2. Control descriptor 复用基础 relation line/marker，只增加规范输入 segment 的 `e/c` annotation，不创建第二条重叠 relation symbol；
3. fundamental fan 使用一个 junction marker 和多个 ordered refinee branches，不能资产化为多条互不相关的 binary edge；
4. Classification-instantiation 禁止 completeness annotation；Aggregation/Exhibition/Generalization 按集合完整性决定是否显示 annotation；
5. `template_family_ref` 必须能进一步解析到具体 template ID；通配 family 不能直接写入 Revision 或 Sentence Plan。

### 6.4 `PS-SYM-004 MarkerDescriptor`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `marker_id/version` | VersionRef | 是 | Catalog 内唯一，同版本不可变 |
| `semantic_role` | Enum | 是 | `ENDPOINT/JUNCTION/CONTROL_ANNOTATION/COMPLETENESS_ANNOTATION/STATE_OVERLAY` |
| `primitive/asset_ref` | Enum+AssetRef | 是 | 参数化 PATH/TEXT/COMPOSITE；禁止脚本 |
| `normalized_geometry` | Record | 是 | 逻辑坐标，不冒充标准浏览器像素 |
| `fill/stroke` | Record | 是 | 空心/实心和轮廓语义明确，颜色不是唯一信号 |
| `anchor/alignment` | Record | 是 | 相对端点、junction、segment 或 owner 的稳定位置 |
| `direction_policy` | Enum | 是 | `SOURCE_FACING/TARGET_FACING/BIDIRECTIONAL/NONE/PROFILE_DEFINED` |
| `hit_area_policy` | Record | 是 | 交互命中不改变可见标准几何 |
| `accessibility_label` | LocalizedTextSet | 是 | 工具缩略符号和画布可读名称 |
| `source_locator` | StandardRef | 是 | 证据可追溯 |

### 6.5 `PS-SYM-005 LabelSlotDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `slot_id` | StableId | 是 | Descriptor 内稳定，如 `shaft-forward/process-input-near` |
| `semantic_role` | Enum | 是 | `FORWARD_TAG/REVERSE_TAG/RECIPROCAL_TAG/STATE_QUALIFICATION/DURATION/COMPLETENESS/PROFILE_DEFINED` |
| `field_binding` | FieldPathBinding | 是 | 回到 Fact/Endpoint/State/Modifier 字段 |
| `cardinality` | Record | 是 | 必填、可选、单值或多值 |
| `anchor_policy` | Record | 是 | 相对 route segment、endpoint 或 junction |
| `collision_policy` | Enum | 是 | `SHIFT_WITH_LEADER/SHIFT_ON_ROUTE/BLOCK_RENDER/PROFILE_DEFINED` |
| `direction_lock` | Boolean | 是 | true 时禁止跨 forward/reverse slot 拖动改变语义 |

### 6.6 `PS-TEXT-001 TextGrammarPackage`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `grammar_id/version` | VersionRef | 是 | 与 modality 和 Profile 一致 |
| `language/locale/modality` | Record | 是 | ISO 为英文 OPL，中文配置档为 OPT |
| `production_assets` | OrderedList<AssetRef> | 是 | 可离线解析，禁止外部实体 |
| `generation_mappings` | PS-TEXT-002 集合 | 是 | Fact/Context Capability 到产生式映射 |
| `ordering_policy` | Record | 是 | Sentence、Paragraph、Context 顺序确定性 |
| `normalization_policy` | Record | 是 | 空白、数字、名称和单位规范化 |
| `grammar_digest` | DigestRef | 是 | 正式 Text Artifact 绑定 |

### 6.7 `PS-TEXT-002 GenerationMapping`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `mapping_id` | StableId | 是 | Grammar 内唯一 |
| `input_capability_refs` | OrderedSet<CapabilityRef> | 是 | 至少一个 |
| `selector_ref` | Rule Selector Ref | 是 | 只读选择正式 Fact/Context |
| `production_ref` | AssetRef+ProductionId | 是 | 目标产生式存在 |
| `slot_bindings` | OrderedList<FieldPathBinding> | 是 | 每个必填槽位有来源 |
| `generation_rule_refs` | OrderedList<RuleRef> | 是 | Sentence Trace 使用 |
| `unsupported_behavior` | Enum | 是 | 固定为 `BLOCK_FORMAL_TEXT` 或显式非正式输出 |

## 7. 公共核心适配与扩展

### 7.1 `PS-NORM-001 NormalizationAdapter`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `adapter_id/version` | VersionRef | 是 | ProfileBinding 精确引用 |
| `source_profile` | VersionRef | 是 | 与 Package Identity 一致 |
| `core_schema_version` | SchemaVersion | 是 | 目标 MS schema |
| `mappings` | PS-NORM-002 集合 | 是 | 每个 Capability 至少一条结论 |
| `roundtrip_policy` | Record | 是 | CORE/CONDITIONAL 能力的身份和字段往返规则 |
| `adapter_digest` | DigestRef | 是 | 与 Package digest 闭合 |

### 7.2 `PS-NORM-002 NormalizationMapping`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `mapping_id` | StableId | 是 | Adapter 内唯一 |
| `source_capability_id` | StableId | 是 | 属于本 Package |
| `direction` | Enum | 是 | `TO_CORE/FROM_CORE/BIDIRECTIONAL` |
| `level` | Enum | 是 | `CORE/CONDITIONAL/DERIVED/PROFILE_ONLY/LOSSY/UNMAPPABLE` |
| `target_schema/capability_refs` | 受控引用 | 条件 | PROFILE_ONLY/UNMAPPABLE 可无目标 |
| `condition_rule_refs` | OrderedList<RuleRef> | CONDITIONAL 是 | 可执行且无环 |
| `field_mappings` | OrderedList<Record> | 有目标时是 | source path、target path、受控变换操作 |
| `identity_policy` | Enum | 是 | `PRESERVE/MAP_WITH_ORIGIN/NEW_WITH_ORIGIN/BLOCK` |
| `loss_or_block_message` | LocalizedTextSet | LOSSY/UNMAPPABLE 是 | 逐项进入 Conversion Report |
| `roundtrip_expectation` | Enum | 是 | `EXACT/SEMANTIC_EQUIVALENT/NOT_GUARANTEED/NOT_APPLICABLE` |

字段变换只允许受控的 rename、enum map、wrap/unwrap、unit conversion 和 collection reshape；不得调用脚本或外部服务。

### 7.3 `PS-EXT-001 ExtensionSchemaDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `namespace/schema_id/version` | 对应标识 | 是 | Package 内唯一且可离线解析 |
| `owner_schema_refs` | OrderedSet<SchemaRef> | 是 | 明确可附着对象 |
| `required` | Boolean | 是 | 影响正式语义时必须为 true |
| `payload_schema` | TypedValueSchema(RECORD) | 是 | 字段封闭、限制深度和集合大小 |
| `source_refs` | OrderedList<StandardRef> | 是 | 专属语义来源 |
| `normalization_mapping_refs` | OrderedList<PS-NORM-002 Ref> | 是 | 至少给出隔离或转换结论 |

## 8. 迁移、兼容与 Manifest

### 8.1 `PS-MIG-001 ProfileMigrationRule`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `migration_id/version` | VersionRef | 是 | 稳定、不可变 |
| `source_profile/target_profile` | VersionRef | 是 | 精确版本，不使用范围猜测 |
| `applicable_schema_versions` | Record | 是 | core/profile/rule schema 均声明 |
| `precondition_rule_refs` | OrderedList<RuleRef> | 是 | 在 staging 执行 |
| `capability_mappings` | OrderedList<PS-NORM-002 Ref> | 是 | 覆盖所有受影响能力 |
| `identity_field_mappings` | OrderedList<Record> | 是 | 旧新 ID、字段和来源可追踪 |
| `postcondition_rule_refs` | OrderedList<RuleRef> | 是 | 目标 Profile 全量校验 |
| `rollback` | Enum+Record | 是 | `DISCARD_STAGING/RESTORE_CHECKPOINT`；不改写源 Baseline |

### 8.2 兼容分类

| 变化 | 级别 | 处理 |
| --- | --- | --- |
| 新增 FORBIDDEN/N_A 能力说明或 optional 展示元数据 | MINOR_COMPATIBLE | 升 minor/patch，不改变模型解释 |
| 新增已实现 SHOULD、符号或文本映射 | FEATURE_ADDITION | 升 minor，重新生成能力报告 |
| MUST 状态、端点、字段、默认值或文本语义变化 | MAJOR_MIGRATION | 升 major，提供迁移和正反例 |
| 标准版次、身份 scope 或归一化等级变化 | BREAKING | 新 major；历史 Revision 固定旧包 |
| Rule/Grammar/Symbol digest 变化 | NEW_PACKAGE_VERSION | 即使 Profile ID 不变也不得复用旧版本 |

### 8.3 `PS-PKG-005 PackageManifest`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `package_id/version` | VersionRef | 是 | 与 Identity 一致 |
| `entries` | OrderedList<EntryManifest> | 是 | 每项含 role、logical_path、length、digest、required |
| `dependency_closure` | OrderedList<AssetRef> | 是 | required 传递依赖完整、无环 |
| `schema_set` | OrderedList<SchemaRef> | 是 | Package 内所有可校验 schema |
| `capability_universe_digest` | DigestRef | 是 | 固定 96 项登记集合 |
| `package_digest` | DigestRef | 是 | 覆盖规范化 Manifest 和全部 required entry |

logical_path 不允许绝对路径、`..`、符号链接或重复规范化路径。未知 required entry、摘要不符或闭包不完整必须阻断加载。

## 9. 跨对象不变量

| 编号 | 不变量 | 阻断阶段 |
| --- | --- | --- |
| PS-INV-001 | 96 个已登记 `CAP-*` 在每个 Package 中恰有一个状态定义 | Package build/load |
| PS-INV-002 | MUST 和已实现 SHOULD 能力的实例、符号、文本和规则引用闭合 | Package build/load |
| PS-INV-003 | DERIVED 不暴露独立原生类型；FORBIDDEN/N_A 不可创建或静默导入 | COMMAND_FILTER/CONVERSION |
| PS-INV-004 | Property、Endpoint、Modifier、Context 均为封闭 schema，无任意 Map | Package build/PRE_COMMIT |
| PS-INV-005 | required 依赖可离线解析、digest 匹配且依赖图无环 | Package load |
| PS-INV-006 | 语义 Symbol/Layout 变化绑定字段和 RuleRef，纯几何变化不改变 Fact | PRE_COMMIT |
| PS-INV-007 | 正式 Grammar 映射的每个必填槽位可回到 Fact/Context 字段和 Rule | PRE_COMMIT/BASELINE_GATE |
| PS-INV-008 | PROFILE_ONLY/LOSSY/UNMAPPABLE 不伪装为 CORE 或目标 Profile 原生能力 | CONVERSION |
| PS-INV-009 | 同版本 Package 内容不可变；历史 Revision 不随 registry 最新版本变化 | Open/Baseline |
| PS-INV-010 | 迁移只产生 staging 和新 Revision，失败丢弃 staging，不改写源 Baseline | CONVERSION |

## 10. 验收与验证

| 验收主题 | 正向验证 | 阻断验证 |
| --- | --- | --- |
| 96 项能力覆盖 | 两个 Profile 各解析 96 个唯一 CapabilityDefinition | 缺项、重复项、未知状态 |
| 能力闭包 | 每项 MUST 可解析实例/端点/符号/文本/规则引用 | 悬空 SchemaRef、RuleRef、AssetRef |
| 配置档隔离 | ISO 与中文草案按各自状态显示和导入 | FORBIDDEN、PROFILE_ONLY 静默进入目标 |
| 离线依赖 | 断网环境加载 Package 和全部 required 闭包 | 网络地址、digest 不符、循环依赖 |
| 完整关系符号 | ISO 16/8/10 Capability 均解析 relation/marker/label/route/template descriptor | 缺 marker、错误 junction、Control 重叠 symbol、模板族悬空 |
| Symbol/Text 绑定 | 每个 Relation Descriptor 的 template family 解析具体 Mapping/Production | 通配 family 写入 Revision、Symbol 与 Grammar digest 不一致 |
| 往返与转换 | CORE/CONDITIONAL 代表性模型通过明确 roundtrip expectation | LOSSY/UNMAPPABLE 未提示即提交 |
| 迁移回滚 | staging 迁移成功生成新 Revision | 中途故障后源 Model/Baseline digest 变化 |

## 11. 事实与建议

### 11.1 已确认事实

1. 当前能力矩阵包含 96 个唯一 `CAP-*`，分属 10 个编号族；
2. Profile Package 是 Model 的解释依赖，不保存 Model Revision；
3. ISO 与中文草案配置档必须独立发布，公共核心不是第三配置档；
4. 当前已有代表性 Profile Package JSON Schema/样例，但只引用 Symbol/Grammar 外部资产；完整 Relation Symbol/Marker 机器资产、可执行 Grammar 和加载测试尚未形成；
5. 本任务没有数据库、DDL、Flyway 或 SQL 变更。

### 11.2 冻结实现与延期边界

1. `PS-*` 是 Profile 机器资产的逻辑输入；当前实现使用 JSON Schema 2020-12，不在开发阶段切换为 Protobuf；
2. 当前开发包必须按能力范围提供 exact Profile、Rule、Grammar、Symbol、Normalization 依赖闭包、破损依赖包和跨版本样例；中文专属完整包按 `DFD-002` 延期；
3. Clause 4 完整符号目录和 Annex A 完整 EBNF 按 `DFD-005/006` 延期；重启后只补版本化资产内容，不改变 Package 所有权边界；
4. Package 物理形态固定为受控目录、manifest、相对路径、byte length、SHA-256 和 exact ID/version/digest；数字签名和可信第三方发布按 `DFD-009` 延期。
