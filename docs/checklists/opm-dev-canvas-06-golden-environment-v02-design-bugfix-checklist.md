# Checklist: DEV-CANVAS-06 Golden Environment 0.2 设计修正

> 状态：`FROZEN`。本 checklist 仅证明设计闭环，不构成 Schema、candidate、approval、release、Capability 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-environment-v02-design-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标/范围/非目标/冻结修正/验收/验证/回滚：分别映射规格第 2、4、3、5、7、8、9 节。

## Boundary

- [x] 当前缺口已证实：主设计第 6.2 节的 `os_name`、`arch`、browser executable SHA、`screenshot_options` 与 Environment `0.1` Schema 不闭合。
- [x] `0.1` 保持历史只读、byte-for-byte 不变；生产目标明确为独立路径的 `0.2`。
- [x] 本轮未修改 `docs/contracts/**`、代码、测试、package 命令或任何 release root。

## Design Closure

- [x] `0.2` 顶层字段、font 角色、browser evidence、路径和 raw SHA 边界已冻结。
- [x] fingerprint payload、数组排序、`environment_id` 派生与 `generated_at` 排除规则已冻结。
- [x] screenshot options、实际 browser/font 重验和 `0.1` 拒绝规则已冻结。
- [x] 03B candidate、04 publish、05 Visual Manifest 的 `0.2` 消费边界已同步。
- [x] 后续 Schema/verifier 实现切片和真实 release 前置条件已明确。

## Verify

- [ ] `0.2` JSON Schema 与 AJV 正反例：后续实现切片负责。
- [ ] runtime environment semantic verifier：后续实现切片负责。
- [ ] 真实 candidate/Approval/approved/Visual Manifest：不属于本任务。
- [x] `jq empty`、Markdown 链接/围栏和 `git diff --check` 通过；本轮未修改 JSON Schema。

## Risks And Residuals

- [x] 设计冻结不是可运行 Schema 或环境证明；03B 在 `0.2` Schema/verifier 完成前仍不得实现 browser capture/candidate writer。
- [x] `GATE-06-03`、Candidate、Activation、Capability 和 ISO 状态不提升。

## Rollback

- [x] 仅回退本轮设计文档；不得降级使用 `0.1` 规避 fingerprint 契约。
