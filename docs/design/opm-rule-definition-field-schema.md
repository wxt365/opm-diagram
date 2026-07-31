# OPM Rule Definition 字段级 Schema

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`；Rule 字段设计冻结，原子规则目录和符合性证据为 `FROZEN_DEFERRED`

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-07-27

## Task Type

- `feature`

## 1. 文档范围

本文档定义 OPM 配置档规则的元数据、标准来源、执行阶段、选择器、受控声明式表达式、Finding、证据、依赖图、执行结果和版本兼容 schema。它既能承接当前 103 个 `ISOR-*` 规则组，也能继续容纳规则组下钻后的原子 `shall/shall not` 规则。

Rule Definition 回答“何时、对哪些固定输入、按什么确定性判定、产出什么可定位结论”，规则执行和结果聚合仍分别由 M07 Validation Pipeline 与 Conformance Aggregator 负责。

本文档不负责：

1. 不重复 ISO 19450:2024 规范文本或在本轮拆分全部 511 个 `shall`；
2. 不把 103 个规则组直接宣称为已执行的原子符合性证据；
3. 不定义通用编程语言、脚本、插件 ABI 或外部服务调用；
4. 不允许规则修改 Model、调用 UI、读取系统时间或依赖非确定状态；
5. 不生成规则引擎代码、测试代码、DDL、Flyway 或 SQL。

## 2. 关联文档

1. `docs/requirements/iso-19450-2024-conformance-matrix.md`
2. `docs/requirements/opm-profile-capability-matrix.md`
3. `docs/requirements/opm-requirement-acceptance-matrix.md`
4. `docs/design/opm-core-metamodel-field-schema.md`
5. `docs/design/opm-profile-package-field-schema.md`
6. `docs/design/opm-modeling-tool-module-design.md`

## 3. 规则模型约定

### 3.1 通用类型

| 类型 | 逻辑约束 |
| --- | --- |
| `RuleId` | 稳定编号；规则组使用 `ISOR-*`，原子规则使用独立、不可复用的子编号 |
| `RuleVersion` | `major.minor.patch`；已发布同版本内容不可变 |
| `RuleRef` | `{rule_id, rule_version}`；必须解析到绑定 Rule Set |
| `ProfileScope` | 精确 `{profile_id, profile_version}` 集合，不使用隐式 latest |
| `SchemaFieldPath` | 从固定根 schema 出发的受控字段路径；不得访问未声明字段 |
| `StandardSourceRef` | `{standard_id, edition, locator, source_digest, normative_level}` |
| `ExpressionType` | `BOOLEAN/INTEGER/DECIMAL/STRING/ENUM/ENTITY_REF/SET/LIST/RECORD/UNKNOWN` |
| `EvidenceTypeRef` | 指向固定证据类型，如 RULE、VISUAL、OPL-GOLDEN、MODEL-PACK |
| `DigestRef` | 算法白名单中的内容摘要 |

### 3.2 唯一执行阶段

| 阶段 | 输入 | 允许输出 | 禁止行为 |
| --- | --- | --- | --- |
| `COMMAND_FILTER` | 当前 Revision、命令候选、Profile Binding | 候选允许/拒绝和原因 | 创建正式 Finding 或写模型 |
| `PRE_COMMIT` | 固定 base revision 与候选变更集 | BLOCKING/WARNING/SUGGESTION Finding | 修改候选以“自动通过” |
| `POST_COMMIT` | 已提交不可变 Revision | 完整性、质量和方法 Finding | 回写该 Revision |
| `BASELINE_GATE` | 固定 Revision、Profile/Rule/Grammar 和证据集 | 全量 Finding、覆盖和符合性输入 | 缺证据时推导为符合 |
| `CONVERSION` | 固定源 Revision 与目标 Profile | CORE/CONDITIONAL/DERIVED/LOSSY/UNMAPPABLE 结论 | 修改源 Revision 或 Baseline |

全部 Rule Definition 的 `stage` 必须取上述五值之一。导入校验使用目标候选的 `CONVERSION + PRE_COMMIT`，全量草稿校验使用 `POST_COMMIT` 或 `BASELINE_GATE`，不另造 `IMPORT/FULL/COMMIT` 阶段。

### 3.3 严重级别

| 级别 | 语义 |
| --- | --- |
| `BLOCKING` | 当前阶段目标不能继续；不得由 UI 降级隐藏 |
| `WARNING` | 可保存草稿；是否阻断 Baseline 必须由规则本身明确 |
| `SUGGESTION` | 质量或方法建议，不计入语言符合性失败 |

## 4. Rule Set Package

### 4.1 `RS-PKG-001 RuleSetPackage`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `schema_id/schema_version` | SchemaId+Version | 是 | 固定为本文 Rule Set 根 schema |
| `rule_set_id/version` | VersionRef | 是 | ProfileBinding 精确引用 |
| `profile_scope` | OrderedSet<ProfileScope> | 是 | 至少一个精确 Profile 版本 |
| `lifecycle` | RS-PKG-002 | 是 | 发布状态和替代关系 |
| `rule_groups` | RS-GROUP-001 集合 | 是 | 覆盖适用 `ISOR-*` 规则组 |
| `rules` | RS-RULE-001 集合 | 是 | 原子或产品规则定义 |
| `operator_registry` | RS-EXPR-002 | 是 | 固定内建声明式操作符集合 |
| `evidence_types` | RS-EVID-001 集合 | 是 | 规则所需证据类型 |
| `dependency_graph` | RS-DEP-001 | 是 | Rule DAG 和执行顺序 |
| `manifest` | RS-PKG-003 | 是 | schema、资产、依赖和 digest |

### 4.2 `RS-PKG-002 RuleSetLifecycle`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `status` | Enum | 是 | `DRAFT/ACTIVE/DEPRECATED/RETIRED` |
| `released_at` | Instant | ACTIVE 后是 | 仅记录 |
| `supersedes` | VersionRef | 否 | 同 rule_set_id 的旧版本 |
| `minimum_engine_schema` | SchemaVersion | 是 | 不支持时阻断，不猜测 |
| `change_class` | Enum | 是 | `PATCH/MINOR/MAJOR`，与第 13 章一致 |

### 4.3 `RS-PKG-003 RuleSetManifest`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `entries` | OrderedList<EntryManifest> | 是 | role、logical_path、length、digest、required |
| `schema_set` | OrderedList<SchemaRef> | 是 | Selector、Expression、Finding 等 schema 闭合 |
| `profile_dependencies` | OrderedList<VersionRef+Digest> | 是 | 与 Profile Package 匹配 |
| `rule_group_digest` | DigestRef | 是 | 固定规则组集合 |
| `dependency_graph_digest` | DigestRef | 是 | 固定执行 DAG |
| `rule_set_digest` | DigestRef | 是 | 覆盖 Manifest 和全部 required entry |

## 5. 标准来源与规则组

### 5.1 `RS-GROUP-001 RuleGroupDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `group_id` | RuleId | 是 | 当前 ISO 使用唯一 `ISOR-*` 编号 |
| `names/summary` | LocalizedTextSet | 是 | 摘要不替代规范来源 |
| `source_refs` | OrderedList<StandardSourceRef> | 是 | 至少一个规范定位 |
| `gate_tags` | Set<Enum> | 是 | `SYMBOLIC/METHOD/TOOL_GUIDE/OPL/PROFILE` |
| `capability_refs/requirement_refs` | OrderedSet<StableId> | 是 | 与 CAP/FR/AT 追踪闭合 |
| `atomic_rule_refs` | OrderedList<RuleRef> | 是 | 未拆分时允许空，但状态必须 DRAFT/INCOMPLETE |
| `required_evidence_types` | OrderedSet<EvidenceTypeRef> | 是 | 与符合性矩阵一致 |
| `coverage_state` | Enum | 是 | `GROUP_ONLY/ATOMIC_INCOMPLETE/ATOMIC_COMPLETE` |

