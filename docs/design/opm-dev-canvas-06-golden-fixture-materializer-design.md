# DEV-CANVAS-06 Golden Fixture Materializer 设计

文档版本：`1.5`

设计状态：`FROZEN`

实现状态：`IMPLEMENTED_RELEASE_EXECUTION_PENDING`

对应开发包：`GOLDEN-AUTHORING-03A`

## 1. 文档定位

本文档是 DEV-CANVAS-06 release authoring 阶段把 exact Evidence Bundle `MS-REV-001` fixture 转换为隔离 SQLite 基础库的唯一设计口径。它位于 Capture Planner 和 candidate author 之间，只服务 Golden Authoring，不是产品导入、迁移、恢复或普通项目创建功能。

本文档冻结设计，不表示以下事实已经发生：

1. `GOLDEN-AUTHORING-03A` 的完整 Runtime guard、ordered preflight、失败边界、130 项 JAR integration 和性能验证已完成；
2. 任一 production Evidence Bundle fixture 已形成可发布的真实 SQLite/Materialization Report；
3. Candidate/approved PNG、Visual Manifest/Report 或 `GATE-06-03` 已生成或 READY；
4. Candidate、Activation 或任一 Capability 已启用；
5. ISO 19450:2024 符合性已证明。

当前 implementation checklist 为 `READY_FOR_PRODUCTION_MATERIALIZATION`：Report `0.1` Schema、Node 集合编排、共享 binding、ordered preflight、SQLite seed/verify、stable projection、Report pipeline、pending-quarantine 预验证、唯一四阶段 quarantine、semantic verifier、并发停止和 Java Schema pre-write validator均已实现。Catalog `v1.1` 的63/63受控case已在130项真实SQLite基线上按三种枚举顺序通过，全部case前后tree digest相等；Java 21下完整contract/backend重验通过，受控串行与并发4的130项packaged-JAR执行均为130/130。新`clean-b940ac9bb734` Handoff/Bundle与生产`READY_FOR_AUTHORING` Plan已存在；真实130项release materialization仍未执行，macOS RSS采样口径保持不变。

## 2. 目标与非目标

### 2.1 目标

1. 只从 READY Capture Plan 指向的 exact Evidence Bundle archive entry 读取 `MS-REV-001/0.2` bytes；
2. 在新空 storage 中建立具有稳定 Project、原样 Model/Revision 身份的 SQLite V1 单 Revision 快照；
3. 以同一 exact Runtime JAR 的受控 non-web 模式执行，并在任何写入前校验 Bundle、JAR、binding、fixture 和空目标；
4. 为每个已取得可信 fixture identity 的 reportable materialization 生成可复核、可由 Golden Authoring Report 0.2 exact 引用的机器报告；
5. 为每个 capture attempt 提供只读基础库和独立可写 clone，消除跨 attempt 状态污染。

### 2.2 非目标

- 不接受普通本地 JSON、Planner 临时解包文件、Common Fixture Catalog 普通 fixture 或任意用户模型；
- 不新增、复用或隐藏 HTTP endpoint，不通过 `LocalApiController` 创建 Project/Model；
- 不调用 `SqliteRevisionCommitRepository.commit()`；该路径提交的是已有 Head 之后的新 Revision，不是 seed snapshot；
- 不重建 fixture 的完整 Revision history，不生成缺失的 parent Revision；
- 不运行 OPL 生成、编辑命令、校验任务或 Capability enablement；
- 不修改 SQLite V1 DDL、Profile/Rule/Grammar/Symbol 或 source Evidence Bundle；
- 不由 Materializer 生成、比较、批准或发布 PNG。

## 3. 与 Golden Authoring 的关系

既有 `GOLDEN-AUTHORING-03` 细分为：

```text
GOLDEN-AUTHORING-02  Capture Planner
  -> GOLDEN-AUTHORING-03A  Golden Fixture Materializer
  -> GOLDEN-AUTHORING-03B  Candidate Author
  -> GOLDEN-AUTHORING-04   Approval/Publisher
  -> GOLDEN-AUTHORING-05   Visual Manifest 0.2
  -> GOLDEN-AUTHORING-06   INITIAL Authoring
```

当前 Capture Plan 的 `1170` 个 Family capture 来自 `130` 个 PASS visual variant，每个 exact fixture ref 在 `3` 个 viewport 和 `3` 个 zoom 下重复 `9` 次。Materializer 按 exact archive ref 去重后必须得到 `130` 个唯一输入和 `130` 份成功报告。

`72` 个 Common capture 对应的 `8` 个 fixture 是 Common Fixture Factory 的参数文档，不是 `MS-REV-001`。它们继续由 `GOLDEN-AUTHORING-03B` 按 Common Fixture Catalog 创建，不进入本 Materializer，不计入 `130`。

## 4. 组件与职责

| 组件 | 责任 | 禁止行为 |
| --- | --- | --- |
| Materialization Orchestrator | 校验顶层参数，从 Plan 排序去重 130 个 ref，逐项启动 exact JAR | 解析或写 SQLite；读取非 Plan fixture；并发共享 storage |
| Runtime Mode Guard | 校验 authoring profile、mode、enabled、contract version 和 non-web | 在普通/production 模式装配 Materializer |
| Runtime Active Binding Provider | 为普通 Runtime 与 Materializer提供同一五角色 binding | 在 Materializer 中复制第二套版本常量 |
| Fixture Ref Verifier | 闭合 Plan、Bundle、entry 和 raw bytes SHA | 信任路径名或 Planner 临时文件 |
| Fixture Materializer | 读取 Semantic Revision，迁移空库并执行 seed 事务 | 删除既有数据库；调用普通创建 API；生成新语义身份 |
| Materialization Verifier | 关闭连接后复核 SQLite、identity、Head、digest 和无 WAL/SHM | 只信任写入返回值 |
| Report Writer | 原子写成功或阻断 Report | 覆盖已有报告；把绝对敏感路径写入报告 |
| Report Semantic Verifier | 只读闭合 Report、database、quarantine 和 root，并输出稳定 `GFMV_*` 判定 | 自动修复输入；复用 Materializer `GFM_*`；依赖目录枚举顺序 |
| Candidate Author | 只读验证报告，按 attempt 克隆基础库后启动 web Runtime | 直接把基础库作为可写运行库；共享 attempt clone |

后续实现必须把现有 Runtime binding 常量收敛到一个 `RuntimeActiveBindingProvider`。普通 `LocalApiService` 和 Materializer 同时消费该 provider，`/opm-bootstrap.js` 现有 Profile/Rule 输出保持不变；不得为本功能新增第二套 hardcode binding。

## 5. 机器契约与版本

### 5.1 Materialization Report

新增机器资产：

