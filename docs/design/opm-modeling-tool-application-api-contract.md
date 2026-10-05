2026-10-01：草稿 V2 增加 `UPDATE_LAYOUT_BATCH`，完整几何快照按 scope endpoints 精确授权并在一次 journal 事务中提交；用于多选移动及布局撤销/重做。V1 的 `UPDATE_LAYOUT` 不变。见[规格](../../specs/opm-layout-selection-history-feature-task-spec.md)。

# OPM 单机建模工具应用 API 契约

2026-09-15：UPDATE_LAYOUT 的 owned role 集合扩展至 Operation、State、Feature State，payload 不变；状态容纳与父移动联动由 Runtime 原子执行，草稿只产生一条 journal edit，继续按混合保存策略形成检查点。角色/owner/Context 校验、夹取算法、失败与回滚见[状态布局修正规格](../../specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md)，替代旧三类移动限制。

文档版本：`v1.3`

文档状态：`FROZEN_INCLUDED`；应用语义与完整画布 0.2 目标契约冻结，机器发布和执行证据待开发包验收

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

更新时间：2026-09-03

## Task Type

- `feature`

## 1. 文档范围

本文档冻结 P01-P06 页面调用 M02-M12 应用能力时的操作标识、通用包络、关键输入、结果、状态守卫、并发幂等和结构化错误语义。

本文档中的“API”表示模块化单体的应用边界。P0 操作已经映射到 `docs/contracts/openapi/opm-local-api-v1.yaml` 的本地 HTTP 契约；未进入首批 OpenAPI 的操作继续保持传输无关，后续映射不得改变本文定义的命令、查询、事务和错误语义。

`UPDATE_LAYOUT` 仅携带 `occurrence_id` 和二维有限数 `x/y`，不得携带目标、Context、尺寸或级联集合。允许当前根 Context 的 owned Object/Process/Attribute/Operation/State，Runtime 复核 role/kind/owner 后执行；State 在 owner 内容区夹取位置，父节点移动原子更新其可见 owned 状态布局。尺寸扩展由 Runtime 的容纳规则计算。Fact、非 owned 和跨 Context occurrence 继续拒绝；语义及 OPL/Trace 不变，活动草稿沿混合保存策略持久化。完整边界由 `specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md` 冻结。

`UPDATE_PROPERTY` 的受控名称切片允许修改 Object/Process/Attribute/Operation 的 `name`。payload 固定为 `target_ref={target_kind=ELEMENT|FEATURE,target_id}`、`property_name=name`、`value`、`capability_query_id` 和 `selected_option_id`，禁止扩展字段；Object/Process 使用 `ELEMENT`，Attribute/Operation 使用 `FEATURE`。名称保留原字符串，按 Unicode code point 限制为最多 256，空白值非法，不执行唯一性校验；成功只替换目标的 `QualifiedName.local_name`，Feature 的 owner/kind/capability 不变。旧 Revision、Baseline、同值和重复命令继续遵守既有语义，Feature 扩展由 `specs/opm-p03-feature-owner-and-name-editing-feature-task-spec.md` 冻结。

`DELETE_CONSTRUCT` 的完整 P03 生命周期由 `specs/opm-p03-unified-construct-lifecycle-design-task-spec.md` 冻结：删除从 selected occurrence 取得 Runtime impact option，而不是由画布 Cell 推断 target 或 cascade；当前 0.2 OpenAPI、生成 DTO 与 Runtime 仍待后继原子实现规格同步。

本文档本身不重复冻结：

1. P0 HTTP 方法、URL、状态码和网络 DTO；这些由配套 OpenAPI 冻结；
2. 前后端框架、编程语言、序列化库和本地服务端口；
3. 数据库表、文件结构和索引；
4. 用户、角色、租户、令牌和远程授权；
5. 核心元模型、Profile Package 和 Rule Definition 的字段语义；这些由独立字段级 schema 文档承接。

## 2. 关联文档

1. `docs/requirements/opm-online-modeling-tool-requirements.md`
2. `docs/design/opm-modeling-tool-architecture.md`
3. `docs/design/opm-modeling-tool-module-design.md`
4. `docs/design/opm-modeling-workbench-page-design.md`
5. `docs/design/opm-modeling-workbench-state-model.md`
6. `docs/design/opm-modeling-workbench-field-region-detail.md`
7. `docs/design/opm-modeling-workbench-component-interaction.md`
8. `docs/design/opm-modeling-tool-persistence-contract.md`
9. `docs/design/opm-native-exchange-package-contract.md`
10. `docs/design/opm-core-metamodel-field-schema.md`
11. `docs/design/opm-profile-package-field-schema.md`
12. `docs/design/opm-rule-definition-field-schema.md`
13. `docs/design/opm-complete-canvas-toolchain-design.md`
14. `docs/design/opm-symbol-and-text-generation-implementation-contract.md`

## 3. 设计原则

1. 命令和查询分离：查询不得产生业务写入；命令返回已提交事实或明确失败；
2. 页面只调用应用操作，不直接调用 M04 领域对象或 M12 存储实现；
3. Semantic Model 是唯一正式事实源，OPD、文本、Finding、System map 和 Diff 均为带修订的投影；
4. 单用户不等于无并发：UI 重试、自动保存和后台任务必须使用 revision 与幂等标识协调；
5. 长任务读取固定输入修订，过期结果可以保留但不得覆盖当前投影；
6. 错误先表达用户可理解的业务原因，再附错误码、规则和技术诊断；
7. 配置档转换、导入、基线和恢复必须先预检或预览，再显式确认提交。

## 4. 通用包络

### 4.1 `RequestContext`

| 字段 | 必填条件 | 含义 |
| --- | --- | --- |
| `request_id` | 全部操作 | 单次调用追踪标识；重试可以使用新 request_id |
| `operation_id` | 全部操作 | 本文第 7 章定义的固定操作编号 |
| `project_id` | 项目内操作 | 稳定项目标识 |
| `model_id` | 模型内操作 | 稳定模型标识 |
| `context_id` | OPD 上下文操作 | 稳定 Context 标识 |
| `command_id` | 全部写操作 | 幂等标识；同一幂等范围重放返回原结果 |
| `base_revision` | 模型写操作 | 命令所基于的 Draft Revision；不匹配时拒绝覆盖 |
| `profile_id/profile_version` | 模型语义写操作 | 命令解释使用的 Profile 绑定 |
| `rule_version` | 模型语义写操作 | 候选过滤、校验和文本生成使用的规则版本 |
| `client_time` | 可选 | 仅用于本地诊断和展示，不参与冲突排序或事实时间 |

请求上下文不包含 `user_id`、`tenant_id`、角色或权限声明。若未来增加多用户能力，必须形成新版本契约，不能把本地设备标识伪装成用户身份。

### 4.2 `QueryResult<T>`

