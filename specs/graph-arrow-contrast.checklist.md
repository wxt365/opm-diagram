# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
本轮微调：用户反馈过强，普通箭头透明度0.9→0.55，尺寸6→5，选择与无关淡化不变；边界仍仅画布/测试/本记录，验证定向回归。
本轮实际验证：画布15/15通过，未执行浏览器视觉验证。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：提高箭头对比，按类型色明确填充，尺寸5改6；线身透明度与箭头分离，选中后无关箭头仍淡化，无向/双向正确。允许GraphAnalysisCanvas.vue及测试、本文档；禁止其他文件/API/schema/配置/依赖，保留既有差异。A1 透明度分离且高亮保留；A2 图谱回归/类型/ESLint通过。Plan：styleSelection统一标记，删除render重复标记；测试方向及选择。回滚仅撤销本轮差异。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：图谱画布/面板29/29通过；覆盖箭头0.9透明度与线身0.25分离、6尺寸、无向/双向、选中1与无关0.08淡化。typecheck、相关ESLint通过。未运行真实浏览器视觉验证。
