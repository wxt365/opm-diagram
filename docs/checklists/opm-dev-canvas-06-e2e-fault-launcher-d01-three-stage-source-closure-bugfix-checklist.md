# Checklist: DEV-CANVAS-06 E2E Fault Launcher D01 三段 Source 闭包 Bugfix

状态：`DESIGN_FROZEN / SUPERSEDED_BY_FINAL_PRODUCTION_SOURCE_CHAIN`

活动边界：三段逐parent校验原则保留，但固定commit链已由final production source-chain闭包取代为`9048bb3... -> C -> S -> A`，A=`4=2 M+2 A`。下列旧commit检查项只记录历史复现与接纳，不构成活动Build输入。

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现与Root Cause | 1、2 | D01~D07 |
| Fix Strategy与身份 | 3、4 | D08~D17 |
| D01算法与Report | 5 | D18~D36 |
| 2M接纳与修改边界 | 6、7 | D37~D49 |
| 验收、回滚、风险、非结论 | 8、9 | D50~D61 |

## Checklist

- [x] D01 origin固定为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`。
- [x] D02 rejected contract candidate固定为`63851f8878dcf6da86e99d5ffa7795ac48200920`。
- [x] D03 conformant contract base固定为`586d6dee1b07c6634267aeb344e8826adb1ddb4b`。
- [x] D04 已复算`63851f8...`唯一parent为origin。
- [x] D05 已复算`586d6de...`唯一parent为rejected candidate。
- [x] D06 已复现旧D01要求`parent(586d6de)=origin`，因此永远非READY。
- [x] D07 Root Cause已收敛为2M后继加入中间节点后，D01未同步完整Git图。
- [x] D08 Report `0.2`保持三个既有commit字段，不增加rejected字段。
- [x] D09 `contract_base_source_commit`继续表示candidate唯一parent，不重解释为rejected candidate。
- [x] D10 rejected candidate只由`parent(contract base)`推导并与exact SHA比较。
- [x] D11 origin由`parent(rejected candidate)`推导并与Report固定origin比较。
- [x] D12 四节点顺序固定为`origin -> rejected -> contract -> candidate`。
- [x] D13 活动三段delta由后继规格固定为C=`20=12 M+8 A`、S=`2 M`、A=`4=2 M+2 A`。
- [x] D14 `586d6de...`tree固定为`1e8111b1ef53970bf450ba7f96c44e5a54f20e1e`。
- [x] D15 `586d6de...`epoch固定为`1787743172`。
- [x] D16 `586d6de...`raw binary patch SHA固定为`56138e19bd83241ffdd60bda3f156a3f9c0b768c6d083ea453893e428ce021e4`。
- [x] D17 2A candidate身份保持未来执行生成，不预填。
- [x] D18 Git parent/delta读取固定禁用replace object和rename推断。
- [x] D19 禁止branch/tag/message/abbrev/path/latest/mtime/fallback身份来源。
- [x] D20 candidate必须是source HEAD且为完整40位小写SHA。
- [x] D21 candidate必须恰有一个parent且等于`586d6de...`。
- [x] D22 contract必须恰有一个parent且等于`63851f8...`。
- [x] D23 rejected必须恰有一个parent且等于origin。
- [x] D24 origin到rejected必须逐项等于12项contract allowlist。
- [x] D25 rejected到contract必须逐项等于Gate Schema与producer测试`2 M`。
- [x] D26 S到A必须逐项等于两个Runner `M`与两个controlled `A`。
- [x] D27 三段delta必须比较有序status/path，不允许只比较数量。
- [x] D28 merge、rename、copy、type-change、extra、missing均拒绝。
- [x] D29 source porcelain必须包含tracked/untracked全量检查且为空。
- [x] D30 Report origin字段固定为origin exact SHA。
- [x] D31 Report contract字段固定为`586d6de...`。
- [x] D32 Report candidate字段固定为实际2A HEAD。
- [x] D33 `implementation_delta`仍只表达S到A，但固定为四个path和`M/M/A/A`状态。
- [x] D34 `baseline_raw_refs_sha256`仍表达origin的36项基线；两个Runner ref允许在A变更，其余34项不变。
- [x] D35 D01成功保持`READY/READY`。
- [x] D36 链或delta失败保持`MISMATCH/SOURCE_COMMIT_NOT_READY`，不增加detail/evidence类型。
- [x] D37 `586d6de...`single-parent和exact`2 M`已复算。
- [x] D38 12项contract raw ref集合摘要固定为`8662b3bbd051a3f5756a28baa411149e64e2319d085cfe68479556af8bd5b1d9`。
- [x] D39 Node `22.22.0`定向producer/verifier测试`13/13 PASS`。
- [x] D40 Node `22.22.0`下`npm run contract:validate`通过。
- [x] D41 2M clean worktree的`git diff --check`通过。
- [x] D42 2M验证后porcelain为空。
- [x] D43 `586d6de...`状态可提升为`READY_AS_2A_CONTRACT_BASE`。
- [x] D44 当前2A v2 worktree HEAD为`586d6de...`。
- [x] D45 当前2A v2 worktree只有两个未提交目标文件。
- [x] D46 当前未创建2A final commit。
- [x] D47 本bugfix只允许修改规格、checklist、设计和索引状态。
- [x] D48 禁止修改2A文件、12项contract bytes、36项baseline或任何Schema/代码。
- [x] D49 不修改Preflight Report字段、版本或摘要算法。
- [x] D50 正例覆盖完整四节点三段链。
- [x] D51 反例覆盖跳过rejected、错误parent和merge。
- [x] D52 反例覆盖三段数量相等但路径/状态漂移。
- [x] D53 反例覆盖candidate从origin或rejected直接产生。
- [x] D54 反例覆盖dirty source。
- [x] D55 反例覆盖Report误填rejected为contract base。
- [x] D56 D01 READY不联动提升其他dependency或Playwright/Gate。
- [x] D57 回滚不删除或amend三个既有commit。
- [x] D58 当前2A未提交代码只视为失败现场/局部BLOCKED实现。
- [x] D59 本设计未生成controlled evidence或production Report。
- [x] D60 Gate、Candidate、Activation、Capability、production和ISO状态不提升。
- [x] D61 Spec Mapping覆盖目标、范围、非目标、约束、验收、验证和回滚。

## Validation

- [x] 三个commit及parent关系已由Git对象复算。
- [x] origin到rejected为exact`12=4 M+8 A`。
- [x] rejected到contract为exact`2 M`。
- [x] 2M定向测试`13/13 PASS`。
- [x] Node 22 `contract:validate`通过。
- [x] 活动文档旧两段D01文字扫描无命中；带`SUPERSEDED_FOR_BUILD`标记的Clean Base历史包保留当时状态记录，不作为活动Build口径。
- [x] 14份活动规格、checklist、设计和索引的Markdown本地链接检查通过。
- [x] 主工作树与clean contract worktree的`git diff --check`均通过。

## 当前门状态

- D01三段设计：`FROZEN`。
- conformant contract base `586d6de...`：`READY_AS_2A_CONTRACT_BASE`。
- 2A Build：`DESIGN_UNBLOCKED / IMPLEMENTATION_INCOMPLETE`。
- 2A final commit：`NOT_CREATED`。
- Controlled Playwright：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
