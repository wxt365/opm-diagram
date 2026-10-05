# Spec: P03 未确认关系候选的工具切换保护修复

文档状态：`HISTORICAL_SUPERSEDED`

取代规格：`specs/opm-p03-inline-relation-parameter-and-tool-switch-bugfix-task-spec.md`。本文件仅保留历史问题与当时验收证据，不再定义活动交互语义。

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 问题、复现与根因

选择 `CAP-ISO-STRUCT-006`，从 Attribute 向 Object 完成端点手势并出现蓝色候选关系后，再次点击“展示-特征关系”或改点“泛化-特化关系”，候选线和候选表单立即消失，且状态回到新的 `relation-armed`。

根因是 `armRelationCreation()` 将全部非 `idle` 状态都视为可隐式取消的工具切换并调用 `cancelRelationCandidate()`。第一次修复只区分了“重选同一 Capability”，仍允许不同 Capability 清除未确认候选；既有测试把这种数据丢失行为当作正确语义。

## 2. 目标与非目标

目标：`CREATE_FACT` Capability 在 `relation-armed`、`dragging`、`endpoint-selected`、`candidate-filtering` 或因必填参数/失败恢复进入的 `candidate-preview` 阶段时，任何关系工具点击都不得清空在途状态。同一 Capability 点击保持状态；不同 Capability 点击被阻断，并保持原 Capability 激活。直接创建成功或显式取消后可以切换工具。

本规格原有“不自动提交、显式确认后才提交”边界由 `opm-p03-direct-relation-commit-interaction-task-spec.md` 取代。仍不修改 Control、Runtime、OpenAPI、Schema、SQLite、Profile、RenderSpec 或关系符号。

## 3. 修改边界

允许修改：

- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `docs/design/opm-modeling-workbench-component-interaction.md`
- 本规格及对应 checklist

禁止修改上述清单外文件，尤其后端、公共 API、生成契约、Profile package、数据库、关系 Definition、发布资产和 `runtime-data/`。

## 4. 实现契约

本节是历史契约。2026-09-07 起，候选切换唯一活动规则为“静默取消旧候选并激活新工具”，不得继续实现本节的阻断行为。

1. `relationCandidate.phase` 处于目标列出的五个候选阶段时，当前 `catalogItem.capability_id` 等于再次激活项则幂等返回；Capability 不同则阻断切换并返回。`confirmed/cancelled` 不属于待保护状态。
2. 两种返回均不得调用 `cancelRelationCandidate()`、`resetRelationCandidateFields()`、Capability Query 或 Command API。
3. 当前 `candidate-preview` 的 `candidateId`、`endpointIds`、`selectedOption`、label、duration、direction、completeness 和 preview cells 必须保持不变。
4. 对需要参数或失败恢复而保留的 candidate preview，同一项重选只更新非持久化操作提示，明确候选仍待“创建关系”或“取消”；不得额外生成 Revision、Fact、OPL、Trace 或 capture anchor。
5. 点击不同 Capability 时显示稳定反馈“请先确认或取消当前候选”，原 Capability 继续激活，新 Capability 不得激活；不得隐式确认或提交。
6. 当前为 `idle`、`confirmed` 或 `cancelled` 时允许激活新的 Capability；显式“取消”按钮、Escape、空白释放及 Context 变化行为保持不变。

## 5. 验收与验证

- `REL-RESELECT-01`：组件测试证明同一或不同 Structural 工具点击后，原候选表单、已填参数、candidate ID 和 active Capability 不丢失。
- `REL-RESELECT-02`：浏览器测试证明 `CAP-ISO-STRUCT-006` 候选出现后点击 `CAP-ISO-STRUCT-007`，候选线、候选 ID、active Capability 和 Revision 均不变。
- `REL-RESELECT-03`：工具切换被阻断后仍可显式确认原候选，且只产生一次 Revision 和一个 committed Fact。
- `REL-RESELECT-04`：原有显式取消、结构关系、OPL/Trace 和重开回归通过。
- `REL-RESELECT-05`：lint、typecheck、前端单元测试、P03 Playwright 和 `git diff --check` 通过。

回滚仅回退本规格允许文件；回滚后同一工具重选会再次清空候选。
