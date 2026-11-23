# 分析画布统一OPD缩放控件

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：脑图与图谱复用CanvasZoomControls，右下显示缩小/可输入百分比与预设菜单/放大，菜单含适应与100%；图谱保留重新布局、全屏和图例入口，图例向上展开。非目标：不改OPD原行为、模型、标签阈值或布局。
允许：MindmapPanel.vue及测试、GraphAnalysisCanvas.vue、GraphAnalysisPanel.vue及测试、CanvasZoomControls.vue及测试、tests/e2e/opm-graph-analysis.spec.ts、本任务specs文档；禁止后端/API/schema/依赖/配置及无关文件，保留已有差异。仅内部组件新增可选菜单边界元素，不影响原调用。
验收A1 两模块均复用OPD缩放组件且右下定位；A2 图谱适应/100%/任意比例和脑图缩放正常；A3 预设最高400%可用，菜单向上且空间按实际画布计算；A4 定向回归/类型/ESLint通过。
Plan：图谱slot提供setZoom/fit/reset；脑图绑定自身zoom/fit；共享组件允许显式菜单边界用于嵌套工具栏；更新e2e和回归。
验证：脑图/图谱/缩放控件测试、typecheck、ESLint；未运行浏览器时明确限制。回滚仅撤销本轮差异。
