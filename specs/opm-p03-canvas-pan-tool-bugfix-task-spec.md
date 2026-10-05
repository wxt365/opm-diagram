# Spec: OPM P03 画布平移工具修复

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

接通工作台的选择/平移局部工具状态，使用户选择“平移画布”后可以用鼠标左键拖动整个 X6 画布，并可切回选择模式继续选择和移动构造。

## 2. 非目标

- 不修改节点布局提交、Revision、OPL、校验或 Runtime API。
- 不新增框选、多选、自动布局、视口持久化或快捷键。
- 不修改数据库 Schema、依赖、公共路由或后端实现。

## 3. 范围与边界

允许修改：

- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- 上述组件的单元测试
- `tests/e2e/workbench-layout.spec.ts`
- 本规格与对应 checklist

禁止修改：后端、公共 API、Schema、配置、依赖、Runtime 数据和其他发布工件。

## 4. 行为契约

1. 默认工具为 `select`，选择按钮显示激活态。
2. 点击平移按钮切换为 `pan`，X6 启用 `leftMouseDown` 和 `mouseWheel` 平移；节点不可移动且点击不改变选择。
3. 点击选择按钮恢复 `select`，关闭 X6 平移并恢复既有节点选择、拖动和名称编辑行为。
4. 激活关系工具或 State 放置前恢复 `select`；切换到 `pan` 时取消未完成的关系或 State 候选，避免手势冲突。
5. 工具状态与视口平移只属于本地视图，不产生 Revision、OPL 或校验变化。

## 5. 验收与验证

- `P03-PAN-01`：选择/平移按钮具有互斥激活态和 `aria-pressed`，并将状态传入画布。
- `P03-PAN-02`：X6 在 `pan` 模式启用左键拖动平移并禁用节点移动/选择，切回 `select` 后恢复。
- `P03-PAN-03`：关系工具激活后恢复选择模式，既有关系手势不受影响。
- `P03-PAN-04`：浏览器验证点击平移工具后左键拖动会改变节点视口位置，切回选择后恢复节点交互。
- `P03-PAN-05`：执行两个组件定向测试、前端 typecheck、lint、build 和 `git diff --check`。

## 6. 回滚

回退本规格范围内的前端组件、测试、规格和 checklist。该功能不写入业务数据，无数据回滚步骤。
