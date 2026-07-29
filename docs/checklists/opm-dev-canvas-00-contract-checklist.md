# Task Checklist: OPM DEV-CANVAS-00 State/Fact/Capability Contract

## Spec Mapping

- 规格：`specs/opm-dev-canvas-00-contract-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`frontend-vue`、`testing`
- 目标：扩展 `API-EDT-001/002` 的完整画布机器契约并生成 DTO。
- 范围：OpenAPI、结构 DTO、生成器、API 适配边界和契约测试。
- 非目标：State/Fact 领域实现、SQLite、完整画布前端、Capability 生产启用。
- 约束：保留 P0 operationId、command/payload 兼容；无临时手写 DTO；不伪造新增命令成功。
- 验收：OpenAPI/生成/正反契约/API 回归/质量门均通过。
- 验证：contract validate、generation check、前端质量门、Java 21 verify、diff check。
- 回滚：回退新增兼容扩展与生成产物；不涉及数据或迁移。

## 分析

- [x] 确认 P0 API 的 `allowed/forbidden` 不足以承载完整画布候选。
- [x] 确认完整 State/Fact payload 与 option 字段由设计文档冻结。
- [x] 确认本包不得实现 State/Fact 语义或启用前端工具。
- [x] 确认现有 OpenAPI 校验和 TypeScript/Java 生成入口可复用或需最小新增。

## 实现

- [x] 将 `API-EDT-001` 扩展为结构化 option，并保留 P0 字段。
- [x] 将 `API-EDT-002` 扩展为封闭 command/payload union，并保留 P0 payload。
- [x] 增加 OpenAPI 驱动的 TypeScript/Java DTO 生成及漂移检测。
- [x] 增加 Local Runtime 兼容适配和正反 contract tests。

## 验证与交付

- [x] 执行 contract validate 和 generation check。
- [x] 执行前端 lint/typecheck/Vitest/build。
- [x] 使用 Java 21 执行后端 verify。
- [x] 执行 diff check，并记录 DEV-CANVAS-01 仍需的领域前置条件。
