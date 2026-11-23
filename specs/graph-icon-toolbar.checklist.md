# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：移除全图概览/清晰浏览按钮，缩小/放大/重新布局三图标置于右上角；缩放值作为紧凑读数，取消选择独立放置。允许GraphAnalysisCanvas.vue及测试、tests/e2e/opm-graph-analysis.spec.ts和本文档；禁止API/schema/配置/依赖/后端及其他文件，保留已有差异。A1 三图标提示及无障碍名称正确；A2 按钮行为及相关回归通过。回滚仅撤销本轮差异。
顺序：复用Lucide图标、调整布局样式、同步已有e2e操作与定向测试；执行图谱回归、类型、ESLint。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无契约或依赖变化。
- [x] A1/A2

实际验证：图谱画布/面板22/22通过；三个图标、提示、无障碍名称及独立取消选择覆盖；前端typecheck和相关ESLint通过。已有e2e已同步操作，未运行浏览器视觉验证及e2e。
