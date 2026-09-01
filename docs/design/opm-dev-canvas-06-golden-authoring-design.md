# DEV-CANVAS-06 Golden Authoring 设计

文档版本：`1.4`

设计状态：`FROZEN`

实现状态：`PARTIALLY_IMPLEMENTED`

适用 Gate：`GATE-06-03 Visual/E2E Closure` 的 Visual golden 前置阶段

## 1. 文档定位

本文档是 DEV-CANVAS-06 Visual golden 的唯一 authoring 设计口径，负责把 READY Handoff、exact coverage/golden/replay 输入和固定渲染环境转换为经过人工审批、不可变、可被 Visual Manifest 精确引用的 golden set。

本文档冻结设计，不表示以下事实已经发生：

1. Golden Fixture Materializer、candidate author、publisher 或只读 verifier 已全部完成并通过生产重验；
2. `1242` 个 golden PNG 或 `9` 个 blank baseline 已生成；
3. 任一 golden set 已审批或发布；
4. Visual Manifest/Report、`GATE-06-03`、Candidate 或 Activation 已 READY；
5. 任一 Capability 已启用或 ISO 19450:2024 符合性已证明。

当前已实现范围包括三类 `0.1` Schema、正反 contract test、`GOLDEN-AUTHORING-02` Capture Planner、`GOLDEN-AUTHORING-03A` Materializer `v1.5` 与 Verifier Catalog `v1.1` 63/63闭环，以及 Authoring Report、Approval Record、Golden Environment、Visual Manifest `0.2` Schema 的定向 contract test和只读 Environment verifier。03A的pending预验证、唯一四阶段quarantine、受控130项串行/并发4和完整contract/backend重验已通过；production 130项Materialization尚未执行。Visual Common Materialization `v1.10` 已冻结8 subject、唯一空Text Artifact、SQLite V1 `1/1/0`计数、五类index、8类UI step、44文件root、四份adapter/callback/result Schema、静态ESM/144次callback、独立one-shot fault port、normalized Projection、Color映射和JCS parity；Adapter Test Input 的341文件Bundle及Node adapter真实8 base/144 clone固定callback受控调度已通过，03C处于`ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`。真实 UI setup、一次性fault、第二次正常提交、PNG与双attempt仍只可由03B回填，不得将固定callback升格为candidate或production证据。Family Identity Catalog适配、版本化Handoff及fixed postverify均已闭合；03B的Family clone/Web capture adapter仍需独立机器契约，不能由03C Common协议替代。历史旧Bundle与Plan保持不可变且不得供新03B消费。production 130项、Common 8 base/144 clone及下游authoring均未执行。

## 2. 目标与边界

### 2.1 目标

1. 在不读取既有 PNG 的条件下生成 exact `1242` 个 capture ID 和全部捕获输入；
2. 固定 clean source build、exact Runtime JAR、fixture materialization、Chromium、字体、时钟和稳定等待；
3. 把 candidate 生成、人工审批和 approved publish 分离，消除 runner 原地接受新图的路径；
4. 让 INITIAL 与后续 SUPERSEDE 都具有可复算的旧/新 SHA、环境和不可变路径；
5. 让 Golden Environment 与 Visual Manifest 在缺 capture、环境不一致、审批无效或 SHA 不闭合时稳定拒绝生成。

### 2.2 非目标

- 不定义 OPM 语义、OPL、Trace、Symbol 或视觉预期本身；这些来自上游冻结资产；
- 不允许 validation runner 更新或接受 golden；
- 不以审批记录替代浏览器 Visual Report；
- 不建立产品用户、角色、权限或电子签名系统；申请人/审批人是发布过程责任字段；
- 不把视觉发布证据解释为 ISO 符合性证据。

## 3. 职责与隔离

| 职责 | 唯一责任 | 禁止行为 |
| --- | --- | --- |
| Capture Planner | 校验上游 exact join，生成无 PNG 依赖的 Capture Plan | 读取 candidate/approved PNG；从目录反推 capture |
| Common Visual Contract Builder | 生成并只读验证 8 个完整 Common fixture、新 Catalog 和 Planner semantic join | 改写历史 fixture/Catalog/Plan；创建 SQLite 或 PNG |
| Golden Fixture Materializer | 把 130 个 exact Family archive fixture 写入隔离 SQLite 并生成报告 | 暴露 HTTP；删除既有 storage；处理 Common Factory fixture |
| Common Visual Materializer | 用 exact Runtime JAR 生成 8 个 immutable SQLite base、attestation 和 144 fresh clone | 暴露公共 API；复用 Family root；写 candidate/approved 资产 |
| Golden Author | 使用固定环境生成 candidate PNG、blank baseline 和候选报告 | 写 approved root；创建审批记录；覆盖已有 candidate |
| Applicant | 提交 change、原因、candidate digest 和目标版本 | 兼任同一 change 的 Approver |
| Approver | 审查 candidate、环境和差异，签署 Approval Record | 修改 candidate；批准自己提交的 change |
| Publisher | 复核审批与 SHA，以排他方式发布不可变版本 | 改写已有版本；创建 mutable latest；跳过 verifier |
| Golden Verifier | 只读复算 Plan、Approval、Report、Environment 和文件 SHA | 写、修复、补齐或删除 approved 资产 |
| Visual Manifest Builder | 只读消费一个显式 approved version | 扫描目录猜版本；接受未审批 candidate |
| Visual Runner | 只读比较 actual 与 Manifest exact golden | `--update-snapshots` 或失败后接受新图 |

单机产品不因此新增用户权限模型。Applicant/Approver 的身份真实性由代码评审或发布审批流程负责；本包只冻结机器可检查的身份非空、二者不相同、审批状态和摘要闭包。

## 4. 固定机器资产

### 4.1 Schema identity

Golden Authoring 的机器契约固定如下，不得复用 Visual Manifest 或 Golden Environment 代替：

| 资产 | `schema_id` | `schema_version` | `artifact_version` |
| --- | --- | --- | --- |
| Capture Plan | `OPM-DEV-CANVAS-06-GOLDEN-CAPTURE-PLAN-001` | `0.1` | `0.1.0` |
| Common Visual Fixture | `OPM-DEV-CANVAS-06-COMMON-VISUAL-FIXTURE-001` | `0.1` | `0.1.0` |
| Approval Record 历史输入 | `OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001` | `0.1` | `0.1.0` |
| Approval Record 生产目标 | `OPM-DEV-CANVAS-06-GOLDEN-APPROVAL-RECORD-001` | `0.2` | `0.2.0` |
| Authoring Report 历史输入 | `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001` | `0.1` | `0.1.0` |
| Authoring Report 生产目标 | `OPM-DEV-CANVAS-06-GOLDEN-AUTHORING-REPORT-001` | `0.2` | `0.2.0` |
| Fixture Materialization Report | `OPM-DEV-CANVAS-06-GOLDEN-FIXTURE-MATERIALIZATION-REPORT-001` | `0.1` | `0.1.0` |
| Golden Environment 历史输入 | `OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001` | `0.1` | 不适用 |
| Golden Environment 生产目标 | `OPM-DEV-CANVAS-06-GOLDEN-ENVIRONMENT-001` | `0.2` | 不适用 |
| Visual Manifest 生产目标 | `OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001` | `0.2` | `0.2.0` |

