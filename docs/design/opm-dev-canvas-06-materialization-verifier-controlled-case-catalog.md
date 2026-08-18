# DEV-CANVAS-06 Materialization Verifier 受控 Case Catalog

文档版本：`1.1`

设计状态：`FROZEN`

实现状态：`IMPLEMENTED_63_OF_63`

对应开发包：`GOLDEN-AUTHORING-03A`

## 1. 文档定位

本文档是 [Golden Fixture Materializer 设计](./opm-dev-canvas-06-golden-fixture-materializer-design.md)中唯一 `Materialization Report Semantic Verifier` 及其窄化 pending-quarantine 预验证入口的受控 Report/root 正反例事实源。它冻结 case factory、错误码、首错优先级、单变量变异和预期结果，使实现人员无需自行决定 verifier 的验收语义。

本文档只定义受控 implementation test 输入，不生成或批准任何真实 release 资产。即使未来全部 case 通过，也不等于 130 份 production Materialization Report/SQLite 已生成，不提升 `GATE-06-03`、Candidate、Activation、Capability、生产发布或 ISO 19450:2024 符合性状态。

## 2. 术语与判定

1. `正例`：证据本身符合它所声明的状态，verifier 按冻结语义正确接受或分类；合法 BLOCKED、缺失或 quarantine 返回 `3` 仍属于正例。
2. `反例`：证据违反 Schema、跨字段、文件、SQLite、集合或安全闭包，或受控触发 I/O/internal fault；必须返回对应稳定错误。
3. `可消费`：完整 130 项 root 中每项都是 MATERIALIZED、database 闭合、无 quarantine/缺失/额外项，并通过无 `--fixture-ref-key` 的 `--require-materialized`。
4. `诊断成功`：single-key 或 full-root 调用正确识别合法但不可消费状态；不得被 Candidate Author、Publisher 或 Golden Verifier 当作集合通过。
5. `top code`：CLI stderr 第一行的稳定 `GFMV_*` code。其后可以输出本地化且脱敏的诊断行；stdout 必须为空。

## 3. 受控 Factory

### 3.1 固定输入

case factory 的逻辑常量冻结为：

```text
factory_id=GFMV-CONTROLLED-FACTORY-001
factory_version=1.0.0
change_id=GOLDEN-CANVAS06-20260801-901
source_date_epoch=1785542400
generated_at=2026-08-01T00:00:00Z
family_fixture_count=130
capture_per_fixture=9
family_capture_count=1170
selected_fixture_alias=K001
```

factory 必须从受控 READY test Plan、受控 Evidence Bundle、exact test Runtime JAR 和空输出目录构造输入。Plan 中 1170 个 Family capture 去重后必须得到 130 个唯一 `MS-REV-001/0.2` archive ref，每个 ref 恰出现 9 次；不得从 production Handoff、approved root 或开发者既有 storage 抽取测试输入。

`K001~K130` 是 catalog alias，不是机器字段。factory 计算 130 个真实 `fixture_ref_key`，按小写 64 位 digest 字典序排序后依次映射 alias；Plan、Report、目录和 CLI 只写实际 key。`K001` 永远映射排序后的第一项。

### 3.2 Case 目录

每个 case 使用独立目录：

```text
<case-dir>/
  inputs/capture-plan.json
  materialization-root/
    fixtures/<fixture-ref-key>/storage/
      projects/<project-id>/project.db
    reports/<fixture-ref-key>.json
    quarantine/<fixture-ref-key>/storage/...        # 仅合法 cleanup failure
    quarantine/<fixture-ref-key>/non-consumable.json
  expected.json                                     # 测试元数据，不传给 verifier
```

`expected.json` 只由测试 runner 消费，至少记录 `case_id/mode/selected_fixture_alias/expected_exit_code/expected_top_code/root_digest_before/root_digest_after`；它不属于 materialization root、Materialization Report、release evidence 或新增机器 Schema。

### 3.3 基线 root

`GFMV-BASE-001` 必须包含：

