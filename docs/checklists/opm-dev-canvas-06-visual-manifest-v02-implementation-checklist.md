# Checklist: GOLDEN-AUTHORING-05 Visual Manifest 0.2 实现

> 状态：`NOT_STARTED`。本 checklist 不构成生产 Manifest、Visual Gate 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-visual-manifest-v02-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/范围/契约/测试/完成/回滚：映射规格第 1、4、5、7、9、10 节。

## Input Gate

- [x] Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2` 设计和八字段仍为 `FROZEN`。
- [x] Visual/E2E 输入修正规格已冻结独立 builder、Visual `0.2`、E2E `0.1` 和 bundle class/root/identity；旧合并 builder 已是历史目标。
- [ ] 04 Golden Verifier 已完成。
- [ ] exact approved version 在 `--require-approved` 下通过。

## Build

- [x] Visual Manifest `0.2` Schema/contract test 完成，`0.1` 未改；`0.2` 只增加八个冻结 provenance 字段并使用 `generator_identity.runner_version=0.2.0`。
- [x] 规格第 12 节已冻结 Producer/Verifier 唯一 CLI、模式参数、输出布局、case 组装和三项 policy 常量。
- [ ] builder 严格消费显式 approved version 和八字段。
- [ ] semantic verifier、fresh atomic writer 和零输出失败边界完成。
- [ ] builder/verifier 对 approved root 永久只读。
- [ ] `--input-mode`、controlled/production root/identity 和跨 class 拒绝完成；一次调用只输出 Visual `0.2`。

## Verify

- [x] Schema 正反例验证 `378/306/72/1242/9` 的结构矩阵、八字段、`0.1` production 拒绝；顺序、Environment 和 golden refs 的跨文件闭合仍待 builder/verifier。
- [ ] 八字段与 Report/Approval/Plan/materialization set exact 相等。
- [ ] `0.1`、candidate/latest/parent、tamper/缺失/额外/symlink 全阻断。
- [ ] production 读取 controlled root、controlled 写 production root、跨 class bundle ID 和受控 Manifest 提升均阻断。
- [ ] temp/write/fsync/rename 故障目标零输出。
- [ ] builder/verifier wall/RSS 满足阈值。
- [x] 定向 Schema 命令、`contract validate` 与本轮文档同步后的 `git diff --check` 通过。

## Risks And Residuals

- [ ] 受控测试未冒充生产 Manifest/Visual Report。
- [ ] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 只回退 05 新增 Schema/runner/test/命令。
- [ ] 不修改 approved version 或已生成证据；生产 Gate 回到 BLOCKED。