目标 Schema 路径固定为：

```text
docs/contracts/schemas/opm-dev-canvas-06-golden-capture-plan.schema.json
docs/contracts/schemas/opm-dev-canvas-06-common-visual-fixture.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-approval-record-v02.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-fixture-materialization-report.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-environment.schema.json
docs/contracts/schemas/opm-dev-canvas-06-golden-environment-v02.schema.json
docs/contracts/schemas/opm-dev-canvas-06-visual-manifest-v02.schema.json
```

Capture Plan、Approval Record、Authoring Report、Golden Environment `0.1` 和 Materialization Report `0.1` Schema 已实现；Approval Record、Authoring Report、Golden Environment 和 Visual Manifest 四个 `v02` Schema 及定向 contract test 已实现。Common Visual Fixture `0.1` Schema 只完成设计冻结，02B 尚未实现。真实 `0.2` 实体、candidate/publisher、Visual builder/verifier 和 approved evidence 尚未实现。四个 `0.2` Schema 使用独立 `-v02.schema.json` 路径，既有 `0.1` 文件保持 byte-for-byte 不变，不得被改写或作为 production approval/approved authoring/Visual Gate 输入。

`0.2` 只允许按本文封闭字段扩展，禁止实现时新增未评审 optional escape hatch。所有 raw file ref 均为 `{kind,path,byte_length,sha256}`；集合 SHA 均为对应固定顺序数组的 RFC 8785 JCS SHA-256；payload SHA 均排除自身字段后计算。

`0.2` 的 `generator_identity.runner_version` 固定为 `0.2.0`。Plan/Environment/Authoring Report 的 `generated_at` 固定为 `source_date_epoch` 对应 UTC；Approval 的 `requested_at/approved_at` 是显式审批事件时间，适用第 7、8 章约束。03B 仅依赖03C的 `ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`，而不等待03C最终 integration evidence；03B负责真实 Common UI/fault/capture并回填为03C最终 integration evidence。该受控实现资格不构成 candidate、Approval、Visual Manifest、Gate 或生产证据。

所有对象必须 `additionalProperties=false`；时间为 UTC RFC 3339；digest 为小写 SHA-256；路径必须是对应 root 内无绝对路径、无 `..`、无 symlink 的相对路径。

### 4.2 工作根与批准根

```text
<golden-authoring-work-root>/<change-id>/
  capture-plan.json
  materialization/
    fixtures/<fixture-ref-key>/storage/projects/<project-id>/project.db
    reports/<fixture-ref-key>.json
  candidate/
    candidate-authoring-report.json
    golden-environment.json
    environment/fonts/<font-file>
    captures/attempt-1/<capture-id>.png
    captures/attempt-2/<capture-id>.png
    blank/attempt-1/<viewport-id>.<zoom-id>.png
    blank/attempt-2/<viewport-id>.<zoom-id>.png
  approval-record.json

tests/e2e/release/dev-canvas-06/golden/approved/
  versions/
    <golden-set-version>/
      capture-plan.json
      candidate/
        candidate-authoring-report.json
      approval-record.json
      authoring-report.json
      golden-environment.json
      materialization/
        reports/<fixture-ref-key>.json
        fixtures/<fixture-ref-key>/storage/projects/<project-id>/project.db
      environment/fonts/<font-file>
      <capture-id>.png
      blank/<viewport-id>.<zoom-id>.png
```

`<golden-authoring-work-root>` 是可清理的 candidate 区，不得被 Visual Manifest 引用。`approved/versions/<golden-set-version>` 是 approved version root，也是既有 GATE-06-03 文档中 `<golden-root>` 的具体实例；因此 approved PNG 仍满足 `<golden-root>/<capture_id>.png`，blank 仍满足 `<golden-root>/blank/<viewport>.<zoom>.png`。

禁止创建或消费 `latest` 文件、可变 current pointer、symlink 或把 `approved/` 父目录直接传给 Visual Manifest。消费者必须显式指定一个版本目录。

## 5. Capture Plan

### 5.1 输入

Capture Planner 只允许读取：

1. READY Intake 指向的 exact READY Handoff；
2. Handoff `EVIDENCE_BUNDLE` 内的 Coverage Catalog、Golden Manifest、Golden Replay Report、active Profile/Symbol Catalog 和被引用 fixture；
3. 与 Intake active binding 相同的 Common Fixture Catalog；
4. clean target source commit、lockfile、production Web dist identity 和 Intake exact `LOCAL_RUNTIME_JAR` ref；
5. 固定环境声明、`SOURCE_DATE_EPOCH` 与 planner source SHA。

Planner 禁止接收 `--golden-root`、candidate root、PNG 路径或 Golden Environment 作为输入。approved root 即使已存在也不得读取。由此保证首轮在没有任何 PNG 时仍可确定完整 capture 集合。

### 5.2 exact join

1. 先验证 Handoff、Intake、evidence bundle 普通 ref 的 `path/byte_length/sha256`；
2. 按 GATE-06-03 的 archive 安全规则物化输入，并保留 `bundle_sha256/archive_entry_path/materialized sha256`；
3. Coverage Catalog 的 `178` 个 family case 为主表，按 `(capability_id, case_id, variant_key, expectation)` 与 Golden Manifest 一对一 join，再按 `case_id` 与 Golden Replay Report 一对一 join；
4. 两次 Replay status、transaction、revision/projection expectation 必须相同；`130` 个 `PASS` 与 `48` 个 `BLOCKED` 必须 exact；
5. Visual family 只选择 `130` 个 PASS coverage key，但 `48` 个 BLOCKED 也必须完成 join 校验，不能通过删掉异常行获得 `130`；
6. Common capture 从 Common Fixture Catalog 的 exact `8` 个 Visual subject 派生；每个 `fixture_ref` 必须通过 Common Visual Fixture `0.1` Schema和只读 semantic verifier；
7. 任一缺项、重复、额外项、expectation 不一致、ref/SHA 不一致或 binding 不一致均不生成 Plan。

### 5.3 capture 生成

Viewport 顺序固定为 `VP-1440X900`、`VP-1280X800`、`VP-390X844`；Zoom 顺序固定为 `Z-025`、`Z-100`、`Z-400`。

Family capture：

```text
case_id=VIS-CANVAS.<capability_id>.<viewport_id>.<zoom_id>
capture_id=<case_id>.<sha256(visual_variant_key UTF-8 bytes)前12位>
visual_variant_key=<完整 coverage_key>
```

Common capture：

