# OPD 节点定义与渲染注册架构

文档版本：`v1.6`

文档状态：`FROZEN_INCLUDED`；前端节点定义、注册、渲染和扩展边界冻结，实现待独立任务验收

更新时间：2026-09-05

## Task Type

- `feature`

## 1. 目的与结论

本文冻结 P03 OPD 画布中 Object、Process、State、Attribute、Operation 和关系的前端代码组织、渲染契约、注册方式、编辑器边界、影响隔离及迁移规则。

冻结结论：

1. 每种内置节点类型使用独立 `*.definition.ts` 文件，但同类型的每个画布实例不创建独立代码文件。
2. 节点共享一个类型安全基础接口，不使用 `BaseNode.vue` 或面向对象多层继承作为主扩展机制。
3. 类型差异通过 Definition 实现和无状态组合函数表达；统一 X6 adapter 管理 Graph 与 Cell 生命周期。
4. 节点定义注册表是内部编译期装配，不是允许 Profile 或第三方执行代码的插件系统。
5. 正式语义仍来自服务器 Revision；Definition、RenderSpec 和 X6 Cell 都不是第二事实源。
6. 本文中的 `Node` 仅指 OPD 画布节点；它不改变领域分类，State 与 Feature 仍不是 OPM Element。

## 2. 既有约束

本架构继承以下冻结边界：

- `Semantic Model -> Context Projection -> Canvas ViewModel` 单向生成；
- X6 Cell 不进入 Revision，也不得作为 Command payload 的事实来源；
- Symbol Catalog 决定符号语义，Definition 不复制 Capability、marker 或 Profile 规则；
- 所有语义写入先查询 `CommandCapabilityQuery/Option`，提交后以 committed Revision 重读；
- selection、hover、Finding、viewport 和候选预览属于本地视图状态；
- Profile、Rule、Grammar 和 Symbol 包只能提供声明式数据，禁止执行前端代码。
- 构造删除由右键或键盘发出带 `POINTER|KEYBOARD` 来源的 `construct-action-requested`，再以 exact selected occurrence 查询 Runtime impact option；右键菜单项直接提交，键盘按固定优先级直接提交且不显示菜单。X6 不得直接删除 committed Cell、推断语义 target 或构造 cascade。右键空白、未知或装饰 Cell 不拦截原生菜单。Control annotation 的移除仍是基础 Fact 的 `UPDATE_FACT`，不是 relation Cell 删除。

## 3. 分层与数据流

```text
Context Projection
        |
        v
NodeDefinitionRegistry / RelationDefinitionRegistry
        |
        v
NodeRenderSpec / RelationRenderSpec
        |
        v
共享 X6 Adapter
        |
        v
Committed / Candidate / Selection / Finding Layers

用户交互 -> Editor/Interaction Adapter -> 用户意图
         -> Workbench application adapter -> Capability Query/Command
         -> committed Revision -> 新 Projection -> 增量调和
```

各层责任：

| 层 | 唯一责任 | 禁止拥有 |
| --- | --- | --- |
| Projection adapter | 将 API Projection 转换为类型安全 `OpdNode/OpdRelation` | X6 实例、DOM、领域判定 |
| Definition | 按 kind 和 Symbol Descriptor 生成纯 RenderSpec | Graph 生命周期、HTTP、Pinia 正式状态、Profile 合法性 |
| Registry | kind 到唯一 Definition 的封闭映射与完整性检查 | 运行时目录扫描、远程加载、fallback |
| X6 adapter | RenderSpec 到 Cell 的创建、更新、删除和事件桥接 | OPM 语义规则、Command 审批、Revision 写入 |
| Editor | 候选输入、焦点、键盘和失败保留 | 直接改 Projection、X6 label 或持久化数据 |
| Workbench application adapter | 查询 Capability、提交 Command、按 committed Revision 重读 | 从 DOM/X6 反推语义 |

## 4. 目标目录结构

