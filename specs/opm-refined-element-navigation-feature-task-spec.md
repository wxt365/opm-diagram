# 已有子图元素标记及右键展开

Work Mode: change；Risk Level: L2；Task Type: feature。
Active Playbooks: frontend-vue (primary), testing。

## Spec

目标：已有细化子图的对象/过程以加粗边框和悬停提示区分，右键「展开子图」导航到对应子图；无子图保持「添加子图…」。
非目标：标准符合性声明、节点双击行为、子图删除、全局菜单重构及数据迁移。
允许：WorkbenchView、OpdCanvas、x6-node-layer、constructEditing只读菜单编排、相关组件/e2e、本文及页面设计文档。
禁止：API/schema、后端、依赖/配置、.harness、原案例内容及无关重构。
契约影响：仅内部画布可选展示属性；来源为当前图导航中既有parentId/refineeId，不保存展示标记。只读右键开放导航和属性，无编辑候选查询/删除命令。

验收：
- A1：当前父图中拥有子图的对象/过程边框4、普通元素2；不依赖选中状态，状态既有INITIAL/FINAL样式不变。创建回读、刷新、切图及固定版本正确显示。
- A2：菜单仅对应正确元素显示「展开子图」，替代已禁用的添加项；点击进入关联子图，保留父图返回。无子图仍可创建；状态、特征、关系不显示展开。
- A3：只读图可展开/返回，菜单不提供删除候选、添加不可用；加载/提交/预览/关系编辑中不可展开。导航不改变edit_seq或提交语义命令。
- A4：组件覆盖展示状态更新和只读菜单；真实画布验证对象/过程标记、正确跳转、保存重开和只读导航，原删除/属性回归；截图核对与typecheck/lint/diff通过。

## Plan

1. 从当前父context导航派生细化元素ID，透传可选展示属性；节点层初次渲染/同步均更新边框与提示，不重建语义节点。
2. 复用右键目标和现有openContext；只读菜单仅初始化菜单并跳过删除候选查询。已有子图菜单改为展开。
3. 更新前轮真实导航回归覆盖创建后标记/展开、正确版本/元素关联与零写入，执行删除兼容测试。

## Checklist

Spec: specs/opm-refined-element-navigation-feature-task-spec.md；允许/禁止边界已确认。
- [x] A1：真实创建后对象/过程边框4、未细化元素2、取消选择仍保留；刷新及固定版本一致。组件覆盖细化列表变化不重建画布与INITIAL/FINAL样式。
- [x] A2：真实对象/过程展开到对应子图，父图返回通过，添加与展开互斥；状态/关系无展开项。
- [x] A3：真实固定版本展开并保留版本、父图返回、无编辑命令；组件确认只读菜单不查询候选及提交时禁用。普通只读元素添加禁用、无删除候选。
- [x] A4：106项组件测试、3项真实e2e及静态检查通过；截图已核对。

## 验证与回滚

定向Vitest和真实Playwright；隔离模型finally移入回收站，不编辑原案例。
回滚仅本次前端展示/菜单及测试文档，无数据迁移。

## 实际验证（2026-10-02）

- `npm run test --workspace=@opm/web -- OpdCanvas.spec.ts WorkbenchView.spec.ts`：19+87，共106项通过。
- 外部服务5177/17850与指定隔离测试项目：`workbench-navigator-visual.spec.ts`、`workbench-blank-context-menu.spec.ts`，3项通过（10.7秒）；覆盖正确父/元素关联、取消零写入、对象/过程展开零编辑、保存刷新、固定版本导航、桌面/390px原导航及属性/删除回归。模型finally移入回收站。
- 截图目录：`/private/tmp/opm-refined-element-navigation/workbench-navigator-visual-元素右键创建及展开子图、边框标记和只读导航/`，`refined-element-menu.png`与`readonly-refined-menu.png`已人工核对。
- `npm run typecheck`、`npm run lint`、`git diff --check`：通过。
- 复用X6已有title属性生成SVG title，边框/提示在presentation同步时更新，不写模型标记。状态与语义结构未改变。
