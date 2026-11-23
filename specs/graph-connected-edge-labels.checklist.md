# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-connected-edge-labels.spec.md`
- [x] 边界确认：仅 Spec 文件范围，公共契约/配置/依赖禁止，保留已有修改。
- [x] A1/A2/A3/A4

实际验证：图谱画布/面板测试17/17通过，新增大图选择关联线、无关线隐藏、35%/70%/150%缩放字号、悬停、标签关闭及取消恢复场景。前端typecheck、画布及测试ESLint通过；git diff --check通过（仅行尾提示）。未运行浏览器视觉验证，测试使用X6/Worker替身。
