# OPM 单机建模工具页面字段与区块明细表

文档版本：`v1.1`

文档状态：`FROZEN_INCLUDED`；P01-P06、完整画布候选与检查器字段冻结

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-09-11

## Task Type

- `feature`

## 1. 文档范围

本文档定义 P01-P06 及关键弹层的区块、字段来源、展示口径、可编辑性和动作守卫。字段名是逻辑字段，不是 API、数据库或文件格式字段。

## 2. 关联文档

1. `docs/design/opm-modeling-workbench-page-design.md`
2. `docs/design/opm-modeling-workbench-state-model.md`
3. `docs/design/opm-modeling-workbench-component-interaction.md`
4. `docs/design/opm-modeling-tool-module-design.md`
5. `docs/requirements/opm-profile-capability-matrix.md`
6. `docs/design/opm-modeling-tool-application-api-contract.md`
7. `docs/design/opm-modeling-tool-persistence-contract.md`
8. `docs/design/opm-complete-canvas-toolchain-design.md`

## 3. 字段分层与来源

### 3.1 来源缩写

| 来源 | 所有模块 | 页面使用原则 |
| --- | --- | --- |
| `Project/Model Query` | M02 | 项目、模型、Profile Binding 和搜索结果只读查询；修改走 M02 用例 |
| `Edit Session` | M03 | 活动修订、候选状态、命令结果和 Undo/Redo 可用性 |
| `Semantic Model` | M04 | Element、Fact 和稳定身份；页面不得直接写入 |
| `Context Projection` | M05 | Context、Occurrence、Refinement、布局和 System map |
| `Profile Catalog` | M06 | Profile、Capability、Symbol、Rule 和转换分析 |
| `Validation Query` | M07 | Finding、Validation Report 和 Conformance Summary |
| `Text Projection` | M08 | Text Artifact、Sentence 和 Trace Index，只读 |
| `Version Query` | M09 | Revision、Snapshot、Baseline、Diff 和 Operation Record |
| `Transfer/Backup Query` | M10 | Import/Export/Backup Manifest 和恢复计划 |
| `Method Query` | M11 | 架构分类、方法 Finding、决策和资产映射 |
| `Local Runtime Query` | M12 | 物理位置、任务状态和存储健康；只通过应用端口访问 |
| `Derived UI` | M01 | 由上述数据派生的标签、计数、选择和面板状态，不作为事实源 |

### 3.2 编辑性口径

| 口径 | 含义 |
| --- | --- |
| `只读` | 仅展示查询或派生值，不产生写命令 |
| `只读投影` | 固定 read revision 的 Context/Text/Validation 投影；页面不能原地改写 |
| `只读候选` | 服务端按固定 Revision/binding 返回的短期 option；选择本身不产生写命令 |
| `命令编辑` | 提交结构化应用/领域命令，成功后由权威结果回填；模型编辑命令返回新 Revision |
| `语义命令` | `命令编辑` 的严格子类；改变 Semantic Model、Context 语义或文本顺序，成功时必须产生 Revision，并同步 OPL/校验投影 |
| `布局命令` | 模型命令的受限子类；只改变 Context Layout 并返回新 Revision，语义摘要、OPL 和语义校验结果保持不变 |
| `候选编辑` | 只修改未提交 candidate ViewModel；提交成功前不得进入 Projection、Revision、正式 OPL 或 Finding |
| `本地视图` | 只影响页面会话或用户本地偏好，不改变模型语义 |
| `任务参数` | 仅作为导入、导出、校验、备份等任务输入 |
| `条件编辑` | 仅在指定 Profile、选择类型或访问模式下可编辑 |

### 3.3 通用字段规则

1. 所有模型投影显示或隐含绑定 `model_id + input_revision + profile_version + rule_version`；
2. 稳定 ID、来源 revision、规则版本、生成追踪和基线时间只读；
3. 页面派生计数必须能回到明细，不能成为新的持久化结论；
4. Profile 禁止字段不显示为可用，不以保存后再报错替代前置过滤；
5. 表单候选值在命令成功前只属于页面预览状态。

