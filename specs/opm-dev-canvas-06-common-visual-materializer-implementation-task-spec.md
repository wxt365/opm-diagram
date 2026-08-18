# Spec: GOLDEN-AUTHORING-03C Common Visual Materializer 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NOT_STARTED`

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-03C`：由 exact Runtime JAR 在 release-golden-authoring、non-web 模式把 02B 的 8 个 Common Visual Fixture 分别物化为隔离 SQLite V1 immutable base，写出可复核 attestation，为 72 个 Common capture 的两个 attempt 创建 144 个 fresh clone，并提供 03B 调用适配与 `BLOCKED_FEEDBACK` 唯一的一次性进程内 fault hook。

本包不执行完整浏览器 capture，不生成 candidate、Authoring Report、Approval、approved version、Visual Manifest/Report 或 production Gate 证据。

## 2. 设计输入

唯一设计事实源为：

- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.3`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md` `v1.4`；
- `specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`；
- Common Visual Fixture `0.1/0.1.0`、Capture Plan `0.1/0.1.0` 和 SQLite V1；
- exact Runtime JAR、active binding 与 03A 已实现的 direct SQLite seed/clone/JCS 模式。

实现不得重新决定启动 guard、SQLite 表/顺序、ID、index、attestation、clone、fault hook、Projection、错误优先级、性能或 03B 调用边界。

## 3. 前置条件与依赖

1. 02B implementation checklist 全部通过，新 fixture/Catalog 能由只读 verifier 消费；
2. 全局开发门为 `READY_FOR_DEVELOPMENT`；
3. Java 21、exact Spring Boot Runtime JAR 和 SQLite V1 migration 可用；
4. 03A 的 `RuntimeActiveBindingProvider`、`ProjectDatabaseFactory`、RFC 8785 helper 和 clone verifier 只允许复用，不得改变其 Family 行为；
5. 02B已生成并验证`tests/e2e/release/dev-canvas-06/fixtures/common-visual-jcs-vectors.json`；
6. 受控测试输入与 production authoring root 隔离，测试结果不得冒充 release evidence。

03B 必须保持 `BLOCKED_BY_DEPENDENCY`，直到本包和 02B checklist 都完成；依赖完成后也只恢复实现资格，不自动生成 production candidate。

## 4. 修改边界

允许修改：

- `services/local-runtime/src/main/java/org/opm/localruntime/releaseauthoring/visualcommon/**`；
- `services/local-runtime/src/test/java/org/opm/localruntime/releaseauthoring/visualcommon/**`；
- 为默认 no-op fault hook 和唯一 release-only injection point 所必需的 `storage/**` 或 `application/**` 最小修改及原有回归测试；
- 新增 `scripts/canvas06-common-visual-materialization.mjs` 及定向测试，作为 03B 唯一调用适配；
- `package.json` 中仅新增 03C 定向测试/验证入口，不新增依赖；
- 本规格、对应 checklist 和必要实现状态入口。

禁止修改：

- SQLite V1 DDL/Flyway migration、Revision/Profile/Rule/Grammar/Symbol；
- Common Fixture/Catalog/Capture Plan/Environment/Authoring Report 既有 Schema；
- 公共 HTTP API、Controller route、OpenAPI、Vue、默认 production 配置；
- 03A Family Materializer 的输入/报告/quarantine 语义；
- 03B candidate writer、Approval/Publisher、Visual Manifest/Runner；
- 现有 fixture/Catalog/Plan/release/approved bytes、Candidate、Activation、Capability 或 ISO 状态。

## 5. Runtime CLI 与装配

每个 base 的唯一 CLI 为：

```text
java -jar <exact-runtime.jar> \
  --spring.profiles.active=release-golden-authoring \
  --opm.release.golden-authoring=true \
  --opm.release.visual-common-materializer=true \
  --spring.main.web-application-type=none \
  --opm.release.visual-common.fixture=<exact-fixture> \
  --opm.release.visual-common.storage-root=<new-empty-root> \
  --opm.release.visual-common.attestation-out=<fresh-path> \
  --opm.release.source-date-epoch=<same-integer>
```

Materializer 只在 profile、两个 boolean、non-web 和完整参数都来自 command-line property source 且精确匹配时装配。缺项、重复、非 command-line 覆盖、Web server 配置或默认生产启动均拒绝；不得注册 controller、route、actuator/JMX 写入口或监听端口。

## 6. SQLite、Attestation 与 Clone

### 6.1 单 base 事务

1. 目标 subject root 和 attestation path 必须 fresh，storage root 必须为空且无 symlink；
2. 按 `SQLite V1 migration -> package rows -> project -> model -> revision -> head -> indexes -> staged verify -> COMMIT -> close -> read-only reopen` 唯一顺序执行；
3. Revision JCS bytes、binding、schema set、Project/Model/Revision identity、`generated_at`、主设计第4.2.1节空Text Artifact/Trace及第4.3/6.2节五类index entry逐字段/排序/固定ID时间状态/null/计数必须与fixture深度相等；
4. transaction、commit/reopen/integrity/FK/sidecar 任一失败回滚，只清理本次 fresh root；
5. 不走公共 API、随机 ID、普通 commit command 或 03A Family report pipeline。
6. base提交后必须复算`revision_document_count=1/text_artifact_count=1/text_trace_count=0`；`text_artifact_count`只统计`revision_document.document_json`中Schema-valid object，`text_trace_count`只统计`text_trace_index`行，禁止按Sentence或顶层数组计数。

### 6.2 Attestation

成功后原子写封闭 `attestation.json`：

```text
contract_version,subject_id,fixture_ref,project_id,model_id,revision_id,
database_ref,semantic_state_sha256,committed_projection_sha256,index_counts,
materializer_identity,source_date_epoch
```

03C verifier 必须复算数据库 raw ref、semantic state、committed Projection、identity/count、materializer JAR/source 和 epoch。Attestation 是内部受控 artifact，不是 Gate Report；Schema-like 校验通过不等于 release evidence。

### 6.3 Base 与 144 Clone

1. 先按 Catalog 顺序创建并验证 8 个 base，base 成功后只读；
2. 03B adapter 按 Plan capture 顺序、attempt `1,2` 创建 `72*2=144` 个 fresh clone；
3. clone 路径固定为 `<subject>/attempts/<capture-id>/<attempt>/storage`，只复制该 subject base storage；
4. clone 前后复算 base tree digest，Runtime 关闭后复算 attempt storage；
5. Runtime、Web process、browser context、view state 和 fault hook 不跨 attempt 复用；
6. 任一 base/clone失败阻断全部 Common authoring，禁止跳过或使用静态 screenshot 降级。

## 7. 一次性 Fault Hook

普通 Runtime commit path 新增一个默认 no-op 的窄接口；只有 `BLOCKED_FEEDBACK` attempt 在 release authoring 受控启动中装配实现。固定启动值为：

```text
--opm.release.visual-common.fault-hook=sqlite.revision-commit.before-insert
--opm.release.visual-common.fault-command-id=command.visual.blocked-feedback.persistence-failed
--opm.release.visual-common.fault-max-invocations=1
```

三项必须同时出现并 byte-for-byte 相等，只允许目标 subject/command。hook 在 validation 通过、revision insert 前触发一次 `PERSISTENCE_FAILED` 后自动永久禁用；第二次相同 command 走正常路径。其他 subject、Family、default/production Runtime、Visual validation runner 和 HTTP 请求不得装配或切换 hook。禁止通配符、环境变量覆盖、运行时 setter、公开 API、共享静态计数和跨进程复用。

## 8. 03B 调用适配

`scripts/canvas06-common-visual-materialization.mjs` 只导出并测试以下固定职责：

1. 从 `Plan -> Catalog -> fixture exact ref` 派生 8 项，禁止 subject/fixture/Projection override；
2. 调用 exact Runtime JAR 创建 8 base并验证 attestation；
3. 对每个 capture/attempt 创建 fresh clone，生成正常 Runtime 启动参数；
4. 仅对 `BLOCKED_FEEDBACK` 注入第 7 章固定参数；
5. capture 后关闭 Runtime，校验 clone 结果和 base digest，再返回 normalized result；
6. 不写 Environment、Authoring Report、candidate PNG、Approval、approved root 或 Manifest。

调用顺序固定为：

```text
verify Plan/Catalog/fixture/color mapping
-> build 8 immutable bases
-> verify 8 attestations
-> for each Common capture and attempt clone/start/setup/normalize/capture/close
-> verify all 144 results and base digests
-> return control to 03B candidate transaction
```

03C 的受控集成测试可用 capture callback 代替 PNG writer，但不得 mock SQLite/Runtime read path、attestation、clone 或 fault hook。

## 9. 错误、原子性与退出码

首错优先级采用主设计：CLI/path/source owner -> Schema/source mirror/raw ref -> fixture payload -> Handoff/binding -> Runtime JAR -> color mapping -> target empty -> migration -> seed -> storage verify -> clone -> Runtime/Web ready -> UI setup -> Projection/focus/cell -> stability -> capture/determinism -> writer/internal。03C从已由02B verifier闭合的Catalog/fixture ref读取输入，不重新选择source，也不接收`--source-root`。

03C 必须实现并透传：`GOLDEN_COMMON_INPUT_INVALID/2`、`GOLDEN_COMMON_FIXTURE_SCHEMA_INVALID/2`、`GOLDEN_COMMON_FIXTURE_REF_MISMATCH/2`、`GOLDEN_COMMON_MODE_REJECTED/2`、`GOLDEN_COMMON_BINDING_MISMATCH/3`、`GOLDEN_COLOR_PROFILE_MISMATCH/3`、`GOLDEN_COMMON_STORAGE_NOT_EMPTY/3`、`GOLDEN_COMMON_MIGRATION_FAILED/3`、`GOLDEN_COMMON_SEED_FAILED/3`、`GOLDEN_COMMON_STORAGE_VERIFY_FAILED/3`、`GOLDEN_COMMON_CLONE_FAILED/3`、`GOLDEN_COMMON_UI_SETUP_FAILED/3`、`GOLDEN_COMMON_PROJECTION_MISMATCH/3`、`GOLDEN_COMMON_INTERNAL_ERROR/4`。

任何失败不得产生 READY Authoring Report、Environment、Approval、approved root 或 Manifest。已有路径、base、其他 attempt、03A storage 和用户数据不得删除、覆盖或修复；只允许清理本次创建且尚未提交的 fresh root。

## 10. 测试要求

### 10.1 条件装配与架构

- 完整 guard 唯一装配，逐项缺失/冲突/错误来源反例拒绝；
- authoring JAR non-web 且零 controller/route/port；
- default/production/Web/03A 模式无 Common Materializer 或 fault hook；
- 普通 Runtime API、commit 和 03A Family 回归不变。

### 10.2 SQLite 集成

- 8 fixture分别验证Project/Model/Revision/Head、binding、Revision JCS/raw digest、固定时间、空Text Artifact摘要、`text_traces=[]`、固定`1/1/0`计数、五类index每列/顺序/null和Projection；
- migration/package/每类 row/commit/reopen/integrity/FK/sidecar 故障注入与 rollback；
- 非空、symlink、重复目标拒绝且原内容不变；
- attestation payload/ref/semantic state/identity/count 单变量篡改全部拒绝。
- Java `Rfc8785JsonCanonicalizer`只读消费02B同一parity vector，10项canonical JSON text/SHA与Node expected逐项相等；safe integer边界、UTF-16 key排序、lone surrogate及其他非法Java值拒绝，允许修正现有类但不得新增第二canonicalizer。

### 10.3 Clone 与 Fault

- `8/72/144`、路径、顺序、fresh clone、base digest 和双 attempt 隔离；
- 同 capture 两 clone互不影响，任一失败停止后续调度且已存在 base 不变；
- exact `BLOCKED_FEEDBACK` command 只失败一次，第二次正常；错误 subject/command/次数/默认模式全部拒绝或使用 no-op；
- 真实 UI setup/Projection 由后续 03B E2E 覆盖，本包验证 adapter 参数、Runtime状态和 normalized callback contract。

### 10.4 JAR 与性能

- 必须使用 Maven 产出的 exact Spring Boot JAR，不允许 exploded classpath 冒充；
- 受控 8 base全部 materialize/reopen，144 clone全部创建/验证；
- 单 base P95 `<=5 s`、8 项串行 `<=30 s`、单 clone加 ref复核 P95 `<=1 s`、额外 peak RSS `<=512 MiB`；
- 性能阈值属于 release tooling，不是 ISO 19450:2024 要求。

## 11. 验证命令

实现后至少执行：

```text
npm run release:canvas06:common-visual:test
npm run release:canvas06:common-visual:materialize:test
./mvnw -pl services/local-runtime test
./mvnw -pl services/local-runtime package
npm run release:canvas06:common-visual:materialize -- <受控 Plan/Catalog/JAR/root/epoch>
npm run contract:validate
npm run backend:verify
git diff --check
```

## 12. 完成定义

release-only Java Materializer、8 base、attestation/verifier、144 clone、default no-op/一次性 fault hook、03B adapter、正反 JAR/SQLite/架构测试和性能全部通过，implementation checklist 记录 exact JAR/ref/计数/命令。完成后只可声明 `IMPLEMENTED/NOT_RELEASE_VALIDATED`；不得把受控 8/144 测试写成 production candidate、GATE READY、Capability enablement 或 ISO 证明。

## 13. 回滚

回滚删除 03C 新增 package、adapter、test/command 和默认 no-op injection point，并恢复被修改类的原行为。不得修改 SQLite V1、删除 03A/历史/approved/user storage，或通过关闭 guard、降低计数、共享 clone、禁用 fault test 来回滚失败。

## 14. 事实与假设

事实：Common Visual Fixture`0.1`机器Schema及index/UI/source设计已冻结；当前仓库只有03A Family materialization模式，没有本规格的Common Visual Materializer、8 base、144 clone attestation或受控fault hook实现。假设：无；exact JAR SHA、数据库ref、性能和production authoring结果必须由未来实际执行产生。
