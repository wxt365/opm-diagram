# Checklist: P03 未确认关系候选的工具切换保护修复

状态：`HISTORICAL_SUPERSEDED`；活动验收转至 `docs/checklists/opm-p03-inline-relation-parameter-and-tool-switch-bugfix-checklist.md`。

## Spec Mapping

- 规格：`specs/opm-p03-relation-tool-reselection-preview-preservation-bugfix-task-spec.md`
- 验收：`REL-RESELECT-01` 至 `REL-RESELECT-05`
- 边界：只修改前端候选状态和工具切换行为、对应设计与测试；提交协议和 Runtime 不变。

## Build

- [x] `REL-RESELECT-01` 同一或不同工具点击均保持原候选状态、参数、ID 和 active Capability。
- [x] `REL-RESELECT-02` Exhibition 候选期间点击 Generalization，候选线、ID 和 Revision 保持不变。
- [x] `REL-RESELECT-03` 工具切换被阻断后确认仍只提交一次。
- [x] `REL-RESELECT-04` 显式取消、结构关系、OPL/Trace 和重开语义保持不变。

## Verify

- [x] 已记录修复前失败证据。
- [x] 前端单元、lint、typecheck、build 通过。
- [x] P03 Playwright 通过。
- [x] `git diff --check` 通过，且未修改禁止范围。

## Verify Record

- `2026-09-07`：修复前定向组件测试失败；第二次点击同一 Structural 工具后 `p03-relation-candidate` 消失，状态回到空端点 `relation-armed`。
- `2026-09-07`：第二次缺陷复现：Exhibition 候选出现后点击 Generalization，`armRelationCreation()` 调用取消路径，候选线与表单消失；现有组件测试错误地把该行为作为通过条件。
- `2026-09-07`：修复后定向组件测试 `29/29` 通过；不同关系点击被阻断，原 candidate capability、标签参数、激活工具和候选表单保持不变，零 Command。
- `2026-09-07`：Web Vitest `87/87`、lint、typecheck、build 通过。
- `2026-09-07`：`workbench-layout.spec.ts` 与 `workbench-relation-gesture.spec.ts` 共 `13/13` 通过；Exhibition 候选期间点击 Generalization 后 candidate ID、预览线、Revision 和 active Capability 不变，确认后只提交一次并可重开。
- `2026-09-07`：本任务允许文件的 `git diff --check` 通过；未修改 Runtime、公共 API、Schema、SQLite、Profile、关系 Definition 或发布资产。
