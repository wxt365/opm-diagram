# Task Checklist: OPM DEV-CANVAS-02 Procedural Links

## Spec Mapping

- 规格：`specs/opm-dev-canvas-02-procedural-links-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`frontend-vue`、`testing`
- 目标：16 类 Procedural Link 的资产、候选、命令、Projection、符号、OPL/Trace 与 P03 闭环。
- 非目标：Control、Structural、fan、migration、P01/P02、性能/标准符合性声明。
- 约束：端点顺序必须由服务器规范化；多候选不能自动提交；不以 Consumption 资产代替其他能力。
- 验收：16 项逐项的 descriptor/正反端点/command/Rule/Projection/组件测试和 E2E。
- 验证：资产 digest、契约、后端/前端测试、Java 21 verify、Playwright、diff check。
- 回滚：关闭 capability enablement，已存在 Fact 只读可投影。

## 分析

- [x] 确认 DEV-CANVAS-01 已完成 State 基线。
- [x] 确认当前 Profile/Rule/Grammar 仅有 Consumption，不能直接启用完整目录。
- [x] 冻结 16 项 Capability、端点、符号、模板与 Rule 的资产矩阵。

## 实现

- [x] 补齐 16 项 Profile/Rule/Grammar/Symbol 资产和加载验证。
- [x] 实现候选计算、CREATE_FACT/UPDATE_FACT option 过期守卫、Fact 命令和端点规范化。
- [x] 实现 16 类 Projection/X6/OPL/Trace；逐 Capability golden 仍由后续测试项覆盖。
- [x] 实现 P03 Runtime 关系目录、候选选择、检查器和命令反馈；支持累计 2 至 3 个端点后显式查询候选。
- [x] 覆盖候选错误/过期、Self-invocation 稳定 ID、`PT0S`/负值/非法 Exception duration、16 类 Runtime 正向命令/Projection/OPL，以及 16 个 Procedural Capability 的真实浏览器候选、提交与重开路径。
- [x] 补齐 16 个 Procedural Capability 的视觉差异验收：真实 Runtime Playwright 断言闭合箭头、Effect 双端箭头、Agent/Instrument 圆形 marker、Invocation 闪电线、Self-invocation 自环与 Overtime/Undertime 时间注记。

## 验证与交付

- [x] 执行 contract generate/check/validate 与资产 digest 校验。
- [x] 执行 lint、typecheck、Vitest、build。
- [x] 使用 Java 21 执行 Local Runtime verify；完整 Maven `verify` 通过（56 项）。
- [x] 执行 Local Runtime E2E、浏览器三视口和 diff check；16 个 Procedural Capability 的 P01-P03 候选、提交、OPL 与重开路径已通过，其中 Consumption 主路径覆盖三个视口。
- [x] 执行 16 个 Procedural Capability 的视觉差异验收：`OPM_E2E_EXTERNAL_SERVERS=true npx playwright test --config=tests/e2e/playwright.config.ts -g '16 类 Procedural Link 以冻结的 SVG marker、路径和时间注记呈现'` 通过。
