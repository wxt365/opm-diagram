# Spec: OPM P03 工作台 P0 可用性修复

## Task Type

`bugfix`

## Active Playbooks

- `frontend-vue (primary)`
- `testing`

## 1. 背景

P03 在 `1440 x 1000` 下将底部 OPL/Finding 面板压缩为 `0px`，并错误地给校验区分配 `240px`；在 `390 x 844` 下工具栏覆盖画布，过程结点落在不可滚动的画布可视区之外。现有 E2E 命令允许零用例成功，无法防止这些回归。

## 2. 目标

1. 桌面工作台稳定保留 `240px` 底部面板和 `43px` 校验区，不受条件通知影响。
2. 移动端工具栏按内容高度展开，不覆盖画布。
3. 移动画布可在内部水平滚动，能够到达位于右侧的过程结点。
4. 增加真实 Playwright 回归用例，`test:e2e` 不再允许零用例通过。

## 3. 非目标

- 不处理 Context/Revision 路由、符号契约、mock adapter、弹层无障碍或后端接入。
- 不改动 OpenAPI、数据库、后端、依赖版本和全局路由。

## 4. 范围

### 包含范围

- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/shared/styles/base.css`
- `tests/e2e/**`
- `package.json`
- 本规格和 checklist。

### 不包含范围

- `services/**`、`docs/contracts/**`、`docs/design/**`、`prototype/**`、`apps/web/src/app/router.ts`。

## 5. 现状与根因

- `.workbench` 固定五行，但条件横幅/反馈作为直接子元素参与自动 Grid 排位，导致底部面板与校验区落入错误行。
- `.editor-panel` 固定 `45px` 工具栏行，而移动样式将工具栏改为纵向内容。
- `.canvas-frame` 隐藏溢出，画布宽度等于移动视口，右侧结点无滚动入口。
- E2E 仅有配置文件，根命令带 `--pass-with-no-tests`。

## 6. 方案要求

- 将条件通知收敛到工作台主内容区域，主 Grid 只管理 header、主区、底栏和校验区四个稳定区域。
- 工具栏使用最小高度而非固定高度；画布保持主区剩余空间。
- 画布框架允许内部水平滚动，画布提供最小内部宽度，不造成页面横向溢出。
- Playwright 分别断言桌面行高、移动工具栏不重叠和移动滚动后过程结点可见。

## 7. 接口、数据与兼容性

- 不新增或修改 HTTP API、配置、数据库 schema、持久化数据或发布顺序。
- 路由、Pinia 领域状态和 X6 语义数据不变；仅调整页面结构、布局和测试入口。

## 8. 验收标准

1. `1440 x 1000` 下 `.bottom-panel` 为 `240px`，`.validation-status` 为 `43px`。
2. `390 x 844` 下所有 P03 工具栏按钮位于工具栏边界内，画布开始于工具栏之后。
3. `390 x 844` 下画布内部 `scrollWidth > clientWidth`，横向滚动后 `Processing` 结点进入画布可视区。
4. `npm run test:e2e` 至少执行上述两个用例；lint、typecheck、unit、build 均通过。

## 9. 验证与回滚

- 验证：执行 `npm run lint`、`npm run typecheck`、`npm run test`、`npm run test:e2e`、`npm run build`，并在 1440x1000/390x844 浏览器复核。
- 回滚：还原本任务涉及的 P03 模板、CSS、E2E 配置与用例；不涉及数据回滚。