## 4. 页面总表

| page_id | 页面名称 | 主数据来源 | 主写入口 |
| --- | --- | --- | --- |
| `P01` | 项目库 | Project Query | 项目生命周期用例、OV01、OV07 |
| `P02` | 项目详情与模型列表 | Project/Model Query、Profile Catalog | 项目/模型用例、OV02、OV04 |
| `P03` | 建模工作台 | Edit Session、Semantic/Context/Text/Validation/Version/Method 投影 | ExecuteEditCommand、校验/版本/导出用例 |
| `P04` | 版本与基线 | Version Query | OV05、OV06、创建草稿用例 |
| `P05` | 标准、校验与符合性 | Profile Catalog、Validation/Text Query | ValidateModel、OV04、OV06 |
| `P06` | 本地数据、备份与恢复 | Transfer/Backup、Local Runtime Query | OV07-OV10、备份策略用例 |

## 5. P01 项目库

### 5.1 查询与命令栏

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `project_scope` | 活动/归档/全部 | Derived UI | 本地视图 | 默认活动项目 |
| `search_text` | 项目或模型名称 | Derived UI | 本地视图 | 输入只改变查询，不改项目 |
| `sort_order` | 最近打开/名称/创建时间 | Derived UI | 本地视图 | 可保留本地偏好 |
| `create_project` | 新建项目 | M02 用例 | 命令编辑 | 无进行中的冲突弹层 |
| `import_project` | 导入 | M10 用例 | 任务参数 | 进入 OV07，不直接覆盖项目 |

### 5.2 项目列表

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `project_name` | 项目名称 | Project Query | 命令编辑 | 非空；重名策略待 M02 契约冻结 |
| `project_description` | 项目说明摘要 | Project Query | 命令编辑 | 在项目编辑动作中提交 |
| `default_profile` | 默认配置档及版本 | Project Query | 只读/条件编辑 | 变更不得改写既有模型 Profile |
| `model_count` | 模型数量 | Derived UI from M02 | 只读 | 点击进入 P02，不持久化计数 |
| `last_opened_at` | 最近打开时间 | Project Query | 只读 | 本地时间，不显示用户身份 |
| `project_status` | 活动/归档 | Project Query | 命令编辑 | 归档不删除数据；恢复仅对归档项目启用 |
| `storage_location_summary` | 本地位置摘要 | Local Runtime Query | 只读 | 完整路径在 P06 展示 |

## 6. P02 项目详情与模型列表

### 6.1 项目摘要

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `project_name` | 项目名称 | Project Query | 命令编辑 | 项目非恢复锁定状态 |
| `project_description` | 项目说明 | Project Query | 命令编辑 | 保存结果以 M02 返回为准 |
| `default_profile_id/version` | 新模型默认 Profile | Project Query + Profile Catalog | 条件编辑 | 只影响后续模型；目标 Profile 必须可用 |
| `project_created_at` | 创建时间 | Project Query | 只读 | 本地时间 |
| `project_status` | 活动/归档 | Project Query | 只读 | 归档项目显示明确标识 |

### 6.2 模型列表

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `model_name` | 模型名称 | Model Query | 命令编辑 | 当前模型无冲突写会话 |
| `model_description` | 模型说明 | Model Query | 命令编辑 | 候选值成功后回填 |
| `profile_binding` | Profile 名称、版本、状态 | Model Query + Profile Catalog | 只读 | 转换只能通过 OV04 |
| `current_revision` | 当前 Draft/只读版本 | Version Query | 只读 | 点击进入 P04 |
| `baseline_status` | 无基线/基线数量/最近基线 | Version Query | 只读 | 不从校验通过推断已生成基线 |
| `validation_summary` | 阻断/警告/建议与新鲜度 | Validation Query | 只读 | 过期结果必须标记 |
| `context_count` | OPD 上下文数量 | Context Projection | 只读 | 分类型计数可展开 |
| `last_saved_at` | 最近耐久保存时间 | Version Query | 只读 | 不等同最近编辑时间 |
| `open_model` | 打开工作台 | M02 用例 | 命令编辑 | 打开检查通过后进入 P03 |

