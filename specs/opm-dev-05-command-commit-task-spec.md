# Spec: OPM DEV-05 M03/M06/M07 Candidate Revision Commit

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 目标

基于 DEV-02 的 SQLite V1、DEV-03 的 `SemanticRevision` 和 DEV-04 的 OPL/Trace，实现 M03 候选 Revision 的守卫、校验、文本生成和原子提交边界。一次成功提交必须写入 Revision 文档、Draft Head、Operation Record、Idempotency Receipt、Finding Index 与 Text Trace Index。

## 2. 范围与非目标

包含 `services/local-runtime/**/command/**`、必要的 Revision JSON 写入器、SQLite 提交适配器和测试，以及本规格与 checklist。调用方提供已构造的候选 `SemanticRevision`；提交器负责 base revision、profile/rule、只读和幂等守卫，执行语义校验与 OPL 生成，并以单个 SQLite 事务写入所有 P0 派生数据。

不修改 V1、OpenAPI、HTTP controller、前端、项目/模型创建流程或完整 command payload union。不实现 Candidate Builder、Undo/Redo、规则 AST、后台全量校验、Baseline、State/Fact 扩展命令或完整 16/8/10 关系。DEV-06 承接 HTTP API 与 Project/Model 用例，DEV-CANVAS-00 承接完整 command union。

## 3. 设计输入

- `docs/design/opm-development-execution-pack.md` 第 5、6.3、7 节。
- `docs/design/opm-modeling-tool-module-design.md` M03、M06、M07、M08、M09、M12。
- `docs/design/opm-modeling-tool-persistence-contract.md` 第 5、6 节。
- `docs/design/opm-modeling-tool-application-api-contract.md` API-EDT-002、错误码与 guard 语义。
- `docs/contracts/migrations/sqlite/V1__initial_schema.sql`。

## 4. 方案要求

1. 命令输入包含 project/model/command/base revision、候选 revision、预期 Profile/Rule binding、Grammar 与稳定请求摘要；领域公开 API 不暴露 JDBC/Jackson 或可变集合。
2. 必须返回稳定结果：`COMMITTED`、幂等重放、`REVISION_CONFLICT`、`READ_ONLY_REVISION`、`RULE_VERSION_CONFLICT`、`VALIDATION_BLOCKED`、`TEXT_GENERATION_BLOCKED`、`IDEMPOTENCY_MISMATCH`、`PERSISTENCE_FAILED`。
3. 提交前验证 base revision 是当前可写 Head，候选 model/profile/rule binding 与 base 一致，候选 sequence 严格为 base + 1；Semantic validation 的每个问题生成可定位 BLOCKING Finding。
4. 文本阶段使用 DEV-04 P0 Grammar；任一文本或 Trace 阶段失败不得写入新 Revision、Head、Operation 或 idempotency receipt。
5. SQLite 适配器通过一个事务写入 `revision_document`、`revision_parent`、`model_head`、`operation_record`、`idempotency_record`、`finding_index` 与 `text_trace_index`。事务失败必须 rollback，Head 不得移动。
6. Revision 文档写入完整候选语义及本次 Text/Trace/Validation 摘要；读取器必须仍可读取其中语义部分。

## 5. 验收与验证

1. 成功提交可在 SQLite 中验证所有目标表记录、Head 移动、Revision JSON 可重读及 G-OPL-002 Trace Index。
2. revision/profile/rule/read-only/idempotency/validation/text 失败路径均无 partial committed revision；相同 request digest 可重放，不同 digest 返回 mismatch。
3. SQLite 写入阶段注入失败后 rollback；公开 API 无可变集合或 JDBC/Jackson 泄漏。
4. Java 21 定向测试、根级 `verify`、`npm run contract:validate` 与 `git diff --check` 通过。

## 6. 回滚与风险

本包不变更 schema 或 API；回滚删除 command/commit 代码与测试。候选 Revision 仍由调用方构造，Project/Model seed、HTTP command endpoint、完整 Rule AST 和真实 Grammar 资产尚未实现，不能据此声称完整编辑器或 ISO 符合性。
