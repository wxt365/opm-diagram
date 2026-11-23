# 图谱分析冗余清理

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: refactor；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile及refactor task-type缺失。
目标：移除固定一跳后无效的hops参数、布局不再使用的widths、重复标签更新和选择清理、重复按钮状态CSS；缓存连接度并简化图例查找。非目标：不改变功能、标签阈值/避让、请求防竞态、布局参数、颜色、API或用户文案。
边界：允许GraphAnalysisCanvas.vue、GraphAnalysisPanel.vue、graphAnalysisLayout.ts、GraphAnalysisCanvas.spec.ts、GraphAnalysisPanel.spec.ts及本任务specs文档；禁止后端、公共API/schema、配置/依赖、其他文件和历史任务文档。保留已有改动，无公共契约变化；内部组件无其他调用点已搜索确认。
验收：A1 不再传递hops/widths，固定一跳及布局行为不变；A2 连线标签仅通过统一更新入口设置，颜色/选择/搜索/阈值回归不变；A3 图例及过滤/请求回归保持；A4 全前端测试、类型、定向ESLint通过。
Plan：先删除无效参数及包装，再合并重复绘制/状态清理并缓存派生数据，删除确定重复的CSS；不做大范围拆分和格式化。
验证：现有图谱回归、全前端测试、typecheck和定向ESLint；未运行浏览器时说明。回滚仅撤销本轮差异，不覆盖工作区既有修改。
