# Task Checklist: OPM DEV-06 M02/M09 P0 Local API

## Spec Mapping

- 规格：`specs/opm-dev-06-p0-api-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`
- 目标：16 个 P0 Local API、本地守卫、任务与基线最小闭环。
- 范围：MVC/application/storage adapter、测试和 Maven MVC 依赖。
- 非目标：OpenAPI/V1/前端修改、完整 command/rule/ISO 能力。
- 验收：operationId、五写守卫、Project 到 Baseline 临时 SQLite 链路。
- 回滚：删除新增 API 代码和 MVC 依赖；无 schema/API 契约回滚。

## 分析

- [x] 枚举 OpenAPI 的 16 个 operationId
- [x] 确认运行时仅有 Actuator，缺少 MVC 层、DTO、控制器和项目/模型仓储
- [x] 确认 V1 与 DEV-05 提供 API 所需的最小持久化分区

## 实现与测试

- [x] 建立 MVC、统一错误 envelope 和本地写守卫
- [x] 实现 Project/Model/Context/Text/Revision/Baseline/Task 应用用例与适配器
- [x] 实现 P0 Object/Process/Consumption 命令到 DEV-05 提交协调器的映射
- [x] 覆盖 16 operationId、五写守卫、任务/SSE 和临时 SQLite 主路径

## 验证与交付

- [x] 执行 MVC 定向测试、Java 21 根级 verify、contract validate、diff check
- [x] 人工核对本包未修改 OpenAPI/V1/前端/资产
- [x] 输出 Acceptance Mapping、兼容性影响、文件、验证与风险