## 7. P03 建模工作台

### 7.1 顶部上下文栏

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `project_name/model_name` | 当前项目 / 模型 | Project/Model Query | 只读 | 点击返回 P02，不在栏内直接改名 |
| `profile_binding` | Profile 名称和版本 | M02 + M06 | 只读 | 变更打开 OV04 |
| `active_revision` | 实际 committed Revision 的短标识和类型 | Edit Session + Version Query | 只读 | 必须与投影 revision 一致；HEAD URL 省略 `revision` 时仍显示实际值，提交后更新 Header 但不改 URL |
| `revision_locator_mode` | 活动 HEAD / 精确 Revision | Route + Version Query | 只读 | HEAD canonical URL 仅携带 Context；历史/Snapshot/Baseline/永久链接携带精确 Revision ID且只读 |
| `access_mode` | 可编辑草稿/只读快照/只读基线/需恢复 | Derived UI from M09 | 只读 | 使用文字和图标表达 |
| `edit_submit_state` | 预览/提交/阻断/已提交/保存失败 | Edit Session | 只读 | 不把 committed 显示为 saved |
| `autosave_state` | 待保存/保存中/已保存/失败 | Version Query | 只读 | 显示最后保存时间和重试入口 |
| `undo_available/redo_available` | 撤销/重做可用性 | Edit Session | 命令编辑 | 仅 editable-draft 且栈非空 |
| `validation_summary` | 当前/过期/运行/失败及等级计数 | Validation Query | 只读/任务动作 | 全量校验固定 revision |
| `create_snapshot/create_baseline/export` | 版本和导出动作 | M09/M10 用例 | 命令编辑/任务参数 | 遵守状态模型第 9 章守卫 |

### 7.2 左侧 Context 导航

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `navigation_mode` | process tree/object forest/views/map/search | Derived UI | 本地视图 | 分组不可合并成无类型树 |
| `context_name` | OPD/视图名称 | Context Projection | 命令编辑 | 命名规则由 Profile 决定 |
| `context_type` | SD/过程细化/对象细化/model view | Context Projection | 只读 | 创建后不可作为普通字段改型 |
| `refinement_parent/method` | 被细化元素、父 OPD、方式 | Context Projection | 只读 | 变更走明确细化/移动命令和影响分析 |
| `owner_reference_marker` | 拥有/引用 | Context Projection | 只读 | 文字/图标+颜色表达 |
| `finding_count` | 当前修订问题计数 | Validation Query | 只读 | 过期计数带 stale 标识 |
| `occurrence_count` | Thing/Link 出现数量 | Context Projection | 只读 | System map 派生，不持久化 |
| `search_result_locator` | 模型/Context/Element 定位 | M02 + M05 | 只读 | 必须携带稳定 ID |
| `create_refinement` | 创建细化 OPD | M03/M05 用例 | 条件编辑 | 单选可细化 Thing 且 Profile 允许 |
| `delete_or_move_context` | 删除/移动 OPD | M03/M05 用例 | 条件编辑 | 必须先打开 OV11 |

### 7.3 中央 OPD 画布与工具栏