| 字段 | 含义 |
| --- | --- |
| `request_id` | 对应请求 |
| `data` | 查询数据 |
| `read_revision` | 模型查询读取的不可变修订；项目级查询可为空 |
| `profile_version/rule_version` | 影响结果解释时必须返回 |
| `freshness` | `current/stale/historical/not-applicable` |
| `generated_at` | 查询或投影生成时间 |
| `page_info` | 列表查询的游标信息 |

### 4.3 `CommandResult<T>`

| 字段 | 含义 |
| --- | --- |
| `request_id/command_id` | 请求与幂等关联 |
| `status` | `COMMITTED/BLOCKED/FAILED/ACCEPTED` |
| `data` | 已提交结果、阻断详情或已接受任务 |
| `committed_revision` | 产生新模型修订时必填 |
| `autosave_state` | `pending/saving/saved/failed/not-applicable` |
| `projection_state` | OPD、文本和校验投影的新鲜度摘要 |
| `warnings` | 不阻断提交的结构化警告 |

`ACCEPTED` 只表示后台任务已经耐久登记或进入进程内任务调度，不表示业务动作完成。完成结果必须通过任务查询获得。

### 4.4 `ErrorDetail`

| 字段 | 含义 |
| --- | --- |
| `code` | 第 11 章稳定错误码 |
| `category` | `INPUT/DOMAIN/PROFILE/VALIDATION/TEXT/REVISION/PERSISTENCE/FORMAT/SECURITY/TASK/SYSTEM` |
| `message` | 面向用户的简体中文说明 |
| `retryable` | 同一输入是否可直接重试 |
| `field_errors` | 字段路径、原因和建议值 |
| `locators` | project/model/context/element/fact/sentence/finding 等定位 |
| `rule_refs` | Profile、规则 ID 和版本 |
| `current_revision` | 发生 revision conflict 时返回 |
| `diagnostic_id` | 本地诊断关联，不暴露堆栈和敏感路径 |

## 5. 查询、分页与读取一致性

1. 项目、模型、Finding、版本、历史和任务列表使用不透明 `cursor`，不得让页面依赖数据库偏移量；
2. `page_size` 有实现上限，具体数值在性能设计中冻结；
3. 同一游标链必须绑定相同筛选、排序和读取快照；输入改变后重新开始分页；
4. 模型投影查询必须返回 `read_revision`；页面只能把同一 revision 的 OPD、文本和校验结果显示为 current；
5. 查询可读取 Baseline/Snapshot 历史修订，但必须返回对应只读访问模式；
6. 搜索结果使用稳定 ID 和 Context occurrence 定位，不按名称推断身份；
7. cursor 过期返回 `CURSOR_EXPIRED`，页面保留筛选并重新查询，不拼接旧新分页结果。

## 6. 命令、幂等与事务

### 6.1 幂等范围

幂等键逻辑范围为 `operation_id + aggregate_id + command_id`。相同范围和相同请求摘要重复提交必须返回第一次的已提交结果；相同 command_id 对应不同请求摘要返回 `IDEMPOTENCY_MISMATCH`。

### 6.2 Revision 守卫

新模式修正：以下 revision-only 守卫与第 4/5/6.3 节的包络、提交语义继续适用于 `REVISION_PER_EDIT_V1` 和历史 EXACT 查询。`JOURNALED_DRAFT_V2` 使用独立 draft token、DURABLE 编辑回执和 Save/Pin 协议，详见 [混合保存设计](opm-hybrid-save-and-draft-recovery-design.md)。不得将草稿序号写入 committed_revision；新机器 OpenAPI 与生成类型由 [HS-01](../../specs/opm-hybrid-save-strategy-implementation-task-spec.md) 交付后再接入消费端，当前 API 实现未改变。

1. 所有模型语义、Context、语义布局、Profile 转换和版本写命令必须携带 `base_revision`；
2. 普通 viewport、焦点、筛选和面板状态不携带 base_revision，也不产生模型修订；
3. base_revision 不是当前可写 Draft Revision 时返回 `REVISION_CONFLICT`，不自动合并或覆盖；
4. Snapshot/Baseline 上的写命令返回 `READ_ONLY_REVISION`；创建草稿必须使用专用操作；
5. Profile/rule version 与活动绑定不一致时返回 `RULE_VERSION_CONFLICT`，要求刷新后重试。

### 6.3 命令完成口径

模型编辑只有在 Semantic Model、Context/Occurrence、正式文本、Text Trace、校验摘要、Revision 和 Operation Record 满足持久化契约并完成原子提交后才返回 `COMMITTED`。任何步骤失败都不得返回 committed_revision。

## 7. 操作总表

### 7.1 项目与模型

| 编号 | 操作 | 类型 | 处理模块 | 页面/弹层 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| API-PRJ-001 | ListProjects | Query | M02 | P01 | 项目分页列表 |
| API-PRJ-002 | GetProject | Query | M02 | P02/P06 | 项目摘要 |
| API-PRJ-003 | CreateProject | Command | M02/M12 | OV01 | 新 Project |
| API-PRJ-004 | UpdateProject | Command | M02 | P01/P02 | 更新后的 Project |
| API-PRJ-005 | ChangeProjectArchiveState | Command | M02 | P01 | 活动或归档状态 |
| API-PRJ-006 | ListModels | Query | M02 | P02 | 模型分页列表 |
| API-PRJ-007 | CreateModel | Command | M02-M09/M12 | OV02 | 初始 Draft Revision 和根 Context |
| API-PRJ-008 | UpdateModelMetadata | Command | M02 | P02 | 更新后的 Model metadata |
| API-PRJ-009 | OpenModel | Query | M02/M06/M09/M12 | P02/P03 | Workspace Session 或恢复问题 |
| API-PRJ-010 | SearchWorkspace | Query | M02/M05 | P01/P03 | 稳定定位结果 |
| API-PRJ-011 | AnalyseProfileConversion | Task | M06-M08/M10 | OV04/P05 | Conversion Report |
| API-PRJ-012 | ApplyProfileConversion | Command | M03-M10/M12 | OV04 | 新目标 Draft Revision |
| API-PRJ-013 | ChangeModelLifecycle | Command | M02/M12 | P02 | 模型移入回收站、恢复或永久删除的原子收据 |

`ListModels` 可传 `archive_state=ACTIVE|ARCHIVED`，默认 ACTIVE。`ChangeModelLifecycle` 采用 `TRASH|RESTORE|PURGE` action 与 expected_state；只有 ARCHIVED 模型可 PURGE，且必须提供与模型当前名称精确一致的 confirmation_name。移入回收站保留全部内容，活动工作台与 Draft 操作不再访问该模型；恢复保留原模型 ID 与内容。永久删除仅清理该模型在项目库中的内部数据，保留项目级生命周期审计/收据和外部备份/导出物。所有写请求仍经过本地会话保护。

SQLite V7 迁移增加事务内的 model_purge_authorization 表并收紧删除授权范围：仅 ARCHIVED 模型在完整清理事务中可删除不可变历史，普通直接 DELETE 仍被拒绝。禁止修改旧 SQL 迁移；迁移及单模型回滚证据见 `specs/opm-p02-model-trash-lifecycle-feature-task-spec.md`。

