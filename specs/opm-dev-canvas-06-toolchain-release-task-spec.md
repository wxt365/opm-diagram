# Spec: OPM DEV-CANVAS-06 工具链集成与发布验收

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 背景

`DEV-CANVAS-05` 交付可执行的 16/8/10 OPL、Token/Trace、golden 与同版本依赖闭包。本包不再新增语义，而是把已验证 Capability 接入完整工具链，完成浏览器视觉、E2E、性能、恢复和分批启用证据，形成完整画布发布候选。

## 2. 目标与范围

1. 完成固定工具链、State 快捷工具、关系 split-button、搜索分组目录、候选层和完整检查器；
2. 按 Capability evidence gate 分批启用 16/8/10，禁用项显示稳定 reason；
3. 覆盖 committed、blocked、conflict、readonly、asset-missing、persistence-failed 和重开恢复路径；
4. 完成三视口、三缩放比例 visual golden、canvas pixel 非空和遮挡检查；
5. 在固定 release 环境执行普通操作、增量 OPL、大图交互和 10,000 结点模型任务的性能验收；
6. 输出包含版本、digests、数据集、环境、命令、样本、P50/P95/Max、失败率和残余风险的发布证据报告。

## 3. 非目标

- 不新增 Capability、Endpoint Schema、OPL 句式、Rule 语义、Token/Trace 口径或 golden variant；
- 不修改 Template 迁就 UI，也不在本包补写 `DEV-CANVAS-05` 缺失资产；
- 不修改 SQLite schema 或公共 operationId；
- 不以工具菜单完整、E2E 绿色或性能通过替代 ISO 19450:2024 符合性证据。

发现语义/资产缺口时退回 `DEV-CANVAS-05` 或更早依赖包，本包只保持对应 Capability disabled。

## 4. 修改边界

允许修改：

- `apps/web/**` 的 P03 工具链、X6 Projection、状态、样式、组件测试和可访问性；
- `services/local-runtime/**` 的只读 Projection/性能观测、发布守卫和必要测试，不得改变领域语义；
- `tests/e2e/**`、`tests/performance/**`、`tests/recovery/**` 的 fixture/factory、visual golden、canvas pixel、故障注入与运行脚本；
- `packages/**` 的 enablement manifest，只允许引用 `DEV-CANVAS-05` 已通过的 exact digests；
- 发布/验收报告、本规格、checklist 和必要设计同步。

禁止修改：

- concrete OPL/Trace/Rule 语义、Capability/Endpoint Schema、SQLite migration；
- P01/P02 无关页面和 `.harness/**`；
- 为通过性能测试而省略 OPM marker、标签、State、fan 分支或 Finding。

### 4.1 `DEV-CANVAS-05` Handoff 输入门槛

本包启动时必须冻结 `handoff_ref={path,sha256}`，目标文件通过 `OPM-DEV-CANVAS-05-HANDOFF-001/0.1` Schema 且 `handoff_status=READY_FOR_DEV_CANVAS_06`。Handoff 必须同时证明：`GATE-05-01~06` 报告引用和原始 SHA 完整、Revision Compatibility `13/13` matched、semantic `178/130/48`、Atomic `19/19`、Structural `24/24`、Control `20/20`、`34/34` Capability 为 `ELIGIBLE_FOR_RELEASE_VALIDATION`，并且上游 production gate 仍为 `DISABLED`。

DEV-CANVAS-06 只能按 Handoff 中的 exact build、Schema、Profile package、五项 binding、coverage catalog、Golden/Replay/Trace/Atomic/Compatibility report 和 Capability evidence 工作。不得重新解释上游 checklist、跳过失败 report、用新路径替换同名资产或把 eligibility 直接当作 enabled。任一 ref/length/digest/status 不一致时，本包保持全部新增 Capability disabled，并回流对应 `GATE-05-*`；不得在本包补写或修补上游证据。

DEV-CANVAS-06 的 enablement manifest 是独立下游资产，只能选择 Handoff 中 eligible 且通过本包视觉/E2E/性能/恢复的 Capability；它必须继续引用原 `handoff_ref.sha256`，不能改变 Handoff 或 Profile binding。