| 字段/动作 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `context_projection` | 当前 OPD Construct | Context Projection | 只读投影 | 图形库不得成为事实源 |
| `active_tool` | 选择/框选/平移/Object/Process/State/Relation | Derived UI | 本地视图 | 工具选择不进入 Revision |
| `node_type_candidates` | 可创建 Thing 类型和 symbol ref | API-EDT-001 + Profile Catalog | 只读候选 | 不显示 FORBIDDEN/N/A 能力 |
| `state_candidate` | owner、name/value、roles、layout、phase | Edit Session + API-EDT-001 | 候选编辑 | State 不是 Element；无合法 owner 时不可创建 |
| `relation_search/group` | 搜索词、最近/过程/控制/结构分组 | Derived UI | 本地视图 | 搜索和最近项不进入模型 |
| `relation_candidates` | query/option ID、Capability、Control 的 base Fact Capability、规范端点、字段、reason；删除时含 impact summary/token | API-EDT-001 | 只读候选 | 按 Profile、资产、Context、端点、State、已有 Fact 动态过滤；token 不展示、不拼装 |
| `relation_candidate_fields` | labels、modifiers、condition、fan members、completeness | Edit Session + Capability Option | 候选编辑 | option/base revision 变化后重新过滤 |
| `symbol/template/rule_refs` | descriptor、模板族、规则与 digest | API-EDT-001 + Profile Binding | 只读 | 缺任一 required 资产不得提交 |
| `viewport_scale/translation` | 视图比例和平移 | Derived UI | 本地视图 | 不产生 revision/text/validation 变化，也不进入 URL/history state |
| `fit_view/locate` | 适配画布/定位 | Derived UI | 本地视图 | 与语义 zoom 使用不同事件 |
| `element_position` | 普通坐标 | Context Projection | 命令编辑 | 只改 Layout，不改 Fact |
| `semantic_order` | Process in-zoom 垂直偏序 | Context + Semantic Model | 条件编辑 | 必须作为语义命令更新文本 |
| `semantic_refinement_action` | 显式/抑制、展开/折叠、内/外缩放 | Profile Catalog + M03 | 条件编辑 | 完整名称、确认语义影响、产生 revision |
| `alignment/layout_action` | 对齐/分布/自动布局 | M03/M05 | 命令编辑 | 完成前后语义散列不变 |

工具链字段的稳定分组、图标来源、候选状态和移动降级由 `opm-complete-canvas-toolchain-design.md` 第 4-16 章承接。本表不复制 16/8/10 菜单项名称，Capability ID 是跨文档唯一连接键。

### 7.4 右侧选择与属性检查器

#### Element 单选

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `element_id` | 稳定标识 | Semantic Model | 只读 | 跨 OPD/版本追踪依据 |
| `element_name` | 名称 | Semantic Model | 命令编辑 | 执行当前 Profile 唯一性规则 |
| `element_type` | Object/Process/配置档专属类型 | Semantic Model + Profile | 条件编辑 | 仅允许合法且可迁移类型转换 |
| `states/value_domain` | 状态或值域/值 | Semantic Model + Profile | 条件编辑 | 只显示配置档允许结构 |
| `visibility` | public/protected/private | Profile + Semantic Model | 条件编辑 | 仅中文草案 Profile 显示 |
| `multiplicity` | 多重性 | Semantic Model + Profile | 条件编辑 | 合法范围和组合由规则校验 |
| `architecture_layer` | 任务/功能/产品架构 | Method Query | 条件编辑 | 方法分类，不改变语言类型 |
| `occurrence_role` | owned/reference | Context Projection | 只读 | 修改所有权必须走专用影响分析 |
| `appears_in` | 出现的 OPD 列表 | Context Projection | 只读 | 可定位全部 occurrence |
| `source_revision` | 当前输入修订 | Edit Session | 只读 | 与文本/校验联动 |

