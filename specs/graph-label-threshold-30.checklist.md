# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：文字隐藏阈值50%改30%，其他显示规则不变。允许GraphAnalysisCanvas.vue及其测试、本文档；禁止API/schema/配置/依赖及其他文件。A1 低于30%隐藏，30%及以上按既有规则显示；验证图谱定向测试。回滚仅撤销本轮差异。
顺序：修改阈值、同步边界测试、验证。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，保留已有差异。
- [x] A1

实际验证：图谱画布/面板24/24通过，覆盖29%隐藏、30%及35%恢复，以及选择/搜索/悬停边界。
