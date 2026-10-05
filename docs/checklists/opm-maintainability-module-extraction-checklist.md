# 大文件拆分检查清单

规格：[任务规格](../../specs/opm-maintainability-module-extraction-task-spec.md)

- [x] 边界：保留当前未提交功能；不改 API、Schema、依赖、数据库或发布状态。
- [x] 基线：前端 221/221；后端定向 229/229。
- [x] RF-01：后端查询与规则职责拆分；定向及全量回归已执行。
- [x] RF-02：OPL 职责拆分；包含 golden、Trace 与多 Context 的回归通过。
- [x] RF-03：工作台职责拆分；typecheck、lint、221/221 前端单测通过。
- [x] RF-04：页面、画布和样式拆分；build、CSS AST 等价、24 项浏览器回归通过；2 项既有行为差异保留失败记录。
- [x] RF-05：差异及职责边界核对完成；完整文件清单、失败与未纳入边界见[报告](../reports/opm-maintainability-module-extraction-report.md)。

回归未全绿：后端全量 484/486；工作台浏览器 24/26。以上勾选表示拆分和规定检查已执行，不表示仓库所有功能验收通过。
