# Spec: OPM P0 在线建模完整链路复验

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `frontend-vue`
- `backend-springboot`

## 1. 目标

在 Runtime Profile binding 修复后，重新以真实浏览器和 Local Runtime 验证 P01 -> P02 -> P03 的在线建模链路。逐项确认 State、16 类 Procedural、8 类 Control、10 类 Structural、Fundamental fan、Runtime 候选、提交、OPL、Trace 和刷新重开可用；不得再以原 `RULE_VERSION_CONFLICT` 直接推断后续能力失败。

## 2. 范围

允许修改：

- `tests/e2e/workbench-layout.spec.ts`，仅补足在线文本 Trace 的可观察断言；
- `apps/web/src/stores/workbenchRuntime.ts`，仅修复已复现的 Structural `DIRECTED` 标签前置校验；
- 本规格、checklist 和本轮验证报告。

禁止修改：

- Runtime 语义实现、Profile/Rule/Grammar/Symbol 资产、SQLite migration、OpenAPI/公共 operationId、依赖；
- DEV-CANVAS-05 正式 handoff、DEV-CANVAS-06、96 Capability 闭包和 `.opmp`；
- 无关页面、路由或样式。

## 3. 已复现根因与基线

事实：此前 P02 模型创建、P03 编辑及校验请求发送固定 `profile_version=0.1.0`，而 Runtime 活动 Profile 为 `0.2.0`，所有在线编辑命令因 `RULE_VERSION_CONFLICT` 失败。

最小复现：创建 Project 后创建 Model，Runtime 返回 `409 RULE_VERSION_CONFLICT`，故 P03 不可进入有效编辑状态。

当前修复基线：Bootstrap 下发活动 binding，前端创建模型、编辑和校验统一读取该 binding；现有 Playwright 已通过 `8/8`。本规格不把这项回归结果外推为所有在线能力已通过，必须逐项实测。

追加复现：`CAP-ISO-STRUCT-010` 在 `DIRECTED` 状态仅填写 Profile 要求的 `forward_tag` 时，P03 错误地要求可选 `reverse_tag`，不发送命令且 Revision 不变。

## 4. 验收

1. State：Object State 可由 Runtime 候选创建，产生新 Revision，并在刷新后保留 Projection 与文本关联。
2. Procedural：`CAP-ISO-PROC-001~016` 均经 P03 选择端点、查询 Runtime 候选、显式选择并提交；Exception duration、Self-invocation 和 State owner 路径可用；OPD 符号与 OPL 句子在刷新后保持。
3. Control：`CAP-ISO-CTRL-001~008` 均经选中的基础 Procedural Fact 查询 Runtime 候选并以 `UPDATE_FACT` 提交；每个 Fact 的 Control 注记、Revision 和刷新结果一致。
4. Structural：`CAP-ISO-STRUCT-001~010` 均可经 Runtime 候选提交；必填标签、方向、完整性、Feature Value State 和 Fundamental fan 成员更新均使用候选契约；fan 的 Fact ID 刷新后稳定。
5. Text：在线 P03 点击 OPL 句子可由 Runtime Text Projection 的 Trace 定位到当前 Revision 的对应 Fact；Trace 的 `fact_ids`、`occurrence_ids` 完整性由 Runtime 文本服务测试验证。
6. 校验、历史和刷新重开：提交后校验可完成，当前 Revision、OPD、OPL、Trace 与关联稳定。

## 5. 验证方式

1. 保留并运行现有 8 条真实 Playwright 场景；补充 OPL 句子 Trace 定位 Fact 的页面级断言，避免只验证前端显示的 OPL 文本。
2. 运行前端单元测试、lint、typecheck；仅在本轮修改 E2E 时运行定向/完整 Playwright。
3. 对 Runtime 服务运行相关测试，使用工程规定的 JDK 21。

## 6. 回滚与风险

若新增 Trace 断言揭示 Runtime 或页面缺陷，回滚只移除本轮 E2E/文档变更；不得回退已修复的 Profile binding。浏览器 8 条场景仍不是 DEV-CANVAS-06 冻结的发布 E2E catalog，也不能证明 96 Capability、`.opmp`、发布或 ISO 符合性。
