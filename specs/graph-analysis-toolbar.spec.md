# 图谱工具栏调整

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。
仓库缺少 repo-profile 和 bugfix task type 文件，遵循 AGENTS.md。

## 目标、非目标及边界
按截图将显示标签移到左侧节点类型区，删除顶部刷新图谱按钮。按用户最新要求移除邻域选择及说明，固定一跳高亮。不改变邻域算法或后端契约。
允许修改 GraphAnalysisPanel.vue、GraphAnalysisPanel.spec.ts、tests/e2e/opm-graph-analysis.spec.ts 及本任务 specs 文档。禁止修改 API、schema、配置、依赖、后端和无关文件。保留之前画布修复，不覆盖已有差异。

## 验收
- A1：显示标签位于左侧节点类型区，仍控制画布标签。
- A2：无邻域选择及说明，固定向画布传入一跳深度。
- A3：顶部无刷新图谱按钮；过期提示可更新结果，失败可重试。
- A4：相关测试与类型、定向静态检查通过，同步已有 e2e 选择器。

## 验证及回滚
执行图谱画布/面板测试、前端类型检查和相关文件 ESLint；未启动服务时不宣称浏览器联调通过。
回滚仅撤销本任务上述文件差异和任务文档，不撤销之前画布修复。

## Plan
1. 移动标签控件、移除邻域选择并固定一跳，在过期状态提供更新入口。
2. 同步面板测试和 e2e 中对旧按钮的引用。
3. 执行检查并记录结果。