当前规则组宇宙分区为：CONF 3、SYM 1、THING 8、PROC 26、STRUCT 10、CARD 3、LOGIC 7、PATH 1、CTX 21、OPL 12、METHOD 11，共 103 项。规则组是追踪和聚合单位，不等同一条可执行原子规则。

### 5.2 `RS-SRC-001 AtomicSourceBinding`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `source_binding_id` | StableId | 是 | Rule 内唯一 |
| `standard_ref` | StandardSourceRef | 是 | 精确到原子 `shall/shall not` 可定位位置 |
| `statement_digest` | DigestRef | 是 | 规范文本摘要，不在规则包复制受限全文 |
| `normative_level` | Enum | 是 | `SHALL/SHALL_NOT/SHOULD/MAY/PRODUCT_POLICY` |
| `parameterization` | Record | 否 | 同一规范句的枚举、端点或组合参数 |
| `interpretation_note` | LocalizedTextSet | 条件 | 存在解释边界时必须记录 |

## 6. Rule Definition

### 6.1 `RS-RULE-001 RuleDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `rule_id/version` | RuleRef | 是 | Rule Set 内唯一；发布后不复用 |
| `group_refs` | OrderedSet<RuleId> | 是 | 至少归属一个规则组或产品规则域 |
| `names/description` | LocalizedTextSet | 是 | 面向评审可理解 |
| `profile_scope` | OrderedSet<ProfileScope> | 是 | 不适用 Profile 必须显式排除 |
| `source_bindings` | OrderedList<RS-SRC-001> | 是 | 标准规则或 PRODUCT_POLICY 来源 |
| `category` | QualifiedName | 是 | LANGUAGE/METHOD/QUALITY/CONFORMANCE/TEXT 等 |
| `stage` | Enum | 是 | 第 3.2 节五阶段之一 |
| `severity` | Enum | 是 | `BLOCKING/WARNING/SUGGESTION` |
| `baseline_policy` | Enum | 是 | `BLOCK/ALLOW/NOT_APPLICABLE` |
| `selector` | RS-SEL-001 | 是 | 选择固定输入 Revision 中的候选 |
| `assertion` | RS-EXPR-001 | 是 | 返回 BOOLEAN 或确定性错误 |
| `unknown_policy` | Enum | 是 | `FAIL/SKIP/EVALUATION_ERROR`；符合性 SHALL 不得用 SKIP 伪装通过 |
| `finding_template` | RS-FIND-001 | 是 | 失败时可定位、可修复 |
| `evidence_requirements` | OrderedList<RS-EVID-002> | 否 | Gate 需要时必填 |
| `depends_on` | OrderedSet<RuleRef> | 否 | 必须进入无环依赖图 |
| `parameters` | OrderedList<RS-RULE-002> | 否 | 受控数据参数，不是代码 |
| `example_refs` | OrderedList<AssetRef> | 是 | 至少正向、反向或 N/A 代表样例 |
| `lifecycle` | Enum | 是 | `DRAFT/ACTIVE/DEPRECATED/RETIRED` |