```text
case_id=VIS-CANVAS.COMMON.<subject_id>.<viewport_id>.<zoom_id>
capture_id=<case_id>.<sha256(subject_id UTF-8 bytes)前12位>
visual_variant_key=<subject_id>
```

排序固定为 Capability family/ID -> coverage key 字典序 -> viewport 表顺序 -> zoom 表顺序，再接 Common subject catalog 顺序 -> viewport -> zoom。

计数必须同时满足：

```text
family_variant_count=130
family_capture_count=130*3*3=1170
common_subject_count=8
common_capture_count=8*3*3=72
capture_count=1170+72=1242
blank_baseline_count=3*3=9
```

每个 capture 至少封闭记录：

```text
capture_id, case_id, capture_kind, capability_id?, subject_id?,
visual_variant_key, viewport_id, zoom_id,
fixture_ref, expected_revision, expected_projection_sha256,
focus_target_id, focus_anchor, expected_cells, critical_regions[],
coverage_ref?, golden_manifest_ref?, golden_replay_ref?, symbol_ref?,
common_fixture_catalog_ref?
```

Family `expected_projection_sha256` 按对应 replay Projection 的 RFC 8785 JCS 计算；Common `expected_projection_sha256=sha256(JCS(fixture.expected_projection))`。Common JCS 只能通过 Visual Common Materialization `v1.5` 第 8.3 节冻结的 `scripts/canvas06-rfc8785.mjs` 计算，并由 Node/Java 共用 parity vector 验证；03B只消费03C通过后的Schema-valid normalized result，不得复制 canonicalizer或重定义callback/result。Common 还必须满足 payload 深度闭包及 `expected_cells=committed_cells.length+transient_cells.length`，旧 `{subject_id,focus_target_id}` digest 固定为 `HISTORICAL_PLACEHOLDER` 并由新 author semantic preflight拒绝。文件 raw SHA 与派生 JCS SHA 不得混用。Capture Plan 不含 `golden_ref`、PNG SHA、像素结果或 observed 字段。

### 5.4 Plan digest

`capture_set_sha256=sha256(JCS(captures[]))`，其中 `captures[]` 使用第 5.3 节固定顺序和封闭字段。Plan 文件另以 raw bytes 形成 `capture_plan_ref.sha256`；二者不得互换。

Plan status 只允许 `READY_FOR_AUTHORING`。失败时不写目标 Plan；只向 stderr 输出稳定错误码。相同输入、planner source SHA 和 `SOURCE_DATE_EPOCH` 必须生成 byte-identical Plan。

## 6. 固定 Author 环境

### 6.1 clean source build 与 Runtime

1. source checkout 必须为单一 commit，authoring 输出目录不得位于 checkout 内；
2. 在安装或构建前执行 `git status --porcelain=v1 --untracked-files=all`，输出必须为空；
3. Node 固定 major `22`，实际 full version、executable SHA、`npm=10.9.4`、`package-lock.json` SHA 全部记录；
4. production Web build 命令固定为 `npm ci --ignore-scripts && npm run build`，Web dist 以排序后的 `(relative_path,byte_length,sha256)` 计算 tree SHA；
5. Java 固定 major `21`，actual vendor/full version/executable SHA 全部记录；当前 shell 的 Java 17 不满足 authoring 条件；
6. Runtime 只能使用 READY Intake 中 exact `LOCAL_RUNTIME_JAR`，`path/byte_length/sha256` 必须相等，不得在 author 阶段重新 Maven package 或替换 JAR；
7. production Web dist 与 Runtime 以 GATE-06-03 release 模式启动，关闭 HMR、Vue devtools、浏览器 DevTools、扩展、外网和非产品注入。

Family fixture 必须先按 [Golden Fixture Materializer 设计](./opm-dev-canvas-06-golden-fixture-materializer-design.md) 生成 `130` 个隔离只读 SQLite 基础库和 `130` 份成功报告。Candidate Author 只允许从报告绑定的 database ref 克隆 attempt storage。8 个 Common fixture 必须按 [Visual Common Materialization 设计](./opm-dev-canvas-06-visual-common-materialization-design.md) 先生成 8 个 immutable SQLite base，再为 72 capture 的两个 attempt生成144个fresh clone；Family/Common root、Report和计数不得混用。

`source_build_digest=sha256(JCS({source_commit,node_full_version,node_executable_sha256,npm_version,lockfile_sha256,build_command,web_dist_tree_sha256,runtime_jar_sha256}))`。字段顺序按此封闭对象名称由 RFC 8785 规范化；任何一项变化都形成新的 build identity。

### 6.2 Chromium 与字体

固定 Playwright 为 `1.57.0`、Chromium 为 `143.0.7499.4`。生产 Golden Environment 使用 `0.2`；`0.1` 不得由 03B、04、05 或 Golden Verifier 消费。以下字段按固定顺序进入 environment fingerprint：

```text
os_name, os_build, arch,
playwright_version, chromium_version, browser_executable_sha256,
launch_args[], color_profile,
font_refs[{logical_role,postscript_name,font_version,path,byte_length,sha256}],
locale, timezone, color_scheme, reduced_motion, device_scale_factor,
screenshot_options
```

固定值为 `locale=zh-CN`、`timezone=Asia/Shanghai`、`color_scheme=light`、`reduced_motion=reduce`、`device_scale_factor=1`、`--force-color-profile=srgb`。Plan raw `color_profile` 必须 byte-for-byte 等于 `srgb`，launch args 中必须恰有一个该参数且无其他 `--force-color-profile=`；唯一 canonical Environment 值为 `sRGB IEC61966-2.1`。禁止 trim、大小写折叠、Unicode normalization、ICC path、系统默认 profile 和其他 alias。截图固定 `animations=disabled/caret=hide/scale=css`，禁止 mask。

`font_refs` 必须覆盖浏览器实际解析并用于 UI sans、中文 fallback 和 monospace 的每个字体文件。不得只记录 CSS family 名；author 启动前和 capture 前均按 file SHA 复核。不同 OS/font bytes 产生不同 environment fingerprint，不能复用同一 approved version。

`browser_executable_sha256` 必须来自启动前 realpath 的普通浏览器可执行文件 bytes；其 realpath/byte length 只作审计证据，不进入 fingerprint。`font_refs` 必须在 future approved 相对路径 `environment/fonts/<font-relative-path>` 记录 `logical_role/postscript_name/font_version/path/byte_length/sha256`；`<font-relative-path>` 是一个或多个非空普通路径段，不得含绝对路径、`.`、`..` 或空段，因此 `environment/fonts/UI_SANS/ControlledSans.font` 合法。三个 logical role 固定为 `UI_SANS/CJK_FALLBACK/MONOSPACE`，各恰有一个。`screenshot_options` 固定为 `{animations:"disabled",caret:"hide",scale:"css",mask_count:0}`。

