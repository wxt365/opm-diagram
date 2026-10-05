# P03 无边框关系名称输入

Work Mode：change；Risk Level：L1；Task Type：bugfix；Active Playbooks：frontend-vue (primary)、testing。

## Plan

### Lean Spec

目标：创建和双击改名使用无边框、12px 的线上文本输入，去掉外框、阴影、可见标题行；宽度 120px、高度 24px，输入中心仍定位到连线路径。取消按钮以小图标置于文字旁，不占标题行；保留可访问名称、必填校验、Enter/Escape/IME 和失败保留行为。

允许：WorkbenchView.vue、base.css、现有线上编辑规格、本 Checklist。禁止：Store/Runtime/API/Schema/数据库、依赖、其他工作区功能及用户模型。回滚仅撤销本轮样式和定位增量。

顺序：同步视觉契约，调整标签样式与定位，执行既有真实线上编辑用例并检查截图；不新增重复测试。

## Checklist

引用：Plan#Lean Spec。

- [x] 边界确认：纯显示调整，保留既有输入与命令语义。
- [x] LABEL-STYLE-01：已查看真实 Chromium 截图，输入为 120×24px、12px 字体，外框/标题行/阴影移除；字段含中英文可访问名称和提示。
- [x] LABEL-STYLE-02：既有“连线上输入关系名称、双击改名及重开保持 Fact 和 OPL 一致”真实用例 1/1 通过，覆盖定位、创建、双击、取消、IME、同名和重开。
- [x] LABEL-STYLE-03：`npm run lint --workspace=@opm/web`、`npm run build --workspace=@opm/web`（含 vue-tsc）和 `git diff --check` 通过。

2026-09-11 验证使用独立测试服务与临时模型；截图位于 `/private/tmp/opm-borderless-label-results/`。原因是原浮层沿用表单外框、标题和 224px 宽度，先前测试只验证交互与锚点，没有约束其视觉密度；本轮按用户截图与轻量文字样式完成视觉检查。