### 4.2 Gate 与机器资产

Gate 编号表示职责，不表示一次性线性执行顺序。执行依赖固定为：`GATE-06-01 -> GATE-06-03/04/05 -> GATE-06-02 Candidate -> GATE-06-06 -> GATE-06-02 Activation`；`GATE-06-02` 的 Schema/算法必须在下游报告生成前实现，但 Candidate 只能在报告齐备后生成。Checklist 勾选、人工结论或报告摘要不能替代原始文件和 SHA：

| Gate | 职责 | 机器输出 |
| --- | --- | --- |
| `GATE-06-01 Handoff Intake` | 验证 Handoff 原始 bytes、Schema、上游 Gate、覆盖、兼容、34 项 eligibility 和禁用生产门 | `OPM-DEV-CANVAS-06-INTAKE-REPORT-001/0.1` |
| `GATE-06-02 Enablement Manifest` | 冻结三批次、逐 Capability 依赖/证据闭包、候选启用和不可变状态迁移 | `OPM-DEV-CANVAS-06-ENABLEMENT-001/0.1` |
| `GATE-06-03 Visual/E2E Closure` | 生成固定视觉矩阵、canvas pixel、遮挡和 `E2E-CANVAS-001~007` 机器报告 | Visual Manifest `0.2`、Visual Report `0.1`、E2E Manifest `0.2`、E2E Report `0.2` |
| `GATE-06-04 Performance Closure` | 生成环境、fixture、原始样本、统计量、阈值和失败分类报告 | `OPM-DEV-CANVAS-06-PERFORMANCE-MANIFEST/SAMPLES/REPORT-001/0.1` |
| `GATE-06-05 Recovery/Rollback` | 证明故障零增量、重开恢复、整体/逐 Capability 只读回退 | `OPM-DEV-CANVAS-06-RECOVERY-MANIFEST/GATE-FIXTURE/REPORT-001/0.1` |
| `GATE-06-06 Release Candidate Evidence` | 汇总 Intake、Visual/E2E、Performance、Recovery、clean smoke、Candidate manifest 和发布边界 | `OPM-DEV-CANVAS-06-RELEASE-CANDIDATE-MANIFEST/REPORT-001/0.1` |

机器 Schema 固定放在 `docs/contracts/schemas/`；本包生成证据固定放在 `<evidence_output_root>/dev-canvas-06/`，本包内部文件引用相对该 root。上游文件继续相对只读 `<handoff_bundle_root>` 解析并保留 Handoff 原始 ref，不复制到本包 root。两类引用都使用 `path + byte_length + sha256`，生成证据不进入 Profile required manifest、Profile package digest 或五 role binding digest。

`GATE-06-01~06` 的设计冻结使用 `feature + design-module-docs (primary) + testing`，只补规格、checklist 和必要测试策略，不授权创建上述 Schema/runner/report、执行发布验证或启用 Capability。每个 Gate 的字段、状态、算法和退出条件以 DEV-CANVAS-06 checklist 对应“冻结执行契约”为唯一实施口径。

### 4.3 Enablement 状态边界

1. Candidate manifest 只允许 `BLOCKED/READY_FOR_ACTIVATION`，其 `production_gate.state` 必须为 `DISABLED` 且 `enabled_capability_ids=[]`；它只声明通过证据闭包的 `proposed_enabled_capability_ids`。
2. Activation manifest 只允许 `ACTIVE_PARTIAL/ACTIVE_COMPLETE`；Rollback manifest 只允许 `ROLLED_BACK_PARTIAL/ROLLED_BACK`。激活必须引用 exact Candidate manifest 和 `GATE-06-06` READY Report；`ACTIVE_PARTIAL` 为 `1~33` 项，`ACTIVE_COMPLETE` 必须为 `34/34`。
3. 三批次固定为 Procedural `16`、Control `8`、Structural `10`。Control 激活依赖其 coverage keys 涉及的基础 Procedural Capability 已在同一或前序 Activation 中启用；Structural 不从 UI 推导额外语义依赖。
4. Candidate、Activation 和 Rollback 均生成新文件并以 SHA 串联，禁止原地修改。Rollback 只允许从前序 enabled 集合单调删除；Procedural 回退必须级联其依赖 Control，不能借 Rollback 恢复或新增 Capability。
5. `ROLLED_BACK_PARTIAL` 保留非空 enabled 子集，`ROLLED_BACK` 关闭全部 gate；两者都不删除或重写 Model、Revision、Text、Trace、Finding 和历史 manifest。运行时不得加载 `BLOCKED/READY_FOR_ACTIVATION/ROLLED_BACK` 为 enabled；eligibility、release-validation PASS 和 production enabled 是三个不同状态。

