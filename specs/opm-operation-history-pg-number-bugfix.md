# PostgreSQL 操作历史数字兼容

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L2; Task Type: bugfix; Active Playbooks: none (primary)。规则入口文件缺失情况沿用 specs/opm-operation-history-undo-task-spec.md。

## Spec
目标：修复历史序号以 JSON 数字 4.0 持久化后 PostgreSQL 查询报 invalid input syntax for type bigint。
非目标：修改数据库数据、schema、密码配置、模型、其他历史行为。
允许：OperationHistoryRepository.java 及历史相关定向测试、本规格；允许重启本项目后端验证。
禁止：数据库/schema迁移、依赖、配置、其他模块重构、.harness 写入。
契约影响：无。JSON 数值先转 NUMERIC 再转 BIGINT，兼容整数的十进制表示；序号来源仍为服务端受校验收据。
验收 P1：SQLite 既有查询通过；P2：PostgreSQL 对 4.0 的历史查询通过；P3：重启后实际模型历史 API 返回成功且最新恢复动作可读取。
验证：真实 SQLite 回归、真实 PostgreSQL 隔离库定向测试、现有模型只读诊断、HTTP 查询与健康检查。
回滚：仅恢复本任务查询与测试差异；不操作现有数据。

## Plan
1. 修正查询中 JSON 序号的数值转换，补小数形式序号回归。
2. 编译和数据库验证后重启后端，执行历史 HTTP 查询。

## Checklist
Spec: specs/opm-operation-history-pg-number-bugfix.md
- [x] 边界确认：仅上述查询、测试、文档和运行服务。
- [x] P1
- [x] P2
- [x] P3

## 验证结果
- 只读复现确认 PostgreSQL 原始异常为 invalid input syntax for type bigint: "4.0"；未改动用户数据。
- SQLite DraftSaveControllerTest、DraftJournalRepositoryTest 合计 33 项通过；日志 test-results/history-pg-sqlite.log。
- PostgreSQL 隔离 schema 中 operationHistoryPaginationIsStableWhenTimesTieAndRejectsCrossScopeCursor 通过，105 条历史的 edit_seq/receipt_order 使用 0.0，验证分页、无重复、跨模型游标拒绝；日志 test-results/history-pg-isolated.log。
- 截图模型只读仓储查询成功返回 11 条记录；重启后通过 5173 前端代理访问真实历史 API 成功返回 11 条记录、1 条 REDO 动作；后端 health=UP。未在用户模型上执行撤销/重做写入。
- 改动文件：OperationHistoryRepository.java、DraftSaveControllerTest.java、本规格。用户自行更新的 application.yml 保留。
