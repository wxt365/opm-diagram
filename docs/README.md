# OPM 单机建模工具文档索引

更新时间：2026-08-26

## 1. 文档目的

本文档是 OPM 单机建模工具需求、标准、架构和后续开发准备材料的统一入口。

当前`32`项设计责任按`design/opm-design-freeze-baseline.md` `v1.49`记录为：`22`项`FROZEN_INCLUDED`、`10`项`FROZEN_DEFERRED`、`0`项`BLOCKED`，全局开发门为`READY_FOR_DEVELOPMENT`。Common controlled orchestration唯一owner仍为Runner Source Set第1项，External Store与Common编排唯一活动Build保持`17=14 M+3 A`。Fault Launcher的36项只读基线继续来自`0dcaa27...`；受控lane新增Bundle `0.2`、Descriptor/JarIT/Gate Observation `0.1`，D10拆为preflight D10A和execution D10B。必须先实现contract `12=4 M+8 A`并接纳新base，2A当前为`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。17项commit、contract/new base、Fault Launcher 2A、external输入、Manifest、`194/388`、Report、Gate、Candidate、Activation、Capability、production及ISO证据均未生成。

## 2. 正式入口

### 2.0 全量设计冻结与开发准入

1. `design/opm-design-freeze-baseline.md`：唯一设计冻结状态源、当前/延期范围、浏览器矩阵、责任 owner、机器契约目标、开发准入算法和变更入口。
2. `../specs/opm-all-design-freeze-task-spec.md` 与 `checklists/opm-all-design-freeze-checklist.md`：本次冻结规格、Spec Mapping、差异关闭和验证记录。

### 2.1 产品需求

1. `requirements/opm-online-modeling-tool-requirements.md`：产品目标、范围、功能、非功能和验收基线。
2. `requirements/opm-requirement-acceptance-matrix.md`：`FR/NFR/CAP` 逐项验收追踪。

### 2.2 标准与语义

1. `requirements/opm-profile-capability-matrix.md`：ISO 与中文草案配置档能力目录。
2. `requirements/iso-19450-2024-conformance-matrix.md`：ISO Clause 4-14 与 Annex A 子条款规则组。
3. `requirements/opm-common-semantic-core.md`：公共事实、条件归一化和配置档专属隔离边界。

### 2.3 架构与模块

1. `design/opm-modeling-tool-architecture.md`：系统边界、分层、模块依赖、事务和架构决策。
2. `design/opm-modeling-tool-module-design.md`：M01-M12 职责、逻辑契约、数据所有权和关键流程。

### 2.4 页面与交互

1. `design/opm-modeling-workbench-page-design.md`：P01-P06 页面组、工作台 IA、主动作、守卫和回流。
2. `design/opm-modeling-workbench-state-model.md`：导航、编辑、保存、文本、校验、选择、弹层和任务状态。
3. `design/opm-modeling-workbench-field-region-detail.md`：页面区块、字段来源、编辑性和动作守卫。
4. `design/opm-modeling-workbench-component-interaction.md`：组件树、交互事件、模块契约映射和原型关注点。
5. `design/opm-complete-canvas-toolchain-design.md`：State、图标工具链、关系候选、16/8/10 全量能力映射、字段/事件/键盘/响应式和验收矩阵。

### 2.5 应用与数据契约

1. `design/opm-modeling-tool-application-api-contract.md`：应用命令/查询、包络、revision/幂等、任务和错误语义。
2. `design/opm-modeling-tool-persistence-contract.md`：逻辑数据对象、Revision 提交包、原子事务、迁移和恢复。
3. `design/opm-native-exchange-package-contract.md`：原生包 Manifest、内容分区、身份、兼容性和 staging 导入。

### 2.6 字段级 Schema

1. `design/opm-core-metamodel-field-schema.md`：Model、Element、Fact、Context、Text、Validation 和 Revision 字段、不变量与迁移。
2. `design/opm-profile-package-field-schema.md`：Profile Identity、96 项 Capability、Symbol、Grammar、Adapter、依赖闭包与迁移。
3. `design/opm-rule-definition-field-schema.md`：103 个规则组及后续原子规则的 Selector、声明式 AST、Finding、Evidence 与依赖 DAG。

### 2.7 开发技术与机器契约

1. `design/opm-development-technology-baseline.md`：ARC-007/008/009、运行拓扑、技术栈和工程结构。
2. `design/opm-physical-data-and-migration-design.md`：SQLite、资产目录、迁移、`.opmp` 和恢复。
3. `design/opm-symbol-and-text-generation-implementation-contract.md`：P0 与完整画布的 symbol/marker/label slot/route、Control/Structural concrete OPL、precedence、Token/Trace 和 golden manifest。
4. `contracts/schemas/*.json`：Revision、Profile、Rule Set JSON Schema 2020-12。
5. `contracts/examples/*.json`：三个通过 Schema 验证的代表样例。
6. `contracts/openapi/opm-local-api-v1.yaml`：P0 本地 HTTP OpenAPI 3.1。
7. `contracts/migrations/sqlite/*`：SQLite Flyway V1 与验证 SQL。

### 2.8 原型、handoff 与执行包

1. `../prototype/`：P01-P06 无构建交互原型。
2. `design/opm-prototype-acceptance-report.md`：桌面/移动、状态和交互验收结果。
3. `design/opm-frontend-handoff.md`：P0 与完整画布增量的 route/store/X6/API 交付标注。
4. `design/opm-test-strategy.md`：分层测试、fixture、E2E 和发布门槛。
5. `design/opm-dev-canvas-06-golden-authoring-design.md`：无 PNG Capture Plan、固定 author 环境、审批、不可变 golden 版本和 Visual Manifest 守卫。
6. `design/opm-dev-canvas-06-golden-fixture-materializer-design.md`：Materializer `v1.5` 的130个exact archive fixture、release-only non-web Runtime、Check 8后Report接纳点、隔离SQLite/clone，以及pending预验证到完整verifier的唯一四阶段cleanup顺序。
7. `design/opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md`：Verifier Catalog `v1.1` 的受控factory、`GFMV_*`、首错优先级、原57项完整verifier case和6项pending-quarantine case，共63项。
8. `design/opm-dev-canvas-06-recovery-execution-design.md`：Recovery `v1.5` 的immutable template、四条command/digest、活动Manifest `0.2`、HTTP raw-body JCS、Launch Request/Proof、32-byte challenge、原子proof、factory/fault/launcher和artifact采集唯一执行设计。
9. `design/opm-dev-canvas-06-e2e-attempt-artifact-design.md`：历史Attempt Artifact `v1.3/0.1`的11类JSON、Family Project/attempt ordinal来源、Projection Digest绑定和兼容读取边界；活动`0.2`由Profile/Digest closure后继，Fault执行语义由Fault Launcher设计后继。
10. `design/opm-dev-canvas-06-execution-contract-design-correction.md`：按02B、Recovery Launch、E2E Java/Source顺序冻结本轮三项执行契约修正及兼容边界。
11. `design/opm-dev-canvas-06-projection-digest-closure-design.md`：正式Projection Digest `v1.0/0.1`的版本化preimage、binary64大端raw-bit编码、4正/9负Node/Java parity vector、稳定错误和Recovery/E2E绑定。
12. `design/opm-dev-canvas-06-e2e-fault-launcher-design.md`：Fault Launcher `v1.2`的test-only配置、nonce/challenge、Plan raw identity、Spring装配、三个精确hook、一次性状态机、稳定错误码，以及Bundle `0.2`/Descriptor `0.1`后继入口。
13. `design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md`：Common Driver `v1.4`的16 case精确页面动作、有序API/事务/REOPEN映射、Runner Source Set内唯一编排owner，以及Common/External 17项集成source身份边界。
14. `design/opm-development-execution-pack.md`：DEV-00~09、DEV-CANVAS-00~06 的范围、DoD、联调、回滚和就绪矩阵。

### 2.9 执行记录

1. `checklists/opm-online-modeling-tool-requirements-checklist.md`：Task 1-18 的 Spec Mapping、范围和验证记录。
2. `checklists/opm-complete-canvas-toolchain-design-checklist.md`：完整画布设计补齐的 Spec Mapping、覆盖和验证记录。
3. [`DEV-CANVAS-05 规格`](../specs/opm-dev-canvas-05-opl-trace-golden-task-spec.md) 与 `checklists/opm-dev-canvas-05-opl-trace-golden-checklist.md`：OPL/Trace/golden 机器实现边界。
4. [`DEV-CANVAS-06 规格`](../specs/opm-dev-canvas-06-toolchain-release-task-spec.md) 与 `checklists/opm-dev-canvas-06-toolchain-release-checklist.md`：工具链、视觉、E2E、性能和发布边界。
5. [`Golden Authoring 设计规格`](../specs/opm-dev-canvas-06-golden-authoring-design-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-authoring-design-checklist.md`：独立 authoring 设计冻结、Spec Mapping 和验证记录。
6. [`Golden Fixture Materializer 设计规格`](../specs/opm-dev-canvas-06-golden-fixture-materializer-design-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-fixture-materializer-design-checklist.md`：release-only Materializer 设计冻结和验证记录。
7. [`Golden Fixture Materializer 实现规格`](../specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-fixture-materializer-implementation-checklist.md`：`GOLDEN-AUTHORING-03A` 开发入口，当前 `IN_PROGRESS/NOT_RELEASE_VALIDATED`。
8. [`Golden Fixture Materializer Report 边界修正规格`](../specs/opm-dev-canvas-06-golden-fixture-materializer-report-boundary-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-fixture-materializer-report-boundary-bugfix-checklist.md`：pre-acceptance rejection、reportable invocation 和 BLOCKED Report 的冻结修正记录。
9. [`Golden Environment 0.2 设计修正规格`](../specs/opm-dev-canvas-06-golden-environment-v02-design-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-environment-v02-design-bugfix-checklist.md`：生产 Environment 的 0.2 字段、fingerprint 和 `0.1` 兼容边界。
10. [`Golden Environment 0.2 实现规格`](../specs/opm-dev-canvas-06-golden-environment-v02-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-environment-v02-implementation-checklist.md`：Schema、离线 verifier、正反例和 npm 入口，当前 `IMPLEMENTED/NOT_RELEASE_VALIDATED`。
11. [`Candidate Author 实现规格`](../specs/opm-dev-canvas-06-golden-candidate-author-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-candidate-author-implementation-checklist.md`：`GOLDEN-AUTHORING-03B` 直接开发入口，仍待 runtime browser/font 校验、capture 和 candidate writer。
12. [`Approval/Publisher 实现规格`](../specs/opm-dev-canvas-06-golden-approval-publisher-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-golden-approval-publisher-implementation-checklist.md`：`GOLDEN-AUTHORING-04` 直接开发入口。
13. [`Visual Manifest 0.2 实现规格`](../specs/opm-dev-canvas-06-visual-manifest-v02-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-visual-manifest-v02-implementation-checklist.md`：`GOLDEN-AUTHORING-05` 直接开发入口。
14. [`Golden Authoring 设计闭环修正规格`](../specs/opm-dev-canvas-06-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-design-closure-bugfix-checklist.md`：v1.2 确定性、Report/quarantine/verifier、0.2 审批链和跨文档闭环记录。
15. [`Materialization Verifier 受控正反例闭包规格`](../specs/opm-dev-canvas-06-materialization-verifier-controlled-cases-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-materialization-verifier-controlled-cases-bugfix-checklist.md`：v1.3 verifier factory、稳定错误、优先级和 57-case 冻结记录。
16. [`Visual/E2E 输入契约修正规格`](../specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-checklist.md`：Visual `0.2`、E2E `0.1`、approved exact join、受控/生产 bundle 隔离及旧合并 builder 历史化记录。
17. [`E2E Manifest 0.1 Builder 实现规格`](../specs/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-checklist.md`：完整CLI、controlled archive、活动Common 43文件root验证/整树复制、Family Identity Catalog raw ref、逐字段ref、`194/388`派生和单一final transaction root零输出事务；Versioned Handoff production输入已闭合，当前为`FIXED_HANDOFF_POSTVERIFY_CLOSURE_REQUIRED`。
18. [`Recovery Runner 实现规格`](../specs/opm-dev-canvas-06-recovery-runner-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-recovery-runner-implementation-checklist.md`：只读消费两份冻结template的validator、factory三接口、7个SQLite hook、4个强停reachpoint、PropertiesLauncher与artifact index开发入口。
19. [`DEV-CANVAS-06 执行契约缺口修正规格`](../specs/opm-dev-canvas-06-execution-contract-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-execution-contract-closure-bugfix-checklist.md`：E2E、Materializer cleanup和Recovery三类执行契约的跨文档闭环记录。
20. [`DEV-CANVAS-05 Clean Handoff重建规格`](../specs/opm-dev-canvas-05-clean-handoff-rebuild-task-spec.md) 与 `checklists/opm-dev-canvas-05-clean-handoff-rebuild-checklist.md`：从clean commit生成含exact `golden-replay.json`的版本化Evidence Bundle、Runtime JAR、READY Handoff与READY Intake；不构成DEV-CANVAS-06后续Gate或发布证据。
21. [`Recovery Template/Input闭包修正规格`](../specs/opm-dev-canvas-06-recovery-template-input-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-recovery-template-input-closure-bugfix-checklist.md`：两份`0.1.0`不可变JSON、四条command、RFC 8785 JCS request digest、七类结果digest、deterministic ID和Gate 34项闭包的冻结记录。
22. [`E2E Runner设计闭环修正规格`](../specs/opm-dev-canvas-06-e2e-runner-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-runner-design-closure-bugfix-checklist.md`：Manifest builder与Runner状态拆分、执行层缺口、Spec Mapping和跨文档修正记录。
23. [`E2E Runner实现规格`](../specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-runner-implementation-checklist.md`：production/controlled CLI、Family/Common SQLite物化、production Web/Runtime/browser隔离、388 attempt raw artifact、Report事务/聚合和只读verifier直接开发入口。
24. [`Visual Common Materialization设计闭环规格`](../specs/opm-dev-canvas-06-visual-common-materialization-color-profile-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-visual-common-materialization-color-profile-design-closure-bugfix-checklist.md`：`DFR-021` Root Cause、唯一SQLite路径、Color Profile映射、跨文档状态和验证闭包。
25. `design/opm-dev-canvas-06-visual-common-materialization-design.md`：Visual Common`v1.4`唯一设计口径，承接8个subject、完整fixture Schema、32个E2E asset、`43=1+8+32+2`输出树、五类index到SQLite逐列映射、8类UI step/exact JSON、generator/factory source mirror、Projection、8 base/144 clone、fault hook、Color Profile及JCS owner/parity。
26. [`02B Common Visual Fixture实现规格`](../specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-visual-fixture-contract-implementation-checklist.md`：冻结Schema consumer/contract test、8 fixture、Catalog`0.2.0`、两份source mirror、共享Node JCS、exact parity vector、只读verifier、Planner semantic join和Color Profile pure function直接开发入口，当前`NOT_STARTED`。
27. [`03C Common Visual Materializer实现规格`](../specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-visual-materializer-implementation-checklist.md`：release-only Java materializer、既有Java canonicalizer parity、8 base、attestation、144 clone、fault hook和03B adapter直接开发入口，当前`NOT_STARTED`。
28. [`Visual Common JCS Owner设计修正规格`](../specs/opm-dev-canvas-06-common-visual-jcs-owner-design-correction-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-visual-jcs-owner-design-correction-bugfix-checklist.md`：唯一Node模块、safe integer、RFC 8785 UTF-16 key排序、10项exact Node/Java parity vector及历史`v1.0`到当前`v1.1`指针。
29. [`Recovery Factory Output设计闭包修正规格`](../specs/opm-dev-canvas-06-recovery-factory-output-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-recovery-factory-output-design-closure-bugfix-checklist.md`：Attempt Materialization/Tree Descriptor `0.1`、helper JAR、source mirror、21表SQLite映射、原子提交、只读verifier和Gate owner闭包。
30. [`E2E Attempt Artifact设计闭包修正规格`](../specs/opm-dev-canvas-06-e2e-attempt-artifact-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-attempt-artifact-design-closure-bugfix-checklist.md`：11类artifact union Schema `0.1`、filename/schema identity、JCS/SHA、跨artifact join、Report投影和verifier顺序闭包。
31. [`Recovery Reopen/HTTP JCS设计闭包修正规格`](../specs/opm-dev-canvas-06-recovery-reopen-http-jcs-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-recovery-reopen-http-jcs-design-closure-bugfix-checklist.md`：Reopen Catalog `0.1.0`、Manifest `0.2`、28项expected reopen exact join、test-only eager raw-body filter/body advice和HTTP 422零执行边界。
32. [`Projection Digest Closure设计闭包修正规格`](../specs/opm-dev-canvas-06-projection-digest-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-projection-digest-closure-bugfix-checklist.md`：版本化Projection preimage、binary64大端raw-bit tag、两份Schema、4正/9负vector、稳定错误以及Recovery/E2E摘要同步。
33. [`执行契约设计修正规格`](../specs/opm-dev-canvas-06-execution-contract-design-correction-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-execution-contract-design-correction-bugfix-checklist.md`：唯一空Text Artifact、Recovery Launch Request/Proof、E2E Report `0.2` Java mirror/ref和23项Runner Source Set的顺序冻结记录。
34. [`Common Visual Index/UI/Source设计闭包规格`](../specs/opm-dev-canvas-06-common-visual-index-ui-source-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-visual-index-ui-source-design-closure-bugfix-checklist.md`：五类index entry Schema/SQLite映射、8类UI step与subject exact JSON、source mirror信任链及Catalog活动`0.2.0`版本修正记录。
35. [`Common Catalog E2E Asset输出闭包规格`](../specs/opm-dev-canvas-06-common-catalog-e2e-asset-output-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-catalog-e2e-asset-output-closure-bugfix-checklist.md`：冻结活动Catalog `0.2.0`的43文件自包含root、32个E2E asset factory生成、24项factory ref一致性，以及E2E Manifest整树复制与旧布局拒绝边界。
36. [`Family Fixture Identity来源闭包规格`](../specs/opm-dev-canvas-06-family-fixture-identity-source-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-family-fixture-identity-source-closure-bugfix-checklist.md`：冻结Catalog `0.1/0.1.0`、Manifest唯一raw ref、178 -> 2 base fixture join、Project唯一来源、fixture parent缺失到显式`null`归一、Fault Plan ordinal唯一来源和零SQLite边界。
37. [`Family Production Input最小重建规格`](../specs/opm-dev-canvas-06-family-production-input-rebuild-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-family-production-input-rebuild-bugfix-checklist.md`：冻结base SHA、37项source delta（`4 M+33 A`，含两份固定测试资产和GATE evidence generator）、GATE-05-01显式TAP命令/Report command、集成测试exact plural断言、双clean worktree、外部Common/Manifest staging、版本化release root、固定Handoff原子切换/回滚和production预验/安装后重验；`clean-a36a7f1fd709`已安装，固定Handoff切换因mutable report ref失败并回滚，由第38项后继规格承接。
38. [`Versioned Handoff Report Ref Closure修正规格`](../specs/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-versioned-handoff-report-ref-closure-bugfix-checklist.md`：source`37c5412a9c12...`、`14=12 M+2 A`、Node 24定向`13/13`、版本根`handoff/reports/**`、READY Handoff/Intake、production Manifest和`clean-37c5412a9c12`已形成；fixed switch因postverify信任边界转由第39项承接。
39. [`Fixed Handoff Postverify Closure修正规格`](../specs/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-fixed-handoff-postverify-closure-bugfix-checklist.md`：fixed/versioned/Manifest copy/production verifier四方raw join、Report`0.1`、subject/tool source分离、`4=1 M+3 A`tool包、pre-acceptance、原子Report、backup恢复与READY Report加live guard联合判定均已执行；当前`IMPLEMENTED/READY_REPORT_RECORDED/FIXED_SWITCH_FINALIZED`。
40. [`E2E Profile Asset 与摘要闭包修正规格`](../specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-checklist.md`：活动 Manifest/Attempt Artifact `0.2`、Profile asset tree/raw refs、direct-root loader、Materializer `--input`自校验、唯一Spring Boot nested CodeSource与外层JAR安全反解析、`source_sha256` exact outer JAR raw-byte公式、Manifest canonical UTC整秒派生唯一`source_date_epoch`、OPL/Trace Java canonical writer、Token JCS preimage及Node/Java parity vectors；活动设计已升至`v1.5`并由Manifest v02规格追加Source Set/Staging三方闭包，forked-JAR成功集成测试及完整CLI/Materializer/Artifact verifier成功路径尚未实现。
41. [`E2E Fault Launcher设计闭包修正规格`](../specs/opm-dev-canvas-06-e2e-fault-launcher-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-fault-launcher-design-closure-bugfix-checklist.md`：冻结九项test-only配置、普通启动NOOP与fail-closed Spring条件、32-byte nonce/challenge HMAC、Plan raw SHA/链接/首错、三类精确注入、一次性状态机、错误码和正反例矩阵；设计闭包已完成，代码入口由第42项承接。
42. [`E2E Fault Launcher实现规格`](../specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-fault-launcher-implementation-checklist.md`：既有launcher、hook和测试已由`0dcaa27...`的36项只读raw-ref基线承接；当前先等待preflight contract新base，随后活动delta仍只新增两个controlled Playwright文件。状态为`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`。
43. [`E2E Manifest v02 Producer/Verifier实现规格`](../specs/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-checklist.md`：冻结17路径总allowlist、Profile Staging修正7路径owner、production/controlled CLI、clean source五文件Source Set、source-root外fresh Staging、source/staging/final raw/tree三方join、exact JAR/Web、四driver、194 case、活动Report `137/57`和原子final root；当前`FROZEN_FOR_IMPLEMENTATION/NOT_STARTED`。
44. [`E2E Common Driver与受控编排实现规格`](../specs/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-implementation-checklist.md`：承接Common Driver设计`v1.4`、16 case精确动作、有序API期望及controlled bundle/exact Runtime JAR/production Web/fresh attempt root和same-storage REOPEN；现有Driver、三个selector、Fact删除、store和factory只读，唯一待实现编排owner为`release-canvas06-e2e-run.mjs`，`8=7 M+1 A`仅为职责子集；当前`EMBEDDED_IN_17_PATH_SOURCE/ORCHESTRATION_NOT_STARTED`。
45. [`Common E2E输入重建实现规格`](../specs/opm-dev-canvas-06-common-e2e-input-rebuild-implementation-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-e2e-input-rebuild-implementation-checklist.md`：冻结3路径allowlist、Builder/Verifier逐case单次exact factory缓存、活动Catalog `0.2.0`、32个BASE/INPUT唯一编码、全部raw ref复算和43文件原子事务；当前root状态为`IMPLEMENTED/COMMON_ROOT_SELF_VERIFIED`，统一production链完成前不能单独供活动Manifest消费。
46. [`统一Source生产输入重建规格`](../specs/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-unified-source-production-input-rebuild-bugfix-checklist.md`：冻结`23=11 M+11 A+1 D`、`daf383df...` base、新`unified_source_commit`、Handoff `0.2`三artifact、READY Intake、Runtime/Web/Common同源重建、六个source-root固定路径、Web tree摘要、原子安装、Quarantine Marker `0.1` sidecar和Manifest v02 exact join；历史实现commit为`30f7edc...`，但它不能单独作为最终Manifest production identity，后继集成与production重建由第48项承接。
47. [`Bootstrap Build Closure修正规格`](../specs/opm-bootstrap-build-closure-bugfix-task-spec.md) 与 `checklists/opm-bootstrap-build-closure-bugfix-checklist.md`：冻结同源external classic `/opm-bootstrap.js`、Runtime动态下发且不进入Vite bundle、应用入口前执行、Node `22.22.0`/npm `10.9.4`根build、派生产物allowlist、Git零tracked/untracked漂移、禁止`vite.config.d.ts`及Runtime `227` bytes/四字段window wire不变；设计`FROZEN_FOR_IMPLEMENTATION`，实现与clean build均为`NOT_STARTED`。
48. [`Manifest v02 集成 Source 重建规格`](../specs/opm-dev-canvas-06-manifest-v02-integrated-source-rebuild-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-manifest-v02-integrated-source-rebuild-bugfix-checklist.md`：`e598b305...`已按`39`项owner和`8=3 M+5 A`形成；内嵌`clean-e598...`因source污染/root包含被拒绝，production路径由第49项修正。
49. [`Manifest v02 外置 Release Orchestrator设计闭包规格`](../specs/opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-manifest-v02-external-release-orchestrator-design-closure-bugfix-checklist.md`：历史冻结独立root与outer transaction，但`3=1 M+2 A`未授权修改统一Builder/Verifier，现为`SUPERSEDED/DO_NOT_IMPLEMENT`。
50. [`Unified External Release Store Mode设计闭包规格`](../specs/opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-unified-external-release-store-mode-design-closure-bugfix-checklist.md`：以`e598...`为base，冻结`9=7 M+2 A`职责子集、41项owner、统一Builder/Verifier external mode、无路径override的三条CLI、双物理根、完整source-clean、external quarantine归属、新进程Unified Verifier和Manifest outer transaction；独立source包已`SUPERSEDED`，实现嵌入第52项。
51. [`Common Driver编排与Runner Source Set闭包修正规格`](../specs/opm-dev-canvas-06-common-driver-runner-source-set-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-driver-runner-source-set-closure-bugfix-checklist.md`：关闭独立编排helper被Runner Source Set `0.1`排除的冲突；不升级Source Set或Report，将`prepareControlledAttempt()`唯一收敛到23项第1项，冻结`8=7 M+1 A`及既有Driver/UI/factory只读边界。
52. [`Common编排与External Store集成Source闭包规格`](../specs/opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-common-orchestration-integrated-source-closure-bugfix-checklist.md`：冻结唯一base=`e598b305...`、External Store 9项与Common编排8项的无交集职责子集、`17=14 M+3 A` composite allowlist、single-parent final commit、raw binary patch SHA、六方source join及从同一commit重建production输入、Manifest和运行Runner的唯一顺序；当前`FROZEN/BUILD_NOT_STARTED`。
53. [`Fault Launcher Clean Base与受控Playwright闭包修正规格`](../specs/opm-dev-canvas-06-e2e-fault-launcher-clean-base-and-controlled-playwright-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-fault-launcher-clean-base-and-controlled-playwright-closure-bugfix-checklist.md`：接纳完整`0dcaa27...`并把旧38项分类为36项只读raw ref与唯一`2 A`；其旧D10/直接Build结论已由第54项后继修正，当前作为origin base历史冻结来源。
54. [`Fault Launcher Preflight Descriptor与Gate观测闭包修正规格`](../specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md) 与 `checklists/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-checklist.md`：冻结Bundle `0.2`对Descriptor `0.1`的不可变raw ref、JarIT/Environment/browser、6 attempts/12 cycles、12端口、D10A与14项D10B观测，以及后继`12=4 M+8 A`contract包；2A等待新clean base。

## 3. 建议阅读顺序

### 3.1 产品与标准评审

1. 全量设计冻结基线；
2. 产品需求规格；
3. 配置档能力矩阵；
4. ISO 条款级符合性矩阵；
5. 公共语义内核；
6. 需求验收矩阵。

### 3.2 架构设计评审

1. 产品需求规格第 6、9、11、12、13、14 章；
2. 公共语义内核；
3. 顶层技术架构；
4. 模块详细设计；
5. ISO 条款级符合性矩阵和需求验收矩阵。

### 3.3 进入 P0 开发

按以下顺序进入 P0 开发：

1. 全量设计冻结基线；
2. 首批开发执行包；
3. 开发技术基线与顶层架构；
4. 模块详细设计；
5. 前端 handoff 与页面四文档；
6. OpenAPI、JSON Schema 和 SQLite V1；
7. 符号/OPL 实现契约；
8. 测试策略；
9. 原型验收报告。

### 3.4 进入完整画布开发

1. 全量设计冻结基线第 2、6、8 章；
2. 完整画布工具链设计；
3. 符号与文本生成实现契约第 3、5、7、9、10 章；
4. 前端 handoff 第 7.4 章及 Store/X6/接口扩展；
5. 开发执行包 `DEV-CANVAS-00~06`；
6. DEV-CANVAS-06 Golden Authoring 设计；
7. DEV-CANVAS-06 Golden Fixture Materializer 设计与实现规格；
8. DEV-CANVAS-06活动E2E Manifest `0.2` producer/verifier、Common Driver/controlled orchestration、统一Source生产输入重建、E2E Runner/Fault Launcher规格与Recovery Execution设计/runner规格；历史Manifest `0.1`仅用于兼容审计；
9. 核心元模型、Profile 能力矩阵和应用 API 契约；
10. `DEV-CANVAS-00` 将冻结的 OpenAPI/Revision 0.2 目标转为版本化机器契约、generated client 和正反 contract test。

## 4. 当前设计职责

| 设计职责 | 承接文档 | 状态 |
| --- | --- | --- |
| 全量设计状态与开发门 | 全量设计冻结基线 | `FROZEN/READY_FOR_DEVELOPMENT`；唯一状态源 |
| 产品顶层需求 | 产品需求规格 | `FROZEN_INCLUDED` |
| 配置档能力目录 | 配置档能力矩阵 | `FROZEN_INCLUDED`；中文专属生产启用为 `FROZEN_DEFERRED` |
| ISO 子条款规则组 | ISO 条款级符合性矩阵 | `FROZEN_INCLUDED`；原子规则与符合性声明为 `FROZEN_DEFERRED` |
| 公共语义边界 | 公共语义内核 | `FROZEN_INCLUDED` |
| 逐项验收入口 | 需求验收矩阵 | `FROZEN_INCLUDED`；执行结果单独记录 |
| 顶层技术架构与模块 | 顶层架构、技术基线、模块设计 | `FROZEN_INCLUDED` |
| 页面、状态、字段与组件 | 页面四文档 + handoff | `FROZEN_INCLUDED`；P04-P06 生产实现为 `FROZEN_DEFERRED` |
| 完整画布专题设计 | 完整画布工具链设计 | `FROZEN_INCLUDED` |
| Control/Structural OPL 输入 | 符号与文本契约 | `FROZEN_INCLUDED` |
| 应用 API 与完整画布目标机器契约 | 应用 API + OpenAPI + 冻结基线第 6 章 | `FROZEN_INCLUDED`；0.2 发布/生成/测试待实现 |
| Revision/持久化/交换 | 字段、持久化、物理与交换契约 | `FROZEN_INCLUDED`；Revision 0.2 机器发布待实现 |
| 原型、handoff、测试与执行包 | 验收报告 + 三份开发准备文档 | `FROZEN_INCLUDED` |
| DEV-CANVAS-05/06 Gate | 两份 spec + checklist | 设计输入均已冻结；运行Gate仍按对应Report判定，`GATE-06-03`保持`BLOCKED/NOT_RUN` |
| Visual Golden Authoring | Golden Authoring v1.4 + Visual Common Materialization v1.4 + Common Visual Fixture 0.1 + Catalog历史0.1.0/活动0.2.0 + Common E2E输入重建 + Environment 0.2 + 02B/03C/03B/04/05 spec/checklist | `FROZEN_INCLUDED`；空Text Artifact/计数、五类index、8类UI step/exact数组和43文件self-contained root已冻结，02B已完成新factory对应32个E2E/raw ref的clean重建，03C为`NOT_STARTED`，03B为`BLOCKED_BY_DEPENDENCY`，production evidence未生成 |
| Golden Fixture Materializer | Materializer设计v1.5 + Verifier Catalog v1.1 + design/implementation/bugfix spec/checklist | `IMPLEMENTED_RELEASE_EXECUTION_PENDING`；pending预验证、唯一四阶段quarantine、63/63、受控130项串行/并发4及contract/backend已闭环；真实production 130项与release evidence待执行 |
| E2E执行契约 | 历史 E2E Manifest/Attempt Artifact `0.1` + 活动 Manifest/Attempt Artifact `0.2` + Manifest v02 producer/verifier规格/checklist + Common Driver/controlled orchestration设计`v1.4`、实现规格、Source Set闭包及Common/External 17项集成Source + Common E2E输入重建、统一Source、Manifest v02集成Source、历史外置Orchestrator及Unified External Store职责子集 + Profile Asset/Digest Closure + Family Identity Catalog 0.1/0.1.0 + Versioned Handoff与Fixed Postverify两份闭包规格 + 活动Report 0.2 + Runner Source Set 0.1 + Projection Digest 0.1 + E2E Runner实现规格/checklist | `FROZEN_INCLUDED`；Common编排唯一归23项第1项且待实现；External 9项与Common 8项只作为职责子集，唯一活动source为`17=14 M+3 A`；final commit、external input、新进程Unified Verifier、Manifest双Verifier与真实`194/388` Report均为`NOT_CREATED/NOT_RUN` |
| Recovery执行契约 | Recovery Execution设计v1.5 + Launch Request/Proof 0.1 + Projection Digest v1.0/0.1 + template/input、Factory output及Reopen/HTTP闭包修正规格 + runner实现规格/checklist | `DFR-018=FROZEN_INCLUDED`；Launch协议正反例为`17/17`，完整launcher与真实28/56未实现/执行；`RECOVERY-IMPL-01=DESIGN_READY/IMPLEMENTATION_NOT_STARTED` |
| 完整 ISO Grammar/Symbol/Conformance | 冻结基线 `DFD-004~007` | `FROZEN_DEFERRED` |
| 完整画布实现与发布证据 | DEV-CANVAS-00~06 | 实施状态，不参与设计冻结；未执行项保持 `NOT_RUN` |

## 5. 当前关键决策状态

| 决策 | 状态 | 来源 |
| --- | --- | --- |
| 单用户单机、本地优先 | 已确认 | 产品需求规格 |
| 统一语义事实源 | 已确认 | 产品需求规格、公共语义内核 |
| 两个用户配置档，公共核心不作为第三配置档 | 已确认 | 配置档能力矩阵、公共语义内核 |
| 本地优先模块化单体 | 已冻结逻辑决策 | 顶层技术架构 ARC-001 |
| 语义、文本、追踪和校验摘要按修订提交 | 已冻结逻辑决策 | 顶层技术架构 ARC-004 |
| loopback 本地应用服务 + 默认浏览器 | ACCEPTED | ARC-007、开发技术基线 |
| SQLite 项目库 + 资产目录 + `.opmp` ZIP；首发 exchange/reader 均为 `1.0` | ACCEPTED | ARC-008、物理数据设计、原生交换契约 v1.1 |
| Vue 3/X6 + Spring Boot/Java 21 + SQLite/Flyway | ACCEPTED | ARC-009、开发技术基线 |
| P01-P06 页面组和五区建模工作台 | 已通过原型验收 | 页面专题设计、验收报告 |
| 视口缩放与语义 in/out-zoom 使用不同状态和事件 | 已冻结交互边界 | 页面状态、字段和组件交互文档 |
| 应用 API 先冻结语义，P0 映射本地 HTTP | 已冻结 | 应用 API、OpenAPI |
| Revision 不可变，Draft Head 指向新 Revision 演化 | 已冻结逻辑边界 | 持久化契约 |
| 原生交换包不是 ISO 标准交换格式 | 已冻结声明边界 | 原生交换包契约 |
| Schema/storage/exchange/Profile/rule/model revision 版本相互独立 | 已冻结逻辑边界 | 三份字段级 Schema、持久化与交换契约 |
| 规则仅使用受控声明式 AST，不执行包内脚本和网络调用 | 已冻结安全边界 | Rule Definition 字段级 Schema |
| State 不是 Element，ISO Profile 禁止 Process State | 已冻结语义边界 | 核心元模型、完整画布设计 |
| 通用工具用图标，OPM 工具用 Symbol Catalog 缩略符号 | 已冻结 handoff | 完整画布设计、前端 handoff |
| 完整关系使用分组搜索目录和服务端候选，不平铺、不前端硬编码合法性 | 已冻结交互边界 | 完整画布设计 |
| 完整画布先闭合并验收 API-EDT-001/002，再按 Capability 分批启用 | 已冻结实施顺序 | 开发执行包 DEV-CANVAS-00~06 |
| ISO Control 使用基础 Fact 上的 `control.capability/control.segment` 成对 Modifier，不创建独立 Control Fact | 已冻结持久化边界 | 核心元模型、应用 API、逻辑/物理持久化契约 |
| ISO 19450:2024 不存在 Clause 15；Link 语义强度、EBNF 优先级和产品句序分离 | 已冻结标准解释边界 | 符号与文本契约 7.4、标准 Annex A |
| 完整画布性能门槛为产品阈值，不是 ISO 要求 | 已冻结验收边界 | 产品需求 NFR-PERF-001~004、DEV-CANVAS-06 规格 |
| Visual golden 必须经新无 PNG Plan、130个exact Family SQLite、含唯一空Text Artifact和逐列index seed的8个Common base/144 fresh clone、8类受控UI step、43文件self-contained Common root、固定Environment 0.2、双人审批和immutable version发布；Plan `srgb`只映射到Environment `sRGB IEC61966-2.1` | 已冻结发布边界 | Golden Authoring v1.4、Visual Common Materialization v1.4、Environment 0.2、Fixture Materializer v1.5、Verifier Catalog v1.1 |
| E2E Manifest 0.1 的Manifest、raw输入、archive物化、Family Identity Catalog、Common和driver只能在同一staging root中一次提交 | 已冻结事务边界 | Family Identity闭包规格、E2E builder实现规格 |
| Family Project只来自Manifest锁定的Catalog，178个Family base ref当前去重为2；attempt ordinal只来自已验证Fault Plan | 已冻结身份边界 | E2E Attempt Artifact v1.3、Family Identity闭包规格 |
| E2E Report只在388项取得真实必填identity后原子提交；活动Report `0.2`必须闭合Java executable mirror/ref和23项Runner Source Set，历史`0.1`只读 | 已冻结证据边界 | E2E Attempt Artifact v1.3、E2E Runner实现规格、测试策略v1.29 |
| E2E Fault Launcher只允许三个故障case的INITIAL启用；九项参数只来自命令行，普通/NONE/REOPEN只装配NOOP；Bundle `0.2`锁定preflight输入，D10A/D10B分域观测 | 已冻结测试隔离与实现边界 | Fault Launcher设计v1.2、Preflight Descriptor/Gate Observation闭包、实现规格/checklist、E2E Runner实现规格 |
| Recovery Factory必须由独立`recovery-test-tools.jar`调用exact Runtime JAR产品类，按21表契约原子物化；强停必须由PropertiesLauncher装载test launcher并按Launch Request/Proof `0.1`校验challenge/PID/nonce/reachpoint后执行 | 已冻结测试隔离边界 | Recovery Execution设计v1.5、Factory output闭包规格、Recovery runner实现规格 |
| Recovery HTTP请求只允许test-only eager filter在Controller前验证raw JCS，再由body advice复核parsed object；拒绝固定422且Controller/Service/repository调用为0 | 已冻结请求证据边界 | Recovery Execution设计v1.5、Reopen/HTTP JCS闭包规格 |

## 6. 维护规则

1. 需求编号、能力编号、规则组编号和模块编号不得在不同文档建立冲突定义。
2. 需求或配置档变化时，同步检查验收矩阵、符合性矩阵、公共内核和架构模块归属。
3. 架构决策状态必须使用 `ACCEPTED/PROPOSED/DEFERRED`，不得把推荐项静默写成事实。
4. 新增页面、接口、原型或开发准备文档后，必须同步本索引和建议阅读顺序。
5. 测试设计、规则实现和执行证据分开管理，不把“有验收入口”表述为“已经通过测试”。
6. 全局设计状态和开发门只由 `design/opm-design-freeze-baseline.md` 计算；任一冻结输入变化先关闭开发门，再评审和升版。
