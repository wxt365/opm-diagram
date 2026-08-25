# Spec: DEV-CANVAS-06 Fixed Handoff Postverify Closure

文档状态：`FROZEN_FOR_IMPLEMENTATION`

执行状态：`NOT_STARTED`

设计修订：`2026-08-20 FIXED_HANDOFF_POSTVERIFY_TRUST_BOUNDARY`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 目标

关闭 Versioned Handoff Report Ref Closure 规格中的 fixed Handoff postverify 信任边界冲突，并冻结独立 postverify runner、机器 Report 和原子切换收尾契约：

1. production Manifest builder/verifier 继续只信任 installed Intake 锁定的 versioned Handoff；
2. 独立 postverify runner 显式读取 fixed Handoff，并证明其 raw bytes 与 versioned Handoff 完全相等；
3. 同一 runner 证明 Manifest 内 Handoff 副本与上述两份 Handoff raw bytes 完全相等；
4. production Manifest verifier 仍以 installed Intake 和 versioned Handoff 运行，不接受 fixed path、fixed Intake 或路径 fallback；
5. postverify Report 记录四方 exact join、production verifier 结果和工具身份；
6. fixed switch 任一失败继续恢复旧 fixed Handoff exact SHA，新安装版本根保持只读且不覆盖。

本规格不修改 OPM、OPL、Capability、Profile、Revision、SQLite、API 或前端语义；不生成 GATE-06 Release Candidate、Activation，不启用 Capability，也不构成 production release 或 ISO 19450:2024 符合性证据。

## 2. Root Cause

现有 production Manifest builder/verifier 的唯一信任链为：

```text
installed Intake.handoff_ref.path
  -> installed versioned Handoff
  -> sameRef(path + byte_length + sha256)
```

Versioned Handoff Report Ref Closure 规格第 10 节却要求 fixed switch 后“以 exact fixed Handoff 重新执行 production Manifest verifier”。fixed Handoff 路径固定为`dev-canvas-05-handoff.json`，而 Intake 锁定路径为`releases/clean-<source12>/dev-canvas-05-handoff.json`；在不改写 Intake 或放宽`sameRef()`的前提下，两者不可能同时满足路径相等。

此前把“fixed path 与 versioned Handoff 的激活等价性”错误地交给了“Intake 到 versioned Handoff 的生产信任链”验证，因此设计只冻结了一个 verifier，却要求它同时承担两个互斥的路径身份。

## 3. 已复现事实

### 3.1 Source 与版本根

当前已形成的 Versioned Handoff source commit：

```text
37c5412a9c12c1b3ae06d6f7abe734804fa53c7b
parent=a36a7f1fd709b72e66c57e5aea634da525c9c515
delta=14=12 M+2 A
```

当前已安装但未激活的版本根：

```text
releases/clean-37c5412a9c12
```

其 Candidate Handoff raw SHA 为：

```text
4088e449ebb04cb6cf94fe5393db4b72ee34cc96dd950cabfc1ad596b4afb3d2
```

当前 fixed Handoff 保持旧 raw SHA：

```text
0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326
```

### 3.2 冲突调用

`release-canvas06-e2e-manifest-v01.mjs`和`verify-canvas06-e2e-manifest-v01.mjs`的 production 分支均按以下语义调用：

```text
handoffPath = intake.value.handoff_ref.path
mode = INSTALLED
```

trust guard 要求 Intake 的完整`handoff_ref`与实际读取的 Handoff ref 在`path/byte_length/sha256`上相等。直接把`handoffPath`改为 fixed path必然触发`E2E_MANIFEST_HANDOFF_MISMATCH`；在 trust 内加入默认路径或 fallback 则违反已冻结的显式 mode 与禁止 fallback 规则。

## 4. 范围与修改边界

### 4.1 治理文档允许修改

- 本规格及对应 Checklist；
- Versioned Handoff Report Ref Closure 规格和 Checklist；
- `docs/README.md`；
- `docs/design/opm-design-freeze-baseline.md`；
- `docs/design/opm-development-execution-pack.md`；
- `docs/design/opm-test-strategy.md`；
- E2E Manifest Builder checklist 的依赖状态说明。

### 4.2 后续实现允许修改

后续实现只允许第 5.2 节的 4 个文件。

### 4.3 禁止修改