`environment_fingerprint=sha256(JCS(上述离散字段对象))`。其中 `font_refs` 按 `logical_role/postscript_name/path` 排序，`launch_args` 保留实际传参顺序；`environment_id=dev-canvas-06.golden-environment.<fingerprint 前12位>`。随机端口、PID、临时目录、实际开始/结束时间、browser realpath 不进入 fingerprint。

### 6.3 时钟与随机性

1. `SOURCE_DATE_EPOCH` 是 change 的受控输入，Plan、Approval 和 Authoring Report 必须记录同一整数值；
2. `generated_at` 对 Plan、Golden Environment 使用 `SOURCE_DATE_EPOCH` 对应 UTC；
3. 浏览器 `Date.now/new Date`、fixture 时间和业务 ID seed 固定到同一 epoch/seed；
4. `performance.now` 和 RAF 仅用于等待与测量，不进入业务 fixture、文件名或 digest；
5. 不得用时间戳、UUID、临时端口或进程 ID生成 Project/Model/Revision/capture 身份。

### 6.4 稳定等待协议

每个 capture 必须依次满足：

1. Local Runtime health 返回成功且 Runtime JAR SHA、active binding 与 Plan 相等；
2. `p03-workbench` ready，fixture 的 expected Revision、Projection 和 Text revision 已可读取；
3. `document.fonts.ready` 完成，实际 font refs/SHA 与 environment spec 相等；
4. 页面无未完成产品请求、命令、transition 或 loading 状态连续 `500 ms`；
5. 连续两个 `requestAnimationFrame` 的 cell set、cell geometry hash、focus bbox 和 Projection digest 完全相等；
6. focus bbox 完整可见，viewport/zoom 与 Plan 相等；
7. 在 `30 s` 总超时内完成，否则该 capture 为 `GOLDEN_STABILITY_TIMEOUT`。

固定延时只能作为第 4 项的 quiet window，不能代替状态和 hash 判定。

## 7. Authoring 命令

后续实现必须提供以下稳定入口：

```text
npm run release:canvas06:common-visual:build -- \
  --handoff <ready-handoff> \
  --fixture-root <new-output-root> \
  --source-date-epoch <integer>

npm run release:canvas06:common-visual:verify -- \
  --handoff <ready-handoff> \
  --fixture-root <readonly-root> \
  --catalog dev-canvas-06-common-fixture-catalog.json

npm run release:canvas06:golden:plan -- \
  --handoff-root <只读root> \
  --intake-report <相对path> \
  --source-root <clean-checkout> \
  --common-fixture-catalog <相对path> \
  --runtime-jar <exact-intake-jar> \
  --work-root <golden-authoring-work-root> \
  --change-id <change-id> \
  --source-date-epoch <integer> \
  --out <change-id>/capture-plan.json

npm run release:canvas06:golden:materialize -- \
  --plan <capture-plan> \
  --evidence-bundle <exact-bundle> \
  --runtime-jar <exact-intake-jar> \
  --materialization-root <new-empty-root> \
  --source-date-epoch <same-integer> \
  --concurrency <1..4, default 1>

npm run release:canvas06:golden:author -- \
  --plan <capture-plan> \
  --source-root <clean-checkout> \
  --runtime-jar <exact-intake-jar> \
  --materialization-root <verified-materialization-root> \
  --candidate-root <new-empty-path> \
  --source-date-epoch <same-integer> \
  --common-adapter-request <exact-request-json> \
  --browser-executable <exact-chromium-executable> \
  --font-manifest <exact-three-font-manifest-json> \
  --authoring-lineage <exact-lineage-json>

npm run release:canvas06:golden:approve -- \
  --candidate-root <只读candidate-path> \
  --applicant-id <non-empty> \
  --applicant-display-name <non-empty> \
  --approver-id <different-non-empty> \
  --approver-display-name <non-empty> \
  --reason-code <closed-enum> \
  --reason-text <non-empty> \
  --requested-at <UTC-RFC3339> \
  --approved-at <UTC-RFC3339> \
  --external-refs <closed-json-file> \
  --predecessor-authoring-report <SUPERSEDE-only-approved-authoring-report> \
  --out <existing-change-root>/approval-record.json

npm run release:canvas06:golden:publish -- \
  --plan <capture-plan> \
  --candidate-root <candidate-path> \
  --approval-record <approval-record> \
  --approved-root tests/e2e/release/dev-canvas-06/golden/approved \
  --golden-set-version <semver>

npm run release:canvas06:golden:verify -- \
  --approved-version-root <approved/versions/semver> \
  --require-approved
```

退出码统一为：`0=成功`、`2=输入/Schema/ref 无效`、`3=可归类的 join/environment/capture/approval/SHA 阻断`、`4=未分类 I/O 或内部错误`。

禁止参数：`--force`、`--overwrite`、`--update-snapshots`、`--accept-new-golden`、`--skip-missing`、`--ignore-environment`、`--self-approve`、`--latest`。

`--common-adapter-request`、`--browser-executable`、`--font-manifest` 和 `--authoring-lineage` 的唯一输入形状、Plan/JAR/epoch join、字体复制、版本 lineage 及零输出拒绝语义由 `opm-dev-canvas-06-golden-candidate-author-input-closure-bugfix-task-spec.md` 承接。Author 不得从 checkout、PATH、环境变量、浏览器默认配置、系统字体目录、approved root或版本目录推导它们。

Author 对每个 capture 和 blank baseline 各执行两次全新 browser context。两次 PNG raw SHA、尺寸、cell geometry hash 和 Projection digest 必须完全相等；approved version 只保存 attempt 1 的 canonical PNG，attempt 2 仅留在 candidate 证据中。`1242*2=2484` 个 capture attempt 和 `9*2=18` 个 blank attempt 任一缺失或不一致，candidate 不得进入审批。

Blank baseline 的唯一页面、浏览器生命周期、输出布局和结果映射由 `opm-dev-canvas-06-golden-blank-baseline-capture-closure-task-spec.md` 冻结；Author 不得把 Runtime、Web、fixture 或任意应用页面作为 blank 替代物。

Candidate Author 必须最后原子写 `candidate/candidate-authoring-report.json`；写入后 candidate root 对 Approver/Publisher 只读。Approve 命令不得写 candidate root，只能从通过 Authoring Report `0.2` verifier 的 `READY_FOR_APPROVAL` report 及其 exact refs，在 change root 创建 fresh `approval-record.json`。`requested_at <= approved_at`，二者是审批事件时间，不参与 environment fingerprint；不接受系统登录用户、Git author 或环境变量作为隐式身份来源。

Candidate root 必须精确为 `<change-root>/candidate`；Capture Plan 必须是同一 `<change-root>` 内的普通文件，Candidate Report 的 `capture_plan_ref.path` 固定相对该根。Approve 的 `--out` 必须精确为同一 `<change-root>/approval-record.json`。`INITIAL` 禁止传 `--predecessor-authoring-report`；`SUPERSEDE` 必须显式传入已发布 predecessor 的 `authoring-report.json`，Approve 读取其 raw bytes 并将 ref 规范化为 `versions/<old_golden_set_version>/authoring-report.json`，再校验其版本、golden set SHA 和 `APPROVED_PUBLISHED` 状态。不得由目录扫描、候选 lineage、外部引用或环境变量推断 predecessor。

