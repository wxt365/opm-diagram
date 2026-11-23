# 图谱节点缓慢缩放

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：采用参考图平方根缩放，屏幕直径=基准直径×sqrt(画布缩放)，过程/对象基准12px、状态9px；不随度数或选择变大，保留描边、标签避让及全部节点。非目标：不改布局或视口裁剪规则。
边界：允许GraphAnalysisCanvas.vue、GraphAnalysisCanvas.spec.ts及本任务specs文档；禁止API/schema/配置/依赖/后端及无关文件；保留已有差异。无契约影响。
验收：A1 基准直径与平方根规则符合参考实测；A2 缩放不减少节点数，选择不改变尺寸，标签偏移按真实屏幕半径更新；A3 相关测试、类型、ESLint通过。
Plan：区分屏幕半径和图坐标半径，更新尺寸测试；执行图谱回归及静态检查。回滚仅撤销本轮差异。
验证：测试10%至300%缩放、类型/选择/数量；真实浏览器未验证则说明。
