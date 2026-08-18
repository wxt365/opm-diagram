# Spec: DEV-CANVAS-06 Recovery Runner 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `backend-springboot`
- `design-module-docs`

## 1. 目标

按`docs/design/opm-dev-canvas-06-recovery-execution-design.md v1.5`与Projection Digest Closure `v1.0/0.1`只读消费两份已冻结的immutable template、Reopen Expectation Catalog `0.1.0`、Projection Digest Schema/vector、活动Manifest `0.2`及Recovery机器Schema，实现`GATE-06-05`的template/catalog validator、factory、独立`recovery-test-tools.jar`、Manifest/Gate Fixture builder、test-only canonical request guard、fault/reachpoint test composition、forced-stop launcher、56-attempt runner、artifact collector、Recovery Report writer和只读verifier。

## 2. 前置输入

1. Recovery execution设计`v1.5`、Projection Digest Closure设计`v1.0/0.1`与DEV-CANVAS-06 `GATE-06-05`已冻结；`RECOVERY-IMPL-01=DESIGN_READY`，实现状态以checklist当前记录为准；
2. 活动Manifest为`0.2`；Gate Fixture/Report/Attempt Materialization/Tree Descriptor、Reopen Catalog、API Request Artifact、Launch Request和Launch Proof Schema为`0.1`；Manifest `0.1`仅历史读取；
3. `tests/recovery/release/dev-canvas-06/templates/0.1.0/`两份template为已冻结只读输入，raw SHA分别为`76d906ad7ef8eb14028433458b23aebf8c9dd3db22a75d9d95f7d81a1785bc4a`和`69bf9389d5e19f8b8b589349e689c030a1be5456aa2332315dc5cb3aad9172b5`；
4. `tests/recovery/release/dev-canvas-06/catalogs/0.1.0/recovery-reopen-expectation-catalog.json`为冻结只读输入，raw SHA=`9c5d95c454aa680b12a8d3b3bfb958c4f4ec8b8f971bc21e7bb464f6ef32622e`；
5. `projection-digest-v01-parity-vectors.json`为冻结只读输入，Catalog payload SHA=`fd81cdfdc10c7137ecf48c314766251632f01fe6f6da458f0b1c47b1f49113f4`、raw SHA=`470a4b2edd6368576bfe35e65f89dad9724109873084250cae5e9ed8e1b83f6d`；
6. exact READY Intake/Handoff和同一clean DEV-CANVAS-06 target build可用；
7. JDK 21、Node 22和目标OS强停primitive可用；
8. production gate在执行前为`DISABLED + []`。

缺真实clean输入不阻断代码/受控测试，但阻断真实Recovery READY Report和Gate关闭。

## 3. 修改边界

允许修改：

- `tests/recovery/release/dev-canvas-06/factories/**`、`launcher/**`和定向受控fixture；
- `scripts/release-canvas06-recovery-*.mjs`、`scripts/verify-canvas06-recovery.mjs`及定向测试；
- `services/recovery-test-tools/**`，仅用于独立helper JAR；
- `services/recovery-test-launcher/**`，仅用于child main、canonical request guard与reachpoint launcher JAR；
- `services/local-runtime/src/test/java/org/opm/localruntime/recovery/**`；
- 为注入默认NOOP port、commit后/response前reachpoint及纯rollback evaluator所必需的最小production代码；
- `scripts/canvas06-projection-digest-v01.mjs`与`org.opm.localruntime.releaseauthoring.ProjectionDigestV01`，仅实现冻结`0.1` pure normalizer/digest；
- 根`pom.xml`仅允许登记`services/recovery-test-tools`与`services/recovery-test-launcher`模块；
- `package.json`仅新增Recovery命令；
- 本规格/checklist和实现状态文档。

禁止修改：两份`templates/0.1.0/*.json`、Reopen Catalog `0.1.0`、Projection Digest `0.1` Schema/vector、Launch Request/Proof `0.1`冻结bytes、活动/历史Recovery Schema、共享Node/Java JCS owner值域、SQLite DDL/migration、Profile/Rule/Grammar/Symbol/Handoff、公共HTTP route/wire、Vue、真实production gate数据、Enablement状态机语义、Visual/E2E/Performance、Candidate/Activation、依赖版本和`.harness/**`。template、Catalog、Projection Digest、Launch协议或Factory机器语义变更必须另建版本和独立设计变更任务，runner实现不得重新author、格式化或覆盖冻结输入。

任何production代码改动必须保持默认NOOP、零公开fault入口，并有普通Runtime/JAR内容回归。

## 4. 实现切片