### 6.2 `RS-RULE-002 RuleParameter`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `parameter_id` | StableId | 是 | Rule 内唯一 |
| `value_schema` | TypedValueSchema | 是 | 标量、枚举、集合或受控 Record |
| `value` | TypedValue | 是 | Package 发布时固定 |
| `source` | Enum+SourceRef | 是 | `STANDARD/PROFILE/PRODUCT_POLICY` |
| `semantic_effect` | LocalizedTextSet | 是 | 说明阈值如何影响判定 |

运行时不得通过隐藏配置改变已发布参数；参数变化产生新 Rule Version。

## 7. Selector Schema

### 7.1 `RS-SEL-001 RuleSelector`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `selector_id` | StableId | 是 | Rule 内唯一 |
| `input_root` | Enum | 是 | `REVISION/CHANGE_SET/COMMAND/CONVERSION_CANDIDATE/EVIDENCE_SET` |
| `target_schema_refs` | OrderedSet<SchemaRef> | 是 | 只能选择声明 schema |
| `target_kinds` | OrderedSet<QualifiedName> | 是 | Element/Fact/Context/Sentence 等 |
| `capability_filter` | OrderedSet<CapabilityRef> | 否 | 精确 Profile 版本 |
| `where` | RS-EXPR-001 | 否 | 只能读取候选和固定输入 |
| `traversals` | OrderedList<RS-SEL-002> | 否 | 受控引用图遍历 |
| `ordering` | OrderedList<FieldPath+Direction> | 是 | 结果顺序确定；相同值用 StableId 收尾 |
| `distinct_by` | OrderedList<SchemaFieldPath> | 否 | 去重键明确 |
| `max_results` | PositiveInteger | 是 | 超限返回评估错误，不截断后判通过 |