1. 130 个唯一 expected key；
2. 130 份通过 [Materialization Report 0.1 Schema](../contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json) 和全部语义闭包的 MATERIALIZED Report；
3. 130 个由受控 Materializer 真实创建、可只读重开的 SQLite base；
4. 每个 Report 的 `capture_plan_ref/evidence_bundle_ref/source_fixture_ref/runtime_binding/fixture_identity` 与 exact test 输入一致；
5. 每个 database 的 raw SHA、semantic state、固定 table counts、identity、reopen 和 sidecar 均闭合；
6. 零 quarantine、symlink、临时文件、lock、未知 key 和额外文件。

基线只能由 clean source build 和受控 Materializer factory 生成，禁止手写 SQLite、复制 production Report、由 verifier 自动修复或从某个反例反向恢复。

### 3.4 Clone 与单变量规则

1. 每个 case 从 `GFMV-BASE-001` 或表中指定的合法 BLOCKED seed 做独立 copy-on-write clone；
2. 每个普通反例只改变一个逻辑语义维度；为维持其他闭包而协调更新的 ref、byte length、raw SHA 和 payload SHA 不计为第二维度；
3. 除专门验证 digest mismatch 的 case 外，修改 Report 后必须重算 `report_payload_sha256`，修改文件后必须重算所有非目标 raw ref；
4. digest mismatch case 必须只保留目标 digest 为旧值，其他字段保持闭合；
5. 正例 BLOCKED seed 必须由已通过 Check 8 的真实 fixture identity 构造，不得使用 placeholder、expected 或 partial identity；
6. case 执行期间禁止共享可写 root、复用 previous run 输出或按结果动态修改 expected code。

### 3.5 只读 tree digest

测试 runner 在 verifier 前后独立计算：

```text
root_tree_sha256=sha256(JCS(entries 按 UTF-8 relative_path 字典序排序))
entry(FILE)={relative_path,type,byte_length,raw_sha256}
entry(DIRECTORY)={relative_path,type}
entry(SYMLINK)={relative_path,type,link_text}
```

tree walker 使用 `lstat` 且不跟随 symlink。全部 63 个 case都必须满足 `root_digest_after=root_digest_before`；完整 verifier和pending预验证都不允许cleanup、rename、quarantine、补digest、删除临时文件或生成自己的Report。I/O/internal case通过只注入verifier的test-only port保持外部digest helper可读，禁止把fault port暴露为生产CLI参数。

## 4. CLI 模式与消费边界

| 模式 | 固定行为 |
| --- | --- |
| full diagnostic | 无 `--fixture-ref-key`；扫描 130 项、集合完整性和可消费性；合法 BLOCKED/缺失/quarantine 返回 `3` |
| full required | 无 `--fixture-ref-key` 且有 `--require-materialized`；只有完整 130/130 MATERIALIZED root 返回 `0` |
| selected diagnostic | `--fixture-ref-key <actual K001 key>`；全 root 仍做安全/额外项扫描，只对选中 key 做 Report/database 语义验证，不证明其余 129 项完整性 |
| selected required | selected 模式加 `--require-materialized`；只证明该 key 为 MATERIALIZED，不得交给任何集合消费者 |

Candidate Author、Publisher 和 Golden Verifier 只能调用 `full required`。Materializer 写后允许调用 `selected required` 验证刚写单项，但顶层 Orchestrator 完成后仍必须调用 `full required`；两个成功不能互相替代。

## 5. 稳定 `GFMV_*` 错误目录

Materializer 自身继续使用 `GFM_*`。只读 verifier 只使用下表 `GFMV_*`，禁止把 Report 中的 `primary_failure.code` 直接当作 verifier top code。

