# Spec: DEV-CANVAS-06 E2E Fault Launcher Preflight Descriptor 与 Gate 观测闭包修正

文档状态：`FROZEN`

设计修正状态：`COMPLETE`

Fault Launcher 2A 准入：`BLOCKED_BY_FINAL_PRODUCTION_SOURCE_CHAIN_IMPLEMENTATION`

活动source-chain准入：`opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`取代旧D01 fixed commits，并保持本文Bundle/Descriptor/Manifest D05、D10A/D10B、Invocation Context和evidence事务语义不变。新2A必须绑定新链Stage A，旧`586d6de...`不得作为活动contract base。

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
6. 两个controlled新增文件的逻辑范围保持不变；活动A-stage另授权两个Runner `M`，合计`4=2 M+2 A`，且必须等待新S形成clean base intake，禁止从`0dcaa27...`直接继续Build；
7. 2A 只暴露第 17 章唯一 `--run-controlled` 协议，由同一父进程完成 preflight、Playwright、Gate Observation 验证和 evidence root 原子提交；旧 `--preflight`、`--mode=preflight` 及散落的 Runtime/Web/browser override 全部废止。

## 4. 版本、引用方与无环拓扑

### 4.1 唯一版本决定

| 契约 | 活动身份 | 状态 |
| --- | --- | --- |
| 历史 Controlled Input Bundle | `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.1` | 只读兼容，不得供 Fault Launcher lane 消费 |
| Fault Launcher Controlled Input Bundle | `OPM-DEV-CANVAS-06-CONTROLLED-INPUT-BUNDLE-001/0.2` | 后继实现目标 |
| Preflight Descriptor | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PREFLIGHT-DESCRIPTOR-001/0.1` | 后继实现目标 |
| JarIT Report | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-JARIT-REPORT-001/0.1` | 后继实现目标 |
| Controlled Preflight Report | `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001/0.2` | 2A Node owner文档级封闭契约；无独立Schema文件 |
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

Descriptor 不得包含 `manifest_ref`。受控 Manifest builder 本来就消费 controlled bundle；若 descriptor 再引用 final Manifest 会形成构建环。实际 Manifest 由第 17 章受控执行 CLI 以 `--manifest-root` 和固定 `--manifest` token 独立传入，`FLCP-D05-MANIFEST` 必须区分 Manifest 自有的三个 case 字段与 Descriptor 自有的 attempt/process schedule，再执行字段级交叉闭包；不允许靠路径、目录名或 case 名称片段推断。

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

Gate observation算法是两个2A文件共同遵守的单一只读契约：Node父owner在preflight中执行D10A；controlled spec验证Invocation Context并调用Runner owner的`runControlledLifecycleSession()`，D10B的BEFORE/DURING/AFTER采样与Artifact writer只在该接口内部执行。两条调用链都只允许读取 exact fixed Handoff 和受控 production activation input root，不共享可变状态、不增加第三个helper或第二条IPC通道。`candidate_loader_status=NOT_ACTIVE` 只能由 verified activation input set 为空推导；不得通过 UI 文本、进程名、HTTP 200、测试 mock 或“没有创建 Candidate”推断。

两个observer调用点均不新增公共 HTTP API，不修改 Runtime production wire，不调用 Activation/Enablement writer，不创建或删除 activation 输入。输入 root、Handoff 或 refs 发生变化时必须 fail-closed。父owner不得根据Playwright stdout猜测cycle完成；controlled spec不得把Gate值回传为可变命令。D10B唯一机器输出就是第11.2节Gate Observation Artifact。

第 17 章受控执行 CLI 必须包含且只通过以下两个显式输入取得 production Gate：

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

`FLCP-D10B-GATE-EXECUTION` 不属于preflight dependency，由Playwright child内的Runner lifecycle接口生成执行artifact。成功分支的时间点固定为：

