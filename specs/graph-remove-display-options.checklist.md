# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-remove-display-options.spec.md`
- [x] 边界确认：仅上述范围，无API/schema/依赖变化。
- [x] A1/A2/A3/A4

实际验证：图谱画布/面板/菜单26/26通过，覆盖选项移除、MODEL/CONTEXT固定查询参数、孤立节点保留及既有筛选/搜索/定位回归。typecheck及相关ESLint通过；git diff --check通过（仅行尾提示）。源码搜索无includeHidden/includeBoundary/includeOwnership/hideIsolated残留。同步隐藏状态/范围提示，移除指向已删除控件的文案。未执行浏览器视觉验证。