### 7.2 Context、编辑与投影

| 编号 | 操作 | 类型 | 处理模块 | 页面/弹层 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| API-CTX-001 | GetContextNavigation | Query | M05/M07 | P03 | process tree/object forest/views 摘要 |
| API-CTX-002 | GetContextProjection | Query | M05 | P03 | 当前 OPD Construct 投影 |
| API-CTX-003 | GetSystemMap | Query | M05 | P03 | System map 和 occurrence 索引 |
| API-CTX-004 | GetContextImpact | Query | M05/M07 | OV11 | owner/reference/refinement/view 影响 |
| API-EDT-001 | GetCommandCapabilities | Query | M06 | P03 | 当前选择允许的结点、关系、修饰和命令 |
| API-EDT-002 | ExecuteEditCommand | Command | M03-M09/M12 | P03/OV03/OV11 | committed_revision 或结构化错误 |
| API-EDT-003 | UndoEditCommand | Command | M03-M09/M12 | P03 | 新 committed_revision |
| API-EDT-004 | RedoEditCommand | Command | M03-M09/M12 | P03 | 新 committed_revision |
| API-EDT-005 | GetEditSessionState | Query | M03/M09 | P03 | revision、Undo/Redo、脏状态和保存状态 |
| API-CAT-001 | GetRelationCatalog | Query | M06 | P03 | selection-aware 16/8/10 关系目录、符号、端点摘要和进入模式 |

`ExecuteEditCommand` 的 P0 机器契约覆盖结点/基础关系创建与删除、属性修改、Context 创建、普通/语义布局、状态显式/抑制、展开/折叠和语义 in/out-zoom。完整画布在相同 operationId 下扩展 State/Fact command union；新增 command_type 必须先补 Profile 能力、校验、文本、持久化和验收映射。

#### 7.2.1 `API-EDT-001 CommandCapabilityQuery`

```text
CommandCapabilityQuery {
  input_revision
  intent                    // CREATE_ELEMENT | CREATE_FEATURE | CREATE_STATE | CREATE_FACT |
                            // UPDATE_STATE | UPDATE_FACT | UPDATE_PROPERTY | DELETE_CONSTRUCT |
                            // SEMANTIC_REFINEMENT
  selection_locators[]
  first_endpoint_locator?
  second_endpoint_locator?
  requested_capability_ref?
  existing_construct_ref?
  draft_fields?
}
```

查询固定读取 `input_revision + profile/rule/symbol/grammar binding`。`draft_fields` 只携带候选过滤所需的标签、State role、modifier 或完整性摘要，不接收 X6 Cell、DOM、viewport、菜单状态或任意 Map。

```text
CommandCapabilityOption {
  capability_query_id
  option_id
  command_type
  capability_ref            // 当前候选能力；Control 时为 CAP-ISO-CTRL-*
  base_fact_capability_ref? // Control 时必填，为被修饰 Procedural Capability
  display_name
  group_path[]
  normalized_endpoints[]
  required_fields[]
  allowed_modifiers[]
  symbol_descriptor_ref + digest
  template_family_ref + digest
  rule_refs[]
  enabled
  reason_codes[]
  impact_summary?
  impact_token?
  expires_with_revision
}
```

其中 `allowed_modifiers[]` 使用封闭逻辑结构，不返回任意 Map：

```text
AllowedModifierOption {
  modifier_id
  value_options[]           // 当前候选允许的精确值；不得由前端扩展
  min_occurs
  max_occurs
  atomic_group_id?          // 同组字段必须作为一个原子单元提交
}
```

Control option 必须恰好返回 `control.capability` 与 `control.segment` 两项，二者的 `min_occurs=max_occurs=1`、`atomic_group_id=iso-control`；前者 `value_options` 只包含该 option 的 `CAP-ISO-CTRL-*`，后者只包含 `PROCESS_INPUT`。非 Control option 不得借用该 atomic group。

返回规则：

1. `normalized_endpoints` 使用 `MS-FACT-002 FactEndpoint` 的 role/target/state qualification 语义，不按用户拖线顺序返回；
2. `FORBIDDEN/N_A` Capability 不作为可见 option 返回；活动 Profile 中因当前端点/Context/资产不可用的能力可以 `enabled=false` 返回稳定原因；
3. 同一端点组合存在多个合法关系时返回多个 option，顺序不代表默认提交；
4. option 绑定 `input_revision`，Revision、Context、Profile binding、端点或 draft field 改变后失效；
5. 当前完整画布稳定 reason code 至少覆盖 `PROFILE_CAPABILITY_DISABLED/SYMBOL_ASSET_MISSING/TEXT_TEMPLATE_MISSING/ENDPOINT_KIND_MISMATCH/STATE_OWNER_MISMATCH/CONTEXT_NOT_ALLOWED/FACT_ALREADY_EXISTS/MODIFIER_COMBINATION_INVALID/READ_ONLY_REVISION/REVISION_STALE`；
6. `DELETE_CONSTRUCT` option 必须返回固定 `input_revision` 的 `impact_summary + impact_token`；其他 intent 禁止返回 impact token，前端不得自行拼装；
7. impact token 绑定 selection、mode、target、影响集合摘要、Revision 和 binding，任一项变化即失效；
8. reason code 是候选解释，不替代第 11 章提交错误码。
9. Control option 的 `capability_ref` 是所选 `CAP-ISO-CTRL-*`，`base_fact_capability_ref` 是允许被修饰的 Procedural Capability；非 Control option 禁止返回后者。

#### 7.2.1a `API-CAT-001 RelationCatalogQuery`

```text
RelationCatalogQuery {
  input_revision
  context_id
  selection_id?             // 当前 committed Fact；只影响 Control 进入状态
}

RelationCatalogItem {
  family                     // PROCEDURAL | CONTROL | STRUCTURAL
  capability_id
  display_name
  interaction_mode           // CREATE_FACT | UPDATE_SELECTED_FACT
  symbol_descriptor          // exact id/version/digest
  endpoint_summary {
    min_endpoints
    max_endpoints?
    roles[] {
      role
      target_kinds[]
      min_occurs
      max_occurs?
      state_qualification_allowed
    }
  }
  enabled
  reason_codes[]
}
```

目录固定返回活动 Profile 可见的 `16 Procedural / 8 Control / 10 Structural`。它不返回 `FORBIDDEN/N_A` Capability，也不构成最终端点授权。Procedural/Structural 使用 `CREATE_FACT`；Control 使用 `UPDATE_SELECTED_FACT`，仅当 `selection_id` 是当前 Context 中的 committed Procedural Fact 且存在匹配 `UPDATE_FACT` option 时 enabled，否则至少返回 `CONTROL_REQUIRES_BASE_FACT` 或更高优先级的 binding/readonly reason。

