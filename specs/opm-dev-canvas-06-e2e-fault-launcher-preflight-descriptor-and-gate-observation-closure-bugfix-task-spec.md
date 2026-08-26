# Spec: DEV-CANVAS-06 E2E Fault Launcher Preflight Descriptor 与 Gate 观测闭包修正

文档状态：`FROZEN`

设计修正状态：`COMPLETE`

Fault Launcher 2A 准入：`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

既有 Fault Launcher 受控 Playwright 闭包只冻结了十项即时 preflight result，没有冻结可由上游不可变 raw ref 锁定的执行计划。JarIT、Golden Environment/browser、三个 fault case 的两次 attempt、端口和 Gate 执行前状态因此仍由未来 Node owner 在运行时自行拼装。

旧 `FLCP-D10-GATE` 还要求 preflight 同时证明 production gate 的前、中、后状态。preflight 在任何 Runtime、Web 或 Browser 子进程启动前结束，不可能产生执行中和执行后观测；把三阶段状态写入 preflight report 会形成伪造或事后反填证据。

最小复现条件为：

1. `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1` 根对象为 `additionalProperties=false`，没有 preflight descriptor raw ref；
2. 活动 E2E Manifest `0.2/0.2.0` 同样为封闭对象，没有该 ref；
3. `FLCP-D10-GATE` 同时使用 preflight 与 execution 两个时间域；
4. 当前没有 JarIT Report、Fault Launcher Preflight Descriptor 或 Gate Execution Observation 的机器 Schema。

## 2. Root Cause

### 2.1 问题原因

Clean Base 闭包只处理了 `36 READ_ONLY_BASELINE + 2 A` 和依赖阻断输出，没有把“谁决定本轮运行输入”与“谁记录执行期事实”拆成两个不可变契约。原 D10 以一句“前中后均禁用”合并了输入快照、实时观测和最终聚合三种不同职责。

### 2.2 为什么之前未被发现

旧设计验证了 preflight report 的字段、退出码和零副作用，却没有沿受控 bundle -> descriptor -> schedule/port/Gate snapshot -> Playwright artifact 逐项检查 raw ref 和时序闭包。

## 3. Fix Strategy

唯一修正如下：

1. 保持活动 production/controlled E2E Manifest `0.2/0.2.0` byte shape 不变；
2. 保留 Controlled Input Bundle `0.1` 为历史 Visual/E2E 输入，新增 Bundle `0.2`；
3. Bundle `0.2` 必须以不可变 `preflight_descriptor_ref` 引用 Fault Launcher Preflight Descriptor `0.1`；
4. descriptor 固定 JarIT Report、Golden Environment/browser、三类 case 的两个 attempt、12 个 process cycle、端口分配和执行前 Gate snapshot；
5. 原 `FLCP-D10-GATE` 拆为 preflight dependency `FLCP-D10A-GATE-PREFLIGHT` 和 execution evidence `FLCP-D10B-GATE-EXECUTION`；
6. 2A 实现保持两个新增文件的逻辑范围，但必须等待后继 contract 包形成新的 clean base intake，禁止从 `0dcaa27...` 直接继续 Build。

## 4. 版本、引用方与无环拓扑

### 4.1 唯一版本决定

| 契约 | 活动身份 | 状态 |
| --- | --- | --- |
| 历史 Controlled Input Bundle | `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1` | 只读兼容，不得供 Fault Launcher lane 消费 |
| Fault Launcher Controlled Input Bundle | `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.2` | 后继实现目标 |
| Preflight Descriptor | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PREFLIGHT-DESCRIPTOR-001/0.1` | 后继实现目标 |
| JarIT Report | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-JARIT-REPORT-001/0.1` | 后继实现目标 |
| Gate Execution Observation | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-GATE-OBSERVATION-001/0.1` | 后继实现目标 |

机器 Schema 路径固定为：

```text
docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json
docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json
docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json
docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
```

### 4.2 唯一引用拓扑

