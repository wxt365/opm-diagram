# 分析页顶部全屏与右侧栏

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：脑图/图谱顶部右端依次全屏和右侧栏显隐图标，复用OPD全屏；底部缩放保留；删除图谱范围说明。图谱控制详情栏，脑图控制分析属性栏，隐藏不清除选择或内容。
允许MindmapPanel.vue及测试、GraphAnalysisPanel.vue及测试、本任务specs文档；禁止API/schema/配置/依赖/后端及无关文件，保留已有修改。无公共契约变化。
验收A1 两页头部全屏及侧栏按钮可用；A2 隐藏/恢复保留选择与编辑状态；A3 图谱底部移除全屏且说明删除；A4 定向测试/类型/ESLint通过。
Plan：新增各页侧栏状态与根全屏目标，复用CanvasFullscreenButton；图谱详情关闭按钮只隐藏，选择新元素自动打开；测试状态保留。
验证：相关面板与全屏组件测试/typecheck/ESLint；未浏览器验证则说明。回滚仅撤销本轮差异。
