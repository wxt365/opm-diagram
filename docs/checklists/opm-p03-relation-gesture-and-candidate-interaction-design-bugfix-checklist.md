# Checklist: P03 关系手势与统一候选交互设计修正

## Spec Mapping

- 规格：`specs/opm-p03-relation-gesture-and-candidate-interaction-design-bugfix-task-spec.md`
- 验收：`REL-GESTURE-DESIGN-01` 至 `REL-GESTURE-DESIGN-08`
- 边界：只冻结设计和后继实现输入；本 checklist 不修改或验收产品代码、OpenAPI、Runtime、Vue、E2E、release 或 ISO 证据。

## Design

- [x] `REL-GESTURE-DESIGN-01` 单一关系入口、16/8/10 分组和 Control 路径已同步。
- [x] `REL-GESTURE-DESIGN-02` Catalog 选择上下文与目录项机器字段已冻结。
- [x] `REL-GESTURE-DESIGN-03` 七阶段状态机、四类 X6 事件和取消原因已冻结。
- [x] `REL-GESTURE-DESIGN-04` binary/fan/Self/State-specified 端点交互已冻结。
- [x] `REL-GESTURE-DESIGN-05` 26 个基础 Capability 的统一 preview/confirm 门已冻结。
- [x] `REL-GESTURE-DESIGN-06` preview/committed/Control/anchor/OPL/Trace 隔离已冻结。
- [x] `REL-GESTURE-DESIGN-07` 零提交、失败保留和 committed 回流已冻结。
- [x] `REL-GESTURE-DESIGN-08` API 语义、五份设计、handoff、索引、基线和实现规格已同步。

## Verify

- [x] 当前活动设计不再保留两个同质关系按钮或 option 直接提交路径。
- [x] Catalog 字段、状态、事件、错误码和实现验收均有唯一 owner。
- [x] 新增及受影响 Markdown 本地链接、代码围栏和尾随空白有效。
- [x] `npm run contract:validate` 与 `git diff --check` 通过。
- [x] 未把设计验证表述为 Runtime、浏览器、生产发布或 ISO 证据。

## Verify Record

- `2026-09-03`：检查 27 份本轮变更 Markdown 的本地链接，目标全部存在；检查 8 份关系设计/规格文档，代码围栏成对。
- `2026-09-03`：检查活动设计，旧双关系按钮和 Procedural option 直接提交口径均为零命中；Catalog 字段、七阶段状态、四类 X6 事件、interaction mode 和稳定 reason code 均有唯一冻结定义。
- `2026-09-03`：`npm run contract:validate` 通过；`git diff --check -- docs specs` 通过。
- `2026-09-03`：Build 前验证补充冻结三端点关系的 `endpoint-selected -> relation-armed` 未达 `min_endpoints` 分支；该修正不增加前端端点合法性规则。
- 上述结果仅证明设计文档闭环和当前机器契约未被设计变更破坏，不构成产品实现、Runtime、浏览器 E2E、DEV-CANVAS-06、Candidate、Activation、生产发布或 ISO 符合性证据。
