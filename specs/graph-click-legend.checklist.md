# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: refactor；Active Playbooks: none (primary)。
## Lean Spec
目标：移除图例总标题/折叠及复选框，以图例按钮点击显隐，隐藏项淡化，aria-pressed表达状态，保留节点/关系分组。允许GraphAnalysisPanel.vue及测试、tests/e2e/opm-graph-analysis.spec.ts和本文档；禁止API/schema/依赖/配置及其他文件；保留已有差异。A1 无总标题/复选框，点击和键盘可切换；A2 隐藏项可恢复、搜索恢复与来源定位回归通过。验证面板测试/类型/ESLint；回滚仅撤销本轮差异。
顺序：替换图例项为按钮、复用现有筛选数组，更新测试和e2e操作。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无公共契约/依赖变化。
- [x] A1/A2

实际验证：面板11/11通过，包括直接点击图例隐藏/恢复、搜索恢复、来源定位；无summary与input断言通过。typecheck和相关ESLint通过。e2e筛选操作已同步，未执行浏览器视觉验证或e2e。按钮使用原生键盘激活及aria-pressed，无额外自定义键盘事件。