`endpoint_summary` 是 Runtime 从当前 Profile/Rule/Catalog 生成的展示摘要，不是前端规则表；用户选择端点后必须调用 `API-EDT-001`，最终以 option 的 `normalized_endpoints/required_fields/allowed_modifiers` 为准。`symbol_descriptor` 必须与后续 option 的 exact ref 匹配；不匹配时阻断 preview 和提交。

目录查询、搜索、排序和 item 选择均不产生 Command、Revision、Operation Record、Fact、Occurrence、OPL/Trace 或 capture anchor。

#### 7.2.1b `DELETE_CONSTRUCT` 影响协议

删除查询的 `selection_locators[]` 只接受当前 Projection 的 exact occurrence ID。Runtime 为同一 selection 分别计算可用的 `REMOVE_OCCURRENCE`、`DELETE_TARGET` 或 `CASCADE` option；前端不得根据 `target_kind`、owner、线条或 Trace 自行构造模式或影响集合。

`impact_summary` 是完整而非计数提示，固定包含 `input_revision`、`selected_occurrence_id`、`delete_mode`、`target{kind,id}`、规范排序且去重的 `items[]`、以及 Context/Occurrence/Element/Feature/State/Fact/OPL Sentence/Trace/Finding 九类计数。每个 item 固定为 `{kind,id,context_id?,effect}`，`effect` 只能为 `DIRECT`、`CASCADE` 或 disabled option 中的 `BLOCKER`。enabled option 不得带 blocker、不得截断 items；无法产生完整闭包时 option disabled 且不发 token。

`REMOVE_OCCURRENCE` 只移除当前 Context occurrence；它仅对 referenced occurrence 或仍保有其他 owned occurrence 的目标 enabled，Fact 不提供该模式。`DELETE_TARGET` 删除目标、其全部 owned occurrence 和自动派生文本/追踪投影；若仍有引用 occurrence、owned Feature/State、Fact、细化 Context 或其他依赖则以 `DELETE_DEPENDENCY_EXISTS` 阻断。只有 Runtime 能完整列出闭包时才提供 `CASCADE`；确认即删除 token 所绑定的全部 `DIRECT/CASCADE` 项，禁止静默级联。

后继 OpenAPI payload 固定为 `selection_id + construct_kind + construct_id + delete_mode + impact_token`，全部必填、`additionalProperties=false`。`REMOVE_OCCURRENCE` 只能为 `construct_kind=OCCURRENCE` 且 construct ID 等于 selection；其余模式只能为 `ELEMENT|FEATURE|STATE|FACT`。token 必须精确绑定 project/model/context、Revision、binding、selection、mode、target、规范 impact、query 与 option。token 形状错误返回 `INVALID_ARGUMENT/400`；所有绑定不一致返回 `IMPACT_TOKEN_STALE/409`；取消、阻断、token 错误和持久化失败均不得产生 Revision 或部分删除。

Control 不走 `DELETE_CONSTRUCT`。选中的 committed Procedural Fact 含有效 Control 原子组时，`UPDATE_FACT` 返回 `REMOVE_CONTROL` 表示选项；确认提交 `replacement.modifiers=[]`，保留基础 Fact、endpoints、layout、capture anchor 和 Fact ID，仅重生成该 Fact 的 OPL/Trace。

#### 7.2.2 `API-EDT-002` 完整画布 command union

P0 已有 command_type 保持兼容。完整画布新增 `CREATE_STATE/UPDATE_STATE/UPDATE_FACT`，并冻结 `CREATE_FACT` 的完整 payload。State 不是 Element，`CREATE_ELEMENT` 必须拒绝 State payload。

```text
CreateStatePayload {
  context_id
  owner_ref                 // Element/Feature
  capability_ref
  name_or_value
  state_roles[]             // INITIAL/DEFAULT/FINAL，组合由 Profile 决定
  occurrence { ownership, construct_role }
  layout { x, y, width?, height? }
  capability_query_id
  selected_option_id
}

UpdateStatePayload {
  state_id
  expected_owner_ref
  changes { name_or_value?, state_roles?, ordinal? }
  capability_query_id
  selected_option_id
}

CreateFactPayload {
  context_id
  capability_ref             // 正式基础 Fact Capability，不写 CAP-ISO-CTRL-*
  fact_family
  normalized_endpoints[]
  direction
  labels[]
  modifiers[]               // { modifier_id, value } 封闭集合
  condition?                // 独立谓词，不用于重复表达 ISO Control 类型
  logical_groups[]
  collection_completeness?
  occurrence { ownership, construct_role }
  layout { route_points[]?, label_positions[]?, junction_position? }
  capability_query_id
  selected_option_id
}

UpdateFactPayload {
  fact_id
  expected_capability_ref
  replacement {
    normalized_endpoints[]?
    labels[]?
    modifiers[]?
    condition?
    logical_groups[]?
    collection_completeness?
  }
  capability_query_id
  selected_option_id
}

DeleteConstructPayload {
  selection_id              // exact selected occurrence
  construct_kind            // OCCURRENCE | ELEMENT | STATE | FACT | FEATURE
  construct_id
  delete_mode               // REMOVE_OCCURRENCE | DELETE_TARGET | CASCADE
  impact_token
}
```

Payload 规则：

1. `changes/replacement` 至少包含一个字段，未出现字段保持不变；显式清空使用字段 schema 定义的空集合或 null 语义，禁止含糊 merge patch；
2. `labels[]` 按 Symbol Descriptor 的稳定 slot ID 保存，双向标签不能交换 slot 改变方向；
3. `collection_completeness` 只适用于允许完整/不完整 refinee 集合的 fundamental relation，Classification-instantiation 禁止该字段；
4. ISO Control 使用基础 Fact 的两个受控 Modifier，不创建脱离基础关系的自由 Fact，也不把基础 Fact 的 `fact_family/capability_ref` 改为 Control；
5. fundamental fan 的多个 refinee 是同一 Fact 的 ordered endpoints，更新成员保持 Fact ID；
6. `UPDATE_STATE` 不允许改变 owner；跨 owner 移动需要未来专用影响分析命令；
7. `DELETE_CONSTRUCT` 的 impact token 必须由固定 Revision 的完整影响查询产生，payload 的 selection/mode/target 与 token 不相等、过期或影响集合变化时阻断；
8. capability query/option ID 必须属于相同 base revision、binding、intent 和候选摘要，不能跨命令复用。

ISO Control 的 wire payload 冻结为：

```text
modifiers: [
  { modifier_id: "control.capability", value: "CAP-ISO-CTRL-001" },
  { modifier_id: "control.segment", value: "PROCESS_INPUT" }
]
```

其中 `control.capability` 的值域仅为 `CAP-ISO-CTRL-001~008`，`control.segment` 当前仅允许 `PROCESS_INPUT`。两项必须成对且各唯一，`CREATE_FACT` 原子创建，`UPDATE_FACT.replacement.modifiers` 原子替换整组；缺项、重复项、未知项、输出段、Result 基础 Fact、Control Capability 与基础 Fact/State 端点不匹配均返回 `MODIFIER_COMBINATION_INVALID`。