- 不修改`loadReadyTrustChain()`、`sameRef()`或 production Manifest builder/verifier 的现有信任语义；
- 不修改 Intake、Handoff 或 E2E Manifest 既有 Schema；
- 不生成、改写或伪造 fixed Intake；
- 不允许 production verifier 读取 fixed path、自动探测路径或失败后 fallback；
- 不修改已安装`clean-a36a7f1fd709/**`或`clean-37c5412a9c12/**`；
- 不覆盖、删除或重建任何既有 release root；
- 不修改固定`handoff/reports/**`、`handoff/release/**`或其他 alias；
- 不修改 Java、Vue、SQLite、公共 API、依赖版本或 lockfile；
- 不修改`.harness/**`；
- 不生成 Candidate、Activation、Capability enablement或 ISO 声明。

## 5. 独立 Verifier Tool Source

### 5.1 Tool source 与 subject source 分离

postverify runner 是 release verification tool，不是被验证 Candidate 的构建输入。两种 source identity 必须分别记录：

```text
subject_source_commit=37c5412a9c12c1b3ae06d6f7abe734804fa53c7b
verifier_tool_source_commit=<new clean commit>
```

verifier tool source 唯一 base 为`37c5412a9c12c1b3ae06d6f7abe734804fa53c7b`，新 commit 必须单 parent、非 merge、clean。不得因为新增 postverify tool 反向改写或重建`clean-37c5412a9c12`。

### 5.2 精确 source delta

`git diff --name-status 37c5412a9c12c1b3ae06d6f7abe734804fa53c7b..<tool-source>`按 path 字典序规范化后必须精确为`4=1 M+3 A`：

| 状态 | 路径 |
| --- | --- |
| `M` | `package.json` |
| `A` | `docs/contracts/schemas/opm-dev-canvas-06-fixed-handoff-postverify-report.schema.json` |
| `A` | `scripts/verify-canvas06-fixed-handoff-postswitch.mjs` |
| `A` | `scripts/verify-canvas06-fixed-handoff-postswitch.test.mjs` |

不允许 D/R/C/submodule/extra，不修改 lockfile，不新增依赖。`package.json`只新增 runner 与定向测试入口。

## 6. 唯一 CLI

```text
node scripts/verify-canvas06-fixed-handoff-postswitch.mjs \
  --source-root <absolute-clean-tool-source-root> \
  --handoff-root <absolute-handoff-root> \
  --fixed-handoff dev-canvas-05-handoff.json \
  --intake-report releases/clean-<source12>/dev-canvas-06-intake-report.json \
  --manifest-root releases/clean-<source12>/dev-canvas-06/e2e/manifests/<manifest-id> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --attempt-id <32-lowercase-hex> \
  --output-root postverify/releases
```

所有参数必填、禁止`--name=value`、重复参数、未知参数、绝对 subject ref、反斜杠、`.`、`..`、空段、percent encoded escape和symlink/hardlink。固定值必须逐字相等：

```text
fixed-handoff=dev-canvas-05-handoff.json
manifest=dev-canvas-06-e2e-manifest.json
output-root=postverify/releases
```

`source-root`必须是 clean Git worktree，`HEAD`为第5章tool source；其`package-lock.json`必须与base相同。`handoff-root`只作为subject ref解析根，不进入Report raw path。

## 7. 四方 Exact Join

### 7.1 四份 Handoff bytes

runner必须解析并验证：

1. `fixed_handoff`：`<handoff-root>/dev-canvas-05-handoff.json`；
2. `versioned_handoff`：由 exact Intake 的`handoff_ref.path`唯一确定；
3. `manifest_handoff_copy`：由 exact Manifest 的`handoff_ref.path`在Manifest root内唯一确定；
4. `production_verifier_handoff`：production verifier通过同一 Intake 实际读取的第2项。

第1、2、3项物理路径允许不同，但 raw bytes、`byte_length`和`sha256`必须完全相等。第2、4项必须是同一物理普通单链接文件。禁止比较规范化JSON、字段子集或重新序列化结果代替raw bytes比较。

### 7.2 Intake join

Intake必须：

- Schema valid且`intake_status=READY_FOR_RELEASE_VALIDATION`；
- 位于`releases/clean-<source12>/dev-canvas-06-intake-report.json`；
- `handoff_ref.path`精确为同一版本根的`dev-canvas-05-handoff.json`；
- `handoff_ref.byte_length/sha256`与versioned Handoff raw bytes相等；
- Report身份中的source12与versioned Handoff source commit一致。

runner必须复用`loadReadyTrustChain({ mode: 'INSTALLED' })`完成 Intake -> versioned Handoff及全部direct raw ref闭包，不复制或放宽owner规则。

### 7.3 Handoff identity join

fixed与versioned Handoff raw相等后还必须满足：

