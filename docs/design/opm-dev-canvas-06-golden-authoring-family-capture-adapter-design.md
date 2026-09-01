# DEV-CANVAS-06 Golden Authoring Family Capture Adapter 设计

文档版本：`0.1`

设计状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`NOT_IMPLEMENTED`

## 1. 目标与边界

本设计为 `GOLDEN-AUTHORING-03B` 冻结 Family capture 的唯一受控适配边界。它把已经语义验证的 `130` 份 Family Materialization Report/SQLite base，按 Capture Plan 固定的 `1170` 个 Family capture 和每项两次 attempt，交给隔离 Runtime、同源 production Web 与浏览器。它只产生 candidate work-root 内的 attempt 诊断输入和结果，不产生 Candidate Report、Approval、approved root、Visual Manifest、Gate 或生产证据。

不复用 `03C` Common Adapter 的 Request/Callback/Result 协议；Common 的八个 subject 和 Family 的 archive fixture、身份、clone 结果、Runtime Ready 均物理和机器契约隔离。

## 2. Family Capture Identity

每个 `(capture_id, attempt_ordinal)` 在创建 SQLite 前由 Node Adapter 写入 attempt-local、Schema-valid、JCS 编码的 `inputs/family-capture-identity.json`。该文件的唯一身份算法为：

```text
Plan FAMILY capture
+ exact Materialization Report
+ Plan.input_materialization.bundle_ref 中 fixture_ref.archive_entry_path 的原始 MS-REV-001/0.2 bytes
= Family Capture Identity 0.1
```

身份必须封闭以下字段：`capture_id`、`attempt_ordinal`、`source_date_epoch`、`fixture_ref`、`materialization_report_ref`、`materialized_identity`、`model_id`、`revision_id`、`revision_sequence`、`context_id`、`capability_id`、`viewport_id`、`zoom_id`、`expected_projection_sha256`、`focus_target_id`、`focus_anchor`、`expected_cells`、`critical_regions` 和 `identity_payload_sha256`。其中：

- `fixture_ref` 必须逐字段等于 Plan capture 与 Report `source_fixture_ref`；Node 从 Plan 所锁定 Bundle 受控解包到 `inputs/fixture.json` 后，重算 raw bytes；
- `model_id/revision_id/revision_sequence` 分别等于 archive fixture、Report `fixture_identity`、Report `materialized_identity`；
- `context_id` 只等于 archive fixture `model_header.root_context_id`，禁止从 SQLite、路径、URL、目录名或 Project ID 推断；
- `project_id` 只等于 Report `materialized_identity.project_id`，禁止派生、重命名或采用 E2E Family Catalog；
- `revision_id` 必须等于 Plan `expected_revision`；每个 fixture key 恰关联九个 capture；
- `identity_payload_sha256=SHA-256(UTF-8(RFC8785_JCS(删除该字段后的对象)))`，raw ref 与 payload SHA 不可互换。

Node 先复核 Plan、Materialization root 和 Bundle；缺 archive entry、JSON/Schema、raw SHA 或任一深度 join 时以 `GOLDEN_FAMILY_CAPTURE_INPUT_INVALID/2` 失败且零 attempt root。Family Clone/Web 只消费 identity 文件，不重新扫描 Bundle、Plan 或 materialization root。

## 3. Java Launch Mode 与 Artifact

`release-golden-authoring` 新增且只新增以下模式：

| Mode | web type | 生命周期 | 必需开关 |
| --- | --- | --- | --- |
| `RELEASE_GOLDEN_FAMILY_CLONE` | `none` | 有限任务 | `opm.release.golden-family.clone=true` |
| `RELEASE_GOLDEN_FAMILY_WEB` | `servlet` | 直到 Node 关闭 | `opm.release.golden-family.web-runtime=true` |

它们与现有 GFM 和 Common mode 互斥。缺失、重复、非 command-line、额外 `opm.release.golden-family.*` 键、Common/Family switch 混用、错误 profile 或 web type，必须在创建 storage、监听端口和写 artifact 前以 `GOLDEN_FAMILY_MODE_REJECTED/2` 拒绝。`LocalRuntimeApplication` 对 Clone 退出，对 Web 不主动退出。