Wire payload 不重复传递 MS-MOD-001 的 `target_ref/capability_ref`：target 由 owning Fact 隐含，两个 Modifier 的逻辑 `capability_ref` 均由 `control.capability.value` 确定。服务端必须验证该值等于 selected option 的 Control `capability_ref`，并验证 payload 的基础 `capability_ref` 等于 option 的 `base_fact_capability_ref`。

`condition` 不参与 ISO Control 类型判定。只有 Profile 明确允许独立 `MS-COND-001` 谓词时才可提交；若内容仅重复 Event/Condition、segment 或 Control Capability，则阻断。Candidate Option 的 `allowed_modifiers` 必须返回两个键、精确值域和成对约束，X6 不得从折线路径反推 `control.segment`。

### 7.3 文本、校验和方法

| 编号 | 操作 | 类型 | 处理模块 | 页面/弹层 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| API-TXT-001 | GetTextProjection | Query | M08 | P03 | 当前 OPD/子树/全模型文本 |
| API-TXT-002 | GetTextTrace | Query | M08 | P03 | Fact/Construct/Sentence 多对多追踪 |
| API-TXT-003 | GetTextDiff | Query/Task | M08/M09 | P03/P04 | 两 revision 文本差异 |
| API-VAL-001 | ValidateModel | Task | M07/M08/M12 | P03/P05/OV06 | 固定 revision 的 Validation Report |
| API-VAL-002 | GetValidationReport | Query | M07 | P03/P05 | 报告和新鲜度 |
| API-VAL-003 | ListFindings | Query | M07 | P03/P05 | Finding 分页列表 |
| API-VAL-004 | GetFinding | Query | M07 | P03/P05 | Finding、规则和稳定定位 |
| API-VAL-005 | GetConformanceSummary | Query | M07 | P05/OV06 | 符合性和证据状态 |
| API-VAL-006 | GetCapabilityReport | Query | M06/M07 | P05 | MUST/SHOULD/FORBIDDEN/N/A 状态 |
| API-MTH-001 | GetMethodSummary | Query | M11 | P03 | 三层架构、6x1 和方法 Finding |
| API-MTH-002 | UpdateArchitectureClassification | Command | M11/M09/M12 | P03 | 新 committed_revision |
| API-MTH-003 | SaveDecisionRecord | Command | M11/M09/M12 | P03 | 新 committed_revision 和 Decision Record |
| API-MTH-004 | ResolveMethodFinding | Command | M11/M09/M12 | P03 | 新 committed_revision 和处置结果 |

当前本地实现的 API-MTH-001 为 6×1 关系证据切片：`POST /api/v2/projects/{project}/models/{model}/draft/method-summary`，使用本地 session 守卫。`MethodSummaryRequest` 的 `request_id/context_id` 必填，`source` 必须仅含精确 `draft_token` 或 `revision_id`。草稿冲突返回 DRAFT_CONFLICT，未知图或版本返回 NOT_FOUND；历史版本从保存文档独立读取。`MethodSummaryResult.meta` 回显请求、图与输入来源，`data.coverage=RELATION_EVIDENCE_ONLY`，包含模型所有过程的六类卡片、候选关系证据、OPD/目标 ID 和人工确认提示。

Agent/State Agent、Effect/状态 Effect、Instrument/State Instrument、Consumption/State Consumption 分别提供主体、客体、手段、资源的候选证据。环境与信息无法从当前语言关系唯一识别，返回 MANUAL；不按名称或 affiliation/essence 自动认定角色。不产生方法通过或 ISO 符合性结论，不写入模型/校验结果。OPD 三层分类与已有父子细化导航见下文；同模型显式架构输入/生成/追溯见下文；独立模型分类、跨模型关联、功能信息模式、决策与处置命令尚未实现。详见 `specs/opm-method-six-one-feature-task-spec.md`。

### 7.4 版本与基线

| 编号 | 操作 | 类型 | 处理模块 | 页面/弹层 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| API-VER-001 | ListRevisions | Query | M09 | P04 | Draft/Snapshot/Baseline 列表 |
| API-VER-002 | CreateNamedSnapshot | Command | M09/M12 | OV05 | Named Snapshot |
| API-VER-003 | CompareRevisions | Query/Task | M09 | P04 | 分类 Diff |
| API-VER-004 | CreateBaseline | Command/Task | M07-M09/M12 | OV06 | Baseline 或阻断结果 |
| API-VER-005 | CreateDraftFromRevision | Command | M09/M12 | P03/P04 | 新 Draft Revision |
| API-VER-006 | ListOperationHistory | Query | M09 | P03/P04 | Operation Record 分页列表 |

### 7.5 导入、导出、备份与本地任务

| 编号 | 操作 | 类型 | 处理模块 | 页面/弹层 | 主要结果 |
| --- | --- | --- | --- | --- | --- |
| API-XFR-001 | InspectImportPackage | Task | M10/M12 | OV07 | Import Plan |
| API-XFR-002 | CommitImportPlan | Command/Task | M02-M10/M12 | OV07 | 新 Project 或 Draft Revision |
| API-XFR-003 | ExportArtifact | Task | M08-M10/M12 | OV08/P06 | Export Manifest 和结果位置 |
| API-XFR-004 | GetLocalDataSummary | Query | M10/M12 | P06 | 存储、格式和健康摘要 |
| API-XFR-005 | GetBackupPolicy | Query | M10/M12 | P06 | 当前本地备份策略 |
| API-XFR-006 | UpdateBackupPolicy | Command | M10/M12 | P06 | 更新后的策略 |
| API-XFR-007 | CreateBackup | Task | M10/M12 | OV09/P06 | Backup Manifest |
| API-XFR-008 | InspectBackup | Task | M10/M12 | OV10 | 完整性和 Restore Plan |
| API-XFR-009 | RestoreBackup | Command/Task | M02/M09/M10/M12 | OV10 | 新项目或经确认的替换结果 |
| API-TSK-001 | GetTask | Query | M12 端口 | P05/P06/弹层 | Task 状态、阶段、进度和结果 |
| API-TSK-002 | ListTasks | Query | M12 端口 | 全局任务中心/P06 | 任务分页列表 |
| API-TSK-003 | CancelTask | Command | M12 端口 | P05/P06/弹层 | cancelling/cancelled 或不可取消错误 |
| API-TSK-004 | SubscribeTaskEvents | Stream | M12 端口 | P03/P05/P06/弹层 | 单 Task SSE 提示；最终状态仍以 GetTask 为准 |

### 7.5.1 OPD JSON 可编辑迁移增量

