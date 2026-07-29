# Task Checklist: OPM DEV-09 P0 Test and Runtime Smoke

## Spec Mapping

- 规格：`specs/opm-dev-09-p0-test-and-runtime-smoke-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`frontend-vue`、`backend-springboot`
- 目标：真实 P0 浏览器 E2E 与 Local Runtime 运行 smoke。
- 范围：E2E 启动、隔离数据、P01-P03 已实现主路径、OPL/Revision/校验/重开/viewport。
- 非目标：Mock 驱动验收、Baseline Draft、P04-P06、State、完整画布、OpenAPI/V1/依赖。
- 约束：每场景隔离 storage；同源会话；不伪造未实现 API。
- 验收：`test:e2e` 可重复、P0 主路径真实、三视口可达、报告保留设计缺口。
- 验证：Playwright、前端质量门、Java 21 verify、contract validate、diff check。
- 回滚：移除 E2E 测试支持；仅临时测试数据可删除。

## 分析

- [x] 确认现有 E2E 断言设计确认 fixture，不能证明真实 Runtime。
- [x] 确认 P0 API 覆盖项目、模型、workspace、命令、文本、校验与 revisions。
- [x] 确认 Baseline/Draft 打开链路缺少 API/DTO，禁止 Mock 补齐。
- [x] 冻结 E2E 启动、端口、临时 storage 与清理策略。

## 实现与测试

- [x] 以真实 Local Runtime 改造 P01 -> P03 主路径 E2E。
- [x] 覆盖 Object/Process/Consumption -> OPL -> Revision -> 校验 -> 重开。
- [x] 覆盖三个目标视口与移动端画布平移。
- [x] 补充当前可构造的失败回归：缺少 Object/Process 时 Consumption 被前端阻断且 Revision 不变。

## 验证与交付

- [x] 执行 `npm run test:e2e`：真实 Local Runtime + Vite，1 个 P0 主路径场景通过。
- [x] 执行前端/后端/契约/diff 全量回归：lint、typecheck、Vitest 29、production build、Java 21 verify 47、contract validate 和 diff check 均通过。
- [x] 更新清单并记录 DEV-09 Baseline/Draft 设计阻断：当前 API 无法按 Baseline 打开或基于 Baseline 创建 Draft，不能以 Mock 补齐验收。