```text
source12 = handoff.source_build.source_commit.slice(0, 12)
release_prefix = releases/clean-<source12>
handoff.handoff_id suffix = source12
handoff.handoff_status = READY_FOR_DEV_CANVAS_06
handoff.blockers = []
handoff.production_gate.state = DISABLED
handoff.production_gate.enabled_capability_ids = []
```

`subject_source_commit`必须为完整40位SHA，不从目录名反推；目录名只用于与已验证source commit交叉校验。

### 7.4 Manifest join

Manifest必须：

- Schema valid且root basename等于`manifest_id`；
- `upstream_source_build.source_commit=subject_source_commit`；
- `intake_report_ref`副本raw bytes等于installed Intake；
- `handoff_ref`副本raw bytes等于fixed/versioned Handoff；
- root位于同一`release_prefix/dev-canvas-06/e2e/manifests/<manifest-id>`；
- 不从Manifest字段反向选择另一个 Intake、Handoff或release root。

## 8. Production Manifest Verifier 边界

四方输入完成pre-acceptance后，runner必须以当前tool source中的既有verifier执行唯一子命令：

```text
node scripts/verify-canvas06-e2e-manifest-v01.mjs \
  --handoff-root <absolute-handoff-root> \
  --intake-report releases/clean-<source12>/dev-canvas-06-intake-report.json \
  --input-mode PRODUCTION_HANDOFF \
  --manifest-root <absolute-handoff-root>/<manifest-root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --require-production
```

必须通过`process.execPath`和参数数组调用，禁止shell、环境变量路径注入或命令字符串执行。成功stdout必须逐字为`dev-canvas-06-e2e-manifest.json\n`，stderr为空，exit code为0。

该子命令继续通过 Intake读取versioned Handoff；独立runner在调用前后各复算一次fixed/versioned/Manifest copy SHA。前后任一SHA变化均为`POSTVERIFY_SUBJECT_DRIFT`，不得接受“子命令曾成功”作为最终结果。

## 9. Report 0.1

新增机器契约：

```text
docs/contracts/schemas/opm-dev-canvas-06-fixed-handoff-postverify-report.schema.json
schema_id=OPM-DEV-CANVAS-06-FIXED-HANDOFF-POSTVERIFY-REPORT-001
schema_version=0.1
runner_version=0.1.0
```

### 9.1 Report identity

```text
report_id=dev-canvas-06.fixed-handoff-postverify.<source12>.<handoff_sha12>.<attempt_id>
final_root=postverify/releases/fixed-<source12>-<handoff_sha12>-<attempt_id>
final_file=<final_root>/fixed-handoff-postverify-report.json
staging_root=postverify/releases/.fixed-<source12>-<handoff_sha12>-<attempt_id>.tmp
```

`attempt_id`由调用者提供的32位小写hex确定，不从时间、PID、目录扫描或随机fallback生成。已有final或同名staging一律拒绝，重跑必须使用新attempt ID。

`postverify/releases`缺失时只能在五个subject文件完成pre-acceptance后创建；已存在时，其路径链必须全部为真实目录且不得经过symlink。该父目录可包含既有`fixed-<source12>-<sha12>-<attempt>`不可变final root，但不得包含未知entry或残留`.tmp`。每个final root恰含一份Report，不复制、链接或修改subject文件。

### 9.2 必填字段

Report必须`additionalProperties=false`并至少冻结：

- `report_id/generated_at/report_status`；
- `attempt_id/subject_source_commit/release_prefix/handoff_id/manifest_id`；
- `runner_identity`：tool source commit、Node/OS、normalized command、runner/verifier/Schema raw SHA；
- `subject_refs`：fixed Handoff、versioned Handoff、Intake、Manifest、Manifest Handoff copy五个完整fileRef；
- `checks`：第9.3节固定8项及状态；
- `production_manifest_verifier`：normalized command、exit code、stdout、stderr code、执行状态；
- `blockers`：稳定code、首错check和message key；
- `report_payload_sha256`：移除该字段后对RFC 8785 JCS bytes计算SHA-256。

subject ref path全部相对`handoff-root`。runner/verifier/Schema记录clean tool source中的raw SHA，不伪装为subject fileRef。

### 9.3 固定检查集合与顺序

```text
FHPOST-001.FIXED_FILE
FHPOST-002.INTAKE_VERSIONED_REF
FHPOST-003.VERSIONED_CLOSURE
FHPOST-004.FIXED_VERSIONED_RAW_EQUAL
FHPOST-005.HANDOFF_IDENTITY
FHPOST-006.MANIFEST_COPY_RAW_EQUAL
FHPOST-007.PRODUCTION_MANIFEST_VERIFIER
FHPOST-008.SUBJECT_STABLE
```