`--external-refs` 文件必须是一个封闭 JSON 数组，每项严格为 `{kind,reference}` 且两字段非空；数组顺序进入 approval payload，不允许从 Git remote、issue URL 或环境变量隐式补齐。

Candidate report 和 Approval 中的 canonical asset ref 使用未来 approved version 相对路径。Approve/Publisher 必须按以下封闭映射读取 candidate bytes，不得扫描目录猜测来源：

```text
candidate/captures/attempt-1/<capture-id>.png -> <capture-id>.png
candidate/blank/attempt-1/<viewport-id>.<zoom-id>.png -> blank/<viewport-id>.<zoom-id>.png
candidate/environment/fonts/<font-relative-path> -> environment/fonts/<font-relative-path>
candidate/golden-environment.json -> golden-environment.json
materialization/<relative-path> -> materialization/<relative-path>
candidate/candidate-authoring-report.json -> candidate/candidate-authoring-report.json
```

Attempt 2 PNG 不进入 approved golden root；其 raw SHA、尺寸、geometry/projection digest 和 attempt 顺序必须进入 candidate report 的封闭 attempt result 数组，并由 Approval 的 candidate report raw/payload SHA 与 `candidate_attempt_set_sha256` 固定。是否保留未批准 candidate work root 是外部证据保留策略，不影响 approved canonical golden 的只读解析。

## 8. Approval Record

### 8.1 必填字段

```text
schema_id, schema_version, record_id, record_version,
change_id, mode, golden_set_version,
requested_at, approved_at, source_date_epoch,
applicant{id,display_name}, approver{id,display_name},
reason_code, reason_text, external_refs[],
capture_plan_ref, capture_set_sha256,
environment_fingerprint, source_build_digest,
runtime_jar_ref, web_dist_tree_sha256,
candidate_authoring_report_ref, candidate_authoring_report_payload_sha256,
candidate_attempt_set_sha256,
authored_golden_environment_ref,
fixture_materialization_report_refs[130], fixture_materialization_set_sha256,
fixture_database_refs[130], fixture_database_set_sha256,
png_refs[1242], blank_baseline_refs[9], font_refs[],
candidate_content_sha256,
old_golden_set_version, old_golden_set_sha256, predecessor_authoring_report_ref,
new_golden_set_sha256, approved_output_path,
approval_status, approval_payload_sha256
```

`approval_status` 只能为 `APPROVED`；拒绝不产生可供 publish 消费的 Approval Record。`applicant.id != approver.id`。`change_id` 固定格式为 `GOLDEN-CANVAS06-YYYYMMDD-NNN`，`record_id=dev-canvas-06.golden-approval.<change_id>`。

`reason_code` 只允许：`INITIAL_BASELINE`、`EXPECTED_VISUAL_CHANGE`、`BROWSER_TOOLCHAIN_CHANGE`、`FONT_CHANGE`、`OS_CHANGE`、`FIXTURE_CHANGE`、`BUG_FIX`、`DESIGN_CHANGE`。

`approval_payload_sha256` 对以上字段中除自身外的封闭审批 payload 按 RFC 8785 JCS 后计算。它提供内容防篡改闭包，不构成 PKI 电子签名或产品用户鉴权证明。

生产 Approval Record `0.2` 的 `candidate_authoring_report_ref` 必须绑定 candidate report 的 raw bytes，`candidate_authoring_report_payload_sha256` 和 `candidate_attempt_set_sha256` 必须分别等于该 report 内已独立复算的 payload/attempt set SHA。`authored_golden_environment_ref` 绑定 03B 生成的 exact Golden Environment raw bytes，路径使用目标 approved 相对路径 `golden-environment.json`。`candidate_content_sha256=sha256(JCS({fixture_materialization_report_refs[130],fixture_database_refs[130],png_refs[1242],blank_baseline_refs[9],font_refs[]}))`，且五个数组必须与 candidate report 和 Golden Environment byte-for-byte 相等。

Materialization 两数组按 `fixture_ref_key` 排序；PNG/blank 数组使用 Plan 固定顺序；font refs 按 `logical_role/postscript_name/path` 排序。每项为封闭 logical ID/key、目标 approved 相对路径、byte length 和 raw SHA；database 条目另含来自对应 Materialization Report 的 `semantic_state_sha256`。Approval 使用将要发布的 approved 相对路径，不使用 candidate 临时路径。历史 Approval Record `0.1` 的摘要算法保持不变，不得用于包含 Materializer 资产的生产审批。

Approve 命令必须先执行 Capture Plan、Materialization Report、candidate Authoring Report 和 candidate content verifier，再校验 Applicant/Approver、mode/version/predecessor、reason、时间和 fresh output；任何失败均为零 Approval Record/临时文件。Approval Record 写入后不可覆盖、补签或修改；拒绝通过外部评审记录表达，不生成 `APPROVED` 机器记录。

### 8.2 Golden set SHA

Author 必须先构造以下封闭对象：

```text
golden_set_payload={
  capture_plan_sha256,
  capture_set_sha256,
  source_build_digest,
  runtime_jar_sha256,
  web_dist_tree_sha256,
  common_fixture_catalog_sha256,
  fixture_materialization_set_sha256,
  fixture_database_set_sha256,
  environment_fingerprint,
  png_refs[1242]{capture_id,path,byte_length,sha256},
  blank_baseline_refs[9]{baseline_id,path,byte_length,sha256}
}
```

数组使用 Capture Plan 和 viewport/zoom 固定顺序。`new_golden_set_sha256=sha256(JCS(golden_set_payload))`。Authoring Report raw SHA 不进入该 payload，避免自引用；Visual Manifest 另行绑定 Authoring Report raw SHA。

## 9. INITIAL、SUPERSEDE 与不可变发布

### 9.1 INITIAL

1. `approved/versions/` 不存在或为空；
2. `mode=INITIAL`、`golden_set_version=1.0.0`、`reason_code=INITIAL_BASELINE`；
3. `old_golden_set_version=null`、`old_golden_set_sha256=null`、`predecessor_authoring_report_ref=null`；
4. `approved_output_path=versions/1.0.0`；
5. Publisher 只允许排他创建该路径，路径已存在即失败。

### 9.2 SUPERSEDE

1. `mode=SUPERSEDE`，predecessor 必须是当前 approved versions 按 SemVer 排序的最高版本；
2. old version/SHA/report ref 必须与 predecessor exact Authoring Report 相等；
3. new version 必须严格大于 predecessor，new set SHA 必须不同于 old set SHA；
4. PATCH 用于 capture 集合和环境不变的预期像素修订；MINOR 用于 fixture/capture 集合的向后兼容扩展；MAJOR 用于环境、authoring contract 或不兼容矩阵变化；
5. 无论变更大小，都只能创建新目录，旧目录保持不变。

