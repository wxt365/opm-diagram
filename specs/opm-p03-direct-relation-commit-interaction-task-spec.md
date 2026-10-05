# Spec: P03 关系拖线直接创建交互

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 问题与目标

当前所有基础关系均执行“拖线 -> 候选预览 -> 确认创建”。对已经由工具选择和 Runtime 唯一归一化的普通关系，这个二次确认不符合通用画图工具的直接操作逻辑，并使用户误以为蓝色候选线已经创建。

目标：普通关系在合法目标上松开后直接提交；只有缺少用户必填参数时才打开参数编辑。Runtime 候选、规范端点、提交前复核、单 Revision 和重开一致性不变。

## 2. 非目标与边界

非目标：不绕过 Runtime；不在前端推断端点角色；不创建未通过语义校验的 Fact；不修改 OpenAPI、Schema、SQLite、Profile、OPL、Trace、关系符号或 Control 的 `UPDATE_FACT` 路径。

允许修改：

- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-gesture-adapter.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-gesture-adapter.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `tests/e2e/workbench-relation-gesture.spec.ts`
- 本规格、对应 checklist 及直接冲突的活动设计文档

禁止修改：Runtime Java、公共 API、生成契约、数据库、Profile package、Capability Definition、发布资产和 `runtime-data/`。

## 3. 冻结交互

1. `relation-endpoint-selected` 增加 `continue_collection: boolean` 和 `open_parameters: boolean`。X6 只从鼠标松开时的 `Shift`、`Alt/Option` 状态写入对应值，不解释关系语义。
2. 达到最小端点数后，应用必须查询 Runtime，并只保留与当前工具 Capability 精确匹配的 enabled option。
3. 当且仅当匹配 option 唯一，且没有必填 `duration`、必填 `labels` 或具有多个允许值的必填 `direction` 时，进入直接提交路径。
4. `collection_completeness` 不形成二次确认门；直接创建默认使用 `COMPLETE`。用户可在已提交关系的属性编辑中改为 `INCOMPLETE`。
5. `max_endpoints=null` 且 `continue_collection=true` 时，本次端点集合只完成 Runtime 校验，随后保留端点并返回 `relation-armed`；不得提交。最后一次不按 `Shift` 松开时，以完整端点集合直接提交。
6. `open_parameters=true` 时，即使 option 可直接提交，也进入参数编辑；该高级入口用于创建前选择 `INCOMPLETE` 等非默认值，不改变默认直接创建路径。
7. 直接提交仍须重新查询当前 Revision，并按 `option_id`、规范端点和资产引用执行 exact option refresh；成功时只创建一个 Fact 和一个 Revision。
8. 直接提交失败时保留候选 RenderSpec、端点和 Runtime 反馈，允许重试或取消；不得产生部分 Fact、OPL 或 Trace。
9. 需要用户输入时显示紧凑参数编辑器；其位置、提交和工具切换语义由后继 `opm-p03-inline-relation-parameter-and-tool-switch-bugfix-task-spec.md` 取代本规格初始规则。
10. 成功后清空候选层和工具激活状态；用户选择下一个工具时，不再存在可被误删的蓝色候选线。
11. Control 不是独立拖线，本规格不改变其附加/移除语义。
12. 工具切换不再保护未提交候选；以 `opm-p03-inline-relation-parameter-and-tool-switch-bugfix-task-spec.md` 的“静默取消并切换”规则为唯一活动语义。

## 4. 验收

- `REL-DIRECT-01`：Consumption、Result、Exhibition 和 Generalization 在最终端点松开后直接生成 committed 关系，无候选确认表单。
- `REL-DIRECT-02`：直接创建执行一次提交、产生一次 Revision，并在刷新后保留关系、OPL 和 Trace。
- `REL-DIRECT-03`：Exception 和必填 Tagged 关系只显示必要参数编辑；缺值零提交，填写后可创建。
- `REL-DIRECT-04`：unbounded fan 按住 `Shift` 可连续添加端点，最终松开直接提交为一个 Fact。
- `REL-DIRECT-05`：空白释放、无候选、Runtime 失败、Escape 和取消保持零提交。
- `REL-DIRECT-06`：Web 单元、lint、typecheck、build、P03 Playwright 与 `git diff --check` 通过。

回滚仅回退本规格允许文件；回滚后恢复统一候选预览和二次确认。
