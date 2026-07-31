# Task Checklist: OPM P0 在线建模完整链路复验

## Spec Mapping

- 当前规格：`specs/opm-online-modeling-chain-p0-reverification-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`testing (primary)`、`frontend-vue`、`backend-springboot`
- 目标：在已修复 Runtime binding 的基线上实际验证 P01 -> P02 -> P03 在线建模全链路。
- 范围：E2E Trace 可观察断言、验证文档和验证命令。
- 非目标：DEV-CANVAS-05/06、96 Capability、`.opmp`、Profile 资产、schema、OpenAPI 与依赖。
- 约束：所有关系必须通过 Runtime 候选获取契约并显式选择；不以 Golden 或单元测试替代浏览器证据。
- 验收：State、16 Procedural、8 Control、10 Structural、fan、候选、提交、OPL、Trace、校验及刷新重开均有在线证据。
- 验证：完整 Playwright、前端质量检查和 Runtime 相关测试；使用 JDK 21。
- 回滚：仅回退本轮 E2E/文档；无数据或 schema 回滚。

## Task 1 - 基线与最小复现

- [x] 确认前置根因为固定 `0.1.0` binding 与 Runtime `0.2.0` 冲突。
- [x] 确认 Bootstrap binding 修复后现有 Playwright `8/8 PASS`。
- [x] 确认现有 8 场景实际覆盖 State、16 Procedural、8 Control、代表性 Feature Structural 与 Aggregation fan，不把旧阻断推测为独立功能缺陷。
- [x] 复现并修复 `CAP-ISO-STRUCT-010` 在 `DIRECTED` 时错误强制 `reverse_tag` 的 P03 前置校验；Runtime 接受 Profile 要求的最小 `forward_tag`。

## Task 2 - Trace 证据

- [x] 为 OPL 句子增加通过 Trace 定位当前 Fact 的 E2E 断言。
- [x] 确认 Trace 完整性由 Runtime 文本服务测试覆盖，E2E 断言不依赖请求时序、浏览器共享状态或前端 Mock。

## Task 3 - 在线复验

- [x] 执行完整 9 条 Local Runtime Playwright 场景：既有 8 条及十类 Structural 专项；记录 State、16/8/10、fan、候选、提交、OPL、Trace、刷新重开的结果。
- [x] 执行前端单元测试、lint、typecheck、build 与 Runtime 相关测试。
- [x] 记录发现项；明确仍未覆盖的发布级目录与标准符合性边界。
