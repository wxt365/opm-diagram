# Checklist: DEV-CANVAS-06 Common编排与External Store集成Source闭包修正

状态：`FROZEN/COMPLETE`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 背景/复现/Root Cause | 1、2 | I01~I05 |
| Fix Strategy | 3 | I06~I10 |
| composite allowlist | 4 | I11~I16 |
| commit/patch身份 | 5 | I17~I23 |
| 顺序/CLI/join | 6、7 | I24~I33 |
| 取代/验收/回滚 | 8~10 | I34~I43 |
| 事实/待实现 | 11 | I44~I48 |

## Checklist

- [x] I01 已确认External Store 9项commit尚未创建。
- [x] I02 已确认Common编排8项commit尚未创建。
- [x] I03 已复现Runner HEAD必须等于Manifest source commit。
- [x] I04 已确认两个独立commit无法同时满足该join。
- [x] I05 Root Cause为两个局部source包缺少最终Manifest/Runner/Report三方闭包。
- [x] I06 唯一base固定为完整`e598b305a44ebb9c9845c1f5563bc36c3a89a2b4`。
- [x] I07 唯一结果固定为一个single-parent集成commit。
- [x] I08 禁止中间可消费9项commit。
- [x] I09 禁止独立8项Common commit。
- [x] I10 当前main HEAD只读且不得作为base。
- [x] I11 External Store子集精确为`9=7 M+2 A`。
- [x] I12 Common编排子集精确为`8=7 M+1 A`。
- [x] I13 两集合无交集。
- [x] I14 composite精确为`17=14 M+3 A`。
- [x] I15 14个M在`e598...`存在，3个A不存在。
- [x] I16 Schema/API/DDL/Profile/Driver/UI/factory等全部只读。
- [x] I17 final commit唯一parent必须等于`e598...`。
- [x] I18 禁止merge、第二commit、cherry-pick main和dirty patch。
- [x] I19 17项name-status必须逐项相等。
- [x] I20 patch SHA公式冻结为final commit raw binary patch摘要。
- [x] I21 final commit、parent、patch和package SHA不得预填。
- [x] I22 source clean reachpoint已冻结。
- [x] I23 旧source内失败根和dirty主工作树禁止复用。
- [x] I24 唯一实施与production重建顺序已冻结。
- [x] I25 先实现两个子集、联合测试、一次提交。
- [x] I26 生产重建使用第二个fresh final source worktree。
- [x] I27 external release store必须fresh且非Git。
- [x] I28 Handoff/Intake/Runtime/Web/Common从final commit重建。
- [x] I29 Unified Verifier使用新进程。
- [x] I30 Manifest builder/verifier使用final commit。
- [x] I31 Runner source-root HEAD使用同一final commit。
- [x] I32 Report runner source commit使用同一final commit。
- [x] I33 Source Set `0.1/23`和Report `0.2/0.2.0`保持不变。
- [x] I34 External Store规格/checklist标记独立9项commit被取代。
- [x] I35 Common编排规格/checklist标记独立8项commit被取代。
- [x] I36 Runner/Toolchain同步六方source join。
- [x] I37 README、测试策略、执行包与冻结基线同步。
- [x] I38 活动文档无并行9项/8项production commit准入。
- [x] I39 composite计数和链接验证通过。
- [x] I40 `git diff --check`通过。
- [x] I41 回滚不得恢复已证伪的独立commit路线。
- [x] I42 设计任务不修改代码/Schema/release资产。
- [x] I43 Gate/Capability/ISO状态未提升。
- [x] I44 `e598...`Git对象及parent已核实。
- [x] I45 当前main与`e598...`互不为祖先。
- [x] I46 14个M/3个A在base的存在形状已核实。
- [x] I47 最终commit和production资产仍为`NOT_CREATED/NOT_RUN`。
- [x] I48 事实与待实现结果已分栏。

## 当前门状态

- 设计修正：`COMPLETE`。
- 17项集成Source Build：`READY_FOR_BUILD/NOT_STARTED`。
- production input/Manifest/Runner：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
