# Checklist: OPD Capability 级关系渲染实现

## Spec Mapping

- 规格：`specs/opm-opd-capability-relation-renderer-implementation-task-spec.md`
- 风险：`L3`
- Task Type：`refactor`
- Active Playbooks：`none (primary)`

## Build

- [x] 建立 RenderSpec、基础 Definition Registry、Control Decorator Registry 与 X6 relation adapter。
- [x] 迁移 16 个 Procedural Definition、10 个 Structural Definition 和 8 个 Control Decorator。
- [x] 以 Capability Registry 接管 `OpdCanvas.vue` 已提交关系渲染，删除旧 family/symbol 分派。

## Verify

- [x] 覆盖注册完整性、fail-closed、Control identity 和输出 parity。
- [x] 前端单测、lint、typecheck、build、16/8/10 定向 E2E 和 diff 检查通过。