| code | exit | 含义 |
| --- | ---: | --- |
| `GFMV_ARGUMENT_INVALID` | 2 | CLI 缺项、重复项、未知项、非法组合或值格式错误 |
| `GFMV_PLAN_INVALID` | 2 | Plan JSON/Schema/status/ref/1170 -> 130 -> 9 集合不合法 |
| `GFMV_FIXTURE_KEY_NOT_IN_PLAN` | 2 | selected actual key 不属于 exact Plan |
| `GFMV_ROOT_UNSAFE` | 2 | root 本身或允许路径存在 symlink、realpath 逃逸或非普通实体 |
| `GFMV_ROOT_EXTRA_ENTRY` | 2 | 未知 key、额外 Report/database、temp/lock 或其他未授权实体 |
| `GFMV_REPORT_SCHEMA_INVALID` | 2 | Report 不通过 frozen `0.1` Schema |
| `GFMV_CHECK_SEQUENCE_INVALID` | 2 | 十个 check 不唯一、不按固定顺序或状态序列不合法 |
| `GFMV_REPORT_IDENTITY_MISMATCH` | 2 | report/materialization/change/key/固定路径不闭合 |
| `GFMV_REPORT_PAYLOAD_MISMATCH` | 2 | `report_payload_sha256` 复算不等 |
| `GFMV_INPUT_REF_MISMATCH` | 2 | Plan、Bundle 或 source fixture ref 不闭合 |
| `GFMV_BINDING_MISMATCH` | 2 | observed/expected binding 与 Report 状态、失败码不闭合 |
| `GFMV_FIXTURE_IDENTITY_MISMATCH` | 2 | fixture/materialized identity 与 exact fixture/database 不闭合 |
| `GFMV_FAILURE_PRECEDENCE_INVALID` | 2 | primary、failures 顺序、check/error 对应或 secondary 规则不合法 |
| `GFMV_DATABASE_REF_MISMATCH` | 2 | database path/key/length/raw SHA、sidecar 或 Report ref 不闭合 |
| `GFMV_SEMANTIC_STATE_MISMATCH` | 2 | SQLite reader、identity、table counts、integrity/FK/reopen 或 semantic digest 不闭合 |
| `GFMV_QUARANTINE_INVALID` | 2 | marker Schema/payload/path/failure/storage 配对不闭合 |
| `GFMV_PENDING_QUARANTINE_INVALID` | 2 | pending 预验证的 source/destination/marker/Report 过渡形状不闭合 |
| `GFMV_ROOT_INCOMPLETE` | 3 | expected Report 或 MATERIALIZED database 缺失，包含 pre-acceptance 后部分 sibling 场景 |
| `GFMV_ROOT_NOT_CONSUMABLE` | 3 | 全部现有证据合法，但含 BLOCKED 或闭合 quarantine |
| `GFMV_IO_ERROR` | 4 | 可信路径的 open/read/stat/SQLite 操作遭受受控 I/O 失败，无法可靠判定 |
| `GFMV_INTERNAL_ERROR` | 4 | verifier Schema/JCS/digest/SQLite adapter 或不变量发生内部错误 |

缺失 expected 文件是 incomplete `3`；文件存在但 ref/digest/内容不等是 invalid `2`。合法 quarantine 是不可消费 `3`；marker 与 storage 不闭合是 invalid `2`。未知或额外证据永远是 invalid `2`，即使同时使用 `--require-materialized` 也不得降级为 `3`。

## 6. 首错优先级

### 6.1 阶段顺序

top code 固定按以下阶段选择：

```text
CLI arguments
  -> Capture Plan Schema/status/ref/set
  -> materialization root safety/extra entries
  -> selected key membership
  -> 按 actual fixture_ref_key 字典序逐项验证
  -> full-root collection completeness
  -> consumability
```

可信 I/O 操作或 verifier engine 一旦无法执行，分别以 `GFMV_IO_ERROR/4` 或 `GFMV_INTERNAL_ERROR/4` 终止；I/O/internal case 不与语义变异混合。

### 6.2 单项顺序

同一 actual key 内固定为：

```text
Report Schema
  -> checks/status sequence
  -> report identity/path
  -> report payload
  -> Plan/Bundle/fixture ref
  -> Runtime binding
  -> fixture/materialized identity
  -> failure precedence
  -> database ref/raw/sidecar
  -> SQLite semantic state/reopen
  -> quarantine closure
```

实现可以收集全部 diagnostics，但进程 exit 和 stderr 第一行只能使用上述顺序选出的 top code。文件系统返回顺序、JSON object key 顺序、并发完成顺序和 locale 不得改变结果。

