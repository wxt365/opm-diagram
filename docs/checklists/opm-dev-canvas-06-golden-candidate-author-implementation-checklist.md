# Checklist: GOLDEN-AUTHORING-03B Candidate Author 实现

> 状态：`BLOCKED_BY_DEPENDENCY`。等待 02B/03C implementation checklist 完成；本 checklist 不构成 candidate、approval、release 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-candidate-author-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/范围/非目标/实现/测试/验收/回滚：分别映射规格第 1、4、5、7、8、10、11 节。

## Input Gate

- [x] Golden Authoring `v1.4`、Visual Common Materialization `v1.4`、Materializer `v1.5` 和 Verifier Catalog `v1.1` 均为 `FROZEN`。
- [ ] 02B Common Visual Fixture Contract/Planner checklist 全部通过，新 Plan拒绝历史占位Projection。
- [ ] 03C Common Visual Materializer checklist全部通过，8 base/144 clone/fault hook受控集成可用。
- [ ] Plan READY，130 项 materialization 通过 `--require-materialized`。
- [ ] clean source 与 exact Node/npm/Java/Playwright/Chromium/JAR/font 输入可用；Golden Environment `0.2` Schema/离线 verifier 已可用。
- [ ] 受控 test 输入与真实 release 输入已分开。

## Build

- [x] Authoring Report `0.2` Schema 和正反 contract test 完成：三种状态、130/130 materialization、2484/18 attempt、Candidate/Approved/Blocked 引用边界、report ID 和额外字段反例均由定向 AJV test 覆盖。
- [ ] CLI、clean build、environment/font verifier 和单 lane author 完成。
- [ ] Family clone/Common 03C adapter、稳定等待和双 attempt 完成。
- [ ] candidate Golden Environment `0.2` writer、refs/fingerprint verifier 完成。
- [ ] READY/BLOCKED Report atomic writer、payload SHA 和 candidate 只读边界完成。
- [ ] runner 对 Approval/approved/Manifest 保持零写入。

## Verify

- [ ] `1242/2484/9/18`、逐 attempt result、顺序、refs、三个集合 SHA 和 payload 全闭合。
- [ ] dirty/build/JAR/binding/environment/font/materialization 反例稳定阻断。
- [ ] 缺失/额外/重复/超时/非确定性 capture 反例稳定阻断。
- [ ] Family 130 base、Common 8 base/144 clone immutable且隔离，不混用。
- [ ] 8 subject UI setup、normalized Projection、focus/cell/geometry和一次性fault hook通过。
- [ ] writer 故障零 READY 输出且不触碰已完成输入。
- [ ] build/attempt/full wall/RSS 满足设计阈值。
- [ ] 定向命令、contract validate 和 `git diff --check` 通过。

## Risks And Residuals

- [x] Golden Environment `0.2` Schema、正反例和离线 semantic verifier 已完成；03B 仍需在 author 运行时复核 browser executable/font bytes、实际字体解析和 Capture Plan join，不能把离线 verifier 作为这些运行时证据。
- [x] Common Runtime Materialization设计缺口已由Visual Common Materialization `v1.4`关闭：唯一采用release-only SQLite V1、空Text Artifact/`1/1/0`计数、五类index逐列映射、8类UI step、43文件self-contained root、8 base/144 fresh clone和完整normalized Projection；其余实现由02B/03C承接。
- [x] `color_profile`跨契约冲突已关闭：Plan raw `srgb`和exact Chromium arg唯一映射到Environment canonical `sRGB IEC61966-2.1`，禁止alias；实现由02B/03B承接。
- [ ] 当前等待02B/03C实现依赖，不得以设计冻结替代Schema/factory/materializer/attestation/clone证据。
- [ ] 未把受控全量测试写成真实 release candidate。
- [ ] Approval/Publisher/Visual Manifest `0.2` 和 approved evidence仍待后续包。
- [ ] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 只回退 03B 新增 Schema/runner/test/命令。
- [ ] 不删除 materialization、candidate、approved 或用户数据。
