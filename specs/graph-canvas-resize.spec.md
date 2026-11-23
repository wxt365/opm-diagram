# 图谱详情栏关闭后画布尺寸

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。遵循 AGENTS.md；repo-profile/task type 文件缺失。
目标：详情栏开关后画布填充实际可用区域，消除右侧空白，保持缩放和节点位置。非目标：不改变布局算法、模型或详情选择语义。
边界：允许 GraphAnalysisCanvas.vue、GraphAnalysisCanvas.spec.ts 和本任务 specs 文档；禁止 API/schema/配置/依赖/后端和无关文件。保留已有差异，无公共契约影响。
验收：A1 监听父容器而非被X6固定尺寸的host；A2 父区域宽高变化与重新激活后resize使用父尺寸，更新标签，不fit或重排；A3 定向测试、类型和ESLint通过。
Plan：复用resize入口统一读取父容器；观察父容器并在激活时复用；模拟父与host尺寸不一致验证开关详情场景。
验证：画布/面板测试、typecheck、ESLint；未运行浏览器时说明。回滚仅撤销本轮差异。