```text
controlled-bundle.json 0.2
  -> preflight_descriptor_ref
     -> preflight-descriptor.json 0.1
        -> jarit_report_ref
        -> golden_environment_ref
        -> runtime_jar_ref
        -> browser_executable_ref
        -> fault_attempt_schedule / port_allocations
        -> gate_preflight_snapshot

actual Manifest 0.2 + descriptor
  -> FLCP-D05 exact semantic join
  -> FLCP-D10A preflight Gate join
  -> Playwright 12 cycles
  -> gate-observation.json 0.1
```

Descriptor 不得包含 `manifest_ref`。受控 Manifest builder 本来就消费 controlled bundle；若 descriptor 再引用 final Manifest 会形成构建环。实际 Manifest 仍由 preflight CLI 独立传入，`FLCP-D05-MANIFEST` 必须逐项比较 source commit、三个 case、attempt ordinal 和 process cycle，不允许靠路径或名称推断。

生产 Manifest 不增加可选字段，不接受 Bundle `0.2`，不承载 Fault Launcher 测试输入。Fault Launcher controlled lane 只接受 Bundle `0.2`；其他历史 Visual/E2E lane 是否继续读取 `0.1` 由其既有 verifier 决定，不得把 `0.2` 静默降级为 `0.1`。

## 5. Controlled Input Bundle 0.2

`0.2` 保留 `0.1` 的全部九个必填字段，并新增第十个必填字段：

```text
preflight_descriptor_ref
```

该 ref 必须是封闭 `fileRef={kind,path,byte_length,sha256}`，其中：

```text
kind=FAULT_LAUNCHER_PREFLIGHT_DESCRIPTOR
path=fault-launcher/preflight-descriptor.json
```

路径相对 controlled bundle root，目标必须是 root 内 single-link、非 symlink 常规文件。`approved_version_ref` 对 Fault Launcher 仍必须显式为 JSON `null`。

Bundle `0.2` 身份公式唯一为：

```text
bundle_identity_sha256 = SHA-256(RFC8785_JCS({
  bundle_class,
  handoff_ref,
  intake_report_ref,
  evidence_bundle_ref,
  approved_version_ref,
  preflight_descriptor_ref
}))

bundle_id = "canvas06-controlled-" + bundle_identity_sha256
bundle root basename = bundle_id
```

字段缺失、使用 `0.1` identity 公式、descriptor ref 漂移、`approved_version_ref` 非 `null` 或 descriptor 指向 root 外时，Fault Launcher consumer 固定以 `CONTROLLED_BUNDLE_NOT_READY/exit 3` 阻断，零 Runtime/Web/Browser/SQLite/attempt 输出。

## 6. Preflight Descriptor 0.1

### 6.1 顶层封闭字段

Descriptor 根对象必须 `additionalProperties=false`，字段顺序语义固定为：

```text
schema_id
schema_version
descriptor_id
generated_at
source_commit
runtime_jar_ref
jarit_report_ref
golden_environment_ref
browser_executable_ref
fault_attempt_schedule
port_allocations
gate_preflight_snapshot
descriptor_payload_sha256
```

字段规则：

| 字段 | 唯一规则 |
| --- | --- |
| `schema_id` | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PREFLIGHT-DESCRIPTOR-001` |
| `schema_version` | `0.1` |
| `descriptor_id` | `dev-canvas-06.fault-launcher-preflight.<descriptor_payload_sha256前12位>` |
| `generated_at` | UTC、整秒、`Instant.ofEpochSecond(...).toString()`可严格往返 |
| `source_commit` | 40 位小写 Git commit；必须唯一等于以contract clean base为parent的2A final commit |
| `runtime_jar_ref` | bundle root 内 `fault-launcher/inputs/build/local-runtime.jar`，`kind=LOCAL_RUNTIME_JAR` |
| `jarit_report_ref` | bundle root 内 `fault-launcher/reports/jarit-report.json`，`kind=FAULT_LAUNCHER_JARIT_REPORT` |
| `golden_environment_ref` | bundle root 内 `fault-launcher/environment/golden-environment.json`，`kind=GOLDEN_ENVIRONMENT` |
| `browser_executable_ref` | 封闭 `{realpath,byte_length,sha256}`，指向只读常规 executable |
| `fault_attempt_schedule` | 第 8 章固定 6 项有序数组 |
| `port_allocations` | 第 9 章固定 6 项有序数组、共 12 个互异端口 |
| `gate_preflight_snapshot` | 第 10 章执行前 Gate 快照 |
| `descriptor_payload_sha256` | 第 6.2 节公式 |

### 6.2 Descriptor 身份公式

```text
descriptor_payload_sha256
= SHA-256(RFC8785_JCS(descriptor 删除 descriptor_id 和 descriptor_payload_sha256))

