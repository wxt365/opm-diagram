# 图谱画布控制整合

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md；repo-profile/task-type缺失时遵循相关实现。
目标：移除左侧栏；统计作为左上角紧凑画布浮层；右下图例承载节点/关系复选、关系全选/清空及原展示选项；标签显隐移入画布空白右键菜单，样式/键盘关闭行为参考OPD。搜索结果保留为画布浮层，详情/来源定位/过期更新保留。
非目标：不改图谱查询API、模型数据、布局、缩放标签阈值或OPD菜单。
允许：GraphAnalysisPanel.vue、GraphAnalysisCanvas.vue及测试、新增GraphAnalysisContextMenu.vue及测试、tests/e2e/opm-graph-analysis.spec.ts、本任务specs文档。禁止后端/API/schema/配置/依赖及无关文件；保留已有差异。内部组件新增slot/事件，无公共API变化。
验收：A1 无左侧栏，四项统计完整；A2 图例保留所有筛选且被取消的类型仍可重新选回；A3 空白右键及键盘菜单可切换标签，Esc/外部点击/滚动关闭，菜单操作不穿透取消选择；A4 搜索恢复被筛节点、详情/定位及展示选项回归通过；A5 图谱/菜单测试、类型/ESLint通过。
Plan：Canvas提供图例和浮层slot，父面板继续持有全部过滤状态；专用只读右键菜单复用OPD视觉规范和事件处理；清理旧侧栏样式并同步测试/e2e。
验证：组件测试覆盖空列表恢复/关系过滤/菜单事件及既有图谱回归；类型与ESLint；未进行浏览器验证时说明。回滚仅撤销本任务差异。
