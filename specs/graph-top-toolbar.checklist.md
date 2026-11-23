# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标：工具条置于右上角，缩放读数/缩小/放大/重新布局始终显示，最右入口控制图例在工具栏下方向下展开；图例不再向左撑开工具栏。允许GraphAnalysisPanel.vue及测试、本文档；禁止API/schema/配置/依赖及其他文件，保留已有差异。A1 收起仍显示三工具和比例、展开图例位于工具栏下方；A2 筛选及面板测试/ESLint通过。Plan：视口工具移出条件容器、定位图例下拉、更新回归。回滚仅撤销本轮差异。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：面板12/12通过，包括折叠后视口三个按钮及比例常显；相关ESLint通过。图例使用top:calc(100% + 6px)向下展开，工具条本身不变宽；未进行浏览器视觉验证。