1. `BEFORE`：preflight `READY_TO_RUN` 后、首个Runtime/Web及cycle-local Chromium启动前，恰1项；
2. `DURING`：每个`INITIAL/REOPEN` handler已关闭其Chromium/context/page并取得临时confirm；lifecycle接口继续保留迟到事件sentinel直到handler settle，完成零迟到事件复核、sink/precondition client关闭、全部sentinel移除和最终Browser proof接纳，再终止对应Runtime/Web并验证两个端口释放后立即观测，按第8章顺序恰12项；
3. `AFTER`：全部已启动cycle-local Chromium与Runtime/Web均终止、12个Descriptor唯一端口均无listener后、artifact staging commit前，恰1项。

成功分支总观测数固定为 `14=1 BEFORE+12 DURING+1 AFTER`。所有快照都必须与 D10A 重新观测值 exact 相等，聚合必须为 `production_gate_mutation_count=0`。若 Gate 漂移或 Playwright 在第 12 个 cycle 前失败，`during[]`只能是已结束 cycle 的有序前缀，长度为`0..12`；仍必须在终止全部已启动child后取得恰一项`AFTER`，禁止伪造未执行cycle的观测以补足14项。

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

受控命令preflight阶段READY时在内存形成`RFC8785_JCS(report)+LF`，最终stdout仍只允许这些bytes。父Runner必须先逐byte验证Report `0.2`封闭字段、条件语义和payload SHA，再在启动Playwright前把完全相同的JSON bytes原子写入第17章controlled evidence staging root的`fault-launcher/preflight-report.json`；禁止重新序列化。preflight为BLOCKED或输出不闭合时不得创建该mirror或任何evidence root。

`before/after` 使用第 10.1 节完整snapshot形状并增加 `phase`；`during[]`允许`0..12`项，每项增加 `phase=DURING/schedule_id/process_cycle/ordinal`。数组必须是第8章计划的有序前缀，`ordinal`从1连续到当前数组长度，禁止跳号；只有`PASS_MATCHED`才要求恰12项。`failures[]`每项封闭为`{code,phase,schedule_id,process_cycle,evidence_refs}`；非DURING阶段的`schedule_id/process_cycle`必须显式为JSON `null`，成功时数组为空。

成功值固定为：

```text
observation_status=PASS_MATCHED
production_gate_mutation_count=0
failures=[]
```

失败分支固定为`observation_status=FAILED`、`failures`非空。若首错为Gate漂移，`production_gate_mutation_count>=1`且首项code为`PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN`；若首错为非Gate的Playwright执行失败，mutation count保持实际观测值，首项code为`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED`。`before`和`after`仍各恰一项，`during[]`只允许第11.1节的有序前缀。Schema必须用条件分支区分`PASS_MATCHED`的`12/0/[]`与`FAILED`的`0..12/non-empty`，不得要求提前停止后仍伪造12项。

`observation_payload_sha256=SHA-256(JCS(删除本字段后的 artifact))`。Artifact 必须在第 17 章唯一 controlled evidence staging root 中写固定临时文件、flush/fsync、原子 rename，并由2A Node owner的只读 verifier复算后才能提交final root；不得写入 production Report root。

### 11.3 漂移与首错

任一 BEFORE/DURING/AFTER 观测不等时：

```text
error_code=PRODUCTION_GATE_MUTATED_DURING_CONTROLLED_RUN
observation_status=FAILED
production_gate_mutation_count>=1
```

Runner 必须保留首次不一致的 phase/schedule/cycle/evidence refs，立即停止所有尚未开始的 cycle，终止本轮已启动的受控子进程，写出 FAILED Gate Observation Artifact；禁止继续执行后再用 AFTER 覆盖首次错误。该失败不是 retry、skip、PASS 或 production gate 回滚证明。

非Gate的Playwright首错同样立即停止尚未开始的cycle并写`CONTROLLED_PLAYWRIGHT_EXECUTION_FAILED`，但不得把它改写为production Gate mutation；两类首错均必须保留，后续终止或AFTER观测失败只能追加到`failures[]`，不得覆盖首项。

## 12. Preflight 检查顺序与错误边界

唯一顺序为：