### 4.4 Visual/E2E Closure 边界

1. Visual 固定为 `378` 个 case：34 个 Capability × 3 视口 × 3 缩放=`306`，8 个公共视觉主题 × 3 视口 × 3 缩放=`72`。每个 Capability case 内按 exact Symbol Descriptor 展开全部 visual variant capture，不能用一个 marker 代表整个 Capability。
2. E2E 固定为 `194` 个 case：从 Intake/Handoff coverage keys 派生 `178=130 PASS+48 BLOCKED` 个家族 case，再加 State、候选归一化、删除影响、故障/只读共 `16` 个公共 case。
3. Visual `378` 和 E2E `194` 每项都执行两次独立 attempt，分别形成 `756` 和 `388` 条 attempt evidence；禁止 retry、skip、only、失败后更新 golden 或只保留最终绿色结果。
4. Gate 必须继承 Intake 的 exact upstream build/artifacts、Profile binding 和 Revision/fixture digest，并在同一个 clean DEV-CANVAS-06 target release build 与 Chromium patch 上生成 Visual/E2E 报告；upstream build 与 target build 不得混为同一身份。现有 dev server E2E、组件截图或人工浏览不计为 Gate PASS。
5. Visual 使用固定 PNG 像素算法、非空对照、关键几何/遮挡/溢出断言；E2E 同时断言 Revision、Projection、OPL/Trace、事务增量和重开结果。具体 case ID、阈值、失败码和 READY 算法以 checklist `GATE-06-03` 契约为准；11类attempt JSON的字段、file/schema identity、Family Project/ordinal来源、digest、join、Report投影和verifier顺序只以`docs/design/opm-dev-canvas-06-e2e-attempt-artifact-design.md v1.3`、Family Fixture Identity Catalog `0.1/0.1.0`及其Schema为准。
6. 当前 exact Symbol Catalog 只提供 34 个 Capability 的主 symbol 条目，不提供受控 visual variant 列表；GATE-06-03 不修改 Profile binding，而是以 READY Intake/Handoff 为根，对 exact Coverage Catalog、Golden Manifest 和 Golden Replay Report 做一对一 join，派生 family variant、fixture、expected projection 和 transaction。任一原始 ref/SHA、join key、expectation 或两次 replay 不一致即 BLOCKED。
7. family visual variant 固定取 130 个 PASS coverage key，按 Capability 与 coverage key 排序；`visual_variant_key` 使用完整 coverage key。Visual case 保持 `378`，但 fixture/revision/focus/cell/golden/critical region 必须位于每个 variant capture 内，不能放在包含多个 variant 的 case 层。
8. 当前基线的 family capture 为 `130×3×3=1170`，加 8 个公共 subject 的 `72` 个 capture，固定 `capture_count=1242`、`attempt_capture_count=2484`。这些数量不改变 `378/756` case/attempt 口径。
9. 上游 family fixture 必须从 Handoff exact evidence bundle 安全物化，并同时绑定 bundle raw SHA、archive entry path 和物化文件 SHA；普通 file ref 不得冒充 archive entry ref。178个Family base ref当前深度去重为2，Project只来自同一Evidence Bundle内Family Fixture Identity Catalog，Model/Context/base Revision/sequence与fixture bytes深度一致，parent按“fixture字段存在则字符串、缺失则Catalog显式`null`”归一后相等；禁止SHA/路径/case/Golden/Recovery派生Project。8 个公共 Visual 与 16 个公共 E2E 必须来自独立版本化 common fixture/factory catalog，expected action/transaction 不得由 observed 结果反填。
10. golden 必须由显式 approved version 内的 `golden-environment.json` 索引 exact PNG、9 个 blank baseline 和环境指纹；Manifest 不能通过目录扫描猜测 golden 或选择 mutable latest。
11. Golden Authoring 必须先按独立设计包生成不依赖既有 PNG 的 Capture Plan；130 个 Family PASS fixture 必须经 release-only Golden Fixture Materializer 形成隔离 SQLite 和 exact Report；8 个 Common fixture必须通过02B完整契约和03C release-only SQLite V1物化形成8个immutable base及144个fresh clone；随后才允许 fixed clean build/Runtime/Chromium/font/clock/wait candidate author。
12. Candidate 必须使用生产 Approval Record 0.2，经 Applicant/Approver 分离审批后排他发布不可变 `INITIAL/SUPERSEDE` 版本；其 candidate/new set digest 必须覆盖 130 份 Materialization Report 与 130 个 SQLite base。validation runner 永久只读。Visual Manifest 必须同时绑定 exact `APPROVED_PUBLISHED` Authoring Report 0.2 与 Golden Environment；缺 materialization/capture、环境不一致、未审批、旧/新 SHA 不闭合或输出路径可覆盖时必须零输出并保持 BLOCKED。
13. 生产 Visual Manifest 目标版本为 `OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001/0.2`、`manifest_version=0.2.0`，必填 `golden_authoring_report_ref`；现有 `0.1` Schema 只保留为历史实现输入，不得作为生产 Visual Gate Manifest。
14. Golden Authoring唯一实施口径为主设计`v1.4`和Visual Common Materialization设计`v1.9`；Family Fixture Materializer唯一实施口径为主设计`v1.5`和Verifier Catalog`v1.1`。当前三类Authoring 0.1 Schema、Capture Planner、Materialization Report Schema和03A Materializer实现已存在；pending预验证、四阶段quarantine、63/63、受控130项串行/并发4及contract/backend已闭环，Golden Environment`0.2` Schema/离线verifier已实现。Visual Common `v1.9` 已冻结活动Adapter Request `0.2`的exact Java 21 executable和Profile五资产受控输入、Adapter Test Input Bundle `0.1`的fresh Profile 5/Common 43/Plan 1242/72/Observed 144原子闭包、其余三份adapter/callback/result Schema、共享JCS、Base/Clone/Web协议、静态ESM/144次callback和独立one-shot fault port；Java Base/Clone/Web已有单个`STATE_ROLES` packaged-JAR局部验证，但测试Builder/Verifier、Node consumer、fault hook完整验收、8个Common base/144 clone和关闭矩阵仍未完成。Node adapter当前状态为`NODE_ADAPTER_BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`；03B、production 130项、04/05、真实approved evidence、Visual Manifest 0.2和release runner未闭合前，`GATE-06-03`保持BLOCKED。
   Runtime/JDK修正：Request/Handoff/Plan的source ref固定`LOCAL_RUNTIME_JAR`逐字段相等，Bundle staged ref和Runtime Ready保持`RUNTIME_JAR`并只按raw identity闭合；Adapter测试Builder只从exact Java推导JDK root/bin/jar并以固定五键env启动Planner。现有Builder/Verifier实现未满足该修正前，03C与`8/144`继续BLOCKED。
