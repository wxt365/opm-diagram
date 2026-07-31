# Task Checklist: OPM P0 Runtime Profile Binding 修复

## Spec Mapping

- 当前规格：`specs/opm-profile-binding-p0-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`frontend-vue (primary)`、`backend-springboot`、`testing`
- 目标：移除前端 Profile 版本硬编码，统一模型创建、编辑和校验的 Runtime binding。
- 范围：Runtime Bootstrap、前端 API、必要测试和本文件。
- 非目标：OpenAPI、schema、Profile 资产、DEV-CANVAS-06、96 Capability、`.opmp`。
- 约束：不新增公共 operationId 或依赖；不回退为前端版本常量。
- 验收：P01 -> P02 -> P03 无 `RULE_VERSION_CONFLICT`；现有 8 条 Playwright 通过。
- 验证：前端单元测试、Runtime 定向测试、完整现有 Playwright。
- 回滚：回退本任务涉及的 Bootstrap/API/测试与本规格；无数据回滚。

## Task 1 - 复现与根因

- [x] 确认前端模型创建、编辑、校验都调用固定 `defaultBinding()`。
- [x] 确认 Runtime 活动 Profile 为 `0.2.0`，不匹配时返回 `RULE_VERSION_CONFLICT`。
- [x] 确认已有 `/opm-bootstrap.js` 是同源、无缓存的启动配置入口。

## Task 2 - 测试与实现

- [x] 先为 Bootstrap binding 输出、三类请求体和缺失 binding 拒绝路径建立回归覆盖。
- [x] Runtime 从 `LocalApiService` 活动 binding 输出 Bootstrap 配置。
- [x] 前端删除硬编码 binding，并统一从 Bootstrap binding 构建三类写请求。

## Task 3 - 验证与交付

- [x] 执行前端定向单元测试与 Runtime 定向测试。
- [x] 执行 `npm run test:e2e`，确认 8/8 PASS；State Effect 场景使用冻结模板要求的同一 Object 状态转换。
- [x] 记录 Root Cause、Fix Strategy、风险与未覆盖范围。
