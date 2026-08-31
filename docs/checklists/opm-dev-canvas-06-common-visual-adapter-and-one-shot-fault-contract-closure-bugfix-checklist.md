# Checklist: GOLDEN-AUTHORING-03C Node Adapter 与一次性 Fault Hook 契约闭包修正

状态：`DESIGN_FROZEN / NODE_ADAPTER_BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION / FAULT_HOOK_PARTIAL_NOT_ACCEPTED`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-adapter-and-one-shot-fault-contract-closure-bugfix-task-spec.md`。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 问题/Root Cause/Fix Strategy：规格第1、2节。
- 机器契约/API/CLI：规格第3至5节。
- fault接口/装配/调用点：规格第6节。
- 修改与禁止边界：规格第7节。
- 错误/测试/完成/回滚：规格第8至10节。

## Plan

- [x] 复核03C、03B、Visual Common、Golden Authoring和当前产品commit path。
- [x] 确认Node adapter与one-shot hook均缺字段级可实现契约。
- [x] 冻结活动Request `0.2`、其余三份`0.1`机器Schema、唯一模块函数、受控CLI和144次调用顺序。
- [x] 冻结独立fault port、Spring guard、revision INSERT前调用点和扩展后的`19=8 M+11 A`allowlist。
- [x] 同步03C/03B/测试/执行包/冻结基线/索引，保持实现与release状态不提升。

## Contract Verify

- [x] Adapter Request `0.1/0.1.0`保持历史只读；活动`0.2/0.2.0`补齐exact Java 21与Profile root/五raw refs/tree输入。
- [x] Capture Invocation `0.1/0.1.0`封闭Plan/fixture/setup/Projection/attempt/runtime/fault输入。
- [x] Capture Observed Result `0.1/0.1.0`封闭PNG/geometry/Projection/focus/cell/fault输出。
- [x] Adapter Normalized Result `0.1/0.1.0`封闭8 base/144 attempt、refs、顺序和三项摘要。
- [x] 生产只允许静态ESM函数；CLI只做四类contract验证且禁止动态callback。
- [x] callback责任与adapter责任无重叠，candidate root不进入03C request。

## Fault Contract Verify

- [x] `VisualCommonCommitFaultPort`独立于E2E/Recovery且默认NOOP。
- [x] active guard只接受command-line exact release profile/web/fault六项组合。
- [x] exact context、`ARMED -> TRIGGERED`、首个失败/第二个成功和非目标不消耗已冻结。
- [x] 调用点位于validation/text/receipt/head之后、revision INSERT之前；事务delta固定为0。
- [x] 现有03C局部实现文件只读，原14项保持不变；Adapter Test Input Builder闭包新增`2 M+3 A`，后继delta固定`19=8 M+11 A`。

## Validation

- [x] 历史四份JSON与活动Request `0.2`均可解析。
- [x] 活动Request `0.2`、其余三份Schema与Common Visual Fixture、Revision Schema联合Ajv编译通过。
- [x] `request_id`字符串类型和absolute path traversal正反例通过：`6`个正向、`10`个负向最小向量。
- [ ] 四份Schema的完整受控正反fixture由后继实现contract test验证。
- [ ] Adapter Test Input Bundle Builder/Verifier已有实现字节，但Runtime source kind和Planner JDK env尚未符合修正规格，完整144项callback输入未获接纳。
- [ ] Node adapter、fault hook、Spring/SQLite/packaged-JAR测试由后继实现执行。
- [x] 本轮不运行Maven/Playwright：只冻结设计，不修改实现。
- [x] `git diff --check`与Markdown本地链接检查在本轮最终验证阶段通过。

## Risks And Residuals

- [ ] Node adapter尚未消费由受控Bundle生成的活动Request `0.2`并实现Java/Profile受控preflight。
- [ ] `BLOCKED_FEEDBACK` one-shot fault已有未提交局部实现，但尚未完成`19=8 M+11 A`全量范围、回归矩阵、packaged-JAR/UI集成和03C checklist验收，不得接纳为完成。
- [ ] 8 base、144 clone、真实callback/capture和production证据尚未生成。
- [ ] 03B保持`BLOCKED_BY_DEPENDENCY`，GATE-06-03、Candidate、Activation、Capability、production与ISO状态不提升。

## Rollback

- [x] 设计回滚只撤销活动Request `0.2`及后继修正指针，历史`0.1`保持只读。
- [x] 禁止回退或覆盖工作树中既有Fault Launcher与03C局部Java改动。
