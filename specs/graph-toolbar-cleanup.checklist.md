# Plan / Spec

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-toolbar-cleanup.spec.md`
Work Mode: change；Risk Level: L2；Task Type: refactor；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/refactor task-type缺失。
目标：删除统一工具栏之后不再由真实页面使用的旧右上工具栏、旧静态图例、计算与样式，保留当前右下工具栏及全部交互。非目标：不调整布局、视觉参数、API、后端或依赖。
允许：GraphAnalysisCanvas.vue及测试、GraphAnalysisPanel.spec.ts、tests/e2e/opm-graph-analysis.spec.ts、本文档；禁止其他文件/公共契约/schema/配置/依赖，保留既有差异。仅内部组件，已确认只有Panel调用且总是提供legend slot。
验收A1 真实页面无用备用模板/样式/计算移除；A2 彩色连线与图例/工具栏现有功能回归不变；A3 前端全量测试、typecheck、定向ESLint通过。
Plan：删除Canvas备用显示分支及导入，测试改验证实际面板，更新e2e旧选择器；执行回归。回滚仅撤销本轮差异。未运行浏览器不声称视觉验证。
## Checklist
- [x] 边界确认：仅上述范围，公共契约/依赖禁止。
- [x] A1/A2/A3

实际结果：删除Canvas旧右上工具栏/旧静态图例、legendKinds/legendRelations、图标/名称导入及对应CSS；真实Panel统一工具栏不变。画布测试改覆盖颜色和取消选择，工具栏由现有Panel测试覆盖；e2e选择器更新为graph-view-tools/graph-zoom-value。
完整前端77文件663/663通过；typecheck、相关ESLint与git diff --check通过（仅行尾提示）。未执行浏览器视觉验证或e2e。
