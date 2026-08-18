# Spec: DEV-CANVAS-06 Golden Authoring 设计阻塞闭环

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与复现

2026-08-01 对全量冻结基线、Golden Fixture Materializer `v1.1`、Golden Authoring `v1.1`、Materialization Report `0.1` Schema、DEV-CANVAS-06 规格/checklist 和测试策略进行只读交叉审计后，确认仍有以下设计阻塞：

1. Report payload 要求覆盖 `generated_at/stage_durations_us/peak_rss_bytes` 等运行观测字段，同时要求空 root 重建后 payload 完全相同，确定性要求不可同时满足；
2. success Report 的 JCS/digest/Schema 机制自身失败时，旧设计仍要求使用同一机制生成 Schema-valid BLOCKED Report，存在失败自递归；
3. cleanup failure 的 primary/secondary failure、quarantine 布局、marker、失败升级和消费拒绝规则未冻结；
4. Materialization Report Schema 只覆盖结构，固定 checks 顺序、状态序列、跨字段 SHA/identity 和 primary failure 缺少唯一机器 verifier owner；
5. 可选并发 4 没有进入冻结命令参数和停止调度规则；
6. Approval Record `0.2`、Authoring Report `0.2`、审批记录生产协议和 `GOLDEN-AUTHORING-03B/04/05` 开发入口未形成封闭输入；
7. Golden Authoring、测试策略、开发执行包和冻结基线存在实现状态或 `20+10/22+10` 计数冲突。

任一上述问题存在时，冻结基线的 `unresolved_design_status_count=0`、`cross_document_conflict_count=0` 和 `READY_FOR_DEVELOPMENT` 不能作为事实。

## 2. 目标

1. 冻结 Materializer 的稳定语义摘要、运行证据差异、Report pipeline、失败升级、quarantine、并发和语义 verifier；
2. 冻结 Golden Authoring 生产 `0.2` 资产的完整字段增量、审批输入、稳定命令、状态条件和 exact join；
3. 为 `GOLDEN-AUTHORING-03B/04/05` 建立可直接进入开发的独立实现规格与 checklist；
4. 同步全部当前状态源和历史指针，重新计算 `32=22+10`；
5. 在文档验证通过后恢复全局设计门，但不提升任何实现、release、Activation、Capability 或 ISO 状态。

## 3. 非目标

- 不修改任何 JSON Schema、OpenAPI、SQLite DDL、Profile、Rule、Grammar 或 Symbol 资产；
- 不修改 Java、Node、Vue、Playwright、测试代码、`package.json` 或运行配置；
- 不执行真实 materialization、candidate authoring、审批、publish、Visual/E2E Gate、Candidate 或 Activation；
- 不生成 Approval/Authoring/Visual Manifest `0.2` 机器文件；
- 不把定向测试或设计冻结解释为生产证据或 ISO 19450:2024 符合性。

## 4. 修改范围

### 4.1 允许修改

