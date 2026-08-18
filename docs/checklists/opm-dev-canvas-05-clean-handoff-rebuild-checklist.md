# DEV-CANVAS-05 Clean Handoff/Evidence Bundle Rebuild Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-05-clean-handoff-rebuild-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标：规格第1章。
- 修改边界：规格第4章。
- 验收：规格第7章。
- 兼容与回滚：规格第8、9章。

## Plan

- [x] 已确认旧 Bundle 缺目标 replay entry。
- [x] 已确认主工作树 dirty，不能直接作为 clean source。
- [x] 已冻结独立worktree、版本化输出和整体同步边界。
- [x] 建立并验证clean source commit。
- [x] 生成并验证新Handoff/Bundle/Runtime/descriptor/Intake。
- [x] 同步当前工作树并更新状态入口。

## Build

- [x] bundle source包含`0.2.0/handoff/reports`。
- [x] fresh版本化release root已生成，旧`handoff/release/**`未覆盖。
- [x] 新Handoff引用版本化Bundle和Runtime JAR。
- [x] READY Intake位于同一版本化release root。

## Verify

- [x] clean source与descriptor source commit一致：`1847172f509005e8d50b525e274d41b9d73cf46c`、`dirty_before_build=false`。
- [x] replay exact archive entry唯一且raw SHA闭合：`3e3c9d9e6e444e30ed86fbca9cf10e2923f236e7acd84630bdd68ee9efe5b3da`。
- [x] Handoff validator通过，状态READY、6/6 Gate、34/34 Capability。
- [x] Intake Schema/semantic检查通过，8/8、34/34、零blocker。
- [x] 新Handoff全部fileRef、Bundle/JAR ref和Intake handoff ref复算通过。
- [x] `git diff --check`通过。

## Frozen Artifact Set

| 资产 | SHA-256 |
| --- | --- |
| Evidence Bundle | `f336780b3f3641accbdd7b4fa5432f3041d5701dcba0e474edfbef63543f7360` |
| Runtime JAR | `0cfe0f14f2190e64e4cbc39b8a8bfbb8c9a5b733607cb24c4801c872f87b3f49` |
| Release Build descriptor | `b04558d6ff29417372be6a0a0391b4c37b349dcd236a327d09573c895e25a76f` |
| 固定路径 Handoff | `aab281cf686d2b3c0e4ef1e9f62860d9318e3bed11c805e1dd53a40cd6f8e5a4` |
| Intake Report | `9bff5271d28723b6e076534566fb19a625ee8a66caffb846ce46431a92107887` |

## Release Boundary

- [x] 未生成DEV-CANVAS-06 Visual/E2E/Performance/Recovery READY Report、Candidate或Activation。
- [x] production gate保持`DISABLED + []`。
- [x] 未启用Capability，未声明ISO符合性。
