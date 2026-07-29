# Task Checklist: OPM DEV-CANVAS-03 Control Links

## Spec Mapping

- 规格：`specs/opm-dev-canvas-03-control-links-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`frontend-vue`、`testing`
- 目标：8 类 Control Capability 在基础 Procedural Fact 上以唯一 Modifier 对实现候选、命令、Projection、OPL/Trace 与 P03 闭环。
- 非目标：独立 CONTROL Fact/edge、Structural、fan、migration、P01/P02。
- 约束：Control pair 固定为 `control.capability` 与 `control.segment=PROCESS_INPUT`；Effect 输出段禁止；前端不推断 capability。
- 验收：8 项资产、候选/命令正反例、JSON roundtrip、OPL/X6、组件测试与 Runtime E2E。
- 验证：资产 digest、契约、后端/前端测试、Java 21 verify、Playwright、diff check。
- 回滚：关闭 Control candidate/编辑入口，保留历史 Fact 的只读投影。

## 分析

- [x] 以当前设计文档确认 Control 是基础 Fact 的 Modifier 对而非独立 Fact。
- [x] 确认现有 Modifier 已进入 Revision JSON，SQLite 无需 DDL。
- [x] 冻结 8 项 Capability 与允许基础 Fact 的资产矩阵。

## 实现

- [x] 补齐 8 项 Profile/Rule/Grammar/Symbol 资产和 manifest digest 验证。
- [x] 扩展 Option contract、生成 DTO 与 Runtime candidate。
- [x] 实现 `UPDATE_FACT` Control pair 原子守卫与 Revision Projection 重开。
- [ ] 实现 Control concrete OPL template/Trace；20 个基础 Fact 变体、Token/Trace 和 golden 输入已冻结，执行归属 `DEV-CANVAS-05`。
- [x] 实现 Projection/X6 `e/c` 注记与 P03 Runtime 入口。
- [x] 覆盖 8 项 Control command/Projection，以及 Result 无候选、Effect 输出段、基础 Capability 不匹配、Event/Condition 并存和候选过期反例。
- [x] 覆盖 8 类 Control 的 Local Runtime 浏览器提交、`e/c` 注记替换与刷新重开路径。
- [ ] 覆盖 Control concrete OPL/Trace；本项由 `DEV-CANVAS-05` 的 20 个 PASS case、阻断矩阵和 replay 证据关闭。

## 验证与交付

- [x] 执行 contract generate/check/validate 与资产 digest 校验。
- [x] 执行 typecheck 与 WorkbenchView 定向 Vitest。
- [x] 使用 Java 21 静态编译并直接运行 LocalApiService 的 Control 单例、8 Capability 矩阵和反例测试；Maven `verify` 仍受本机 Nexus 不可达阻断。
- [x] 执行完整 Local Runtime E2E、桌面/移动布局与 Control `e/c` 注记验收，以及 diff check。
