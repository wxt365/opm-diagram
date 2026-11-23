# 画布属性侧栏

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

## Spec
- 元数据：change / L2 / feature / none (primary)。
- 目标：已打开的右侧栏无节点/关系选择时显示画布属性和内嵌五类统一调色盘；移除工具栏调色入口，允许无选择打开属性栏。
- 非目标：改变统一配色作用域、节点独立色、保存协议或默认关闭侧栏行为。
- 允许：WorkbenchSurface.vue、WorkbenchInspector.vue、CanvasColorPalette.vue/spec.ts、WorkbenchView.spec.ts、stores/workbenchRuntime.ts、本规格。禁止 API、schema、依赖、配置及其他文件。
- 契约影响：无。
- I1：无选择可打开画布属性，展示当前图名称和调色盘。
- I2：选择节点/关系显示原有属性，取消选择返回画布属性。
- I3：调色盘内嵌适配侧栏，仍复用统一保存；只读和加载/保存禁用。
- 验证：定向侧栏/调色盘测试、类型检查、lint、diff。
- 回滚：还原上述接入，恢复工具栏入口。

## Plan
1. 调色盘增加内嵌模式，复用编辑逻辑并适配窄栏。
2. 画布属性替代空状态，放开无选择打开限制。
3. 回归选择切换和调色盘。

## Checklist
- [x] Spec：本文件；边界确认。
- [x] I1/I2/I3：侧栏打开、节点选择与清空切换、内嵌十个颜色控件及原调色盘回归共 7/7 通过；类型检查、lint、diff 检查通过。
- 浏览器手工视觉验证未执行；打开属性栏并点击画布空白处，检查画布名称、五类配色及节点/关系切换。

## 内嵌视觉调整 Plan
- Lean Spec：内嵌调色盘改为五个紧凑分组，标题与恢复同排，边框/填充分列且色块色值同排；画布名称独立浅底显示。允许 CanvasColorPalette.vue、WorkbenchInspector.vue、本规格；禁止行为、API、schema、依赖和配置变更。验收 P1：窄栏色值可读、元素分组清晰。验证 lint、类型检查；回滚本次排版。
- 顺序：内嵌独立模板复用编辑方法，调整名称显示。
- Checklist：引用本节 Lean Spec；边界已确认；类型检查与 lint 通过；浏览器视觉验证未执行。

## 简洁列表 Plan
- Lean Spec：取消内嵌卡片、色值与重复字段标签；单行展示类型、边框/填充色块及恢复，表头说明颜色列；画布名称去掉卡片。允许 CanvasColorPalette.vue、WorkbenchInspector.vue、本规格；无交互/API/schema/依赖变更。验收 M1：五类紧凑列表；验证 lint 及类型检查；回滚本次模板样式。
- Checklist：引用本节 Lean Spec；边界确认；M1 模板核对完成，类型检查及 lint 通过；未执行浏览器视觉验证。

## 列宽调整 Plan
- Lean Spec：仅调整调色盘列宽与对齐，类型列 56px，颜色列等分剩余空间居中，恢复列 36px；允许 CanvasColorPalette.vue、本规格；禁止行为及契约变更。验收 W1：减少类型列留白，颜色表头/色块同轴。验证定向 lint；回滚本次 CSS。
- Checklist：引用本节 Lean Spec；边界确认；W1 CSS 对齐核对及定向 lint 通过；未执行浏览器视觉验证。
