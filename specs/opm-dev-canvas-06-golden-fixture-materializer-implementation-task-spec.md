# Spec: DEV-CANVAS-06 Golden Fixture Materializer 实现

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-03A`：把 READY Capture Plan 中 130 个唯一 Family `MS-REV-001/0.2` archive fixture，通过 exact Runtime JAR 的 release-only non-web 模式写入 130 个隔离 SQLite V1 基础库，并为每项生成 Schema-valid 且通过唯一 semantic verifier 的 Materialization Report，供后续 Candidate Author 和 Authoring Report 0.2 消费。

## 2. 设计输入基线

唯一设计事实源：

- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md`；
- `docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json`；
- `docs/contracts/migrations/sqlite/V1__initial_schema.sql`；
- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`。

实现基线固定为 Materializer 设计 `v1.5` 和 Materialization Verifier Controlled Case Catalog `v1.1`。实现不得重新决定 fixture 范围、Project ID、启动 guard、检查顺序、SQLite 行数、stable projection、报告/marker 字段、Report pipeline、pending-quarantine attestation、唯一四阶段 quarantine 顺序、verifier case/错误优先级、并发停止、错误码、性能阈值或 Authoring Report 版本。

## 3. 前置条件

1. Capture Plan Schema/Planner `0.1` 已实现；
2. Materializer 设计状态为 `FROZEN`；
3. JDK/Runtime 固定 Java 21；Node Orchestrator 只从 `JAVA_HOME/bin/java` 解析并在创建 materialization root 前验证 major=`21`，不得回退到未验证的 `PATH`；
4. 实现测试可构造受控 READY Plan/Evidence Bundle；
5. 历史旧 release Evidence Bundle 缺 Planner 所需 replay report，不能作为真实 release materialization 证据；新`clean-b940ac9bb734` Handoff/Bundle与生产`READY_FOR_AUTHORING` Plan已从clean source commit生成并完成exact ref、`1242/9`、determinism和Java 21验证。生产130项authoring只能消费该Plan。

第5项输入阻塞已关闭；真实`GOLDEN-AUTHORING-03A`仍必须完成Materializer设计`v1.5`、Verifier Catalog `v1.1`和130项生产执行，不能由READY Plan直接推导。

## 4. 允许修改

- `docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json`；
- `docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-quarantine-marker.schema.json`；
- `scripts/release-canvas06-golden-materialize.mjs` 及定向 Node test；
- Materialization Report semantic verifier 脚本及定向测试；
- 根 `package.json` 中仅新增 Materializer/semantic verifier 命令和定向测试入口；
- `services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/**`；
- `services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/**`；
- 为建立唯一 Runtime binding 来源所必需的 `application/**` 最小重构及原有回归测试；
- 必要的 `services/local-runtime/pom.xml` 测试/打包配置，但禁止新增依赖，除非独立评审；
- 本规格、implementation checklist 和必要的实现状态文档同步。

## 5. 禁止修改

- SQLite V1 DDL/Flyway migration；
- 公共 HTTP API、Controller route、OpenAPI、Vue 和 browser flow；
- Capture Plan/Approval/Authoring Report 现有 Schema；Authoring Report 0.2 由后续 `03B` 包实现，Approval Record 0.2 由后续 `04` 包实现；
- Profile/Rule/Grammar/Symbol、Handoff、Evidence Bundle、approved golden 或生产 gate；
- `OplGoldenReplayDatabaseInitializer` 的既有 replay 行为，除非只提取无删除语义的公共纯 helper 且回归测试完整；
- Candidate Author、Approval/Publisher、Visual Manifest、Candidate、Activation 或 ISO evidence。

## 6. 实现分层

### 6.1 Orchestrator

`scripts/release-canvas06-golden-materialize.mjs` 只负责：参数/禁止参数、Plan Schema、130-ref 去重/排序、空 root 排他创建、最多 4 个隔离子进程、停止策略和退出码汇总。它不得读取 fixture JSON 语义或写 SQLite。

### 6.2 Runtime 条件装配

`releaseauthoring` package 必须使用 profile、non-web 和 property 的组合条件装配。独立 mode guard 校验关键值确实来自 command-line property source。配置不完整时不能出现 Materializer runner；配置冲突时必须 fail startup。

### 6.3 共享 binding

新增单一 `RuntimeActiveBindingProvider`，把现有 Local Runtime 五角色 identity/digest 收敛到一个不可变返回值。普通 `LocalApiService` 与 Materializer 同时消费；原 `/opm-bootstrap.js` Profile/Rule wire shape 和值必须保持不变。

### 6.4 Materializer

按主设计第 9 章顺序完成 preflight；通过 `SemanticRevisionReader` 读取 exact entry；通过 `ProjectDatabaseFactory` 执行 Flyway；使用独立 seed repository 执行固定七表事务。不得走普通 API、随机 ID 或 `SqliteRevisionCommitRepository.commit()`。

### 6.5 Verify/Report

关闭写连接后用新只读连接完成 integrity/FK/row/identity/reopen/sidecar 检查，计算 database ref 和 semantic state SHA。只有主设计第 9.1 节定义的 reportable invocation 才进入 Report Writer；Writer 按 `MATERIALIZED/BLOCKED` 状态条件原子写 fresh path，并复核 Schema 与 payload SHA。独立只读 semantic verifier 负责 checks 顺序、状态序列、跨字段 SHA/identity、failure precedence、database 和 root/quarantine 闭包；Materializer 写后和全部下游消费者必须调用同一实现。

### 6.6 Cleanup/Quarantine

Java Materializer 保留原始 `primary_failure` 并把 cleanup 失败追加为 `GFM_CLEANUP_FAILED`；Node Orchestrator 只能依次调用 pending预验证取得内存 attestation、同 filesystem原子移动 residual、从 attestation原子写 Quarantine Marker `0.1`、调用完整 selected semantic verifier。任一步失败升级为 `GFM_QUARANTINE_FAILED/4`、零可消费最终结果，整个 change root禁止局部恢复或消费。

## 7. 行为与错误

1. Orchestrator 输入集合不满足 `1170/130/9` 时启动零子进程；
2. `GFM-CHECK-MODE` 至 `GFM-CHECK-FIXTURE` 任一失败均为 pre-acceptance rejection：不创建 storage，不写临时或最终 Materialization Report，通过稳定 stderr/退出码拒绝并停止顶层；
3. `GFM-CHECK-FIXTURE` PASSED 后才建立 ReportContext；不得从 Plan、文件名、archive metadata、expected ref 或占位值构造 `fixture_identity`；
4. `GFM-CHECK-BINDING`、`GFM-CHECK-STORAGE`、migration/seed/commit/verify 和可归类 success content 失败必须写使用真实 fixture identity 的 Schema-valid BLOCKED Report；cleanup failure 作为 secondary failure，并进入固定 quarantine；
5. success content 可归类不一致为 `GFM_REPORT_CONTENT_INVALID` BLOCKED；JCS/digest/Schema engine/serializer 自身失败为 `GFM_REPORT_ENGINE_FAILED/4` 且零最终 Report；
6. report-out 不可写、临时文件创建、fsync 或 atomic rename 失败固定返回 `GFM_REPORT_WRITE_FAILED/4`，清理临时文件且最终 Report 零可消费输出；
7. pending预验证、move、marker或完整 verifier任一步失败固定为 `GFM_QUARANTINE_FAILED/4`，整个 root不可消费；
8. report 或 storage 已存在不覆盖、不视为幂等成功；
9. `--concurrency` 值域 `1..4`、默认 `1`；任一失败后停止调度新项、等待 active sibling，并按 key 稳定汇总；
10. 任一项失败使顶层退出非零，已成功 sibling 不得被 Candidate Author 消费；
11. Schema-valid 只是结构门，未通过 semantic verifier 的 Report/root 一律不可消费；
12. 错误码、优先级和退出码严格采用主设计第 14 章；
13. 日志不得输出 fixture 正文、完整绝对路径或敏感环境值。

## 8. 测试要求

### 8.1 Node contract/orchestration

- READY 1170 capture 去重为 130 ref，排序稳定、每项出现 9 次；
- 129/131、普通 fileRef、key collision、bundle SHA 不一致和禁止参数在启动子进程前阻断；
- root 非空、report/storage 已存在、子进程非零和并发上限行为稳定；
- `--concurrency=1/4`、非法 `0/5`、失败后停止新调度、等待 active sibling 和 key 顺序汇总稳定；
- cleanup failure 触发 pending预验证 -> move -> marker -> 完整 verifier唯一顺序；顺序颠倒或任一步 failure升级并拒绝整个 root；
- 相同输入、空 root 和固定 epoch 产生相同目标布局、调用序列和 stable projection。

### 8.2 Schema

- MATERIALIZED/BLOCKED 正例；
- 状态条件字段、路径、SHA、额外字段和 table counts 的 Schema 反例；
- Quarantine Marker `0.1` 正反 Schema contract；
- BLOCKED 的 `source_fixture_ref/fixture_identity` 必须来自已通过 Check 8 的 exact bytes，禁止 placeholder、expected 或 partial identity；
- Report raw ref 与 payload SHA 不混用。

### 8.3 Semantic verifier

- 固定 checks 顺序/唯一性、状态序列、ID/path/change/key、Plan/Bundle/fixture/binding/identity 闭合；
- payload/Report/database/semantic state/table counts/sidecar/reopen 独立复算；
- primary/secondary failure 和 marker/quarantine/root 闭合；
- `--require-materialized` 遇到合法 BLOCKED、缺失或闭合 quarantine 固定返回 `3`；未知 key、额外 Report/database、symlink、temp 或逃逸路径固定返回 `2`；
- selected key 成功只证明单项，Candidate Author、Publisher 和 Golden Verifier 必须使用 full-root `--require-materialized`；
- 唯一受控输入为 `docs/design/opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md`，实现其固定 factory、`GFMV_*`、首错优先级和 63/63 case；原57项完整 verifier case不得变化，新增6项只覆盖pending预验证；
- Schema-valid 但 checks 乱序/重复、SHA/identity/path/failure 不闭合的反例全部拒绝；每项 verifier 前后 root tree digest 相等，三种文件枚举顺序的 top code/exit 一致。

### 8.4 Spring/架构

- 五 guard + 单 authoring profile + non-web 时 runner 唯一装配；
- 每个缺失/冲突/非 command-line source 反例均阻断；
- MODE/ARGS/JAR/PLAN/MEMBERSHIP/BUNDLE/ARCHIVE/FIXTURE 逐项失败均断言 storage/report/temp 不存在、stderr code 和退出码稳定；
- BINDING/STORAGE 逐项失败均断言 Check 1~8 PASSED、真实 fixture identity 和 Schema-valid BLOCKED Report；
- web/production/default profile 下 Materializer bean 不存在或冲突启动失败；
- authoring JAR 不监听端口，Materializer package 零 RequestMapping；
- 普通 Runtime controller/bootstrap/service 回归通过。

### 8.5 SQLite integration

- Procedural、Control、Structural 各一个代表性 PASS fixture；
- 派生 Project ID、原样 Model/Revision/sequence/Head、固定 table counts；
- full binding/schema set/raw document SHA、integrity、FK、reopen、无 sidecar；
- 非空/symlink storage 阻断且原内容不变；
- migration、7 个 insert、commit 前、verify、Report rename 故障注入；
- rollback 后零业务行且自建 storage 清理，cleanup failure 可诊断；
- 基础库 clone SHA matched，两个 clone 写入互不影响且 base SHA 不变。

### 8.6 JAR integration

- 使用 Maven 产出的 exact Spring Boot JAR，不允许 exploded classpath 冒充；
- Bundle/JAR/entry/fixture mismatch 反例均为 pre-acceptance 零 Report；binding mismatch 为 post-acceptance BLOCKED Report；
- 受控 130 项 test Plan 全部 materialize/reopen，生成 130 个成功 Report；
- 该测试只证明实现，不得作为真实 clean Handoff/approved authoring evidence。

### 8.7 性能

在固定 macOS 参考机运行 130 项，按主设计第 15.1 节的 `/bin/ps` 采样契约记录单项 wall time、阶段微秒、peak RSS、P95 和总时长；必须满足主设计第 15 章。普通 CI 可运行代表性功能集，release validation 必须运行完整 130 项性能集；RSS probe 失败不得写入 `0` 或替代内存指标。

## 9. Acceptance Mapping

| 需求 | 实现点 | 验证 |
| --- | --- | --- |
| exact archive input | Orchestrator + Fixture Ref Verifier | bundle/JAR/entry/SHA 正反 JAR test |
| 同身份 SQLite | seed repository + verifier | 三家族 SQLite integration + 130 reopen |
| release-only | conditional configuration + mode guard | context matrix + port/route architecture test |
| 启动五项校验 | ordered preflight pipeline | 单项反例及 primary error precedence |
| pre-acceptance | mode/args/JAR/Plan/membership/bundle/archive/fixture verifier | stderr/exit 稳定且 storage/report/temp 零输出 |
| 可报告 invocation | Report Schema/Writer | Check 8 后 success/blocked/atomic/payload/raw SHA 与真实 identity test |
| Report 交付 | atomic writer | 不可写/temp/rename 失败返回 `GFM_REPORT_WRITE_FAILED/4` 且无最终文件 |
| Report 语义闭包 | 唯一只读 semantic verifier + 受控 case catalog | 63/63、三种枚举顺序、前后 tree digest、single/full-root 消费边界 |
| cleanup/quarantine | Java cleanup + Node pending verifier/quarantine/marker | attestation、唯一四阶段顺序、primary/secondary、move/marker/full verifier failure |
| 并发停止 | Orchestrator queue | concurrency 1/4、失败停止新调度、active sibling 等待和 key 排序 |
| attempt 隔离 | clone verifier | base immutable + 双 clone mutation test |
| 性能 | stage metrics | 130 项 P95/total/RSS release validation |

## 10. 验证命令

实现后至少执行：

```text
npm run release:canvas06:golden:materialize:test
npm run release:canvas06:golden:materialize:verify -- <受控 Plan/root>
npm run release:canvas06:golden-authoring-schema:test
./mvnw -pl services/local-runtime test
./mvnw -pl services/local-runtime package
npm run release:canvas06:golden:materialize -- <受控 test Plan/Bundle/JAR/root/epoch>
npm run contract:validate
npm run backend:verify
git diff --check
```

真实 release 命令只能在新 clean Handoff/Bundle 和 READY Capture Plan 上执行，结果必须另行记录 exact SHA，不得用 test Plan 代替。

## 11. 完成定义

1. Materialization Report/Quarantine Marker Schema、Node orchestrator、Java Materializer、binding provider、semantic verifier 和全部定向测试完成；catalog 63/63、三种枚举顺序和前后 tree digest 全部通过；
2. 130 个受控 implementation fixture 全部生成 MATERIALIZED Report 并通过 reopen；
3. 关键反例和故障注入均保持既有数据不变；Check 1~8 失败为零 storage/report，Check 9 以后可归类失败 storage 零可消费输出且 BLOCKED Report Schema-valid；Report engine/write/quarantine failure 均按设计零可消费最终 Report；
4. authoring 模式零 HTTP 监听，普通 Runtime API/Bootstrap 回归无变化；
5. 全部 130 项通过 semantic verifier 的 `--require-materialized`，stable projection 重建一致、per-run evidence 各自闭合；
6. cleanup/quarantine 和并发停止正反例通过；
7. 性能满足主设计阈值；
8. implementation checklist 记录 exact 命令、版本、计数和结果；
9. 不宣称真实 release materialization、Golden Authoring、Visual READY、Candidate、Activation、Capability 或 ISO PASS。

## 12. Compatibility Impact

- API：wire/route 不变；必须有回归测试证明；
- 配置：新增 release-only profile/参数，默认与 production 不装配；
- 数据：沿用 SQLite V1，只写新空 authoring storage；
- 依赖：默认零新增依赖；
- 发布顺序：03A 通过后，03B 才能实现 Authoring Report 0.2 和 candidate capture；随后由 04 实现 Approval Record 0.2/verifier/publisher；生产READY Plan已存在，真实INITIAL仍等待130项materialization和完整审批发布链。

## 13. 回滚

回退新增 Schema、orchestrator、releaseauthoring package、binding provider 最小重构、测试和命令；恢复 LocalApiService 原 binding 行为并运行普通 Runtime 回归。不删除用户 storage、release artifact、Handoff、Evidence Bundle、candidate/approved 资产。实现失败不得通过修改冻结设计或降低守卫解决。

## 14. 事实与假设

### 14.1 事实

1. 当前已有可复用 Semantic Revision reader、ProjectDatabaseFactory/Flyway 和真实 SQLite 测试模式；
2. 当前 Golden Replay initializer 的删除旧库语义不能直接复用；
3. 当前普通 Runtime binding provider、Materialization Report Schema、Node 集合编排、SQLite seed/verify、Report pipeline、pending-quarantine、semantic verifier与受控130项JAR integration均已实现；设计 `v1.5` 和 verifier catalog `v1.1` 已完成63/63、三种枚举顺序、前后tree digest及完整contract/backend重验；
4. 历史旧 release Bundle 无法生成生产READY Capture Plan；`clean-b940ac9bb734`已生成生产READY Plan，Plan SHA-256为`8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9`，但尚未执行生产Materialization；
5. 本规格本身不是实现或执行证据。

### 14.2 假设

无。若实现发现现有 Runtime JAR 无法自校验 CodeSource、SQLite read path 无法重开 seed，必须回到本规格评审，不能静默改为弱校验。
