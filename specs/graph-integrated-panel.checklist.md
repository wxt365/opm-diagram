# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-integrated-panel.spec.md`
- [x] 边界确认：仅上述范围，无公共契约/依赖变化。
- [x] A1/A2/A3

实际验证：图谱面板/画布与复用全屏组件29/29通过；覆盖收起后四按钮仍常显、全屏请求目标为图谱根面板、进入退出事件及拒绝提示。typecheck、相关ESLint与git diff --check通过（仅行尾提示）。CSS图例为父容器普通流100%宽，仅共享外框，关系单列，无max-height/overflow滚动。未执行真实浏览器视觉验证。