```text
参数形状
-> Bundle 0.2 Schema/identity/raw refs
-> Descriptor Schema/payload SHA
-> JarIT Report/Runtime JAR join
-> Golden Environment/Browser join
-> schedule/port closure
-> actual Manifest raw/Schema/官方controlled verifier
-> actual Manifest与Descriptor字段级D05 join
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

### 13.1 历史Build前置与活动supersession

旧`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`、候选`63851f8878dcf6da86e99d5ffa7795ac48200920`及其exact `2 M`后继`586d6dee1b07c6634267aeb344e8826adb1ddb4b`只保留为历史raw-ref、Schema修正和接纳记录，不得作为活动A输入。活动origin为`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`；必须先按Final Production Source Chain形成C与S，A才能以S为唯一parent提交`4=2 M+2 A`。

当前状态为：

```text
Fault Launcher A = BLOCKED_BY_FINAL_PRODUCTION_SOURCE_CHAIN_IMPLEMENTATION
Controlled Playwright = NOT_RUN
GATE-06-03 = BLOCKED/NOT_RUN
```

### 13.2 历史contract逻辑allowlist：`12=4 M+8 A`

下列12项保留为contract语义来源；活动Stage C的完整`20=12 M+8 A` allowlist只由Final Production Source Chain规格承接。

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

`63851f8...`已经承载上述12个逻辑路径，但不构成可接纳结果。其唯一后继修正包固定为`2 M`：只修改Gate Observation Schema及既有producer contract测试，冻结PASS恰12项DURING、FAILED真实`0..12`有序前缀、两类failure code和`3`正`7`负矩阵。修正包、接纳条件和回滚唯一由`opm-dev-canvas-06-e2e-fault-launcher-contract-base-schema-conformance-bugfix-task-spec.md`承接；禁止由2A、producer/verifier或第三个helper复制、放宽或旁路Schema。

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
9. production Manifest 接受 Bundle `0.2` 或 Fault Launcher descriptor；
10. Context缺字段/extra/错误payload或raw SHA、schedule重排/补项、root/ref漂移、child读取第二个前缀环境键；
11. 使用`node`经PATH启动、默认缓存Chromium、未匹配`*.release.spec.ts`的历史文件名，或父进程从stdout猜测cycle并合成Gate Artifact。

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
6. 四份Schema、producer/verifier及旧候选`63851f8...`已经形成；旧conformant后继`586d6de...`的接纳只作为历史证据。活动C/S/A均未创建，可信Invocation Context和真实Gate Observation Artifact仍未生成。

### 16.2 待实现

旧Schema conformance后继`586d6de...`的12项raw ref、集合摘要和patch SHA已经按历史接纳记录冻结。活动C/S/A及其stage patch必须重新形成和验收；A final commit、真实端口、descriptor identity、preflight report、Invocation Context和Gate observation仍只能由对应实现和受控执行产生，不得预填。14项只属于完整成功分支；提前失败分支只能记录真实有序前缀。

## 17. 2A Controlled Run 唯一协议

### 17.1 唯一 CLI

`scripts/canvas06-e2e-fault-launcher-controlled.test.mjs`只允许两个入口：无业务参数的`node --test`定向测试入口，以及以下唯一受控执行入口。不得再实现独立preflight模式或第二个execution wrapper：

```text
node scripts/canvas06-e2e-fault-launcher-controlled.test.mjs --run-controlled \
  --source-root <absolute-clean-2A-source-root> \
  --controlled-bundle-root <absolute-read-only-bundle-v02-root> \
  --manifest-root <absolute-read-only-manifest-v02-root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --java-home <absolute-jdk21-home> \
  --browser-executable <absolute-chromium-executable> \
  --fixed-handoff <absolute-current-fixed-handoff-json> \
  --production-activation-root <absolute-read-only-activation-root> \
  --attempt-parent <absolute-fresh-attempt-parent> \
  --process-control-parent <absolute-fresh-process-control-parent> \
  --evidence-parent <absolute-fresh-controlled-evidence-parent>
