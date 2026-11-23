# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: `specs/graph-analysis-interactions-fix.spec.md`

- [x] 边界确认：仅 Spec 允许的画布、测试及任务文档；API/schema/配置/依赖禁止。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

验证记录：
- 新增画布回归测试在修复前 3/3 失败，分别对应 A1/A2/A3。
- `npm run test --workspace=@opm/web -- GraphAnalysisCanvas.spec.ts GraphAnalysisPanel.spec.ts`：11/11 通过（X6、Worker、ResizeObserver 使用替身，挂载真实 Vue 组件）。
- `npm run typecheck --workspace=@opm/web`：通过。
- 在 `apps/web` 执行 `npx --no-install eslint src/modules/workbench/GraphAnalysisCanvas.vue src/modules/workbench/GraphAnalysisCanvas.spec.ts --max-warnings=0`：通过。
- `git diff --check`：通过；仅有 Git 行尾转换提示。
- 未执行真实浏览器及后端联调：当前未启动服务，本次为画布局部修复。
- 可执行手工复核：打开图谱分析，选中/搜索节点后缩放与悬停，观察描边仍突出；关闭显示标签后悬停关系，观察无文字；在至少 180 条边的图谱中选择关系并移出，观察标签保留，取消选择后隐藏。
