# Spec: P03 统一画布构造生命周期设计

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

冻结 P03 所有可见画布构造的创建、删除和重开语义。创建使用既有 `CREATE_ELEMENT/CREATE_FEATURE/CREATE_STATE/CREATE_FACT`；删除以画布右键菜单和 `Delete/Backspace` 为主入口，统一先经 `API-EDT-001(intent=DELETE_CONSTRUCT)` 取得 Runtime 影响，再由携带 exact `impact_token` 的 `API-EDT-002` 提交。Control 不作为第二关系删除，只通过 `UPDATE_FACT` 原子移除其两个 Modifier。

## 2. 非目标

- 本任务不修改 OpenAPI、生成 DTO、Runtime、SQLite、Vue、X6、测试、Profile/Rule/Grammar/Symbol 资产或发布工件。
- 不开放 Context 删除、跨 Context 移动、自由删除 X6 Cell、前端依赖分析或批量删除。
- 不改变已冻结的创建 payload、Fact/Modifier、OPL/Trace、Revision、幂等或 undo/redo 语义。

## 3. 允许与禁止范围

允许修改：

- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-modeling-workbench-component-interaction.md`
- `docs/design/opm-opd-node-renderer-architecture.md`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/README.md`
- 本规格与对应 checklist

禁止修改上述范围外文件，尤其当前 `docs/contracts/openapi/opm-local-api-v1.yaml`、生成 DTO、`apps/**`、`services/**`、`scripts/**`、`tests/**`、SQLite migration、Profile package、release root 和 `runtime-data/`。后继实现规格必须以同一 allowlist 原子修改 OpenAPI、生成器、Runtime、前端和 E2E；不得仅增加删除按钮。

## 4. 冻结契约

### 4.1 构造生命周期矩阵

| 画布语义目标 | 创建命令 | 删除路径 |
| --- | --- | --- |
| Object / Process | `CREATE_ELEMENT` | `DELETE_CONSTRUCT(ELEMENT)` |
| Attribute / Operation | `CREATE_FEATURE` | `DELETE_CONSTRUCT(FEATURE)` |
| State | `CREATE_STATE` | `DELETE_CONSTRUCT(STATE)` |
| 基础 Procedural / Structural Fact | `CREATE_FACT` | `DELETE_CONSTRUCT(FACT)` |
| Control | `UPDATE_FACT` 附加两个受控 Modifier | `UPDATE_FACT` 原子移除两个 Modifier |

画布 Cell 是 occurrence 的视图，不是删除目标的事实来源。每次删除请求固定从当前 Projection 的 exact `selection_id=occurrence_id` 发起；Runtime 决定选项的语义目标、删除模式、影响闭包和 token。

### 4.2 occurrence 与目标删除

`DELETE_CONSTRUCT` option 的 `delete_mode` 为封闭枚举：

- `REMOVE_OCCURRENCE`：仅移除当前 Context 的 `selection_id` occurrence、其布局和该 occurrence 的投影/capture 定位；不删除语义目标、其他 Context occurrence、Fact、OPL、Trace 或 Finding。仅当该 occurrence 是 `REFERENCED`，或移除后目标仍保有至少一个 `OWNED` occurrence 时允许；Fact 不提供此模式。
- `DELETE_TARGET`：删除 Element、Feature、State 或 Fact 语义目标，以及该目标的全部 `OWNED` occurrence 和自动派生 OPL/Trace/Finding 投影。若存在需要删除的引用 occurrence、owned Feature/State、Fact、细化 Context 或其他依赖构造，则该模式 disabled，返回 `DELETE_DEPENDENCY_EXISTS`。
- `CASCADE`：仅在 `DELETE_TARGET` 被依赖阻断且 Runtime 能计算完整封闭影响集时提供。执行即删除 `impact_summary` 中全部 `DIRECT/CASCADE` 项；前端不得增删该集合。

删除 Fact 的 `DELETE_TARGET` 始终同时删除其 Control Modifier、该 Fact 的 OPL/Trace/Finding 投影，不需要也不允许单独删除 Control。删除 State、Feature、Element 的 `CASCADE` 必须将其引用 Fact、子 State/Feature、细化 Context 和引用 occurrence 完整列为影响项；无法形成完整闭包则不给 token。

### 4.3 Runtime 影响查询与直接执行

`API-EDT-001(intent=DELETE_CONSTRUCT, selection_id)` 只读、零 Revision、零 Operation Record。每个 option 除现有字段外必须返回：

```text
DeleteImpactOption {
  delete_mode                 // REMOVE_OCCURRENCE | DELETE_TARGET | CASCADE
  delete_target { kind, id }  // OCCURRENCE 仅用于 REMOVE_OCCURRENCE
  impact_summary {
    input_revision
    selected_occurrence_id
    delete_mode
    target { kind, id }
    items[] { kind, id, context_id?, effect } // effect=DIRECT|CASCADE|BLOCKER
    counts { contexts, occurrences, elements, features, states, facts,
             opl_sentences, traces, findings }
  }
  impact_token
}
```

`items[]` 必须包含完整、去重、按 `kind/id/context_id` 规范排序的集合，不允许截断、目录扫描或由前端补全。`BLOCKER` 项只在 disabled option 中出现；enabled option 的 items 只能是 `DIRECT/CASCADE`。`impact_token` 为不透明 Runtime 产物，精确绑定 project/model/context、input revision、Profile/Rule/Symbol/Grammar binding、selection、mode、target、规范 impact summary、query 和 option；任一值变化即失效。

