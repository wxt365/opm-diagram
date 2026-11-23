# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Spec: `specs/graph-analysis-selection-ux.spec.md`
- [x] 边界确认：仅 Spec 允许文件，API/schema/配置/依赖禁止，保留已有修改。
- [x] A1
- [x] A2
- [x] A3
- [x] A4
- [x] A5

实际验证：
- 图谱画布及面板定向测试 15/15 通过，覆盖节点/关系选择、背景标签、直接边、悬停、取消、筛选以及既有回归。
- 前端 `npm run typecheck --workspace=@opm/web` 通过。
- 四个相关 Vue/测试文件定向 ESLint 通过。
- `git diff --check` 通过（仅行尾转换提示）。
- 未运行浏览器联调，测试使用 X6/Worker/ResizeObserver 替身，不能据此确认实际视觉布局。
- 手工检查：打开图谱选中节点，确认深色描边及直接边高亮；选中关系确认两个端点突出；悬停背景节点可查看名称；再次点击、空白、Esc、取消选择均恢复全图；隐藏当前类型后详情关闭，关联列表遵循关系筛选。