### 7.2 `RS-SEL-002 ReferenceTraversal`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `from_schema/path` | SchemaRef+FieldPath | 是 | 路径必须是声明的 EntityRef/集合 |
| `to_schema` | SchemaRef | 是 | 与引用 kind 匹配 |
| `direction` | Enum | 是 | `FORWARD/REVERSE` |
| `min_depth/max_depth` | NonNegativeInteger | 是 | max 有界且读取器限制内 |
| `cycle_policy` | Enum | 是 | `REJECT/STOP_AT_VISITED` |
| `required` | Boolean | 是 | 缺引用时 FAIL 或产生空集明确 |

Selector 禁止扫描文件系统、访问网络、读取当前时间、环境变量、随机数或全局 mutable registry。

## 8. 声明式表达式 AST

### 8.1 `RS-EXPR-001 ExpressionNode`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `node_id` | StableId | 是 | Rule 内唯一，AST 无环 |
| `node_kind` | Enum | 是 | `LITERAL/FIELD_REF/PARAM_REF/UNARY/BINARY/NARY/QUANTIFIER/AGGREGATE/TYPE_TEST/SET_CONSTRUCTOR/CONDITIONAL` |
| `result_type` | ExpressionType | 是 | 静态可推导且与父节点匹配 |
| `operator` | OperatorId | 条件 | 必须存在 RS-EXPR-002 内建注册表 |
| `arguments` | OrderedList<NodeRef> | 条件 | 数量和类型满足操作符签名 |
| `literal` | TypedValue | LITERAL 时是 | 无可执行对象 |
| `field_path` | SchemaFieldPath | FIELD_REF 时是 | 从当前 selector binding 解析 |
| `parameter_ref` | StableId | PARAM_REF 时是 | 指向 RS-RULE-002 |
| `variable_binding` | Record | Quantifier/Aggregate 时是 | 局部、只读、无逃逸 |
| `source_locator` | StableId | 否 | 关联 AtomicSourceBinding，便于解释 |

### 8.2 `RS-EXPR-002 BuiltinOperatorRegistry`

内建操作符是引擎实现的固定纯函数语义，不由 Package 携带代码。最小封闭集合：

| 家族 | 允许操作符 |
| --- | --- |
| 布尔 | `NOT/AND/OR/XOR/IMPLIES` |
| 比较 | `EQ/NE/LT/LE/GT/GE/BETWEEN` |
| 集合 | `CONTAINS/IN/SUBSET/SET_EQUALS/INTERSECTS/UNIQUE` |
| 字符串 | `IS_EMPTY/LENGTH/MATCHES_RESTRICTED_PATTERN/STARTS_WITH/ENDS_WITH` |
| 类型与引用 | `IS_KIND/IS_CAPABILITY/REF_EXISTS/SAME_ID/SAME_OWNER` |
| 数值 | `ADD/SUBTRACT/MULTIPLY/DIVIDE/SUM/MIN/MAX` |
| 量化 | `ALL/ANY/NONE/EXACTLY_ONE/COUNT` |
| 图约束 | `IS_ACYCLIC/IS_CONNECTED/REACHABLE/IN_DEGREE/OUT_DEGREE` |
| 上下文 | `OCCURS_IN/IS_ANCESTOR/REFINES/VISIBLE_IN` |

`DIVIDE` 的零除、未知 enum、悬空引用、集合超限和类型不匹配必须返回结构化 `EVALUATION_ERROR`，不得使用语言运行时隐式值。Pattern 使用受限、可设步数上限的语法，禁止灾难性回溯。

### 8.3 求值语义

