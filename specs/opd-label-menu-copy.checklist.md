# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。

## Lean Spec
目标：菜单文案去掉“全部”，功能不变。允许修改 CanvasContextMenu.vue、CanvasContextMenu.spec.ts 和本文档；禁止修改其他实现、API、schema、配置或依赖。A1 显示/隐藏过程关系名称文案正确；验证定向菜单测试。回滚仅撤销本轮文案差异。

## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述文案、测试和记录。
- [x] A1

顺序：替换两处菜单文案及断言，运行菜单测试。

实际验证：CanvasContextMenu.spec.ts 5/5 通过。