15. Visual builder继续只输出`0.2/0.2.0`；活动E2E producer/verifier同样只输出/接受`0.2/0.2.0`，其完整CLI、controlled archive/Catalog/fixture布局、Profile五资产、四driver、exact Runtime JAR/Web、ref映射、单一目录原子事务和`137 PASS+57 BLOCKED`聚合只由`opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md`及对应checklist承接。两类builder均强制`CONTROLLED_TEST/PRODUCTION_HANDOFF`模式。E2E `0.1/0.1.0`及其合并/v01 builder规格只保留历史读取和审计，禁止继续作为活动production输入。
16. E2E plan builder必须先原子写入并验证`fault-plan.json`；其余producer只从该文件读取`attempt_ordinal`并与Manifest schedule交叉校验。路径、循环下标、执行顺序或回调参数不得成为identity来源。Family Identity Catalog已在新clean Handoff/Evidence Bundle和活动Manifest中闭合，Family Materializer可进入实现；这不构成Runner、Report或Gate完成。

### 4.5 Performance Closure 边界

1. Performance 固定三个机器资产：Manifest、每场景 Raw Samples 和 Report；固定 4 个 fixture、7 个 scenario、按 `(scenario_id, metric_id)` 计数的 11 个 metric instance，不接受临时人工数据集或只汇总 P95 的报告。
2. 普通编辑固定工具切换、选择、检查器反馈三条 metric 各 `5` 次预热和 `100` 个样本；增量 OPL 固定 `8` 次预热和 `100` 个样本；两档 OPD 分别采集 `30 s` frame stream 与 `5+100` 个选择样本；10,000 结点三类任务各 `5` 次独立 measured attempt。
3. 所有 duration 使用整数微秒；P50/P95 使用 nearest-rank `ceil(p×N)-1`，不插值、不删异常值、不重试。Report 展示毫秒可以保留三位小数，但 Gate 只比较原始微秒。
4. Gate 继承 Intake exact upstream artifacts，并使用与 Visual/E2E 相同的 clean DEV-CANVAS-06 target build。性能环境必须满足第 6 节硬件下限，使用 production build、产品默认启动参数、headful Chromium/GPU、无 throttling/DevTools/HMR/节能模式。
5. 性能通过只证明报告中的 exact build、fixture、机器和环境，属于产品发布门槛，不是 ISO 19450:2024 要求。具体 scenario ID、计时起止点、fixture 结构、样本 Schema、失败码和 READY 算法以 checklist `GATE-06-04` 契约为准。

