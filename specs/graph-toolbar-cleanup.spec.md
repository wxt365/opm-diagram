# 图谱旧工具栏清理规格

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: refactor；Active Playbooks: none (primary)。repo-profile/refactor task-type缺失，遵循AGENTS.md。
目标：删除统一工具栏上线后真实页面不使用的旧工具栏/静态图例及计算、导入、CSS，保持现有功能外观。
非目标：不改变布局参数、筛选、颜色、节点尺寸、阈值和菜单；不清理历史任务记录。
允许：GraphAnalysisCanvas.vue及测试、GraphAnalysisPanel.spec.ts、tests/e2e/opm-graph-analysis.spec.ts、本任务specs文档。禁止其他目录、API/schema/配置/依赖；保留既有修改。仅内部组件slot去除备用内容，无公共契约影响。
验收A1 无旧模板/样式/计算残留；A2 当前统一工具栏、图例筛选及颜色/选择行为不变；A3 全量前端、类型和定向ESLint通过。
验证：当前面板测试接管工具栏验证，画布测试保留颜色和选择；全量回归。浏览器未运行不宣称视觉验证。
回滚：仅撤销本轮差异，不覆盖其他工作区修改。
