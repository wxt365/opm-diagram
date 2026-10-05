# Spec: OPM P03 按需属性检查器与右键属性入口

## Task Type

`feature`

## Active Playbooks

- `none (primary)`

## 1. 目标

1. 未主动查看或编辑属性时，桌面工作台不渲染右侧检查器、不保留其固定列，主画布获得全部剩余宽度。
2. 选中 committed Object、Process、Attribute、Operation、State 或 Fact 后，可从右键菜单首项“打开属性”显示检查器。
3. 主工具栏保留纯图标属性面板开关，提供无需右键的键盘可访问入口。
4. State 创建、关系候选、Control 候选和结构关系编辑继续按任务状态显示右侧任务区。

## 2. 非目标

- 不修改 Runtime Capability、OpenAPI、数据库 Schema、Revision 或持久化协议。
- 不改变 Object/Process 双击名称编辑、Delete/Backspace 直接删除和右键删除语义。
- 不新增依赖，不重构检查器字段和领域命令。

## 3. 允许与禁止范围

允许修改：

- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/shared/styles/base.css`
- `tests/e2e/workbench-layout.spec.ts`
- `tests/e2e/workbench-construct-lifecycle.spec.ts`
- 本规格、对应 checklist 及属性检查器相关活动设计记录。

禁止修改：`services/**`、`docs/contracts/**`、依赖、公共 HTTP wire、SQLite DDL、Profile 资产和关系符号语义。

## 4. 冻结交互契约

### 4.1 可见性

`inspectorDockVisible` 的唯一判定为：

```text
rightPanel.open
or relationCandidate.phase != idle
or stateCandidate.phase == editing
or controlCandidate.phase != idle
or structuralUpdateCandidate.phase == editing
```

仅选择构造不得自动打开检查器。`stateCandidate=placing` 不单独占用右侧列；进入 `editing` 后显示任务区。

### 4.2 打开与关闭

- 右键 committed 构造时先同步 selection，再立即打开上下文菜单；菜单首项固定为“打开属性”，其后以分隔线隔开 Runtime 驱动的删除/移除动作。
- “打开属性”只关闭上下文菜单并令 `rightPanel.open=true`；不得提交命令或产生 Revision。
- 工具栏属性图标在无 selection 时禁用；有 selection 时切换 `rightPanel.open`。
- 检查器关闭按钮只令 `rightPanel.open=false`，不得清除 selection、候选输入或 committed 数据。
- Object/Process 双击继续只进入名称编辑。

### 4.3 布局与画布

- 检查器关闭时桌面 Grid 为 `230px + minmax(500px, 1fr)`；打开时增加 `270px` 检查器列。
- 窄屏沿用现有两列/单列断点，检查器作为下方工作区，不制造页面横向溢出。
- X6 必须跟随容器宽高变化自动调整画布承载区域；切换检查器不得改变语义节点坐标、关系路由或 Revision。

### 4.4 删除兼容性

- `Delete/Backspace` 仍按 `direct` 路径查询并直接提交 Runtime 返回的首选 enabled option，不显示上下文菜单。
- 右键删除项继续使用 Runtime 返回的 option、impact summary 和 token；前端不得推断级联。
- 上下文菜单打开后，即使删除 Capability 暂未返回或返回空集合，“打开属性”仍可用。

## 5. 验收

- `INSPECTOR-01`：初始和仅选中状态均无右侧检查器，桌面 Grid 无第三列。
- `INSPECTOR-02`：右键“打开属性”显示所选构造属性，零 edit command、零 Revision。
- `INSPECTOR-03`：工具栏图标可开关检查器；关闭后 selection 保持且画布恢复宽度。
- `INSPECTOR-04`：State/关系/Control/结构关系候选任务不因属性检查器关闭而消失。
- `INSPECTOR-05`：右键删除与 Delete/Backspace 行为不回归。
- `INSPECTOR-06`：X6 使用容器自动 resize；桌面实测关闭检查器后编辑区至少恢复 `260px`。

## 6. 验证与回滚

定向执行 Vue 单测和 P03 Playwright，再执行 lint、typecheck、build 与 `git diff --check`。回滚仅还原本规格允许文件；不涉及数据回滚。
