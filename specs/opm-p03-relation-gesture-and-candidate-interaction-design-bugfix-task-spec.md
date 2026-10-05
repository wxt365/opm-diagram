# Spec: P03 关系手势与统一候选交互设计修正

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `frontend-vue`
- `testing`

三个 playbook 不可拆分：本任务同时修正关系目录公共 DTO、P03/X6 交互状态、候选 RenderSpec 和跨层验收。

## 1. 问题、复现与根因

当前实现可稳定复现以下设计外行为：

1. `WorkbenchView.vue` 同时显示“创建过程关系”和“创建结构关系”，两者都调用无 family/capability 参数的 `armRelationCreation()`；
2. Runtime 关系目录显示 16/8/10 项，但目录项没有进入关系创建或 Control 更新的动作；
3. `chooseRelationCandidate()` 只让 Consumption 和 Structural 进入候选表单/预览，其他 Procedural option 会立即调用 `CREATE_FACT`；
4. `OpdCanvas.vue` 只显示通用虚线候选，没有源到目标拖线事件，也没有按最终 Capability 生成临时标准符号；
5. `RelationCatalogItem` 只有 `symbol_id`，缺少 interaction mode、精确 symbol asset ref 和端点摘要。

根因是既有设计冻结了 16/8/10 目录、Runtime option 和“预览与提交隔离”原则，但仍保留 split-button 表述，未冻结目录项到动作的机器映射、X6 拖线事件、全部 26 个基础 Capability 的统一预览门和 preview/committed RenderSpec 隔离。既有测试只验证目录计数、候选查询与部分 Consumption/Structural 路径，因此不能发现“目录不可进入”和“option 直接提交”。

## 2. 目标与用户可观察结果

1. 工具栏只保留一个“关系”入口，打开 Runtime 驱动目录；
2. Procedural 16 项和 Structural 10 项从目录进入 `CREATE_FACT` 拖线流程；
3. Control 8 项只能在选中已有 Procedural Fact 时进入 `UPDATE_FACT` 附加流程；
4. 节点拖线只产生候选意图；Runtime 查询和提交期间使用最终 Capability 标准符号的临时 RenderSpec；
5. 取消、空白释放、无候选和校验失败均不产生 Revision、Fact、Occurrence、OPL/Trace 或 capture anchor；
6. 基础关系由 `opm-p03-direct-relation-commit-interaction-task-spec.md` 冻结为无自由参数时直接提交；需要参数和 Control 仍通过显式编辑提交，随后按 committed Revision 重读。

## 3. 非目标

- 本设计任务不修改产品代码、OpenAPI、Schema、测试、依赖、Profile/Rule/Grammar/Symbol 资产或 SQLite。
- 不允许自由连线、通用箭头、前端端点规则表或按拖线方向推断规范角色。
- 不把 Control 建模为第二 Fact、第二关系、第二 occurrence 或第二 capture anchor。
- 不在候选期生成正式 Text Artifact、OPL Sentence、Token 或 Trace。
- 不改变 16/8/10 Capability 的语义、ID、句式、marker、fan 或 Control Modifier 表示。

## 4. 允许与禁止范围

允许修改：