```text
apps/web/src/modules/workbench/opd/
├── core/
│   ├── node-definition.ts
│   ├── node-render-spec.ts
│   ├── node-definition-registry.ts
│   ├── relation-definition.ts
│   ├── relation-render-spec.ts
│   ├── relation-definition-registry.ts
│   ├── x6-node-adapter.ts
│   ├── x6-relation-adapter.ts
│   └── render-context.ts
├── nodes/
│   ├── object.definition.ts
│   ├── process.definition.ts
│   ├── state.definition.ts
│   ├── attribute.definition.ts
│   └── operation.definition.ts
├── relations/
│   ├── procedural/
│   │   ├── consumption.definition.ts
│   │   ├── result.definition.ts
│   │   ├── effect.definition.ts
│   │   ├── agent.definition.ts
│   │   ├── instrument.definition.ts
│   │   ├── state-specified-consumption.definition.ts
│   │   ├── state-specified-result.definition.ts
│   │   ├── input-output-specified-effect.definition.ts
│   │   ├── input-specified-effect.definition.ts
│   │   ├── output-specified-effect.definition.ts
│   │   ├── state-specified-agent.definition.ts
│   │   ├── state-specified-instrument.definition.ts
│   │   ├── invocation.definition.ts
│   │   ├── self-invocation.definition.ts
│   │   ├── overtime-exception.definition.ts
│   │   ├── undertime-exception.definition.ts
│   │   └── procedural-render-helpers.ts
│   ├── control/
│   │   ├── transforming-event.decorator.ts
│   │   ├── enabling-event.decorator.ts
│   │   ├── state-specified-transforming-event.decorator.ts
│   │   ├── state-specified-enabling-event.decorator.ts
│   │   ├── transforming-condition.decorator.ts
│   │   ├── enabling-condition.decorator.ts
│   │   ├── state-specified-transforming-condition.decorator.ts
│   │   ├── state-specified-enabling-condition.decorator.ts
│   │   └── control-decoration-helpers.ts
│   └── structural/
│       ├── unidirectional-tagged.definition.ts
│       ├── unidirectional-null-tagged.definition.ts
│       ├── bidirectional-tagged.definition.ts
│       ├── reciprocal-tagged.definition.ts
│       ├── aggregation-participation.definition.ts
│       ├── exhibition-characterization.definition.ts
│       ├── generalization-specialization.definition.ts
│       ├── classification-instantiation.definition.ts
│       ├── state-specified-characterization.definition.ts
│       ├── state-specified-tagged.definition.ts
│       └── structural-render-helpers.ts
├── editors/
│   ├── ElementNameEditor.vue
│   ├── StateEditor.vue
│   └── RelationEditor.vue
├── helpers/
│   ├── feature-node-appearance.ts
│   ├── state-role-appearance.ts
│   └── symbol-descriptor-mapping.ts
└── OpdCanvas.vue
```

文件边界：

1. 五种内置节点各有一个 Definition 文件；Attribute 与 Operation 即使首版视觉相近，也不得合并为一个含条件分支的业务定义文件。
2. 可复用计算放入纯 helper；helper 不保存状态、不访问 Store、不注册事件。
3. 16 个 Procedural 和 10 个 Structural Capability 各有一个 Definition 文件；8 个 Control Capability 各有一个 Decorator 文件。一个文件只导出一个 production Capability 定义，注册键固定为该 `capability_id`。
4. Vue 文件只用于需要 DOM 生命周期的画布容器和编辑器；普通 X6 节点不实现为一个 Vue SFC。
5. `OpdCanvas.vue` 只装配 Graph、registry、adapter、layer 和事件，不保留按节点 kind 绘图的大型条件分支。
6. Control Decorator 组合基础 Procedural RenderSpec 与 `control.capability/control.segment` 注记；它不创建第二个 Fact、occurrence、relation group 或 capture anchor。
7. `*-render-helpers.ts` 和共享 factory 只承载几何、marker、label slot、route、State qualification、fan 和 annotation 等重复算法，不得注册为 production Capability，也不得包含按 16/8/10 全集分派的 `switch`。
8. 仅有参数差异的 Capability 文件允许调用同一 factory，但必须显式绑定自己的 Capability ID、期望 descriptor 身份和 contract fixture；禁止把多个 Capability 合并回一个 production 定义对象。

### 4.1 Capability 与文件唯一映射

Procedural：

