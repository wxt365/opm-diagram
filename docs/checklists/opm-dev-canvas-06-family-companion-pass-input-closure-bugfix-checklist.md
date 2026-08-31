# Checklist: DEV-CANVAS-06 Family Companion PASS Input Closure Bugfix

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `testing (primary)`
- [x] `design-module-docs`

## Design Closure

- [x] CP01 requirement不含Fact语义已查证。
- [x] CP02 BLOCKED需要合法companion Fact已查证。
- [x] CP03 当前CaseExecution缺两个可执行输入已查证。
- [x] CP04 禁止修复非法Fact或按名称猜测。
- [x] CP05 两个必填字段已冻结。
- [x] CP06 PASS自指规则已冻结。
- [x] CP07 BLOCKED首个同Capability PASS算法保持不变。
- [x] CP08 Coverage/Golden/Manifest三方case join已冻结。
- [x] CP09 companion input raw ref join已冻结。
- [x] CP10 companion fixture恰一Fact已冻结。
- [x] CP11 family/capability/profile binding已冻结。
- [x] CP12 Driver唯一读取companion Fact边界已冻结。
- [x] CP13 输入失败错误码已冻结。
- [x] CP14 Manifest/Artifact/Report Schema不变。
- [x] CP15 Stage R保持25。
- [x] CP16 O..R保持45。
- [x] CP17 Source Set保持9+15。
- [x] CP18 178正例与漂移负例已冻结。
- [x] CP19 Gate状态不变。
- [x] CP20 非结论已冻结。

## Implementation

- [ ] I01 补缺companion semantic input的失败测试。
- [ ] I02 Runner builder闭合两字段。
- [ ] I03 三Family BLOCKED只消费companion Fact建立候选。
- [ ] I04 验证130自指与48 companion join。
