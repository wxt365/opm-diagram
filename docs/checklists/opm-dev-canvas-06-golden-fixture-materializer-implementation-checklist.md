# Checklist: DEV-CANVAS-06 Golden Fixture Materializer 实现

> 状态：`READY_FOR_PRODUCTION_MATERIALIZATION`。Materializer设计 `v1.5` 与 Verifier Catalog `v1.1` 的实现闭环已完成：63/63受控case、三种枚举顺序、前后tree digest、受控130项packaged-JAR串行/并发4、完整contract/backend及声明边界均已重验。该状态只允许进入独立production 130项Materialization执行包，不表示生产Report/SQLite、approved golden或后续Gate已生成。

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`
- 目标、范围、非目标、约束、验收、验证、兼容和回滚：分别映射规格第 1 至第 13 节。
- 设计事实源：`docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`。
- 修改边界：只允许实现规格第 4 节；禁止第 5 节全部范围。

## Input Gate

- [x] Materializer 设计 `v1.5` 与 verifier controlled case catalog `v1.1` 为 `FROZEN`，本 checklist 已同步新契约。
- [x] Java 21.0.7、Node 22.22.0、npm 10.9.4 和 Maven 产出的 exact Runtime JAR 输入可用；Node Orchestrator 只从`JAVA_HOME/bin/java`启动并在创建 root 前验证 Java major=`21`，不回退到未验证的`PATH`。
- [x] 受控 Capture Plan 为 `OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001/0.1`、`READY_FOR_AUTHORING`，Materialization Report/Marker Schema 输入与设计一致。
- [x] 已区分受控 implementation test Bundle 与真实 clean release Bundle；本 checklist 中的受控结果不作为后者的 evidence。
- [x] 真实clean输入已冻结为`clean-b940ac9bb734`：Handoff SHA=`0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326`，Bundle SHA=`84e41e5e4c9edab98aa72cd209da49726df96436c9d0ae8a50fc2895f375cabe`，生产Plan SHA=`8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9`；尚未生成生产Materialization Report。
- [x] 当前工作树用户改动已识别，不覆盖无关改动。

## Build

- [x] 实现 Materialization Report 0.1 Schema 和正反 contract test。
- [x] 实现 1170 -> 130 -> 每项 9 次的 Orchestrator 去重、排序和前置阻断。
- [x] 实现 Runtime active binding 单一 provider，并保持普通 API/Bootstrap 兼容。
- [x] 实现 release-only profile、non-web、mode/enabled/version 和 command-line origin guard：release profile 的 startup guard 在 context 创建期拒绝缺失/冲突/非 command-line 值；Materializer Runner 仅在五项 guard 全部有效时装配。
- [x] 实现 ordered preflight、JAR 自校验、Bundle/archive/fixture/binding/storage 校验。
- [x] 实现只读 pending-quarantine verifier和不可序列化内存 attestation。
- [x] 实现“预验证 -> 原子移动 residual -> 原子写 marker -> 完整 selected verifier”的唯一调用顺序。
- [x] 实现确定性 Project identity 和固定七表 seed transaction。
- [x] 实现 post-commit integrity/FK/row/identity/reopen/sidecar/digest verifier。
- [x] 实现 reportable invocation 的 success/blocked Report atomic writer、payload SHA、零覆盖和 report-out 交付失败语义。
- [x] 实现 stable projection 与 per-run evidence 分离及重建比较。
- [x] 实现 content/engine/write 互斥 Report pipeline 和失败码。
- [x] 实现 cleanup primary/secondary failure、quarantine move/marker 及失败升级。
- [x] 实现 Quarantine Marker `0.1` Schema 和正反 contract test。
- [x] 实现唯一 Materialization Report semantic verifier、catalog factory、稳定 `GFMV_*`/优先级和四类调用方消费门。
- [x] 实现 `--concurrency 1..4`、并发 lock、失败停止新调度、active sibling 等待和 key 顺序汇总。
- [x] 实现 `GoldenFixtureAttemptCloneVerifier`，仅复制已物化 storage：先后复核基础库和 clone 的 database SHA、拒绝 sidecar/symlink/非空 attempt storage；不实现 Candidate Author capture。

## Verify

- [x] Node 集合、空 root、并发 lock、`1..4` 上限、失败停止新调度、active sibling 等待、callback 异常保留和 key 顺序汇总定向测试通过；真实子进程失败路径仍随完整受控 factory 验收。
- [x] Report Schema 正反 contract test 通过。
- [x] Spring 条件装配、property origin、web/profile 冲突测试通过：`ReleaseGoldenAuthoringConditionTest` 覆盖默认 profile 无 authoring bean、完整 guard 装配 Runner、web 冲突和非 command-line 来源 startup failure；packaged JAR 反例验证 `GFM_WEB_MODE_FORBIDDEN/2`。零 route 架构检查仍随完整 package scan 验收。
- [x] `GoldenFixtureMaterializerRunnerTest` 已验证：mode guard 拒绝零输出；五个 guard 中的 mode 必须来自 `commandLineArgs`；Check 8 的非 `MS-REV-001/0.2` fixture 为零 storage/report/temp；fixture/Plan/Runtime binding 和 storage 不一致时，使用真实 Plan/Bundle/fixture 字段原子写入 `BLOCKED` Report，checks 为此前 `PASSED`、当前 `FAILED`、后续 `NOT_RUN`；report-out 父路径不可写时返回 `GFM_REPORT_WRITE_FAILED/4` 且零最终/临时 Report。
- [x] MODE/ARGS/JAR/PLAN/MEMBERSHIP/BUNDLE/ARCHIVE/FIXTURE 八阶段逐项反例已由 `GoldenFixtureMaterializerJarIT` 的 packaged-JAR 矩阵证明 stderr/exit 稳定且 storage/report/temp 零输出：Mode、Args、Runtime JAR、Plan、Membership、Bundle、Archive、Fixture SHA、Fixture Schema 共 `9/9 PASS`；Fixture 的 SHA 与 Schema 是同一 Check 的独立反例。
- [x] BINDING/STORAGE 逐项反例已由 `GoldenFixtureMaterializerJarIT` 的 packaged-JAR 用例证明：Binding 在 Check 9 失败、Storage 非空在 Check 10 失败；两者均保留 Check 1~8 `PASSED`、真实 fixture identity 和无可消费 persistence 字段的 `BLOCKED` Report。Binding root 固定为 `GFMV_ROOT_NOT_CONSUMABLE/3`；Storage 保留既有文件并固定为 `GFMV_ROOT_EXTRA_ENTRY/2`，均不可被下游消费。
- [x] report build 与 report-out 不可写/temp/atomic rename 故障已分别证明 BLOCKED 与 `GFM_REPORT_WRITE_FAILED/4` 边界。
- [x] JCS/digest/serializer payload-engine 故障已通过 `GoldenFixtureMaterializerRunnerTest` 的 fault port 证明为 `GFM_REPORT_ENGINE_FAILED/4`、零最终/临时 Report、成功物化 storage 清理且不重试写 `BLOCKED`；Java Schema pre-write validator 在原子写前校验冻结 `0.1` 的字段封闭、状态条件字段、固定 table counts 和 payload SHA。`GoldenFixtureMaterializerRunnerTest` 共 `18/18 PASS`，并验证成功内容缺字段会清理 storage 后写入携带真实 fixture identity 的 `GFM_REPORT_CONTENT_INVALID` BLOCKED Report。
- [x] cleanup failure 保留 primary、追加 secondary，并映射move/marker failure为`GFM_QUARANTINE_FAILED/4`：Java定向故障注入证明仅清理本次创建内容、预存空目录保留、`failures[0]`保持原`GFM_STORAGE_WRITE_FAILED`且`failures[1]=GFM_CLEANUP_FAILED`。既有Node“verifier后移动”测试只作为`v1.4`历史证据，已被`v1.5`四阶段顺序取代，不计入当前闭包。
- [x] semantic verifier 定向闭包通过 packaged-JAR 回归：真实 fixture archive/ref、Plan/Bundle ref、MATERIALIZED/Binding BLOCKED 状态、check 顺序、payload、binding、fixture identity、database raw ref/sidecar、SQLite integrity/FK/行数/Revision/Head/binding/schema-set 与 semantic state 均有正反例；旧 `GFM_*` verifier 输出已替换为冻结 `GFMV_*`。
- [x] controlled factory已实现schema-valid 1242-capture Plan、纯ZIP、actual key alias、独立root clone、`expected.json`、test-only fault port与只读tree digest；原catalog `v1.0` 的57个case均在默认、逆序、稳定伪随机三种枚举顺序下通过，top code/exit一致。本轮受控根不构成真实clean Handoff或release evidence。
- [x] 原semantic verifier catalog `57/57`通过；Schema-valid但checks/SHA/identity/failure/root不闭合输入被稳定拒绝，合法BLOCKED/缺失/quarantine返回`3`，unknown/extra/unsafe返回`2`。
- [x] catalog `v1.1` 的六个 pending-quarantine case、63-case 注册和四阶段 Orchestrator 定向测试已实现；完整受控130 fixture root上的63/63按默认、逆序、稳定伪随机三种枚举顺序通过，全部case前后tree digest相等。
- [x] selected/full-root 消费边界、三种文件枚举顺序和每个 case 前后 root tree digest 相等均通过。
- [x] `--concurrency=1/4`、失败停止新调度、等待 sibling、callback 异常和 key 排序测试通过；CLI 非法值与真实子进程失败路径仍随完整受控 factory 验收。
- [x] 普通 Runtime API/Bootstrap/service 回归通过。
- [x] Procedural/Control/Structural 三家族真实 SQLite integration 通过。
- [x] migration、七表写入、commit 前与 verify 前故障注入通过：`GoldenFixtureSeedRepositoryTest` 对 migration、`project_metadata`、三 package、`model_catalog`、`revision_document`、`model_head`、commit 与 verify 分别验证稳定错误码；seed/commit 失败时七张业务表均为零行，verify 失败保留已提交数据交由 Runner cleanup。
- [x] Report writer 的临时创建、写入、fsync 和 atomic rename 故障注入通过：`GoldenFixtureMaterializerRunnerTest` 的四项定向 fault port 均固定为 `GFM_REPORT_WRITE_FAILED/4`，并清理最终及 `.tmp` Report；生产 writer 使用 `FileChannel.force(true)`；一次性 rename 故障不重试写 `BLOCKED`，已物化 storage 被清理；成功/既有不可写路径同时复用生产 atomic writer。
- [x] 非空/symlink/unsafe archive/JAR/Bundle/fixture/binding mismatch 全部稳定阻断。
- [x] `GoldenFixtureMaterializerJarIT` 已在 Maven 产出的 Spring Boot JAR 上执行受控物化、pre-acceptance、Binding/Storage BLOCKED 和 semantic verifier 场景：验证 non-web 退出、CodeSource 顶层 JAR exact SHA、SQLite base 和 `MATERIALIZED` Report；Mode、Args、JAR SHA、Plan、Fixture Membership、Bundle SHA、unsafe archive entry、fixture SHA、unsupported fixture schema 的 Check 1~8 矩阵为 `9/9 PASS`，均验证稳定 stderr/退出码与零 storage/report/temp；Binding 与 Storage 分别验证 Check 9/10、真实 fixture identity、无可消费 persistence 字段和固定不可消费 verifier 结果；并验证 `GFMV_*` 对 check、payload、input ref、binding、fixture identity、database/state/sidecar/root extra 的分类。执行前先 `package -DskipTests`，再显式指定该 `*IT`，不把受控输入作为 release evidence。
- [x] 受控 130 项 JAR integration 为 130/130 `MATERIALIZED` 且 `reopen_matched=true`：从 `opm-opl-golden-manifest.json` 的 130 个无重复 `PASS` fixture 构造单一 ZIP、1170-capture Plan，逐项通过 Maven 产出的 exact Spring Boot JAR 运行；随后 full-root `--require-materialized` 对 130 份 Report/SQLite base 一起返回 `0`。该受控测试不构成真实 clean Handoff/approved authoring evidence。
- [x] base SHA 不变、两个 clone 隔离和无 WAL/SHM 通过：clone1 SQLite 修改后 clone2 与基础库 SHA 保持原值；非空 attempt storage 被拒绝且原内容保留。
- [x] 受控 130 项性能满足单项、P95、total 和 RSS 阈值：在 macOS/Java 21 packaged-JAR 串行矩阵中，`count=130`、`p95_us=6113976`、`total_us=373002363`、`max_rss_bytes=368345088`，分别满足 `<=10s`、`<=30min`、`<=512MiB`。这是实现验收性能证据，不是 production release validation。
- [x] `npm run contract:validate`、在 Java 21 下执行的 `npm run backend:verify` 与 `git diff --check` 通过。
- [x] 2026-08-03 `v1.5/v1.1` 最终重验：Runtime JAR SHA=`f09414054f251bd156378745109e7b8e30184cc5c5d8bdb127e30821be28b979`，受控 Plan SHA=`9dcdb9d22d9f03ec54f40aa9f0bd1b9f69e3daf1873e8640dcf92f8fe0f5fdb3`，受控 Bundle SHA=`a99fdc5cd8e3a20b06ee677bfa531d60b284ed5d505fb8c82c210cb7f00e7003`；串行与并发4均生成130 Report/130 SQLite并通过full required。63/63 case全部按三种枚举顺序通过，tree digest差异数为0；其中修正`PQN-001`缺cleanup secondary时错误归类为`GFMV_FAILURE_PRECEDENCE_INVALID/2`。
- [x] 最终定向与全量命令：Materializer Node `13/13`、controlled tooling `6/6`、Java releaseauthoring `29/29`、`npm run contract:validate`退出0、Java 21 `npm run backend:verify`退出0；并发4矩阵`total_wall_s=348.1`、`p95_stage_sum_us=7330247`、`max_stage_sum_us=10634139`、`max_rss_bytes=360611840`。

## Acceptance Mapping

| 验收 | 必须证据 | 状态 |
| --- | --- | --- |
| exact input | Check 1~8 pre-acceptance 零 Report、Check 9+ BLOCKED Report 和禁止伪造 identity 反例 | `PASS` |
| identity/storage | 130 个 Report、SQLite query、reopen 和 digest | `PASS`：受控串行与并发4均为130/130，full required返回0 |
| release-only | context matrix、无监听、零 RequestMapping | `PASS`：context/JAR回归通过，releaseauthoring package架构扫描零Controller/RequestMapping/RouterFunction |
| failure atomicity | fault injection、rollback、cleanup、existing data unchanged | `PASS` |
| report closure | reportable boundary、Schema、payload SHA、raw report ref、atomic rename、engine/write失败和semantic verifier catalog 63/63 | `PASS`：63/63、三种枚举顺序及前后tree digest闭合；production release materialization仍未执行 |
| cleanup/quarantine | primary/secondary、marker Schema、move/marker failure 和整 root 拒绝 | `PASS`：六个pending case与唯一四阶段顺序闭合 |
| concurrency | 1/4、失败停止新调度、active sibling 等待和稳定汇总 | `PASS`：受控并发4真实子进程130/130，总时长348.1秒 |
| performance | wall/P95/total/RSS raw results | `PASS_IMPLEMENTATION`：并发4受控矩阵P95阶段总时长7330247us、单项最大10634139us、最大RSS 360611840 bytes；production release validation仍未执行 |

## Compatibility

- [x] 公共 HTTP route/wire 未变化，完整 Java 21 backend verify通过。
- [x] 默认/production 启动未装配 Materializer。
- [x] SQLite V1、Profile/Rule/Grammar/Symbol 和 Capture Plan 0.1 未变化。
- [x] 零新增依赖。

## Risks And Residuals

- [x] 历史旧Bundle的replay缺口保持显式且继续拒绝；新clean Bundle已冻结，未用test Plan冒充release evidence。
- [x] Materializer设计 `v1.5` 和controlled case catalog `v1.1`新增契约已完成63/63、三种枚举顺序、tree digest、受控130项与完整contract/backend重验。
- [ ] Authoring Report 0.2、03B Candidate Author、Approval Record 0.2/verifier/publisher 和 Visual Manifest 0.2 仍未实现。
- [ ] 尚未生成真实 130 份 release Materialization Report 或 approved golden。
- [ ] `GATE-06-03`、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [ ] 回滚仅覆盖本实现包新增 Schema、代码、测试、命令和最小 binding 重构。
- [ ] 回滚后普通 Runtime 回归通过，未删除 storage/release/approved/user 资产。
