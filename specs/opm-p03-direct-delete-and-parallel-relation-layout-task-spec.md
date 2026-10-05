# Spec: P03 直接删除与平行关系分轨

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `design-module-docs`
- `testing`

## 1. 目标

删除构造时移除二次确认：右键菜单项点击即执行，`Delete/Backspace` 不显示菜单而直接执行。修复同一对节点之间多个普通二元关系完全重合的问题，以稳定分轨保持每条关系可见、可选择。

## 2. 非目标

- 不修改 OpenAPI、Runtime、SQLite、Profile/Symbol 资产、依赖或发布工件。
- 不允许 X6 直接删除 committed Cell，不绕过 Runtime option、impact token、Revision 和事务。
- 不改变 fan、Effect 分段、自调用或已有显式 `vertices/router` 的复杂关系布局。

## 3. 允许与禁止范围

允许修改 P03 生命周期设计/规格/checklist、画布与前端 handoff 文档、`WorkbenchView.vue`、`OpdCanvas.vue`、`workbenchRuntime.ts`、关系 RenderSpec/X6 adapter、局部样式及对应 Vue/Playwright 测试；允许新增一个纯分轨函数及其单测。禁止修改服务端、公共 API/schema、依赖和本范围外文件。

## 4. 冻结契约

1. 右键仍先选择 occurrence 并查询 Runtime；菜单展示 option、影响数量和 blocker。点击 enabled option 立即提交，点击外部仍只关闭菜单。
2. 键盘仍先查询 Runtime，但不打开菜单。普通删除按 `DELETE_TARGET -> CASCADE -> REMOVE_OCCURRENCE` 选择首个 enabled option；Control 只执行 enabled “移除 Control”。无 enabled option 只反馈稳定原因，零 Revision。
3. 查询、token stale、提交失败或重复按键不得导致 X6 先删 Cell、部分删除或并行重复提交；成功后仅按 committed Revision 重读。
4. 分轨只处理 `cells` 恰为一个 primary edge、无既有 `vertices/router`、源目标不同且两端节点中心可定位的关系。同一无向端点对作为一组，按 `relationId/occurrenceId` 排序。
5. 一条关系保持直线；两条及以上以节点中心连线的规范法向量对称分配 midpoint vertex，lane 间距固定 `24px`。正反向关系使用相同规范方向，输入顺序不得改变 relation-to-lane 映射。
6. 分轨不得改变 relation/occurrence/symbol/primaryCell/capture anchor。关系增加、删除或节点移动后重新计算；X6 原位更新必须同步 `vertices/router`，不能残留旧折点。

## 5. 验收

- `P03-DIRECT-DELETE-01`：右键删除仅需一次菜单点击，Revision 只增加一次。
- `P03-DIRECT-DELETE-02`：`Delete/Backspace` 不显示菜单或确认框，按固定优先级直接提交。
- `P03-DIRECT-DELETE-03`：菜单取消、Runtime 阻断和提交失败保持零部分删除。
- `P03-PARALLEL-RELATION-01`：同向、反向的两条及三条简单关系稳定分轨，输入排序变化不改变结果。
- `P03-PARALLEL-RELATION-02`：单条、fan、复杂 route 不被改写；X6 更新可增加并清除折点。
- `P03-VERIFY-01`：定向/全量 Vue 测试、lint、typecheck、build、P03 Playwright、浏览器桌面视觉检查和 `git diff --check` 通过。

## 6. 回滚

回退本规格允许范围内的前端和文档修改即可。已提交 Revision 不得删除或改写。