每项状态只允许`MATCHED/BLOCKED/NOT_RUN`。首个`BLOCKED`后其余项必须为`NOT_RUN`。`report_status`只允许：

- `READY_FOR_SWITCH_FINALIZATION`：8项全部MATCHED、`blockers=[]`；
- `BLOCKED`：恰一项BLOCKED、后续NOT_RUN、恰一个首错blocker。

READY Report只是“可删除backup marker并完成fixed switch收尾”的证据，不是Activation或Capability enablement。

## 10. Acceptance、原子输出与退出码

### 10.1 Pre-acceptance rejection

以下阶段失败固定为pre-acceptance rejection：

```text
ARGUMENT -> TOOL_SOURCE -> OUTPUT_PATH -> FIXED_FILE -> INTAKE_FILE
-> VERSIONED_HANDOFF_FILE -> MANIFEST_FILE -> MANIFEST_HANDOFF_COPY_FILE
```

只有五个subject文件均为普通、非链接、单链接文件，JSON可解析且可形成真实raw ref后，才进入可报告invocation。pre-acceptance失败时：稳定stderr首行、零final、零staging、零Report；不得用占位ref伪造证据。

### 10.2 可报告失败

acceptance后，Schema/status/join/closure/verifier/drift任一失败必须生成Schema-valid `BLOCKED` Report。Report输出采用第9.1节唯一同父fresh staging、单文件写入、fsync、Schema/payload自验、staging与父目录fsync和单次atomic rename；final或staging已有时拒绝覆盖。失败不得自动删除未知或上次残留staging，必须先按独立恢复审计处理。

### 10.3 退出码

```text
0 = READY_FOR_SWITCH_FINALIZATION Report已原子提交
2 = 参数、tool source、路径或pre-acceptance rejection，零Report
3 = 可报告语义失败，BLOCKED Report已原子提交
4 = I/O、Report commit或内部错误；不得留下final，残留staging必须隔离
```

成功stdout只输出final Report相对路径并以单个LF结尾；失败stdout为空，stderr第一行只输出稳定错误code。

## 11. Fixed Switch 唯一顺序

Versioned Handoff Report Ref Closure规格第10节由本节替代。唯一顺序为：

1. 确认`clean-37c5412a9c12`已安装、只读，installed Intake/versioned Handoff/Manifest production预验通过；
2. 确认没有既有`backup/candidate/SWITCH_PENDING`残留；
3. exclusive create保存旧fixed raw bytes到`.dev-canvas-05-handoff.backup-<old-raw-sha256>`，把新bytes写入`.dev-canvas-05-handoff.candidate-<new-raw-sha256>`，验证两个basename SHA与raw bytes一致，fsync两文件与父目录；
4. 单次atomic rename把candidate替换为fixed Handoff，fsync handoff根；
5. 运行本规格runner；runner内部完成四方join和installed Intake production verifier；
6. runner失败时，必须从backup以同目录temp+fsync+atomic rename恢复旧fixed exact SHA，清理candidate残留并fsync父目录；BLOCKED Report保留为不可变失败证据；
7. runner返回`READY_FOR_SWITCH_FINALIZATION`后再次复核fixed SHA与Report、backup marker仍存在，然后删除backup marker并fsync父目录；
8. 收尾后live guard必须同时满足：fixed SHA等于READY Report、无backup/candidate marker、versioned root/Intake/Manifest未变；否则固定入口不得作为后续Gate输入。

若步骤7后进程崩溃且backup marker仍存在，恢复流程优先，必须恢复旧fixed SHA；此前READY Report降为孤立历史证据。任何消费者都必须以“READY Report + live fixed SHA相等 + 无pending marker”联合判断，不得只凭Report状态推导当前fixed active状态。

任一`.dev-canvas-05-handoff.backup-*`存在即为唯一`SWITCH_PENDING`判据；不得新增第二种marker。发现backup时禁止下游消费，必须先验证basename/raw SHA并恢复；发现只有candidate或多个backup/candidate时按首错拒绝人工审计，不得选择最新mtime或字典序文件继续。

## 12. 首错与稳定错误

首错顺序固定为：

```text
ARGUMENT -> TOOL_SOURCE -> OUTPUT_PATH -> FIXED_FILE -> INTAKE_FILE
-> VERSIONED_HANDOFF_FILE -> MANIFEST_FILE -> MANIFEST_HANDOFF_COPY_FILE
-> INTAKE_VERSIONED_REF -> VERSIONED_CLOSURE -> FIXED_VERSIONED_RAW
-> HANDOFF_IDENTITY -> MANIFEST_COPY_RAW -> PRODUCTION_VERIFIER
-> SUBJECT_DRIFT -> REPORT_COMMIT
```

