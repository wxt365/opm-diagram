# Spec: P03 关系参数内联编辑与工具切换修正

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 问题与目标

必填标签或时长关系进入 `candidate-preview` 后，选择另一关系工具会被阻断，并在工作台顶部插入“请先确认或取消”反馈，造成画布布局跳动。参数表单同时强制展开右侧属性栏并显示“创建关系”按钮，仍然形成二次确认。

目标：未提交关系候选采用画图工具的瞬时编辑语义；切换工具静默放弃旧候选，必填参数在画布内联浮层中编辑，不占用属性栏、不显示创建确认按钮。

## 2. 范围与边界

允许修改：

- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/shared/styles/base.css`
- `tests/e2e/workbench-layout.spec.ts`
- 本规格、对应 checklist、直接冲突的活动设计文档和冻结基线

禁止修改：Runtime Java、OpenAPI、Schema、SQLite、Profile、Capability Definition、OPL/Trace、Control 更新路径、发布资产和 `runtime-data/`。

## 3. 冻结交互

1. 激活任意其他基础关系工具时，若当前候选尚未提交，前端必须先本地取消旧候选，再立即进入新工具的 `relation-armed`；不得显示阻断反馈、不得提交 Revision。
2. direct commit 已进入网络提交期间不接受工具切换，也不显示反馈；提交完成后恢复正常工具选择。
3. `candidate-preview` 所需的 `duration`、标签、方向或完整性字段显示在画布内的紧凑浮层中。该浮层不打开属性 Dock、不改变工作台 Grid 列数。
4. 浮层不得显示“创建关系”“确认创建”或等价确认按钮。第一个可编辑字段自动获得焦点；字段满足约束后按 `Enter` 提交，`Escape` 或关闭图标取消。
5. 必填字段使用本地表单约束；缺值时保持候选和输入，零 Runtime 提交、零 Revision，不向页面顶部写入候选切换或缺值反馈。
6. 关系提交仍执行 Runtime exact option refresh；提交失败时保留浮层、输入和 Runtime 错误证据。
7. 右侧属性 Dock 仅由显式“打开属性”及既有 State、Control、结构关系属性编辑任务控制，基础关系创建候选不再强制打开。

## 4. 验收

- `REL-INLINE-01`：带未填写标签的候选切换到另一关系工具时，旧候选消失、新工具激活、无顶部反馈、零提交。
- `REL-INLINE-02`：关系参数浮层位于画布内，右侧属性 Dock 不出现，页面 Grid 宽度不变化。
- `REL-INLINE-03`：浮层无创建确认按钮；必填参数输入后 `Enter` 创建，`Escape` 和关闭图标取消。
- `REL-INLINE-04`：缺少必填参数时零提交；Runtime 提交失败保留输入和错误。
- `REL-INLINE-05`：Web 单元、lint、typecheck、build、相关 Playwright 和 `git diff --check` 通过。

回滚仅回退本规格允许文件；回滚后恢复右侧任务区和候选切换阻断行为。
