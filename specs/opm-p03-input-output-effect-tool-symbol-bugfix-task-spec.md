# P03 输入输出状态影响关系工具图标修复

Work Mode：change；Risk Level：L2；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## 目标与非目标

工具栏中的输入输出状态指定影响关系应清楚表达“输入状态 → 过程 → 输出状态”的三端点、两段单向线，避免被误读为一条双向线。保留生成/消耗工具及其他关系图标的现有含义。

本次不修改关系创建手势、Fact、端点、OPL、保存内容或画布渲染。

## 边界与契约

允许本规格、对应 Checklist、`relation-tool-symbol.ts`、`RelationToolSymbol.vue` 及其定向测试。禁止修改 API、Schema、数据库、配置、依赖、后端、用户模型和其他前端模块；保留工作树已有修改。Symbol ID 和组件 props 不变，仅改变该 Symbol 的工具栏绘图几何。

## 复现、验收与验证

复现：展开过程关系菜单，输入输出状态指定影响关系显示为两个状态框之间的一条双向线，缺少过程节点；与已提交画布的两段单向线表达不一致。根因是该 Symbol 映射复用了 `closed-both` 图标；现有测试只检查状态框边界，没有检查三端点方向。

- SYMBOL-01：该工具图标显示输入状态、过程、输出状态三个节点；输入状态到过程、过程到输出状态分别只有终点箭头。
- SYMBOL-02：普通双向影响、状态指定生成以及其余工具图标不变。
- SYMBOL-03：定向测试、typecheck、lint、build、实际菜单视觉核对和 `git diff --check`；无法执行项记录原因。

Plan：先补失败的组件断言，再单独实现三端点图标，最后验证回归和菜单尺寸。

回滚：撤销本任务的图标映射、组件绘制与测试增量；模型数据无需迁移。
