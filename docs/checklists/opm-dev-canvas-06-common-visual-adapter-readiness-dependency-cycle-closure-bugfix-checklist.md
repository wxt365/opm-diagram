# Checklist: GOLDEN-AUTHORING-03C/03B Adapter Readiness 依赖环闭包

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 依赖环复现 | 1 | DC01~DC02 |
| Adapter Readiness 与 Integration 分离 | 2 | DC03~DC07 |
| 边界与状态 | 3 | DC08~DC10 |
| 验收与回滚 | 4~5 | DC11~DC14 |

## Design Closure

- [x] DC01 03C 的全 checklist 前置与 03B 执行验收互相依赖已复现。
- [x] DC02 固定 callback 不得冒充真实 UI/candidate 已明确。
- [x] DC03 `ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION` 的唯一条件已冻结。
- [x] DC04 `IMPLEMENTED/INTEGRATION_COMPLETE` 的真实 UI/fault/capture 回填条件已冻结。
- [x] DC05 03B 前置改为 Adapter Readiness，未放宽 03A/Environment 输入。
- [x] DC06 03B 保留八个 subject、一次性 fault、第二次正常提交、PNG 和双 attempt 验收。
- [x] DC07 03B 受控通过不提升 production/Gate。
- [x] DC08 不修改任何机器契约、Schema 或产品行为。
- [x] DC09 03B 仅恢复受控实现资格。
- [x] DC10 生产证据边界保持不变。
- [x] DC11~DC14 文档同步、无虚假提升与回滚边界已冻结。

## 实现状态

- [ ] 按本修正重写 03B Candidate Author 的受控实现与真实 UI/fault/capture 测试。
- [ ] 03B 受控 integration evidence 回填后，03C 才可标记 `IMPLEMENTED/INTEGRATION_COMPLETE`。

本 checklist 不构成 candidate、approval、Visual Manifest、GATE、Activation、Capability、production 或 ISO 证据。
