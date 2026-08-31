# Checklist: DEV-CANVAS-06 Family Controlled Invocation Closure Bugfix

状态：`DESIGN_FROZEN / IMPLEMENTATION_NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现、Root Cause | 1~2 | CI01~CI06 |
| Fix Strategy与修改边界 | 3~4 | CI07~CI12 |
| Context与跨进程协议 | 5~6 | CI13~CI27A |
| Driver/CaseExecution/client/bridge | 7~9 | CI28~CI49、CI33A、CI44A |
| 调度、Source Set、计数 | 10~12 | CI50~CI61 |
| 验收、回滚与状态 | 13~14 | CI62~CI68、I01~I12 |

## Design Closure

- [x] CI01 Fault Context只覆盖3/6/12，不能承载production 194/388。
- [x] CI02 Driver dispatch、CaseExecution producer、client和bridge owner缺口已复现。
- [x] CI03 未计入Source Set的spec不能拥有production browser语义。
- [x] CI04 Root Cause与为何此前未发现已记录。
- [x] CI05 本轮只补设计，不实现代码或Schema。
- [x] CI06 Gate/production/ISO状态不提升。
- [x] CI07 Context Schema、producer/verifier、bridge和Source Set方案唯一。
- [x] CI08 Context producer/verifier收敛到既有Runner owner。
- [x] CI09 禁止新增helper或第二production spec。
- [x] CI10 Stage R新增六路径已冻结：Context Schema、Source Set Schema、stage owner/test、Schema test和production bridge。
- [x] CI11 Report/Manifest/Attempt版本保持不变。
- [x] CI12 Source Set升级是唯一活动不兼容输入变化。
- [x] CI13 Context Schema identity固定为0.1。
- [x] CI14 Context字段与additionalProperties=false已冻结。
- [x] CI15 input trust两模式与primary ref已冻结。
- [x] CI16 Manifest/Profile/JAR/Web/Driver/Source Set exact refs已冻结。
- [x] CI17 新`--process-control-parent`、隔离与禁止fallback已冻结。
- [x] CI18 Context ID、tmp/final路径与JCS+LF已冻结。
- [x] CI19 payload摘要、fsync、可移植hard-link no-replace原子发布、single-link复核和失败码已冻结。
- [x] CI20 Context不进入Report root且不得覆盖、删除或复用。
- [x] CI21 execution_schedule恰388项且字段封闭。
- [x] CI22 Manifest原序、每case attempt 1后2的展开唯一。
- [x] CI23 ordinal/case_ordinal/attempt root公式已冻结。
- [x] CI24 runtime/web端口严格串行复用前必须释放。
- [x] CI25 禁止分片、并发、retry、skip、resume。
- [x] CI26 child唯一环境ref与清理前缀已冻结。
- [x] CI27 Playwright固定token数组和零第二IPC已冻结。
- [x] CI27A bridge只从已固定cwd构造Source Set第1项exact file URL并执行import-safe bootstrap；导入后的首个loader调用在任何执行副作用前闭合source/mirror/Source Set三方bytes。
- [x] CI28 四driver_id到exact module映射已冻结。
- [x] CI29 Manifest/Source Set/import bytes三方join已冻结。
- [x] CI30 module exports、case_ids、session单次加载边界已冻结；活动导出形状由后继Common Driver Export与Loader闭包修正规格修正为Family三导出、Common四导出。
- [x] CI31 FamilyCaseExecution完整字段与Runner owner已冻结。
- [x] CI32 CommonCaseExecution由Runner构造，bridge/Driver不得读Catalog。
- [x] CI33 Page attach后五参数call_context形状已冻结。
- [x] CI33A child内Runner API、cycle handler及一次性`resolve_invocation(page)`已冻结，禁止父进程序列化Page。
- [x] CI33B resolver必须先执行Runner-owned identity-bearing RUN_SETUP，再返回含最终深冻结`SetupBoundAttemptIdentity`的call_context；旧identity不得暴露给Driver。
- [x] CI34 Page以外plain data深冻结与引用相等规则已冻结。
- [x] CI35 bridge只可调用execute_case一次且要求undefined。
- [x] CI36 client状态机READY/IN_FLIGHT/CONSUMED/CLOSED已冻结。
- [x] CI37 每attempt至多一次、REOPEN零调用和跨attempt拒绝已冻结。
- [x] CI38 request必须逐字段等于冻结case定义。
- [x] CI39 client只走attached Page同源fetch，禁止Node/APIRequestContext旁路。
- [x] CI40 raw/actual/response比较与receipt形状已冻结。
- [x] CI41 API Exchange复用Attempt Artifact 0.2且恰record一次。
- [x] CI41A CTRL `setup_fact_id`由CREATE_FACT response `affected_ids`与SETUP前后Revision Fact差集求唯一交集，response ref、baseline、exchange和subject request逐字段绑定；PROC/STRUCT/Common固定null/base形状。
- [x] CI41B SETUP executor使用attached Page同源正式API和同一raw evidence owner，但与一次性`precondition_client`隔离且不消耗其额度。
- [x] CI42 precondition业务失败与证据事务失败边界已冻结。
- [x] CI43 唯一production bridge路径已冻结。
- [x] CI44 INITIAL中Driver恰调用一次，REOPEN只做Runner observation。
- [x] CI44A INITIAL固定attach后resolve一次；REOPEN的resolver为null且零Driver调用。
- [x] CI45 bridge只拥有Browser树、attach、调用和close/confirm。
- [x] CI46 Runner拥有其余lifecycle、CaseExecution、artifact和Report职责。
- [x] CI47 Browser proof继续复用Stage A三状态机。
- [x] CI48 bridge不得使用默认Browser、复用Browser或写Artifact。
- [x] CI49 Browser/cleanup不闭合升级EVIDENCE_TRANSACTION/4。
- [x] CI50 388 attempt严格串行和失败边界已冻结。
- [x] CI51 业务FAILED继续，证据失败停止且final Report不存在。
- [x] CI52 两attempt均真实执行，禁止复制artifact/digest。
- [x] CI53 Source Set升级为0.2/0.2.0/24。
- [x] CI54 新bridge固定为entry 20，四Driver顺延21~24。
- [x] CI55 未显式列入的test/spec继续排除，entry 20不得被排除。
- [x] CI56 Source Set aggregate公式不变。
- [x] CI57 相对A固定8 changed/new与16 unchanged；stage owner是第5项活动entry。
- [x] CI58 Report 0.2继续使用24项aggregate。
- [x] CI59 Stage R由后继API Exchange/Artifact Index、Family Case ID/Archive Ref及Common Precondition Machine Contract闭包最终固定`33=31 M+2 A`。
- [x] CI60 O..R固定`52=40 M+12 A`；O..A保持`25=15 M+10 A`。
- [x] CI61 exact status/path比较与禁止只比计数已冻结。
- [x] CI62 Context、dispatch、client、bridge正反验收矩阵已冻结。
- [x] CI63 Source Set、Stage R和source-chain验收已冻结。
- [x] CI64 文档验证命令已冻结。
- [x] CI65 本轮不执行Playwright或194/388。
- [x] CI66 回滚必须整体恢复旧口径。
- [x] CI67 当前实现状态保持NOT_STARTED/NOT_RUN。
- [x] CI68 不形成Report/Gate/Candidate/Activation/Capability/production/ISO证明。
- [x] CI69 identity/ref/Revision差异的业务失败、证据事务失败和Driver invocation失败边界已冻结。

## Implementation Acceptance

- [ ] I01 新Context Schema、注册和正反例完成。
- [ ] I02 Runner Context producer/verifier及原子事务完成。
- [ ] I03 388项schedule正反例完成。
- [ ] I04 四Driver exact dispatch、CaseExecution builder及Runner-owned RUN_SETUP identity binder完成。
- [ ] I05 import-safe Runner child API、五参数调用对象与引用守卫完成。
- [ ] I06 一次性同源precondition client、独立SETUP executor与API Exchange逐字段证据完成。
- [ ] I07 production Playwright bridge及Browser proof完成。
- [ ] I08 Source Set 0.2/24及Report join完成。
- [ ] I09 Stage A controlled回归通过。
- [ ] I10 Stage R 32项与O..R 51项source校验通过。
- [ ] I11 controlled完整194/388正反例通过。
- [ ] I12 fresh R production输入、Manifest、真实194/388与Report按独立Gate执行。

## 当前状态

- 设计：`FROZEN`。
- Context/bridge/Runner/Driver：`NOT_IMPLEMENTED`。
- Stage R：`NOT_CREATED`。
- production `194/388`：`NOT_RUN`。
- Report、Gate、Candidate、Activation、Capability、production、ISO：不提升。