1. AST 在加载时完成 schema 路径、类型和操作符签名检查；
2. 节点按固定参数和 StableId 稳定顺序求值；
3. `null`、字段缺失和未知值不同：schema 必填缺失是错误，optional 缺失由显式操作符处理；
4. 浮点和单位不得依赖平台默认；Decimal 精度、舍入和单位换算由 Profile schema 固定；
5. 规则超时、超限或执行器异常记为 `EVALUATION_ERROR`，在 Baseline Gate 不能当作 PASS；
6. AST 不允许递归调用 Rule、动态加载操作符或构造未声明字段。

## 9. Finding、定位与证据

### 9.1 `RS-FIND-001 FindingTemplate`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `message_template` | LocalizedTextSet | 是 | 只允许声明字段插值，不执行表达式 |
| `message_bindings` | OrderedList<Name+NodeRef> | 否 | 值经过长度和类型限制 |
| `locator_specs` | OrderedList<RS-FIND-002> | 是 | 至少一个可解析定位 |
| `remediation` | LocalizedTextSet | 否 | 不得声称自动修复已执行 |
| `dedup_key_fields` | OrderedList<FieldPath/NodeRef> | 是 | 同输入确定性生成 finding_id |
| `category_override` | QualifiedName | 否 | 不得改变语言/方法统计边界 |

### 9.2 `RS-FIND-002 LocatorSpec`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `locator_kind` | Enum | 是 | `MODEL/CONTEXT/ENTITY/FIELD/TEXT_TRACE/EVIDENCE` |
| `entity_binding` | SelectorBindingRef | 条件 | ENTITY/FIELD 时是 |
| `field_path` | SchemaFieldPath | FIELD 时是 | 必须解析到目标 schema |
| `trace_binding` | NodeRef | TEXT_TRACE 时是 | 指向存在 Trace |
| `fallback` | Enum | 是 | `PARENT_CONTEXT/MODEL/ERROR`，不得返回无定位 Finding |

### 9.3 `RS-EVID-001 EvidenceTypeDefinition`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `evidence_type_id` | StableId | 是 | Rule Set 内唯一 |
| `media/schema refs` | 受控集合 | 是 | 数据、截图、golden text、模型包等 |
| `required_metadata` | OrderedSet<FieldName> | 是 | 产品/规则/Profile/数据/环境版本等 |
| `integrity_policy` | Record | 是 | digest、大小和来源要求 |
| `freshness_policy` | Record | 是 | 允许的输入 Revision 和版本范围 |

### 9.4 `RS-EVID-002 EvidenceRequirement`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `evidence_type_ref` | EvidenceTypeRef | 是 | 已登记 |
| `minimum_count` | NonNegativeInteger | 是 | Gate 要求不可隐式为零 |
| `scope_binding` | Enum+Ref | 是 | RULE/GROUP/PROFILE/PRODUCT/MODEL |
| `absence_result` | Enum | 是 | `BLOCK/EVIDENCE_MISSING/NOT_APPLICABLE` |
| `validation_rule_refs` | OrderedList<RuleRef> | 否 | 验证证据自身完整性 |

## 10. 依赖 DAG 与执行计划

### 10.1 `RS-DEP-001 RuleDependencyGraph`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `nodes` | OrderedSet<RuleRef> | 是 | 与 Rule 集合一一对应 |
| `edges` | OrderedList<RS-DEP-002> | 是 | 无环、无悬空引用 |
| `stage_order` | 固定枚举序列 | 是 | 按第 3.2 节，不允许包覆盖 |
| `tie_breaker` | Enum | 是 | 固定 `RULE_ID_ASC` |
| `graph_digest` | DigestRef | 是 | 执行报告绑定 |

### 10.2 `RS-DEP-002 RuleDependencyEdge`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `predecessor/successor` | RuleRef | 是 | 不相同且存在 |
| `dependency_kind` | Enum | 是 | `REQUIRES_PASS/REQUIRES_RESULT/ORDERS_AFTER` |
| `on_predecessor_fail` | Enum | 是 | `SKIP/BLOCK/EVALUATE_ANYWAY` |
| `reason` | LocalizedTextSet | 是 | 可解释 |

