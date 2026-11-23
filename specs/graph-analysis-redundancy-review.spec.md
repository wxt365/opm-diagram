# 图谱分析追加冗余审查

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L2；Task Type: refactor；Active Playbooks: none (primary)。repo-profile、refactor task-type 文件缺失。

目标：在当前未提交修改基础上，删除确认等价的重复查询与样式声明。非目标：改变标签内容、显示规则、交互、布局和请求行为。
允许：GraphAnalysisCanvas.vue、GraphAnalysisPanel.vue、本规格与对应 checklist；允许任务文档，不新增测试。禁止：其他目录文件、公共 API、schema、配置、依赖及后端；保留全部既有修改。契约无变化。

验收：A1 图例排序和首个关系标签保持；A2 选中连线样式及标签回归保持；A3 删除重复 CSS 后保留相同计算样式；A4 前端测试、类型检查和定向 ESLint 通过。

Plan：图例从 Map entries 直接读取标签；每条连线样式更新复用一次 cell 查询；删除被已有选择器覆盖或重复的 display/gap/align-items 声明。标签避让、缓存及异步防竞态保持。依次执行定向测试、全前端测试、类型与定向 lint。

回滚：仅反向撤销本轮小块差异，不恢复整个文件，避免覆盖既有修改。
