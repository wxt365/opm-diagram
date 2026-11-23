# 关系端点名称避让

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。仓库 repo-profile/bugfix task type 文件缺失，遵循 AGENTS.md。

## 目标、非目标与边界
选中关系两端名称最高优先显示，重叠时向下错开，其他标签避让；取消后恢复，标签开关有效。不改变节点位置或布局算法。
允许修改 GraphAnalysisCanvas.vue、GraphAnalysisCanvas.spec.ts 与本任务 specs 文档。禁止 API、schema、配置、依赖、后端及其他文件；保留既有修改。无契约影响。

## 验收
- A1：相邻/重合端点名称均显示且标签纵向错开至少 24 屏幕像素。
- A2：普通标签避让端点；缩放后保持间距，标签关闭隐藏，取消后恢复默认位置。
- A3：图谱定向回归、类型检查和定向 ESLint 通过。

## Plan
复用 occupied 碰撞索引，端点最先占位；碰撞时仅调整标签 refY，不移动节点；增加组件验证后运行检查。

## 验证与回滚
运行画布和面板测试、前端 typecheck 及画布相关 ESLint。浏览器未验证时明确限制。
回滚仅撤销本轮文件差异。