| 字段 | 冻结值 |
| --- | --- |
| `schema_id` | `OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001` |
| `schema_version` | `0.1` |
| `report_version` | `0.1.0` |
| Schema 路径 | `docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json` |
| 状态 | `MATERIALIZED/BLOCKED` |

所有对象必须 `additionalProperties=false`。时间使用 UTC RFC 3339，digest 使用小写 SHA-256。Materialization Report 内部路径相对 materialization root；Authoring Report 的 `report_ref` 相对 change/approved version root。两类路径均禁止绝对路径、`..` 和 symlink。

### 5.2 Authoring Report 升版

现有 `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001/0.1` 已实现，但不含 Materialization Report 引用，只能作为历史实现输入。生产 authoring 目标冻结为同一 identity：

```text
schema_version=0.2
report_version=0.2.0
```

`0.1` Schema 文件保持不变；`0.2` 新增到：

```text
docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json
```

`0.2` 的 `READY_FOR_APPROVAL` 和 `APPROVED_PUBLISHED` 必须新增：

```text
fixture_materialization_report_refs[130]{fixture_ref_key,report_ref}
fixture_materialization_set_sha256
fixture_database_refs[130]{fixture_ref_key,database_ref}
fixture_database_set_sha256
```

两个数组均按 `fixture_ref_key` 字典序排列；对应集合 SHA 分别为各自数组的 RFC 8785 JCS SHA-256。每个 `report_ref/database_ref` 绑定 raw bytes，Report 内 database ref 必须与 Authoring Report 条目相等。`BLOCKED` 可以记录已产生的子集，但不得被审批或 Visual Manifest 消费。

生产 Approval Record 同样升为 `OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001/0.2`、`record_version=0.2.0`，Schema 路径固定为 `docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json`。其 candidate/new set digest 必须覆盖 130 份 Report 和 130 个 SQLite base；历史 `0.1` 保持不变。

### 5.3 Quarantine Marker

cleanup 二次失败不扩展 Materialization Report `0.1` 的可消费 storage 字段。新增独立诊断机器资产：

| 字段 | 冻结值 |
| --- | --- |
| `schema_id` | `OPM-DEV-CANVAS-06-GFM-QUARANTINE-MARKER-001` |
| `schema_version` | `0.1` |
| Schema 路径 | `docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-quarantine-marker.schema.json` |
| Writer owner | 顶层 Node Materialization Orchestrator |

Marker 只表示残留 storage 不可消费，不是 Report、database ref、approved evidence 或恢复入口。Schema 和 writer 由 `GOLDEN-AUTHORING-03A` 实现包落地；本轮只冻结未来机器契约，不创建 Schema。

Marker 根对象必须 `additionalProperties=false`，字段集合和生成规则固定为：

```text
schema_id="OPM-DEV-CANVAS-06-GFM-QUARANTINE-MARKER-001"
schema_version="0.1"
change_id=<Plan change_id>
fixture_ref_key=<当前 fixture key>
source_storage_path="fixtures/<fixture-ref-key>/storage"
quarantine_storage_path="quarantine/<fixture-ref-key>/storage"
primary_failure_code=<BLOCKED Report primary_failure.code>
cleanup_failure_code="GFM_CLEANUP_FAILED"
generated_at=<source_date_epoch 对应 UTC RFC 3339>
marker_payload_sha256=sha256(JCS(marker 中除 marker_payload_sha256 外的全部字段))
```

`change_id`、`fixture_ref_key`、两条相对路径、失败码和时间必须由 Orchestrator 从 exact Plan、固定布局及已经通过第 13.2 节 pending-quarantine 预验证的 BLOCKED Report复算，不接受 CLI override。Marker Schema 只能表达对象形状；路径/key、Report、quarantine 实体和 payload digest 的最终闭合仍由第 12.4 节完整 verifier 负责。

## 6. 输入契约

### 6.1 顶层输入

Orchestrator 只接受：

1. `READY_FOR_AUTHORING` Capture Plan `0.1` exact file ref；
2. Plan `input_materialization.bundle_ref` 指向的 Evidence Bundle exact file ref；
3. Plan `runtime_jar_ref` 指向的 exact Runtime JAR；
4. 与 Plan 相同的 `change_id/source_date_epoch`；
5. 一个不存在或存在且为空的 materialization root；
6. 可选整数 `concurrency`，值域 `1..4`，缺省为 `1`。

禁止接受 `--fixture-file`、任意解包目录、任意 Project/Model/Revision ID、任意 binding override、`--force`、`--overwrite`、`--skip-*` 或 `--continue-on-error`。

### 6.2 fixture 集合

从 Plan 计算：

```text
family_refs = captures
  .filter(capture_kind == FAMILY)
  .map(fixture_ref)

fixture_ref_key = sha256(JCS({
  path,
  byte_length,
  sha256,
  bundle_sha256,
  archive_entry_path
}))

unique_family_refs = unique(family_refs by fixture_ref_key)
```

必须同时满足：

```text
family_capture_count=1170
unique_family_fixture_count=130
occurrence_count_per_fixture_ref=9
every fixture_ref is archiveEntryRef
every fixture_ref.bundle_sha256 == bundle_ref.sha256
```

同一 `fixture_ref_key` 出现不同字段值、同一 archive entry 对应多个 SHA、少于或多于 130 个唯一 ref 均阻断整个 orchestration，且在启动任何 Materializer 子进程前失败。

### 6.3 单项输入

每个 Runtime 子进程接收 Capture Plan、Evidence Bundle、Runtime JAR 自身、`fixture_ref_key`、新空 target storage、fresh report path 和固定 epoch。Runtime 必须从 Plan 重新定位 exact `archiveEntryRef`，不得信任 Orchestrator 传入的展开字段。

Planner 临时物化目录不是输入。Runtime 使用只读 ZIP/JAR entry stream 读取目标 entry，不把 fixture 解包到长期目录。

## 7. 身份契约

`MS-REV-001/0.2` 没有 `project_id`。因此身份冻结为：

```text
project_id = "project.golden.fixture." + source_fixture_ref.sha256
model_id = fixture.model_id
revision_id = fixture.revision_id
revision_sequence = fixture.revision_sequence
draft_head_revision_id = fixture.revision_id
head_sequence = fixture.revision_sequence
```

Project ID 使用 fixture 完整 64 位 SHA，不截断；它满足现有稳定 ID 长度/字符约束。Project 是 release authoring 合成容器，不得声称来自源 fixture。Model/Revision ID 和 sequence 必须 byte-for-byte 保持 fixture 值。

`fixture.model_header.model_id` 必须等于根 `model_id`；Report 中 input/output Model、Revision、sequence 和 Head 必须相等。任何 collision 或不等均返回 `GFM_IDENTITY_MISMATCH`。

