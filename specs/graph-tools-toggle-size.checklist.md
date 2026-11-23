# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：展开/收起图谱工具按钮始终36×36px，不受内容高度或滚动条影响。允许GraphAnalysisPanel.vue及本文档；禁止其他文件/API/schema/配置/依赖，保留既有差异。A1 宽高及flex尺寸固定；A2 现有面板回归/ESLint通过。回滚仅撤销本轮CSS。
顺序：限制按钮宽高并取消纵向拉伸，执行定向回归。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：面板12/12通过，ESLint通过；CSS固定36px宽高和flex-basis，align-self:center防止拉伸。未执行浏览器视觉验证。
