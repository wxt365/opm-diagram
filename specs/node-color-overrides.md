# 当前节点颜色覆盖

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

元数据：change / L2 / feature / none (primary)。

## Spec
- 目标：属性区编辑当前图 occurrence 的颜色；工具栏保留类型配色；按字段执行节点 > 类型 > 默认优先级。
- 非目标：修改 API、schema、数据库、依赖、统一颜色作用域。
- 允许：ElementAppearanceProperty.vue/spec.ts、WorkbenchInspector.vue、shared/nodeAppearance.ts、opd/core/x6-node-layer.ts/spec.ts、stores/workbench/canvasNodeColors.spec.ts、WorkbenchView.spec.ts、本规格。
- 存储：复用 occurrence layout.appearance 和现有布局保存、撤销重做；属性区注明需保存。当前布局仅支持 owned，引用节点禁用本地配色，不静默丢弃。
- A1：属性区只改当前节点，恢复统一配色清除覆盖。
- A2：两字段独立继承，统一颜色变化不覆盖节点自定义色。
- A3：布局保存重开、移动、撤销重做保留颜色；只读/保存/布局预览时禁用。
- 验证：属性组件、颜色状态、画布渲染和工作台保存回归；类型检查、lint。
- 回滚：还原上述文件本次修改，已有自定义数据不删除。

## Plan
1. 修改共享颜色合并及自定义填充判断。
2. 属性区改接 editNodeAppearance，字段继承使用类型色为基线。
3. 更新既有测试及节点保存回归。

## Checklist
- [x] Spec：本文件；边界确认；无协议变更。
- [x] A1/A2/A3：属性、共享颜色、画布渲染、布局保存回归 22 项通过；增加属性面板接线后保存重开集成回归通过。
- [x] 类型检查、lint、diff 检查通过。浏览器手工验证未执行。
- 手工步骤：选择 owned 节点改边框/填充，确认其他节点保持统一色；保存并刷新；调整调色盘确认覆盖仍在；点击恢复统一配色并保存后刷新。引用节点显示禁用说明。

## 属性配色排版 Plan
- Lean Spec：删除范围及保存说明，添加与基本信息同风格的“颜色设置”标题；每个颜色后各有恢复按钮，仅清除对应字段。允许 ElementAppearanceProperty.vue/spec.ts、本规格；禁止 API、schema、配置、依赖及其他文件。验收 U1：两行各自恢复且保留另一覆盖；U2：标题及说明调整完成。验证组件测试与 lint；回滚本次组件改动。
- 顺序：调整模板、实现逐字段恢复、更新测试。
- Checklist：引用本节 Lean Spec；边界已确认；U1/U2 组件测试 4/4、定向 lint 通过；未执行浏览器手工验证。
