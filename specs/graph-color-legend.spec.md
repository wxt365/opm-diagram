# 图谱节点与彩色关系图例

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：节点基准直径增至过程/对象14px、状态11px，继续平方根缩放；关系按稳定类型颜色展示；右下角图例列出当前可见节点及关系类型，支持折叠和内部滚动。
非目标：不修改布局、模型语义、选择与50%标签阈值。边界：允许GraphAnalysisCanvas.vue及测试、graphAnalysisModel.ts、本任务specs文档；禁止API/schema/配置/依赖/后端及无关文件；保留已有差异，无契约变化。
验收：A1 大小及缩放规则正确；A2 不同类型有多色，选择/重绘保持类型色；A3 图例色样和连线一致，仅展示当前类型；A4 回归、类型、ESLint通过。
Plan：共享纯颜色映射，画布与图例复用；图例默认展开且限高，更新节点尺寸测试并验证颜色一致与筛选后图例更新。
验证：图谱定向测试/typecheck/ESLint；未浏览器验证则明确。回滚仅撤销本轮差异。