fixture 可含 `parent_revision_id`，但输入不包含 parent fixture 时不得伪造历史。输出固定：

```text
history_mode=SINGLE_REVISION_SNAPSHOT
revision_parent_count=0
```

Revision 原文仍保留 `parent_revision_id` 字段；SQLite `revision_parent` 不写记录。该边界只允许 release visual 只读 seed，不得用于历史浏览或普通编辑基线。

## 8. 受控 Runtime 启动

### 8.1 稳定入口

顶层稳定入口冻结为：

```text
npm run release:canvas06:golden:materialize -- \
  --plan <capture-plan> \
  --evidence-bundle <exact-bundle> \
  --runtime-jar <exact-intake-jar> \
  --materialization-root <new-empty-root> \
  --source-date-epoch <same-integer> \
  --concurrency <1..4, default 1>
```

Orchestrator 对每个 ref 启动：

```text
java -jar <runtime-jar> \
  --spring.profiles.active=release-golden-authoring \
  --spring.main.web-application-type=none \
  --opm.runtime.mode=RELEASE_GOLDEN_FIXTURE_MATERIALIZE \
  --opm.release-authoring.materializer.enabled=true \
  --opm.release-authoring.contract-version=0.1.0 \
  --opm.release-authoring.capture-plan=<capture-plan> \
  --opm.release-authoring.evidence-bundle=<bundle> \
  --opm.release-authoring.fixture-ref-key=<fixture-ref-key> \
  --opm.release-authoring.expected-runtime-jar-sha256=<plan-jar-sha256> \
  --opm.storage.root=<new-empty-target-storage> \
  --opm.release-authoring.report-out=<fresh-report-path> \
  --opm.release-authoring.source-date-epoch=<same-integer>
```

五个 guard 参数必须来自 command-line property source，active profile 必须恰为单个 `release-golden-authoring`。缺失、重复、来自环境变量/配置文件、值不等或增加 production profile 均不装配 Materializer，并以稳定失败退出。

### 8.2 生产隔离

1. 普通/production 启动缺任一 guard 时 Materializer bean 必须不存在；
2. `enabled=true` 与 web application、非 authoring mode 或非 authoring profile 同时出现时启动必须失败，不能降级启动 Web；
3. authoring 进程不得监听 TCP 端口，不创建 session token，不提供 actuator、静态 Web、`/api/v1/**` 或 `/opm-bootstrap.js`；
4. Materializer package 中禁止 `@Controller`、`@RestController`、`@RequestMapping` 和 router/function endpoint；
5. 子进程写完 Report 后必须主动以确定退出码结束，不作为常驻服务；
6. 普通 Runtime 的现有 API、默认存储和 bootstrap binding 输出不得因该包改变。

## 9. 启动前校验与优先级

所有校验必须在创建 storage 目录或 SQLite 前完成，固定顺序为：

| 顺序 | Check ID | 必须条件 |
| --- | --- | --- |
| 1 | `GFM-CHECK-MODE` | profile/mode/enabled/contract/non-web 全 exact |
| 2 | `GFM-CHECK-ARGS` | 参数唯一、路径归属、report 不存在 |
| 3 | `GFM-CHECK-RUNTIME-JAR` | CodeSource 是当前普通文件 JAR；size/SHA 与 Plan ref、CLI expected 相等 |
| 4 | `GFM-CHECK-PLAN` | Plan Schema 合法、status READY、change/epoch 相等 |
| 5 | `GFM-CHECK-FIXTURE-MEMBERSHIP` | key 在 130 个唯一 Family refs 中恰好出现一次 |
| 6 | `GFM-CHECK-BUNDLE` | bundle path/size/raw SHA 与 Plan exact ref 相等 |
| 7 | `GFM-CHECK-ARCHIVE` | entry 无绝对路径、`..`、symlink、重复名、大小/压缩比越界 |
| 8 | `GFM-CHECK-FIXTURE` | entry size/raw SHA exact；JSON 为 `MS-REV-001/0.2` |
| 9 | `GFM-CHECK-BINDING` | fixture、Plan active binding、Runtime provider 五角色及 binding digest 全等 |
| 10 | `GFM-CHECK-STORAGE` | storage path 归属 materialization root、无 symlink、目标不存在或为空 |

首个失败是 `primary_failure`，后续 check 记为 `NOT_RUN`。不得通过调整检查执行顺序改变同一输入的主错误码。

Runtime JAR 必须通过当前进程 `ProtectionDomain/CodeSource` 定位并重新计算，不接受仅由 Orchestrator 自报的 SHA。测试中的 exploded classpath 只能注入 verifier 单测，不能生成 `MATERIALIZED` release Report。

### 9.1 Report 接纳点

只有 `GFM-CHECK-FIXTURE` 成功完成 exact entry size/raw SHA、UTF-8、JSON 和 `MS-REV-001/0.2` Schema 校验，并从已验证 bytes 取得真实 `fixture_identity` 后，单项调用才成为 `reportable invocation`。接纳点位于 Check 8 标记 `PASSED` 之后、`GFM-CHECK-BINDING` 开始之前。

`fixture_identity` 只能来自上述已验证 fixture bytes。不得从 Capture Plan、文件名、archive metadata、expected ref、空值、占位常量或部分解析结果推导或补齐。

### 9.2 Pre-acceptance rejection

`GFM-CHECK-MODE` 至 `GFM-CHECK-FIXTURE` 任一失败均为 `pre-acceptance rejection`：

1. 输出稳定错误码、脱敏 stderr 和第 14.2 节既有非零退出码；
2. storage、SQLite、Report 临时文件和最终 Materialization Report 均为零输出；
3. 不生成 BLOCKED Report，不填占位、expected 或部分 `fixture_identity`；
4. Orchestrator 停止后续项，已成功 sibling 不得被 Candidate Author 消费。

### 9.3 Post-acceptance failure

调用被接纳后，`GFM-CHECK-BINDING`、`GFM-CHECK-STORAGE`、migration、seed、commit 和 post-commit verify 失败，以及 success Report 内容的可归类跨字段不一致，必须使用已验证 fixture identity 生成 Schema-valid `BLOCKED` Report。

JCS canonicalizer、SHA-256 engine、Schema validator 或 serializer 自身不可用、抛出内部错误或不能可靠复算时，不得再调用同一失败机制伪造 BLOCKED Report；该边界按第 12.3 节输出零最终 Report。Report temp/write/rename 失败按第 12.3 节处理，cleanup/quarantine 按第 13 章处理。

## 10. SQLite 物化

### 10.1 路径与空目标

布局固定为：

```text
<materialization-root>/
  fixtures/<fixture-ref-key>/storage/
    projects/<project-id>/project.db
  reports/<fixture-ref-key>.json
```