| Capability | 独立文件 | 共享算法组 |
| --- | --- | --- |
| `CAP-ISO-PROC-001` | `procedural/consumption.definition.ts` | binary procedural |
| `CAP-ISO-PROC-002` | `procedural/result.definition.ts` | binary procedural |
| `CAP-ISO-PROC-003` | `procedural/effect.definition.ts` | binary effect |
| `CAP-ISO-PROC-004` | `procedural/agent.definition.ts` | enabling procedural |
| `CAP-ISO-PROC-005` | `procedural/instrument.definition.ts` | enabling procedural |
| `CAP-ISO-PROC-006` | `procedural/state-specified-consumption.definition.ts` | state-qualified binary |
| `CAP-ISO-PROC-007` | `procedural/state-specified-result.definition.ts` | state-qualified binary |
| `CAP-ISO-PROC-008` | `procedural/input-output-specified-effect.definition.ts` | state-qualified effect |
| `CAP-ISO-PROC-009` | `procedural/input-specified-effect.definition.ts` | state-qualified effect |
| `CAP-ISO-PROC-010` | `procedural/output-specified-effect.definition.ts` | state-qualified effect |
| `CAP-ISO-PROC-011` | `procedural/state-specified-agent.definition.ts` | state-qualified enabling |
| `CAP-ISO-PROC-012` | `procedural/state-specified-instrument.definition.ts` | state-qualified enabling |
| `CAP-ISO-PROC-013` | `procedural/invocation.definition.ts` | invocation route |
| `CAP-ISO-PROC-014` | `procedural/self-invocation.definition.ts` | invocation loop route |
| `CAP-ISO-PROC-015` | `procedural/overtime-exception.definition.ts` | process exception annotation |
| `CAP-ISO-PROC-016` | `procedural/undertime-exception.definition.ts` | process exception annotation |

Control：

| Capability | 独立文件 | 组合边界 |
| --- | --- | --- |
| `CAP-ISO-CTRL-001` | `control/transforming-event.decorator.ts` | 基础 transforming Fact + `event-e` |
| `CAP-ISO-CTRL-002` | `control/enabling-event.decorator.ts` | 基础 enabling Fact + `event-e` |
| `CAP-ISO-CTRL-003` | `control/state-specified-transforming-event.decorator.ts` | State-specified transforming Fact + `event-e` |
| `CAP-ISO-CTRL-004` | `control/state-specified-enabling-event.decorator.ts` | State-specified enabling Fact + `event-e` |
| `CAP-ISO-CTRL-005` | `control/transforming-condition.decorator.ts` | 基础 transforming Fact + `condition-c` |
| `CAP-ISO-CTRL-006` | `control/enabling-condition.decorator.ts` | 基础 enabling Fact + `condition-c` |
| `CAP-ISO-CTRL-007` | `control/state-specified-transforming-condition.decorator.ts` | State-specified transforming Fact + `condition-c` |
| `CAP-ISO-CTRL-008` | `control/state-specified-enabling-condition.decorator.ts` | State-specified enabling Fact + `condition-c` |

Structural：

| Capability | 独立文件 | 共享算法组 |
| --- | --- | --- |
| `CAP-ISO-STRUCT-001` | `structural/unidirectional-tagged.definition.ts` | tagged binary |
| `CAP-ISO-STRUCT-002` | `structural/unidirectional-null-tagged.definition.ts` | tagged binary |
| `CAP-ISO-STRUCT-003` | `structural/bidirectional-tagged.definition.ts` | tagged binary + dual labels |
| `CAP-ISO-STRUCT-004` | `structural/reciprocal-tagged.definition.ts` | tagged reciprocal |
| `CAP-ISO-STRUCT-005` | `structural/aggregation-participation.definition.ts` | fundamental fan |
| `CAP-ISO-STRUCT-006` | `structural/exhibition-characterization.definition.ts` | fundamental fan + feature grouping |
| `CAP-ISO-STRUCT-007` | `structural/generalization-specialization.definition.ts` | fundamental fan |
| `CAP-ISO-STRUCT-008` | `structural/classification-instantiation.definition.ts` | fundamental fan |
| `CAP-ISO-STRUCT-009` | `structural/state-specified-characterization.definition.ts` | state-qualified structural |
| `CAP-ISO-STRUCT-010` | `structural/state-specified-tagged.definition.ts` | state-qualified tagged |

表中共享算法组不是注册项。每个 production 文件必须导出恰一个与表中 ID 相等的 Definition/Decorator；同一 ID 不得出现在第二个 production 文件。

## 5. 类型安全契约

以下为实现必须保持的逻辑形状；准确 import 和只读集合写法由后继实现规格按现有 TypeScript 规范落盘。