### 9.3 发布原子性与并发

1. Publisher 在 approved root 以排他文件锁获取单写者资格；
2. 在 approved root 同一文件系统的临时 sibling 目录写入并复核全部 bytes；
3. 目标 version 路径必须不存在，随后通过 atomic rename 一次发布；
4. rename 前失败必须删除临时 sibling，目标 version 零输出；rename 后由只读 verifier 完整复核；
5. stale lock 只能由人工确认无活跃 Publisher 后清除，禁止 `--force`；
6. 已发布目录不得覆盖、删除、重命名或原地改权限后重写；Git 回退也不得改写历史 approved bytes。

重复 publish 相同 change/version 不视为幂等成功：目标已存在必须返回 `GOLDEN_VERSION_EXISTS`。只读 verify 可无限重复且必须得到相同结论。

### 9.4 Authoring Report

Authoring Report status 只允许：

- `READY_FOR_APPROVAL`：candidate report，只能位于 work root，不能被 Visual Manifest 消费；
- `APPROVED_PUBLISHED`：Publisher 在 approved version 中创建，必须引用 exact Approval Record 和 Golden Environment；
- `BLOCKED`：可选诊断报告，只能位于 work root，不能进入 approved version。

Authoring Report `0.2` 的机器身份按状态固定为：

```text
READY_FOR_APPROVAL -> report_id="dev-canvas-06.golden-authoring-report.<change-id>.candidate"
APPROVED_PUBLISHED -> report_id="dev-canvas-06.golden-authoring-report.<change-id>.approved.<golden-set-version>"
BLOCKED -> report_id="dev-canvas-06.golden-authoring-report.<change-id>.blocked"
```

三者 `schema_id` 相同、`schema_version=0.2`、`report_version=0.2.0`，但 report ID 不得复用。一个 change root 只允许一个 candidate 或 BLOCKED report；一个 approved version 只允许一个最终 report。

Authoring Report `0.2` 保留 `0.1` 全部字段和状态条件，并且只新增以下封闭字段：

```text
materialization_verifier_identity{runner_version,source_commit,node_version,command,runner_source_sha256}
fixture_materialization_report_refs[0..130]{fixture_ref_key,report_ref}
fixture_materialization_set_sha256
fixture_database_refs[0..130]{fixture_ref_key,database_ref,semantic_state_sha256}
fixture_database_set_sha256
capture_attempt_results[0..2484]{capture_id,attempt_ordinal,png_byte_length,png_sha256,width,height,cell_geometry_sha256,projection_sha256}
blank_attempt_results[0..18]{baseline_id,attempt_ordinal,png_byte_length,png_sha256,width,height}
candidate_attempt_set_sha256
authored_golden_environment_ref?
candidate_authoring_report_ref?
report_payload_sha256
```

Attempt results 按 Plan capture/blank 顺序、再按 `attempt_ordinal=1,2` 排列；`candidate_attempt_set_sha256=sha256(JCS({capture_attempt_results,blank_attempt_results}))`。同一 capture 的两个 result 必须在 PNG SHA/尺寸/geometry/projection 上相等；同一 blank 的两个 result 必须在 PNG SHA/尺寸上相等。

`READY_FOR_APPROVAL` 必须恰有 130/130 两类 ref、2484/18 两类 attempt result、三个集合 SHA、`authored_golden_environment_ref`、完整 candidate PNG/blank/font refs、`failures=[]`，不得包含 `candidate_authoring_report_ref`、`approval_record_ref` 或 `golden_environment_ref`。03B 必须先原子写并验证 candidate Golden Environment，再最后写 candidate report；两者的 fingerprint、PNG/blank/font refs 必须深度相等。

`candidate_authoring_report_ref` 只允许出现在 `APPROVED_PUBLISHED`，绑定 Publisher 复制到 approved version 的 exact `candidate/candidate-authoring-report.json`；`authored_golden_environment_ref` 与最终 `golden_environment_ref` 必须 raw SHA 相等且路径均为 `golden-environment.json`。该 candidate report 必须为 `READY_FOR_APPROVAL`，raw SHA/payload/attempt SHA 和全部字段与 Approval Record 相等。`BLOCKED` 可包含已验证子集，但不得包含 Approval/candidate report ref，也不得进入 approved version；只有已成功生成 Environment 时才允许包含 `authored_golden_environment_ref`。

最终 `APPROVED_PUBLISHED` Report 记录 Plan、candidate report、Approval、Handoff/Intake、source build、Runtime JAR、Web dist、input materialization、`130` 个 exact Materialization Report refs/集合 SHA、130 个 database refs/集合 SHA、environment、capture/blank summary、全部 approved refs、old/new set SHA、目标版本、命令和 generator source SHA。其 `failures=[]`、materialization/report/database `130/130/130`、capture `1242/1242`、blank `9/9`、author attempt `2484+18` 全 deterministic。`report_payload_sha256=sha256(JCS(report 中除自身外全部字段))`；Report raw SHA 由引用方另算，禁止自引用。

Publisher 只能从 Approval Record exact 引用的 candidate report、Golden Environment 和数组生成最终 Report；不得重新 author、重算 environment、重新选择文件或重新计算出不同的 candidate content 后继续发布。approved version 必须同时保存 candidate report、Approval Record、最终 Report 和 byte-for-byte 相同的 Golden Environment，四者由 Golden Verifier exact join。

## 10. Visual Manifest 消费守卫

Visual Manifest Builder 必须显式接收 `--approved-version-root`，并在写任何 Manifest bytes 前完成：

Visual/E2E builder owner、Manifest 版本、`CONTROLLED_TEST/PRODUCTION_HANDOFF` bundle class、根目录和禁止互用规则由 `specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md` 唯一承接。本章只承接 Visual approved transitive join；E2E 不消费本章任何 approved/golden 参数。

1. 版本目录包含且只包含获准布局中的 Plan、Approval、Report、Environment、130 份 Materialization Report、130 个 SQLite base、Environment exact `font_refs`、`1242` PNG 和 `9` blank；
2. Authoring Report status 为 `APPROVED_PUBLISHED`；
3. Approval Record 为生产 `0.2` 且 status 为 `APPROVED`，Applicant/Approver 不同，change/version/output path 与目录相等；
4. Plan 可从当前 exact Handoff/Intake/Common Catalog 独立复算，capture set 恰为 `1242`，无缺失、重复或额外 ID；
5. old/new SHA、predecessor、approval payload、golden set payload 和全部 raw ref/SHA 闭合；
6. Golden Environment fingerprint 与 Authoring Report、当前 release runner 实际 Chromium/OS/font/locale/timezone 等完全相等；
7. source build、Runtime JAR、Web dist 和 active binding 与要生成的 Visual Manifest 完全相等；
8. Golden Environment `png_refs[]/blank_baseline_refs[]` 与 Plan/Report exact 集合和顺序相等。
9. Authoring Report `0.2` 的 `fixture_materialization_report_refs[130]` 全部为 `MATERIALIZED`，对应 `fixture_database_refs[130]` 在 approved version 中存在；Plan fixture ref、Bundle/JAR/binding、Project/Model/Revision、database raw SHA 和两个集合 SHA 闭合。