Orchestrator 必须排他创建空 `materialization-root`。每个子进程的 `storage` 在启动前必须不存在或为空；`reports/<key>.json` 必须不存在。Materializer 不删除或重置任何既有文件。

### 10.2 migration 与 seed 事务

1. 使用现有 `ProjectDatabaseFactory` 和 Flyway 创建 SQLite V1；
2. Flyway READY 后开启一个 `foreign_keys=ON` 的 seed transaction；
3. 按固定顺序写入：`project_metadata -> profile_package -> rule_set_package -> grammar_package -> model_catalog -> revision_document -> model_head`；
4. `profile_binding_json` 写 fixture 完整五角色 binding，`schema_set_json` 写 fixture exact `schema_set_ref`；
5. `document_json` 写经 UTF-8 验证的 fixture 原始 bytes，`document_digest` 等于 fixture raw SHA；
6. `commit_reason=GOLDEN_FIXTURE_MATERIALIZED`，所有时间等于 `source_date_epoch` 对应 UTC；
7. Profile/Rule/Grammar package JSON 只写封闭 `{source:GOLDEN_FIXTURE_MATERIALIZER,asset_ref:<exact fixture ref>}`，不冒充完整 package；
8. 所有写入成功后一次 commit；任一失败必须 rollback。

不写 `revision_parent`、operation、idempotency、task、asset、element/fact/occurrence/finding/text trace index。它们不是单 Revision visual seed 的必要历史或命令证据。

### 10.3 固定业务行数

成功后必须满足：

```text
project_metadata=1
profile_package=1
rule_set_package=1
grammar_package=1
model_catalog=1
revision_document=1
model_head=1
revision_parent=0
operation_record=0
idempotency_record=0
background_task=0
asset_manifest=0
element_index=0
fact_endpoint_index=0
occurrence_index=0
finding_index=0
text_trace_index=0
```

`schema_metadata` 和 Flyway history 由 migration 管理，不计入业务行数，但版本必须分别为 `1.0` 和当前 exact migration set。

### 10.4 提交后复核

关闭写连接后以新只读连接完成：

1. `PRAGMA integrity_check` 恰为 `ok`；
2. `PRAGMA foreign_key_check` 返回零行；
3. 固定行数、Project/Model/Revision/Head/binding/document SHA 全相等；
4. 使用正式 Semantic Revision reader 从 `document_json` 重读成功；
5. 使用正式 SQLite read path 重开该 Project/Model/Revision；
6. 关闭全部连接后不存在 `project.db-wal`、`project.db-shm` 或 journal；
7. 计算 database raw file ref 和 semantic state digest。

`semantic_state_sha256` 固定为：

```text
sha256(JCS({
  storage_schema_version,
  project_id,
  model_id,
  revision_id,
  revision_sequence,
  draft_head_revision_id,
  head_sequence,
  profile_binding,
  document_sha256,
  table_counts
}))
```

### 10.5 稳定语义投影与单次运行证据

相同 Plan、Bundle、fixture、Runtime JAR、binding、epoch 和空 root 的两次成功 materialization，必须得到相同的 stable projection：

```text
stable_projection={
  materialization_id,
  fixture_ref_key,
  source_fixture_ref,
  runtime_binding,
  fixture_identity,
  materialized_identity,
  storage_schema_version,
  table_counts,
  document_sha256,
  semantic_state_sha256
}
```

`generated_at` 固定为 `source_date_epoch` 对应的 UTC RFC 3339。`database_sha256`、`stage_durations_us`、`peak_rss_bytes`、`report_payload_sha256` 和 Report 文件 raw SHA 是单次运行证据：每次都必须对本次 exact bytes 闭合，但不要求跨空 root 重建相等。SQLite/Flyway 物理 bytes 或运行测量差异不得改变 stable projection，也不得被误报为语义不一致。

## 11. attempt 隔离

成功基础库只作为 immutable candidate input。`GOLDEN-AUTHORING-03B` 对每个 capture attempt 必须：

1. 验证 exact `MATERIALIZED` Report raw SHA、database ref/SHA 和 semantic state SHA；
2. 创建全新空 attempt storage；
3. 复制 `storage/**`，复制后再次校验 database raw SHA；
4. 只把 clone 传给正常 web Runtime；
5. attempt 完成后关闭 Runtime，保留或清理 clone 均不得修改基础库；
6. 两次 determinism attempt、不同 capture、viewport 或 zoom 禁止共享可写 clone。

同一 fixture 的 9 个 capture、每个 capture 的 2 次 attempt 共 18 个 clone 可以顺序创建和清理，但身份始终相同。基础库任何 SHA 变化都使全部关联 capture 阻断。

Approval/Publisher 必须把完整 `materialization/` 子树按相同相对布局复制到 approved version，并复核 130 份 Report 和 130 个 database raw SHA。由此 Report 内 `fixtures/<key>/storage/**` ref 在 approved version 中继续可解析；只复制 Report、不复制 database 不构成可复核发布。

## 12. Materialization Report

### 12.1 必填字段

每个按第 9.1 节被接受的单项 invocation 必须原子写一份 Report；pre-acceptance rejection 不属于本 Schema 的 Report 实例：

```text
schema_id, schema_version, report_id, report_version, report_status,
change_id, materialization_id, generated_at, source_date_epoch,
runner_identity{contract_version,runtime_jar_ref,java_version,java_vendor,command},
capture_plan_ref, evidence_bundle_ref, source_fixture_ref, fixture_ref_key,
runtime_binding, fixture_identity,
materialized_identity?, target_storage?, persistence?,
checks[], primary_failure?, failures[], report_payload_sha256
```

其中：

```text
materialization_id = "dev-canvas-06.fixture-materialization." + change_id + "." + fixture_ref_key
report_id = materialization_id
fixture_identity = {schema_id,schema_version,model_id,revision_id,revision_sequence,parent_revision_id,fixture_sha256}
materialized_identity = {project_id,model_id,revision_id,revision_sequence,draft_head_revision_id,head_sequence,history_mode}
target_storage = {storage_root,database_ref,storage_schema_version,database_sha256,semantic_state_sha256}
```

`report_payload_sha256=sha256(JCS(report 中除 report_payload_sha256 外的全部字段))`。Authoring Report 使用 Report 文件 raw bytes ref，不得以 payload SHA 代替文件 SHA。

`runtime_binding` 始终记录当前 `RuntimeActiveBindingProvider` 的实际五角色 binding。MATERIALIZED 时它与 Plan/fixture 全等；`GFM_BINDING_MISMATCH` BLOCKED 时允许不等，但 verifier 必须从 exact Plan 和 fixture 独立取得 expected binding 并证明不匹配，禁止把 expected binding 回填成 observed binding。

### 12.2 状态规则

`MATERIALIZED` 必须满足：

