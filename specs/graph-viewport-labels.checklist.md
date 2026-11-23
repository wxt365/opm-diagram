# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-viewport-labels.spec.md`
- [x] 边界确认：仅上述文件，无公共契约或依赖变化。
- [x] A1/A2/A3/A4

实际验证：图谱画布/面板21/21通过；新增70节点超预算场景验证视口外节点不占名额、平移进出恢复名称。typecheck、相关ESLint及git diff --check通过（仅行尾提示）。未运行真实浏览器视觉验证，测试使用X6/Worker替身。