#### State 单选

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `state_id` | 稳定 State 标识 | Semantic Model | 只读 | State 不是 Element，不使用 element_id |
| `owner_ref` | 所属 Object/Attribute 和定位 | Semantic Model | 只读 | 普通字段编辑不能改变 owner |
| `capability_ref` | State/Value 能力及 Profile | Semantic Model + Profile | 只读 | ISO 使用 Object State，禁止 Process State |
| `name_or_value` | State 名称或受控值 | Semantic Model | 命令编辑 | 类型和唯一性由 Capability schema 决定 |
| `state_roles` | Initial/Default/Final 多选 | Semantic Model + Profile | 命令编辑 | 每个角色和组合均由 API-EDT-001/Rule 守卫 |
| `ordinal` | owner 内语义顺序 | Semantic Model | 条件编辑 | 改变可能更新 OPL，不能作为普通坐标 |
| `explicitness` | 当前 Context 显式/抑制 | Context Projection | 语义命令 | 不创建或删除 State |
| `fold_state` | 展开/折叠投影 | Context Projection | 语义命令 | 使用专用命令并产生 Revision |
| `layout` | owner content box 内位置和尺寸 | Context Projection | 布局命令 | 拖出 owner 被阻断，不触发 re-owner |
| `fact/text/finding_trace` | 使用 State 的 Fact、Sentence、Finding | M07/M08 Query | 只读 | 删除前影响分析和定位依据 |
| `delete_impact_summary/token` | 引用数量、受影响 Context/Text/Finding 与不透明 token | API-EDT-001 | 只读候选 | 仅删除 intent 返回；提交必须原样携带未过期 token |

#### Relation 单选

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `relation_id/type` | Fact ID、Capability 和 family | Semantic Model | ID 只读、类型条件编辑 | 类型改变先重算 Capability Option |
| `endpoints` | ordered role、target、State qualification、multiplicity | Semantic Model | 条件编辑 | 不压缩为简单 source/target；用户拖线顺序不等于规范方向 |
| `direction` | 标准方向 | Semantic Model + Profile | 条件编辑 | 不允许仅反转图形箭头 |
| `labels` | forward/reverse/reciprocal 等稳定 slot | Semantic Model + Symbol | 条件编辑 | 双向标签不得交换 slot 改变语义 |
| `modifiers` | 路径、逻辑、概率及受控 Control pair | Semantic Model + Profile + API-EDT-001 | 条件编辑 | Control 仅为 `control.capability=<CAP-ISO-CTRL-001~008>` + `control.segment=PROCESS_INPUT`，两项成对原子提交；基础 Fact ID/Capability 不变 |
| `condition` | 独立 SemanticCondition 谓词 | Semantic Model + Profile | 条件编辑 | 不用于重复表达 Event/Condition 类型；仅有 Control 时为空 |
| `fan_members` | refineable/refinee ordered endpoints | Semantic Model | 条件编辑 | fundamental relation 保持一个 Fact ID |
| `collection_completeness` | complete/incomplete/not-applicable | Semantic Model + Profile | 条件编辑 | Classification 必须为 not-applicable |
| `symbol/route` | line、marker、annotation、junction、route family | Symbol + Context Projection | 语义只读/布局条件编辑 | marker 类型不由前端改写；只允许位置/折点布局 |
| `fact_trace` | Model Fact 与 Sentence | M04 + M08 Query | 只读 | 可定位对应文本 |
| `delete_impact_summary/token` | fan/端点/State/Text/Context 影响与不透明 token | API-EDT-001 | 只读候选 | 影响集合、Revision 或 binding 变化后 token 失效 |

#### 多选、Context、Sentence 和 Finding

| 选择类型 | 字段 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| 多选 | 数量、类型分布、对齐/分布、公共方法分类 | M05/M11 + Derived UI | 条件编辑 | 不提供名称、类型、端点等危险批量改写 |
| Context | 类型、父级、refinee、方式、Paragraph、问题摘要 | M05/M07/M08 | 名称条件编辑，其余只读 | 移动/删除走 OV11 |
| Sentence | 文本、句子 ID、输入 Fact、Construct、生成规则 | M08 | 只读 | 首期禁止直接编辑文本 |
| Finding | 等级、类别、规则、说明、建议、定位、输入版本 | M07 | 只读 | 方法豁免动作由 M11 独立承接 |

