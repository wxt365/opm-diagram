# Checklist: DEV-CANVAS-06 Family Error Code Mapping 与 Source Closure Bugfix

状态：`FROZEN_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现、Root Cause | 1~2 | EM01~EM06 |
| Fix Strategy与19项映射 | 3~4 | EM07~EM18 |
| 修改边界与allowlist | 5 | EM19~EM27 |
| 真实HTTP测试契约 | 6 | EM28~EM36 |
| Source Set/Runtime身份 | 7 | EM37~EM43 |
| 顺序、验收与验证 | 8 | EM44~EM49、I01~I12 |
| 回滚与状态 | 9~10 | EM50~EM53 |

## Design Closure

- [x] EM01 活动Replay目标集合已机器确认为`19=15 CTRL+4 STRUCT`。
- [x] EM02 当前Service经`domain()`返回`DOMAIN_REJECTED/422`的最小复现已记录。
- [x] EM03 OpenAPI/Runtime/Replay的局部一致不能替代真实命令wire闭包。
- [x] EM04 Root Cause定位为Stage R缺少Service source ownership。
- [x] EM05 此前遗漏原因定位为MVC未要求真实候选与command路径。
- [x] EM06 本规格只冻结设计，不修改实现或状态。
- [x] EM07 Control 15个完整case ID已逐项冻结。
- [x] EM08 Structural 4个完整case ID已逐项冻结。
- [x] EM09 Control原子对固定为`control.capability + control.segment=PROCESS_INPUT`。
- [x] EM10 独立Control Fact、基础能力不兼容、缺失/重复/未知/错值/错segment等边界已冻结。
- [x] EM11 Structural只包含forward/reverse标签缺失、完整性非法和bidirectional null tag。
- [x] EM12 endpoint kind排除并保持既有分类。
- [x] EM13 State owner排除并保持既有分类。
- [x] EM14 Fact不存在、只读、revision和重复ID等排除。
- [x] EM15 候选过期/不匹配排除并保持`DOMAIN_REJECTED`。
- [x] EM16 未列Structural标签/方向错误不得批量改码。
- [x] EM17 INVALID_ARGUMENT及其他稳定错误族保持不变。
- [x] EM18 新增映射必须先更新Golden/Replay并新开bugfix。
- [x] EM19 API/Runtime contract由`3 M`扩为exact `4 M`。
- [x] EM20 `LocalApiService.java`已加入Stage R allowlist。
- [x] EM21 API/Runtime四个路径逐项冻结。
- [x] EM22 Family Driver `4 M`保持不变。
- [x] EM23 本规格的14 M中间计数已由后继闭包取代为`23=21 M+2 A`。
- [x] EM24 经Stage A release discovery/source guard修正后，`O..A=25=15 M+10 A`。
- [x] EM25 `O..R`活动口径修正为`43=31 M+12 A`。
- [x] EM26 比较算法继续使用有序`status + TAB + path`。
- [x] EM27 禁止修改ApiErrorCode/Handler/Controller/generated contract/DDL/Profile/Golden。
- [x] EM28 Controller测试固定使用真实Service和临时SQLite。
- [x] EM29 Project/Model/Element/State/Fact必须通过HTTP建立。
- [x] EM30 candidate query/option必须来自真实API-EDT-001。
- [x] EM31 非法subject必须通过真实API-EDT-002发送一次。
- [x] EM32 raw body必须直接来自`getContentAsByteArray()`。
- [x] EM33 422、problem+json、UTF-8 JSON和完整ErrorEnvelope字段已冻结。
- [x] EM34 同一raw bytes必须通过活动OpenAPI Schema。
- [x] EM35 至少一个Control、一个Structural正例已冻结。
- [x] EM36 endpoint/owner及候选错误保持原码的真实负例已冻结。
- [x] EM37 禁止mock Service、直接调用Handler或人工构造错误Map。
- [x] EM38 Runner Source Set活动口径升级为`0.2/24`。
- [x] EM39 `LocalApiService.java`禁止加入Runner Source Set。
- [x] EM40 Runtime JAR必须从同一clean R重建。
- [x] EM41 Runtime JAR raw ref/length/SHA在Handoff/Manifest/Attempt/Report闭合。
- [x] EM42 相对A仅8个固定Source Set entry允许变化或新增，其余16项逐byte不变；全部24项raw ref与aggregate从R重算。
- [x] EM43 禁止复用O/A JAR或伪装Java source identity。
- [x] EM44 先失败测试、再19项最窄映射的顺序已冻结。
- [x] EM45 contract/MVC必须先于Family Driver与R commit。
- [x] EM46 Stage A controlled回归必须重跑。
- [x] EM47 20/41/24三类活动机器计数验收已冻结；14/35/23只保留历史来源。
- [x] EM48 后继验证命令已冻结。
- [x] EM49 局部测试不得提升194/388或release状态。
- [x] EM50 pre-R回滚边界已冻结。
- [x] EM51 post-R必须新建后继commit和版本根，禁止原地覆盖。
- [x] EM52 不得只回滚Service而继续消费旧Runtime JAR/Manifest。
- [x] EM53 本规格状态为`FROZEN_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_STARTED`。

## Implementation

- [ ] I01 新增真实Control命令路径失败测试。
- [ ] I02 新增真实Structural命令路径失败测试。
- [ ] I03 新增未列领域错误保持原码的回归测试。
- [ ] I04 仅实现15个Control映射。
- [ ] I05 仅实现4个Structural映射。
- [ ] I06 contract validate和LocalApiControllerTest通过。
- [ ] I07 Family Driver及Stage A controlled回归通过。
- [ ] I08 Stage R exact `23=21 M+2 A`通过。
- [ ] I09 `O..R=43=31 M+12 A`通过。
- [ ] I10 Runner Source Set `0.2/24`并重算通过。
- [ ] I11 Runtime JAR从clean R重建并完成raw identity join。
- [ ] I12 production `194/388`和Report按独立Gate执行。

## 当前状态

- 设计：`FROZEN_FOR_IMPLEMENTATION`。
- 实现：`NOT_STARTED`。
- Stage R：`NOT_CREATED`。
- production `194/388`：`NOT_RUN`。
- Report、Gate、Candidate、Activation、Capability、production、ISO：不提升。
