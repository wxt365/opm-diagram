# 图谱缩小隐藏文字

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: none (primary)。遵循AGENTS.md，repo-profile/task-type缺失。
目标：缩放低于50%时隐藏全部节点及边标签，达到50%恢复既有视口、选择、搜索及避让规则；节点/边及详情保留。参考彩色连线对应关系类型，本次仅解释，不调整配色。
非目标：不改布局、标签总开关、模型语义或持久化。
边界：允许GraphAnalysisCanvas.vue、GraphAnalysisCanvas.spec.ts及本任务specs文档；禁止API/schema/配置/依赖/后端及无关文件；保留已有差异。无契约变化。
验收：A1 10%/35%/49%所有标签隐藏，选择/搜索/悬停不绕过阈值；A2 50%/70%恢复既有显示，标签开关仍生效；A3 节点及关系数不变、定向回归/类型/ESLint通过。
Plan：共用阈值常量，节点和边入口统一判断，补充阈值边界与交互回归。
验证：图谱定向测试、typecheck、ESLint；未运行浏览器时说明。回滚仅撤销本轮差异。