- 本规格及对应 checklist；
- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`；
- `docs/design/opm-dev-canvas-06-golden-authoring-design.md`；
- `specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md` 及 implementation checklist；
- 新增 `GOLDEN-AUTHORING-03B/04/05` 实现规格与 checklist；
- `docs/design/opm-test-strategy.md`、`docs/design/opm-development-execution-pack.md`；
- `specs/opm-dev-canvas-06-toolchain-release-task-spec.md`、对应 checklist；
- `docs/design/opm-design-freeze-baseline.md`、`docs/README.md`；
- 为同步当前版本指针所必需的既有历史 spec/checklist；
- `docs/requirements/opm-requirement-acceptance-matrix.md` 中延期状态词。

### 4.2 禁止修改

- `.harness/**`；
- `apps/**`、`services/**`、`scripts/**`、`tests/**`、`packages/**`；
- `docs/contracts/**`、数据库 migration、API、依赖和配置；
- 任何 Handoff、Evidence Bundle、Report、SQLite、candidate/approved golden 或 release artifact。

## 5. 冻结修正

### 5.1 确定性

- `generated_at` 固定为 `source_date_epoch` 对应 UTC；
- stable projection 只包含 identity、exact input refs、binding、table counts、document SHA 和 `semantic_state_sha256`；
- `stage_durations_us/peak_rss_bytes/database_sha256/report_payload_sha256/report raw SHA` 是单次运行证据，不要求跨空 root 重建相等；
- 同输入重建必须 stable projection 相等，且每次报告自身 payload/raw SHA 闭合。

### 5.2 Report pipeline 与失败升级

- pipeline 固定为 context -> success content -> recoverable validation -> JCS/digest -> Schema -> temp write -> atomic rename；
- success content 不一致但 Report engine 健康时生成 `GFM_REPORT_CONTENT_INVALID` BLOCKED Report；
- JCS/digest/Schema engine/serializer 不可用或抛出内部错误时为 `GFM_REPORT_ENGINE_FAILED/4`，零最终 Report；
- report-out/temp/rename I/O 继续为 `GFM_REPORT_WRITE_FAILED/4`；
- Report 失败后的 storage 必须 cleanup；cleanup/quarantine 失败按 5.3 升级。

### 5.3 Cleanup 与 quarantine

- 原始业务失败始终保持 `primary_failure`，cleanup failure 追加为 secondary failure；
- cleanup 失败时把残留 storage 原子移动到固定 quarantine 路径，并生成封闭 marker；
- quarantine move/marker 失败升级为 `GFM_QUARANTINE_FAILED/4`、零最终 Report，整个 change root 不可消费；
- Candidate Author、Publisher 和 verifier 遇到非空 quarantine、marker 或任一失败/缺失 Report 必须拒绝整个 materialization root。

### 5.4 Materialization Report Verifier

冻结独立只读 verifier，负责 Schema 无法表达的 checks 顺序/唯一性、状态序列、ID、ref、binding、payload SHA、database SHA、semantic state 和 failure precedence。Materializer 写后、Candidate Author、Publisher 和 Golden Verifier 都必须调用同一 verifier；单纯 Schema-valid 不等于可消费。

### 5.5 并发

`--concurrency <1..4>` 是唯一并发入口，默认 `1`。失败后停止调度新项、等待已启动子进程结束，任一 sibling 结果只作诊断；输出和集合摘要始终按 `fixture_ref_key` 排序。

### 5.6 Golden Authoring 0.2

- Authoring Report `0.2` 从历史 `0.1` 封闭扩展 130 个 Materialization Report refs、130 个 database refs、2484/18 逐 attempt results、三个集合 SHA、verifier identity 和 payload SHA；
- Approval Record `0.2` 封闭增加 candidate Authoring Report raw/payload/attempt set SHA、authored Golden Environment ref、上述两类 130 refs/集合 SHA、PNG/blank/font refs；审批 payload 对 exact 字段闭包计算；
- 增加稳定 `golden:approve` 入口，Approver 从只读 candidate root 创建 fresh Approval Record；Applicant/Approver 不同，身份真实性仍由外部代码评审/发布审批负责；
- `03B` 只创建 candidate 和 `READY_FOR_APPROVAL` Report，`04` 创建审批并不可变 publish，`05` 创建/验证 Visual Manifest `0.2`；三包不得互相越权。

## 6. Root Cause

前一轮只收窄了 fixture identity 的 Report 接纳边界，没有对 Report 可变观测字段、Report engine 自身失败、cleanup 二次失败和下游 Approval `0.2` producer 做端到端重算；同时新增设计责任后，部分当前文档仍保留历史实现状态和责任计数。

## 7. Fix Strategy

1. 先修正 Materializer 单一事实源并同步 03A 实现规格；
2. 再补齐 Golden Authoring 生产 0.2 字段与 03B/04/05 开发包；
3. 同步 DEV-CANVAS-06、测试策略、执行包、索引和历史状态指针；
4. 最后重算冻结基线，验证通过后恢复 `READY_FOR_DEVELOPMENT`。

## 8. 验收标准

1. 确定性、运行指标和 raw evidence 不再互相矛盾；
2. 每个 Report 失败阶段只有一个确定输出、错误码和退出码；
3. cleanup/quarantine 的路径、marker、主次失败和消费拒绝可直接实现；
4. Report semantic verifier 的 owner、命令、输入、输出和调用方明确；
5. Approval/Authoring Report `0.2` 和 approve/publish/verify 链路字段封闭；
6. 03B/04/05 各自具有 Task Type、Active Playbooks、范围、非目标、验收、验证、兼容和回滚；
7. 当前文档统一为 `32=22+10`，无旧“未实现 Materializer”现行表述；
8. Markdown 链接、围栏、JSON 解析、定向 contract test 和 `git diff --check` 通过。

## 9. 验证方式

1. 搜索确定性、Report、cleanup、quarantine、并发、Approval 0.2 和状态词；
2. 对照 Materialization Report `0.1` Schema，确认设计明确区分结构校验和 semantic verifier；
3. 运行现有 Golden Authoring/Materializer 定向 Schema/Node test，确保纯文档修正未破坏既有资产；
4. 检查全部 Markdown 相对链接、代码围栏和 JSON Schema 解析；
5. 执行 `git diff --check`。

## 10. 兼容性与回滚

- API/Schema/SQLite/配置/依赖：本任务不修改；
- 历史 `0.1` 资产：保持历史输入身份，不能作为生产 approved authoring；
- 现有部分 Materializer 实现：必须按升版设计重新验收，不自动判定不兼容或完成；
- 回滚只回退本任务文档增量；回滚后因设计歧义恢复，全局门自动回到 `BLOCKED_BY_DESIGN`；
- 不删除或覆盖用户并行代码、Schema、测试和运行资产。

## 11. 事实与假设

### 11.1 事实

1. 当前工作树存在用户并行实现与机器 Schema 改动，本任务不得覆盖；
2. 当前没有真实 130 项生产 Materialization、approved golden、GATE-06-03 READY、Candidate、Activation 或 ISO PASS；
3. 本任务只修正文档设计和未来实现入口。

### 11.2 假设

无。
