# Plan

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。
Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: none (primary)。
## Lean Spec
目标：展开/收起同为底部工具本身宽度，减少原240px展开宽度，图例宽度100%且不参与容器固有宽度计算。允许GraphAnalysisPanel.vue和本文档；禁止其他文件/API/schema/配置/依赖，保留已有差异。A1 两状态同宽，关系文字单行；A2 面板测试/ESLint通过。Plan：删除展开最小宽度class并限制图例固有宽度贡献。回滚仅撤销本轮CSS/无用class。
## Checklist
Spec: Plan#Lean Spec
- [x] 边界确认：仅上述范围。
- [x] A1/A2

实际验证：面板14/14通过，ESLint通过。删除展开240px最小宽度，图例contain:inline-size不撑宽；沿用工具条内容宽度，减小图例横向内边距。未进行浏览器视觉验证。