Clone 命令的精确参数集合为 profile、`spring.main.web-application-type=none`、mode、`opm.release.golden-authoring=true`、Family switch、`capture-id`、`attempt-ordinal`、`family-capture-identity`、`base-storage-root`、`attempt-storage-root`、`clone-result-out` 和 `opm.release.source-date-epoch`。Clone 验证 identity、Report base database、sidecar、SHA、SQLite integrity/FK 和路径不重叠后调用既有 `GoldenFixtureAttemptCloneVerifier`；每项只接受 fresh output，原子写 Family Clone Result `0.1`。

Web 命令的精确参数集合为 profile、`spring.main.web-application-type=servlet`、mode、authoring switch、Family Web switch、`capture-id`、`attempt-ordinal`、`family-capture-identity`、`clone-result`、`runtime-ready-out`、`launch-nonce`、`opm.storage.root`、`opm.assets.root`、两个 `127.0.0.1/0` server address/port、health exposure/probe 与 epoch。它在应用和 management connector 均 ready 后，复核 Clone Result、five-file Profile root、outer JAR code source、identity、storage 和 nonce，原子写 Family Runtime Ready `0.1`。

两个新 Schema 均使用 `additionalProperties:false`、无 BOM UTF-8、LF、单一结尾换行、同目录 fresh temp -> fsync -> atomic rename -> parent fsync。所有 payload SHA 采用 RFC8785 JCS。Clone Result 的 `status=READY_FOR_RUNTIME`；Runtime Ready 的 `status=READY_FOR_BROWSER`。任何失败都不得写 READY artifact。

## 4. Node Adapter 调度与关闭

唯一 Node owner 为 `runFamilyGoldenCaptureAdapter({ plan, plan_ref, materialization, runtime_jar, profile_assets, web_dist, java_executable, browser, work_root, capture_callback })`。它只接收 03B preflight 已验证对象；不接受 source root、Bundle、JAR、Web、fixture、identity、project 或端口 override。它以 Plan Family 原顺序、每 capture attempt `1,2` 严格串行执行 `1170*2=2340` 次。

每个 attempt 的顺序固定为：

```text
derive/verify Family Capture Identity
-> fresh attempt root
-> clone CLI / Clone Result
-> Family Web Runtime / Runtime Ready
-> start attempt-local production Web from exact Web dist
-> launch fresh Chromium context/page
-> callback: route, zoom, quiet window, RAF, Projection/geometry, PNG
-> close browser and production Web
-> SIGTERM Runtime, wait <=10s, otherwise SIGKILL and fail
-> verify both ports closed, no SQLite sidecar, attempt/base tree digest unchanged
-> emit frozen attempt result
```

生产 Web 复用现有 `canvas06-e2e-production-web.mjs` 的 loopback static/SPA/proxy实现，不修改它；web-dist、Runtime 和 Profile 都必须为 attempt-local raw/tree validated copies，禁止 Vite、HMR、checkout fallback、日志/端口扫描或公网。Callback 无权创建 storage、启动 Runtime、修改 identity、选择 fixture 或跳过关闭；它仅在 Node 已验证 Ready、health、bootstrap、route 和 viewport 后接收冻结 invocation。

Runtime 单 attempt 总等待上限为 `30s`；关闭只接受 `0/null`、`null/SIGTERM`，或本次唯一 SIGTERM 已发出且无 SIGKILL 时的 `143/null`。任一失败停止整个 Family 调度，保留失败 attempt root 作为非成功诊断，禁止 partial normalized result 和后续 candidate 写入。

## 5. 错误、验收与非结论

错误码固定：输入/Schema/ref/identity 为 `GOLDEN_FAMILY_CAPTURE_INPUT_INVALID/2`；mode 为 `GOLDEN_FAMILY_MODE_REJECTED/2`；clone、ready、Web、browser、shutdown、sidecar、base drift、timeout、projection/geometry/PNG 不闭合为 `GOLDEN_FAMILY_CAPTURE_FAILED/3`；未分类 I/O/serializer 为 `GOLDEN_FAMILY_CAPTURE_INTERNAL_ERROR/4`。Java mode 守卫、Clone 和 Ready 共享同一退出码 owner。

验收要求覆盖两个 mode、三份 Schema、identity 深度 join、130 base/1170 capture/2340 attempt 顺序、fresh clone/browser/runtime、正反 shutdown、base digest、Bundle/fixture/report 漂移和 production Web 拒绝 Vite/fallback。定向受控测试仅证明 adapter 实现，不构成真实 candidate、approval、Visual Manifest、GATE-06-03、Activation、Capability 或 ISO 证据。