root safety 扫描可以识别固定 quarantine 路径形状和已知 SQLite sidecar 名称，但不得在该阶段把它们视为合法或直接当作普通 extra：marker/storage 配对留到 quarantine closure 判定，WAL/SHM/journal 留到 database ref 判定。这样 XN-009~012、RN-020 的 top code 不会被通用目录扫描错误抢占。

## 7. Report 正例

以下 case 均在含 130 个 expected key 的独立 root 上运行；未特别说明时只把 K001 转成目标状态，其余 129 项保持基线 MATERIALIZED。

| case_id | K001 受控状态 | 调用 | top code | exit |
| --- | --- | --- | --- | ---: |
| `GFMV-RP-001` | 完整 MATERIALIZED；10 checks PASSED、零 failure、database/state/reopen 全闭合 | selected required | 无 | 0 |
| `GFMV-RP-002` | Binding BLOCKED；1~8 PASSED、9 FAILED=`GFM_BINDING_MISMATCH`、10 NOT_RUN；observed binding 与 expected 不等 | selected diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 |
| `GFMV-RP-003` | Storage BLOCKED；1~9 PASSED、10 FAILED，真实 fixture identity，零可消费 database ref | selected diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 |
| `GFMV-RP-004` | persistence/verify BLOCKED；10 checks PASSED，primary 为对应 `GFM_STORAGE_*`，cleanup 成功 | selected diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 |
| `GFMV-RP-005` | `GFM_REPORT_CONTENT_INVALID` BLOCKED；10 checks PASSED，真实 fixture identity，零最终 database ref | selected diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 |
| `GFMV-RP-006` | 原业务 failure 为 primary，`GFM_CLEANUP_FAILED` 为 `failures[1]`，source storage 已移动且 marker/storage 全闭合 | selected diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 |

RP-002~006 返回 `3` 只表示 Report/root 对所声明的 BLOCKED 状态语义合法，绝不表示 materialization 成功。

## 8. Report 反例

RN-001~021 除表中指定的 digest case 外都必须重算 payload 和非目标 raw ref。RN-001~017 只修改 Report 逻辑；RN-018~021 可以协调修改 K001 database，以隔离目标数据库责任。

| case_id | seed | 唯一目标变异 | expected top code | exit |
| --- | --- | --- | --- | ---: |
| `GFMV-RN-001` | RP-001 | 删除一个 check，形成 Schema-invalid 长度 | `GFMV_REPORT_SCHEMA_INVALID` | 2 |
| `GFMV-RN-002` | RP-001 | 保持 10 项但重复一个 check ID | `GFMV_CHECK_SEQUENCE_INVALID` | 2 |
| `GFMV-RN-003` | RP-001 | 对调两个 check | `GFMV_CHECK_SEQUENCE_INVALID` | 2 |
| `GFMV-RN-004` | RP-001 | `report_id != materialization_id` | `GFMV_REPORT_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-005` | RP-001 | `materialization_id` 不等冻结公式 | `GFMV_REPORT_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-006` | RP-001 | Report `change_id` 不等 Plan | `GFMV_REPORT_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-007` | RP-001 | K001 文件中的 `fixture_ref_key` 改为另一个合法 digest | `GFMV_REPORT_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-008` | RP-001 | 改一个仍合法的 per-run duration 但故意保留旧 payload SHA | `GFMV_REPORT_PAYLOAD_MISMATCH` | 2 |
| `GFMV-RN-009` | RP-001 | `capture_plan_ref` 指向另一个 raw ref | `GFMV_INPUT_REF_MISMATCH` | 2 |
| `GFMV-RN-010` | RP-001 | `evidence_bundle_ref` 不等 Plan exact Bundle | `GFMV_INPUT_REF_MISMATCH` | 2 |
| `GFMV-RN-011` | RP-001 | `source_fixture_ref` 不等 K001 exact archive ref | `GFMV_INPUT_REF_MISMATCH` | 2 |
| `GFMV-RN-012` | RP-001 | MATERIALIZED 的 observed binding 不等 expected binding | `GFMV_BINDING_MISMATCH` | 2 |
| `GFMV-RN-013` | RP-001 | `fixture_identity` 不等 exact fixture bytes | `GFMV_FIXTURE_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-014` | RP-001 | `materialized_identity` 的 Model/Revision/sequence/Head 任一不等 | `GFMV_FIXTURE_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-015` | RP-003 | BLOCKED 使用 placeholder/expected `fixture_identity` | `GFMV_FIXTURE_IDENTITY_MISMATCH` | 2 |
| `GFMV-RN-016` | RP-004 | `primary_failure != failures[0]` 或 secondary 顺序颠倒 | `GFMV_FAILURE_PRECEDENCE_INVALID` | 2 |
| `GFMV-RN-017` | RP-003 | BLOCKED 增加 `target_storage/database_ref` | `GFMV_REPORT_SCHEMA_INVALID` | 2 |
| `GFMV-RN-018` | RP-001 | 修改 database raw bytes但保留旧 length/SHA | `GFMV_DATABASE_REF_MISMATCH` | 2 |
| `GFMV-RN-019` | RP-001 | 修改 SQLite 业务行并更新 raw ref/payload，但 Report table counts/state 仍声明旧语义 | `GFMV_SEMANTIC_STATE_MISMATCH` | 2 |
| `GFMV-RN-020` | RP-001 | 在 K001 database 旁保留 WAL/SHM/journal sidecar | `GFMV_DATABASE_REF_MISMATCH` | 2 |
| `GFMV-RN-021` | RP-001 | raw ref 闭合但 SQLite reader/integrity/reopen 不能得到声明状态 | `GFMV_SEMANTIC_STATE_MISMATCH` | 2 |