- 10 个 preflight checks 全 `PASSED`；
- transaction `COMMITTED`；
- 固定 table counts、integrity、foreign key、identity、reopen、无 sidecar 全 matched；
- `failures=[]`；
- `materialized_identity/target_storage/persistence` 全存在。

`BLOCKED` 必须满足：

- Check 1~8 全部为 `PASSED`；Binding/Storage 失败时当前项为 `FAILED`、后续为 `NOT_RUN`，持久化及以后失败时 10 项 preflight 全部为 `PASSED`；
- `failures` 至少一项；
- `primary_failure` 等于首个失败；
- `source_fixture_ref/fixture_identity` 来自已验证 exact fixture bytes，不得使用占位或 expected identity；
- 不含可消费 database ref；
- cleanup 成功时 target storage 在报告完成前已恢复为不存在或为空；若 cleanup 自身失败，原始业务失败继续是 `primary_failure`，`failures[]` 按发生顺序追加 `GFM_CLEANUP_FAILED`，残留目录必须按第 13.2 节 quarantine，Report 仍不得包含 `target_storage`；
- 不能进入 Authoring Report 的 130 个 success refs。

Report 先写同目录 fresh 临时文件，复算 Schema/payload SHA 后 atomic rename。已有目标 Report 不得覆盖；该情况在 materialization 被接受前即以 stderr/退出码拒绝，不算一次可报告 invocation。

### 12.3 Report pipeline 与不可报告失败

Report pipeline 固定为：

```text
ReportContext
  -> success content assembly
  -> recoverable cross-field validation
  -> RFC 8785 JCS + payload SHA
  -> Report 0.1 Schema validation
  -> same-directory fresh temp
  -> atomic rename
```

1. success content 缺字段、identity/ref/count 不一致，但 JCS、digest、Schema 和 serializer 仍健康时，先 cleanup storage，再用独立最小 `BlockedReportContext` 生成 `GFM_REPORT_CONTENT_INVALID` BLOCKED Report；
2. JCS、digest、Schema engine 或 serializer 自身不可用、抛出内部错误或不能复算时，固定 `GFM_REPORT_ENGINE_FAILED/4`、脱敏 stderr、零最终 Report；禁止用同一失败 engine 再生成 BLOCKED Report；
3. report-out 不可写、临时文件无法创建、fsync 或 atomic rename 失败时，固定 `GFM_REPORT_WRITE_FAILED/4`、脱敏 stderr、零最终 Report；
4. 第 2、3 项发生在成功数据库创建后时，必须 best-effort cleanup；cleanup 失败由 Orchestrator 按第 13.2 节 quarantine；
5. 最终路径不得留下部分、旧的、未通过 Schema 或 payload 复算失败的 Report。

### 12.4 Materialization Report Semantic Verifier

JSON Schema 只负责对象封闭、类型、枚举、长度和基本状态字段，不承担 JSON Schema 无法表达的跨字段闭包。唯一只读 verifier 入口冻结为：

```text
npm run release:canvas06:golden:materialize:verify -- \
  --plan <capture-plan> \
  --materialization-root <materialization-root> \
  [--fixture-ref-key <one-key>] \
  [--require-materialized]
```

Verifier 必须复核：

1. `checks[]` 恰为第 9 章十个 ID 的固定顺序且各唯一；
2. MATERIALIZED、Binding/Storage BLOCKED、持久化/Report content BLOCKED 的状态序列符合第 12.2 节；
3. `report_id=materialization_id`，change/key 与路径相等；
4. Plan、Bundle、fixture、observed Runtime binding、fixture/materialized identity 和 stable projection 闭合；
5. payload SHA、Report raw SHA、database raw SHA、semantic state、table counts、sidecar 和 reopen 可独立复算；
6. `primary_failure=failures[0]`，secondary failure 顺序、error/check 对应和 quarantine 状态合法；
7. quarantine marker 通过其 `0.1` Schema，字段、payload SHA、固定路径、BLOCKED Report primary failure 和实际残留 storage 全闭合；
8. root 不含额外 Report/database、symlink、临时文件或未解释 quarantine。

完整 verifier 永不接受 pending 过渡态：`fixtures/<key>/storage` 仍含 cleanup residual 且 marker/最终 quarantine 配对尚未形成时，普通 selected/full 调用必须按既有 root 规则拒绝。只有第 13.2 节的窄化、只读、内存 attestation 入口可以在移动前检查该状态；该入口不是本 CLI 的 mode，不能通过 flag 暴露给 Candidate Author、Publisher 或 Golden Verifier。

退出码固定为：`0=结构与语义合法`、`2=输入/Schema/ref/root 非法`、`3=结构合法但 BLOCKED/缺失/不可消费`、`4=I/O 或内部错误`。Materializer 写后、Candidate Author、Publisher 和 Golden Verifier 必须调用同一 verifier；`--require-materialized` 下任一合法 BLOCKED、缺失或闭合 quarantine 固定返回 `3`，未知 key、额外 Report/database、symlink、临时文件或路径逃逸属于非法证据并固定返回 `2`。单纯 Schema-valid 不构成可消费证据。

### 12.5 受控 case 与确定性

[Materialization Verifier 受控 Case Catalog](./opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md) 是 verifier factory、`GFMV_*`、首错优先级和 Report/root 正反例的唯一事实源。本设计冻结以下调用边界：

1. full-root 无 `--fixture-ref-key`，只有 130/130 MATERIALIZED、零 quarantine/缺失/额外项且 `--require-materialized` 才能作为下游集合门；
2. selected 模式仍扫描整个 root 的 symlink/路径逃逸/额外项，只对选中 key 做 Report/database 语义验证；返回 `0` 只证明单项，不证明 130 项完整；
3. `K001~K130` 只作为测试 alias，机器输入始终使用实际 64 位 `fixture_ref_key`；
4. 所有普通反例只改变一个语义维度，除 digest 专用 case 外重算受影响 payload/raw ref；
5. top code 固定按 CLI、Plan、root safety、actual key 字典序单项、集合完整性、可消费性选择；同一 key 内按 Schema、checks、identity/path、payload、input ref、binding、fixture identity、failure、database、semantic state、quarantine 选择；
6. verifier 前后 root tree digest 必须相等，不得 cleanup、rename、quarantine、补 digest 或产生 verifier Report；
7. Catalog `v1.1` 的 63/63 受控 case通过是实现验收输入；其中原 57 个完整 verifier case保持不变，新增 6 个只覆盖 pending-quarantine 预验证。这些结果都不是 production 130 项 release evidence。

## 13. 并发、幂等与恢复

