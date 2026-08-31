# DEV-CANVAS-06 执行契约设计修正包

文档版本：`v1.0`

文档状态：`FROZEN_INCLUDED`

更新时间：2026-08-07

## 1. 定位

本文按固定顺序关闭三个执行级设计歧义：`02B Empty Text Artifact -> Recovery Launch Protocol -> E2E Java/Runner Source Identity`。它是三项修正的统一入口；字段级唯一事实源仍分别是对应设计、Schema和实现规格。

本包只冻结设计与机器契约，不实现fixture builder、SQLite materializer、Recovery launcher、E2E producer/verifier，不生成Report、Candidate或Activation，不启用Capability，也不构成production或ISO 19450:2024符合性证据。

## 2. 版本与兼容边界

| 修正项 | 活动契约 | 历史兼容 | 唯一Owner |
| --- | --- | --- | --- |
| 02B Empty Text Artifact | Visual Common Materialization `v1.5`（包含`v1.2`空工件、`v1.3` index/UI/source、`v1.4` E2E asset及`v1.5` Adapter/Fault闭包） | Revision `MS-REV-001/0.2`不变 | [Visual Common设计](opm-dev-canvas-06-visual-common-materialization-design.md) |
| Recovery Launch | Launch Request `0.1`、Launch Proof union `0.1`、Recovery Execution `v1.5` | Recovery Manifest `0.1`只读、活动Manifest `0.2`不变 | [Recovery Execution设计](opm-dev-canvas-06-recovery-execution-design.md) |
| E2E Java/Source Identity | E2E Report `0.2`、Runner Source Set `0.1`、Attempt Artifact设计`v1.3`（包含`v1.2` Java/source identity与Family identity/Fault Plan ordinal闭包） | E2E Manifest `0.1`不变、Report `0.1`只读 | [E2E Attempt Artifact设计](opm-dev-canvas-06-e2e-attempt-artifact-design.md) |

不兼容变更必须新建Schema/contract版本；禁止改写已提交fixture、Manifest、Report或release root。

## 3. Freeze 1：02B Empty Text Artifact

### 3.1 唯一Revision形状

每个Visual Common `MS-REV-001/0.2`必须显式包含：

```text
text_artifact.artifact_id = "artifact.visual.<slug>.empty"
text_artifact.modality = "OPL"
text_artifact.context_id = "context.visual.<slug>.sd"
text_artifact.grammar_ref = source_binding.text_grammar的id/version/sha256到Digest对象的逐字段映射
text_artifact.sentences = []
text_artifact.artifact_digest.algorithm = "sha256"
text_traces = []
```

禁止省略、`null`、空字符串、附加paragraph/token字段或调用正式OPL generator补造Sentence。该对象只表示Visual base尚未生成文本，不进入OPL/Token/Trace符合性判定。

### 3.2 Artifact Digest

唯一preimage identity为`OPM-DEV-CANVAS-06-EMPTY-TEXT-ARTIFACT-PREIMAGE-001/0.1`，完整包含`revision_id`、不含`artifact_digest`的上述`text_artifact`和`text_traces=[]`：

```text
artifact_digest.digest = sha256(UTF8(JCS(preimage)))
```

JCS只能使用共享owner；不trim、不改大小写、不排序数组。Revision digest在完整插入空工件、空Trace和validation summary后计算，只排除Revision自身`revision_digest`。

### 3.3 SQLite与Verifier计数

```text
text_artifact_count = Revision行中text_artifact为object且通过Revision 0.2与空工件语义校验的行数
text_trace_count = text_trace_index行数
```

fresh base固定为`revision_document_count/text_artifact_count/text_trace_count=1/1/0`。Verifier还必须证明Head Revision的`text_traces`是长度为`0`的数组。不得把数组本身、Sentence数、文件名或modality当作计数来源。

事务delta按提交前后上述计数之差计算：base物化为`1/1/0`，BLOCKED操作为`0/0/0`；成功新Revision仅在包含Schema-valid Text Artifact时增加`text_artifact_delta=1`，`text_trace_delta`等于新增`text_trace_index`行数。

## 4. Freeze 2：Recovery Launch Protocol

### 4.1 机器输入与秘密边界

唯一Launch Request为：

```text
docs/contracts/schemas/opm-dev-canvas-06-recovery-launch-request.schema.json
OPM-DEV-CANVAS-06-RECOVERY-LAUNCH-REQUEST-001/0.1
control/launch-request.json
```

`launch_request_payload_sha256=sha256(UTF8(JCS(排除自身字段的完整请求)))`，raw bytes固定为无BOM、无尾随换行的UTF-8 JCS bytes。

parent challenge由OS CSPRNG生成恰好32 raw bytes，唯一文件为`control/parent-challenge.bin`，POSIX权限为`0600`，Windows为当前父进程用户owner-only ACL。challenge只允许以SHA进入Request/Proof；原始bytes禁止进入日志、Report、Artifact Index或crash dump。`child-ready`身份验证成功后立即删除并同步`control/`目录。

### 4.2 Proof顺序与Owner

四类proof共用[Launch Proof union Schema](../contracts/schemas/opm-dev-canvas-06-recovery-launch-proof.schema.json) `0.1`，顺序固定为：

