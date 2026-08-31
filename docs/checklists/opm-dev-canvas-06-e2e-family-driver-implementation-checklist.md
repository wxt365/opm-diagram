# Checklist: DEV-CANVAS-06 E2E Family Driver Implementation

状态：`FROZEN_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_STARTED`

## Task Type

- [x] `feature`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标与设计输入 | 1~2 | FD01~FD05 |
| 非目标与兼容性 | 2.1 | FD06~FD08、FD41~FD42、FD47~FD48、FD56 |
| 修改范围与约束 | 3 | FD43~FD49、FD55~FD60 |
| 导出、集合、实现顺序 | 4~5 | FD06~FD24 |
| UI/API/事务/重开/证据 | 6.1~6.3 | FD25~FD42、FD53~FD54 |
| Source chain与验收 | 6.4 | FD43~FD50、I00~I12 |
| 验证方式 | 7 | FD50、I00~I12 |
| 回滚与状态 | 8 | FD51~FD52、当前状态 |

## Design Closure

- [x] FD01 三个Family Driver及178项范围已冻结。
- [x] FD02 分布固定为PROC 33、CTRL 35、STRUCT 110。
- [x] FD03 期望固定为130 PASS、48 BLOCKED。
- [x] FD04 五方exact join与Family identity/fixture raw ref闭包已冻结。
- [x] FD05 companion PASS选择算法唯一。
- [x] FD06 三module各恰导出`driver/case_ids/executeCase`。
- [x] FD07 executeCase五参数、undefined返回与禁止缓存边界已冻结。
- [x] FD08 六方法sink与Browser proof继续由Stage A唯一拥有。
- [x] FD09 materialized base、subject baseline、subject result三种Revision已区分。
- [x] FD10 PROC/STRUCT无写入SETUP，CTRL基础Fact SETUP边界已冻结。
- [x] FD11 subject before snapshot必须在SETUP稳定后采集。
- [x] FD12 SETUP事务不计入subject事务。
- [x] FD13 现有`p03-*`和X6`data-cell-id`selector集合已冻结。
- [x] FD14 Fact exact/effect input/structural root选择优先级已冻结。
- [x] FD15 PROC PASS=`UI_CREATE_FACT`。
- [x] FD16 CTRL PASS=`UI_UPDATE_CONTROL`。
- [x] FD17 STRUCT PASS=`UI_CREATE_FACT`。
- [x] FD18 PROC/STRUCT BLOCKED=`API_NEGATIVE_CREATE_FACT`。
- [x] FD19 CTRL普通BLOCKED=`API_NEGATIVE_UPDATE_FACT`。
- [x] FD20 独立Control Fact BLOCKED=`API_NEGATIVE_CREATE_FACT`。
- [x] FD21 130 PASS必须真实UI触发。
- [x] FD22 48 BLOCKED必须先建立真实候选再单次正式API负例。
- [x] FD23 禁止用无候选、disabled或本地提示代替错误证据。
- [x] FD24 API-PRJ/CTX/EDT/TXT operation与等待条件已冻结。
- [x] FD25 PROC三类Replay error及数量已冻结。
- [x] FD26 CTRL `15 MODIFIER_COMBINATION_INVALID`已冻结。
- [x] FD27 STRUCT三类Replay error及数量已冻结。
- [x] FD28 HTTP、top error与detail error映射已冻结。
- [x] FD29 PASS transaction精确七项delta与Head变化已冻结。
- [x] FD30 BLOCKED transaction全零与Head不变已冻结。
- [x] FD31 CTRL BLOCKED reopen绑定subject baseline而非materialized base。
- [x] FD32 PASS四摘要after/reopen相等已冻结。
- [x] FD33 BLOCKED四摘要before/after/reopen相等已冻结。
- [x] FD34 11类Attempt root继续复用活动Schema 0.2。
- [x] FD35 SETUP/候选/subject raw API exchange必须完整采集。
- [x] FD36 assertion refs最小证据集合已冻结。
- [x] FD37 screenshot仅允许失败诊断，不能替代机器断言。
- [x] FD38 两次semantic comparison digest一致边界已冻结。
- [x] FD39 稳定等待禁止固定sleep和networkidle单项。
- [x] FD40 首错顺序与EVIDENCE_TRANSACTION升级边界已冻结。
- [x] FD41 Driver子切片不新增Schema、lifecycle或artifact owner；Context/Source Set Schema与bridge由独立Controlled Invocation闭包承接。
- [x] FD42 设计冻结不提升Report/Gate/production/ISO状态。
- [x] FD43 后继实现分为API/Runtime contract `5 M`、source guard `2 M`与Family Driver `4 M`，allowlist均已逐路径冻结。
- [x] FD44 三个Driver进入Stage R，Runner test承接定向验收。
- [x] FD45 后继Service/source guard闭包后Final Stage R固定为`23=21 M+2 A`。
- [x] FD46 O..R固定为`43=31 M+12 A`，O..A为25。
- [x] FD47 Runner Source Set升级为0.2/24并从R重算raw aggregate。
- [x] FD48 除API/Runtime contract固定OpenAPI、Node contract test、`LocalApiService.java`与Java MVC test四路径外，Vue、其他Java/OpenAPI、SQLite、Profile和Common Driver保持只读。
- [x] FD49 API/Runtime contract四路径或Family Driver四路径不足时必须新开bugfix，不得静默扩围。
- [x] FD50 验证命令与194/388前置已冻结。
- [x] FD51 回滚边界已冻结。
- [x] FD52 本轮只完成设计，不实现三个Driver。
- [x] FD53 `MODIFIER_COMBINATION_INVALID`唯一目标wire冻结为HTTP 422/top code同名/detail null/category DOMAIN。
- [x] FD54 已查证Runtime/Golden Replay与OpenAPI `ErrorDetail.code`枚举不同步，禁止Driver改写为`DOMAIN_REJECTED`或解析message。
- [x] FD55 ErrorDetail与Runtime映射已冻结为Stage R内的exact `4 M`前置子切片，本设计任务不修改API、Java、Node或source commit。
- [x] FD56 `MODIFIER_COMBINATION_INVALID`封闭集合为`19=15 CTRL+4 STRUCT`。
- [x] FD57 endpoint/owner/Fact不存在/候选过期等未列领域错误保持原码。
- [x] FD58 MVC必须使用真实Service、SQLite、候选和command raw body，禁止直接抛异常或mock最终JSON。
- [x] FD59 `LocalApiService.java`不加入Runner Source Set，只通过R重建Runtime JAR闭合。
- [x] FD60 回滚必须同步Runtime JAR与版本根，禁止Service/JAR identity分离。
- [x] FD61 Runner按driver_id加载exact Driver并构造完整FamilyCaseExecution。
- [x] FD62 Page attach后五参数call_context与precondition client引用相等已冻结。
- [x] FD63 production bridge、INITIAL单次Driver调用和REOPEN零Driver调用已冻结。
- [x] FD64 Family Driver设计升级为`v1.4`，Runner-owned RUN_SETUP必须先形成深冻结`SetupBoundAttemptIdentity`再调用Driver。
- [x] FD65 CTRL `setup_fact_id`唯一取自正式CREATE_FACT response `affected_ids`与SETUP前后Revision Fact差集的唯一交集，禁止首项、DOM、fixture、path、SHA或SQLite顺序推断。
- [x] FD66 `setup_fact_id/subject_baseline_revision/setup_create_fact_exchange_ref`与raw response、API Exchange唯一entry、post-SETUP snapshot及subject request逐字段闭合；PROC/STRUCT固定显式null/base形状。
- [x] FD67 SETUP业务identity失败与raw evidence失败分别固定为`E2E_FAMILY_SETUP_IDENTITY_INVALID`和`E2E_FAMILY_SETUP_EVIDENCE_INVALID -> EVIDENCE_TRANSACTION/4`。

