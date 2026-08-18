# Checklist: DEV-CANVAS-06 受控输入 Bundle Descriptor Schema 实现

> 状态：`COMPLETE`。本 checklist 不构成 bundle、Manifest、Gate、release 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-controlled-input-bundle-schema-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标、范围、非目标、契约、验收、验证和回滚分别映射规格第 1、3、4、6、7 节。

## Plan

- [x] 确认 Visual/E2E 输入修正规格与最新 `approved_version_ref` 冻结决定。
- [x] 限定本轮为静态 Schema 和 AJV 测试，未提前创建 builder 或 bundle。
- [x] 新增封闭 descriptor Schema。
- [x] 新增对象与 JSON `null` 正反例。
- [x] 接入定向 npm 入口并完成验证。

## Build

- [x] 根身份、class、ID、digest 与三个上游 ref 均封闭。
- [x] `approved_version_ref` 为 required，且只允许对象或 JSON `null`。
- [x] 对象 `path`、`golden_set_version`、`authoring_report_ref` 封闭并校验安全相对路径。
- [x] 根对象、引用对象和 approved version 对象拒绝未知字段。

## Verify

- [x] 对象和显式 `null` 两种静态结构均通过 AJV。
- [x] 字段缺失、对象不完整、unsafe path、非法 ID 与 unknown field 均被拒绝。
- [x] `npm run release:canvas06:controlled-input-bundle-schema:test` 通过。
- [x] `npm run contract:validate` 与 `git diff --check` 通过。

## Risks And Residuals

- [ ] Schema 不能判断 Visual/E2E 调用模式；两个 builder 必须实现对象/`null` 模式拒绝、JCS identity exact join、不同 descriptor/ID 与零输出退出码 `2`。
- [ ] 未生成受控 bundle、Manifest、Report、Candidate 或 Activation；GATE-06-03 仍为 `BLOCKED`。

## Rollback

- [ ] 仅回退本任务新增的 Schema、测试、命令、规格和 checklist。
- [ ] 不修改 approved bytes、生产 evidence 或既有 release Schema。