路径中加入绝对路径、`..` 或双斜线会先违反 Report Schema，作为 RN-001 同类 Schema contract 反例处理，不另设会被更早错误抢占的 semantic case。

## 9. Root 正例

| case_id | root 状态 | 调用 | top code | exit | 声明边界 |
| --- | --- | --- | --- | ---: | --- |
| `GFMV-XP-001` | 完整 130 Report + 130 SQLite，全部 MATERIALIZED | full required | 无 | 0 | 唯一可作为 03A 集合通过的受控正例 |
| `GFMV-XP-002` | 与 XP-001 相同 | selected required(K001) | 无 | 0 | 只证明 K001，不证明 130 项完整 |
| `GFMV-XP-003` | K001 为 RP-003，其他 129 项成功，无 quarantine | full diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 | 合法 BLOCKED 诊断 root |
| `GFMV-XP-004` | K001 为 RP-006，marker/storage/Report 全闭合 | full diagnostic | `GFMV_ROOT_NOT_CONSUMABLE` | 3 | 合法 cleanup quarantine 诊断 root |
| `GFMV-XP-005` | pre-acceptance 后已有成功 sibling，但一个 expected key 零 Report/storage | full diagnostic | `GFMV_ROOT_INCOMPLETE` | 3 | 合法未完成 work root，不可续拼或消费 |

XP-005 只验证 verifier 对部分 work root 的诊断，不授权从该 root 局部续跑；重跑仍须人工清理整个未批准 change root 后从空 root 开始。

## 10. Root 反例