### 4.6 Recovery/Rollback Closure 边界

1. Recovery 固定 Manifest、test-only Gate Fixture 和 Report 三类机器资产；固定 `28` 个 case、每项 `2` 次隔离 attempt，共 `56` 次，不接受只运行单元测试、只检查异常类型或只演练全量 gate 回退。
2. Case 固定分为前置资产/语义 `8`、SQLite 七写阶段 `7`、强停重开 `4`、服务/恢复状态 `3`、回退 `6`。每个 attempt 必须在独立资产副本、项目目录、SQLite 和进程中执行，并由新进程重开复核。
3. 零增量沿用 DEV-CANVAS-05 的 Revision/Parent/Text/Trace/Finding/Operation/Receipt 七项与 Draft Head ID/sequence 口径；commit 后断连或 Projection 回读失败必须证明恰好一次耐久提交和相同 command_id 幂等回放。
4. 发布前回退演练使用生产 loader 明确拒绝的 test-only Gate Fixture，只调用与生产相同的 rollback evaluator；不得伪造 `GATE-06-06` READY Report、生成可被生产 loader 接受的 Activation 或改变 production gate。
5. 逐Capability回退按`(previous enabled - requested - reverse dependency closure)`计算；历史含已回退语义的Revision仍按exact binding只读渲染，但相关新写入必须阻断。case ID、Report字段、失败码和READY算法以checklist `GATE-06-05`为准；两份immutable template、五份机器Schema、独立helper JAR、21表Factory映射、七个SQLite hook、四个forced-stop reachpoint/launcher和artifact index只以`docs/design/opm-dev-canvas-06-recovery-execution-design.md v1.4`为准。

### 4.7 Release Candidate Evidence 边界

