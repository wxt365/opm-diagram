# 图谱力导向观感

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循 AGENTS.md，repo-profile/task-type缺失。
目标：紧凑整体、局部放射、点重线轻；保留选择、搜索、筛选和文字开关。非目标：不复制参考图拥挤标签、不引入新依赖、不修改语义或API。
边界：允许 graphAnalysisLayout.ts、GraphAnalysisCanvas.vue、相关图谱spec.ts及本任务specs文件；禁止后端/schema/API/配置/依赖及无关文件；保留已有差异。
验收：A1 碰撞按圆点距离而非长文字矩形，连接节点聚拢且拖拽不改变全图中心；A2 节点更醒目且核心节点略大，单边直连，多重边及自环保留弯曲；A3 现有选择/标签/筛选回归和新增布局测试通过；A4 类型和ESLint通过。
Plan：圆形碰撞、较短弹簧、按度数分配弹力使核心更稳定；节点半径随连接数温和增长，线条淡细；定向回归与结构性布局测试。
验证：图谱测试、typecheck和ESLint；真实浏览器效果未验证时明确。回滚仅撤销本任务差异。