| case_id | 唯一目标变异 | expected top code | exit |
| --- | --- | --- | ---: |
| `GFMV-XN-001` | 仅有 129 个 expected Report/database，缺 1 项 | `GFMV_ROOT_INCOMPLETE` | 3 |
| `GFMV-XN-002` | 仅保留 1 项，缺其余 129 项 | `GFMV_ROOT_INCOMPLETE` | 3 |
| `GFMV-XN-003` | 增加第 131 个未知 key 的 Report/database pair | `GFMV_ROOT_EXTRA_ENTRY` | 2 |
| `GFMV-XN-004` | 增加未知 key 或额外 Report | `GFMV_ROOT_EXTRA_ENTRY` | 2 |
| `GFMV-XN-005` | 在已知 key storage 中增加未引用 database/file | `GFMV_ROOT_EXTRA_ENTRY` | 2 |
| `GFMV-XN-006` | `--materialization-root` 本身为 symlink 或 realpath 逃逸 | `GFMV_ROOT_UNSAFE` | 2 |
| `GFMV-XN-007` | root 内任一允许路径组件为 symlink | `GFMV_ROOT_UNSAFE` | 2 |
| `GFMV-XN-008` | 留下 `.tmp/.lock/partial` 或其他临时实体 | `GFMV_ROOT_EXTRA_ENTRY` | 2 |
| `GFMV-XN-009` | cleanup marker 存在但 quarantine storage 缺失 | `GFMV_QUARANTINE_INVALID` | 2 |
| `GFMV-XN-010` | quarantine storage 存在但 marker 缺失 | `GFMV_QUARANTINE_INVALID` | 2 |
| `GFMV-XN-011` | marker payload SHA 不等 | `GFMV_QUARANTINE_INVALID` | 2 |
| `GFMV-XN-012` | marker 的 key/path/primary/cleanup failure 与 Report 或实际 storage 不闭合 | `GFMV_QUARANTINE_INVALID` | 2 |
| `GFMV-XN-013` | K001 Report 的 database ref 交叉指向 K002 database | `GFMV_DATABASE_REF_MISMATCH` | 2 |
| `GFMV-XN-014` | BLOCKED cleanup 成功后仍有未解释的非空 source storage | `GFMV_ROOT_EXTRA_ENTRY` | 2 |
| `GFMV-XN-015` | test-only fs port 对可信 K001 Report/database read 注入 `EACCES/EIO` | `GFMV_IO_ERROR` | 4 |
| `GFMV-XN-016` | test-only verifier port 对 Schema/JCS/digest/SQLite adapter 注入 sentinel fault | `GFMV_INTERNAL_ERROR` | 4 |
| `GFMV-XN-017` | Plan JSON/Schema/status/ref 或 1170 -> 130 -> 9 集合单项不合法 | `GFMV_PLAN_INVALID` | 2 |
| `GFMV-XN-018` | selected actual key 为合法 64 位 digest 但不属于 exact Plan | `GFMV_FIXTURE_KEY_NOT_IN_PLAN` | 2 |
| `GFMV-XN-019` | CLI 缺必填参数、重复/未知参数或非法 flag/value 组合 | `GFMV_ARGUMENT_INVALID` | 2 |

XN-015/016 的 root bytes 本身保持合法且可由外部 digest helper 读取。它们只验证 verifier 对无法可靠判定的错误边界，不允许通过 chmod、损坏共享环境或生产 CLI fault flag 实现。XN-017~019 也必须使用合法、只读且 tree digest 不变的 baseline root，只变异 verifier 外部输入。

## 11. Priority 反例

本节是第 3.4 节单变量规则的唯一例外，用于证明多个缺陷共存时 top code 稳定。除表中两个目标缺陷外，其余闭包保持合法。

| case_id | 同时存在的缺陷 | expected top code | exit |
| --- | --- | --- | ---: |
| `GFMV-PRI-001` | CLI 重复参数 + root symlink | `GFMV_ARGUMENT_INVALID` | 2 |
| `GFMV-PRI-002` | root 内 symlink + K001 check 乱序 | `GFMV_ROOT_UNSAFE` | 2 |
| `GFMV-PRI-003` | actual 最小 key K001 payload mismatch + K002 Report Schema invalid | `GFMV_REPORT_PAYLOAD_MISMATCH` | 2 |
| `GFMV-PRI-004` | 同一 K001 Report Schema invalid + payload mismatch | `GFMV_REPORT_SCHEMA_INVALID` | 2 |
| `GFMV-PRI-005` | 一个 expected key 缺失 + 另一个合法 BLOCKED | `GFMV_ROOT_INCOMPLETE` | 3 |

同一 case 至少以正序、逆序和随机三种文件枚举顺序执行，top code/exit 必须 byte-identical；实现不得依赖 `readdir` 原始顺序。

## 12. Pending-quarantine 预验证 Case

本节只调用 Materializer 设计第 13.2.1 节的内部 `verifyPendingQuarantine()`，不调用公开 CLI，不写 attestation，也不执行 rename/marker。每个 case 仍必须满足 verifier 前后 root tree digest相等。

`GFMV-PQP-001` seed 从 RP-006 的合法 BLOCKED Report派生，但保留 `fixtures/K001/storage` residual，且 `quarantine/K001/storage` 和 marker均不存在；其余 129 个 key保持 MATERIALIZED。PQN case均从该 seed做单变量 clone。