早阶段 Rule 不能依赖晚阶段结果；同阶段以 DAG 拓扑序和 Rule ID 排序执行。依赖循环阻断 Rule Set 加载，不在运行时任意打断循环。

## 11. 执行结果与覆盖

### 11.1 `RS-RUN-001 RuleExecutionResult`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `execution_id` | StableId | 是 | Report 内唯一 |
| `rule_ref/input_revision` | 对应引用 | 是 | 固定输入 |
| `profile/rule_set/schema refs` | VersionRef 集合 | 是 | 与输入绑定一致 |
| `stage` | Enum | 是 | 与 RuleDefinition 一致 |
| `status` | Enum | 是 | `PASS/FAIL/NOT_APPLICABLE/SKIPPED/EVALUATION_ERROR` |
| `selected_count/evaluated_count` | NonNegativeInteger | 是 | 与 Selector 和结果一致 |
| `finding_ids` | OrderedList<StableId> | 否 | FAIL 时按模板生成 |
| `evidence_refs` | OrderedList<DigestRef> | 否 | Gate 规则使用 |
| `skip_or_error_reason` | LocalizedTextSet | 条件 | SKIPPED/ERROR 时是 |
| `result_digest` | DigestRef | 是 | 相同输入和引擎 schema 可复现 |

### 11.2 `RS-RUN-002 RuleCoverage`

| 字段 | 类型 | 必填 | 约束 |
| --- | --- | --- | --- |
| `applicable_rule_refs` | OrderedSet<RuleRef> | 是 | 按 Profile、阶段和 scope 计算 |
| `pass/fail/not_applicable/skipped/error` | OrderedSet<RuleRef> | 是 | 不重叠且并集等于 applicable |
| `group_coverage` | OrderedList<Record> | 是 | 103 组逐项给出 atomic/执行/证据状态 |
| `missing_evidence` | OrderedList<Group/Rule+EvidenceType> | 否 | 缺失不得算通过 |
| `coverage_digest` | DigestRef | 是 | Validation Report 使用 |

## 12. 103 个 ISOR 规则组的表达闭环

| 规则组域 | 数量 | 主要 RuleDefinition 表达 |
| --- | ---: | --- |
| CONF、METHOD | 14 | gate_tags、证据要求、Profile/产品范围和聚合前置 |
| SYM、THING | 9 | Capability/类型 Selector、字段/符号约束和 OPL trace |
| PROC、STRUCT | 36 | Endpoint/Modifier Selector、角色、方向、状态和生成映射断言 |
| CARD、LOGIC、PATH | 11 | 数值、集合、图、概率和路径配对操作符 |
| CTX | 21 | Context/Refinement/Occurrence 遍历、树/森林和跨图事实不变量 |
| OPL | 12 | Grammar 产生式、Sentence/Fact/Trace 选择和 golden evidence |

上述总计 103 个规则组。每个组可包含一个或多个原子 RuleDefinition；`coverage_state != ATOMIC_COMPLETE` 或必要证据缺失时，符合性聚合只能输出 `EVIDENCE_MISSING/无法判断`，不能输出“符合”。

## 13. 兼容、迁移与回滚

| 变化 | 兼容分类 | 处理 |
| --- | --- | --- |
| 仅修正描述或 remediation，不改变判定 | PATCH | 新 patch 版本，历史 Report 仍绑定旧版本 |
| 新增不适用当前 Gate 的 SUGGESTION | MINOR | 新 minor，重新计算 coverage |
| 新增/删除 SHALL Rule、改变 Selector/Assertion/Severity/Stage | MAJOR | 新 major，历史 Baseline 不重写 |
| 修改 Operator 语义、Unknown Policy 或 Source Binding | BREAKING | 新 engine/rule schema major，必须回归全部规则 |
| 原子规则拆分但保持组语义 | MAJOR_COVERAGE_MIGRATION | 新 Rule Set，记录旧新 rule/group mapping |

迁移流程：