- `docs/design/opm-modeling-workbench-component-interaction.md`
- `docs/design/opm-opd-node-renderer-architecture.md`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/README.md`
- 本规格与对应 checklist
- 后继实现规格与对应 checklist

禁止修改上述范围外全部文件，尤其 `apps/**`、`services/**`、`scripts/**`、`tests/**`、`docs/contracts/**`、Profile package、SQLite、release root 和 `runtime-data/`。

## 5. 冻结设计

### 5.1 单一关系入口与 Runtime 目录

工具栏只存在一个 `P03-tool-relation` 按钮。点击只打开 `P03-relation-catalog-menu`，不选择默认 Capability、不进入拖线、不提交命令。目录固定显示 Runtime 返回的 `16 Procedural / 8 Control / 10 Structural`，可以有“最近使用”视图，但最近项仍回到同一目录项动作，不得成为绕过确认的快捷提交。

`API-CAT-001` 增加可选 `selection_id`。`RelationCatalogItem` 后继机器契约固定增加：

```text
interaction_mode = CREATE_FACT | UPDATE_SELECTED_FACT
symbol_descriptor = { id, version, digest }
endpoint_summary = {
  min_endpoints,
  max_endpoints?,
  roles[] = {
    role,
    target_kinds[],
    min_occurs,
    max_occurs?,
    state_qualification_allowed
  }
}
```

其中 Procedural/Structural 固定为 `CREATE_FACT`，Control 固定为 `UPDATE_SELECTED_FACT`。`max_endpoints` 缺失表示 Profile 允许继续添加端点，不得用 `0`、负数或 UI 默认值表示无上限。目录项必须展示 `display_name`、`symbol_descriptor` 渲染的标准缩略图、`endpoint_summary`、`enabled` 和全部 `reason_codes`。

`enabled` 只表示当前 Revision/Profile/binding/selection 是否允许进入对应交互，不代替端点候选授权：

- Procedural/Structural 在当前草稿、Context 和资产可用时可进入拖线；
- Control 只有 `selection_id` 指向当前 Context 内已有 Procedural Fact，且 Runtime 至少返回一个匹配的 `UPDATE_FACT` option 时可进入；否则返回 `CONTROL_REQUIRES_BASE_FACT` 或更高优先级的现有稳定 reason；
- 端点选择后必须重新调用 `API-EDT-001(intent=CREATE_FACT, endpoint=...)`；前端不得从 `endpoint_summary` 推断最终合法性。

### 5.2 基础关系拖线状态机

唯一状态机为：

```text
idle
  -> relation-armed
  -> dragging(source occurrence, pointer)
  -> endpoint-selected
  -> candidate-filtering
  -> candidate-preview
  -> confirmed | cancelled
```

扩展转换：

- `relation-armed -> dragging`：在可选节点按下；记录 exact source occurrence ID；
- `dragging -> dragging`：指针移动，只更新临时几何；
- `dragging -> endpoint-selected`：释放到节点，记录 exact target occurrence ID；
- `dragging -> cancelled`：释放到空白、装饰 Cell、不可映射 Cell或按 Escape；
- `endpoint-selected -> relation-armed`：当前端点数小于目录项 `endpoint_summary.min_endpoints` 时继续选择；该判断只控制何时发起查询，不判定端点是否合法；
- `endpoint-selected -> candidate-filtering`：达到 `min_endpoints` 后，应用适配层用当前 Projection 将 occurrence ID 映射为 target locator，并按用户选择顺序查询 Runtime；
- `candidate-filtering -> candidate-preview`：存在用户必填自由参数、多个匹配 option 或直接提交失败时，显示标准候选和参数编辑；
- `candidate-filtering -> confirmed`：唯一匹配 option 且不缺少用户必填自由参数时，提交前复核 exact option 并直接创建；
- `candidate-filtering -> cancelled`：Runtime 返回零候选或用户取消；
- `candidate-preview -> relation-armed`：fan/多端点选择“继续添加端点”，保留已验证端点并继续手势；
- `candidate-preview -> candidate-filtering`：端点集合、State qualification 或会改变 option 集合的参数发生变化；
- `candidate-preview -> confirmed`：Runtime 复核当前 Revision/端点/option 后，参数编辑提交或失败重试成功；
- 任意非 committed 状态 `-> cancelled`：取消并删除全部临时 Cell；
- `confirmed/cancelled -> idle`；连续创建只能显式返回同一 Capability 的 `relation-armed`。

Self-invocation 允许同一个 Process occurrence 连续成为两个用户选择端点；不能用两个同名 Process 代替。State-specified endpoint 记录 exact State occurrence，不回退 owner。fan 端点按用户选择序列上送，但最终 role、ordinal、方向和 State qualification 全部采用 Runtime `normalized_endpoints`。

### 5.3 X6 意图事件

X6 只发出以下四类事件：

```text
relation-drag-start {
  source_occurrence_id,
  pointer: { x, y }
}
relation-drag-move {
  source_occurrence_id,
  pointer: { x, y }
}
relation-endpoint-selected {
  source_occurrence_id,
  target_occurrence_id,
  pointer: { x, y },
  continue_collection,
  open_parameters
}
relation-cancelled {
  reason: EMPTY_RELEASE | INVALID_CELL | ESCAPE | TOOL_CHANGED | CONTEXT_CHANGED
}
```

`continue_collection/open_parameters` 的唯一键盘映射和直接提交语义由后继 `opm-p03-direct-relation-commit-interaction-task-spec.md` 冻结；X6 仍不得解释 Capability、端点角色或命令。

事件使用画布本地坐标和 exact occurrence ID；不得携带推断后的 role、direction、Capability、Fact ID 或 Command payload。X6 adapter 不调用 HTTP、不构造 `CREATE_FACT/UPDATE_FACT`，也不修改 committed Projection。

### 5.4 统一基础关系候选预览

16 个 Procedural 和 10 个 Structural 全部遵循：

```text
端点手势 -> Runtime options -> 选择 Capability/填写参数
-> RelationPreviewRenderSpec -> 确认 -> CREATE_FACT
```

`RelationPreviewRenderSpec` 与 committed `RelationRenderSpec` 是不同类型。preview 固定只包含 `candidateId/capabilityId/symbolDescriptor/normalizedEndpoints/cells/primaryCellId/ephemeral=true`，禁止包含 `relationId`、`occurrenceId`、`captureAnchor` 或 committed layer key。所有 preview Cell 使用 candidate namespace，进入独立 candidate layer。

preview 必须调用所选 Capability Definition 的 preview 路径并复用 option 的 exact `symbol_descriptor`、规范端点、label slot、marker、fan junction 和 Control annotation 规则；禁止使用通用虚线代替最终符号。label、duration、direction、completeness 和 modifier 修改立即以同一 option 重建 preview；端点集合变化必须重新查询 Runtime。前端只能按 option 的 `required_fields/allowed_modifiers` 做形状和值域检查，最终语义仍由确认提交时的 Runtime 校验决定。preview 构建失败使用 `OPD_RELATION_PREVIEW_RENDER_SPEC_INVALID`，保留输入、零提交。

确认前再次查询当前 Revision 的 option，并逐字段匹配 `capability_query_id/option_id/capability_ref/normalized_endpoints/symbol_descriptor/template_family/rule_refs/expires_with_revision`。只有匹配成功才提交一次 `CREATE_FACT`。提交失败保留输入与 preview；提交成功后删除 candidate layer，等待 committed Projection 建立正式 RenderSpec。

### 5.5 Control 附加预览

Control 始终遵循：

```text
选中 committed Procedural Fact
-> Runtime UPDATE_FACT options
-> ControlPreviewDecorator
-> 确认 -> UPDATE_FACT
```

Control preview 以现有 committed Procedural RenderSpec 为只读 base，在 candidate layer 叠加临时 `e/c` annotation；不得修改 base Cell、创建第二条 edge、增加 committed capture anchor 或生成第二 Fact identity。确认前复核 selected Fact、基础 Capability、两个受控 Modifier、option 和 Revision；成功后仍由新 Projection 的正式 Control Decorator 接管。

### 5.6 零提交与文本边界

以下路径必须保持 head Revision 不变，且零新增 Fact、Occurrence、Relation Group、Text Artifact、OPL Sentence、Token、Trace 和 capture anchor：打开/关闭目录、armed、拖动、释放空白、非法 Cell、零候选、候选切换、参数修改、preview、取消、Runtime 查询失败和提交前校验失败。

候选界面可以显示 Capability 名称、端点角色和模板族标识，但不得调用正式 OPL Generator 或把推测文本标为 OPL。只有 `CREATE_FACT/UPDATE_FACT` 原子提交成功后，Runtime 才生成并持久化正式 OPL/Trace。

## 6. 验收

- `REL-GESTURE-DESIGN-01`：单一关系入口与 16/8/10 Runtime 目录、Control 特殊路径冻结。
- `REL-GESTURE-DESIGN-02`：selection-aware Catalog 字段、interaction mode、symbol ref、endpoint summary 和 reason 语义封闭。
- `REL-GESTURE-DESIGN-03`：基础关系拖线状态机、四类 X6 意图和取消边界封闭。
- `REL-GESTURE-DESIGN-04`：二元、fan、Self-invocation 和 State-specified 端点继续选择与 Runtime normalization 封闭。
- `REL-GESTURE-DESIGN-05`：26 个基础 Capability 统一 preview/confirm，禁止 option 直接提交。
- `REL-GESTURE-DESIGN-06`：preview/committed RenderSpec、Control decorator、anchor 和 OPL/Trace 隔离封闭。
- `REL-GESTURE-DESIGN-07`：取消、空白、无候选、参数失败和提交失败的零提交/输入保留语义封闭。
- `REL-GESTURE-DESIGN-08`：五份设计、API 语义、handoff、索引、基线和后继实现规格同步且无活动冲突。

## 7. 验证与回滚

本设计任务运行 Markdown 本地链接、活动术语冲突、状态/事件/字段枚举、围栏和 `git diff --check`；`npm run contract:validate` 只证明未破坏当前机器契约，不证明后继 DTO 已实现。回滚仅回退本规格允许的文档。若回滚导致 split-button、直接提交或 preview identity 歧义恢复，关系实现门必须回到 `BLOCKED_BY_DESIGN`。