1. `RECOVERY-IMPL-01`：只读template raw/payload validator、独立helper JAR和factory atomic materialization；
2. `RECOVERY-IMPL-02`：Manifest `0.2`/Gate Fixture builder、Reopen Catalog exact join、28-case catalog和source build/ref verifier；
3. `RECOVERY-IMPL-03`：七个SQLite fault stage与PRE_COMMIT/SERVICE fault adapter；
4. `RECOVERY-IMPL-04`：canonical request filter/advice、四reachpoint、launcher protocol、OS强停和新JVM reopen；
5. `RECOVERY-IMPL-05`：rollback evaluator adapter、production loader rejection和gate isolation；
6. `RECOVERY-IMPL-06`：snapshot/artifact index、Report writer、semantic verifier和28/56聚合。

切片可分别合并，但只有六项全部完成并在同一exact build重验后才可生成真实READY Report。

## 5. 必须行为

1. template bytes/version path不可覆盖，Manifest source ref逐raw byte闭合；
2. 每个attempt使用fresh atomic root、独立SQLite/assets/process/port/cache/gate copy；
3. 7个SQLite case走真实repository transaction并由新JVM重开；
4. 4个forced case只有父进程验证reach proof后才能执行SIGKILL/TerminateProcess；
5. 018 proof严格在commit返回后、HTTP首byte前；019严格在父进程确认完整response后；
6. artifact-first，禁止强停/失败后先cleanup再取证；
7. Report只引用raw ref闭合artifact，BLOCKED不得省略已发生的失败attempt；
8. production loader拒绝Gate Fixture，production gate执行前后均不变；
9. runner串行、零retry/skip/resume；相同输入两attempt normalized digest相等；
10. 错误与退出码严格采用设计第13章和现有Recovery Schema。
11. HTTP client只发送raw request file bytes；Filter与Advice在Controller前完成raw/canonical/parsed三方证明，失败时Controller/Service/repository调用均为0。
12. base/before/after/reopen snapshot的`projection_digest`只允许由Projection Digest `0.1`生成；scenario projection digest继续使用immutable template既有安全整数JCS定义，二者禁止互换。
13. challenge必须为owner-only 32-byte secret且不进入Report；Launch Request及四类proof严格按`0.1` Schema、single-writer atomic publish、payload readback和设计第8.5节首错顺序执行。

## 6. 测试要求

- template/factory：identity、raw/payload、Handoff binding、symlink、non-fresh、atomic failure和immutability；
- helper/SQLite：固定模块/JAR Manifest/source commit、Runtime/ZIP隔离、21表集合/计数、逐列JCS/raw映射和sidecar；
- Runtime：普通NOOP、test composition guard、canonical raw/parsed匹配及重排/空白/BOM/重复键/错误SHA/超限/缺guard反例、七stage单次触发/rollback、reach latch窗口；
- launcher：Launch Request/Proof Schema、runtime/launcher JAR SHA、PID/nonce/challenge权限与清理、atomic no-replace/readback、proof tamper、child提前退出、正常shutdown拒绝、OS强停观测；
- snapshot/artifact：七计数、Head/digest、WAL/journal原样、index/tree/ref、16MiB上限；
- Projection Digest：4个正向量和9个负向量的Node/Java input bits、runtime value、preimage、canonical bytes、SHA、稳定code/pointer全部一致；共享JCS既有vector回归不变；
- rollback：同源evaluator、依赖closure、unknown/tamper拒绝、历史只读、真实gate不变；
- E2E integration：28 case x2 attempt、26零delta、2恰一次commit、3 partial/1 full/2 rejected rollback和READY聚合。

## 7. 验收与验证命令

实现后至少执行定向Node测试、`./mvnw -pl services/recovery-test-tools -am test`、`./mvnw -pl services/local-runtime test`、两个JAR与release ZIP内容检查、受控28/56完整矩阵、Recovery semantic verifier、`npm run contract:validate`、backend verify和`git diff --check`。真实release执行必须单独记录exact命令、commit、Runtime/helper/launcher/template SHA、环境指纹、artifact tree和Report SHA。

## 8. 回滚

删除本实现包新增factory/launcher/runner/test命令，回退production最小port/evaluator提取并运行普通Runtime/repository/enablement回归。不得删除或改写冻结template、用户数据、Handoff、已有release evidence或真实gate。失败不得通过降低fault到达、snapshot或READY规则解决。

## 9. 状态边界

代码/受控测试完成不等于真实28/56 release执行；Schema-valid Report不等于semantic verifier通过；Recovery READY不等于Candidate/Activation；任何结果都不单独构成ISO 19450:2024符合性证明。
