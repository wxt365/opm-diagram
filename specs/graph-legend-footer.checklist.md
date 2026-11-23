# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标（用户最新要求）：图例回到画布右下角，横向单排，容器随内容收缩不留尾部空白；超宽横向滚动，保留点击显隐。允许GraphAnalysisPanel.vue、GraphAnalysisCanvas.vue、GraphAnalysisPanel.spec.ts及本文档；禁止公共API/schema/依赖/配置及其他文件，保留已有差异。
验收A1 图例占独立布局行，节点和关系分组；A2 筛选及既有图谱回归通过。Plan：从Canvas浮层slot移至父容器独立footer，父容器纵向布局，清理浮层样式；运行定向测试/类型/ESLint。回滚仅撤销本轮差异。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无契约/依赖变化。
- [x] A1/A2

最新实现：返回Canvas图例slot，右下角absolute、width:max-content，节点/关系同排，超宽横向滚动，max-width为画布减136px避免与取消选择冲突；不再独立占行或铺满。图谱25/25通过、typecheck通过；模板缩进已修正后重跑ESLint。未进行浏览器视觉验证。
