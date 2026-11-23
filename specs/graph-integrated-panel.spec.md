# 图谱工具面板整合与全屏

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：右上工具和图例同一等宽容器，无浮层间隙/双边框/内部滚动条；关系每项独占一行且文字不换行；顶部复用OPD全屏按钮，折叠后视口工具仍常显。
允许GraphAnalysisPanel.vue及测试、本任务specs文档；禁止公共API/schema/配置/依赖/后端及其他文件，保留既有差异。无公共契约变化。
非目标：不改模型/布局/筛选/菜单。验收A1 单一等宽面板、无内部滚动且关系单行；A2 全屏目标为图谱面板，进入/退出复用现有组件；A3 图谱/全屏回归、类型/ESLint通过。
Plan：增加头部布局、图例改普通流、关系纵向排列；复用CanvasFullscreenButton，fullscreen根容器填满屏幕，ResizeObserver自动更新画布。
验证：面板和全屏组件测试，typecheck/ESLint；未浏览器视觉验证则说明。回滚仅撤销本轮差异。
