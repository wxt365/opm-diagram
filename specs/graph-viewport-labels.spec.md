# 图谱视口标签

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：只有视口内标签参与名额与避让，平移立即重新计算；保留选择、搜索、节点尺寸和标签开关。非目标：不取消真实重叠避让、不改模型或布局。
边界：允许GraphAnalysisCanvas.vue及其测试、本任务specs文档；禁止API/schema/配置/依赖/后端及无关文件；保留已有差异，无契约变化。
验收：A1 视口外高连接节点不占名额；A2 平移后进入视野节点显示名称，离开后释放名额；A3 缩放、端点标签、搜索和标签开关回归通过；A4 类型和ESLint通过。
Plan：使用X6图坐标到视口坐标变换，按标签矩形与视口相交判断；监听translate复用标签入口；新增超预算及平移场景测试。
验证：图谱定向测试、typecheck、ESLint；浏览器未验证时明确。回滚仅撤销本轮差异。