1. 固定旧 Rule Set、目标 Rule Set、Profile 和输入 Revision digest；
2. 校验目标 Rule Set schema、依赖 DAG 和 Profile 依赖；
3. 在 staging 对代表性模型与历史 Revision 执行目标规则；
4. 生成新增/删除/严重度/结果/证据影响报告；
5. 用户选择升级时为新 Draft/Baseline 检查绑定新版本；
6. 失败丢弃 staging，旧 Rule Set、Report 和 Baseline 保持不变。

## 14. 安全与确定性不变量

| 编号 | 不变量 | 阻断阶段 |
| --- | --- | --- |
| RS-INV-001 | Rule ID+Version 唯一，同版本同 digest | Package load |
| RS-INV-002 | Rule 只使用五个执行阶段和三个严重级别 | Package load |
| RS-INV-003 | Selector/AST 字段路径、类型和操作符静态闭合，AST 无环 | Package load |
| RS-INV-004 | Rule 依赖图无环，且不依赖晚阶段结果 | Package load |
| RS-INV-005 | 执行只读取固定 Revision/Profile/Rule/Grammar/Evidence，不修改输入 | All stages |
| RS-INV-006 | 不执行脚本、宏、动态代码、网络、文件系统或外部实体 | Package load/runtime |
| RS-INV-007 | 时间、随机数、环境变量、无序迭代和平台浮点不影响结果 | Runtime |
| RS-INV-008 | FAIL Finding 至少定位 model/context/entity/field/trace 之一 | PRE_COMMIT/POST_COMMIT/BASELINE_GATE |
| RS-INV-009 | SKIPPED/EVALUATION_ERROR/缺证据不得聚合为 PASS | BASELINE_GATE |
| RS-INV-010 | 规则升级不原地重写历史 Report 或 Baseline | Migration |

## 15. 验收与验证

| 验收主题 | 正向验证 | 阻断验证 |
| --- | --- | --- |
| 规则组覆盖 | 103 个唯一 `ISOR-*` 均可解析为 RuleGroupDefinition | 缺组、重复组、悬空 atomic ref |
| 原子规则表达 | 代表性 Thing/Link/Context/OPL SHALL 能用 Selector+AST 表达 | 需要脚本、动态函数或未知字段 |
| 五阶段执行 | 每阶段固定输入、Finding 和排序可复现 | 非法阶段、跨阶段逆向依赖 |
| Finding 闭环 | Rule、输入 Revision、Locator、Evidence 可追踪 | 无定位、无来源或消息绑定失效 |
| DAG 与错误 | 同输入执行顺序和 digest 稳定 | 循环、超限、类型错误被当 PASS |
| 符合性门槛 | atomic 完整且证据齐备后才允许聚合 | GROUP_ONLY、缺证据或 ERROR 输出符合 |
| 升级回滚 | staging 比较后生成新绑定 | 失败后旧 Baseline/Report digest 改变 |

## 16. 事实与建议

### 16.1 已确认事实

1. 当前 ISO 符合性矩阵包含 103 个唯一 `ISOR-*` 规则组，尚未完成原子 `shall/shall not` 拆分；
2. 规则执行阶段固定为 `COMMAND_FILTER/PRE_COMMIT/POST_COMMIT/BASELINE_GATE/CONVERSION`；
3. 严重级别固定为 `BLOCKING/WARNING/SUGGESTION`，方法建议使用独立 category；
4. 当前仓库已有代表性机器 Rule Set，但它不等于完整规则引擎、自动化执行结果或 ISO 符合性证据；
5. 本任务没有数据库、DDL、Flyway 或 SQL 变更。

### 16.2 冻结实现与延期边界

1. `RS-*` 是机器可读规则包、静态检查器和执行器接口的逻辑输入；
2. 103 规则组下钻为“约 511”原子规则按 `DFD-004` 延期；数量必须在逐条标准定位后复核，不能在当前开发包中批量猜测；
3. Rule engine 实现必须提供 AST 类型检查、资源上限、稳定排序和故障注入测试；
4. 标准原文许可、规则资产签名和第三方符合性证据治理属于 `DFD-007/009` 的重启输入；当前不得形成符合性声明。