1. Orchestrator 按 `fixture_ref_key` 字典序建立队列；`--concurrency` 缺省 `1`、值域 `1..4`，每项目录、进程和 SQLite 完全隔离；
2. 同一 key 只能有一个 active lock，lock 位于 materialization root，不进入 Report ref；
3. 相同 change/key 的成功输出不允许原地重放，report 或 storage 已存在即失败；只读 verify 可重复且结果相同；
4. 如需重跑，必须人工清理整个未批准 change materialization root 后从空目录重新开始；禁止只删一份成功报告继续拼接；
5. migration/seed/verify 失败时，只清理由本进程在已证明为空的目标中创建的文件；不得清理预先存在内容；
6. 任一子进程失败后停止调度新项，等待已经启动的子进程退出；完成顺序不得改变按 key 排序的结果集合，全部 sibling 只作诊断；
7. 任一 pre-acceptance rejection 或 BLOCKED 时顶层命令失败，已成功的 sibling 仅是 work-root 诊断输入，不得交给 Candidate Author；
8. pre-acceptance rejection 不计入成功/阻断 Report 集合；Orchestrator 必须通过子进程退出码和脱敏 stderr 记录失败，不得补造 Report；
9. 未发布 materialization 证据按 Golden Authoring work-root 保留策略处理；一旦进入 approved version，Report 和 SQLite base 均成为不可变发布证据，回滚不得删除或改写。

### 13.2 Cleanup failure 与 quarantine

失败 storage 的清理和二次失败固定为：

1. 原始业务/Report content failure 始终为 `primary_failure=failures[0]`；
2. Materializer cleanup 失败时追加 `GFM_CLEANUP_FAILED`，不得覆盖 primary failure；
3. Java 子进程必须先原子提交该 Schema-valid BLOCKED Report，再以非零退出；Report 不含 `target_storage`；
4. 子进程退出后只能由独立 Node Orchestrator 执行本节四阶段流程，不得由 Java runner、完整 verifier 或人工脚本直接移动；
5. 非空 quarantine、任一 marker、BLOCKED/缺失 Report 或成功 sibling 均使整个 root 对 Candidate Author、Publisher 和 `--require-materialized` verifier 不可消费；
6. quarantine 只允许人工检查和删除整个未批准 change root，不提供恢复、移动回 fixtures 或局部续跑命令。

#### 13.2.1 Pending-quarantine 预验证契约

唯一内部接口冻结为：

```text
verifyPendingQuarantine({
  capturePlanPath,
  materializationRoot,
  fixtureRefKey,
  reportRelativePath,
  sourceStorageRelativePath,
  quarantineStorageRelativePath,
  markerRelativePath
}) -> PendingQuarantineAttestation
```

该接口属于只读 semantic verifier 模块，但不是 CLI mode，不接受 `--pending-quarantine`，不写文件、不移动目录、不修复 Report，也不返回 Materialized/consumable 结论。它必须按以下顺序验证：

1. Plan raw ref/Schema/status、expected 130 key 集合、materialization root realpath 和 selected key membership 合法；
2. Report 位于 `reports/<key>.json`，通过 Report `0.1` Schema以及第 12.4 节中 checks、identity、payload、input ref、binding、fixture identity 和 failure precedence 的全部适用规则；
3. Report 为 `BLOCKED`，`primary_failure=failures[0]`，最后且仅有一个 secondary cleanup failure=`GFM_CLEANUP_FAILED`，不含 `target_storage`；
4. source 固定为 `fixtures/<key>/storage`，是 root 内 non-symlink 普通目录、非空且仅含该子进程残留；不得跟随 symlink或接受 file/socket/device/FIFO；
5. quarantine destination=`quarantine/<key>/storage` 和 marker=`quarantine/<key>/non-consumable.json` 均不存在，`quarantine/<key>` 不存在或为空；
6. root 中除 130-key Plan允许的 sibling、当前 BLOCKED Report 和这一处 source residual 外，不存在 unknown key、额外 Report/database、其他 residual、temp、lock、marker 或 quarantine；
7. 使用 `lstat` 记录 source 的 `dev/ino`，计算移动前完整 root tree digest，复算 Report raw SHA，并锁定 Plan raw SHA。

成功只返回进程内不可变对象：

```text
attestation_version="PENDING-QUARANTINE-IN-MEMORY-1"
change_id
fixture_ref_key
plan_raw_sha256
report_relative_path
report_raw_sha256
report_payload_sha256
source_storage_relative_path
source_storage_dev
source_storage_ino
quarantine_storage_relative_path
marker_relative_path
primary_failure_code
cleanup_failure_code="GFM_CLEANUP_FAILED"
root_tree_sha256_before_move
```

attestation 不序列化、不日志输出、不跨进程传输、不作为 Report ref、marker 字段、release evidence 或恢复 token。任一校验失败不得移动或写 marker；直接调用该预验证器时使用既有 `GFMV_*` 首错码，其中 pending shape 不闭合使用 `GFMV_PENDING_QUARANTINE_INVALID/2`。Orchestrator 在 cleanup 流程中遇到任何预验证失败统一升级为 `GFM_QUARANTINE_FAILED/4`。

#### 13.2.2 唯一四阶段调用顺序

调用顺序只能是：

```text
1. pending-quarantine 预验证并取得内存 attestation
2. 原子移动 source residual 到 quarantine storage
3. 从 attestation 原子写 Quarantine Marker 0.1
4. 调用完整 Materialization semantic verifier 做 selected diagnostic
```

具体约束固定为：

1. 移动前必须再次比较 source `dev/ino` 和 root tree digest；任一变化使用 `GFM_QUARANTINE_FAILED/4`，不执行 rename；
2. source 与 destination 必须在同一 filesystem，destination parent 排他创建；只允许单次 `rename(source,destination)`，禁止 copy+delete、merge、覆盖或跨设备 fallback；
3. rename 后 source 必须不存在，destination 的 `dev/ino` 与 attestation source相等；不满足时停止，不写 marker；
4. Marker writer 只从 attestation、Plan source epoch 和固定常量构造内容，完成 JCS/payload SHA、Marker `0.1` Schema、same-directory fresh temp、fsync 和 atomic rename；
5. marker 写入失败不得把 destination 移回 source、补空 marker或调用完整 verifier，固定 `GFM_QUARANTINE_FAILED/4`；
6. marker 成功后必须立即调用第 12.4 节同一完整 verifier的 `selected diagnostic`，且唯一合法结果为 `GFMV_ROOT_NOT_CONSUMABLE/3`；返回 `0/2/4`、其他 top code、发生 I/O 或 root变化都映射 `GFM_QUARANTINE_FAILED/4`；
7. 完整 verifier 前后 tree digest必须相等。顶层 Orchestrator结束前仍要执行 full-root diagnostic；它返回 incomplete/not-consumable只作诊断，不提升成功；
8. 不允许“先移动再预验证”“先写 marker 再移动”“用 pending verifier替代完整 verifier”“验证失败后继续下一 key”或任何局部恢复顺序。