### 7.5 底部 OPL/OPT

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `text_scope` | 当前 OPD/子树/全模型 | Derived UI | 本地视图 | 只改变查询范围 |
| `text_mode` | OPL 或 OPT | Profile Binding | 只读 | 不允许手工切换成另一 Profile 文本 |
| `text_status` | current/generating/stale/blocked/failed | Text Projection | 只读 | 非 current 不参与基线 |
| `input_revision/profile/rule` | 生成输入版本 | Text Projection | 只读 | 导出必须携带 |
| `sentence_text` | 只读句子 | Text Projection | 只读 | 点击产生 sentence selection |
| `sentence_trace` | Fact/Construct 多对多定位 | Text Projection | 只读 | 定位失败需清除错误高亮 |
| `text_diff` | 与选定版本差异 | M08/M09 | 只读 | 绑定左右 revision |

### 7.6 底部问题、历史和方法

| 标签 | 字段 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| 问题 | 等级、category、规则 ID、说明、建议、Context、目标、revision | Validation Query | 只读 | 点击定位；过期结果明确标记 |
| 历史 | 时间、动作、对象、结果、revision | Version Query | 只读 | 不显示不存在的用户身份，不替代 Undo |
| 方法 | 架构层、6x1 角色、模式缺口、决策、豁免 | Method Query | 条件编辑 | 与标准 Finding 分栏；豁免需理由 |

## 8. P04 版本与基线

### 8.1 版本列表与差异

| 字段 | 展示口径 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| `revision_id/type` | Draft/Autosave/Snapshot/Baseline | Version Query | 只读 | 类型决定访问模式 |
| `created_at` | 创建时间 | Version Query | 只读 | 本地时间 |
| `description` | 快照/基线说明 | Version Query | 创建时命令编辑 | 已创建不可原地改写 |
| `profile/rule_version` | 版本绑定 | Version Query | 只读 | 差异和证据上下文 |
| `validation_summary` | 目标 revision 的报告摘要 | Validation Query | 只读 | 不复用其他 revision 结果 |
| `left/right_revision` | 比较双方 | Derived UI | 本地视图 | 不能相同；变化使旧 diff 过期 |
| `diff_scope` | 语义/Context/布局/文本 | Derived UI | 本地视图 | 分类展示 |
| `diff_result` | 新增、删除、修改和影响 | Version Query | 只读 | 以稳定 ID 对齐 |

## 9. P05 标准、校验与符合性

| 区块 | 字段 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| Profile 摘要 | ID、版本、状态、文本模态、规则版本 | Profile Catalog | 只读 | 转换走 OV04 |
| 校验运行 | 范围、固定 revision、阶段、进度、开始/完成时间 | Validation Query | 任务参数/只读 | 失败不等同不符合 |
| Finding | ID、等级、category、规则、说明、建议、定位 | Validation Query | 只读 | 可回流 P03 |
| 规则详情 | ISOR/CAP/原子规则 ID、来源、版本、执行阶段 | Profile Catalog | 只读 | 缺原子规则要显式 |
| 能力报告 | MUST/SHOULD/FORBIDDEN/N/A 实现与证据 | M06/M07 | 只读 | 未实现 SHOULD 不伪装可用 |
| 符合性摘要 | partial/full/nonconformant/unknown/evidence-missing | Validation Query | 只读 | 缺证据不得输出符合 |

## 10. P06 本地数据、备份与恢复

| 区块 | 字段 | 来源 | 编辑性 | 守卫/说明 |
| --- | --- | --- | --- | --- |
| 存储 | 项目位置、格式版本、占用、健康状态 | Local Runtime Query | 只读 | 不直接在页面编辑物理文件 |
| 自动备份 | enabled、位置、频率、保留数量 | M10 用例 | 条件编辑 | 默认值仍待产品确认；路径需校验 |
| 备份列表 | manifest ID、时间、范围、格式/Profile 版本、完整性 | Transfer/Backup Query | 只读 | 恢复前重新校验 |
| 后台任务 | 类型、阶段、进度、状态、结果位置、错误 | M10/M12 Query | 只读/可取消 | 仅声明可取消的阶段显示取消 |
| 导入/导出 | 文件、格式、范围、revision、元数据 | M10 | 任务参数 | 进入 OV07/OV08 |
| 恢复 | 备份、目标项目、模式、回退点、影响 | M10 | 任务参数 | 默认新项目；覆盖需额外确认 |

