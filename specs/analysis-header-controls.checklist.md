# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/analysis-header-controls.spec.md`
- [x] 边界确认：仅上述范围，无公共契约或依赖变化。
- [x] A1/A2/A3/A4

实际验证：脑图/图谱面板及全屏组件26/26通过，覆盖侧栏隐藏恢复保持选择/节点名称、图谱说明删除、全屏目标及进入退出行为。typecheck和相关ESLint通过。脑图侧栏采用条件挂载，避免v-show恢复后display:none残留，编辑状态均在父组件保留。未执行真实浏览器视觉验证。
