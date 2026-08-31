# DEV-CANVAS-06 Structural Form Selector Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

Family Driver设计要求Structural PASS通过真实UI写入labels、direction和collection completeness，但稳定selector表只冻结了表单、label和completeness。`CAP-ISO-STRUCT-010`的Golden PASS同时存在`DIRECTED/BIDIRECTIONAL/UNDIRECTED`，现有页面对direction提供可访问label、对提交按钮提供精确可访问名称；若不冻结这两个定位，Driver只能遗漏方向、使用未授权CSS或自行修改Vue与Stage R source边界。

## 2. 唯一修正

在唯一`p03-structural-candidate`表单scope内增加两个受控locator：

```text
getByRole("combobox", {name:"direction", exact:true})
getByRole("button", {name:"创建", exact:true})
```

Driver只在input Fact方向与当前表单值不同时选择exact枚举；提交前逐项复核labels、direction和collection completeness。禁止全页role搜索、模糊name、CSS标签、序号、坐标或文本近似匹配。

## 3. 修改与验收边界

本修正只更新设计输入；后继实现仍仅修改既有Structural Driver与Runner test，不修改Vue、Manifest、Schema、Profile、fixture、Stage R `25=23 M+2 A`、累计`45=33 M+12 A`或Source Set `9+15=24`。

至少覆盖CAP-ISO-STRUCT-010三种方向、带/不带labels、COMPLETE/INCOMPLETE/NOT_APPLICABLE、缺失/重复表单控件及提交控件反例。

本规格不构成真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性证据。
