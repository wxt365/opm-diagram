# P03 生成/消耗组合工具

状态：设计冻结，已实现并通过本任务验证。Work Mode：change；Risk Level：L2；Task Type：feature；Active Playbooks：frontend-vue (primary)、testing。

## 1. 目标与非目标

将基础 Consumption / Result 合并为一个“生成/消耗关系 / Result / Consumption Link”工具。两者当前共用单向闭合箭头外观，但语义不同：对象到过程是消耗，过程到对象是生成。仅合并交互入口，不合并 Capability、Fact、Symbol、OPL 或 Trace。状态指定关系、Control、其他关系及发布流程不在变更范围。

## 2. 允许范围

允许 RelationToolPalette.vue、WorkbenchView.vue、workbenchRuntime.ts、新增 opd/core/transformation-tool.ts、WorkbenchView.spec.ts、tests/e2e/workbench-layout.spec.ts；允许同步工具栏规格、组件交互设计、完整画布工具链设计、冻结基线和本任务 Checklist。禁止 Runtime、OpenAPI、Schema、SQLite、Profile、依赖、发布资产及用户模型修改；直接当前目录开发，保留已有差异。

## 3. 唯一交互契约

1. Runtime Catalog 保持 16/8/10 个 Capability；过程工具常驻 4 项，展开 15 项。001/002 仅出现一个组合入口，占原 001 的位置（目录仅有 002 时使用其位置）。DOM 测试锚点保留原 001，但这只是 UI 锚点，不是创建时固定的 Capability。
2. Palette 向 Store 显式传递 `TRANSFORMATION` 工具意图与一个真实可用 Catalog 成员；普通单项仍为 `SINGLE`。禁止伪造 Catalog 项或新增 Runtime Capability。组合工具使用可用成员的 exact Symbol；无可用成员或只读时禁用。成员缺失、资源不支持、禁用原因逐方向提示，不得静默反向回退。
3. 对有序拖线端点查询 Runtime。组合工具仅接受 Catalog 中可用的 001/002 CREATE_FACT 候选，且其 normalized_endpoints 按 ordinal 排序后，0/1 的目标身份分别等于手势源/目标。前端不按节点类型推导合法性，不自行改写 role/端点/方向。只有唯一匹配且无需参数的候选才沿既有自动提交路径创建。
4. 没有同方向候选、对应成员禁用/缺失、空白释放或取消时零命令、零 Revision。禁止选用反方向候选凑成成功。提交前再次 exact query 校验；payload、预览和 OPL 使用最终 Runtime Option。候选过期/失败沿既有拒绝与保留机制。重复选择工具和修改 URL 的行为不变。
5. Tooltip首行为“生成/消耗关系 / Result / Consumption”，第二行为“生成 / Result：过程 → 对象”，第三行为“消耗 / Consumption：对象 → 过程”。按[后继面板/提示修复](opm-p03-inspector-name-and-transformation-hint-bugfix-task-spec.md)取代原混排文案；仅调整展示，不改端点方向。只读或成员不可用时追加对应双语原因，其他工具仍显示原标准名称。

## 4. 验收与验证

- CT-01：Catalog 仍 16/8/10，UI 常驻 4/4/5、展开 15/8/10，组合入口双语提示正确且无重复生成按钮。
- CT-02：Runtime 同时返回两类候选且顺序任意时，两种拖线方向分别提交原样 001/002；唯一性与提交前复核不绕过。
- CT-03：禁用/缺失成员、反方向候选、无候选及只读均不得误建；有可用成员时仍能选择工具，不以一个禁用成员封锁另一个。
- CT-04：真实 Chromium 通过同一按钮画出双方向关系，检查命令、两条线不重叠、生成/消耗 OPL 与刷新重开。
- CT-05：Web 单测、lint、build（含类型检查）、受影响 Playwright 和 diff whitespace 检查通过。

## 5. 回滚

仅撤销本任务新增的 UI 意图、显示聚合与测试/文档增量，恢复两个独立工具；已提交 Fact、Revision 无格式变化，无数据迁移。
