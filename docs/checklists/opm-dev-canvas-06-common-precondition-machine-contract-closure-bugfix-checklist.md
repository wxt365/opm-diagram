# Checklist: DEV-CANVAS-06 Common Precondition Machine Contract Closure Bugfix

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `testing (primary)`
- [x] `backend-springboot`
- [x] `design-module-docs`

## Spec Mapping

| 责任 | 规格章节 | 状态 |
| --- | --- | --- |
| P0复现与Root Cause | 1 | `COMPLETE` |
| 修改/禁止边界 | 2 | `FROZEN` |
| request与case映射 | 3 | `FROZEN` |
| 三类DIRECT command | 4 | `FROZEN` |
| 两类REQUEST mutation | 5 | `FROZEN` |
| receipt、首错与证据 | 6 | `FROZEN` |
| 正反例与回滚 | 7~8 | `FROZEN` |

## Checklist

- [x] CPM01 复现五类操作被错误收敛为立即POST的设计冲突。
- [x] CPM02 冻结六个case/kind应用及其他组合拒绝。
- [x] CPM03 冻结`setup-baseline-api`为locator token而非raw ref。
- [x] CPM04 冻结ADVANCE_HEAD完整CREATE_ELEMENT请求和事务baseline重绑定。
- [x] CPM05 冻结TEXT_BLOCKED与READONLY完整CREATE_FACT请求。
- [x] CPM06 冻结两类一次性`route.continue`改写、source match与固定replacement。
- [x] CPM07 冻结DIRECT/ARMED/final receipt、original/actual raw ref及Artifact Index边界。
- [x] CPM08 冻结错误码、首错、正反例与回滚。
- [x] CPM08A 冻结DIRECT `resolved_source_refs`、mutation五字段`match`及十三字段final receipt，禁止实现自创证据形状。
- [x] CPM08B 关闭Page前置baseline时序冲突：factory只接收两字段seed，首个attached Page Projection在sink内部绑定resolved baseline。
- [ ] CPM09 先补Runner失败测试，再修改precondition client。
- [ ] CPM10 Node 22完整Runner、contract validate和diff check通过。
- [x] CPM11 不提升Report、Gate、Candidate、Activation、Capability、production或ISO状态。