| case_id | 唯一目标状态/变异 | expected top code | exit |
| --- | --- | --- | ---: |
| `GFMV-PQP-001` | Report/Plan/key/failure闭合；唯一 source residual是 non-symlink非空目录；destination/marker不存在 | 无；返回冻结的内存 attestation | 0 |
| `GFMV-PQN-001` | BLOCKED Report缺少末尾 `GFM_CLEANUP_FAILED` 或 cleanup failure不是唯一末项 | `GFMV_FAILURE_PRECEDENCE_INVALID` | 2 |
| `GFMV-PQN-002` | source residual缺失、为空、不是目录，或固定 source path/key不一致 | `GFMV_PENDING_QUARANTINE_INVALID` | 2 |
| `GFMV-PQN-003` | source residual或任一父路径为 symlink/realpath逃逸 | `GFMV_ROOT_UNSAFE` | 2 |
| `GFMV-PQN-004` | quarantine destination或 marker在预验证前已存在 | `GFMV_PENDING_QUARANTINE_INVALID` | 2 |
| `GFMV-PQN-005` | 除当前 source residual外增加第二处 residual、temp、lock、unknown key或extra file | `GFMV_ROOT_EXTRA_ENTRY` | 2 |

PQP-001 还必须断言 attestation 的 Plan/Report SHA、Report payload SHA、source `dev/ino`、固定 paths、failure codes 和 before-move root digest均来自实际输入，且对象被冻结、未写入磁盘、未输出stdout。对 attestation序列化、跨进程传输或作为 full verifier success输入的测试必须失败。

四阶段 cleanup sequence另由 Orchestrator integration test验证：PQP-001 -> same-filesystem atomic rename -> atomic marker -> 完整 selected diagnostic唯一返回 `GFMV_ROOT_NOT_CONSUMABLE/3`。该 integration结果不计作第 12 节六个只读 case，也不能修改其输入维度。

## 13. Case 总量与实现入口

本版 catalog 固定 `63` 个 case：

```text
Report positive = 6
Report negative = 21
Root positive = 5
Root/input negative = 19
Priority = 5
Baseline = 1
Pending quarantine = 6
Total = 63
```

`GFMV-BASE-001` 计入总量但不单独运行 verifier assertion；它是其余 case 的受控 source。`v1.0` 原 57 个 case的 ID、输入维度和 expected结果保持不变，`v1.1` 只追加 PQP/PQN 六项。实现可以增加不改变语义的内部单测，但不得删除、合并、重编号或改写这 63 个 case。变更 catalog 必须先升版并重新执行设计冻结流程。

计划实现位置由 [03A 实现规格](../../specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md) 决定；本设计不创建测试目录、fixture 文件、case manifest Schema 或 fault adapter。

## 14. 完成与声明边界

设计完成：本 catalog 的 factory、模式、错误码、优先级、63 个 case、只读 digest、pending attestation边界和声明边界全部冻结。

实现完成：必须由 03A implementation checklist证明 factory从 clean controlled inputs重建、63/63 case通过、三种枚举顺序一致、每项前后 tree digest相等；公开完整 verifier继续服务 Materializer写后、Candidate Author、Publisher和Golden Verifier，pending入口只服务cleanup Orchestrator。

release 完成：仍须使用真实 clean Plan/Bundle/JAR生成130份exact MATERIALIZED Report和130个SQLite base，并进入后续authoring/approval/publish Gate。受控63/63不能代替该证据。

## 15. 事实与假设

### 15.1 事实

1. Materialization Report `0.1` Schema 已存在，但不能表达 checks 顺序、跨文件 digest、SQLite 或 root 闭包；
2. Materializer 主设计要求唯一只读 verifier 被四类调用方复用；
3. 当前 verifier/factory、pending入口和六个新增case已按本catalog `v1.1` 形成63/63可复核证据；三种枚举顺序结果一致，全部case前后root tree digest相等；
4. 当前真实 production 130 项 Report/SQLite 和 approved golden 未生成。

### 15.2 假设

无。
