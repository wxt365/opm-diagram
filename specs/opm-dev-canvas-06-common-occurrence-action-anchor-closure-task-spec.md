# DEV-CANVAS-06 Common Occurrence Action Anchor 闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

关联实现：`GOLDEN-AUTHORING-03B Common Browser Capture`

## 1. 问题

Common fixture 的 `SELECT_OCCURRENCE` 输入是 Runtime Projection 的 `occurrence_id`，03B 又要求浏览器动作只使用 `data-testid`。当前 X6 仅为语义图元写入 `data-opm-capture-cell-id`，且值误用 target ID；callback 无法以冻结的 occurrence 身份执行选择。

## 2. 冻结契约

对每个 Runtime Projection 的语义节点或 Fact 边，唯一属性为：

```text
data-opm-capture-cell-id = occurrence_id
data-testid = "p03-occurrence-" + occurrence_id
```

- 节点的 `occurrence_id` 来自 `ProjectionConstructWire.occurrence_id`。
- Fact 边的 `occurrence_id` 来自同一 Fact Projection construct；不得从 `fact_id`、布局、目录或 DOM 顺序推导。
- `data-testid` 只供受控动作选择；`data-opm-capture-cell-id` 仍是 geometry collector 的唯一语义 cell 输入。两者必须逐字节表示同一个 occurrence。
- State final/default outline、fan junction/member、effect output、标签、marker 和其他装饰 Cell 不得带任一属性。
- 对用户的 selection 事件仍只发送稳定 target ID/Fact ID；本修改不改变写命令、Projection API、DDL、业务身份或公共 wire。

## 3. 内部映射

`ConsumptionRelation` 新增内部 `occurrenceId`，由 store 的 Projection 到画布映射唯一传递。所有 endpoint 的 `sourceOccurrenceId/targetOccurrenceId` 从当前 nodes 的 `target_id -> occurrence_id` 映射得到；找不到节点时保持既有 target ID fallback，仅该旧 UI 辅助字段允许 fallback，绝不用于 capture/action anchor。

## 4. 验收

- `ANCHOR-01`：X6 unit test 证明普通 node/Fact 使用 occurrence 值，全部装饰 Cell 无 anchor/testid。
- `ANCHOR-02`：Workbench 既有 target-ID selection 行为不变。
- `ANCHOR-03`：typecheck 与 Workbench/OpdCanvas 定向测试通过。

## 5. 范围与回滚

允许：`apps/web/src/shared/types/modeling.ts`、`apps/web/src/stores/workbenchRuntime.ts`、`apps/web/src/modules/workbench/OpdCanvas.vue`、定向测试、03B 规格/checklist。

禁止：Runtime/OpenAPI/DDL、Profile assets、Family capture anchor 语义、X6 装饰 Cell、公共写命令。

回滚仅撤销上述内部 mapping 与属性；不得改写 fixture 或 capture Plan。
