# 元素右键添加子图

Work Mode: change；Risk Level: L2；Task Type: feature。
Active Playbooks: frontend-vue (primary), testing。

## Spec

目标：对象/过程右键菜单提供「添加子图…」，直接以该元素为细化目标，展开既有名称创建区，确认后进入子图。
非目标：新建无关联图、重复细化、树折叠、菜单体系重构。
允许：WorkbenchView.vue局部菜单/编排、相关单测/e2e、本文及页面设计文档。
禁止：API/schema、store、后端、依赖/配置、.harness、原案例内容及无关文件。
契约影响：无；沿用CREATE_CONTEXT和既有父图/细化元素关联。

验收：
- A1：对象/过程菜单显示「添加子图…」，点击以右键目标打开创建区、聚焦名称；已有创建区时再次进入不会关闭。
- A2：状态、属性、操作、关系不显示该项；引用元素、已有子图、只读、提交/预览/关系编辑时不可创建。既有后端候选校验继续生效。
- A3：取消/打开菜单零写入，确认使用目标元素及当前父图创建；属性和删除操作可正常使用。
- A4：真实画布验证对象/过程创建、父图返回、已有子图禁用、取消、只读及删除回归，截图核对；定向组件测试和typecheck/lint/diff通过。

## Plan

1. 从constructActions.selectionId取得菜单目标，局部计算显示和禁用原因；复用已有菜单样式和创建区。
2. 点击时重新确认目标、单选该元素、关闭菜单并打开创建区，不自动提交。菜单定位预算增加一行。
3. 扩展真实导航测试覆盖对象/过程右键入口及正确关联，保留行尾＋回归；运行原构造删除e2e。

## Checklist

Spec: specs/opm-element-refinement-menu-feature-task-spec.md。允许/禁止边界已确认。
- [x] A1：组件验证目标选择及重复打开不关闭；真实对象/过程菜单创建、输入焦点通过。
- [x] A2：真实状态/关系菜单无创建入口、已有子图禁用、只读无构造菜单；组件验证引用及提交禁用。其他节点类型由对象/过程限定条件排除，预览/关系编辑沿用canOpenRefinement门禁。
- [x] A3：真实请求捕获核对父context和目标元素ID；取消前后命令数量与edit_seq相同。原属性及元素/关系删除通过。
- [x] A4：87项组件测试、真实导航/右键测试和typecheck/lint/diff通过，菜单截图已核对。

## 验证与回滚

复用Vitest及Playwright，隔离测试模型，finally移入回收站。回滚仅本次前端入口、测试及文档增量，无数据迁移。

## 实际验证（2026-10-02）

- `npm run test --workspace=@opm/web -- WorkbenchView.spec.ts`：87项通过。
- 外部服务5177/17850、指定测试项目：原三级导航与空白右键/删除e2e 2项通过；新增元素右键e2e首轮因测试创建等待/标识读取失败，补充等待edit_seq变化并使用语义data-cell-id后，定向重跑1项通过（3.6秒）。产品代码无需因此调整。
- 新增真实测试覆盖对象/过程正确关联、取消零写入、已有子图禁用、属性、保存刷新和固定版本只读；测试模型finally移入回收站。
- 菜单截图：`/private/tmp/opm-element-refinement-menu-recheck/workbench-navigator-visual-元素右键添加子图关联到目标，取消不写入且保留属性菜单/element-refinement-menu.png`；布局人工核对通过。原导航测试覆盖桌面及390px。
- `npm run typecheck`、`npm run lint`、`git diff --check`：通过。