descriptor_id
= "dev-canvas-06.fault-launcher-preflight."
 + descriptor_payload_sha256[0:12]
```

生成器必须先完成全部 transitive ref 验证，再一次计算 payload SHA 和 ID。Verifier 删除相同两字段复算；禁止把原始 JSON bytes SHA、bundle identity、Manifest SHA 或任一上游 ref SHA 替代 payload SHA。

## 7. JarIT、Golden Environment 与 Browser Closure

### 7.1 JarIT Report 0.1

JarIT Report 根对象必须封闭，固定字段：

```text
schema_id, schema_version, report_id, generated_at, source_commit,
runtime_jar_ref, java_version, java_executable_ref,
build_command_tokens, jarit_command_tokens, surefire_xml_ref,
test_class, test_method_ids, test_count, passed_count, failed_count,
skipped_count, report_status, report_payload_sha256
```

唯一成功条件为：

```text
report_id=dev-canvas-06.fault-launcher-jarit.<runtime_jar_ref.sha256前12位>.<source_commit前12位>
test_class=org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT
test_count=6
passed_count=6
failed_count=0
skipped_count=0
report_status=PASS
```

`generated_at`必须与包含它的Preflight Descriptor `generated_at`逐字符相等。`java_executable_ref`封闭为`{realpath,byte_length,sha256}`，realpath必须位于`--java-home/bin/java`且执行版本为JDK 21；禁止从PATH或当前shell Java替代。

`test_method_ids` 按 Java 方法名原始UTF-8字节升序固定为：

```text
detectsPlanDriftDuringChildShutdown
rejectsAJarWhoseEmbeddedSchemaDiffersFromTheFrozenRawBytes
rejectsAPartialTupleBeforeSpringBootStarts
rejectsAnInvalidChallengeFromTheExactJar
rejectsShutdownWhenThePlannedSingleTriggerDidNotOccur
startsOnlyTheExactJarWithACompleteTupleAndEmitsReady
```

两条命令token数组固定为：

```text
build_command_tokens=[
  <absolute-maven-executable>,
  "-pl", "services/local-runtime", "-am", "-DskipTests", "package"
]

