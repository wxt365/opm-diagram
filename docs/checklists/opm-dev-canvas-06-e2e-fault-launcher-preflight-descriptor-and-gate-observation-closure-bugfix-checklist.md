# Checklist: DEV-CANVAS-06 E2E Fault Launcher Preflight Descriptor 与 Gate 观测闭包修正

状态：`FROZEN/COMPLETE`

活动边界：契约语义不变；受控Manifest与evidence必须绑定final production source-chain的新Stage A，旧`586d6de...`不得作为活动base。

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 背景/复现/Root Cause | 1、2 | P01~P05 |
| 修正策略/版本/拓扑 | 3、4 | P06~P14 |
| Bundle/Descriptor 身份 | 5、6 | P15~P24 |
| JarIT/Environment/browser | 7 | P25~P32 |
| schedule/ports | 8、9 | P33~P42 |
| D10A/D10B | 10、11 | P43~P56 |
| 首错/实现包/原子事务 | 12、13 | P57~P68 |
| 验收/回滚/事实 | 14~16 | P69~P76 |
| 2A唯一CLI/Manifest D05/Preflight Report/evidence root/Invocation Context | 17 | P77~P102 |

## Checklist

- [x] P01 已复现 Bundle `0.1` 没有 preflight descriptor ref。
- [x] P02 已复现 Manifest `0.2` 为封闭对象且没有该 ref。
- [x] P03 已复现旧 D10 把 preflight 与 execution 时间域混合。
- [x] P04 已确认当前没有三类新机器 Schema。
- [x] P05 Root Cause 已收敛为输入 owner 与执行观测 owner 未拆分。
- [x] P06 Manifest `0.2/0.2.0` byte shape 保持不变。
- [x] P07 Bundle `0.1` 固定为历史兼容。
- [x] P08 Fault Launcher 唯一消费 Bundle `0.2`。
- [x] P09 Descriptor/JarIT/Gate Observation 身份和 Schema 路径已冻结。
- [x] P10 Bundle -> Descriptor 引用方向已冻结。
- [x] P11 Descriptor 禁止引用 final Manifest，避免构建环。
- [x] P12 actual Manifest 由 D05 与 descriptor semantic join。
- [x] P13 production Manifest 禁止接受 Fault Launcher descriptor。
- [x] P14 不允许 Bundle `0.2` 回退为 `0.1`。
- [x] P15 Bundle `0.2` 第十个必填字段已冻结。
- [x] P16 descriptor ref 的 kind/path/root/link 规则已冻结。
- [x] P17 Bundle `0.2` identity JCS 公式已冻结。
- [x] P18 `approved_version_ref=null` 保持不变。
- [x] P19 Descriptor 顶层 13 字段封闭。
- [x] P20 generated_at 固定 UTC 整秒往返。
- [x] P21 Descriptor payload SHA 删除字段集合已冻结。
- [x] P22 descriptor ID 与 payload SHA 前 12 位绑定。
- [x] P23 禁止 raw SHA/bundle SHA/Manifest SHA 替代 payload SHA。
- [x] P24 Descriptor transitive refs 必须先验证后计算 identity。
- [x] P25 JarIT Report `0.1`、固定Maven命令和Surefire XML raw ref已冻结。
- [x] P26 JarIT 成功计数固定为 `6/6/0/0`。
- [x] P27 六个测试方法 ID、XML复算和顺序已冻结，禁止手写PASS。
- [x] P28 JarIT Report payload SHA 公式已冻结。
- [x] P29 Descriptor/JarIT/Manifest Runtime JAR 三方 join 已冻结。
- [x] P30 Golden Environment 必须为活动 `0.2`。
- [x] P31 Playwright/Chromium/color profile 固定值已冻结。
- [x] P32 browser CLI/descriptor/Environment 三方 raw identity 已冻结且禁止 fallback。
- [x] P33 三个 fault case 顺序已冻结。
- [x] P34 每个 case 的两次 attempt 顺序已冻结。
- [x] P35 每个 attempt 固定 `INITIAL -> REOPEN`。
- [x] P36 总计固定 `6 attempts/12 process cycles`。
- [x] P37 attempt ordinal 只能来自已验证 Plan 并与 schedule 交叉验证。
- [x] P38 六个 allocation ID 与 schedule 一一对应。
- [x] P39 12 个 loopback 端口必须全局互异。
- [x] P40 同 attempt 两个 cycle 只允许串行复用端口。
- [x] P41 preflight 和每个 cycle 前的端口复核已冻结。
- [x] P42 端口占用时禁止换号，必须重建 descriptor 和 bundle identity。
- [x] P43 Gate snapshot 复用 `DISABLED + [] + NOT_ACTIVE` value 形状。
- [x] P44 live fixed Handoff、activation root realpath与activation input set证据已冻结。
- [x] P45 空 activation set SHA 固定为 `4f53cda1...b945`。
- [x] P46 snapshot payload SHA 公式已冻结。
- [x] P47 Gate observation算法固定为单一只读契约：Node父owner执行D10A；controlled spec只调用Runner lifecycle接口，D10B采样与writer唯一归该接口；不增加第三个helper或第二条IPC。
- [x] P48 observer 禁止新增公共 API 或修改 production wire。
- [x] P49 旧 `FLCP-D10-GATE` 已废止。
- [x] P50 preflight 第十项固定为 `FLCP-D10A-GATE-PREFLIGHT`。
- [x] P51 dependency result 仍恰 10 项。
- [x] P52 D10B 明确不属于 preflight dependency。
- [x] P53 成功分支BEFORE/DURING/AFTER计数固定为`1/12/1`；DURING只能在spec-owned Page已attach、同Page网络观测闭合、Browser/Context/Page以相同对象临时confirm，Runner保持sentinel到handler settle并完成零迟到事件、sink关闭、全部sentinel移除和最终proof，随后回收Runtime/Web及释放端口后采样；Browser proof失败固定事务失败且不得采样当前DURING，业务提前失败只允许真实有序前缀并仍取得AFTER。
- [x] P54 Gate Observation Artifact `0.1` 字段和摘要已冻结。
- [x] P55 成功必须 `14` 项一致且 mutation count 为 `0`。
- [x] P56 Gate 漂移稳定错误、立即停机和首错保留规则已冻结。
- [x] P57 preflight 唯一检查顺序已冻结。
- [x] P58 参数错误 exit `2` 与依赖阻断 exit `3` 已分离。
- [x] P59 BLOCKED 零执行/零输出副作用保持不变。
- [x] P60 READY 不得预写 D10B 或宣称 PASS。
- [x] P61 历史Schema conformance `2 M`已形成`586d6de.../HISTORICAL_READY_NOT_CONSUMABLE`；活动C/S/A仍未创建。
- [x] P62 `0dcaa27...`只保留为历史36 raw refs来源；活动origin已改为`9048bb3...`。
- [x] P63 活动A必须以新S为唯一parent并提交`4=2 M+2 A`；`586d6de...`不得消费。
- [x] P64 后继 allowlist 固定为 `12=4 M+8 A`。
- [x] P65 12 个路径逐字符冻结。
- [x] P66 活动 Manifest/Report/Source Set/Fault Plan/36 baseline 均禁止修改。
- [x] P67 Producer staging、fsync、atomic install 和 installed verify 顺序已冻结。
- [x] P68 Gate Observation 不得由 input producer 预生成。
- [x] P69 正例覆盖 Bundle/descriptor/transitive join、D10A 和 14 项 D10B。
- [x] P70 反例覆盖版本错配、SHA 漂移、JarIT 不完整、schedule/port/Gate 漂移。
- [x] P71 production Manifest 消费 Fault Launcher input 被定义为反例。
- [x] P72 回滚不得恢复旧 D10 或直接从 `0dcaa27...` 实施 2A。
- [x] P73 本设计未创建 Schema、producer/verifier、2A 或 release 资产。
- [x] P74 Gate/Candidate/Activation/Capability/ISO 状态未提升。
- [x] P75 事实与待实现已分栏。
- [x] P76 Spec Mapping 覆盖目标、范围、非目标、约束、验收、验证和回滚。
- [x] P77 2A唯一业务CLI冻结为`--run-controlled`，不再拆分preflight和execution命令。
- [x] P78 `node --test`仅用于定向测试，不接受业务输入。
- [x] P79 旧`--preflight/--mode=preflight`及candidate/Runtime/Web/browser override固定拒绝。
- [x] P80 actual Manifest唯一定位冻结为`--manifest-root`加固定basename token。
- [x] P81 Manifest raw/JCS形状和活动v02 controlled verifier固定先于D05字段级join。
- [x] P82 D05三个Manifest case的suite/expectation/viewport/zoom/driver/transaction/assertion和raw refs已冻结。
- [x] P83 attempt ordinal、process cycle、port明确只来自Descriptor并与Manifest case交叉验证。
- [x] P84 Runtime按跨root raw identity比较，禁止错误要求path逐字符相等；Web只由Manifest verifier闭合。
- [x] P85 Preflight Report `0.1`在真实产物前废止，活动版本冻结为`0.2`。
- [x] P86 report固定记录origin/contract/candidate三段commit身份及可空Manifest/Descriptor refs。
- [x] P87 D01活动链为`O -> C -> S -> A`；`implementation_delta`固定四项`M/M/A/A`，Report字段和版本不增加。
- [x] P88 controlled run ID固定使用Manifest与Descriptor raw SHA前12位。
- [x] P89 evidence staging/final路径和恰好两个最终JSON文件已冻结。
- [x] P90 preflight report必须原字节镜像，禁止重新序列化。
- [x] P91 Gate Observation PASS与FAILED条件分支、真实DURING前缀和首错规则已冻结。
- [x] P92 fixed temp、file fsync、no-replace rename、directory fsync顺序已冻结。
- [x] P93 staging verifier、postorder fsync、root rename、parent fsync、installed verifier顺序已冻结。
- [x] P94 exit `0/1/2/3/4`及事务失败稳定stderr已冻结。
- [x] P95 事务失败final不存在、staging保留不可消费；post-install失败final保留但禁止消费。
- [x] P96 2A仍只允许两个新增文件，Gate artifact writer/verifier不得扩为第三个source owner。
- [x] P97 Playwright跨进程输入固定为process-control root内的封闭Invocation Context，不允许依赖父进程内存或环境变量集合。
- [x] P98 Context字段、12项execution schedule、payload SHA、raw ref环境值和child复核规则已冻结。
- [x] P99 Context固定按tmp/file fsync/raw复核/no-replace rename/parent fsync写入，失败为`EVIDENCE_TRANSACTION/4`且零Playwright启动。
- [x] P100 child环境只允许`OPM_CANVAS06_FAULT_CONTROL_CONTEXT_REF`一个前缀键，所有业务输入均从已验证Context取得；D10B sampler与Gate Artifact writer唯一归Runner lifecycle接口，spec/父进程不得直写。
- [x] P101 2A spec固定命名为`fault-launcher.controlled.release.spec.ts`，与既有`**/*.release.spec.ts` testMatch闭合且不修改只读配置。
- [x] P102 lifecycle接口实现与Runner测试完成前，只允许继续D01~D10A验证，禁止A commit与D10B。

## 当前门状态

- 设计修正：`COMPLETE`。
- Preflight Contract候选：`63851f8878dcf6da86e99d5ffa7795ac48200920/REJECTED_AS_2A_CONTRACT_BASE/SCHEMA_CONFORMANCE_DEFECT`。
- 历史Contract Base Schema修正：`586d6dee1b07c6634267aeb344e8826adb1ddb4b/HISTORICAL_READY_NOT_CONSUMABLE`。
- 活动D01父链：由Final Production Source Chain固定为`9048bb3... -> C -> S -> A`。
- Fault Launcher 2A：`BLOCKED_BY_FINAL_PRODUCTION_SOURCE_CHAIN_IMPLEMENTATION`。
- Controlled Playwright：`NOT_RUN`。
- `GATE-06-03`：`BLOCKED/NOT_RUN`。