- `API-OPD-001`：`POST /api/v1/projects/{projectId}/models/{modelId}/opd-json/export`。请求包含 `request_id/context_id` 及二选一的当前 `draft_token` 或固定 `revision_id`；返回 JSON 文件内容，读取不修改草稿或版本。草稿 token 变化返回 `REVISION_CONFLICT`。
- `API-OPD-002`：`POST /api/v1/projects/{projectId}/opd-json/import`。请求包含 `request_id/command_id/name/binding/opd_package`；HTTP 201 返回标准 CommandEnvelope，`data` 为新 Model 并附 `context_id`。相同命令与内容重试只创建一次，变更请求ID不影响幂等。
- 格式为 `OPM-OPD-JSON/1.0`，契约见 [JSON Schema](../contracts/schemas/opm-opd-json-v1.schema.json) 和 [OpenAPI](../contracts/openapi/opm-local-api-v1.yaml)。保留选中 OPD、后代、必要父级及关系依赖，包含完整语义、共享内部身份、状态展示和各图布局；剔除无关兄弟图。不是只包含节点与连线的画布投影，也不是完整历史备份。
- 导入创建独立模型，生成新 model/revision/draft 身份，内部语义ID位于新模型命名空间内；不合并或覆盖已有模型。文件最多10 MiB；支持语义 schema 0.2/0.3/0.4/0.5，0.1明确拒绝。目标环境活动 Profile/Rule/Grammar/Symbol/Normalization 全绑定必须一致，冲突返回 `RULE_VERSION_CONFLICT`。版本、引用、入口、来源和模型身份校验失败零模型写入；持久化失败整事务回滚。
- 两个 POST 入口复用本地会话请求防护。导入前校验所有图的 OPL 可生成，导入后重新生成派生文本，清除旧修订摘要与校验证据；迁移成功不代表模型通过符合性校验。本增量不实现既有 API-XFR 的完整模型原生交换包或 OpCloud 文件兼容。

## 8. 关键操作明细

### 8.1 API-EDT-001 GetCommandCapabilities

输入：`RequestContext`、固定 `input_revision` 和第 7.2.1 节 `CommandCapabilityQuery`。

成功：返回结构化 `CommandCapabilityOption[]`、read_revision 和 binding；无合法候选是成功查询结果，不伪装为系统失败。

失败：Revision/Profile/Rule/Symbol/Grammar 无法解析时返回对应结构化错误。查询不产生 Command、Revision、Operation Record 或自动修复。

### 8.2 API-EDT-002 ExecuteEditCommand

输入：`RequestContext`、`command_type`、第 7.2.2 节对应的封闭 payload、适用的 capability option 或 impact token。

成功：返回 `COMMITTED`、唯一 committed_revision、autosave_state、受影响 Context/Element/Fact/Sentence/Rule 标识和投影状态。

失败：`PROFILE_FORBIDDEN/DOMAIN_REJECTED/VALIDATION_BLOCKED/TEXT_GENERATION_BLOCKED/REVISION_CONFLICT/PERSISTENCE_FAILED`。失败不得返回部分 committed_revision。

页面映射：P03 画布、属性检查器、Context 导航和语义细化菜单。

### 8.3 API-VAL-001 ValidateModel

输入：model_id、固定 input_revision、profile/rule version、范围 `INCREMENTAL/FULL/BASELINE_GATE/CONVERSION`。

接受：返回 task_id、固定输入和任务可取消阶段。完成后报告至少包含 Finding、等级计数、规则覆盖、文本追踪状态、符合性证据状态和 input_revision。

过期：任务照常保存为历史报告，但 `freshness=stale`，不得替换当前工作台摘要。

### 8.4 API-VER-004 CreateBaseline

输入：command_id、base_revision、基线名称/说明、Profile/规则版本和用户已查看的 evidence summary token。

守卫：目标修订已耐久保存，文本 current，全量校验 current，无 BLOCKING，summary token 未过期。

成功：原子创建不可变 Baseline 和 Operation Record。失败不产生 Baseline ID；校验阻断返回可定位 Finding。

### 8.5 API-PRJ-011/012 配置档转换

Analyse 固定源 revision 和目标 Profile，返回每个事实的 `CORE/CONDITIONAL/DERIVED/LOSSY/UNMAPPABLE`、目标试校验和试生成文本结果。Apply 必须引用未过期 report_id 和 report_digest；只创建新目标修订，不改写源修订或源基线。

### 8.6 API-XFR-001/002 导入

Inspect 只在隔离 staging 中解析原生包，返回格式/Profile/规则兼容性、引用完整性、身份碰撞、资源限制、目标模式和 Import Plan。Commit 必须引用未过期 plan_id 和 plan_digest；成功前不改变活动项目。

### 8.7 API-XFR-008/009 恢复

Inspect 返回 Restore Plan、备份完整性、格式迁移、目标项目、回退点和覆盖影响。Restore 默认创建新项目；覆盖模式必须传入额外确认 token，并在原子替换前创建可恢复回退点。

## 9. 后台任务契约

### 9.1 `TaskDescriptor`

| 字段 | 含义 |
| --- | --- |
| `task_id/task_type` | 稳定任务标识和类型 |
| `state` | `QUEUED/RUNNING/CANCELLING/CANCELLED/COMPLETED/FAILED` |
| `stage` | 任务类型定义的稳定阶段码 |
| `progress` | 可计算时为 0-100；不可计算时为空并显示阶段 |
| `input_revision/profile_version/rule_version` | 固定输入 |
| `cancellable` | 当前阶段是否可安全取消 |
| `result_ref` | 成功结果引用 |
| `error` | 失败时 ErrorDetail |
| `created_at/started_at/finished_at` | 本地任务时间 |

### 9.2 任务规则

1. 任务不得持有页面内存对象作为唯一输入；必要输入必须可由固定修订和任务参数重建；
2. 任务进入原子提交阶段后 `cancellable=false`；取消请求不得伪装成已经取消；
3. 应用重启后，未完成任务根据任务类型标记 failed、cancelled 或由 RecoveryScanner 恢复，不假设所有任务自动续跑；
4. Task 完成通知可以轮询、进程内订阅或本地流实现，传输方式不在本契约冻结；
5. 任务结果和临时文件的保留策略在持久化契约中定义。

## 10. 页面状态映射

| API 结果 | 页面状态 |
| --- | --- |
| Query 开始/成功/失败 | `loading/ready/error` |
| Command 候选未提交 | `preview`，不属于 API committed 状态 |
| Command 处理中 | `submitting` |
| CommandResult=BLOCKED | `blocked`，保留候选输入 |
| CommandResult=COMMITTED | `committed`，采用 committed_revision |
| PERSISTENCE_FAILED | `save-failed`，显示最近耐久 revision |
| Task=RUNNING/CANCELLING | `running/cancelling` |
| Text revision 不匹配 | `text-stale` |
| Validation revision 不匹配 | `validation-stale` |
| Snapshot/Baseline revision | `readonly-snapshot/readonly-baseline` |

## 11. 错误码

### 11.1 通用与并发