1. Release Candidate 固定 Manifest、Report 两类 JSON 机器资产和一个平台定向 ZIP 安装包；Manifest 只允许 `BLOCKED/READY_FOR_RELEASE_SMOKE`，Report 只允许 `BLOCKED/READY`。
2. 发布包必须由 clean source checkout、`package-lock.json`、Maven wrapper/POM 和 exact Java 21、Node 22 工具链构建；Vue production dist 必须内嵌到 Spring Boot JAR，由同一 loopback origin 提供，发布包不得依赖 Vite、源码目录、npm/Maven 或外网启动。
3. clean smoke 固定 `6` 个 case：install、start、health、open、reopen、exit；每项在 `2` 个完全隔离的安装/存储/浏览器/进程 lane 中各执行一次，共 `12` 条 attempt evidence，禁止 retry、skip、复用开发者数据或现有进程。
4. Manifest/Report 必须汇总 exact Handoff、Intake、Visual、E2E、Performance、Recovery 和 Enablement Candidate ref/SHA；Candidate 必须为 `READY_FOR_ACTIVATION`，但 smoke 全程 production gate 仍为 `DISABLED + []`。
5. `READY` Release Report 只授权 `GATE-06-02 Activation` 消费 exact Candidate 与 exact Report；它本身不得生成 Activation、启用 Capability 或修改 Model/Revision。具体发布包布局、字段、case、阈值、失败码和 READY 算法以 checklist `GATE-06-06` 契约为准。

## 5. 性能门槛

以下数值是产品发布门槛，不是 ISO 19450:2024 要求。

| 场景 | 数据集 | PASS 阈值 |
| --- | --- | --- |
| 普通编辑反馈 | 工具切换、选择、检查器字段提交反馈 | 用户输入到可见反馈 P95 `<= 100 ms` |
| 增量 OPL | 有效语义变更到受影响 OPL 可见 | P95 `<= 500 ms` |
| 需求基线 OPD | 300 可见结点/600 关系 | pan/zoom frame time P95 `<= 32 ms`；选择反馈 P95 `<= 100 ms`；零功能失效 |
| 设计压力 OPD | 1,000 可见 construct/2,000 edge | pan/zoom frame time P95 `<= 50 ms`；选择反馈 P95 `<= 200 ms`；零功能失效、零 OOM |
| 大模型保存 | 10,000 结点、跨多 OPD | 每次 `<= 10 s`，5 次均成功 |
| 大模型快照 | 同一 10,000 结点模型 | 每次 `<= 15 s`，5 次均成功 |
| 大模型全量校验 | 同一 10,000 结点模型 | 每次 `<= 60 s`，5 次均成功、结果完整 |

交互测量先预热至少 `5` 次，再采样至少 `100` 次并报告 P50/P95/Max；frame time 在稳定画布上连续采样至少 `30 s`。10,000 结点三类任务各执行至少 `5` 次，报告每次时长、Max 和失败率，任一次失败、OOM、结果缺失或超时即 FAIL。

## 6. 固定测试环境

1. 使用 production/release build，关闭 HMR、Vue devtools、浏览器 DevTools 和非产品性能注入；
2. Java 固定 `21`，Node 固定 `22`，Chromium 固定为 lockfile/Playwright 对应版本；报告 exact patch version；
3. 参考机器至少 `8` 个逻辑 CPU、`16 GB` RAM 和 SSD，关闭节能/低电量模式；报告机器型号、CPU、RAM、SSD、OS build 和测试时可用内存；
4. 浏览器视口固定 `1440x900`，device scale factor `1`，CPU/network throttling 关闭；视觉矩阵另测 `1280x800`、`390x844`；
5. Fixture、Profile/Rule/Grammar/Symbol digests、Revision、冷/热启动口径固定；不同机器或版本的结果不得混算同一 P95；
6. 性能报告保留原始样本和计算脚本。原型、dev build、单次人工观察或无环境元数据的结果不得作为 PASS 证据。

## 7. 验收映射

