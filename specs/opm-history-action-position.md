# 历史恢复按钮位置

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L1; Task Type: feature; Active Playbooks: none (primary)。

## Plan
### Lean Spec
目标：交换历史行右侧恢复按钮与状态文字位置，按钮在左、状态在右。
非目标：行为、契约、数据、依赖、配置变化。
允许：WorkbenchBottomPanel.vue 的历史标题行和本文件；禁止其他文件及 .harness 修改。
契约影响：无。验收 A1：标题、恢复按钮、状态依次排列；无恢复按钮时状态仍在最右。
验证：检查模板顺序、运行现有面板测试。回滚：仅还原本次模板顺序。
实施：交换两个相邻元素，复用已有 flex 样式。

## Checklist
Spec: Plan#Lean Spec
- [x] 边界已确认。
- [x] A1：模板顺序已核对；现有面板 7 项测试通过。开发服务热更新，无需重启后端。
