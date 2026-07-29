# Task Checklist: OPM DEV-03 M04/M05 核心语义与 Context

## Spec Mapping

- 当前任务规格文档：`specs/opm-dev-03-semantic-context-task-spec.md`
- `Task Type`：`feature`
- `Active Playbooks`：`backend-springboot (primary)`、`testing`
- 目标：提供不可变 M04/M05 领域值、contract reader 和身份/引用闭合校验。
- 范围：`services/local-runtime/**/semantic/**`、本包规格与 checklist。
- 非目标：命令、提交、SQLite Repository、规则执行、OPL、API、前端、Refinement/View/语义布局。
- 约束：不改冻结 contracts/Profile/Rule/V1；无 Jackson/JDBC 泄漏；无文件写入或默认工作区副作用。
- 验收：最小 fixture 读取成功，身份/State/Fact/Context/Layout 负例有稳定 code，Java/contract/diff 验证通过。
- 回滚：删除本包新增内存领域代码和测试；不需要数据或 API 回滚。

## Task 1 - 分析

- [x] 阅读 DEV-03 DoD、M04/M05 职责和公共不变量
- [x] 阅读 Revision schema、最小 fixture、Profile/Rule 的代表性边界
- [x] 确认当前无 M04/M05 Java 实现，且完整 Capability/Rule 执行不属于本包
- [x] 阅读 `backend-springboot` 与 `testing` playbook

## Task 2 - 实现

- [x] 实现不可变 SemanticRevision 与 M04/M05 领域值
- [x] 实现冻结 Revision contract 的读取器和领域错误
- [x] 实现身份、Profile binding、State、Fact、Context/Occurrence/Layout 校验
- [x] 保持普通 Layout 与语义事实隔离，不增加持久化/API 副作用

## Task 3 - 测试

- [x] 覆盖最小 fixture 正向读取和跨 Context 稳定身份
- [x] 覆盖全部稳定错误 code 的关键负例
- [x] 检查公开领域 API 不泄漏 Jackson/JDBC 或可变集合

## Task 4 - 验证

- [x] 执行定向 M04/M05 领域单元测试
- [x] 执行 Java 21 根级 `./mvnw verify`
- [x] 执行 `npm run contract:validate` 与 `git diff --check`
- [x] 人工核对 contracts、Profile/Rule、V1、API 与前端未修改

## Task 5 - 交付

- [x] 输出 Task Type、Active Playbooks、Acceptance Mapping 与兼容性影响
- [x] 输出修改文件、验证、事实与遗留风险
