# Checklist: GOLDEN-AUTHORING-03B Candidate Author 实现

> 状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`。02B已通过受控测试，03C已达到 Adapter Readiness；真实 UI/fault/capture 仍由本包实现并回填03C integration evidence。详见 `specs/opm-dev-canvas-06-common-visual-adapter-readiness-dependency-cycle-closure-bugfix-task-spec.md`。本 checklist 不构成 candidate、approval、release 或 ISO 证据。

## Spec Mapping

- Spec：`specs/opm-dev-canvas-06-golden-candidate-author-implementation-task-spec.md`
- Blank baseline closure：`specs/opm-dev-canvas-06-golden-blank-baseline-capture-closure-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 目标/范围/非目标/实现/测试/验收/回滚：分别映射规格第 1、4、5、7、8、10、11 节。

## Input Gate

- [x] Golden Authoring `v1.4`、Visual Common Materialization `v1.5`、Materializer `v1.5` 和 Verifier Catalog `v1.1` 均为 `FROZEN`。
- [x] 02B Common Visual Fixture Contract/Planner已达到受控测试通过，新 Plan拒绝历史占位Projection。
- [x] 03C已达到 Adapter Readiness：四份adapter机器契约、唯一ESM/144次callback、8 base/144 clone和独立fault hook受控基线可用；真实 UI/fault/capture 由本包实现后回填。
- [x] 03B只读消费接口先执行 `--require-materialized` verifier，再由Plan的130个fixture key固定读取Report/SQLite，逐项复算raw ref；物理Materialization root路径仅按bytes闭合，候选报告统一使用未来发布布局`materialization/**`。
- [ ] Plan READY，130 项 materialization 通过 `--require-materialized` 的真实release执行证据可用。
- [ ] clean source 与 exact Node/npm/Java/Playwright/Chromium/JAR/font 输入可用；Golden Environment `0.2` Schema/离线 verifier 已可用。
- [x] 03B physical input closure已冻结：Adapter Request、Browser executable和三字体只接受显式raw-ref输入，不允许source/environment/PATH fallback。
- [ ] 受控 test 输入与真实 release 输入已分开。

## Build

- [x] Authoring Report `0.2` Schema 和正反 contract test 完成：三种状态、130/130 materialization、2484/18 attempt、Candidate/Approved/Blocked 引用边界、report ID 和额外字段反例均由定向 AJV test 覆盖。
- [x] CLI主链、clean build和单lane受控 author 聚合完成；十一个显式参数、clean source/JAR/Web/Adapter/Browser/Font/Lineage预检，以及失败零 Candidate 输出由定向测试覆盖。真实 clean build 与 release 输入仍未执行。
- [x] Family clone/Runtime/Web capture adapter（见 `opm-dev-canvas-06-golden-authoring-family-capture-adapter-implementation-checklist.md`）与 Common 03C adapter 的结果消费、Schema-valid normalized result、blank 双attempt和确定性聚合由受控测试覆盖；真实 130/8 base、浏览器与 fault 集成仍未执行。
- [x] candidate Golden Environment `0.2` writer、future layout refs/fingerprint离线 verifier 完成；真实浏览器PNG仍待主链。
- [x] READY Report atomic writer、payload SHA和success-only candidate transaction已实现；BLOCKED诊断Report与candidate只读消费状态仍待主链。
- [ ] runner 对 Approval/approved/Manifest 保持零写入。

## Verify

- [x] Family `130/130` Materialization Report/SQLite引用、固定排序、raw SHA及semantic state输入闭合由定向测试覆盖。
- [x] `1242/2484/9/18`、逐 attempt result、顺序、refs、三个集合 SHA 和 payload 在隔离 Adapter 输出聚合测试中闭合；不构成真实 release capture 证据。
- [x] Blank baseline 按唯一 `about:blank` 双 attempt 语义、输出布局和零输出事务由 Chromium stub 定向测试覆盖；未执行生产 Chromium。
- [ ] dirty/build/JAR/binding/environment/font/materialization 反例稳定阻断。
- [ ] 缺失/额外/重复/超时/非确定性 capture 反例稳定阻断。
- [ ] Family 130 base、Common 8 base/144 clone immutable且隔离，不混用。
- [ ] 8 subject UI setup、normalized Projection、focus/cell/geometry和一次性fault hook通过。
- [ ] writer 故障零 READY 输出且不触碰已完成输入。
- [ ] build/attempt/full wall/RSS 满足设计阈值。
- [ ] 定向命令、contract validate 和 `git diff --check` 通过。

## Risks And Residuals

- [x] Golden Environment `0.2` Schema、正反例和离线 semantic verifier 已完成；03B 仍需在 author 运行时复核 browser executable/font bytes、实际字体解析和 Capture Plan join，不能把离线 verifier 作为这些运行时证据。
- [x] Common Runtime Materialization设计缺口已由Visual Common Materialization `v1.5`关闭：唯一采用release-only SQLite V1、空Text Artifact/`1/1/0`计数、五类index逐列映射、8类UI step、43文件self-contained root、四份adapter机器Schema、静态ESM/144次callback、独立one-shot fault port、8 base/144 fresh clone和完整normalized Projection；其余实现由03C承接。
- [x] `color_profile`跨契约冲突已关闭：Plan raw `srgb`和exact Chromium arg唯一映射到Environment canonical `sRGB IEC61966-2.1`，禁止alias；实现由02B/03B承接。
- [ ] 当前等待02B/03C实现依赖，不得以设计冻结替代Schema/factory/materializer/attestation/clone证据。
- [ ] 未把受控全量测试写成真实 release candidate。
- [ ] Approval/Publisher/Visual Manifest `0.2` 和 approved evidence仍待后续包。
- [ ] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 只回退 03B 新增 Schema/runner/test/命令。
- [ ] 不删除 materialization、candidate、approved 或用户数据。