| 错误码 | 含义 | 直接重试 |
| --- | --- | --- |
| INVALID_ARGUMENT | 请求字段或组合不合法 | 否，修改输入 |
| NOT_FOUND | 稳定标识不存在或不属于目标聚合 | 否，刷新上下文 |
| CURSOR_EXPIRED | 查询游标或读取快照已失效 | 是，从首页重查 |
| IDEMPOTENCY_MISMATCH | command_id 已用于不同请求摘要 | 否，修复调用方 |
| REVISION_CONFLICT | base_revision 不是当前可写修订 | 否，刷新后重放意图 |
| RULE_VERSION_CONFLICT | Profile/规则版本不匹配 | 否，刷新规则资产 |
| READ_ONLY_REVISION | 对 Snapshot/Baseline 发起写入 | 否，创建草稿 |
| RESOURCE_BUSY | 同一 Model 正在执行冲突写事务 | 是，退避后重试 |

### 11.2 领域、规则和文本

| 错误码 | 所有者 | 含义 |
| --- | --- | --- |
| DOMAIN_REJECTED | M04 | 公共核心不变量拒绝 |
| PROFILE_FORBIDDEN | M06 | Profile 禁止能力或组合 |
| PROFILE_ASSET_MISSING | M06 | Profile、规则、符号或语法资产不完整 |
| VALIDATION_BLOCKED | M07 | 提交、转换或基线门槛阻断 |
| TEXT_GENERATION_BLOCKED | M08 | 无法生成合法 OPL/OPT |
| EVIDENCE_NOT_READY | M07/M09 | 符合性或基线证据缺失/过期 |
| BASELINE_BLOCKED | M09 | 目标修订不满足基线条件 |

### 11.3 持久化、格式和任务

| 错误码 | 所有者 | 含义 |
| --- | --- | --- |
| PERSISTENCE_FAILED | M12 | 原子持久化失败，原提交未生效 |
| FORMAT_VERSION_UNSUPPORTED | M10 | 包版本无受支持读取器或迁移路径 |
| IMPORT_INVALID | M10 | 包结构、引用、Profile 或语义无效 |
| PACKAGE_INTEGRITY_FAILED | M10 | 清单、长度或摘要校验失败 |
| IO_SECURITY_REJECTED | M10/M12 | 路径、大小、文件数、压缩比或内容安全拒绝 |
| EXPORT_FAILED | M10/M12 | 导出未完成且无正式目标文件 |
| BACKUP_FAILED | M10/M12 | 备份未完成或清单无效 |
| RESTORE_FAILED | M10/M12 | 恢复未提交，原项目保持不变 |
| TASK_NOT_CANCELLABLE | M12 端口 | 当前阶段不能安全取消 |
| TASK_FAILED | M12 端口 | 任务执行异常，详见 diagnostic_id |

若最终采用 HTTP，状态码只作为传输映射，不能替代上述业务错误码；映射在 OpenAPI 阶段冻结。

## 12. 安全边界

1. 若采用本地 HTTP，只监听 loopback，并校验允许的本地 Origin/Host；写操作必须具备本地跨源请求防护；
2. 任何 API 都不得返回应用密钥、令牌、完整堆栈或无必要的敏感本地路径；
3. 文件路径只允许由受控文件选择结果或配置目录产生，API 不接受任意路径穿越；
4. 导入、恢复和导出参数执行大小、格式、目标位置和覆盖策略校验；
5. 没有账号体系不构成取消本地安全校验的理由。

## 13. 验收映射

| 契约面 | 需求/页面 | 验证重点 |
| --- | --- | --- |
| 命令幂等和 revision | FR-EDIT-*、FR-VER-001、NFR-REL-003 | 重放同命令不重复，旧 revision 不覆盖 |
| 图文原子提交 | FR-TEXT-*、NFR-REL-001~002 | 成功返回同 revision；失败无部分结果 |
| 页面主动作 | P01-P06、OV01-OV11 | 每个事件有操作、守卫、结果和错误 |
| 完整画布候选 | CAP-ELEM-004、CAP-ISO-PROC/CTRL/STRUCT | option 结构、端点归一化、失效和不可用原因 |
| State/Fact 命令 | FR-EDIT-001~011、完整画布专题设计 | State 非 Element、fan 单 Fact、Control 组合、失败无部分 Revision |
| 基线 | FR-VER-004~006、FR-ASSET-003 | 证据 current、无阻断、不可变 |
| 导入恢复 | FR-IO-001~004、FR-LOCAL-005 | 先 Inspect/Plan，后原子 Commit |
| 后台任务 | NFR-PERF-004、页面 task states | 固定输入、过期隔离、取消阶段明确 |
| 本地安全 | NFR-SEC-002~006 | loopback、跨源、路径和敏感信息边界 |

## 14. 事实与建议

### 14.1 已确认事实

1. 首期为本地模块化单体，不需要远程控制面或用户授权 API；
2. M01 只调用应用用例，M12 不直接暴露给页面；
3. 正式语义写操作使用 command_id、base_revision、Profile 和规则版本；
4. 导入、转换、基线和恢复都需要预检/证据与显式提交；
5. 当前工作区 OpenAPI 已包含 `base_fact_capability_ref`、封闭 `AllowedModifier` 和 State/Fact command union，Revision 0.1 Schema 已包含 Fact `modifiers[]`；这不等于 0.2 机器发布、完整 handler、兼容 reader 或 roundtrip 已验收。

### 14.2 冻结实现约束

1. 操作编号和本文应用语义是后续 OpenAPI/进程内接口的稳定来源；
2. 当前发布使用本地 HTTP `/api/v1`、生成 DTO、分页查询与查询加 SSE；未映射操作保持传输无关，直到独立开发包补充 OpenAPI；
3. 完整画布逻辑和 0.2 目标机器契约由第 7.2 节及全量冻结基线第 6 章冻结；DEV-CANVAS-00 必须形成版本化 OpenAPI、generated client 和正反 contract test，不得手写分叉 DTO；
4. 机器扩展必须保留 P0 客户端兼容或发布明确的新 schema/API 版本；字段已进入草案不等于兼容性和生成结果已验证；
5. 查询聚合可以在真实浏览器和大图性能测试后优化，但不得改变 revision/binding/freshness、分页和错误语义；需要改变 payload 时必须重新关闭设计门并升版。


### 草稿 V2 子树删除

仅 Journaled Draft V2 的命令增加 `DELETE_CONTEXT`，旧 Revision 删除命令保持原范围。`scope.context_id` 为当前活动图，`scope.selection_id` 为待删除子图；封闭 payload 仅含 `context_id`（必须等于 selection）及 `impact_token`。

`capabilities` 返回该命令的独立候选分支，包含 `context_impact`（当前 input_token、目标图、幸存 parent_context_id、完整 context_ids、counts 与 blockers）和绑定 query/option/impact 的 token。根图没有删除候选；任何外部 occurrence、关系、所属引用、状态呈现或细化边依赖都会使候选 disabled。提交在同一 Journal 事务中重新计算计划及授权，伪造、过期和阻断请求零写入，重复 command_id 沿用既有幂等收据。

删除子树全部出现位置和布局及 OWNED 语义目标、所属特征/状态/关系，保留父图细化元素及历史修订；不自动重写跨图引用。成功后客户端使用候选 parent_context_id 回读，避免读取已删除的当前图。删除所有细化图后正文保留原有 0.3/0.4；Journal 回放逐条验证相邻编辑的 schema_version 转换，0.2→0.3 首次升级必须包含细化边；方法分类允许 0.2/0.3→0.4，不允许降级。详见[规格](../../specs/opm-delete-context-feature-task-spec.md)。