现有 `OPM-DEV-CANVAS-06-VISUAL-MANIFEST-001/0.1` 只能保留为历史实现输入，不得作为生产 Visual Gate Manifest。生产目标固定为同一 schema identity 的 `schema_version=0.2`、`manifest_version=0.2.0`，保留 `0.1` 全部字段/计数/顺序，且只新增以下八个必填字段：

```text
golden_authoring_report_ref
golden_approval_record_ref
golden_set_version
golden_set_sha256
capture_plan_ref
capture_set_sha256
fixture_materialization_set_sha256
fixture_database_set_sha256
```

八个字段必须与 exact `APPROVED_PUBLISHED` Authoring Report、Approval Record、Capture Plan 和 approved version 目录相等；既有 `golden_environment_ref` 继续必填。Manifest `generator_identity.runner_version` 随 Schema 升为 `0.2.0`。Schema 升版由 `GOLDEN-AUTHORING-05` 执行，本轮不修改机器 Schema。

任一守卫失败时，Manifest 目标路径和临时文件必须零输出；不得生成合法但 `BLOCKED` 的 Manifest 冒充已绑定输入。

## 11. 稳定失败码

### 11.1 Plan/author/publish

Fixture Materializer 的 `GFM_*` 失败码、检查优先级和退出码由 [Golden Fixture Materializer 设计](./opm-dev-canvas-06-golden-fixture-materializer-design.md) 第 14 章唯一承接，本节不复制第二份目录。

```text
GOLDEN_HANDOFF_NOT_READY
GOLDEN_INTAKE_MISMATCH
GOLDEN_UPSTREAM_REF_MISMATCH
GOLDEN_INPUT_MATERIALIZATION_FAILED
GOLDEN_EXACT_JOIN_MISMATCH
GOLDEN_CAPTURE_COUNT_MISMATCH
GOLDEN_CAPTURE_ID_COLLISION
GOLDEN_COMMON_FIXTURE_MISMATCH
GOLDEN_SOURCE_BUILD_DIRTY
GOLDEN_RUNTIME_JAR_MISMATCH
GOLDEN_WEB_DIST_MISMATCH
GOLDEN_ENVIRONMENT_MISMATCH
GOLDEN_FONT_MISMATCH
GOLDEN_STABILITY_TIMEOUT
GOLDEN_CAPTURE_MISSING
GOLDEN_CAPTURE_EXTRA
GOLDEN_CAPTURE_NONDETERMINISTIC
GOLDEN_CANDIDATE_OUTPUT_EXISTS
GOLDEN_CANDIDATE_REPORT_MISSING
GOLDEN_CANDIDATE_REPORT_INVALID
GOLDEN_APPROVAL_MISSING
GOLDEN_APPROVAL_INVALID
GOLDEN_APPROVAL_OUTPUT_EXISTS
GOLDEN_APPROVAL_TIME_INVALID
GOLDEN_APPROVER_CONFLICT
GOLDEN_PREDECESSOR_MISMATCH
GOLDEN_SET_DIGEST_MISMATCH
GOLDEN_NO_CHANGE
GOLDEN_OUTPUT_PATH_MISMATCH
GOLDEN_VERSION_EXISTS
GOLDEN_PUBLISH_LOCKED
```

### 11.2 Visual Manifest 映射

Visual Manifest builder 至少增加以下输入拒绝码：

```text
VISUAL_GOLDEN_AUTHORING_MISSING
VISUAL_GOLDEN_AUTHORING_NOT_APPROVED
VISUAL_GOLDEN_APPROVAL_INVALID
VISUAL_GOLDEN_CAPTURE_SET_MISMATCH
VISUAL_GOLDEN_SET_DIGEST_MISMATCH
VISUAL_ENVIRONMENT_MISMATCH
VISUAL_GOLDEN_MISSING
VISUAL_GOLDEN_DIGEST_MISMATCH
```

错误说明可本地化，但 code、退出码和零输出语义不可变化。缺 capture、环境不一致、未审批和 SHA 不闭合均映射退出码 `3`。

## 12. 状态机

```text
PLAN_READY
  -> FAMILY_FIXTURES_MATERIALIZED
  -> CANDIDATE_AUTHORING
  -> READY_FOR_APPROVAL
  -> APPROVED
  -> APPROVED_PUBLISHED
  -> VERIFIED
  -> ELIGIBLE_FOR_VISUAL_MANIFEST
```

任一节点可转为 `BLOCKED`，但不能越级。`READY_FOR_APPROVAL` 不等于 `APPROVED`，`APPROVED` 不等于已发布，`APPROVED_PUBLISHED` 不等于 Visual READY，Visual READY 不等于 GATE-06-03 READY，GATE-06-03 READY 也不等于 Candidate、Activation、Capability enablement 或 ISO 符合性。

## 13. 恢复与回滚

1. Plan/materialize/author 失败：保留 work root 诊断或在确认后清理，不触碰 approved root；Materializer 只能清理本次从空目标创建的失败 storage；
2. 审批拒绝：不创建 APPROVED 记录，不 publish；candidate 可作为非发布证据保留；
3. publish rename 前失败：清理临时 sibling，approved version 零输出；
4. publish 后 verify 失败：Publisher 必须在 `<approved-root>/quarantine/<golden-set-version>.postverify-failed.json` 原子写入 `OPM-DEV-CANVAS-06-GOLDEN-PUBLISH-POSTVERIFY-MARKER-001/0.1`。marker 固定记录 `status=POSTVERIFY_FAILED`、版本、`approved_output_path`、最终 `authoring-report.json` raw ref、`failure_code=GOLDEN_PUBLISH_POSTVERIFY_FAILED`、`failure_stage=FINAL_GOLDEN_VERIFIER` 和排除自身字段后的 JCS SHA-256。任何 Golden Verifier 或下游消费者先精确检查该 marker；存在即拒绝该 version。marker 不得覆盖，Publisher 不得删除/移动 quarantine 或原地修复 version；通过新的 SUPERSEDE change 发布修正版；
5. release 回滚：Visual Manifest 可显式重新选择仍然完整的旧 approved version，但不得修改旧 version 或 mutable pointer；
6. 任一已进入发布证据链的文件都不得因回滚删除。

## 14. 验收矩阵