```

`--run-controlled`是无值flag且恰好一次；其余参数均为分离token并恰好一次。拒绝未知、重复、空值、`--x=y`、位置参数、相对路径。`--manifest`唯一合法值为上列固定basename；其他路径必须经lexical absolute、normalized realpath、类型、single-link和containment检查。source、bundle、Manifest、Java、browser、fixed Handoff、activation、attempt、process-control、evidence任意两个root不得相等或互相包含；browser/java文件可位于各自显式home内，但不得位于attempt/process-control/evidence写根。禁止从cwd、环境变量、PATH、checkout扫描、目录名或latest ref补值。

旧参数`--preflight`、`--mode=preflight`、`--candidate-source-commit`、`--controlled-bundle`、`--runtime-jar`、`--web-root`、`--browser-root`和`--control-parent`全部为未知参数并返回`2`。candidate commit只从clean source HEAD复算；Runtime JAR和Web tree只从actual Manifest的`source_build` refs解析；browser只从显式file与Descriptor/Golden Environment三方join解析。

同一父进程唯一顺序为：参数验证 -> preflight -> READY report原字节镜像 -> Invocation Context原子发布 -> Playwright执行 -> D10B artifact -> staging verifier -> evidence root原子提交 -> installed verifier。READY不再使命令提前退出；它只授权同一调用继续执行固定Playwright token数组。

### 17.2 Actual Manifest 输入与官方验证

Manifest唯一物理文件为：

```text
<manifest-root>/dev-canvas-06-e2e-manifest.json
```

父进程必须在任何写入前对root和文件执行`lstat/open/fstat`前后identity复核，要求single-link、非symlink常规文件、严格UTF-8、无BOM/CR、单个JSON对象和`RFC8785_JCS(object)+LF`原始形状，并生成封闭ref：

```text
manifest_ref={
  kind=E2E_MANIFEST,
  path=dev-canvas-06-e2e-manifest.json,
  byte_length,
  sha256
}
```

随后必须以当前父进程已经运行的exact `process.execPath`，通过`execFile`直接执行`--source-root`内活动Manifest v02只读verifier及固定参数；cwd固定为source root，禁止shell、PATH、npm profile或另一个Node。该调用只是官方verifier的受控内部入口，不形成第二套语义；不得在2A owner复制或放宽其完整验证：

```text
<current-process.execPath> <source-root>/scripts/verify-canvas06-e2e-manifest-v02.mjs \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <validated-controlled-bundle-root> \
  --source-root <validated-source-root> \
  --manifest-root <validated-manifest-root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --profile-asset-root <manifest-root>/inputs/upstream/profile-assets
