# OPM 单机建模工具开发执行包

文档版本：`v1.56`

文档状态：`FROZEN_FOR_IMPLEMENTATION`；全局设计门为`READY_FOR_DEVELOPMENT`，实现与release evidence仍按独立包/Gate判定

全局设计状态、延期边界和开发准入以 `opm-design-freeze-baseline.md` 为唯一事实源。

`GOLDEN-AUTHORING-03C`活动输入补充：Request/Handoff/Plan只使用`LOCAL_RUNTIME_JAR` source ref；Bundle staged ref与Runtime Ready使用`RUNTIME_JAR`，仅raw identity闭合。Adapter测试Builder必须从exact Java推导JDK root/bin/jar并用固定五键env启动Planner；现有Builder/Verifier实现需修正后重新验收。

`DEV-CANVAS-06` final production source唯一入口为`9048bb3... -> C -> S -> A -> R`。后继Build必须遵守Stage `20/2/7/29`、O..A=`25=15 M+10 A`和O..R=`48=36 M+12 A`；A同时闭合release discovery与七路径source guard，R先完成API/Runtime contract `5 M`和Final Runner source guard `2 M`，再实现Context `0.1`、194/388 schedule、四Driver dispatch、完整CaseExecution/五参数调用、一次性同源client、API Exchange及唯一production bridge。

Family Driver活动口径为`v1.4`：Runner必须在Driver调用前完成identity-bearing RUN_SETUP，以正式CREATE_FACT response与SETUP前后Revision Fact差集取得唯一`setup_fact_id`，新建深冻结`SetupBoundAttemptIdentity`，并把Fact ID、subject baseline、API Exchange response ref及subject request逐字段闭合；禁止从页面、fixture、目录名、SHA或SQLite顺序推断。

production bridge只在Playwright child内导入Source Set第1项的import-safe Runner owner；INITIAL必须在Page attach后调用一次Runner-owned resolver取得完整五参数对象，REOPEN不得resolve或调用Driver。父Runner不得跨进程序列化Page。

Stage A两个Runner `M`必须实现并测试唯一`runControlledLifecycleSession()`及六方法sink/Browser proof状态机。spec在route/navigation/API前attach真实Page、在finally关闭Browser树后以相同对象confirm；Runner在临时confirm后立即冻结业务观测，并保留最小迟到事件sentinel到handler settle/sink关闭，复核零迟到事件并移除全部sentinel后才允许DURING。接口未完成前只能推进D01~D10A工具验证，禁止A commit、D10B和controlled evidence。

更新时间：2026-08-29

## Task Type

- `feature`

## Active Playbooks

- `design-module-docs (primary)`
- 进入生产代码后按包追加 `frontend-vue`、`backend-springboot`、`db-migration`、`testing`

## 1. 文档目的

本文档是生产开发的正式入口，冻结范围、开发包、依赖、接口、数据、联调、验收、回滚和就绪结论。`DEV-00~09` 保持 P0 最小闭环，`DEV-CANVAS-00~06` 承接 State 和完整关系工具链。开发任务必须从本文拆出独立规格和 checklist，不得一次实现全部开发包。

## 2. 关联文档

1. `opm-development-technology-baseline.md`
2. `opm-modeling-tool-architecture.md`
3. `opm-modeling-tool-module-design.md`
4. `opm-frontend-handoff.md`
5. `opm-test-strategy.md`
6. `opm-physical-data-and-migration-design.md`
7. `opm-symbol-and-text-generation-implementation-contract.md`
8. `docs/contracts/openapi/opm-local-api-v1.yaml`
9. `docs/contracts/schemas/*.json`
10. `docs/contracts/migrations/sqlite/V1__initial_schema.sql`
11. `opm-complete-canvas-toolchain-design.md`
12. `opm-dev-canvas-06-golden-authoring-design.md`
13. `opm-dev-canvas-06-golden-fixture-materializer-design.md`
14. `opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md`
15. `opm-dev-canvas-06-recovery-execution-design.md`
16. `opm-dev-canvas-06-execution-contract-design-correction.md`
17. `opm-dev-canvas-06-e2e-fault-launcher-design.md`

## 3. P0 范围冻结

| 范围 | 结论 | 备注 |
| --- | --- | --- |
| P01 项目库 | 进入开发 | 列表、搜索、创建、打开 |
| P02 项目详情 | 进入开发 | 模型列表、创建、打开 |
| P03 建模工作台 | 进入开发 | 五区与最小语义闭环 |
| Object/Process | 进入开发 | 基础结点、名称与布局 |
| State | 组件/契约进入，工具栏暂限 | 支持 golden 和已有状态显示 |
| Consumption | 进入开发 | 唯一 P0 生产关系 |
| System Diagram | 进入开发 | 一个 Model 一个根 SD |
| Revision/Head/Operation | 进入开发 | 不可变 Revision 与原子提交 |
| OPL/Trace | 进入开发 | `opl.consumption.v1/state.v1` |
| Validation/Task | 进入开发 | 增量/全量最小规则与 Task 查询 |
| Baseline | 进入开发 | P03/OV06 入口，不要求 P04 完整页 |
| P04-P06 独立页面 | 暂不进入 | 原型/handoff 完成，后续包 |

### 3.1 明确非目标

1. 用户、权限、租户、账号、远程访问和多人协同；
2. 完整 Result/Effect/Agent/Instrument 与全部结构/控制关系；
3. 完整 96 Capability、103 规则组、511 原子规则和 Annex A Grammar；
4. ISO 19450:2024 符合性声明；
5. P04 差异、P05 完整符合性工作台、P06 导入导出/备份恢复；
6. 达梦、MySQL、PostgreSQL；
7. 本体发布与下游平台集成。

### 3.2 一期冻结口径

1. 单用户、单设备、本地运行，仅监听 loopback；
2. Vue 3 + TypeScript + Vite + Element Plus + Pinia + Router + X6；
3. Java 21 + Spring Boot 3 + Maven + JDBC + SQLite + Flyway；
4. Semantic Model 是唯一事实源，X6/OPD/OPL/Finding 是投影；
5. API `/api/v1`，后台任务 `202 + task_id`、查询 + SSE；
6. 每个 Project 一个 SQLite 项目库和受控资产目录；
7. 不支持的能力阻断，不猜测、不生成伪正式 OPL；
8. Baseline 不可变，后续修改必须新建 Draft。