jarit_command_tokens=[
  <absolute-maven-executable>,
  "-pl", "services/local-runtime",
  "-Dtest=E2EFaultLauncherJarIT", "test"
]
```

两条命令只允许由preflight input producer从clean 2A source root顺序执行，环境中的`JAVA_HOME`只来自producer `--java-home`，不得使用shell、PATH补全、profile、网络下载或额外Maven参数。`surefire_xml_ref`固定指向bundle内`fault-launcher/reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml`，producer必须从exact Maven output逐byte镜像，并从XML复算六个method与`6/6/0/0`；禁止从stdout、JUnit源码计数或手写JSON声称PASS。

`report_payload_sha256=SHA-256(JCS(删除本字段后的 report))`。Descriptor 的 `runtime_jar_ref` 必须与 JarIT Report 中的 ref 逐字段相等；实际 Manifest 的 exact Runtime JAR ref 还必须在 `FLCP-D03-RUNTIME` 中与二者逐 byte 闭合。缺 report、非 PASS、计数不等、测试方法集合漂移、JDK 非 21 或 JAR ref 不闭合均返回 `RUNTIME_JAR_NOT_READY`。

### 7.2 Golden Environment 与 Browser

`golden_environment_ref` 必须通过 Golden Environment `0.2` Schema 和 semantic verifier，且至少保持：

```text
playwright_version=1.57.0
chromium_version=143.0.7499.4
color_profile=sRGB IEC61966-2.1
```

Descriptor 的 `browser_executable_ref` 必须与 Golden Environment `browser_executable={realpath,byte_length,sha256}` 逐字段相等；CLI `--browser-executable` 的 realpath、raw length 和 SHA-256 还必须与二者相等。禁止从 Playwright cache、PATH、checkout、下载目录或版本字符串回退定位 executable。任一不一致返回 `BROWSER_NOT_READY`。

## 8. 三类 Fault Attempt 调度

`fault_attempt_schedule` 必须恰为以下顺序，不允许缺失、额外、重排或并发：

| schedule_id | case_id | fault_kind | attempt_ordinal | process_cycles | port_allocation_id |
| --- | --- | --- | ---: | --- | --- |
| `FL-SCH-01` | `E2E-CANVAS-007.ASSET_MISSING` | `ASSET_MISSING` | `1` | `INITIAL,REOPEN` | `FL-PORT-01` |
| `FL-SCH-02` | `E2E-CANVAS-007.ASSET_MISSING` | `ASSET_MISSING` | `2` | `INITIAL,REOPEN` | `FL-PORT-02` |
| `FL-SCH-03` | `E2E-CANVAS-007.PERSISTENCE_FAILED` | `PERSISTENCE_FAILED` | `1` | `INITIAL,REOPEN` | `FL-PORT-03` |
| `FL-SCH-04` | `E2E-CANVAS-007.PERSISTENCE_FAILED` | `PERSISTENCE_FAILED` | `2` | `INITIAL,REOPEN` | `FL-PORT-04` |
| `FL-SCH-05` | `E2E-CANVAS-007.READONLY` | `READONLY` | `1` | `INITIAL,REOPEN` | `FL-PORT-05` |
| `FL-SCH-06` | `E2E-CANVAS-007.READONLY` | `READONLY` | `2` | `INITIAL,REOPEN` | `FL-PORT-06` |

每项 `process_cycles` 是固定两元素数组 `['INITIAL','REOPEN']`。总数固定为 `3 cases / 6 attempts / 12 process cycles`。`attempt_ordinal` 仍由同 attempt root 内已经验证的 `fault-plan.json` 提供并与 schedule 交叉验证，不得从目录名推断。

## 9. 端口分配

`port_allocations` 与 schedule 一一对应，每项封闭为：

```text
allocation_id
schedule_id
host
runtime_port
web_port
```

规则固定为：

1. `allocation_id=FL-PORT-01~06`，`schedule_id=FL-SCH-01~06`逐项对应；
2. `host=127.0.0.1`；
3. `runtime_port/web_port` 均为 `1024..65535` 整数；
4. 12 个端口值全局互异，不与 descriptor producer、preflight parent 或已知 listener 冲突；
5. 同一 attempt 的 `INITIAL/REOPEN` 按顺序复用其两个端口，前一 cycle 的 Runtime/Web 已完全终止后才启动后一 cycle；
6. preflight 必须在首个 child 启动前重新检查全部 12 个端口；每个 cycle 启动前再次检查其两个端口；
7. 任一端口已占用时，禁止运行时改号，当前 descriptor 失效，返回 `ISOLATION_NOT_READY`；必须重新生成 descriptor 和 Bundle `0.2` identity。

端口可用检查不能消除操作系统级竞争；child bind 失败仍以当前 attempt 失败记录，不允许自动 retry 或换端口。

## 10. D10A：执行前 Gate Snapshot

### 10.1 快照形状

`gate_preflight_snapshot` 封闭字段为：

```text
observed_at
state
enabled_capability_ids
candidate_loader_status
fixed_handoff_ref
fixed_handoff_realpath
activation_input_root_realpath
activation_input_refs
activation_input_set_sha256
snapshot_payload_sha256
```

固定成功值为：

```text
state=DISABLED
enabled_capability_ids=[]
candidate_loader_status=NOT_ACTIVE
activation_input_refs=[]
activation_input_set_sha256=4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945
```

其中 `activation_input_set_sha256=SHA-256(JCS(activation_input_refs))`；上值是 `SHA-256(JCS([]))`。`snapshot_payload_sha256=SHA-256(JCS(删除本字段后的 snapshot))`。`fixed_handoff_ref` 必须与 Bundle `0.2` 的 `handoff_ref` 逐字段相等，`fixed_handoff_realpath`必须定位当前生产fixed Handoff，`activation_input_root_realpath`必须定位当前生产activation input root；二者均为absolute normalized realpath。live fixed Handoff raw bytes必须与bundle ref相等，且其Gate为`DISABLED + []`。

### 10.2 唯一 observer 边界

Gate observer 是 parent Runner 内部只读 owner，只允许读取 exact fixed Handoff 和受控 production activation input root。`candidate_loader_status=NOT_ACTIVE` 只能由 verified activation input set 为空推导；不得通过 UI 文本、进程名、HTTP 200、测试 mock 或“没有创建 Candidate”推断。

Observer 不新增公共 HTTP API，不修改 Runtime production wire，不调用 Activation/Enablement writer，不创建或删除 activation 输入。输入 root、Handoff 或 refs 发生变化时必须 fail-closed。

受控 preflight CLI 必须新增且只新增以下两个显式输入：

```text
--fixed-handoff <absolute-current-fixed-handoff-json>
--production-activation-root <absolute-read-only-production-activation-input-root>
```

fixed Handoff和activation root必须与 source、controlled bundle、Manifest、attempt、process-control 和 output root 物理隔离；不得从 cwd、bundle ref、环境变量或默认目录推断。任一不存在、类型/link不合法、realpath与descriptor不等、fixed raw bytes漂移或activation input set非空时，D10A 为非 READY。

### 10.3 `FLCP-D10A-GATE-PREFLIGHT`

原 `FLCP-D10-GATE` 被废止，preflight 第十项唯一改为：

| dependency_id | READY 条件 | 非 READY detail_code |
| --- | --- | --- |
| `FLCP-D10A-GATE-PREFLIGHT` | descriptor 快照合法，且 preflight parent 重新观测的当前快照与其 exact 相等，均为 `DISABLED + [] + NOT_ACTIVE` | `PRODUCTION_GATE_PREFLIGHT_MISMATCH` |

该项只证明执行前状态。`dependency_results[]` 仍恰为 10 项，前九项 ID 和顺序不变，第十项由 D10 替换为 D10A。preflight report 的 `blocking_dependency_ids` 同步使用 D10A，不允许出现历史 D10。

## 11. D10B：Playwright 执行期 Gate 观测

### 11.1 时间点与计数

`FLCP-D10B-GATE-EXECUTION` 不属于 preflight dependency，由 Playwright 执行 artifact 承接：

1. `BEFORE`：preflight `READY_TO_RUN` 后、首个 Runtime/Web/Browser child 启动前，恰 1 项；
2. `DURING`：每个 `INITIAL/REOPEN` cycle 完成且对应子进程终止后立即观测，按第 8 章顺序恰 12 项；
3. `AFTER`：全部 Runtime/Web/Browser child 终止后、artifact staging commit 前，恰 1 项。

总观测数固定为 `14=1 BEFORE+12 DURING+1 AFTER`。所有快照都必须与 D10A 重新观测值 exact 相等，聚合必须为 `production_gate_mutation_count=0`。

### 11.2 Gate Observation Artifact 0.1

根对象必须 `additionalProperties=false`，字段固定为：

```text
schema_id, schema_version, observation_id, generated_at,
preflight_descriptor_ref, preflight_report_ref,
before, during, after, production_gate_mutation_count,
observation_status, failures, observation_payload_sha256
```

身份与引用固定为：

```text
observation_id
= "dev-canvas-06.fault-launcher-gate."
 + preflight_descriptor_ref.sha256[0:12] + "."
 + preflight_report_ref.sha256[0:12]

