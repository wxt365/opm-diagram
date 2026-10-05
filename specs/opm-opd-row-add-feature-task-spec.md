# OPD行尾添加子图

Work Mode: change；Risk Level: L2；Task Type: feature。
Active Playbooks: frontend-vue (primary), testing。

## 目标与边界

OPD每行名称后提供独立“＋”按钮，点击后在该行展开创建区，取消常驻创建表单。
允许：WorkbenchView导航模板/局部交互、导航CSS、相关单测/e2e、本规格及设计文档。
禁止：store/API/schema、后端、依赖/配置、.harness、其他页面、原案例内容、无关重构。
非目标：无需细化元素的空白子图、新树折叠/删除行为。契约影响无，仍通过既有CREATE_CONTEXT细化所选对象/过程。

## 验收

- A1：各行有独立“＋”，不会嵌套button或改变文字位置；点图名仅切换图，点＋展开该图的创建区，无自动提交。非当前行先切图，切到其他位置、取消或创建成功关闭创建区。
- A2：未选对象/过程时明确提示先选择；选择后可编辑子图名称并确认，沿用现有细化命令/父边/回读。空名称、只读、加载/提交/预览及关系编辑时禁用创建。
- A3：独立可访问名称、展开状态、输入焦点及取消/Escape；桌面/390px窄屏不溢出，不增加常驻表单。
- A4：真实画布验证三级创建、非当前图＋、未选提示、取消零写入和只读；回归原多选切图流程，测试模型finally移入回收站；定向单测和typecheck/lint/diff通过。

## Plan

1. 将每行分为名称按钮和固定宽度添加按钮，保留原名称按钮testid；创建区按目标context插入同行下方。
2. 用本地目标context状态编排既有openContext/createRefinement，沿用选择和默认名称，不扩展存储契约。
3. 同步旧测试进入新入口，实际创建、切换及截图验证后更新设计文档。

## Checklist

Spec: specs/opm-opd-row-add-feature-task-spec.md。
允许/禁止边界已确认，如上。
- [x] A1：真实浏览器验证当前/非当前行＋、图名切换、取消关闭；独立按钮及固定宽度布局通过截图核对。
- [x] A2：真实三级细化创建、未选择提示、空名称禁用与固定版本只读通过；沿用既有创建命令。
- [x] A3：输入焦点、Escape、取消、桌面及390px截图与控件边界检查通过。
- [x] A4：两项真实e2e通过，86项WorkbenchView单测通过；测试模型finally移入回收站，typecheck/lint/diff通过。

## 验证与回滚

沿用Vitest/Playwright，隔离测试模型，不写原案例。回滚仅本轮前端差异，无数据迁移。

2026-10-02实际验证：
- `npm run test --workspace=@opm/web -- WorkbenchView.spec.ts`：86项通过。
- 外部服务5177/17850、指定隔离模型，运行 `workbench-navigator-visual.spec.ts` 与 `workbench-layout-selection.spec.ts`：2项通过（10.1秒）。覆盖三级图、跨图＋、取消、只读及原多选布局保存重开流程。
- 截图：`/private/tmp/opm-opd-row-add-final/workbench-navigator-visual-三级OPD导航、长名称、创建细化和窄屏展示/navigator-desktop.png` 与同目录 `navigator-mobile.png`，人工核对通过。
- `npm run typecheck`、`npm run lint`、`git diff --check`：通过。
- 切图只更新query时，清理创建区的watch使用独立标量source，避免新数组引用导致误清理；上述跨图＋e2e覆盖此回归。

## 行尾创建确认图标增量 Plan

Work Mode: change；Risk Level: L1；Task Type: feature。
Active Playbooks: frontend-vue (primary), testing。

### Lean Spec

目标：创建区提交图标改为对号，表达确认名称并创建。非目标：调整子图关联、创建命令或布局。
允许：WorkbenchView.vue图标、本文验证记录。禁止：API/schema、store、后端、配置、依赖、.harness及无关文件。
契约影响：无。验收B1：显示对号且可正常创建子图；B2：既有父图/细化元素关联保留。
验证：复用真实导航e2e并检查截图；typecheck/lint/diff。回滚：仅恢复本次图标替换。

实现顺序：复用现有Check图标；真实创建和截图核对。
Checklist（引用：Plan#Lean Spec；边界已确认）：B1/B2已验证。

实际验证：真实导航e2e 1项通过（3.3秒），覆盖三级子图创建和父图返回；桌面/390px截图已核对，对号显示正确（`/private/tmp/opm-opd-confirm-check/`）。typecheck、lint、git diff --check通过。关联查证：createRefinement提交父context及refinee_element_id，DraftWorkspaceService校验所选元素并写入refinement_edges；本次未修改此流程。