```ts
type BuiltInNodeKind =
  | "object"
  | "process"
  | "state"
  | "attribute"
  | "operation";

interface OpdNodeDefinition<TNode extends OpdNode> {
  readonly definitionId: string;
  readonly kind: TNode["kind"];
  readonly editorKind?: "ELEMENT_NAME" | "STATE";
  buildRenderSpec(node: TNode, context: NodeRenderContext): NodeRenderSpec;
}

interface NodeRenderSpec {
  readonly occurrenceId: string;
  readonly targetId: string;
  readonly kind: BuiltInNodeKind;
  readonly symbolId: string;
  readonly geometry: Readonly<{ x: number; y: number; width: number; height: number; zOrder: number }>;
  readonly appearance: Readonly<NodeAppearance>;
  readonly label: Readonly<NodeLabelSpec>;
  readonly anchors: readonly NodeAnchorSpec[];
  readonly captureAnchor?: string;
}

interface NodeDefinitionRegistry {
  register(definition: OpdNodeDefinition<OpdNode>): void;
  require(kind: BuiltInNodeKind): OpdNodeDefinition<OpdNode>;
  verifyComplete(expectedKinds: readonly BuiltInNodeKind[]): void;
}

type BaseRelationFamily = "PROCEDURAL" | "STRUCTURAL";

interface OpdRelationDefinition<TRelation extends OpdRelation> {
  readonly definitionId: string;
  readonly capabilityId: string;
  readonly family: BaseRelationFamily;
  buildRenderSpec(relation: TRelation, context: RelationRenderContext): RelationRenderSpec;
  buildPreviewRenderSpec(candidate: RelationPreviewInput, context: RelationRenderContext): RelationPreviewRenderSpec;
}

interface OpdControlDecoratorDefinition {
  readonly definitionId: string;
  readonly controlCapabilityId: string;
  decorate(
    base: RelationRenderSpec,
    modifier: ControlModifierProjection,
    context: RelationRenderContext,
  ): RelationRenderSpec;
}

interface RelationRenderSpec {
  readonly relationId: string;
  readonly occurrenceId: string;
  readonly family: BaseRelationFamily;
  readonly symbolId: string;
  readonly cells: readonly RelationCellSpec[];
  readonly primaryCellId: string;
}

interface RelationPreviewRenderSpec {
  readonly candidateId: string;
  readonly capabilityId: string;
  readonly symbolDescriptor: AssetReference;
  readonly normalizedEndpoints: readonly NormalizedEndpoint[];
  readonly cells: readonly RelationCellSpec[];
  readonly primaryCellId: string;
  readonly ephemeral: true;
}

interface RelationDefinitionRegistry {
  register(definition: OpdRelationDefinition<OpdRelation>): void;
  require(capabilityId: string): OpdRelationDefinition<OpdRelation>;
  verifyComplete(expectedCapabilityIds: readonly string[]): void;
}

interface ControlDecoratorRegistry {
  register(definition: OpdControlDecoratorDefinition): void;
  require(controlCapabilityId: string): OpdControlDecoratorDefinition;
  verifyComplete(expectedControlCapabilityIds: readonly string[]): void;
}
```

契约规则：

1. Node 的 `definitionId/kind`、基础 Relation 的 `definitionId/capabilityId`、Control Decorator 的 `definitionId/controlCapabilityId` 在同一生产构建内分别唯一且不可变。
2. `buildRenderSpec` 是确定性纯映射；相同 Projection、Symbol binding 和 RenderContext 必须产生深相等结果。
3. Node/Relation RenderSpec 不包含 X6 Cell、Vue ref、DOM node、Store、HTTP client、Command payload 或函数引用。
4. `occurrenceId` 是 committed cell 稳定键；`targetId` 是语义目标身份，二者不得互换。
5. `captureAnchor` 只承接既有受控 capture 约定；每个 committed relation group 只有 `primaryCellId` 对应 Cell 可以承载 relation capture anchor，其他 segment、junction 和装饰 Cell 不得冒充 committed occurrence。
6. Definition 可以声明编辑器种类，但是否允许编辑必须消费 Runtime 返回的当前 Capability Option、readonly 和 Revision 状态，不能由 Definition 单独决定。
7. Control Decorator 返回值必须逐字段保持基础 RenderSpec 的 `relationId/occurrenceId/family/symbolId/primaryCellId`，只允许在既有 relation cells 上增加 Descriptor 允许的 Control annotation；不允许增加 committed relation group 或 capture anchor。
8. 未知 kind/Capability、重复注册、缺失内置定义或非法 RenderSpec 必须停止该 Projection 的画布接纳，禁止降级成通用矩形或 family renderer。
9. `RelationPreviewRenderSpec` 与 `RelationRenderSpec` 不存在继承或类型兼容关系；preview 禁止出现 `relationId/occurrenceId/captureAnchor`，全部 Cell 使用 candidate namespace且只能进入 candidate layer。
10. preview 与 committed 路径复用同一 Capability Definition 和 exact Symbol Descriptor；参数变化重建 preview，不能用通用虚线冒充已选 Capability 的标准符号。
11. Control preview decorator 只在 candidate layer 叠加 annotation，不修改输入的 committed RenderSpec；正式 Control decorator 仍遵守第 7 条 identity 不变量。

