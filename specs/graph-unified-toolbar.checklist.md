# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标（最新要求）：右下统一工具条合并缩放/重新布局与图例，工具仅图标并保留提示，图例名称保留；展开/收起图标固定最右，内容向左展开。实际面板无独立右上工具栏。允许GraphAnalysisCanvas.vue、GraphAnalysisPanel.vue及面板测试、本文档；禁止API/schema/配置/依赖及无关文件。保留已有差异。A1 合并并可折叠，显隐及工具行为不变；A2 相关测试/类型/ESLint通过。回滚仅撤销本轮差异。
Plan：Canvas通过图例slot提供视口操作及读数，面板渲染统一工具组；使用原有Lucide图标，更新测试。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述文件，无公共契约/依赖变化。
- [x] A1/A2

实际验证：图谱画布/面板26/26通过；工具仅图标并保留aria-label/title、图例文字保留、展开收起后过滤入口可恢复。使用v-if避免slot中v-show在收起重建后保留display:none的问题。typecheck与相关ESLint通过。CSS order:1使入口固定最右；未进行浏览器视觉验证。
