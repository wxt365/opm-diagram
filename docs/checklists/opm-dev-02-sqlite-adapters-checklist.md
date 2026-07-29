# Task Checklist: OPM DEV-02 SQLite V1 与 M12 本地适配层

## Spec Mapping

- 当前任务规格文档：`specs/opm-dev-02-sqlite-adapters-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`backend-springboot (primary)`、`db-migration`、`testing`
- 目标：以 Flyway 运行 V1，并提供 SQLite/M12 最小适配、迁移恢复状态和 schema metadata Repository。
- 范围：`services/local-runtime/**`、本包文档与运行迁移说明。
- 非目标：V1 SQL 变更、领域用例、API、前端、完整恢复和非 SQLite 方言。
- 约束：SQLite only、V1 唯一事实源、无 JDBC 泄漏、正常启动无数据库副作用。
- 验收：空库、外键、触发器、PRAGMA、幂等迁移、失败 marker/恢复点与根级验证。
- 回滚：V1 无 down migration；使用迁移前恢复点或删除失败的临时空库。

## Task 1 - 分析

- [x] 阅读 DEV-02 DoD、V1 SQL、物理数据和持久化契约
- [x] 确认 SQLite 是唯一目标数据库
- [x] 阅读 `backend-springboot`、`db-migration` 和 `testing` 规则
- [x] 确认已有 V1 SQL 不可修改、当前无持久化实现

## Task 2 - 实现

- [x] 装配 Flyway 与 SQLite 依赖及唯一 V1 资源来源
- [x] 实现受控项目数据库路径与 SQLite PRAGMA
- [x] 实现 validate/migrate、恢复点、失败 marker 和不可写结果
- [x] 实现不可泄漏 JDBC 的 schema metadata Repository
- [x] 补空库、约束、PRAGMA、重复迁移和失败恢复测试

## Task 3 - 验证

- [x] 执行定向 SQLite/Flyway 集成测试
- [x] 执行 Java 21 根级 `./mvnw verify`
- [x] 执行 `npm run contract:validate` 与 `git diff --check`
- [x] 人工核对 V1 未修改、资源无重复、无 API/前端变更

## Task 4 - 交付

- [x] 输出 Task Type、Active Playbooks、Acceptance Mapping 与兼容性影响
- [x] 输出修改文件、验证、事实与遗留风险
