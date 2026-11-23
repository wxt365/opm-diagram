# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：图谱分析按钮按OPD工具按钮12px、32px最小高度、3px圆角、#4a5762文字与#0b5fae悬停/#eaf3fc背景统一；图谱背景使用OPD #fbfcfd与16px点阵。保留按钮布局、功能和图谱视觉规则。
边界：允许GraphAnalysisPanel.vue、GraphAnalysisCanvas.vue、本文档；禁止其他文件、API/schema/配置/依赖/后端，保留已有差异。A1 按钮规格及交互统一；A2 画布背景和网格一致；A3 现有图谱测试及定向ESLint通过。回滚仅撤销本轮样式和画布配置差异。
顺序：读取公共工具样式并复用数值，去除父面板对子画布按钮的宽泛覆盖，执行现有回归与静态检查。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围，无公共契约/依赖变化。
- [x] A1/A2/A3

实际验证：现有图谱画布/面板24/24通过，相关Vue文件ESLint通过。背景配置与OPD均为#fbfcfd、16px网格；按钮数值按公共tool-button核对。未运行浏览器视觉验证。
