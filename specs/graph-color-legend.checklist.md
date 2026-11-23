# Checklist

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Spec: `specs/graph-color-legend.spec.md`
- [x] 边界确认：仅上述文件，无公共契约/依赖变化。
- [x] A1/A2/A3/A4

实际验证：图谱画布/面板24/24通过，含14/11px平方根缩放、生成/影响不同颜色、图例一致、选择不改色、过滤同步图例。typecheck与相关ESLint通过。未进行真实浏览器视觉验证。
