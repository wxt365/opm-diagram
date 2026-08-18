# Checklist: DEV-CANVAS-06 Golden Authoring Schema 实现

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-authoring-schema-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标、范围、非目标、约束、验收、回滚：以规格第 1 至第 6 节为准。
- 修改边界：仅三份 Schema、Schema contract test、命令入口与本实现切片文档；不修改 API、数据、运行时或 approved golden。

## Build

- [x] 已核对冻结 Golden Authoring 设计中的 identity、字段、状态、路径和固定数量。
- [x] 新增 Capture Plan Schema 及正反例。
- [x] 新增 Approval Record Schema 及正反例。
- [x] 新增 Authoring Report Schema 及正反例。
- [x] 新增稳定 npm 测试入口。

## Verify

- [x] AJV draft 2020-12 可编译并通过三类正例。
- [x] Capture Plan 的 golden 字段、错误数量与路径反例被拒绝。
- [x] Approval/Report 状态与条件字段反例被拒绝。
- [x] `git diff --check` 通过。

## Risks And Residuals

- [x] JSON Schema 不负责跨文件 ref/SHA、身份不等、SemVer 比较或不可变发布；这些必须由后续 runner 复算。
- [x] 本切片不生成 candidate、approved golden、Visual Manifest/Report、Candidate 或 Activation。
- [x] `GATE-06-03` 仍为 `BLOCKED`，没有 Capability 被启用，也不构成 ISO 证据。
