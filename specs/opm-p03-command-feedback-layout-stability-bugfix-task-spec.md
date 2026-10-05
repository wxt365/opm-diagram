# Spec: OPM P03 命令反馈布局稳定性修复

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 目标

消除命令阻断或失败提示出现、更新和消失时造成的工作台纵向布局跳动。命令反馈必须显示在画布内的悬浮状态层，不改变工具栏、画布、左右面板或底部面板的几何尺寸。

## 2. 非目标

- 不改变反馈文案、错误码、产生条件或清除时机。
- 不改变模型命令、Revision、URL、Context、OPL、Trace 或校验行为。
- 不修改后端、公共 API、Schema、配置、依赖或 Runtime 数据。

## 3. 范围与边界

允许修改：

- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/shared/styles/base.css`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-relation-gesture.spec.ts`
- 本规格与对应 checklist

禁止修改：上述范围之外的实现、后端、公共契约、依赖及发布工件。

## 4. 行为契约

1. 工作台首次读取和整体读取失败仍由页面级资源状态区承载。
2. `commandFeedback` 在 `resourceState !== error` 时渲染到 `.canvas-surface` 内的绝对定位状态层。
3. 悬浮反馈不得接管指针事件，不得改变工作台 Grid 行列或画布尺寸；长文本允许换行且不得溢出视口。
4. 反馈继续使用既有 `p03-command-feedback`、错误码入口和 `role=status`，并增加稳定的 live region 语义。
5. 反馈出现本身不提交命令、不产生 Revision，也不修改 URL。

## 5. 验收与验证

- `P03-FEEDBACK-01`：命令反馈属于 `.canvas-surface`，不再属于 `.workbench-notices`。
- `P03-FEEDBACK-02`：页面整体读取失败仍由顶部资源状态区显示。
- `P03-FEEDBACK-03`：真实非法关系端点触发反馈后，工作台 Grid 几何与 Revision 保持不变。
- `P03-FEEDBACK-04`：定向单测、前端全量单测、lint、typecheck、build、相关 E2E 和 `git diff --check` 通过。

## 6. 回滚

回退本规格范围内文件即可恢复原展示位置。本任务不写入业务数据，无数据回滚步骤。