### 2026-10-03 固定版本校验任务兼容混合保存

`API-VAL-001` 对已有固定版本执行当前支持的模型检查，任务、幂等收据和操作记录同事务登记。旧版本保留 `revision_document` 外键；混合保存版本先验证 `draft_savepoint` 及内容完整性，旧外键列使用允许的 NULL，完整输入版本和服务端项目/模型身份存于既有任务 `request_json`。TaskDescriptor.input_revision 和查询 meta.read_revision 始终恢复实际输入，不能使用初始版本代替。永久删除模型时按服务端记录的模型身份清理对应任务，保留其他模型任务。

新任务以忽略 request_id 后的命令内容作为幂等身份，同命令重试返回同任务；旧收据仍支持原请求内容重放。任务 COMPLETED 表示检查执行完成，不等于完整规则覆盖。检查复用活动草稿的基础结构、状态归属和受支持关系的 OPL/Trace 规则，问题明细及 coverage_state=INCOMPLETE 持久化在现有 result_json 内；本轮不新增任务结果接口。

创建基线要求零阻断、COMPLETE 和可核对的问题明细。旧任务仅有汇总数且曾将零结构问题标成 COMPLETE，不能继续作为完整证据；当前有限覆盖任务同样不能放行基线。已存在的历史及基线不作回写。该修复没有 API/schema 或数据库迁移，重启耐久性和实际浏览器证据见[校验任务修复规格](../../specs/opm-validation-task-persistence-bugfix-task-spec.md)。


## 2026-10-03 操作历史只读契约

新增 `POST /api/v2/projects/{project}/models/{model}/draft/operation-history`，请求 `OperationHistoryRequest`：`request_id`、`revision`（`HEAD` 或精确保存版本）、`before`（首屏 null，后续使用不透明游标）。响应 `OperationHistoryResult` 包含项目/模型/请求/版本身份及 `data.items`、`data.next_before`；每页最多 100 条，按时间与记录 ID 倒序。错误沿用 V2 错误体和本地会话守卫，跨模型或未知版本返回 NOT_FOUND，非法/跨作用域游标返回 INPUT_INVALID。

新编辑详情由应用层捕获，存储层与 Journal/收据在同一事务内写入既有 `idempotency_record` 的 `DRAFT_OPERATION_HISTORY_V1` 内部命名空间，`result_revision_id` 留空，避免新保存版本触发旧 Revision 外键。详情包含 draft/seq、当时说明与 OPD 名；同 ID 重放复用收据，不重复历史。自动保存仅在保护脏草稿时追加历史，与检查点事务原子提交。手动保存及固定版本直接读取不可变收据，不改写收据格式。

版本截止同时使用 captured_seq、保存时点与产生版本的第一条收据顺序，排除同毫秒/同 seq 的后续无变化操作。历史不依赖会被压缩的 Journal。旧编辑以真实收据降级显示并标记缺少详情；旧 Operation Record 只显示可证实的状态，不补造名称。无 schema、迁移、配置或依赖变化。

### OPD 架构层分类及细化追溯（2026-10-03）

`API-MTH-002` 的当前切片是 OPD 分类，使用 V2 `commands` 的 `UPDATE_ARCHITECTURE_CLASSIFICATION`，不新增独立写入通道。payload 为 `{context_id, architecture_level}`，level 为 `MISSION/FUNCTION/PRODUCT/null`；null 清除字段。scope.context_id 等于 payload.context_id，selection_id 为 null，endpoints 为空。capabilities 返回封闭的 `METHOD_METADATA` 候选，只含当前图及 token 授权，不带语言 capability、symbol、template。继续执行本地会话检查、exact token、幂等收据、Journal 和操作历史原子事务，失败零写入，无变化不推进编辑序号。历史界面只读。

语义文件 0.4 在 Context 增加可选 `architecture_level`，继承 0.3 的 refinement_edges（即使为空）。旧 0.2/0.3 schema 不改，首次设置升级到 0.4，清除或删除子图不会降级。使用独立 `opm-save-content-v2-method.schema.json` 校验，摘要仍为 SaveContentDigest/2（同一内容集合、几何编码和 JCS 算法，Context 的新增字段属于内容）；旧文档摘要不变，无数据库迁移。OPD JSON 1.0 可迁移 0.4，旧客户端必须明确拒绝不支持版本，不能有损回写。

`method-summary` 在原 processes 外返回全模型 contexts（context_id/name/architecture_level，未分类为 null）及 refinements（父图、子图、展开元素、名称和种类）。架构方法面板设置当前图分类，并提供模型清单、父子细化导航及父图元素定位；分类不按名字推断、不自动继承、不限制父子分类顺序。细化追溯不能代表 FR-METHOD-002 的全部架构输入/生成关系。规格：`specs/opm-method-classification-feature-task-spec.md`。


### 同模型 OPD 架构关联（2026-10-03）

FR-METHOD-002 的本切片使用 V2 `commands` 新增 `CREATE_ARCHITECTURE_LINK` 与 `DELETE_ARCHITECTURE_LINK`，复用 `METHOD_METADATA` 授权、草稿 token、幂等收据和历史事务。新增 payload 为 `{context_id,target_context_id,kind}`，当前图为源；种类 `INPUT/GENERATES/TRACE` 分别表示提供输入给、生成、追溯到。删除 payload 为 `{context_id,link_id}`，当前图必须为任一端。scope.context_id 等于 payload.context_id，selection_id 为 null，endpoints 为空。拒绝自连、缺失目标、未知种类或关联、错误作用域/授权和过期 token；重复源/目标/种类无变化，允许反向关联及回环。不强制架构层或类别顺序。

语义 0.5 的 Context 可选 `architecture_links` 数组，单条 `{link_id,target_context_id,kind}`，源为所属 Context。0.2–0.4 冻结，独立 `opm-save-content-v2-trace.schema.json` 校验，摘要仍为 SaveContentDigest/2，无数据库迁移。首次新增升级；删除、分类修改和后续普通编辑保留正文 0.5。方法记录不生成 Fact、画布连线或 OPL。

`method-summary.data.architecture_links` 必填，空为 []，返回全模型关联及 source_context_id，支持双向查看和导航。历史源使用该固定版本的关联，不读取后续草稿。删除子树时，幸存 OPD 指向子树的关联作为外部依赖阻止删除；解除关联后可删，子树内部关联随子树删除。OPD JSON 1.0 支持 0.5，双向关联和语义依赖闭包迭代到固定点，回环可终止；迁移保留关联身份、方向与种类。旧客户端拒绝未知版本，禁止丢弃字段回写。本切片只支持同模型，不含自动推断、跨模型关联或 ISO 符合性结论。规格：`specs/opm-method-trace-feature-task-spec.md`。
