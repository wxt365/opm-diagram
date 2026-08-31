# DEV-CANVAS-06 Family Companion PASS Input Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `testing (primary)`
- `design-module-docs`

## 1. 目标

关闭48个Family BLOCKED case建立合法候选时缺少companion PASS semantic input的问题。当前`FamilyCaseExecution`只携带`companion_pass_requirement`，但真实UI候选需要companion PASS的Golden case与input fixture中的Fact endpoints、Modifiers和labels。

本修正只扩展Runner内存对象，不修改Manifest、Attempt Artifact、Report、fixture bytes、Driver case集合、Stage R allowlist或source计数。

## 2. Root Cause

Coverage requirement只包含`family/capability_id/variant/expectation/dimensions`等覆盖信息，不包含可执行Fact。Family Driver设计同时要求BLOCKED先按companion PASS endpoint/Fact走真实UI，因此现有输入不能唯一执行；从当前非法fixture修复端点或从case名推断合法Fact都属于未授权语义生成。

## 3. 唯一修正

`FamilyCaseExecution`增加两个必填字段：

```text
companion_pass_golden_case
companion_pass_input_fixture
```

PASS case同样携带两个字段，且分别等于当前`golden_case`和`input_fixture`，保持对象形状唯一。BLOCKED case按Coverage Catalog原序选择同`family+capability_id+expectation=PASS`的第一项后：

1. 以其`case_id`唯一join Golden Manifest case；
2. 以该Golden case的`input_revision_fixture`唯一join Manifest中对应PASS case的`input_ref`；
3. 按raw ref读取该input fixture，必须恰含一个Fact；
4. requirement、Golden case与companion Manifest case的`case_id`逐字符相等；
5. family、capability、expectation=PASS、base fixture identity和Profile binding逐字段一致；
6. Driver建立候选只能读取`companion_pass_input_fixture.facts[0]`，不得修复当前非法Fact、选相邻case或读取checkout。

## 4. 修改与验收边界

后继实现仍落在既有Runner owner/test与三个Family Driver的Stage R allowlist内。活动计数保持`Stage R=25`、`O..R=45`、Source Set=`9+15=24`。

至少验证178个Family CaseExecution都携带两个字段；130 PASS自指当前case；48 BLOCKED逐项闭合同Capability首个PASS；缺失、重复、wrong family/capability、raw ref或fixture Fact数量漂移在Browser前返回`E2E_INPUT_INVALID/2`。

本规格不构成真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性证据。
