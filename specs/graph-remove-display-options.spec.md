# 删除图谱展示选项

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: refactor；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：删除图例中四项展示选项及对应前端可变状态和孤立节点筛选分支。保持原默认行为：MODEL包含隐藏状态，局部不包含；边界false、归属true，孤立节点保留。非目标：不删除后端能力或修改API/schema。
边界：允许GraphAnalysisPanel.vue、useGraphAnalysis.ts、graphAnalysisModel.ts、GraphAnalysisPanel.spec.ts及本任务specs文档；禁止后端/契约/配置/依赖及无关文件；保留已有差异。
验收：A1 无展示选项UI及可变状态；A2 查询默认参数不变，孤立节点保留；A3 类型/关系筛选、搜索、图例和请求回归通过；A4 类型/ESLint通过。
Plan：移除模板和状态，查询参数直接由scope推导；删除hideIsolated接口和实现并同步测试。验证图谱定向回归/typecheck/ESLint；回滚仅撤销本轮差异。
