# P02 模型卡片底部布局修正

## Plan#Lean Spec

- Work Mode：change；Risk Level：L1；Task Type：bugfix。
- Active Playbooks：frontend-vue（primary）、testing。
- 目标：避免 Profile 长标识挤压“打开工作台”，保持底部对齐及窄屏可用。
- 非目标：改变模型数据、修订信息、工作台行为或页面整体设计。
- 允许：ProjectDetailView.vue 的 Profile 提示属性、pages.css 与 responsive.css 中模型卡片底部规则、本规格的验证记录。
- 禁止：API、schema、依赖、配置、后端、其他页面及 `.harness` 内容变更。
- 契约影响：无；Profile 原文保留，省略显示时可通过悬停查看全文。
- A1：桌面按钮单行且位于卡片内，长标识显示省略号。
- A2：窄屏底部上下排列，按钮单行、页面无横向溢出。
- A3：点击“打开工作台”仍成功进入对应模型。
- 验证：真实 Chromium 在 2048、1600、1280、1024、768、390、320 像素宽度检查文字行数和边界；人工查看桌面/手机截图；现有项目详情组件测试、类型检查、lint、构建、diff 检查。
- 回滚：还原本次三个前端文件的 diff。

## 复现与原因

- 本地现有仓储演示项目含五张模型卡片；Chromium 在 1600/2048 宽度下五张卡片的按钮文字均为两行、高度 58px。
- 根因：底部 flex 布局允许按钮收缩，Profile 的长文本占用可用宽度。
- 验证缺口：组件测试不计算真实 CSS 布局；本次使用浏览器测量并检查截图，不新增仅断言 CSS 实现的单元测试。

## Plan

1. 底部使用两列网格，让标识列可收缩，按钮列保持内容宽度；标识单行省略并增加全文提示。
2. 680px 以下改为单列，使用已有按钮样式。
3. 执行上述验证并记录结果。

## Checklist

- [x] 引用 Plan#Lean Spec；允许/禁止边界已确认。
- [x] A1/A2：真实浏览器测量与截图检查。
- [x] A3：浏览器点击导航验证。
- [x] 前端定向回归和静态/构建检查。

## 验证结果

- 使用 Node 22 运行 `/private/tmp/opm-model-card-layout-check.mjs before`，记录上述失败证据；`after` 在七种宽度、五张卡片中均通过：按钮文字单行、高度 36px、位于底部边界内、页面无横向溢出、提示属性与 Profile 原文一致。
- 人工查看 `/private/tmp/opm-model-card-layout/after-1600.png` 与 `after-390.png`：桌面标识省略、按钮完整；窄屏标识和按钮上下排列，按钮满宽。
- 实际点击首张卡片按钮，成功进入对应模型工作台，工作台及修订信息加载完成。
- `npm run test --workspace=@opm/web -- src/modules/projects/ProjectDetailView.spec.ts`：2/2 通过。
- `npm run lint --workspace=@opm/web`：通过。
- `npm run build --workspace=@opm/web`：Vue 类型检查与 Vite 构建通过；输出 `/opm-bootstrap.js` 非 module 脚本提示，本次未修改该入口。
- `git diff --check`：通过。
- 复查步骤：打开现有项目详情，在 1600px 与 390px 宽度检查卡片底部；桌面悬停 Profile 查看完整标识，点击“打开工作台”验证跳转。临时浏览器脚本未加入仓库，复现依赖现有本地项目与服务。