#### 13.2.3 中间失败状态

| 失败点 | 允许留存 | 禁止行为 | 顶层结果 |
| --- | --- | --- | --- |
| pending 预验证前/中 | 原 BLOCKED Report + source residual | 移动、marker、补 Report | `GFM_QUARANTINE_FAILED/4` |
| rename 前重检/rename | 可能仍为 source residual；底层不确定时整 root 隔离 | copy-delete、重试覆盖 | `GFM_QUARANTINE_FAILED/4` |
| marker build/write | quarantine storage 可存在但 marker缺失 | 移回 source、伪造 marker、调用 full verifier | `GFM_QUARANTINE_FAILED/4` |
| 完整 verifier | 闭合 marker/storage 仍保留 | 修改证据使 verifier变绿 | `GFM_QUARANTINE_FAILED/4` |

以上状态都不是合法可消费证据，整个 change root 必须人工检查并整体删除后从空 root 重跑。

## 14. 稳定失败码与退出码

### 14.1 Materializer 失败码

```text
GFM_MODE_DISABLED
GFM_PROFILE_INVALID
GFM_WEB_MODE_FORBIDDEN
GFM_CONTRACT_VERSION_UNSUPPORTED
GFM_ARGUMENT_INVALID
GFM_REPORT_EXISTS
GFM_PLAN_INVALID
GFM_PLAN_NOT_READY
GFM_FIXTURE_SET_MISMATCH
GFM_FIXTURE_NOT_IN_PLAN
GFM_FIXTURE_AMBIGUOUS
GFM_RUNTIME_JAR_MISMATCH
GFM_BUNDLE_REF_MISMATCH
GFM_ARCHIVE_ENTRY_UNSAFE
GFM_FIXTURE_REF_MISMATCH
GFM_FIXTURE_SCHEMA_UNSUPPORTED
GFM_BINDING_MISMATCH
GFM_IDENTITY_MISMATCH
GFM_TARGET_STORAGE_UNSAFE
GFM_TARGET_STORAGE_NOT_EMPTY
GFM_STORAGE_MIGRATION_FAILED
GFM_STORAGE_WRITE_FAILED
GFM_STORAGE_VERIFY_FAILED
GFM_REPORT_CONTENT_INVALID
GFM_CLEANUP_FAILED
GFM_QUARANTINE_FAILED
GFM_REPORT_ENGINE_FAILED
GFM_REPORT_WRITE_FAILED
GFM_PERFORMANCE_PROBE_FAILED
GFM_INTERNAL_ERROR
```

### 14.2 退出码

```text
0 = MATERIALIZED
2 = 参数、模式、版本、Schema 或 ref 无效
3 = 可归类的 SHA、binding、storage、migration、write、verify 或 cleanup 阻断
4 = Report engine/write、quarantine 或未分类 I/O/内部错误
```

Check 1~8 的错误码只出现在 stderr/进程退出结果，不进入 Materialization Report；Check 9 以后可归类业务失败和 `GFM_REPORT_CONTENT_INVALID` 进入 BLOCKED Report。`GFM_REPORT_ENGINE_FAILED/GFM_REPORT_WRITE_FAILED/GFM_QUARANTINE_FAILED` 表示最终证据无法可靠交付，退出码固定为 `4`，不得把缺失、部分 Report 或 marker 降级解释为合法 BLOCKED。

错误消息可本地化，code、检查优先级、退出码和零业务输出语义不可变化。日志不得包含 fixture 正文、session、完整用户绝对路径或未脱敏环境变量。

### 14.3 Verifier 错误码

只读 semantic verifier 使用 catalog 冻结的 `GFMV_*`，不得把本章 `GFM_*`、Report `primary_failure.code` 或 Node/Java 内部异常名直接作为 verifier top code。CLI stderr 第一行、exit 和首错优先级必须与 catalog 完全一致；I/O/internal fault 分别固定为 `4`，其余非法/不可消费分类不得因 `--require-materialized`、文件枚举顺序或调用方不同而变化。

## 15. 性能与资源阈值

在 DEV-CANVAS-06 固定参考机器、Java 21、SSD、无并行其他 release job 的条件下：

1. 单 fixture 子进程端到端 wall time 必须 `<=15 s`；130 项 P95 必须 `<=10 s`；
2. 默认串行 130 项总 wall time必须 `<=30 min`；启用固定并发 4 时总 wall time必须 `<=10 min`；
3. 单进程 peak RSS 必须 `<=512 MiB`；
4. fixture 只允许流式读取 exact entry，内存中不得保留整个 Evidence Bundle；
5. Report 必须记录本次运行每阶段整数微秒和 peak RSS；这些字段是 per-run evidence，不参与跨重建 stable projection 相等判定；性能不达标返回实现验收失败，但不得把已正确生成的单项 Report 改写为语义 BLOCKED。

这些是 release authoring 工具阈值，不是产品交互阈值或 ISO 要求。

### 15.1 RSS 采样契约

固定参考机为 macOS 时，Materializer 在 Check 8 已取得 exact fixture identity 后启动进程内 RSS monitor；该 monitor 以当前 JVM PID 调用固定绝对路径 `/bin/ps -o rss= -p <pid>`，把唯一十进制 KiB 值乘以 `1024` 后记录为 bytes。采样必须在启动时同步完成，并以 `250 ms` 固定间隔持续到成功 Report 的 `persistence` 内容开始构建前；最终字段为全部成功采样的最大值。`peak_rss_bytes` 是该固定窗口的 OS-reported sampled peak，不得使用 JVM heap、committed virtual memory、cgroup limit 或估算值替代。

`/bin/ps` 必须在 `1 s` 内以退出码 `0` 返回一个正整数；不支持 macOS、命令不可执行、超时、退出非零、输出为空/多值/非整数、KiB 到 bytes 溢出，或 monitor 运行中任一采样失败，均为 `GFM_PERFORMANCE_PROBE_FAILED/4`。monitor 只在 Check 8 后启动，因此该故障固定按 post-acceptance failure 生成 `BLOCKED` Report 并执行既有 cleanup/quarantine。性能阈值超限本身不改变已生成的 `MATERIALIZED` Report 状态，只使性能验收失败。

## 16. 测试与验收矩阵

