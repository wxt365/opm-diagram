# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：图谱图例默认收起，删除重新布局按钮及其面板绑定/导入；保留画布布局错误重试和自动布局、缩放和显隐入口。允许GraphAnalysisPanel.vue及测试、tests/e2e/opm-graph-analysis.spec.ts、本文档；禁止公共API/schema/依赖/配置及其他文件，保留已有差异。A1 默认关闭无重新布局图标；A2 手动展开筛选、缩放不受影响。验证面板测试和ESLint；回滚仅撤销本轮差异。
Plan：设置默认false、删除按钮绑定、同步测试及e2e旧入口。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：面板14/14通过，包含默认收起、无重新布局按钮、展开过滤与缩放常显；相关ESLint通过。e2e同步展开入口和旧按钮删除；未执行浏览器/e2e验证。保留Canvas内部rearrange用于布局错误重试。