## 11. 关键弹层字段

| overlay_id | 必填输入 | 只读预览 | 提交守卫 |
| --- | --- | --- | --- |
| OV01 | 项目名称；说明可选；默认 Profile | 本地位置摘要 | 名称合法、Profile 可用、位置可写 |
| OV02 | 模型名称、Profile 及版本；模板可选 | 将创建的根 Context 和文本模态 | 项目活动、Profile 资产完整 |
| OV03 | 细化方式、新 Context 名称 | refinee、父 Context、目标树类型 | 单选可细化 Thing、Profile 允许、草稿可写 |
| OV04 | 目标 Profile 及版本 | 无损/扩展/有损/不可映射清单、目标试校验 | 分析 current、保存成功、用户确认有损项 |
| OV05 | 快照名称、变更说明 | 目标 revision、Profile、保存状态 | revision 已耐久保存 |
| OV06 | 基线名称、说明 | revision、Profile/规则、文本、校验和证据摘要 | text current、validation current、无 BLOCKING、保存成功 |
| OV07 | 本地文件、导入目标模式 | 安全/格式/Profile/标识检查和 Import Plan | 全量试校验通过并确认，不覆盖活动模型 |
| OV08 | 范围、格式、本地位置 | revision/Profile/规则/生成时间元数据 | 目标 revision 固定、格式受支持、位置可写 |
| OV09 | 备份范围、位置 | 预计内容和 manifest 元数据 | 项目可读、位置可写、无冲突任务 |
| OV10 | 备份文件、恢复模式 | 完整性、版本、目标、回退点和影响 | 检查通过；覆盖模式额外确认 |
| OV11 | 目标 OPD、动作 | owner/reference/refinement/view 影响 | 分析 current、目标未变化、草稿可写 |

## 12. 派生字段与禁止持久化项

以下字段由页面或查询派生，不应作为独立业务事实写回：

1. 列表数量、严重等级计数、Context 展开状态和当前标签；
2. viewport 比例、平移、框选、hover、焦点和面板尺寸；
3. “是否可生成基线”等动作可用性；其依据来自保存、文本和校验状态；
4. 当前 OPL/OPT 高亮和 Finding 高亮；
5. 临时关系候选、拖拽预览和未提交表单值。
6. capability query/option ID、不可用 reason、最近关系和候选 OPL；这些只用于当前候选会话。
7. 当前选择、激活工具、属性检查器开关、底部标签、面板尺寸及临时高亮；这些不得进入 URL/history state。

`element_position` 仍可按布局命令产生新 Revision；是否产生 Revision 与 URL 展示策略独立。活动 HEAD 下布局提交只更新 Header 和 Projection，不把新 Revision ID 写入 URL。

## 13. 事实与建议

### 13.1 已确认事实

1. M02-M11 分别拥有页面使用的逻辑业务数据，M01 只组合投影和发起用例；
2. OPL/OPT、校验、版本和基线都绑定修订与 Profile/规则版本；
3. Profile 决定可见元素、关系、属性和修饰符；
4. 本地路径和任务由 M12 实现，但页面不得直接访问 M12 存储实现；
5. 本文档未定义任何 API 或持久化字段。

### 13.2 已冻结与待实现

1. P0 字段和主动作已映射机器 Schema 与 OpenAPI；传输 DTO 由契约生成；
2. 项目/模型重名策略、备份默认参数和 opaque 路径选择仍待产品/后续包确认；
3. P0 与完整画布的逻辑图形、锚点、marker、label slot、route 和动态字段口径已形成；Clause 4 符号目录及 Clause 7-10 对应图形语义的机器资产仍由 DEV-CANVAS-01~05 实现；
4. 性能占用、任务进度和存储健康的计算由 M12 生产实现与测试冻结。
5. 现有 P0 OpenAPI 只提供字符串 allowed/forbidden，完整字段 DTO 必须等待 DEV-CANVAS-00 的 generated client。