## Implementation

- [ ] I00 Stage R API/Runtime contract `5 M`及source guard `2 M`子切片完成并有19项边界、Schema/raw-body与23/43正反证据。
- [ ] I01 为占位Driver补失败测试。
- [ ] I02 实现三个module封闭exports和case membership。
- [ ] I03 实现PROC 16 PASS/17 BLOCKED。
- [ ] I04 实现Runner-owned CTRL SETUP identity binder，并让Control Driver只消费最终深冻结identity完成20 PASS/15 BLOCKED。
- [ ] I05 实现STRUCT 94 PASS/16 BLOCKED。
- [ ] I06 178项五方exact join正反例通过。
- [ ] I07 UI/API、selector、error映射正反例通过。
- [ ] I08 transaction/reopen/evidence及SETUP response/diff/identity/API Exchange逐字段绑定正反例通过。
- [ ] I09 Stage A controlled回归通过。
- [ ] I10 Stage R 23项与O..R 43项source校验通过。
- [ ] I11 Runner Source Set 24项raw aggregate重算通过。
- [ ] I12 完整R production输入、Manifest、194/388和Report按独立Gate执行。

## 当前状态

- Family Driver设计：`FROZEN_FOR_IMPLEMENTATION`。
- 三个Driver实现：`PLACEHOLDER/NOT_IMPLEMENTED`。
- Stage R：`NOT_CREATED`。
- production `194/388`：`NOT_RUN`。
- E2E Report、Gate、Candidate、Activation、Capability、production、ISO：不提升。
