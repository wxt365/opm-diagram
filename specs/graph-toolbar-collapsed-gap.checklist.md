# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：删除图例收起后工具条左侧空白，仅展开保留240px最小宽度。允许GraphAnalysisPanel.vue和本文档；禁止其他文件/API/schema/配置/依赖，保留已有差异。A1 收起按内容宽，展开保持等宽图例；A2 面板测试/ESLint通过。Plan：最小宽度绑定展开class，定向验证。回滚仅撤销本轮差异。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：面板14/14通过，ESLint通过。min-width仅展开class生效，收起宽度max-content。未运行浏览器视觉验证。
