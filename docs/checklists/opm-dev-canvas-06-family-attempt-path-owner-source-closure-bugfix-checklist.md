# Checklist: DEV-CANVAS-06 Family Attempt Path Owner 与 Source Closure Bugfix

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `testing (primary)`
- [x] `design-module-docs`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 复现与Root Cause | 1~2 | AP01~AP04 |
| 词法与唯一owner | 3 | AP05~AP10 |
| allowlist与Source Set | 4~5 | AP11~AP16 |
| 验收、回滚、状态 | 6~7 | AP17~AP22、I01~I06 |

## Design Closure

- [x] AP01 共享owner只接受Common ID的失败已复现。
- [x] AP02 活动Manifest的178 Family与16 Common两类ID已确认。
- [x] AP03 Root Cause为共享词法过窄，不是Manifest或Driver语义错误。
- [x] AP04 禁止在Runner复制percent encoder。
- [x] AP05 Common与Family两个封闭正则已冻结。
- [x] AP06 PROC/CTRL/STRUCT和Common suite范围已冻结。
- [x] AP07 attempt ordinal继续只允许1或2。
- [x] AP08 路径分隔符、穿越、NUL、unknown/lowercase均拒绝。
- [x] AP09 percent-encoding bytes与大写HH保持不变。
- [x] AP10 `attemptRelativeRoot()`保持唯一owner。
- [x] AP11 Stage R新增共享owner/test exact 2 M。
- [x] AP12 Stage R取代为25=23 M+2 A。
- [x] AP13 O..R取代为45=33 M+12 A。
- [x] AP14 Source Set保持0.2/24。
- [x] AP15 Source Set相对A取代为9 changed/new +15 unchanged。
- [x] AP16 source guard owner/test必须同步新exact集合。
- [x] AP17 四类正例和词法负例矩阵已冻结。
- [x] AP18 Context 194/388是必须回归路径。
- [x] AP19 回滚必须整体恢复owner、allowlist和计数。
- [x] AP20 不修改Manifest/Attempt/Report Schema或业务语义。
- [x] AP21 不提升任何Gate或发布状态。
- [x] AP22 无第二路径owner或fallback。

## Implementation

- [ ] I01 先补Family case失败测试。
- [ ] I02 最窄扩展共享case ID词法。
- [ ] I03 四类正例和负例通过。
- [ ] I04 Context 194/388正例通过。
- [ ] I05 Stage R exact 25与O..R exact 45通过。
- [ ] I06 Source Set 9 changed/new +15 unchanged闭合。