| 需求 | 必须证据 |
| --- | --- |
| Handoff Intake | exact `handoff_ref.sha256`、8 项检查和 34 项 intake 均 matched，Intake Report Schema 合法 |
| 完整工具链 | 组件测试和 P03 浏览器主路径，图标/tooltip/搜索/候选/检查器完整 |
| Capability gate | 每个 ID 的上游 evidence 指纹、五项依赖、coverage keys、视觉/家族 E2E/公共 Gate 闭包与稳定 reason；Candidate 与 Activation manifest 均可复核 |
| 视觉 | 130 份 exact Materialization Report/SQLite base、生产 Approval Record 0.2、approved Authoring Report 0.2/Golden Environment；`378/378` case、`756/756` attempt、`1242` capture、`2484` attempt capture；三视口/三缩放、130 个 exact PASS family variant、8 个公共主题、golden/canvas pixel/几何/遮挡/溢出均 matched |
| E2E | `194/194` case、`388/388` attempt；`178=130+48` coverage keys 和 16 个公共 case 全 matched，Revision/Projection/OPL/Trace/事务/重开闭合 |
| 性能 | `7/7` scenario、`11/11` metric instance、7 份 raw sample set；nearest-rank P50/P95/Max 可复算，阈值/功能/完整性/零 OOM/零失败全部 matched |
| 恢复/回退 | `28/28` case、`56/56` attempt；七项事务/Head、强停重开、幂等回放、`ROLLED_BACK_PARTIAL/ROLLED_BACK` 和历史只读均 matched |
| 发布 | Release Manifest/Report Schema 合法；`6/6` smoke case、`12/12` attempt 通过；ZIP/JAR/Web dist/lockfile/environment 指纹可复核；Candidate 保持 `READY_FOR_ACTIVATION + DISABLED + []` |

## 8. 完成定义

1. `E2E-CANVAS-001~007` 和三视口/三缩放视觉矩阵全部通过，无空白 canvas、无关键遮挡、无全局横向溢出；
2. 每个 enabled Capability 的 exact dependency closure 与 DEV-CANVAS-05 PASS 证据一致；
3. 第 5 节所有性能门槛通过，原始样本、统计口径和环境可复核；
4. asset-missing、digest mismatch、服务失败、强停重启和只读回滚不产生 partial Revision 或错误 Head；
5. 整体及按 Capability 关闭 enablement gate 后，已有数据保持只读可渲染，部分回退集合与依赖级联可从前序 manifest 复算；
6. Candidate/Activation/Rollback manifest 状态、集合基数、前序 SHA 和 Report ref 均通过机器 Schema 与 verifier；
7. Release Candidate Manifest 与 Report 通过 Schema/verifier，`6/6` smoke case、`12/12` attempt 在 exact ZIP 安装包上通过；
8. 发布报告明确“完整画布发布证据”和“ISO 符合性证据”是不同状态。

## 9. 兼容性与回滚

- API/数据：不变更公共 operationId 或 SQLite DDL；只消费已发布的兼容机器契约；
- 前端：新工具由 Capability gate 控制，P0 工具链继续可用；
- 资产：只启用 exact digest，失败时回到上一组 ACTIVE binding；
- 回滚：整体回退生成 `ROLLED_BACK`；按 Capability 回退生成单调减少集合的 `ROLLED_BACK_PARTIAL`，必要时级联依赖 Control；模型数据和历史 Revision 不回退、不删除。

## 10. 事实与假设

### 10.1 事实

1. 性能阈值和采样方法已由本规格冻结；
2. 通过本包只能证明指定版本、fixture 和环境的发布验收，不自动证明其他硬件或 ISO 符合性；
3. 本包不能修改上游语义输入来换取 UI 或性能通过；
4. `GATE-06-01~06` 的 Schema 身份、Gate 顺序、三批次、Visual/E2E/Performance/Recovery/Release 数量、状态、失败分类和 READY 边界均已冻结；GATE-06-03 的可执行输入还要求 exact 三表 join、130 个 release-only SQLite materialization/Report、common fixture catalog、Golden Authoring approved version 和 golden index，不能把高层数量或设计冻结解释为机器资产已存在。

### 10.2 待实现验证

1. X6、浏览器和 Local Runtime 是否满足视觉、交互和性能门槛必须实测；
2. 参考机器之外的容量与性能需要单独报告，不能从本规格推测；
3. 性能优化若需要架构或语义变更，必须退回独立 task spec，不在本包静默扩围。
4. Release Schema、bundle builder、production 静态资源打包、smoke runner、报告和 Activation 尚未实现或执行；设计 `FROZEN` 不表示安装、运行、发布或生产启用通过。