preflight_report_ref={
  kind=FAULT_LAUNCHER_PREFLIGHT_REPORT,
  path=fault-launcher/preflight-report.json,
  byte_length,
  sha256
}
preflight_descriptor_ref={
  bundle_id,
  bundle_identity_sha256,
  path=fault-launcher/preflight-descriptor.json,
  byte_length,
  sha256
}
```

`preflight_report_ref.path`相对controlled evidence root；`preflight_descriptor_ref.path`相对其显式`bundle_id` root。两类ref形状不同且均`additionalProperties=false`，禁止把descriptor复制进evidence root后降格为普通file ref。

preflight CLI成功时仍只写`RFC8785_JCS(report)+LF`到stdout。父Runner必须先逐byte验证stdout、Schema和payload SHA，再在启动Playwright前把完全相同的JSON bytes原子写入fresh controlled evidence staging root的`fault-launcher/preflight-report.json`；禁止重新序列化。preflight为BLOCKED或输出不闭合时不得创建该mirror或任何evidence root。

`before/after` 使用第 10.1 节完整snapshot形状并增加 `phase`；`during[]` 恰 12 项，每项增加 `phase=DURING/schedule_id/process_cycle/ordinal`。`ordinal=1..12`，schedule/cycle 顺序必须与第 8 章完全一致。`failures[]`每项封闭为`{code,phase,schedule_id,process_cycle,evidence_refs}`；非DURING阶段的`schedule_id/process_cycle`必须显式为JSON `null`，成功时数组为空。

成功值固定为：

```text
observation_status=PASS_MATCHED
production_gate_mutation_count=0
failures=[]
```

`observation_payload_sha256=SHA-256(JCS(删除本字段后的 artifact))`。Artifact 必须在 fresh attempt evidence staging root 中写临时文件、flush/fsync、原子 rename，并由只读 verifier 复算后才能被 controlled Playwright result 引用；不得写入 production Report root。

### 11.3 漂移与首错

任一 BEFORE/DURING/AFTER 观测不等时：

```text
error_code=PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN
observation_status=FAILED
production_gate_mutation_count>=1
```

Runner 必须保留首次不一致的 phase/schedule/cycle/evidence refs，立即停止所有尚未开始的 cycle，终止本轮已启动的受控子进程，写出 FAILED Gate Observation Artifact；禁止继续执行后再用 AFTER 覆盖首次错误。该失败不是 retry、skip、PASS 或 production gate 回滚证明。

## 12. Preflight 检查顺序与错误边界

唯一顺序为：

```text
参数形状
-> Bundle 0.2 Schema/identity/raw refs
-> Descriptor Schema/payload SHA
-> JarIT Report/Runtime JAR join
-> Golden Environment/Browser join
-> schedule/port closure
-> actual Manifest semantic join
-> FLCP-D01~D09
-> FLCP-D10A current Gate re-observation
-> preflight report
```

首错边界：

1. 参数形状错误：exit `2`、无 preflight report；
2. 可报告依赖缺失/不匹配：`BLOCKED_BY_DEPENDENCY`、exit `3`，仍输出全部十项 dependency result；
3. 任一依赖非 READY：零 Runtime/Web/Browser/SQLite/attempt/control/release 写入；
4. 十项 READY：只授权固定 Playwright 命令，不能预写 D10B、不能表示测试通过；
5. D10B 漂移发生在执行域，只能由 Gate Observation Artifact 表达，不得回填或修改已经生成的 preflight report。

## 13. 后继 Contract 实现包

### 13.1 Build 前置与 base supersession

当前 `0dcaa27a92693feaf28b731ebed2f81a9ccea02c` 继续作为 36 项 Fault Launcher raw-ref 的不可变来源，但不再是 2A 的直接可实施 parent。必须先从 exact `0dcaa27...` 建立独立 contract 实现 commit；其通过验证并被接纳为新的 clean base 后，2A commit 才能以该 commit 为唯一 parent。

新 contract commit 未形成前：

```text
Fault Launcher 2A = BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION
Controlled Playwright = NOT_RUN
GATE-06-03 = BLOCKED/NOT_RUN
```

### 13.2 精确 allowlist：`12=4 M+8 A`

只允许：

```text
M package.json
M scripts/validate-canvas06-controlled-input-bundle-schema.test.mjs
M scripts/verify-canvas06-controlled-input-bundle.mjs
M scripts/verify-canvas06-controlled-input-bundle.test.mjs
A docs/contracts/schemas/opm-dev-canvas-06-controlled-input-bundle-v02.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-jarit-report.schema.json
A docs/contracts/schemas/opm-dev-canvas-06-e2e-fault-launcher-gate-observation.schema.json
A scripts/release-canvas06-e2e-fault-launcher-preflight-input.mjs
A scripts/release-canvas06-e2e-fault-launcher-preflight-input.test.mjs
A scripts/verify-canvas06-e2e-fault-launcher-preflight-input.mjs
A scripts/verify-canvas06-e2e-fault-launcher-preflight-input.test.mjs
```

该包不得修改活动 Manifest、Attempt Artifact、Report、Runner Source Set、Fault Plan、36 项基线、2A 两文件、OpenAPI、SQLite DDL、Profile、production wire 或既有 release root。若实现证明必须修改上述任一路径，必须新建 bugfix 规格，禁止静默扩展 allowlist。

### 13.3 原子产物与验证

唯一 producer CLI 固定为：

```text
node scripts/release-canvas06-e2e-fault-launcher-preflight-input.mjs \
  --source-root <absolute-clean-2A-source-root> \
  --controlled-input-root <absolute-read-only-controlled-input-root> \
  --output-parent <absolute-fresh-output-parent> \
  --maven-executable <absolute-maven-executable> \
  --java-home <absolute-jdk21-home> \
  --golden-environment <absolute-golden-environment-v02> \
  --browser-executable <absolute-chromium-executable> \
  --fixed-handoff <absolute-current-fixed-handoff-json> \
  --production-activation-root <absolute-read-only-activation-root>
