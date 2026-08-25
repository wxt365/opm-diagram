# Spec: DEV-CANVAS-06 E2E Fault Launcher 设计闭包修正

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与 Root Cause

活动 E2E Fault Plan `0.2` 已冻结 `ASSET_MISSING/PERSISTENCE_FAILED/READONLY` 的 case、target、trigger count、nonce 与摘要，但既有设计只写了“test launcher/fault port”占位，没有冻结 Spring 装配条件、完整启动参数、parent nonce/challenge 原始字节、Fault Plan raw SHA 校验、三类故障的精确产品层注入点、一次性状态机和稳定错误码。实现者仍可能自行选择删除资产、修改 SQLite、Controller 拦截、Repository hook 或生产配置开关，无法形成可复核的 `194/388` 证据。

当前仓库还存在两个可复现冲突：

1. 三类 Common E2E fixture 当前统一写 `expected_error_code=DOMAIN_REJECTED`，与产品提交链已经存在的 `TEXT_GENERATION_BLOCKED/PERSISTENCE_FAILED/READ_ONLY_REVISION` 语义不一致；
2. `LocalApiService.rejected(READ_ONLY_REVISION)` 当前落入默认 `PERSISTENCE_FAILED`，无法满足只读场景稳定 API 错误码。

## 2. 目标

1. 新增 E2E Fault Launcher 唯一设计，冻结 test-only 配置、普通启动默认拒绝和 Spring fail-closed 装配；
2. 冻结 parent nonce、challenge、challenge response 的原始字节和校验算法；
3. 冻结 Fault Plan 固定路径、链接约束、raw SHA、Schema/payload/semantic 摘要和身份复核顺序；
4. 冻结三类故障的唯一注入层、触发时机、一次性状态机、产品 API 错误码与 launcher 协议错误码；
5. 冻结 INITIAL/REOPEN 启动边界及正反例矩阵，使后继实现无需发明语义。

## 3. 非目标

- 本任务不实现 Java launcher、Spring Configuration、fault port、Runner 或 driver；
- 不修改活动 E2E Manifest/Attempt Artifact/Report Schema、Fault Plan `0.2` 字段或摘要公式；
- 不修改 Common fixture、OpenAPI、SQLite DDL、产品配置、Runtime JAR、Handoff、Manifest 或发布资产；
- 不执行真实 `194/388`、不生成 Report、Gate、Candidate、Activation，不启用 Capability，不声明 ISO 19450:2024 符合性。

## 4. 修改边界

允许修改：

- 本规格及对应设计/checklist；
- E2E Attempt Artifact 历史设计的活动后继指针；
- E2E Runner 实现规格/checklist；
- 测试策略、开发执行包、冻结基线和 `docs/README.md`。

禁止修改：

- `services/**`、`scripts/**`、`tests/**`、`packages/**`；
- `docs/contracts/schemas/**`、OpenAPI、SQLite migration；
- `.harness/**`、依赖、构建配置和生产配置。

## 5. 权威输入与兼容

1. 活动 Fault Plan 机器形状唯一为 `OPM-DEV-CANVAS-06-E2E-FAULT-PLAN-001/0.2`；
2. `plan_sha256` 继续等于既有六字段 JCS preimage 摘要，`artifact_payload_sha256` 继续等于删除自身后的完整 root JCS 摘要；
3. launcher 新增的 `plan_raw_sha256` 只属于受控启动参数，不写回 Fault Plan 或其他活动 Schema；
4. `nonce` 继续是 32-byte parent nonce 的 64 位小写 hex 编码；
5. 历史 Attempt Artifact `0.1` bytes 只读，活动 `0.2` Schema不升级；不兼容 launcher 变化必须升级 launcher 设计/实现版本，不能重解释已生成 Fault Plan SHA。

## 6. 必须冻结的设计

### 6.1 启动与配置

- 唯一 fault-enabled 入口为 `INITIAL` cycle 的三个故障 case；其余 191 个 `NONE` case及所有 `REOPEN` cycle使用普通 `java -jar`，不得携带任何 `opm.release.e2e.*` 配置；
- 普通启动只装配 `E2EFaultPort.NOOP`；唯一`EnvironmentPostProcessor` guard必须在bean definition前复核完整property sources和原始命令行；只有profile与九项参数均来自command line且全部闭合时，才装配attempt-local port；
- 零配置正常启动；任一 partial、未知、production 文件或环境变量配置必须稳定拒绝，禁止静默降级为 NOOP。

### 6.2 握手

- Runner 为每个 attempt 生成独立 32-byte CSPRNG parent nonce 与独立 32-byte challenge；
- Fault Plan `nonce=lowerhex(parent_nonce_bytes)`；challenge 文件保存原始 32 bytes，不是 hex、UTF-8 或 JSON；
- challenge response 固定为 HMAC-SHA-256，绑定协议域、challenge raw bytes 和 Fault Plan raw SHA bytes；比较使用常量时间；
- 握手只防止 attempt/process 误绑定，不构成跨用户认证或生产安全边界。

### 6.3 故障语义

- `ASSET_MISSING`：只在 `ProfilePackageAssembler` 解析 exact `SYMBOL_ASSET` 前触发，产品结果固定 `TEXT_GENERATION_BLOCKED`；
- `PERSISTENCE_FAILED`：只在 `SqliteRevisionCommitRepository` 完成事务内 receipt/head 复核后、执行第一条 `revision_document INSERT` 前触发，产品结果固定 `PERSISTENCE_FAILED`并完整 rollback；
- `READONLY`：只在 `RevisionCommitRepository.currentHead()`读取真实 Head 后、返回 `Head` 前将本次 exact command 的 `writable`投影为`false`，不修改SQLite，产品结果固定`READ_ONLY_REVISION`；
- 三者都采用`ARMED -> TRIGGERED -> VERIFIED`状态机；只允许 exact context 第一次触发，第二次触发或 shutdown 时未达到计划次数均使 attempt 证据无效。

## 7. 验收

设计验收至少证明：

1. 配置项、缺省/partial/production拒绝行为和 Spring 条件唯一；
2. nonce/challenge/HMAC 原始字节及编码唯一；
3. Plan path、raw/schema/payload/semantic/identity/handshake 检查顺序唯一；
4. 三类故障各有唯一注入点、一次性语义、产品错误码和零事务增量；
5. 正例覆盖三类 INITIAL 触发和普通 NONE/REOPEN；反例覆盖二次触发、plan drift、错误 challenge、错 nonce、错 case/ordinal/target、链接/路径和生产配置；
6. Runner 规格/checklist、测试策略、执行包、冻结基线和文档入口无活动冲突；
7. 文档检查和现有契约验证通过；不伪造 launcher 集成测试或 production evidence。

## 8. 回滚

回滚只删除本设计修正包及其跨文档指针，不修改或删除活动 Schema、现有 fixture、Runtime、用户 SQLite、Handoff、Manifest 或不可变 evidence root。

## 9. 事实与非结论

事实：Fault Plan builder、Schema和 Materializer identity preflight 已存在；E2E Fault Launcher、Spring fault port 和三类真实 UI/API 注入尚未实现。

事实：独立Fault Launcher实现规格与checklist现已建立并冻结38个精确逻辑路径；Java Build状态为`READY_FOR_BUILD/NOT_STARTED`，受控source commit为`BLOCKED_BY_BASE_INTAKE`，release重建还等待活动Manifest v02 producer/verifier。这不等于实现、集成测试、`194/388`、Report、Gate或发布完成。
