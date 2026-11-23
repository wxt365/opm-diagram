# 图谱固定节点尺寸

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: bugfix；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：全部节点固定屏幕直径10px，不随度数、类型或选中变化；缩放不移除节点，明确节点高于连线。非目标：不让视口外节点强制留在画面，不改变布局与筛选；极小缩放下重合仍可能发生。
边界：允许GraphAnalysisCanvas.vue及其测试、本任务specs文件；禁止API/schema/配置/依赖/后端和无关文件；保留已有差异。
验收：A1 各类型/度数/选择/缩放下屏幕直径10px；A2 节点层高于连线，关闭标签不隐藏点，缩放不改变节点数量；A3 图谱测试、类型和ESLint通过。
Plan：固定半径并明确圆心和层级，复用反向缩放；新增尺寸及数量回归。验证定向测试/类型/ESLint；无浏览器实测不声称视觉问题完全复现。回滚仅撤销本轮差异。
