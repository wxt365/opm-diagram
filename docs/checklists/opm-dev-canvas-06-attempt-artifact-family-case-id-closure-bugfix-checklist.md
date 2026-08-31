# Checklist: DEV-CANVAS-06 Attempt Artifact Family Case ID Closure Bugfix

状态：`IMPLEMENTATION_VERIFIED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | 状态 |
| --- | --- | --- |
| P0复现与Root Cause | 1~2 | `COMPLETE` |
| 唯一caseId与Manifest exact join | 3 | `FROZEN` |
| 修改/禁止边界 | 4 | `FROZEN` |
| Schema、semantic和回归验收 | 5 | `COMPLETE` |
| 回滚与证据状态 | 6 | `FROZEN` |

## Checklist

- [x] CID01 复现Family Fault Plan被活动Attempt Artifact `0.2`拒绝。
- [x] CID02 冻结Family/Common两族caseId字形。
- [x] CID03 冻结Manifest唯一exact join继续作为身份授权边界。
- [x] CID04 冻结三个fault专用映射不变，Family继续只允许NONE。
- [x] CID05 明确不修改Manifest/Report/Source Set版本和历史`0.1` bytes。
- [x] CID05A 冻结Family Archive Ref、Common File Ref及按fixture_kind收紧规则。
- [x] CID05B 冻结Java raw读取、完整ref原样持久化和verifier结构深等规则。
- [x] CID05C 本规格曾把Stage R扩为`31=29 M+2 A`、累计扩为`50=38 M+12 A`；后继Common Precondition及其test source owner闭包最终取代为`33/52`，Runner Source Set保持24项。
- [x] CID06 更新活动Schema与正反contract test；Schema定向测试`22/22 PASS`，Attempt owner测试`7/7 PASS`。
- [x] CID07 Java CLI/Test、Family Fault Plan和Materialization定向测试通过；Java 21 CLI/JarIT `13/13 PASS`，Node Materializer聚焦测试`1/1 PASS`。
- [x] CID08 Node 22完整Runner `79/79 PASS`、`npm run contract:validate`和`git diff --check`通过。
- [x] CID09 不提升Report、Gate、Candidate、Activation、Capability、production或ISO状态。