后继 OpenAPI 版本将 `DeleteConstructPayload` 冻结为：

```text
{ selection_id, construct_kind, construct_id, delete_mode, impact_token }
```

所有字段必填且 `additionalProperties=false`。`REMOVE_OCCURRENCE` 必须使用 `construct_kind=OCCURRENCE` 和 `construct_id=selection_id`；其他模式只能使用 `ELEMENT|FEATURE|STATE|FACT`。Runtime 必须逐字段验证 payload 与 token 内的 option 相等，再在同一事务生成唯一 Revision。

查询时的稳定 reason 至少包括 `SELECTION_NOT_DELETABLE`、`LAST_OWNED_OCCURRENCE`、`DELETE_DEPENDENCY_EXISTS`、`DELETE_IMPACT_UNRESOLVED`、`READ_ONLY_REVISION`、`REVISION_STALE`。提交时，token 形状错误为 `INVALID_ARGUMENT/400`；token 与当前 Revision/binding/selection/mode/target/impact 不一致为 `IMPACT_TOKEN_STALE/409`；所有拒绝、取消和持久化失败均零 Revision、零部分删除。重复 `command_id` 继续先按既有请求摘要幂等处理。

### 4.4 Control 移除

当选中 committed Procedural Fact 且 Fact 含有效 `control.capability + control.segment` 原子组时，`API-EDT-001(intent=UPDATE_FACT)` 返回一个 `REMOVE_CONTROL` 表示选项。执行既有 `UPDATE_FACT` 时使用 `replacement.modifiers=[]`，并精确匹配查询/option/base Fact capability。成功保留基础 Fact、endpoints、layout、capture anchor 和 Fact ID，只重生成该 Fact 的 OPL/Trace；无 Control、Structural Fact、非法 Modifier 或旧 Revision 均不提供该选项并返回稳定原因。

### 4.5 画布、检查器与 X6 边界

不提供独立的检查器或工具栏删除图标。右键单击 Object、Process、Attribute、Operation、State、基础 Fact 或 Control annotation 时，先以当前 Projection 定位 exact occurrence；若目标尚未选中，先更新 selection，再打开 `P03-construct-actions-menu`。菜单只显示 Runtime 已返回的 mode、影响数量与阻断原因：`REMOVE_OCCURRENCE`、`DELETE_TARGET`、`CASCADE` 或“移除 Control”。点击 enabled 菜单项立即提交对应命令，不再打开二次确认弹层。

`Delete/Backspace` 仅在画布选择已存在、焦点不在输入或菜单时执行。它必须先查询 Runtime，再从 enabled option 按 `DELETE_TARGET -> CASCADE -> REMOVE_OCCURRENCE` 的固定优先级选择一个并立即提交；Control annotation 只有 enabled “移除 Control”时直接执行。键盘路径不得显示或短暂渲染右键菜单。无 selection 时无操作，并阻止浏览器返回/导航；无 enabled option 时只显示 Runtime 阻断反馈且零提交。右键空白画布、菜单外区域或未知/装饰 Cell 不拦截浏览器原生菜单，也不发起查询。取消或关闭右键菜单、查询/提交失败都保留 committed Projection 与 selection。

X6 只发出 `construct-action-requested { selection_occurrence_id, invocation=POINTER|KEYBOARD, pointer? }` 与 `construct-delete-cancelled` 意图；不得根据 Cell、标签、关系线或 DOM 推导 target/cascade，不得先移除 committed Cell。`POINTER` 由页面显示菜单，`KEYBOARD` 由 Store 执行上述固定优先级；取消、阻断或提交失败保留 committed Projection，成功后只按 committed Revision 增量调和。

## 5. 验收

- `LIFECYCLE-DESIGN-01`：五类基础语义目标和 Control 的创建/删除命令矩阵唯一冻结。
- `LIFECYCLE-DESIGN-02`：occurrence 移除、目标删除与显式级联的条件、闭包和禁止静默级联冻结。
- `LIFECYCLE-DESIGN-03`：完整 `impact_summary`、token binding、payload、reason/error 和幂等顺序冻结。
- `LIFECYCLE-DESIGN-04`：Fact 删除与 Control 移除的身份、Modifier、OPL/Trace 边界冻结。
- `LIFECYCLE-DESIGN-05`：右键菜单直接执行、快捷键无菜单直接执行、取消、失败保留和 X6 零直接删除流程冻结。
- `LIFECYCLE-DESIGN-06`：后继实现的 OpenAPI/Runtime/Vue/E2E 原子范围、正反例和回滚边界冻结。
- `LIFECYCLE-DESIGN-07`：应用 API、完整画布、组件交互、渲染架构、handoff、索引和全局基线一致。

## 6. 后继实现与验证

后继 L3 实现规格必须新增并验证 OpenAPI/生成器正反例、Service/MVC、事务/幂等、Vue/store/X6、以及真实浏览器 E2E。每种 Object、Process、Attribute、Operation、State、Fact 与 Control 至少覆盖创建、右键菜单直接执行、`Delete/Backspace` 无菜单直接执行、依赖阻断、CASCADE 固定选择、菜单取消、token stale、失败零提交、Revision、reload 和 OPL/Trace 一致性。不得以 UI 单测、假 impact 或静态文档替代 Runtime/浏览器证据。

## 7. 回滚

本设计可整体回退本规格与其同步设计文档。后继实现回滚不得改写已提交 Revision；只能关闭对应编辑入口并通过 Revision 历史恢复旧模型状态。