```text
child:  control/child-ready.json       sequence=0
child:  control/reachpoint.json        sequence=1，仅forced case
parent: control/parent-observed.json   sequence=2，仅forced case
parent: control/termination.json       sequence=3，仅forced case
```

每个proof的`payload_sha256=sha256(UTF8(JCS(排除自身字段的完整对象)))`。`termination.json`通过`parent_observed_ref`间接闭合已验证的reachpoint链；不得添加未冻结的直接reachpoint字段。

POSIX强停唯一为`SIGKILL -> SIGNAL/SIGKILL/null exit code`；Windows唯一为`TerminateProcess -> TERMINATED_PROCESS/null signal/integer exit code`。016/017要求未commit且HTTP bytes为0；018要求commit已返回且HTTP bytes为0；019要求commit已返回且HTTP bytes至少为1。

### 4.3 原子写入与首错

challenge、Launch Request和四类proof均执行同目录`CREATE_NEW temp -> write -> file force -> no-replace atomic move -> reopen/readback -> directory durability primitive`。final/temp必须为普通单链接文件；平台不能证明原子move、write-through或challenge权限时，在preflight拒绝，禁止降级为直接写final、copy-delete或覆盖rename。

唯一首错顺序为：

```text
Launch Request Schema/raw/payload/path
-> challenge create/permission/length/SHA
-> runtime/launcher raw ref与CodeSource
-> case/attempt/materialization/fault/reachpoint/command join
-> final/temp path fresh
-> child spawn/PID ownership
-> child-ready
-> challenge cleanup
-> reachpoint
-> parent-observed publish/readback
-> termination primitive/liveness/exit
-> termination proof publish/readback
-> artifact index/ref closure
```

首错后禁止继续或被后错覆盖。接纳前错误保持final Report零输出；接纳后的身份/窗口失败映射`RECOVERY_FAULT_NOT_REACHED`；原子writer、fsync和不可分类I/O映射`RECOVERY_UNEXPECTED_RUNTIME_ERROR`并保持零最终Report。

## 5. Freeze 3：E2E Java与Runner Source Identity

### 5.1 Report版本

E2E Manifest继续为`0.1`。历史E2E Report `0.1`只读，禁止新写；活动producer/verifier只写`OPM-DEV-CANVAS-06-E2E-REPORT-001/0.2`，`runner_identity.runner_version=0.2.0`。

Report `0.2`必须保留历史READY语义：`expectation=PASS`只允许`PASS_MATCHED`，`expectation=BLOCKED`只允许`BLOCKED_MATCHED`，且全部failure code为空。

### 5.2 Java executable evidence

Runner对实际JDK 21 executable执行lstat/realpath、普通文件、非链接、可执行、raw SHA与`java -version`验证，并将以下raw bytes镜像到同一SHA目录：

```text
inputs/runner/toolchain/java/<executable-sha256>/java|java.exe
inputs/runner/toolchain/java/<executable-sha256>/java-version.txt
inputs/runner/toolchain/java/<executable-sha256>/release
```

Report `runner_identity.java_executable`保存三项fileRef、OS/arch和`image_payload_sha256`。镜像目录名必须等于`mirror_ref.sha256`，basename必须与路径一致，三个ref必须位于同一目录。每个`runtime-process.cycles[].java_ref`必须与`mirror_ref`逐字段相等；规范化命令首项固定为`<E2E_JAVA_EXECUTABLE_MIRROR>`。

镜像只用于证据；Runtime仍从已验证的原始executable执行，且每次启动前重算raw SHA。Java mirror不属于Runner Source Set，也不等于Runtime JAR。

### 5.3 Runner Source Set

唯一机器契约为[Runner Source Set Schema](../contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json) `OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001/0.1/0.1.0`。`entries[]`必须按Schema `prefixItems`恰好列出23个文件，既不排序也不增删：

```text
selection_policy = EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED
source_set_sha256 = sha256(UTF8(JCS(排除source_set_sha256的完整对象)))
```

选择逻辑只能逐项读取Schema allowlist。禁止glob、目录递归、Git tracked set、import graph、mtime或扩展名扫描。所有未列路径均排除；`excluded_classes[]`仅作封闭审计说明，不授权扫描。

Report `runner_identity.runner_source_sha256`必须等于Source Set的`source_set_sha256`；`runner_source_set_ref`引用Source Set raw文件。产品Java/Vue分别由exact Runtime JAR/Web dist承接，`package-lock.json`由`source_build.lockfile_sha256`承接，不重复加入source set。

## 6. 验证与状态边界

本包机器正反例入口：

```text
node --test scripts/validate-canvas06-recovery-schemas.test.mjs
node --test scripts/validate-canvas06-visual-e2e-schemas.test.mjs
```

验证必须覆盖normal/forced Launch Request、32-byte challenge、四类proof、reachpoint窗口、POSIX/Windows termination、extra/摘要篡改、历史/活动E2E Report、Java ref、23项ordered source set及缺失/extra/错序/摘要漂移。

设计冻结后状态保持：`32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`，`blocked=0`、`unresolved=0`、`cross_document_conflict=0`，开发门为`READY_FOR_DEVELOPMENT`。这只解除实现输入歧义；02B/03C、Recovery `28/56`、E2E `194/388`、READY Report、Candidate、Activation、Capability、production和ISO状态均不提升，ISO仍为`EVIDENCE_MISSING/无法判断`。