### 3.3 完整画布增量范围

P0 范围不反向扩大。完成 DEV-00~08 的最小闭环后，按独立增量包进入：

1. Object State 创建、更新、角色、显式/抑制、展开/折叠和 State-specified 端点；
2. `CAP-ISO-PROC-001~016`；
3. `CAP-ISO-CTRL-001~008`；
4. `CAP-ISO-STRUCT-001~010`；
5. 图标化工具链、关系搜索目录、候选过滤、structural fan、完整标签和检查器；
6. 对应 Symbol/Rule/Grammar/OPL/Trace/golden、视觉、E2E 和性能证据。

中文草案专属元素/关系、直接编辑 OPL、多人协同和 ISO 符合性声明仍不进入完整画布增量范围。

## 4. 建议工程结构

直接使用技术基线第 10 章：

```text
apps/web
services/local-runtime
services/modules
packages/openapi
packages/schemas
packages/profiles
packages/rules
packages/grammar
migrations/sqlite
tests/fixtures
tests/e2e
prototype
```

首个脚手架任务只能创建结构、wrapper、lockfile、健康检查和空测试，不实现业务；准确依赖版本由该任务提交的 lockfile 和 dependency management 冻结。

## 5. 开发包与优先级

| 包 | 范围 | 优先级 | 依赖 | 交付结果 |
| --- | --- | --- | --- | --- |
| DEV-00 | 多模块脚手架与质量命令 | P0 | 本执行包 | 前后端可构建、健康检查、CI 入口 |
| DEV-01 | Contracts/Profile/Rule/Grammar loader | P0 | DEV-00 | Schema 样例和绑定摘要可加载 |
| DEV-02 | SQLite V1 与 M12 adapters | P0 | DEV-00/01 | 空库迁移、Repository、事务、恢复点 |
| DEV-03 | M04/M05 核心语义与 Context | P0 | DEV-01 | Object/Process/State/Consumption/SD |
| DEV-04 | M08 OPL Planner/Generator/Trace | P0 | DEV-01/03 | G-OPL-001/002 与 Trace |
| DEV-05 | M06/M07/M03 命令与校验提交 | P0 | DEV-02/03/04 | 原子编辑、守卫、Finding、Revision |
| DEV-06 | M02/M09 项目、模型、任务、基线 API | P0 | DEV-02/05 | 首批 16 operationId |
| DEV-07 | P01/P02 前端 | P0 | DEV-00/06 | 项目/模型主路径 |
| DEV-08 | P03/X6/OPL/Finding 前端 | P0 | DEV-05/06/07 | 五区最小闭环 |
| DEV-09 | 集成、E2E、打包与恢复 smoke | P0 | DEV-01~08 | 可安装候选与证据报告 |

### 5.1 实施顺序

1. DEV-00；
2. DEV-01 与 DEV-02；
3. DEV-03 -> DEV-04 -> DEV-05；
4. DEV-06；
5. DEV-07 -> DEV-08；
6. DEV-09。

同一时刻只启动一个有明确验收的开发包。DEV-07 可以在 DEV-06 的 frozen OpenAPI mock 上提前，但真实联调仍依赖 DEV-06。

### 5.2 完整画布增量开发包

| 包 | 范围 | 优先级 | 依赖 | 交付结果 |
| --- | --- | --- | --- | --- |
| DEV-CANVAS-00 | State/Fact/Capability Option 机器契约扩展 | P1-前置 | DEV-01/03/05/06 | OpenAPI、Schema、generated client 和 command handler 边界 |
| DEV-CANVAS-01 | State 端到端 | P1 | DEV-CANVAS-00、DEV-04/08 | State 创建/更新/显示/端点/OPL/Trace |
| DEV-CANVAS-02 | 16 类 Procedural Link | P1 | DEV-CANVAS-00/01 | 过程关系语义、符号和候选闭环 |
| DEV-CANVAS-03 | 8 类 Control Link 组合 | P1 | DEV-CANVAS-02 | Event/Condition 组合和输入 segment 注记 |
| DEV-CANVAS-04 | 10 类 Structural Link | P1 | DEV-CANVAS-00/01 | Tagged、fundamental fan、State-specified 结构关系 |
| DEV-CANVAS-05 | 完整规则、OPL、Trace 和 golden | P1-门槛 | DEV-CANVAS-01~04 | [独立规格](../../specs/opm-dev-canvas-05-opl-trace-golden-task-spec.md)；同版本依赖闭包与 16/8/10 自动化证据 |
| DEV-CANVAS-06 | 工具链集成、视觉、E2E、性能与分批启用 | P1-门槛 | DEV-CANVAS-05 | [独立规格](../../specs/opm-dev-canvas-06-toolchain-release-task-spec.md)；完整画布发布候选和证据报告 |

实施顺序为 `DEV-CANVAS-00 -> 01 -> 02 -> 03`，`04` 可在 `02` 后与 `03` 独立开发，随后统一进入 `05 -> 06`。关系组件可提前开发，但在 `05` 完成前生产工具栏保持 feature disabled。

### 5.3 DEV-CANVAS-06 Golden Authoring 子包

| 包 | 范围 | 依赖 | 直接开发入口 |
| --- | --- | --- | --- |
| `GOLDEN-AUTHORING-03A` | release-only Materializer、Report/Marker、semantic verifier | Capture Plan READY | Materializer implementation spec/checklist |
| `GOLDEN-AUTHORING-02B` | Common Visual Fixture Schema consumer、8个完整Visual、32个E2E asset、五类index/8类UI step、两份source mirror、43文件Catalog/verifier和Planner join | READY Handoff active binding、共享Node JCS/vector | [规格](../../specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-common-visual-fixture-contract-implementation-checklist.md) |
| `GOLDEN-AUTHORING-03C` | release-only Common Visual SQLite V1逐列物化、活动Adapter Request `0.2`受控Java/Profile输入、Runtime source/staged身份、derived JDK/Planner env、Adapter Test Input Bundle `0.1`及原子Builder/Verifier、其余三份adapter机器契约、Clone Result/Runtime Ready、Base/Clone/Web launch mode、静态ESM/144次callback、8 base/144 clone、attestation与独立one-shot fault port | 02B checklist完整通过、exact Runtime JAR、Adapter/Fault、Clone/Web Runtime、Adapter受控输入、测试Builder及Runtime/JDK闭包规格 | [规格](../../specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-common-visual-materializer-implementation-checklist.md) |
| `GOLDEN-AUTHORING-03B` | fixed environment、Common Factory、candidate、Authoring Report 0.2 | 03A `--require-materialized` + 02B/03C checklist + Golden Environment 0.2 Schema/verifier | Candidate Author implementation spec/checklist |
| `GOLDEN-AUTHORING-04` | Approval Record 0.2、approve/verifier、immutable Publisher | 03B READY candidate + 外部审批 | Approval/Publisher implementation spec/checklist |
| `GOLDEN-AUTHORING-05` | Visual Manifest 0.2 builder/verifier | 04 approved version verified + Visual/E2E 输入修正规格 | Visual Manifest 0.2 implementation spec/checklist |
| `GOLDEN-AUTHORING-06` | 真实 INITIAL/SUPERSEDE authoring evidence | 03A~05 工具实现通过 + clean release 输入 | DEV-CANVAS-06 GATE-06-03 执行契约 |

