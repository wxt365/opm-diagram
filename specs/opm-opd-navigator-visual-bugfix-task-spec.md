# OPD 左侧导航视觉整理

Work Mode: change；Risk Level: L2；Task Type: bugfix。
Active Playbooks: frontend-vue (primary), testing。

## 目标与边界

改善截图中的OPD导航：统一标题/计数、层级节点、父图按钮及细化表单的字号、边框、背景和间距，避免浏览器默认按钮样式。
允许：WorkbenchView导航模板、workbench-layout.css的导航选择器、相关验证、本规格及设计文档。
禁止：API/schema、store与导航业务、依赖/配置、.harness、其他页面、全局样式重构、原案例内容。保留全部既有脏改动。
非目标：折叠树/搜索、新建或删除能力扩展、改变切图与细化流程。公共契约无变化。

## 验收

- A1：标题改为OPD导航，计数使用独立徽标；各级图有统一图标和缩进，当前图突出，长名称不撑宽侧栏，完整名称可从title查看。
- A2：父图返回为统一轻量按钮；创建子图表单有分区标题、细化对象提示、输入框和清晰提交按钮，键盘焦点/禁用/忙碌状态可辨识。
- A3：切图、返回父图、细化创建、只读行为沿用原流程；真实浏览器验证三层图和新建细化，隔离模型结束移入回收站。
- A4：桌面/390px窄屏截图人工查看，导航内容不溢出；定向工作台测试及typecheck/lint/diff通过。

## Plan

1. 仅替换左侧展示结构，保留原点击/提交函数与测试标识。
2. 局部导航CSS补齐按钮重置、统一尺寸、层级引导及长名截断。
3. 真实浏览器隔离模型创建三级图，截图核验并回归导航；同步设计文档。

## 复现与原因

用户截图显示Context计数连排、灰色默认父图按钮及未分区的细化输入框。原navigator-parent仅定义间距/颜色，未定义border/background/font-family；默认按钮外观与导航不一致，计数也缺少专用样式。此前功能测试验证创建和切图，没有覆盖该区域的实际CSS与视觉截图。

## Checklist

Spec: specs/opm-opd-navigator-visual-bugfix-task-spec.md。
边界已确认：仅导航展示及对应测试/文档。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

## 验证与回滚

采用既有Vitest/Playwright；原客户案例只读查看，隔离模型用于创建和切换。
回退仅本轮模板/CSS差异，无数据迁移。

## 实际验证

- WorkbenchView定向86项测试通过；typecheck、lint、git diff --check通过。
- 新真实Playwright场景通过（2.9s）：通过UI创建独立模型，添加对象/过程并创建三级图；核验当前图标记、父图返回、长名称title、清空名称禁用、实际按钮背景样式，以及只读版本隐藏创建表单并可返回根图。结束finally移入回收站。
- 桌面1440×1000与窄屏390×844均核验按钮/输入框边界不超出导航面板，并人工查看截图：/private/tmp/opm-navigator-visual-final。长名称显示省略号，完整名称留在title；主导航尺寸未扩展。