```

verifier入口不存在、非零退出、修改任一输入或产生文件均使`FLCP-D05-MANIFEST=MISSING|MISMATCH/MANIFEST_V02_NOT_READY`。2A不得以历史v01 verifier、仅Ajv shape检查、测试fixture verifier或内部fallback替代。

### 17.3 `FLCP-D05-MANIFEST` 字段级 exact join

官方verifier成功后，2A owner还必须执行以下唯一交叉闭包：

1. Manifest固定为`OPM-DEV-CANVAS-06-E2E-MANIFEST-001/0.2`、`manifest_version=0.2.0`、`source_build.dirty_before_build=false`；
2. `manifest.source_build.source_commit = descriptor.source_commit = candidate_source_commit = git -C <source-root> rev-parse HEAD`；
3. `source_build.local_runtime_jar`必须在Manifest root内闭合；其`kind/byte_length/sha256`与Descriptor、JarIT Report和bundle内Runtime JAR相等，path按各自root独立验证，不要求错误地逐字符相等；
4. `source_build.web_dist`只允许由Manifest v02 verifier按tree ref闭合，2A不得接受CLI覆盖路径；
5. `cases[]`中以下三个`case_id`各恰好一次、顺序固定为`ASSET_MISSING/PERSISTENCE_FAILED/READONLY`，三项均为`suite_id=E2E-CANVAS-007`、`expectation=BLOCKED`、`viewport_id=VP-1440X900`、`zoom_id=Z-100`、`driver_id=DRIVER-COMMON`、零八项`expected_transaction`、`assertion_ids=[REVISION_OR_BLOCKED_MATCHED,REOPEN_MATCHED]`，且不得出现`capability_id/coverage_key`；
6. 三项`fixture_ref/input_ref`必须分别在Manifest root内通过raw ref复核，并由活动Common Catalog语义验证，不得只比较路径文本；
7. Manifest本身不承载attempt或process cycle字段。Descriptor `fault_attempt_schedule`必须按第8章为每个上述Manifest case提供ordinal `1,2`两项，且每项`process_cycles=[INITIAL,REOPEN]`、fault kind映射正确；六项schedule必须全部且只引用这三个已验证Manifest case；
8. Descriptor六项schedule、六项port allocation和12个cycle的闭包属于D05交叉验证证据，不得声称为Manifest自有字段。

任一项失败固定使D05为`MISMATCH/MANIFEST_V02_NOT_READY`；`dependency_results[D05].evidence_refs`必须包含actual `manifest_ref`和已验证Descriptor ref，缺失输入时使用空数组，不得填占位SHA。

### 17.4 Preflight Report 0.2 与三段 source 身份

旧文档级Preflight Report `0.1`在任何真实artifact生成前废止。2A唯一输出版本固定为同一`schema_id`的`schema_version=0.2`，根对象封闭为：

```text
schema_id
schema_version
status
origin_base_source_commit
contract_base_source_commit
candidate_source_commit
manifest_ref
preflight_descriptor_ref
baseline_raw_refs_sha256
implementation_delta
dependency_results
blocking_dependency_ids
playwright_command
report_payload_sha256
```

活动`origin_base_source_commit`固定为`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`。`candidate_source_commit`是可读取的source HEAD，否则为JSON `null`；`contract_base_source_commit`是candidate恰有一个parent时的完整parent SHA，否则为`null`。`manifest_ref`和`preflight_descriptor_ref`仅在对应raw/Schema/identity验证完成后为对象，否则显式`null`，禁止占位。

其余字段唯一规则为：

1. `status`只允许`BLOCKED_BY_DEPENDENCY|READY_TO_RUN`；
2. `baseline_raw_refs_sha256`固定为`69491a6226cd98b9a5028fec31457e885c86020dbab4e57c381b75f4389b411e`；
3. `implementation_delta`恰含以下四项且顺序固定，每项封闭为`{path,expected_status,observed_status}`：

```text
M scripts/release-canvas06-e2e-run.mjs
M scripts/release-canvas06-e2e-run.test.mjs
A scripts/canvas06-e2e-fault-launcher-controlled.test.mjs
A tests/e2e/release/dev-canvas-06/fault-launcher.controlled.release.spec.ts
```

`expected_status`只允许`M|A`且必须等于上表；`observed_status`只允许`M|A|ABSENT|DRIFT`，READY时必须逐项等于expected；
4. `dependency_results`恰为D01~D09/D10A的固定顺序，每项封闭为`{dependency_id,status,detail_code,evidence_refs}`，status只允许`READY|MISSING|MISMATCH`，READY时detail固定`READY`；
5. `evidence_refs[]`是封闭union：普通`{kind,path,byte_length,sha256}`file ref、既有封闭tree ref，或Descriptor专用`{bundle_id,bundle_identity_sha256,path,byte_length,sha256}`bundle file ref；缺失证据只能用空数组，不得用占位SHA；
6. `blocking_dependency_ids`按固定dependency顺序包含全部且仅非READY ID，无重复；
7. `playwright_command`在BLOCKED时为JSON `null`，READY时为实现规格第8.4节固定token数组；首token必须是本次父进程`process.execPath`的absolute normalized realpath，禁止记录逻辑字符串`node`后再通过PATH执行；
8. `report_payload_sha256=SHA-256(JCS(删除本字段后的report))`。

`FLCP-D01-SOURCE`唯一READY条件由Final Production Source Chain覆盖为四节点、三段校验：candidate A恰有一个parent且等于S，S恰有一个parent且等于C，C恰有一个parent且等于活动origin O；`O -> C`、`C -> S`分别匹配冻结stage，`S -> A`逐项等于上述`2 M+2 A`，candidate source porcelain为空。`implementation_delta`仍只计算S到A；Report不增加中间commit字段，D01通过parent链推导并复核C。

`implementation_delta`反例固定包括：数组长度为`0..3`或`>=5`；漏任一Runner `M`；把Runner写成`A`、controlled新增文件写成`M`；四项顺序漂移；observed与expected不等；同路径重复、extra、rename/copy/type-change；两个Runner在A与S raw SHA相等。任一反例使D01=`MISMATCH/SOURCE_COMMIT_NOT_READY`，Report仍保持Schema-valid `BLOCKED_BY_DEPENDENCY`，不得启动Playwright或创建evidence root。

### 17.5 Controlled Evidence Root 与 Invocation Context

身份和路径唯一为：

```text
controlled_run_id
= "dev-canvas-06.fault-launcher-run."
  + manifest_ref.sha256[0:12] + "."
  + preflight_descriptor_ref.sha256[0:12]

