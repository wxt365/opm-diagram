# Spec: OPM P03 工作台头部与检查器视觉优化

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`refactor`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 目标

1. 将工作台头部重组为清晰的模型上下文、版本状态和命令操作三层信息，降低按钮拥挤和状态混杂。
2. 统一右侧检查器在 State、Object/Process/Feature、Relation、Structural 编辑、Control 候选和空选择状态下的标题、内容分区、表单、元数据和操作布局。
3. 扩大桌面检查器有效宽度，长 ID 可读且不挤压标签；内容独立滚动，标题保持稳定。
4. 在桌面、820px 窄视口和紧凑视口中保持无重叠、无文本溢出，并保留画布和工具栏可用空间。

## 2. 必须保持不变

- 所有按钮、select、input 的业务行为、禁用条件、事件处理、`data-testid` 和可访问名称保持不变。
- State 名称/角色保存、显式/抑制、展开/折叠，Element/Feature 名称编辑，Structural 编辑和 Control 候选流程保持不变。
- Store、API、schema、命令 payload、Runtime、路由、配置、依赖和持久化数据不变。
- 画布工具栏、Context 导航、底部工作区和关系参数浮层不在本次视觉重构范围内。

## 3. 允许与禁止范围

允许修改：

- `specs/opm-p03-workbench-header-inspector-polish-refactor-task-spec.md`
- `specs/opm-p03-workbench-header-inspector-polish-refactor-checklist.md`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchInspector.vue`
- `apps/web/src/shared/styles/workbench-layout.css`
- `apps/web/src/shared/styles/workbench-panels.css`
- `apps/web/src/shared/styles/forms.css`
- `apps/web/src/shared/styles/responsive.css`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-header-inspector-polish.spec.ts`
- `docs/design/opm-complete-canvas-toolchain-design.md`

禁止修改上述清单外文件，尤其是 Store/API、后端、数据库、生成契约、依赖、全局配置、Profile/Golden/Release 和 `runtime-data/**`。

## 4. 实现决策

- 头部维持单一 full-width band；右侧使用版本组和操作组，不增加卡片或第二套导航。
- 复制链接、校验和恢复按钮复用 Lucide 图标；文字仍保留，避免纯图标语义不清。
- 检查器固定为 header + scroll body。内容使用无嵌套卡片的 section 分隔；主要提交按钮使用 primary，展示/取消类操作保持 secondary。
- State 编辑顺序调整为名称、角色、显示方式、标识信息，优先呈现高频编辑内容。
- 桌面检查器宽度由 270px 调整为 320px；中窄视口放到画布下方，紧凑视口保持单列和横向工具栏。

## 5. 验收项

- `UI-HEADER-01`：模型上下文、版本/保存状态和操作按钮有明确分组；1920px 桌面无拥挤、错位或文本截断。
- `UI-HEADER-02`：头部所有既有控件、可访问名称、禁用条件和测试标识保持兼容。
- `UI-INSPECTOR-01`：State、Element/Feature、Relation、Structural、Control 和空态共享统一标题、section 和操作样式。
- `UI-INSPECTOR-02`：长 State/Element/Occurrence/Relation ID 在 320px 栏中可换行且标签不被挤压；内容滚动不带动标题。
- `UI-RESPONSIVE-01`：桌面与 820px 窄视口无重叠或横向页面溢出；窄屏检查器保持可用。
- `UI-REGRESSION-01`：定向/全量 Vue 测试、ESLint、typecheck、build 和 Playwright 视觉主路径通过。

## 6. 验证

先执行 `WorkbenchView.spec.ts`，再执行 Web 全量测试、ESLint、typecheck 和 build。Playwright 创建 Object、State 和关系，分别截图头部、State 检查器、Element 检查器与 Relation 检查器的桌面/窄屏状态，并人工检查重叠、溢出和操作层级。

## 7. 回滚

回退本 Spec 允许文件即可恢复原布局；没有 API、schema、配置、依赖或数据迁移需要回滚。
