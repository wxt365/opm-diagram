# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标：图例改为画布底部横向平铺并自动换行，保留节点/关系分组及点击显隐。允许GraphAnalysisPanel.vue和本文档；禁止其他实现、API/schema/配置/依赖，保留已有差异。A1 横向底部布局；A2 现有面板回归通过。最大高度限制避免窄屏占满画布，与左下取消按钮保留空间。回滚仅撤销本轮CSS。
顺序：调整图例CSS、运行现有面板测试和ESLint；不增加仅镜像CSS的测试。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无公共契约或依赖变化。
- [x] A1/A2

实际验证：面板11/11通过，ESLint通过；CSS核对横向flex-wrap及120px限高。未执行浏览器视觉验证。