```

唯一 verifier CLI 固定为：

```text
node scripts/verify-canvas06-e2e-fault-launcher-preflight-input.mjs \
  --source-root <absolute-clean-2A-source-root> \
  --controlled-bundle-root <absolute-installed-bundle-root> \
  --fixed-handoff <absolute-current-fixed-handoff-json> \
  --production-activation-root <absolute-read-only-activation-root>
```

参数各恰好一次；拒绝未知、重复、空值、`--x=y`、位置参数、相对路径、root 相等或包含。Producer 参数错误/输入不闭合固定 exit `2` 且 final/temp 零输出；Verifier 永远只读，成功 exit `0`，契约或 raw ref 不一致 exit `2`。

`--controlled-input-root`必须是已经通过历史E2E consumer verifier的Bundle `0.1`，且`approved_version_ref=null`。Producer只允许逐byte复制其Handoff、Intake和Evidence Bundle普通文件，并保持三个raw ref逐字段不变；随后增加Fault Launcher子树、改写descriptor version/identity为Bundle `0.2`。禁止从production Handoff、Visual approved bundle、checkout或散落的三个文件自行组装上游信任链。

安装后的 Bundle `0.2` 新增子树必须逐项等于：

```text
fault-launcher/preflight-descriptor.json
fault-launcher/inputs/build/local-runtime.jar
fault-launcher/reports/jarit-report.json
fault-launcher/reports/TEST-org.opm.localruntime.releaseevidence.fault.E2EFaultLauncherJarIT.xml
fault-launcher/environment/golden-environment.json
```

五项均为single-link普通文件，三个JSON均为UTF-8、无BOM、单个JSON对象；Surefire XML必须是严格UTF-8且禁止DOCTYPE/外部实体。Browser executable只以Descriptor/Golden Environment中相同的absolute realpath/length/SHA表达，不复制进bundle，也不进入bundle tree写权限范围。

Producer 只允许在 source root 外的 fresh controlled staging root 工作，顺序固定为：

```text
验证 clean source/Maven/JDK/Bundle 0.1/Golden Environment/browser/Gate 输入
-> 顺序执行固定package与JarIT命令并解析Surefire XML
-> 重新验证source HEAD/porcelain与Runtime JAR fixed output
-> 选择 12 个互异 loopback 端口
-> 镜像Surefire XML/Environment/Runtime JAR并生成JarIT Report
-> 写 preflight-descriptor.json.tmp + fsync + rename
-> 写 controlled-bundle.json.tmp + fsync + rename
-> fsync staging tree
-> semantic verifier
-> 原子安装为 canvas06-controlled-<identity>
-> installed verifier
```

任一步失败都不得留下可消费 final root；已存在同 ID root 禁止覆盖。Gate Observation Artifact 由后续 2A 执行产生，不由 input producer 预生成。

## 14. 验收矩阵

正例至少包括：

1. Bundle `0.2` + descriptor + 6/6 JarIT + Golden Environment/browser + 6 schedule + 12 unique ports + disabled Gate 通过；
2. actual Manifest 与 descriptor 的三 case/两 attempt/12 cycle 和 source commit exact join；
3. D10A 当前观测与 descriptor 快照相等；
4. D10B 取得 14 项有序一致观测，mutation count 为 0。

反例至少包括：

1. Bundle `0.1` 供 Fault Launcher、Bundle `0.2` 缺 descriptor ref、旧 identity 公式；
2. descriptor/JarIT/Environment/browser/runtime 任一 raw ref 或 payload SHA 漂移；
3. JarIT 5/6、skip、错误方法集合或 JDK 非 21；
4. schedule 缺失/重排/并发、ordinal 从目录推断；
5. 任意端口重复、被占用或运行时换号；
6. Gate snapshot 非 `DISABLED + [] + NOT_ACTIVE`、activation set 非空或 SHA 不等；
7. preflight 写入 D10B、Playwright 事后修改 preflight report；
8. BEFORE、任一 DURING 或 AFTER Gate 漂移，后续 cycle 未停止；
9. production Manifest 接受 Bundle `0.2` 或 Fault Launcher descriptor。

## 15. 回滚与状态边界

回滚本设计修正只恢复 Fault Launcher 2A 为 `BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_MISSING`，不得恢复旧 `FLCP-D10-GATE` 或直接从 `0dcaa27...` 实现 2A。后继机器资产如已安装，回滚只能撤销未激活的新 controlled root 指针，不覆盖或删除历史 Bundle `0.1`、release root、用户 SQLite 或 production evidence。

本设计完成不等于四份 Schema、producer/verifier、2A、controlled Playwright、production `194/388`、E2E Report、Gate、Candidate、Activation、Capability、production 或 ISO 证据完成。

## 16. 事实与待实现

### 16.1 事实

1. Controlled Bundle `0.1` 和 Manifest `0.2` 均为封闭对象，当前没有 preflight descriptor ref；
2. Golden Environment `0.2` 已冻结 Playwright `1.57.0`、Chromium `143.0.7499.4` 和 executable identity；
3. `E2EFaultLauncherJarIT` 当前恰有 6 个 `@Test` 方法；
4. Release Candidate `0.1` 已有可复用的 `DISABLED + [] + NOT_ACTIVE` Gate snapshot value 形状；
5. `SHA-256(JCS([]))=4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945`；
6. 2A 两个目标文件、四份新 Schema、producer/verifier、真实 descriptor 和 Gate Observation Artifact 当前均未生成。

### 16.2 待实现

后继 contract commit SHA、12 项 raw ref、patch SHA、新 clean base intake、2A final commit、真实端口、descriptor identity、preflight report 和 14 项 Gate observation 只能由对应实现和受控执行产生，不得在设计文档中预填。
