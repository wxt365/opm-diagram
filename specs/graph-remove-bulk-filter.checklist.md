# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标：删除图谱关系全选/清空按钮及内联批量操作、专用样式；保留逐项筛选与初始化默认全选。允许GraphAnalysisPanel.vue、GraphAnalysisPanel.spec.ts及本文档；禁止其他文件、API/schema/配置/依赖，保留已有差异。A1 按钮/专用样式无残留；A2 图例逐项筛选回归通过。验证面板测试及ESLint；回滚仅撤销本轮差异。
顺序：删除模板和CSS、增加无批量按钮断言、验证。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无公共契约/依赖变化。
- [x] A1/A2

实际验证：图谱面板11/11通过，图例无批量按钮且逐项筛选可恢复；相关ESLint通过。未执行浏览器视觉验证。