| 验收项 | 正例 | 必须阻断的反例 |
| --- | --- | --- |
| 无 PNG Plan | empty approved root 生成 exact `1242` ID | Planner 读取 PNG、少/多/重复 capture |
| exact join | `178=130+48` 全 join 后选择 130 PASS | 缺 Golden/Replay、两次 replay 不一致 |
| fixture materialization | 130 个 exact archive ref 生成隔离 SQLite/Report | JAR/Bundle/binding/SHA/空 storage 不匹配、共享写库 |
| 固定环境 | exact Chromium/font/OS/clock/build | font SHA、OS build、browser patch 不同 |
| deterministic author | `2484+18` attempts 两次一致 | 缺 attempt、PNG/geometry/projection 不一致 |
| INITIAL | 空 versions、`1.0.0`、old SHA null | 已有版本仍 INITIAL、覆盖 `1.0.0` |
| SUPERSEDE | 新 SemVer、exact predecessor、new SHA | predecessor 不是最高版本、old SHA 不符、no-op |
| 职责分离 | Applicant 与 Approver 不同 | 自审批或身份缺失 |
| candidate/approval join | Approval exact 引用 READY candidate report raw/payload SHA 和五类 refs | Approve 重选文件、candidate report 被修改、数组或集合 SHA 不等 |
| immutable publish | 新目录原子发布且包含 130 Report/SQLite base | `--force`、overwrite、latest pointer、只复制 Report 不复制 database |
| Visual Manifest | exact approved Report + Environment | candidate、未审批、SHA/环境/集合不闭合 |
| 声明边界 | 仅声明 authoring/visual 实际状态 | 由 Golden 推导 release、enablement 或 ISO PASS |

### 14.1 Authoring 工具性能阈值

在 DEV-CANVAS-06 第 6 节固定参考机器、无其他 release job 的条件下：

1. Candidate Author 固定单 browser lane，禁止并行 GPU screenshot；clean install/build 必须 `<=15 min`；
2. Runtime ready 后单 capture/blank attempt P95 必须 `<=5 s`，任一 attempt 仍受第 6.4 节 `30 s` 硬超时；
3. `2484+18` 全部 attempt、报告和 environment 生成总 wall time 必须 `<=180 min`，peak RSS 必须 `<=4 GiB`；
4. Approve 对 candidate report、全部 refs 和 SHA 的复核及原子写入必须 `<=10 min`，peak RSS `<=1 GiB`；
5. Publisher 对全部 approved bytes 的复制、复核、原子发布和发布后 verify 必须 `<=20 min`，peak RSS `<=2 GiB`；
6. Visual Manifest `0.2` builder/verifier 全量执行必须各 `<=10 min`，peak RSS `<=1 GiB`。

性能不达标阻断对应实现/release validation，但不得修改、降采样、跳过或重写已经生成的证据。实际 wall/P95/Max/RSS 必须进入各实现 checklist 或 release report；这些阈值不是产品交互阈值或 ISO 要求。

## 15. 开发分包与完成定义

后续实现必须按以下依赖顺序分包，不能在同一失败 runner 中临时补图：

1. `GOLDEN-AUTHORING-01`：三类 JSON Schema、正反 contract test；
2. `GOLDEN-AUTHORING-02`：Capture Planner、Family exact join、无 PNG 测试；
3. `GOLDEN-AUTHORING-02B`：Common Visual Fixture Schema、8 fixture、新 Catalog、只读 verifier、Planner Common semantic join和Color Profile pure function；
4. `GOLDEN-AUTHORING-03A`：Family Fixture Materialization/Quarantine Marker Schema、release-only Runtime Materializer、semantic verifier、130 个隔离 SQLite 与验证；
5. `GOLDEN-AUTHORING-03C`：Common release-only Runtime Materializer、8 个 immutable base、attestation、144 个 fresh clone、一次性 fault hook 和 03B adapter；
6. `GOLDEN-AUTHORING-03B-FAMILY`：Family Clone/Web capture adapter，独立冻结 identity、机器 artifact、关闭和浏览器调度；不得复用03C Common协议；
7. `GOLDEN-AUTHORING-03B`：clean build/environment verifier、真实 Common/Family UI setup/capture和candidate author，生成 Authoring Report 0.2；
8. `GOLDEN-AUTHORING-04`：Approval Record `0.2`、Approval verifier、immutable Publisher、并发/恢复测试；
9. `GOLDEN-AUTHORING-05`：Visual Manifest `0.2` builder/verifier 绑定与正反测试；
10. `GOLDEN-AUTHORING-06`：真实 INITIAL authoring、人工审批和 approved evidence；
11. 返回 `GATE-06-03` 执行真实 Visual/E2E closure。

Golden Authoring 设计完成的定义是本文所有字段、算法、命令、状态和失败边界已冻结；Golden Authoring 工具实现完成必须由 02B/03A/03C/03B/04/05 各自 checklist 证明。真实 authoring 完成还必须由 06 生成新 production Plan、130 项 Family materialization、8 个 Common base/144 clone、candidate、人工审批和 approved evidence。三者不得合并表述。

## 16. 事实与假设

### 16.1 事实

1. 当前 Visual 基线是 `378` case、`756` attempt、`1242` capture、`2484` attempt capture；
2. 当前 family exact coverage 是 `130` PASS、`48` BLOCKED，Visual family 只由 130 PASS 派生；
3. 当前活动Common `0.2.0` 43文件root已完成self-verification，但统一production输入和真实Golden authoring不得由此推导；
4. 当前 Capture Plan/Approval/Authoring Report `0.1` Schema 和 Capture Planner 已实现；03A Materialization Report `0.1` Schema、Materializer `v1.5`、pending预验证、唯一四阶段quarantine、Verifier Catalog `v1.1` 63/63与受控130项重验已闭环，production 130项尚未执行；
5. 当前 Golden Environment `0.1` Schema 与生产 `0.2` Schema/离线 verifier 已实现；真实实体、browser/font 运行时验证和 PNG 不存在；
6. 当前 Authoring Report/Approval Record/Golden Environment/Visual Manifest `0.2` Schema 已有定向 contract test；candidate author、approval/publisher、Visual builder、生产 Golden Verifier 和 approved evidence 未实现；
7. 当前 Visual Manifest `0.1` Schema 没有 `golden_authoring_report_ref`，不能作为生产 Visual Gate Manifest；
8. 历史production Plan 的 Common digest仍是`HISTORICAL_PLACEHOLDER`且禁止新03B消费；03C的341文件Adapter Test Input与8个base、144个clone固定callback受控调度已通过，但真实UI/fault/capture integration、03B candidate和真实新production Plan均未完成；
9. Family Materialization消费闭环已经实现，但 Family Clone/Web/browser adapter 尚未实现；其唯一冻结边界见 `opm-dev-canvas-06-golden-authoring-family-capture-adapter-design.md`，不得以03C Common Adapter替代。
9. 当前 validation runner 的冻结边界是 golden 只读。

### 16.2 假设

无。具体 OS build 与实际字体文件 SHA 是每个 approved version 的受控输入和证据，不是可省略的运行时假设。