03A~05 的代码完成、06 的真实证据、GATE-06-03 READY、Candidate、Activation 和 ISO 状态必须分别记录，禁止从前一状态推导后一状态。Versioned Handoff source`37c5412a9c12...`、`clean-37c5412a9c12`和production预验已形成；Fixed Handoff Postverify tool、READY Report和live guard已闭合，fixed SHA为`4088e449...`。旧合并builder规格只保留Common Fixture历史快照。

### 5.4 DEV-CANVAS-06 独立执行契约

| 包 | 冻结范围 | 前置依赖 | 直接开发入口 |
| --- | --- | --- | --- |
| `DEV-CANVAS-06-E2E-MANIFEST-01-HISTORICAL` | 历史E2E Manifest `0.1` CLI与既有输入重建证据，只读兼容审计，不再作为活动producer/verifier目标 | 不得进入活动Report/Gate | [历史规格](../../specs/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-checklist.md) |
| `DEV-CANVAS-06-E2E-MANIFEST-02` | 活动Manifest `0.2` producer/verifier、clean source五资产Source Set、source-root外fresh只读Staging、source/staging/final三方join、四driver、exact Runtime JAR/Web、`178+16`、Common `7/9`、Report `137/57`和单一final root | exact clean base、活动Common Driver source、READY Intake/Handoff；Build为`READY_FOR_BUILD/NOT_STARTED` | [规格](../../specs/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-checklist.md) |
| `DEV-CANVAS-06-FAMILY-PRODUCTION-INPUT-REBUILD` | base SHA、37项source delta（`4 M+33 A`，含两份固定测试资产和GATE evidence generator）、GATE-05-01显式TAP命令/Report command、集成测试absolute directories exact断言、三个helper的exact Intake -> Candidate Handoff解析、双clean worktree、版本化Bundle/Handoff/Intake/Common/Manifest、固定Handoff原子切换和production双重验 | source `a36a7f1fd709...`、Bundle/Handoff/Intake、Common/Manifest和版本根已形成；固定Handoff因Candidate直接ref仍为`reports/**`而失败并回滚，历史结果由后继修正规格承接 | [规格](../../specs/opm-dev-canvas-06-family-production-input-rebuild-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-family-production-input-rebuild-bugfix-checklist.md) |
| `DEV-CANVAS-06-VERSIONED-HANDOFF-REPORT-REF-CLOSURE` | base `a36a7f1fd709...`、source `37c5412a9c12...`、`14=12 M+2 A`、唯一direct ref owner、显式trust mode、12个版本化report文件和版本根布局 | source、Node 24定向`13/13`、`clean-37c5412a9c12`、READY Handoff/Intake、Manifest与production预验已完成；fixed switch转由postverify后继规格 | [规格](../../specs/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-FIXED-HANDOFF-POSTVERIFY-CLOSURE` | fixed/versioned/Manifest copy/production verifier四方join、Report`0.1`、tool/subject source分离、`4=1 M+3 A`、原子Report、backup恢复和live guard | tool source`2f2d0f9...`、READY Report、fixed switch与live guard已执行；fixed SHA为`4088e449...`且无pending marker | [规格](../../specs/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-E2E-RUNNER-01` | production/controlled CLI、唯一`runControlledLifecycleSession()`、Family/Common物化、Runtime/Web READY与cleanup、D10B、388 attempt artifact、Report `0.2`聚合与只读verifier | Stage A lifecycle设计已冻结；接口、A commit、controlled D10B和production Runner尚未实现 | [规格](../../specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md) / [Lifecycle规格](../../specs/opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-task-spec.md) / [Fault Launcher设计](opm-dev-canvas-06-e2e-fault-launcher-design.md) / [checklist](../checklists/opm-dev-canvas-06-e2e-runner-implementation-checklist.md) |
| `DEV-CANVAS-06-E2E-COMMON-DRIVER-01` | 16 Common case、selector、API/error、事务与REOPEN；production由Runner构造CommonCaseExecution和五参数对象 | Common Driver `v1.11`；attached Page首个Projection绑定baseline，一次性client按DIRECT/REQUEST_MUTATION分支且只经同源HTTP/route并写API Exchange；Source Set活动目标`0.2/24` | [设计](opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md) / [Lifecycle规格](../../specs/opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-task-spec.md) / [Precondition规格](../../specs/opm-dev-canvas-06-common-precondition-machine-contract-closure-bugfix-task-spec.md) |
| `DEV-CANVAS-06-E2E-FAMILY-DRIVER-01` | `178=33 PROC+35 CTRL+110 STRUCT`五方join、真实UI/API、transaction/reopen和证据 | 设计`v1.2`已冻结；三Driver占位；Stage R先完成API/Runtime contract再实现 | [设计](opm-dev-canvas-06-e2e-family-driver-execution-design.md) / [规格](../../specs/opm-dev-canvas-06-e2e-family-driver-implementation-task-spec.md) / [错误码闭包](../../specs/opm-dev-canvas-06-family-error-code-mapping-source-closure-bugfix-task-spec.md) |
| `DEV-CANVAS-06-E2E-CONTROLLED-INVOCATION-01` | Context `0.1`、194/388调度、四Driver exact dispatch、Family/Common CaseExecution、Runner-owned RUN_SETUP identity binder、五参数调用、一次性同源client、API Exchange、Browser bridge及Source Set `0.2/24` | `DESIGN_FROZEN/IMPLEMENTATION_IN_PROGRESS`；后继API Exchange/Artifact Index闭包后Stage R总计`29=27 M+2 A` | [规格](../../specs/opm-dev-canvas-06-family-controlled-invocation-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-family-controlled-invocation-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-COMMON-E2E-INPUT-REBUILD-01` | 只读消费exact clean Common factory，原子生成活动Catalog `0.2.0`、32个BASE/INPUT、两份source mirror与全部raw ref，Verifier独立按同一factory重算 | 当前43文件root状态为`IMPLEMENTED/COMMON_ROOT_SELF_VERIFIED`；统一production链完成前不能单独供活动Manifest消费 | [规格](../../specs/opm-dev-canvas-06-common-e2e-input-rebuild-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-common-e2e-input-rebuild-implementation-checklist.md) |
| `OPM-BOOTSTRAP-BUILD-CLOSURE` | 同源external classic Bootstrap、Runtime `227 bytes/c74cff...`和四字段wire、入口前执行、Node 22根build、派生产物/Git闭包；`7=3 M+3 A+1 D`嵌入统一Source commit | 设计`FROZEN_FOR_IMPLEMENTATION`；实现`NOT_STARTED`；统一Source build前置仍BLOCKED | [规格](../../specs/opm-bootstrap-build-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-bootstrap-build-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-UNIFIED-SOURCE-PRODUCTION-INPUT-REBUILD` | `23=11 M+11 A+1 D`、`daf383df...` base、新clean unified commit、Bootstrap Build Closure、Handoff `0.2`三artifact、READY Intake、Runtime/Web/Common同源重建、四driver及Profile五文件Source Set固定路径、显式TAP、Web tree公式、三方join、原子安装和固定Quarantine Marker `0.1` sidecar；不生成Profile Staging | 设计`FROZEN_FOR_IMPLEMENTATION`；实现`READY_FOR_BUILD/NOT_STARTED`；production build先等待Bootstrap Closure实现，生产重建`NOT_RUN`；失败根恢复等待独立规格/operator授权 | [规格](../../specs/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-checklist.md) |
| `DEV-CANVAS-06-MANIFEST-V02-INTEGRATED-SOURCE-REBUILD` | `30f7...`base、`39`项owner、`8=3 M+5 A` | source commit`e598b305...`已实现；内嵌installed root被clean/root守卫拒绝；production由后继包承接 | [规格](../../specs/opm-dev-canvas-06-manifest-v02-integrated-source-rebuild-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-manifest-v02-integrated-source-rebuild-bugfix-checklist.md) |
| `DEV-CANVAS-06-MANIFEST-V02-EXTERNAL-RELEASE-ORCHESTRATOR` | 历史`3=1 M+2 A`，未授权修改统一Builder/Verifier | `SUPERSEDED/DO_NOT_IMPLEMENT` | [历史规格](../../specs/opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-task-spec.md) / [历史checklist](../checklists/opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-UNIFIED-EXTERNAL-RELEASE-STORE-MODE` | `e598...`base、`9=7 M+2 A`职责子集、41项owner、统一Builder/Verifier external mode、严格source-clean、external quarantine、新进程Unified Verifier及Manifest双Verifier | 设计`FROZEN`；独立source包`SUPERSEDED`；实现嵌入17项集成Source且`NOT_STARTED` | [规格](../../specs/opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-COMMON-EXTERNAL-INTEGRATED-SOURCE` | `e598... -> 9048bb3...`的`17=14 M+3 A`只作为final chain origin intake；既有194-case Manifest只证明input build | origin=`READY/ORIGIN_BUILD_VERIFIED`；不得直接作为最终Manifest/Runner/Report source | [历史origin规格](../../specs/opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-FINAL-PRODUCTION-SOURCE-CHAIN` | 从`9048bb3...`连续重建C/S/A/R；stage=`20/2/7/29`，累计为`48=36 M+12 A`，双target及最终六方join | Service及测试不进入24项Source Set；C/S/A已形成；R实现中，真实194/388尚未执行 | [规格](../../specs/opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-final-production-source-chain-closure-bugfix-checklist.md) |
| `DEV-CANVAS-06-E2E-FAULT-LAUNCHER-01` | 三个故障case INITIAL的test-only launcher/port；A=`7=5 M+2 A`，两个Runner owner形成受控调用接口，discovery/source guard闭合，两个新增文件只消费owner；Bundle/Descriptor/D10语义不变 | C/S已形成，A待重写；controlled Playwright=`NOT_RUN` | [实现规格](../../specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md) / [Stage A修正规格](../../specs/opm-dev-canvas-06-stage-a-release-discovery-and-source-guard-closure-bugfix-task-spec.md) / [设计](opm-dev-canvas-06-e2e-fault-launcher-design.md) / [implementation checklist](../checklists/opm-dev-canvas-06-e2e-fault-launcher-implementation-checklist.md) |
| `DEV-CANVAS-06-STAGE-A-CONTROLLED-LIFECYCLE` | `runControlledLifecycleSession()`四参数/返回值/错误码；六方法sink、Page网络事件、`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED` Browser proof、Runtime/Web、12-cycle、D10B writer和cleanup唯一owner | `FROZEN_FOR_IMPLEMENTATION`；接口未实现，A commit=`FORBIDDEN` | [规格](../../specs/opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-stage-a-controlled-lifecycle-interface-closure-bugfix-checklist.md) |
| `GOLDEN-AUTHORING-03A-CLEANUP` | `verifyPendingQuarantine()`内存attestation、residual原子移动、Marker原子写入、完整selected verifier唯一四阶段顺序 | Materializer `v1.5`、Verifier Catalog `v1.1`、63/63实现证据 | [规格](../../specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md) / [checklist](../checklists/opm-dev-canvas-06-golden-fixture-materializer-implementation-checklist.md) |
| `DEV-CANVAS-06-RECOVERY-RUNNER-01` | 两份immutable template、历史五份`0.1` Schema、活动Manifest `0.2`、Reopen Catalog/API Request Artifact/Launch Request/Launch Proof、Projection Digest `0.1`、factory三接口、独立helper JAR、21表SQLite映射、test-only HTTP JCS guard、七SQLite hook、四forced-stop reachpoint、PropertiesLauncher、32-byte challenge、PID/nonce/proof和artifact index | Projection Digest及Launch Schema正反例、READY Intake/Handoff、exact Runtime JAR和disabled production gate | [规格](../../specs/opm-dev-canvas-06-recovery-runner-implementation-task-spec.md) / [Recovery设计](opm-dev-canvas-06-recovery-execution-design.md) / [Projection Digest设计](opm-dev-canvas-06-projection-digest-closure-design.md) / [checklist](../checklists/opm-dev-canvas-06-recovery-runner-implementation-checklist.md) |

活动E2E Manifest v02、Common Driver、Common输入重建、统一Source、External Store、Family/Versioned Handoff/Fixed Postverify、Runner、Fault Launcher和03A按各自规格执行。`9048bb3...`已修复External Store实际重建并生成194-case Manifest，但它只作为新链origin；旧Fault三commit只读保留。后继必须依次形成C/S/A/R，2A controlled输入与evidence绑定A，最终production Handoff/Intake/Runtime/Web/Common/Manifest/Report全部绑定R。Preflight Report字段、唯一`--run-controlled`、Invocation Context、D10A/D10B与两文件evidence事务不变。任一stage、origin Manifest或局部测试完成都不能单独关闭`GATE-06-03/05`或生成Candidate、Activation、Capability/ISO结论。

## 6. 开发包完成定义

### 6.1 DEV-00

1. Maven Wrapper、多模块、Node 22 lockfile、Vite/Vue strict 工程存在；
2. 根命令可执行 backend verify、frontend lint/typecheck/test/build、contract validate；
3. Spring 健康检查仅绑定 127.0.0.1；
4. Vite `/api/v1` 代理同源；
5. 未引入业务占位事实或远程服务。

### 6.2 DEV-01/02

1. 三 Schema meta/example 校验自动化；
2. Profile/Rule/Grammar/Symbol exact version+digest 加载；
3. V1 创建 20 表、外键通过、不可变触发器生效；
4. Repository 不把 JDBC record 暴露为领域对象；
5. 原子事务和 migration 失败进入明确恢复态。

### 6.3 DEV-03/04/05

1. 核心不变量和 Capability/Rule 阻断通过单元测试；
2. SD、Element、Fact、Occurrence 身份闭合；
3. G-OPL-001/002 字节、token、Trace、digest 可重复；
4. 同一次提交持久化 Semantic/Text/Trace/Validation/Revision/Operation；
5. revision/idempotency/profile/rule/read-only 守卫具有失败测试；
6. 任一阶段失败无部分 committed revision。

### 6.4 DEV-06

1. OpenAPI 16 个 operationId 全部可调用；
2. 5 个写操作验证 Host/Origin/session；
3. ErrorDetail、HTTP 状态和业务状态一致；
4. Task `202/query/SSE/requery` 闭合；
5. Baseline 无阻断才创建且不可变。

### 6.5 DEV-07/08

1. P01 -> OV01 -> P02 -> OV02 -> P03 E2E 通过；
2. P03 五区、Object/Process/Consumption 和 OPL 实际联调；
3. viewport 不产生 Revision，semantic zoom 产生 Revision；
4. blocked/failed/conflict/save-failed/readonly 文案与恢复动作正确；
5. 图文/Finding 稳定 ID 定位；
6. 1440x900、1280x800、390x844 无 P0 重叠/全局溢出。

### 6.6 DEV-09

1. `opm-test-strategy.md` P0 自动化门槛通过；
2. clean machine 安装、启动、健康、浏览器打开、退出通过；
3. 新建 -> 建模 -> OPL -> 校验 -> 基线 -> 重启重开闭环通过；
4. 数据库忙、写失败、强停和恢复 smoke 通过；
5. 报告明确“ISO 证据未就绪”，产品不显示符合。

### 6.7 DEV-CANVAS-00

1. 为 `API-EDT-001` 冻结结构化 `CommandCapabilityOption`，包含 query/option ID、规范端点、Control `capability_ref`、`base_fact_capability_ref`、字段、带 `min/max/atomic_group_id` 的 modifier、symbol/template/rule 引用、reason、删除影响摘要/token 和失效 Revision；
2. 为 `API-EDT-002` 增加 `CREATE_STATE/UPDATE_STATE/UPDATE_FACT`，并冻结 `CREATE_FACT` 完整 payload；
3. `CREATE_ELEMENT` 明确拒绝 State；`DELETE_CONSTRUCT` 支持 State/Fact impact token；
4. OpenAPI validate、generated TypeScript/Java DTO diff、正反 contract test 通过；
5. 旧 P0 command payload 保持兼容，破坏变更通过新 API/schema 版本处理；
6. 本包不启用任何新生产工具。

回滚：关闭完整画布 Capability enablement gate 并回退 generated client/server 版本；不得写入新命令产生的数据。若已发布 schema 版本，不修改历史契约文件，发布兼容修订版本。

### 6.8 DEV-CANVAS-01

1. State 只能归属合法 Object/Attribute，Process State 在 ISO Profile 被阻断；
2. 创建、改名、角色、顺序、删除影响、显式/抑制和展开/折叠均产生正确 Revision；普通内部坐标只改 Layout；
3. Initial/Default/Final 组合由 Profile/Rule 决定，Symbol 组件与 golden 一致；
4. State-specified endpoint 不复制为 Element，owner mismatch 有稳定错误；
5. State -> OPL -> Trace -> 重开 Projection E2E 通过。

回滚：关闭 State 创建/编辑工具，历史 State 保持只读可渲染；不删除已提交 State。

### 6.9 DEV-CANVAS-02

1. 16 个 Procedural Capability 均有 descriptor、端点正反例、command、Rule、Projection 和组件测试；
2. Effect 输入/输出 State 角色、Invocation/Self-invocation 和时间异常语义不被简化；
3. 拖线顺序反转仍由服务器返回规范端点；多候选不自动提交；
4. 本包完成语义和符号集成，但生产启用仍受 DEV-CANVAS-05 的文本证据守卫。

回滚：按 Capability enablement gate 关闭新建/更新，保留已存在 Fact 的只读投影与导出阻断说明。

### 6.10 DEV-CANVAS-03

1. 8 个 Control Capability 覆盖 Event/Condition、Transforming/Enabling 和 State/non-State，并逐一覆盖每个允许的基础关系变体；
2. `e/c` 位于规范 Process 输入端，Effect 输出段不能添加 Control；
3. Control 冻结为基础 Fact 上唯一、成对的 `control.capability=<CAP-ISO-CTRL-001~008>` 与 `control.segment=PROCESS_INPUT`，不生成重叠 edge、独立 CONTROL Fact 或重复 SemanticCondition；
4. `CREATE_FACT/UPDATE_FACT`、Revision JSON reader/writer、Profile ModifierSchema、X6、OPL/Trace 使用同一 pair，基础 fact_id/Capability 保持不变；
5. 缺项、重复项、非法 segment、Result/Effect 输出段、Control/base 不匹配和 Event+Condition 双组均有稳定反例；
6. SQLite V1 无 DDL 变更；版本化 Revision JSON Schema、roundtrip、原子失败和旧 Revision 兼容测试通过；
7. wait/skip/trigger 行为与 Rule/OPL/Trace 一致，非法组合有反例。

回滚：关闭 Control modifier 编辑入口；移除候选 pair 不删除基础 Fact，已有组合保持只读投影并阻断不兼容修改。

### 6.11 DEV-CANVAS-04

1. 10 个 Structural Capability 均有端点、marker、label slot、route 和模板引用；
2. Bidirectional 两标签/两句、Reciprocal 单标签或无标签/互惠句闭合；
3. Fundamental fan 是单一 Fact，支持 refinee 增删和 stable Fact ID；
4. Aggregation/Exhibition/Generalization 完整性标记正确，Classification 不显示完整性标记；
5. 默认 Object-Process structural 被阻断，Exhibition 例外按 Endpoint Schema 开放；
6. State-specified Characterization 只允许 Specialized Object -> 继承 Attribute 的 Value State，State-specified Tagged 只允许 Object/owned Object State。

回滚：按 Capability 关闭结构关系创建/更新；已存在 fan 保持只读和身份不变。

### 6.12 DEV-CANVAS-05

范围只包含版本化 Grammar/Template/Rule、Control/Structural concrete OPL、确定性 SentencePlan、Token/Trace、golden manifest 和原子文本提交；不包含 UI、视觉、E2E、性能或生产启用。

1. `G-OPL-PROC-001~016` 的既有主集合及全部受控变体通过；
2. Control 按 8 个主 Capability 展开 `20` 个允许基础 Fact PASS case，Result/State Result、Effect 输出段、pair 缺失/重复/不匹配及 Event+Condition 均稳定阻断；
3. Structural 不是 10 个示例，而是覆盖全部合法方向、State、tag/null-tag、`1/2/3` fan 和 complete/incomplete 变体；Bidirectional 同 Fact 两句，Reciprocal 同 Fact 一句；
4. `14.2.4.1.4` 仅用于 Link 语义强度，`A.3.1` 仅用于 EBNF 解析，跨 Sentence 顺序按版本化产品 rank 执行；不得引用不存在的 Clause 15；
5. 每个 PASS fixture 同时断言 Semantic/Projection/Symbol/concrete Template/OPL/Token/Trace/Rule/digest，Token 使用 UTF-8 byte 半开区间并覆盖 Sentence 全 byte；
6. 缺模板、规则、符号、Trace 或 digest mismatch 均阻断提交；
7. 同 Revision 至少连续重放两次，artifact bytes、Token/Trace 顺序和 SHA-256 一致，失败无 partial committed revision；
8. 完成本包后 Capability gate 仍关闭，交由 DEV-CANVAS-06 验证后分批启用。

回滚：回退到上一组 ACTIVE Profile/Rule/Grammar/Symbol 绑定；历史 Revision 继续按原 digest 解析，不覆盖资产。

### 6.13 DEV-CANVAS-06

范围只包含工具链集成、视觉、E2E、性能、恢复、Capability gate 和发布证据；不得新增语义或补写 DEV-CANVAS-05 缺失资产。

1. 固定工具链、State 快捷工具、关系 split-button、搜索分组目录和检查器完整；
2. 16/8/10 逐 Capability 只在证据通过后启用，禁用项原因可访问；
3. 1440x900、1280x800、390x844 的符号、菜单、长标签、面板和错误状态无重叠/全局溢出；
4. `25%/100%/400%` visual golden、canvas pixel、主路径/阻断/conflict/readonly E2E 通过；
5. 大图 fixture 和固定测试环境的性能报告通过下表及独立任务规格门槛；
6. 发布报告明确 ISO 证据状态，不因完整工具菜单自动声明符合。
7. Family E2E Materializer只从Manifest锁定的Family Fixture Identity Catalog读取Project identity，178个Family base ref当前去重为2；Model/Context/base Revision/sequence与fixture深度一致，parent按fixture字段存在时取字符串、缺失时Catalog显式`null`归一，禁止SHA/路径/case派生Project。
8. 每个attempt先原子写入并验证`fault-plan.json`，其余producer只从该文件读取`attempt_ordinal`；目录名、循环下标和执行顺序不得成为identity来源。
9. Common 16 case按Common Driver `v1.11`执行；Runner先在attached Page绑定setup baseline，再构造完整CommonCaseExecution；bridge只转交五参数对象，precondition client按DIRECT/REQUEST_MUTATION分支至多一次并写API Exchange。
10. Family 178 case按Family Driver `v1.6`执行；Runner按driver_id exact dispatch、构造完整FamilyCaseExecution，并在Driver调用前完成SETUP identity唯一提取与证据绑定。Stage R必须先完成API/Runtime `5 M`，再实现Context/bridge/Driver。
11. production Context必须恰含Manifest原序194 case、每case attempt 1后2的388项；Source Set必须为0.2/24且bridge为第20项。非388、bridge未入aggregate、Node HTTP/跨origin client或REOPEN再次调用Driver均阻断。
11. controlled bundle只证明上游trust；exact Runtime JAR、production Web dist、Profile和四driver只从活动Manifest final root复制到fresh attempt，INITIAL/REOPEN进程全新且复用同一storage。

| 性能场景 | DEV-CANVAS-06 门槛 |
| --- | --- |
| 普通编辑反馈 | P95 `<=100 ms` |
| 语义变更到 OPL 可见 | P95 `<=500 ms` |
| 300 可见结点/600 关系 | frame P95 `<=32 ms`，选择 P95 `<=100 ms` |
| 1,000 construct/2,000 edge | frame P95 `<=50 ms`，选择 P95 `<=200 ms`，零 OOM |
| 10,000 结点模型 | 保存/快照/全量校验每次分别 `<=10/15/60 s`，各 5 次零失败 |

交互指标至少预热 5 次、采样 100 次；frame 连续采样至少 30 秒。使用 release build、Java 21、Node 22、lockfile 对应 Chromium、至少 8 逻辑 CPU/16 GB RAM/SSD，报告 exact 版本、硬件、冷热口径、P50/P95/Max 和失败率。这些是产品阈值，不是 ISO 要求。

回滚：整体或按 Capability 关闭完整画布 enablement gate，回到 P0 工具链；模型数据与历史 Revision 不回退。

## 7. 最小数据依赖

| 包 | 数据依赖 |
| --- | --- |
| DEV-01 | Profile、Rule、Grammar、Symbol、Schema、digest |
| DEV-02 | Project/Model/Revision/Head/Package/Operation/Task/index V1 |
| DEV-03 | Element、State、Fact、Endpoint、Context、Occurrence、Layout |
| DEV-04 | SentencePlan、Token、Artifact、Trace、generation binding |
| DEV-05 | Command、base revision、idempotency、Finding、Validation Summary |
| DEV-06 | OpenAPI request/result/error/task DTO |
| DEV-07/08 | generated client、Query/Command projection、view state |
| DEV-CANVAS-00 | structured capability option、State/Fact command union、impact token |
| DEV-CANVAS-01 | StateAssertion、State Occurrence、State role/visibility/trace |
| DEV-CANVAS-02/03 | Procedural Fact、Control Modifier pair、独立 SemanticCondition、segment role、duration |
| DEV-CANVAS-04 | Tagged labels、fundamental fan、collection completeness |
| DEV-CANVAS-05 | concrete Template、完整 Symbol/Rule/Grammar binding、Token/Trace、golden manifest/replay |
| DEV-CANVAS-06 | enablement manifest、视觉/E2E fixture、Family Fixture Identity Catalog、Fault Plan attempt identity、300/600、1,000/2,000 和 10,000 结点性能 fixture |

代表 fixture 统一使用 `docs/contracts/examples`；实现测试可以复制到 `tests/fixtures`，但必须校验与契约源摘要一致，禁止形成分叉样例。

## 8. 页面与接口执行清单

| 范围 | operationId |
| --- | --- |
| P01 | API-PRJ-001/003 |
| P02 | API-PRJ-002/006/007/009 |
| P03 bootstrap | API-CTX-001/002 |
| P03 command | API-EDT-001/002 |
| P03 State/完整关系 | API-EDT-001/002 的版本化扩展，不新增临时 operationId |
| P03 text | API-TXT-001 |
| P03 validation | API-VAL-001 |
| P03 versions/baseline | API-VER-001/004 |
| P03 task | API-TSK-001/004 |

application API 契约中的其余 operationId 仍保留设计编号，但不允许临时实现未进入 OpenAPI 的 HTTP 端点。

## 9. 联调前置与验收

### 9.1 联调前置

1. OpenAPI validate/generate diff 绿色；
2. 三 Schema 和三样例绿色；
3. SQLite V1 migration test 绿色；
4. G-OPL-001/002 绿色；
5. 后端 16 operationId contract test 绿色；
6. 前端 mock DTO 与 generated client 无差异；
7. 测试项目库和资产目录完全隔离。
8. 进入 DEV-CANVAS-01 前，结构化 Capability Option、State/Fact command union 和 generated client 已由 DEV-CANVAS-00 验证；
9. 进入完整关系生产启用前，对应 Capability 的 Symbol/Rule/Grammar/golden 依赖闭包均为可解析精确版本。

### 9.2 P0 验收路径

```text
创建项目
-> 创建 ISO 草案模型和根 SD
-> 创建 Object/Process
-> 创建 Consumption
-> 原子生成 Revision + OPL + Trace + Validation Summary
-> Finding/OPL/OPD 双向定位
-> 视口缩放不改 Revision
-> 全量校验
-> 创建本地只读 Baseline
-> 基于 Baseline 创建新 Draft
-> 重启后打开最近耐久 Draft
```

任一箭头没有真实 API、SQLite 和浏览器证据，DEV-09 不得完成。

### 9.3 完整画布验收路径

```text
选择 Object -> 创建 State -> 设置 State role
-> 以 State/Object/Process 创建 Procedural Link
-> 添加合法 Event/Condition 组合
-> 创建 Tagged 与 Fundamental Structural fan
-> 原子生成 Revision + 完整 OPL + Trace + Validation Summary
-> 重开同 Revision，符号/标签/fan/State/文本一致
-> 逐项验证 blocked/conflict/readonly/asset-missing
-> 桌面/移动视觉与大图性能证据通过
```

`DEV-CANVAS-05/06` 的独立规格、checklist 和设计输入已冻结；是否可启动仍必须在任务开始时核验前序包证据。任何关系没有对应 Symbol/Rule/Grammar/golden 证据时只允许组件开发，不能在生产菜单启用。

## 10. 回滚方案

| 层 | 回滚 |
| --- | --- |
| 前端 | 回退静态资产版本；不改模型数据 |
| API | 保持 `/api/v1` 兼容；破坏变更不进入同一版本 |
| 应用 | 回退到最后可读 storage schema 的安装包 |
| SQLite | 升级前一致性备份；已发布 Flyway 不修改，不执行破坏性 down |
| Profile/Rule/Grammar | 历史精确版本和 digest 保留；不覆盖 Baseline 绑定 |
| 业务命令 | 原子失败不移动 Draft Head；用户可从最近 Revision 恢复 |

DEV-00~09 和 DEV-CANVAS-00~06 每包必须在自己的 task spec 中写更具体的代码回滚和数据兼容步骤。

## 11. 开发就绪矩阵

| 门槛 | 设计状态 | 实施/证据状态 | 证据 |
| --- | --- | --- | --- |
| 全量设计冻结与开发门 | `FROZEN` | `READY_FOR_DEVELOPMENT` | `opm-design-freeze-baseline.md` |
| 需求范围/非目标 | `FROZEN_INCLUDED` | 不适用 | 主需求、冻结基线 DFR/DFD |
| 页面/状态/字段/组件 | `FROZEN_INCLUDED` | 按开发包验证 | 四份 workbench 设计 |
| 原型验收 | `FROZEN_INCLUDED` | 设计原型 PASS | `opm-prototype-acceptance-report.md` |
| 技术栈/运行拓扑/浏览器 | `FROZEN_INCLUDED` | 真实发布环境待验证 | ARC-007/008/009、冻结基线第 3 章 |
| 模块/数据所有权 | `FROZEN_INCLUDED` | 按模块测试 | M01-M12 模块设计 |
| 核心/完整关系逻辑字段 | `FROZEN_INCLUDED` | 机器资产按 DEV-CANVAS-00/05 | MS/PS/RS、Relation/Marker/Label Slot |
| P0 HTTP 与完整画布 0.2 目标 | `FROZEN_INCLUDED` | 0.2 发布/生成/contract test 待 DEV-CANVAS-00 | OpenAPI + API 契约 + 冻结基线第 6 章 |
| Revision 0.2 目标与 SQLite V1 | `FROZEN_INCLUDED` | 0.2 reader/writer/roundtrip 待 DEV-CANVAS-00/03 | 持久化、物理设计、V1 |
| 完整画布专题与 16/8/10 | `FROZEN_INCLUDED` | 按 DEV-CANVAS-01~04 | 工具链设计 + handoff |
| concrete OPL/precedence/Token/Trace/golden | `FROZEN_INCLUDED` | 按 GATE-05-01~06 报告 | 符号文本契约 + DEV-CANVAS-05 |
| 视觉/E2E/性能/release | `FROZEN_INCLUDED` | `9048bb3...`origin及194-case Manifest已形成，C/S已形成，A待七路径重写，R未创建；旧Fault链不可消费，controlled Playwright和真实`194/388`未执行；最终external input/Manifest/Report/Gate均为`NOT_CREATED/NOT_RUN` | 测试策略 + DEV-CANVAS-06 + Final Production Source Chain + Manifest v02/Common/Runner/Fault Launcher规格 |
| Recovery | `DFR-018=FROZEN_INCLUDED` | Reopen Catalog、Manifest `0.2`、HTTP JCS、Launch Request/Proof与Projection Digest `0.1`已冻结；`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED` | Recovery Execution `v1.5` + Projection Digest Closure `v1.0/0.1` + runner规格 |
| Golden Authoring/Materializer | `DFR-021/022=FROZEN_INCLUDED` | 03A实现已闭环，production 130项待执行；Common Visual Fixture、index/UI/source、活动Adapter Request `0.2`受控Java/Profile输入、Runtime source/staged身份、derived JDK/Planner env、Adapter Test Input Bundle `0.1`及其fresh 5/43/1242/72/144闭包、其余三份adapter Schema、Clone Result/Runtime Ready、四种launch mode、动态端口/READY/关闭协议、静态ESM/144次callback和独立one-shot fault实现边界已冻结；测试Builder/Verifier实现未接纳，Node adapter consumer、fault/8 base/144 clone验收未完成，03B继续等待；04/05待实现；06未执行 | Golden Authoring v1.4 + Visual Common Materialization v1.9 + 03C Adapter/Fault、Clone/Web Runtime、Adapter受控输入、测试Builder及Runtime/JDK闭包 + Materializer v1.5 + Verifier Catalog v1.1 |
| 开发拆包/DoD/回滚 | `FROZEN_INCLUDED` | 每包重新核验依赖 | 本文 DEV-00~09、DEV-CANVAS-00~06 |
| P04-P06 生产实现 | `FROZEN_DEFERRED` | `NOT_RUN` | DFD-001 |
| 中文专属能力、完整 ISO 资产/符合性及其他延期 | `FROZEN_DEFERRED` | `EVIDENCE_MISSING` | DFD-002~010 |

结论：当前`32`项责任为`22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked/unresolved/cross_document_conflict=0`，全局开发门为`READY_FOR_DEVELOPMENT`。可以按独立规格恢复Recovery `RECOVERY-IMPL-01`并继续其他已解锁切片；任何实现、测试、production Gate、Capability或ISO证据状态均未因此提升。

## 12. 风险与遗留项

1. `.harness/repo-profile.md` 仍把仓库描述为 `harness-engineering` 文档模板仓库；本轮禁止修改 `.harness/**`。首个代码任务必须在 task spec 中显式允许 `apps/services/packages/migrations/tests`，并单独安排治理修正；
2. Flyway SQLite 支持模块和 JDBC 准确版本尚未用工程 PoC 验证；DEV-00/02 必须形成证据，失败时走 ADR；
3. 代表性 Profile/Rule 不能覆盖完整 ISO 行为，UI 必须持续显示“证据缺失/无法判断”；
4. OpenAPI 只覆盖首批 16 operationId，后续能力必须从 application API 契约版本化扩展；
5. 原型固定数据不能证明性能、事务和恢复；DEV-09 承接真实证据。
6. OpenAPI 和 Revision 0.1 已出现完整画布关键字段，但 0.2 发布、generated client/handler、兼容 reader 和 roundtrip 仍是 DEV-CANVAS-00/03 的实施 Gate；前端不得绕过；
7. Control/Structural concrete OPL、Trace 和 golden 已冻结为设计输入，但完整 16/8/10 Grammar、Rule、Symbol 和 manifest 仍不是已验收机器资产；DEV-CANVAS-05/06 通过前不得批量启用；
8. Lucide 当前不是前端直接依赖，完整工具链前端任务需显式允许新增依赖并冻结版本，或通过 ADR 采用现有图标库等价方案。
9. 当前 Revision JSON Schema 仍为 0.1 身份；其中出现 `modifiers[]` 不等于独立 0.2 已发布，不改 SQLite DDL也不等于机器契约已验收。

## 13. 事实与假设

### 13.1 事实

1. P0 所需设计文档、Schema、样例、OpenAPI、SQLite V1、原型和测试策略已经存在；
2. 三样例、OpenAPI 和 SQLite V1 已执行验证；
3. P01-P06 原型已在桌面/移动浏览器实际验收；
4. 当前已有 DEV-00 前后端工程壳和生产依赖锁，但没有 P0 业务闭环或完整画布实现。

### 13.2 假设/待代码验证

1. 已选技术组件准确版本可以在 Java 21/Node 22 环境共同工作；
2. X6 能按符号契约满足 P0 路由和大图性能；
3. Flyway 与 SQLite 驱动组合满足恢复与 migration 门槛；
4. 这些假设由 DEV-00、DEV-02 和 DEV-09 验证，不在设计阶段宣称已证实。
5. 完整 relation marker、fan、State containment 和大图性能能由 X6 满足，仍由 DEV-CANVAS-01~06 的组件、视觉、E2E 和性能测试证明。