内部稳定诊断码固定为：

| 诊断码 | 条件 |
| --- | --- |
| `OPD_NODE_DEFINITION_DUPLICATE` | 同一 kind 或 definitionId 重复注册 |
| `OPD_NODE_DEFINITION_MISSING` | Projection 出现未注册 kind 或内置集合不完整 |
| `OPD_NODE_RENDER_SPEC_INVALID` | Node RenderSpec 身份、几何、symbol 或 anchor 不满足契约 |
| `OPD_RELATION_DEFINITION_DUPLICATE` | 同一基础 `capability_id` 或 definitionId 重复注册 |
| `OPD_RELATION_DEFINITION_MISSING` | 基础 `capability_id` 无法映射到唯一 Definition |
| `OPD_RELATION_RENDER_SPEC_INVALID` | Relation RenderSpec、primary Cell、segment 或 capture anchor 不满足契约 |
| `OPD_RELATION_PREVIEW_RENDER_SPEC_INVALID` | Preview 包含 committed identity/anchor、symbol/endpoint/cell 不闭合或进入错误 layer |
| `OPD_CONTROL_DECORATOR_DUPLICATE` | 同一 `control.capability` 或 definitionId 重复注册 |
| `OPD_CONTROL_DECORATOR_MISSING` | 受控 Fact 的 `control.capability` 无法映射到唯一 Decorator |
| `OPD_CONTROL_DECORATION_INVALID` | Decorator 改变基础 identity、增加关系组/capture anchor 或输出非法 annotation |

这些诊断码属于前端内部资源错误，不替代 HTTP `ErrorEnvelope`、Finding 或领域 reason code。

## 6. 注册与装配

1. 内置定义由显式 import 的 `createBuiltInNodeRegistry()` 注册，固定包含五种 kind，禁止目录扫描和按文件名发现。
2. 基础关系由 `createBuiltInRelationRegistry()` 按 `capability_id` 显式注册 16 个 Procedural Definition 与 10 个 Structural Definition；Control 不作为基础关系注册。
3. registry 在创建 X6 Graph 前执行唯一性和完整性检查；失败时画布进入 resource error，零 committed Cell。
4. Profile/Symbol binding 只作为已验证数据进入 RenderContext；不得注册 JavaScript、Vue 组件、URL 或动态 import。
5. 同一 kind 同时存在新旧 renderer 属于配置错误，禁止按环境、节点内容或异常路径 fallback。
6. 测试替身必须通过显式 dependency injection 提供隔离 registry，不得修改 production singleton 或全局变量。
7. `createBuiltInControlDecoratorRegistry()` 按 `control.capability` 显式注册 8 个 Control Decorator；decorator 只能装饰已验证的基础 Procedural RenderSpec，并保持 `relationId/occurrenceId/primaryCellId/capture anchor`。
8. Relation family 只用于目录、共享 helper 和测试分组；production 查找键是基础 `capability_id` 或 `control.capability`。禁止从 X6 line、marker、折点、DOM 或 `symbol_id` 字符串前缀反推。

## 7. X6 Adapter 与增量调和

共享 adapter 以 `occurrenceId` 为 committed Cell 键，按一次 Projection 接纳事务执行：

1. 校验 Projection revision、binding、registry 完整性和全部 RenderSpec；
2. 计算 `remove/update/add` 集合；
3. 在 X6 batch 中先移除失效装饰和关系，再更新/新增节点与关系；
4. 恢复 selection、Finding、candidate 和 focus layer；
5. batch 完成后一次性发布画布 current 状态。

### 7.1 Relation gesture adapter

关系手势由独立 `x6-relation-gesture-adapter.ts` 承接。它只允许输出：