staging=<evidence-parent>/.<controlled_run_id>.staging
final=<evidence-parent>/<controlled_run_id>
```

`--evidence-parent`必须是已存在、空、single-link、非symlink的可写目录；staging/final启动时都必须`ENOENT`，禁止覆盖、合并、扫描、latest选择或自动清理residual。最终可消费布局恰为：

```text
<controlled_run_id>/
  fault-launcher/preflight-report.json
  fault-launcher/gate-observation.json
```

`preflight-report.json`必须与本次preflight内存中的`RFC8785_JCS(report)+LF`逐byte相等；`gate-observation.json`必须为第11章Artifact `0.1`。不得复制Descriptor或Manifest到evidence root，不得加入Playwright截图、trace、日志、SQLite、attempt或production Report；这些继续由各自既有root承接。

Playwright是独立子进程，禁止以“父进程已验证对象”作为未物化的隐式输入。父进程到唯一controlled spec的全部跨进程输入只能通过以下只读Invocation Context传递：

```text
context_id
= "dev-canvas-06.fault-launcher-playwright."
  + manifest_ref.sha256[0:12] + "."
  + preflight_descriptor_ref.sha256[0:12]

context_tmp=<process-control-parent>/.<context_id>.json.tmp
context_final=<process-control-parent>/<context_id>.json
```

Context为文档级封闭机器契约`OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-PLAYWRIGHT-CONTEXT-001/0.1`，不新增第三个Schema/source owner；根对象`additionalProperties=false`，字段恰为：

```text
schema_id, schema_version, controlled_run_id,
source_root_realpath, controlled_bundle_root_realpath,
manifest_root_realpath, manifest_ref, profile_asset_root_realpath,
java_executable_ref, browser_executable_ref,
fixed_handoff_ref, activation_input_root_realpath,
attempt_parent_realpath, process_control_parent_realpath,
evidence_staging_root_realpath,
preflight_descriptor_ref, preflight_report_ref,
execution_schedule, context_payload_sha256
```

字段规则固定如下：

1. `schema_id/schema_version`分别为上述常量；`controlled_run_id`必须逐字符等于第17.5节公式；
2. 所有`*_realpath`均为父进程完成第17.1至17.3节验证后的非空absolute normalized realpath，禁止`.`/`..`/NUL，禁止child重新选择root；各root的类型、link、containment和fresh/read-only语义继续按第17.1节，Context不能放宽；
3. `manifest_ref/preflight_descriptor_ref/preflight_report_ref`复用本规格封闭形状，且必须逐字段等于父进程本轮已验证对象；
4. `java_executable_ref/browser_executable_ref/fixed_handoff_ref`均为封闭`{kind,path,byte_length,sha256}`；kind分别固定为`JAVA_EXECUTABLE/BROWSER_EXECUTABLE/FIXED_HANDOFF`，`path`为absolute normalized realpath，`byte_length`为正safe integer，`sha256`为64位小写hex；Java ref必须等于`<java-home>/bin/java`实体验证结果，browser ref必须通过CLI/Descriptor/Golden Environment三方join，Handoff ref必须等于D10A读取的live bytes；
5. `profile_asset_root_realpath`必须逐字符等于`<manifest-root>/inputs/upstream/profile-assets`的验证后realpath；`evidence_staging_root_realpath`必须等于第17.5节staging；其他输入root分别逐字符等于对应CLI验证后realpath；
6. `execution_schedule`恰12项且每项`additionalProperties=false`，字段固定为`{ordinal,schedule_id,case_id,attempt_ordinal,process_cycle,runtime_port,web_port}`；字符串非空，`attempt_ordinal`只允许`1|2`，`process_cycle`只允许`INITIAL|REOPEN`，两个port均为`1024..65535`整数；按第8章case顺序、每case attempt `1,2`、每attempt `INITIAL,REOPEN`展开，`ordinal=1..12`连续，同一schedule的两个cycle复用Descriptor锁定的端口对，不同schedule的12个端口全局互异；
7. `context_payload_sha256`为64位小写hex；所有对象和schedule item都拒绝额外字段，所有数组保持给定顺序且禁止重复。

`execution_schedule`必须由已验证Descriptor生成并与Manifest三个case交叉验证，child不得重排、补项或从路径推断。

Context原始bytes唯一为`RFC8785_JCS(context)+LF`，`context_payload_sha256=SHA-256(JCS(删除本字段后的context))`。父进程在READY Report原字节镜像完成后、BEFORE观测前，按`exclusive tmp -> full write -> file fsync/close -> raw/字段/join/payload复核 -> no-replace rename -> process-control-parent fsync`写入；tmp/final启动时均须`ENOENT`。Context写入或复核失败属于`EVIDENCE_TRANSACTION/4`，不得启动Playwright。

父进程启动Playwright时，必须先从child环境删除全部`OPM_CANVAS06_FAULT_*`键，再只加入：

```text
OPM_CANVAS06_FAULT_CONTROL_CONTEXT_REF
= RFC8785_JCS({
     kind: "CONTROLLED_PLAYWRIGHT_CONTEXT",
     path: <context_final absolute normalized realpath>,
     byte_length: <context raw byte length>,
     sha256: <context raw sha256>
   })