稳定错误至少包括：

```text
POSTVERIFY_ARGUMENT_INVALID
POSTVERIFY_TOOL_SOURCE_INVALID
POSTVERIFY_OUTPUT_PATH_INVALID
POSTVERIFY_SUBJECT_FILE_INVALID
POSTVERIFY_INTAKE_VERSIONED_MISMATCH
POSTVERIFY_VERSIONED_CLOSURE_INVALID
POSTVERIFY_FIXED_VERSIONED_MISMATCH
POSTVERIFY_HANDOFF_IDENTITY_MISMATCH
POSTVERIFY_MANIFEST_COPY_MISMATCH
POSTVERIFY_PRODUCTION_VERIFIER_BLOCKED
POSTVERIFY_SUBJECT_DRIFT
POSTVERIFY_REPORT_COMMIT_FAILED
POSTVERIFY_INTERNAL_ERROR
```

## 13. 测试与验收

### 13.1 定向测试

```text
node --test scripts/verify-canvas06-fixed-handoff-postswitch.test.mjs
npm run release:canvas06:fixed-handoff:postverify:test
```

### 13.2 正例

测试必须在fresh临时handoff root构造同一source12的fixed/versioned/Intake/Manifest副本，production verifier使用注入的受控成功实现；验证8项MATCHED、READY Report、payload SHA、单文件final root、stdout和零staging残留。

另有唯一真实执行正例：以`clean-37c5412a9c12`、其exact Intake和Manifest为subject，在fixed atomic switch后运行真实production verifier。该正例未实际执行前不得回填READY。

### 13.3 必须覆盖的反例

- fixed path与versioned Handoff路径不同但raw bytes相同：必须通过；
- 把production verifier直接指向fixed path：必须拒绝测试夹具；
- fixed/versioned/Manifest copy任一byte、length或SHA drift；
- Intake指向fixed path、另一版本根或伪造fixed Intake；
- source12、handoff_id、release prefix或Manifest source commit不一致；
- 任一subject为缺失文件、目录、symlink、hardlink或path escape；
- production verifier缺少`INSTALLED`语义、非零exit、stdout/stderr不符合契约；
- verifier运行期间subject SHA变化；
- 已有final/staging、Report Schema错误或payload SHA错误；
- fixed switch后BLOCKED可恢复旧SHA；
- READY Report形成后pending marker触发恢复，Report不得单独使旧fixed通过live guard。

## 14. Spec Mapping 与开发门

| 设计责任 | 承接章节 |
| --- | --- |
| 目标、Root Cause、复现 | 第1~3章 |
| 范围、非目标、修改边界 | 第4章 |
| tool/subject source与allowlist | 第5章 |
| CLI与输入 | 第6章 |
| exact join与信任边界 | 第7~8章 |
| Report Schema、状态与摘要 | 第9章 |
| 原子输出、退出码、首错 | 第10、12章 |
| fixed switch、失败和回滚 | 第11章 |
| 验收与验证 | 第13章 |
| 回滚 | 第15章 |

全局32项设计责任不新增，本修正归入`DFR-018/019`。设计冻结后可进入独立postverify tool实现；在本规格真实READY Report和第11.8节live guard闭合前，fixed Handoff切换、Family Materializer、production E2E Report及后续Gate仍阻断。

## 15. 回滚

设计回滚：回退本规格及同步状态文档，恢复Versioned Handoff规格第10节为未闭合冲突状态；不得执行fixed switch。

实现回滚：不删除或改写已生成的tool source commit、installed release root或postverify Report；fixed switch失败只按第11章恢复旧fixed exact bytes。禁止通过改写Intake、放宽`sameRef()`、复制mutable reports alias或覆盖release root完成回滚。

## 16. 事实与待执行验证

### 16.1 事实

1. source commit`37c5412a9c12...`为单parent且精确`14=12 M+2 A`；
2. `clean-37c5412a9c12`已形成，Candidate Handoff SHA为`4088e449...`；
3. 当前fixed Handoff SHA仍为`0778d77f...`，尚未切换；
4. production builder/verifier按Intake path读取versioned Handoff，trust guard比较完整ref；
5. 当前未生成本规格Report、GATE-06 Release Candidate或Activation，未启用Capability。

### 16.2 待执行验证

1. `4=1 M+3 A` tool source、patch SHA和测试计数必须在独立clean worktree实际形成后回填；
2. 真实fixed atomic switch、四方join、production verifier和live guard尚未执行；
3. READY Report不证明E2E 194/388、Visual、Performance、Recovery、GATE-06-03~06、Candidate、Activation、production或ISO符合性。