```text
relation-drag-start(source_occurrence_id, pointer)
relation-drag-move(source_occurrence_id, pointer)
relation-endpoint-selected(source_occurrence_id, target_occurrence_id, pointer)
relation-cancelled(reason)
```

adapter 可以在 `dragging` 阶段创建无语义的 pointer edge，但释放后必须删除；进入 `candidate-preview` 后只渲染 `RelationPreviewRenderSpec`。它不得读取 Catalog/Capability 规则、调用 HTTP、构造 `CREATE_FACT/UPDATE_FACT`、把拖线方向写为 role/direction，或把 X6 Cell ID作为语义 target ID。

源/目标均由当前 Projection 的 exact occurrence ID定位。释放到空白、装饰 Cell、未知 Cell、Context/工具切换或 Escape 时同步发出稳定取消原因并释放 pointer/preview Cell。fan、Self-invocation 和 State-specified 的端点收集由状态 owner 与应用适配层处理，X6 adapter 不做合法性判断。

### 7.2 平行二元关系布局

关系 Definition 只生成自身的标准 RenderSpec；同端点分轨由 Definition 之后、X6 adapter 之前的纯布局步骤统一处理，禁止各 Capability 自行猜测其他关系。

分轨候选必须同时满足：RenderSpec 恰有一个 primary edge、没有既有 `vertices/router`、源目标不同、两端均可由当前节点 RenderSpec 定位中心。按无向端点对分组后，以 `relationId/occurrenceId` 稳定排序；一条保持直线，两条及以上沿规范端点中心连线的法向量，以固定 `24px` lane 间距生成对称 midpoint vertex。端点方向相反仍使用同一个规范法向量，刷新、输入排序和删除一条关系后结果必须确定。

fan、Effect 分段、自调用、junction、已有 route 的关系保持其 Definition 输出。分轨只改变 edge geometry，不得改变 relation/occurrence/symbol/primary Cell/capture anchor。X6 adapter 原位更新关系时必须同时更新或清除 `vertices/router`，不得保留上一 Projection 的旧轨道。

正常更新禁止执行全量 `graph.clearCells()`。仅以下情况允许销毁并重建 Graph：

- 首次创建或组件卸载后重新挂载；
- 切换到另一个 Model/Context，且旧 Graph 已完整释放；
- adapter 检测到不可兼容的内部 schema/version，并先进入明确 resource error。

selection、hover、Finding、viewport scale/translation 和单个节点的名称或布局更新不得触发 Graph 全量清空。关系端点引用被移动节点时，允许对应 edge geometry 重新计算，但不得修改 Fact 语义。

普通拖放按[状态布局修正规格](../../specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md)扩展为 owned Object/Process/Attribute/Operation/State/Feature State。State 受 owner 内容区约束，父移动联动同 Context 的 owned 状态；Fact、Referenced 和跨 Context occurrence 仍拒绝。Operation 使用椭圆，Projection 尺寸为显示依据。展示—特征使用独立双层三角模式，尖端连接 owner，预览与 committed RenderSpec 共用几何和箭头取消规则。

## 8. 编辑器与交互边界

1. `ElementNameEditor.vue` 承接 Object/Process HTML 输入覆盖层，继续遵守 Enter、Escape、blur、IME、失败保留和 committed Revision 回流契约。
2. `StateEditor.vue` 承接 State name/value、roles 和适用的显式性/折叠候选，不把 State 当成 Element 子类。
3. `RelationEditor.vue` 承接关系 option、label、modifier、direction 和 completeness 候选；合法组合以 Runtime option 为准。
4. Editor 通过明确事件输出候选，不接收 X6 Graph 或 Pinia 可写引用。
5. X6 adapter 只发出 `select/move/open-editor/place-state/select-endpoint` 等用户意图；Workbench application adapter 将其转换为查询或 Command。
6. 提交失败保留 Editor 输入；提交成功关闭候选，并在 committed Revision Projection 到达后更新正式 Cell。

## 9. 修改影响边界