```

环境值本身不带LF。父进程必须以`execFile(process.execPath, fixedArgs, {cwd: source_root_realpath, env: sanitizedEnv, shell: false})`启动，首token与Preflight Report逐字符相等；child stdout/stderr使用pipe捕获，禁止转发到父stdout或污染唯一Report bytes。child/spec必须拒绝缺失、重复语义、非canonical JCS、额外字段、相对/错误path、raw ref漂移、Context字段或任何上游join漂移，并在启动Runtime/Web/Browser或创建attempt前失败。spec只允许读取该一个前缀键；不得读取cwd作为输入、CLI旁路、其他环境键、默认目录或父进程内存假设。Manifest、Descriptor、schedule、ports、Runtime/Web/Profile/browser、Gate roots、attempt/evidence roots均只从验证后的Context取得；随后唯一调用`runControlledLifecycleSession()`，不得直接调用`prepareControlledAttempt()`或复制spawn、READY、client、cleanup和Artifact语义。每个预绑定handler只能以`browser_executable_ref.path`启动本cycle的fresh Chromium process/context/page；Page创建后必须在route/navigation/API前调用owner sink的`attachBrowserPage(page)`，并在`finally`关闭Page/Context/Browser后以相同对象调用`confirmBrowserClosed({browser,context,page})`。confirm返回只表示进入`CONFIRMED_SENTINEL`，handler不得移除Runner sentinel或把confirm后的事件写入业务观测；最终proof只能由Runner在handler settle后判定。禁止使用Playwright默认缓存浏览器、PATH发现、跨cycle复用Browser或由spec自行判定关闭证明。

Context验证成功后，controlled spec只能构造6项schedule乘2个cycle的预绑定handler并调用Runner owner的`runControlledLifecycleSession()`。该接口是D10B BEFORE/DURING/AFTER sampler与`.gate-observation.json.tmp -> gate-observation.json`的唯一writer；spec和父进程均不得直接合成、补写或改写观测，父进程只能在Playwright退出后执行只读staging/installed verifier。Context在child侧不闭合时，spec不得相信其中的evidence path或写Artifact，父进程固定按`EVIDENCE_TRANSACTION/4`处理；只有Context已闭合且lifecycle接口进入D10B后发生的Gate或controlled执行失败，才允许按第11.2节提交Schema-valid FAILED Artifact并exit `1`。

Context及其tmp位于process-control root而非controlled evidence root，禁止被两个文件的evidence verifier或production Report消费。成功或失败后Context final保持只读诊断输入，不由本命令删除、覆盖或重用；下一次执行必须使用fresh process-control parent。

### 17.6 原子写入、失败与首错

BLOCKED preflight只把Report `0.2`写stdout并exit `3`，不得创建staging/final、attempt或process-control内容。十项READY后唯一事务顺序为：

```text
exclusive mkdir staging
-> exclusive mkdir staging/fault-launcher
-> 写 .preflight-report.json.tmp
-> file fsync -> raw reread -> no-replace rename preflight-report.json
-> fault-launcher directory fsync
-> 原子写入并复核 Invocation Context -> process-control-parent fsync
-> 启动固定Playwright child -> child复核Context
-> controlled spec只调用runControlledLifecycleSession()
-> lifecycle接口取得BEFORE -> 串行执行12 cycle；每cycle先闭合Page绑定与同Page网络观测，confirm后保持迟到事件sentinel直到handler settle，按零迟到事件、sink关闭、sentinel移除、最终Browser proof、Runtime/Web与端口顺序闭合，再取得DURING
-> lifecycle接口终止全部Runtime/Web child、验证端口释放并取得AFTER
-> lifecycle接口写 .gate-observation.json.tmp
-> file fsync -> raw/Schema/payload/semantic reread
-> no-replace rename gate-observation.json
-> fault-launcher directory fsync
-> staging只读完整verifier
-> postorder fsync全部staging目录
-> no-replace rename staging为final
-> evidence-parent fsync
-> final只读installed verifier
```

参数token、绝对路径形状、root相等/包含或CLI目标类型不合法时exit `2`且无Report；Bundle、Descriptor、Manifest、JarIT、Environment等依赖raw/Schema/semantic不闭合必须进入对应dependency并以BLOCKED Report exit `3`，不得退化为参数错误。十项READY后，无论最终exit为`0/1/4`，stdout都恰为本次Preflight Report `0.2`的JCS bytes加LF，禁止混入Playwright日志。完整Playwright和installed verify通过后exit `0`。Playwright产品断言失败或Gate mutation时，只要Schema-valid FAILED Gate Artifact和完整root通过verifier，仍原子提交final并exit `1`，该root只是失败证据，不是PASS或Gate READY。

Invocation Context、临时文件、fsync、rename、staging/final verifier或目录提交任一步失败固定stderr首行为`E2E_FAULT_LAUNCHER_CONTROLLED_EVIDENCE_FAILED\tEVIDENCE_TRANSACTION`并exit `4`；final必须不存在，staging保留为不可消费诊断根，禁止本命令自动覆盖、删除、移动或重试。若final rename已成功但installed verifier失败，final保留且永远不得消费，恢复/隔离等待独立授权流程；不得回rename或覆盖同identity。

Gate/controlled execution首错规则沿用第11.3节并由Stage A lifecycle interface closure收紧。Browser proof、Artifact形成、child/端口cleanup不闭合或无法取得AFTER不是可伪造的`FAILED`业务证据，而是evidence transaction failure/exit `4`。Browser proof失败包括confirm后迟到事件、业务监听与sentinel切换存在空窗、sentinel提前移除或最终残留，统一使用内部`E2E_ORCHESTRATION_BROWSER_PROOF_INVALID`，不得采样当前DURING或提交可消费Artifact。2A Node owner必须以同一只读函数在staging rename前和final rename后完整验证root、两文件raw ref、report payload、Descriptor/Manifest join、Gate Artifact条件分支和root basename公式；不得新增第三个source文件或外部writer。lifecycle接口及对应Runner测试完成前，D01~D10A可以继续验证，但禁止创建A commit或执行D10B。
