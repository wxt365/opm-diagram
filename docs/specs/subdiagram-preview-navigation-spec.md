# 子图预览导航

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary).

目标：OPD导航列出暂存父子图并可切换；生成会话范围固定，不因浏览图变化中断；应用后正式导航使用后端名称。允许修改WorkbenchView、子图预览导航helper与测试、对应WorkbenchView测试和本规格清单。禁止后端/API/schema/依赖/模型数据/.harness改动。

验收NAV-01 正式图与previewViews合并去重、层级和中文名/预览标记；NAV-02 子图预览点击不请求未保存OPD或改路由，持续更新保留所选图；NAV-03 生成会话固定原OPD，切换不会清除预览/中断watch；NAV-04 切换预览自动适应视口，应用后刷新正式图导航。

计划：独立预览导航合并函数、选择预览与真实导航分流；保留会话原context，草稿版本变化仍清除过期预览；切图适应画布。定向Vitest/typecheck后交付。回滚：恢复前端实现，无存储变化。
