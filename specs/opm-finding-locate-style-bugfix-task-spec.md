# 问题面板定位操作样式

## Plan#Lean Spec

- Work Mode：change；Risk Level：L1；Task Type：bugfix；Active Playbooks：frontend-vue（primary）。
- 目标：将问题定位操作改为与底部面板一致的紧凑图标文字按钮，置于所选问题详情的标题行；空态和未选中问题时不显示定位操作。
- 原因：定位按钮复用页面级 button--secondary，字号、字重、尺寸与面板不一致，且未绑定问题详情的可见性；上一轮功能测试覆盖定位和禁用状态，未约束空态操作的呈现。
- 非目标：不改校验规则、定位行为、面板其他布局或全局主题。
- 允许：WorkbenchBottomPanel.vue、对应现有测试和浏览器视觉回归、本规格；禁止 API/schema、依赖、配置、后端和 `.harness` 改动。保留此前 dirty 改动。
- A1：空态及未选问题不显示按钮；选中问题后显示，并继续支持定位及原禁用状态。
- A2：按钮与 OPL 导出操作使用一致的紧凑样式，桌面和390px窄屏不挤压标题；键盘焦点可见。
- 验证：复用现有面板/页面测试、typecheck、lint和真实浏览器画布流程，复核截图；回滚只撤销本轮相关差异。

## Plan

1. 挪入所选问题详情标题行，复用面板级操作尺寸与颜色，补悬停/焦点反馈。
2. 更新现有空态断言，运行定向检查及浏览器截图复核。

## Checklist

- Spec：`Plan#Lean Spec`；边界已确认，无公共契约或全局样式改动。
- [x] A1
- [x] A2

## 实际验证

- 面板与工作台现有测试共95项通过，包含空态、未选择问题、选中后定位及过期/失败/运行中禁用状态；日志 `/private/tmp/opm-finding-style-tests.log`。
- typecheck、lint、git diff --check通过；日志 `/private/tmp/opm-finding-style-types.log`、`/private/tmp/opm-finding-style-lint.log`。
- 真实Playwright两项通过（9.3秒）：实际创建错误关系、校验、跨图定位、修复后重校验与保存重开；无问题时定位按钮不存在。390px窄屏滚动到问题详情后，按钮位于屏幕范围内。日志 `/private/tmp/opm-finding-style-e2e.log`。
- 已复核桌面、窄屏和零问题截图：按钮置于建议标题右侧，使用28px紧凑高度、12px字和定位图标；零问题面板仅保留说明。截图目录 `/private/tmp/opm-finding-style-e2e/workbench-findings-真实画布错误关系：全模型校验、跨图定位、失败重试、修改修复及保存重开/`。