| 层级 | 正例 | 必须阻断的反例 |
| --- | --- | --- |
| Schema contract | MATERIALIZED/BLOCKED Report | 额外字段、非法路径/SHA、状态条件缺字段 |
| Report 接纳点 | Check 8 PASSED 后取得真实 identity | Check 1~8 失败仍写 Report、placeholder/expected/partial identity |
| pre-acceptance | MODE~FIXTURE 失败为 stderr/非零退出、零 storage/report | Bundle/Archive/Fixture 失败生成 BLOCKED Report |
| post-acceptance | BINDING/STORAGE/持久化/验证/report-build 失败生成 BLOCKED | 缺真实 identity、错误 checks 顺序、失败后包含可消费 storage |
| Report 交付 | atomic rename 成功后才有最终 Report | 不可写/rename 失败留下部分文件或冒充 BLOCKED |
| Report engine | content mismatch 可生成 BLOCKED；engine failure 零 Report | digest/Schema engine 失败后用同一 engine 伪造 BLOCKED |
| cleanup/quarantine | 原 failure 保持 primary，Node marker 可复核 | cleanup 覆盖 primary、残留 storage 可被消费、marker 失败仍继续 |
| semantic verifier | catalog 63/63、fixed checks/cross-field/payload/database/root、pending attestation、三种枚举顺序和前后 tree digest全闭合 | 仅凭Schema-valid接受乱序/重复check或错SHA；pending/selected成功冒充130项完整 |
| 集合算法 | 1170 capture -> 130 ref，每项 9 次 | 129/131、普通 ref、key collision、同 key 不同 ref |
| 条件装配 | 五 guard exact + non-web | 缺 guard、prod profile、web mode、env/property-file 注入 |
| Runtime JAR | 当前 CodeSource SHA=Plan | exploded runtime、JAR size/SHA 不等 |
| archive | exact safe entry、size/SHA matched | traversal、absolute、symlink、duplicate、zip bomb、SHA mismatch |
| semantic | MS-REV-001/0.2、五角色 binding exact | schema/version、model header、任一 role/digest 不等 |
| storage | 新空 root、V1 migration、单事务 | 非空、symlink、迁移失败、七写阶段故障注入 |
| identity | 派生 Project + 原样 Model/Revision/Head | 截断 SHA、随机 ID、sequence/head 不等 |
| verify | integrity/FK/read/reopen/sidecar 全 matched | row count、document SHA、WAL/SHM、reopen 不等 |
| isolation | 基础库 SHA 不变，每 attempt 新 clone | base 可写、clone 共享、跨 capture 状态泄漏 |
| API 隔离 | authoring 无监听，普通 Runtime 行为不变 | Materializer RequestMapping、authoring 启动 Web |
| determinism | 空 root 重建后 stable projection 相同，每次 raw evidence 自身闭合 | 要求可变性能值相同、时间/UUID/PID/端口进入 stable projection |
| 性能 | 130 项满足第 15 节 | 超时、OOM、无阶段时长/peak RSS |

代表性语义正例至少覆盖 Procedural、Control、Structural 各 1 个 PASS fixture；全部 130 个 ref 必须做 release integration materialization 和 reopen。故障注入至少覆盖 migration、7 个 seed insert、commit 前、commit 后 verify 和 Report atomic rename。

## 17. 开发边界

后续 `GOLDEN-AUTHORING-03A` 实现允许：

- 完成 Materialization Report `0.1` Schema/正反 contract test，并新增 Quarantine Marker `0.1` Schema/正反 contract test；
- 新增 `services/local-runtime/.../releaseauthoring/**`；
- 最小重构共享 Runtime active binding provider，并保持普通 API 输出兼容；
- 新增真实 SQLite integration、Spring 条件装配、JAR CLI 和无 HTTP 监听测试；
- 新增只负责排序/启动/汇总/quarantine 的 Node orchestrator、唯一只读 Materialization Report semantic verifier 与 npm 命令。

禁止：

- 修改 SQLite V1、公共 HTTP API、Profile/Rule/Grammar/Symbol 或 Capture Plan 0.1；
- 把现有会删除数据库的 `OplGoldenReplayDatabaseInitializer.resetAttemptDatabase()` 直接作为 Materializer；
- 用 H2、mock repository 或内存 map 代替 SQLite integration；
- 为方便测试放宽 JAR、binding、空目录、archive 或报告守卫；
- 同包实现 Candidate Author、Approval、Visual Manifest、真实 approved golden 或 Activation。

## 18. 完成定义与声明边界

设计完成：本文的输入、输出、身份、命令、装配、检查顺序、Report 接纳点、事务、stable projection、Report pipeline、pending-quarantine attestation、唯一四阶段 cleanup/quarantine、marker、semantic verifier、受控 case、并发、错误、性能和测试全部冻结。

实现完成：必须由独立 implementation checklist 证明 Materialization Report/Quarantine Marker Schema、代码、单测、SQLite integration、条件装配、JAR CLI、semantic verifier Catalog `v1.1` 的 63/63 受控 case、四阶段 cleanup/quarantine、并发停止、130 项 release integration 和性能全部通过；任何 Report 仅 Schema-valid 或仅通过 pending预验证而未通过完整 semantic verifier，不满足完成定义。

真实 authoring 完成：还必须有 130 份 exact `MATERIALIZED` Report、8 个 Common Factory 输入、2484+18 capture attempts、人工审批和 approved version。Materializer 实现完成不等于真实 authoring 完成。

Visual READY、`GATE-06-03`、Candidate、Activation、Capability enablement、生产发布和 ISO 符合性继续是相互独立的后续状态，不得从 Materialization Report 推导。

## 19. 事实与假设

### 19.1 事实

1. 当前 130 个 PASS family case 的 `input_revision_fixture` 恰好 130 个且无重复；
2. 当前代表性 fixture 是 `MS-REV-001/0.2`，含 Model/Revision/sequence/五角色 binding，不含 Project ID；
3. 当前 `ProjectDatabaseFactory` 路径为 `<storage-root>/projects/<project-id>/project.db` 并执行 Flyway；
4. 当前 Golden Replay initializer 固定 `project.golden`、写单 Revision seed，但会主动删除旧数据库；
5. 当前 Report Schema、Node集合编排、共享binding、完整guard/preflight、SQLite seed/verify、Report pipeline、pending预验证、唯一四阶段cleanup/quarantine、semantic verifier和并发停止均已实现；Catalog `v1.1` 63/63已在130项真实SQLite受控基线上按三种枚举顺序通过，全部case前后tree digest相等。Java 21 packaged-JAR并发4受控矩阵为130/130，记录 `p95_stage_sum_us=7330247`、`max_stage_sum_us=10634139`、`total_wall_s=348.1`、`max_rss_bytes=360611840`，满足第15节实现阈值；这些均不是production release evidence；
6. 当前没有 production 130 项 Materialization Report/SQLite 或 approved evidence；
7. 当前 Common visual fixture 是 factory 参数文档，不属于本 Materializer。

### 19.2 假设

无。实际 JAR/Bundle/fixture/database/report SHA 和运行性能必须由实现与真实执行生成，不能从本设计预填。