| 修改对象 | 允许影响 | 禁止影响 |
| --- | --- | --- |
| 一个节点实例的数据 | 目标 occurrence；连接该节点的关系几何；模型产生新 Revision 时的投影刷新 | 其他节点对应语义目标的 ID、类型、名称、owner 或语义 |
| `object.definition.ts` | 全部 Object 的 RenderSpec 和对应视觉测试 | Process/State/Attribute/Operation 定义 |
| `state.definition.ts` | 全部 State 及其角色修饰 | owner Object 的语义或其他类型样式 |
| `consumption.definition.ts` | `CAP-ISO-PROC-001` 的表现和对应测试 | Result、Structural 或其他 Capability Definition |
| `aggregation-participation.definition.ts` | `CAP-ISO-STRUCT-005` 的 fan 表现和对应测试 | Consumption 或其他 Structural Capability Definition |
| 一个 Control Decorator | 对应 `control.capability` 的 annotation 与测试 | 基础 Fact identity、其他 Control Capability |
| 共享 helper | 显式引用该 helper 的定义 | 未引用类型的隐式变化 |
| Registry | 定义可用性、唯一性和装配失败行为 | Profile Capability 审批、Command 合法性 |
| X6 adapter | 全部 Cell 生命周期、layer 和事件桥接 | OPM 领域规则、Revision 内容 |
| Symbol Catalog | 绑定该 symbol/version 的视觉输出 | 静默改写历史 Revision 的 binding |

任何共享 core 变更都必须运行五种节点、26 个基础 Relation Definition 和 8 个 Control Decorator 的全量回归；单个 Definition/Decorator 变更至少运行该 Capability、同 helper 使用者的契约测试、跨 Capability 隔离和连接关系回归。

## 10. 验收与测试

后继实现规格必须至少冻结并执行：

1. Registry 正例：五种节点、16 个 Procedural、10 个 Structural 和 8 个 Control Decorator 各恰好一个注册项；注册顺序不影响按 Capability ID 查找结果。
2. Registry 反例：重复/缺失/未知 kind、基础 Capability 或 Control Capability 按稳定诊断码 fail closed，零 committed Cell。
3. Definition contract：每种节点从固定 Projection/RenderContext 产生确定性 RenderSpec，身份、symbol、尺寸、label、anchor 和角色修饰正确。
4. 跨类型隔离：修改或替换一个测试 Definition/Decorator 不改变其他 kind/Capability RenderSpec；Control 装饰前后基础 identity 深相等。
5. X6 adapter：add/update/remove、Context 切换、selection、Finding、candidate、zoom/pan 和 editor overlay 不产生重复 Cell、失效 listener 或 anchor 漂移。
6. 编辑器：Object/Process 名称、State、Relation 的打开、提交、取消、失败保留和只读阻断继续通过既有测试。
7. Capture：既有 `data-opm-capture-cell-id`、`data-testid`、candidate anchor 和装饰 Cell 排除规则逐字节保持。
8. Visual/E2E：Object、Process、State、Attribute、Operation、16/8/10 关系和跨浏览器核心路径无回归。
9. 性能：使用既有 DEV-CANVAS-05/06 门槛重新实测；不得以“改为增量调和”替代性能证据。
10. 资源释放：Context/Model 切换和组件卸载后 Graph、listener、observer、editor 与 transient Cell 均归零。

## 11. 迁移顺序

后继实现必须使用独立 L2/L3 规格和精确文件 allowlist，按以下顺序实施：

1. 新增 core interface、RenderSpec、registry、稳定诊断和 contract tests，不接管 production 渲染。
2. 迁移 Object、Process、State、Attribute、Operation Node Definition；逐类与旧输出做结构和视觉 parity。
3. 抽取三个 Editor，并保持现有事件和测试选择器。
4. 按 16 Procedural、10 Structural、8 Control Decorator 的 Capability 原序迁移关系；保持 Symbol Catalog、基础 Fact、fan、marker、label slot 和 Control identity 行为。
5. 启用共享 X6 adapter 和 occurrence-keyed 增量调和；同一提交中移除旧集中式分支。
6. 执行前端全量、浏览器、visual/E2E 和性能回归后，才可宣称实现完成。

任一步无法保持 parity 时必须停止并回到设计或 bugfix 规格，不允许长期保留双实现、通用矩形 fallback 或测试专用生产分支。

## 12. 兼容、发布与证据

- API/Schema/config/data：无变化。
- Profile/Rule/Grammar/Symbol：语义和资产 bytes 无变化。
- DOM/E2E：稳定 anchor 和选择器必须兼容。
- 发布：本设计不生成 Manifest、Report、Candidate 或 Activation，不启用 Capability。
- ISO：本架构是产品工程约束，不构成 ISO 19450:2024 符合性证据。
- 当前状态：设计已冻结，集中式实现尚未按本文迁移；不得把本文档存在描述为代码已实现。
