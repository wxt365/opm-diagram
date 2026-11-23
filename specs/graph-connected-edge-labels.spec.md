# 选中节点关联线名称

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。遵循 AGENTS.md；repo-profile/bugfix task type 如缺失则使用相关实现作为依据。

目标：大图选中节点时直接关联线显示名称，连线标签保持屏幕字号可读。非目标：不更改布局、节点标签、模型或 OPD 画布。
边界：允许 GraphAnalysisCanvas.vue、GraphAnalysisCanvas.spec.ts、本任务 specs 文档；禁止 API/schema/配置/依赖/后端和无关文件，保留已有改动。无公共契约变化。
验收：A1 至少180条边时选中节点直接关联线名称显示，其他线隐藏，取消后恢复；A2 关系选中/悬停仍有效，缩放保持正常12px/悬停13px屏幕字号；A3 关闭标签隐藏所有文字；A4 图谱定向测试、类型检查及 ESLint 通过。
Plan：复用 selectionEdges 判定，集中更新连线标签，缩放事件更新字号；扩展画布测试验证大图、取消、标签关闭及缩放。
验证：运行画布及面板回归、typecheck、定向 ESLint；未运行浏览器则说明限制。回滚仅撤销本轮差异。
