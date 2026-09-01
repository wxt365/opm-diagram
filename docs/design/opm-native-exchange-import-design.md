# OPM 原生交换包持久化导入设计

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`

## 1. 范围

`EXCHANGE-02` 为 `.opmp` `1.0` 的 `PROJECT_FULL` 与 `BASELINE_ASSET` 增加
SQLite 持久化导入。唯一首发模式是 `NEW_PROJECT`：每次成功导入分配新的本地
`project_id`，不合并、不替换、不创建 Draft，也不公开 HTTP 或 OpenAPI 入口。
导入入口是 Java application service，调用方必须提供一个已经存在且为空的
storage root。

`MODEL_REVISION` 持久化、`NEW_MODEL`、`NEW_DRAFT_FROM_PACKAGE`、
`REPLACE_PROJECT`、导出 Writer、Profile 安装、签名、加密和外部工具互操作均不在
本切片内。

## 2. 首发包布局

所有 entry 均为 UTF-8 Canonical JSON，继续受
`opm-native-exchange-machine-contract.md` 的 Reader inspection 约束。

### 2.1 PROJECT_FULL

`PROJECT_FULL` 必须只包含下列 entry；`<model>`、`<revision>` 和 `<baseline>`
必须与 entry 内容相同，路径按 Unicode 升序。

```text
project/project.json                                      PROJECT_CATALOG
models/<model>/model.json                                 MODEL_CATALOG (每个模型一个)
models/<model>/head.json                                  ASSET, schema OPM-MODEL-HEAD-001/1.0
revisions/<model>/<revision>.json                         SEMANTIC_REVISION (每个 Revision 一个)
evidence/<model>/<revision>/capability-report.json        CAPABILITY_REPORT (每个 Revision 一个)
baselines/<baseline>.json                                 BASELINE (可选，每个 Baseline 一个)
```

每个 `SEMANTIC_REVISION` 依赖对应的 `MODEL_CATALOG`；每个 capability report 依赖
对应 Revision；每个 Baseline 依赖其 Revision。`head.json` 的 Revision 必须属于同一
Model。一个项目至少含一个 Model、一个 Revision 和一个 head；每个 Model 的
`revision_sequence` 必须从 `1` 连续且无重复。

### 2.2 BASELINE_ASSET

`BASELINE_ASSET` 必须且只能包含：

```text
model/model.json                                         MODEL_CATALOG
revisions/<source_revision_id>.json                      SEMANTIC_REVISION
evidence/capability-report.json                          CAPABILITY_REPORT
baselines/<source_baseline_id>.json                      BASELINE
```

该包导入后同样创建新 Project，包含一个 Model、一条 Revision 和一个 Baseline；
`model_head` 指向该 Revision，sequence 取 Revision document 的值。

### 2.3 JSON 形状

`PROJECT_CATALOG` 为精确对象：`project_id`、`name`、`normalized_name`、
`description`（可为 null）、`status`（固定 `ACTIVE`）、`default_profile_id`、
`default_profile_version`、`created_at`、`updated_at`。`MODEL_CATALOG` 为精确对象：
`model_id`、`name`、`normalized_name`、`description`（可为 null）、`status`（固定
`ACTIVE`）、`profile_binding`、`created_at`、`updated_at`。不携带 source `project_id`。

`OPM-MODEL-HEAD-001/1.0` 为精确对象：`model_id`、`draft_head_revision_id`、
`head_sequence`、`updated_at`。`OPM-BASELINE-001/1.0` 为精确对象：`baseline_id`、
`model_id`、`revision_id`、`name`、`normalized_name`、`description`（可为 null）、
`validation_report_digest`、`evidence_summary`、`created_at`。所有 ID、名称、时间及
`profile_binding` 必须与 Revision document 和 Manifest source 交叉一致；不满足时以
`EXCHANGE_SEMANTIC_REVISION_INVALID` 拒绝。

`MS-REV-001` 不定义 `created_at`。因此 Revision、导入来源和由导入创建的 package 行的
唯一时间来源固定为 `manifest.created_at`；`PROJECT_CATALOG`、`MODEL_CATALOG`、head 和
Baseline 自身的时间字段仍按其 entry 校验。导入器不得向 Revision document 增补或改写时间。

## 3. Profile、语义与文本闭包

导入器只接受每条 Revision 的五资产 Profile binding 与本地
`ProfilePackageAssembler` 精确相等的包。不得按 ID/版本猜测、从 checkout 回退，或把
package 内的 opaque report 当作 Profile 安装包。任一绑定、语义 Reader、
`SemanticRevisionValidator`、OPL/Trace 再生成或 capability report 摘要不一致时，
导入失败且不产生业务写入。

导入时 Revision document 原始 canonical bytes 原样写入 `revision_document`，其
`document_digest` 为该原始 bytes 的 SHA-256。由 document 可重建的
`element_index`、`fact_endpoint_index`、`occurrence_index`、`finding_index` 和
`text_trace_index` 在同一 SQLite transaction 写入；不得把 package 的派生 index
当作事实源。

## 4. 身份、来源与重复包

本地 `project_id` 由导入器新分配。源 Model、Revision、Element、Fact、Context、
Occurrence 和 Baseline ID 保持不变。每次成功导入写入 V2 的：

- `exchange_import_origin`：`package_digest` 全局唯一，并记录 package/source namespace、
  source project/model/revision/baseline、target project、导入时间和 importer version；
- `exchange_identity_map`：同一 import 的 `source_namespace/source_id/target_id/reason`，
  至少记录 Project 的 `NEW_PROJECT` 映射；其余保持的 identity 用 `PRESERVED` 明确记录。

导入开始前必须扫描所有已安装 project database 的 origin 表；同一
`package_digest` 已存在时返回 `EXCHANGE_DUPLICATE_PACKAGE`，不创建 staging 或业务数据。
不得用路径、包名或未验证的 source ID 判定重复。

## 5. 原子流程与失败边界

`IMP-01~08` 仅在内存与 staging SQLite 中执行。staging 位于
`<storage-root>/.exchange-staging/<package-digest>/projects/<target-project-id>/`，目标为
`<storage-root>/projects/<target-project-id>/`。目标不得预先存在，staging root 必须由
本次创建、不得为 symbolic link。

顺序固定为：Reader inspection -> 解析布局与交叉引用 -> exact Profile assemble ->
语义/文本/Trace 重算 -> duplicate 检查 -> staging migration -> 单 transaction 全量写入与
SQLite integrity/foreign-key/readback 校验 -> fsync staging database -> 原子 rename project directory
-> 尝试 fsync 父目录。Java FileChannel 无法在 macOS 打开目录时，父目录 fsync 为已知不可用的
平台能力，不阻断 rename 成功；此时仍保证无部分可见项目，但不把断电级目录持久化表述为证据。
任何 rename 前失败必须删除本次 staging，`projects/` 不得留下新目录；
rename 后失败仅允许报告 `EXCHANGE_PERSISTENCE_FAILED`，不得尝试删除已可见项目。

稳定错误码新增：`EXCHANGE_IMPORT_LAYOUT_INVALID`、`EXCHANGE_PROFILE_BINDING_MISMATCH`、
`EXCHANGE_VALIDATION_BLOCKED`、`EXCHANGE_TEXT_TRACE_BLOCKED`、
`EXCHANGE_DUPLICATE_PACKAGE`、`EXCHANGE_PERSISTENCE_FAILED`。Reader 原有错误码保持原样。

## 6. 验收与回滚

必须覆盖 `PROJECT_FULL` 多模型多 Revision/多 Baseline、`BASELINE_ASSET`、源 Project
重映射、保留内部 identity、重复 package、布局/交叉引用/Profile/Validation/Text/Trace
负例、SQLite 写入故障、staging 清理、原子安装和导入后的只读 readback。

本切片不构成外部互操作、生产发布、ISO 19450 符合性或备份/恢复证明。回滚只删除
EXCHANGE-02 应用层和 V2 migration；已成功导入的 Project 必须通过独立删除/恢复流程处理，
不得被升级或测试自动删除。
