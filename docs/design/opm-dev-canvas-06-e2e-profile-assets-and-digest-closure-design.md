# DEV-CANVAS-06 E2E Profile Asset 与摘要闭包设计

文档版本：`v1.5`

文档状态：`FROZEN_INCLUDED`

对应规格：`specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md`

## 1. 设计结论

`active_binding` 只表达语义资产 identity，不能表达实际文件路径、byte length 或 tree identity。活动 Manifest 升级为 `0.2`，活动 Attempt Artifact union 升级为 `0.2`；历史 `0.1` 保持只读。所有 Profile 文件身份必须从 Manifest `profile_asset_tree_ref/profile_asset_refs[]` 逐 byte 读取，再传入 Attempt Artifact `fixture-materialization`。

OPL/Trace 摘要不再由 E2E runner 自行序列化：两者唯一 owner 是 `OplGoldenArtifactCanonicalWriter`。Token 摘要使用独立、封闭、跨 Node/Java parity 的 JCS preimage；三类摘要都只接受真实 API/Runtime 输出，禁止 placeholder 和从 `active_binding` 派生文件身份。E2E seed时间只从Manifest原始`generated_at`严格派生，不接受第二条CLI或时钟输入。

## 2. Profile Asset 输入

### 2.1 Manifest `0.2`

```text
profile_asset_tree_ref = {
  kind: "PROFILE_ASSET_TREE",
  path: "inputs/upstream/profile-assets",
  byte_length: sum(entries.byte_length),
  sha256: sha256(UTF8(JCS(tree preimage)))
}
profile_asset_refs = [
  GRAMMAR_ASSET,
  NORMALIZATION_DATA,
  PROFILE_PACKAGE,
  RULE_SET,
  SYMBOL_ASSET
]
```

`profile_asset_refs[]` 每项固定为 `{kind,path,byte_length,sha256}`，`kind` 集合必须覆盖上述五类且各恰好一次，不能统一写成 `PROFILE_ASSET`。数组只按 UTF-8 path 升序，当前受控 Profile 的具体顺序为 `grammar/...`、`normalization/...`、`profile.json`、`rules/...`、`symbols/...`，不得再按类型重排。path 必须位于 `profile_asset_tree_ref.path` 下，且每项是普通非链接文件 raw ref。`profile.json` 是五项中的 `PROFILE_PACKAGE`；其 `manifest.entries[]` 的四项依赖必须分别命中其余四项。

`profile_package_digest` 不是 `profile.json` raw SHA。前者按现有 Profile package owner 对四项 dependency 的 `logical_path/byte_length/sha256` 行编码重算，并同时等于 `profile.json.manifest.package_digest.digest` 与 `active_binding.profile.sha256`；后者只写在 `PROFILE_PACKAGE.sha256` 并等于 `profile.json` raw bytes。两者不得互换。

### 2.2 Source Set、Staging Root 与 CLI 绑定

Profile Asset Source Set 固定为 clean `--source-root` 中以下五个普通单链接文件；物理路径不能配置、扫描、按 basename 推断或从 Profile ID/binding 回退：

| kind | clean source 固定相对路径 | Staging/Manifest 固定相对路径 |
| --- | --- | --- |
| `PROFILE_PACKAGE` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/profile.json` | `profile.json` |
| `RULE_SET` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/rules/representative-rule-set.json` | `rules/representative-rule-set.json` |
| `GRAMMAR_ASSET` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json` | `grammar/representative-opl-grammar.json` |
| `SYMBOL_ASSET` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/symbols/representative-symbol-catalog.json` | `symbols/representative-symbol-catalog.json` |
| `NORMALIZATION_DATA` | `packages/profiles/profile.iso19450.2024.draft/0.2.0/normalization/representative-normalization.json` | `normalization/representative-normalization.json` |

Profile Asset Staging Root 是 Manifest `0.2` Producer 在 final Manifest staging 创建前，从上述 Source Set 逐字节物化的 fresh、隔离、逻辑只读目录。它恰含五个 Staging 固定相对路径，不要求也不允许物理位于 `--source-root` 内；还不得等于或位于versioned Handoff root、Common root、`--output-root`、Manifest final/staging root内。Producer启动时该路径必须不存在，禁止复用历史root、覆盖已有目录或把source package父目录直接当作Staging Root。

fresh target创建前的路径守卫不能调用不存在目标的`realpath(target)`。唯一算法为：先把CLI值解析为absolute normalized lexical path并要求其nearest existing parent为普通非链接目录；对该parent取real path，再把尚不存在的相对子路径逐segment追加，使用“相等或separator边界内子路径”同时完成lexical/parent-real containment比较。创建目录后立即取得target real path并对全部受控root再做一次相同边界比较；任一父目录link、`..`、创建前后解析漂移或root重叠均拒绝。禁止字符串prefix、basename、目标不存在即跳过real-path检查或创建后不复核。

Producer的`--profile-asset-root`只表示该fresh Staging target，由Producer创建后消费；Verifier的`--profile-asset-root`只表示`<manifest-root>/inputs/upstream/profile-assets`既有只读final root。两者角色不可互换。Producer与Verifier均显式接收`--source-root`；Verifier必须从clean source五固定路径和final root独立复算，不接受Producer内存结论或已缓存raw ref。Manifest verifier、E2E Runner、Java Materializer和Attempt Artifact verifier仍必须显式接收`--manifest-root`、`--manifest`和各自attempt/final内的`--profile-asset-root`。`--manifest`只允许读取指定raw bytes，不能由目录扫描选择；任何入口都不能从Profile ID、binding或basename反推root。

“只读”是行为与验证契约，不是identity字段：Producer完成五文件物化、fsync和首次复算后必须关闭全部写句柄，不得再写、chmod后改bytes、替换或补文件；后续阶段只以只读句柄打开，并在final rename前复算Staging tree。POSIX mode、owner、mtime、ctime和目录inode不进入raw ref或tree digest，也不能单独证明只读。

### 2.2.1 Source raw-ref 与 tree digest

Producer和Verifier对Source Set逐项构造受控映射记录：

```text
{kind, source_path, logical_path, byte_length, sha256}
```

`source_path`必须逐字符等于上表clean source固定路径；`logical_path`必须逐字符等于对应Staging固定路径。该映射是执行期验证记录，不新增Manifest Schema字段。`byte_length/sha256`只能从同一只读文件句柄的0..EOF raw bytes计算；观测前后file key/size/mtime漂移、link、`nlink!=1`、特殊文件或source-root在校验前后变dirty均拒绝。

Source、Staging和final的tree identity都使用第2.1节既有公式，并把逻辑`root_path`固定为`inputs/upstream/profile-assets`；entries使用Manifest五类kind和最终逻辑path，按UTF-8 path升序。物理source路径、Staging绝对路径、权限位和时间戳不进入preimage。因此三处物理root不同，但在五项raw bytes完全相等时tree `byte_length/sha256`必须相等；禁止另建ZIP、目录metadata、locale sort或“source父目录tree”摘要。

唯一闭包为：

```text
clean source raw ref
  -> source_path/logical_path固定映射
  -> Profile Asset Staging raw ref/tree
  -> Manifest final raw ref/tree
  -> profile.json dependencies/package_digest
  -> Handoff active_binding
```

五项中的任一`kind/logical_path/byte_length/sha256`必须在Source、Staging、final三方逐字段相等；`profile_package_digest`按第2.1节独立复算，不得用tree SHA或`profile.json` raw SHA替代。

### 2.2.2 唯一生成与校验时序

```text
SOURCE_CLEAN_HEAD
-> SOURCE_PROFILE_5_LSTAT
-> SOURCE_PROFILE_5_RAW_REFS
-> SOURCE_PROFILE_PACKAGE_AND_BINDING_VERIFY
-> OUTPUT_ROOT_ABSENT
-> PROFILE_STAGING_ROOT_ABSENT_AND_ISOLATED
-> CREATE_PROFILE_STAGING_DIRECTORIES
-> COPY_5_TO_FIXED_RELATIVE_PATHS
-> FSYNC_PROFILE_STAGING_FILES_AND_DIRECTORIES
-> REVERIFY_SOURCE_STAGING_RAW_REFS
-> PROFILE_STAGING_TREE_DIGEST
-> PROFILE_PACKAGE_DIGEST
-> ACTIVE_BINDING_JOIN
-> SEAL_PROFILE_STAGING_READ_ONLY
-> CREATE_MANIFEST_FINAL_STAGING
-> COPY_PROFILE_STAGING_TO_FINAL
-> REVERIFY_SOURCE_STAGING_FINAL_THREE_WAY_JOIN
-> REMOVE_PROFILE_STAGING_ROOT
-> COMPOSE_AND_VERIFY_MANIFEST
```

Source raw/ref/package/binding、output fresh、Staging fresh/isolation和五文件复核全部成功前不得创建Manifest final staging。复制到final后必须重新从三处raw bytes复算，不能沿用copy前缓存。Profile Staging是本次调用拥有的临时root：三方join成功后、Manifest final rename前必须删除并fsync其既有父目录；Producer成功返回时该路径必须不存在。删除失败按I/O失败处理并保持final零输出，不得保留Staging后仍声明成功。Profile Staging创建前失败为零Staging、零Manifest output；创建后、final rename前失败只能删除本次调用创建的Staging和Manifest staging，不能删除source、Common、Handoff或既有root。final rename后沿用Manifest事务的保留/quarantine边界，不得覆盖或原地修补。

身份、路径、文件集合、raw/tree/package/binding drift固定为`E2E_MANIFEST_PROFILE_ASSET_INVALID/3`；Staging已存在或与受控root重叠为`E2E_MANIFEST_TRANSACTION_INVALID/3`；mkdir/copy/fsync/read I/O失败为`E2E_MANIFEST_IO_FAILED/4`。首错必须服从上述时序，不能并发竞态决定。

Attempt Artifact verifier 不新增 Source Set 外的 Node 文件；它由既有 `scripts/verify-canvas06-e2e-report.mjs --scope ATTEMPT` 承接，完整 Report 使用同一文件的显式 `--scope REPORT`。Node Token writer 固定归入既有 `scripts/canvas06-e2e-attempt-artifacts.mjs`，两者均已在Runner Source Set `0.1`的23项allowlist中；Java Token writer由exact Runtime JAR ref承接。

Manifest `0.2` raw/Profile校验的共享纯函数owner固定为23项Source Set内的 `scripts/canvas06-e2e-run-input.mjs`。Runner直接调用该owner，不执行上游Manifest verifier CLI；Manifest v02 builder/verifier调用同一owner并由各自generator identity记录入口源码，避免新增未被任一source identity承接的helper。

校验顺序固定为：

```text
manifest path safety -> manifest raw bytes -> Manifest 0.2 Schema
-> Manifest semantic refs -> profile root safety
-> profile tree digest -> five raw refs -> active_binding.profile join
```

Profile 目录的实际根由 `--profile-asset-root` 提供；Manifest ref 的 `inputs/upstream/profile-assets/` 前缀在读取时剥离，剩余相对 path 用于 root 内查找。任何额外文件、缺项、重复 path、symlink/hardlink、SHA/length/tree/package/binding 不一致，都在 SQLite 和 Runtime 之前返回 `E2E_MANIFEST_PROFILE_ASSET_INVALID`。

### 2.3 Attempt `0.2`

`fixture-materialization` 必须保存：

```text
profile_asset_tree_ref : path=`profile/assets`
profile_asset_refs[]   : 与 Manifest 五项 raw bytes 深度相等
profile_package_digest : active_binding.profile.sha256
```

Materializer 只能复制已验证的 Profile root，不能读取 checkout、再解压 Bundle 或按 active binding 重新解析另一套文件。Artifact Index `0.2` 必须记录一项 `PROFILE_ASSET_TREE` 和五项 `PROFILE_ASSET`；每个 `PROFILE_ASSET` 条目必须带具体 `asset_kind`，五类各恰好一次，并全部纳入 tree SHA 和 payload SHA。

Manifest tree 的 `root_path=inputs/upstream/profile-assets`，Attempt tree 的 `root_path=profile/assets`。tree digest preimage包含 `root_path`，所以复制后的两个 tree SHA 必须分别复算且预期不同；verifier 通过剥离 root prefix 后的五项 `{kind,relative_path,byte_length,sha256}` 深度相等完成 join，禁止直接比较两个 tree SHA。

### 2.4 Direct-root loader

E2E Materializer 只能创建 `FileProfilePackageLoader.forVerifiedDirectPackageRoot(<attempt-root>/profile/assets, verifiedSet)`。该模式固定为 `DIRECT_PACKAGE_ROOT`；现有构造器的 `HIERARCHICAL_ASSET_ROOT` 兼容模式不得用于 release materialization。

`verifiedSet` 只能由 Manifest/Profile preflight 成功结果构造，恰含五项 verified raw ref。direct 模式不追加 Profile ID/version 子目录，也不执行相对根向上搜索；只从给定 root 读取 `profile.json` 和它声明的四项依赖。root 递归文件集合与 verifiedSet 必须完全相等，且不得包含链接、hardlink、特殊文件和临时文件。随后仍由既有 `ProfilePackageAssembler` 完成 Profile manifest、五角色 binding、Rule/Grammar/Symbol/Normalization 和 capability binding 校验，不建立第二套轻量校验器。

任何 checkout、classpath、工作目录、环境变量、系统属性、JAR resource 或安装目录 fallback 都是契约违规；失败统一在 SQLite 前返回 `E2E_MANIFEST_PROFILE_ASSET_INVALID/3`。

### 2.5 `input_ref` 自校验

Runner 是 attempt-local raw copy 的生产者，Materializer 是成功 artifact 的最终信任 owner。Materializer 必须显式接收 `--input`，并在 SQLite 前自行完成以下 join：

```text
Manifest source = --manifest-root / Manifest case.input_ref.path
CLI input       = <attempt-root>/inputs/materializer/input.raw
realpath(CLI input) != realpath(Manifest source)
Files.mismatch(CLI input, Manifest source) == -1
Manifest source raw byte_length/SHA-256 == Manifest case.input_ref
fixture-materialization.input_ref == Manifest case.input_ref
```

两类 fixture 都执行该校验；COMMON 即使只用 base fixture seed，也不能省略 input。source 与 copy 必须是两个不同的 single-link 普通非链接文件，且都在 attempt root 内；Runner 的“已验证”标志、内存对象、路径命名或文件名不能替代 Materializer raw 校验。参数/path错误为 `E2E_INPUT_INVALID/2`，raw/ref drift为 `E2E_FIXTURE_MISMATCH/3`；均为零 SQLite、零Materialization artifact。

### 2.6 JAR code source

成功Materializer的JAR identity只取当前进程`E2EFixtureMaterializerCli` protection-domain CodeSource。Spring Boot `3.5.10`通过`PropertiesLauncher`装载`BOOT-INF/classes`时，唯一合法external form固定为：

```text
outer = absolute normalized <attempt-root>/inputs/build/local-runtime.jar
raw_path = outer.toUri().getRawPath()
code_source = "jar:nested:" + raw_path + "/!BOOT-INF/classes/!/"
```

实际`CodeSource.location.toExternalForm()`必须逐code point等于上述构造值。只有外层`jar:`、内层`nested:`、nested entry=`BOOT-INF/classes/`和最终`!/`合法；`file:`、`jar:file:`、裸`nested:`、`BOOT-INF/lib/*.jar`、其他entry、额外nested链、query/fragment/authority、classpath目录及其他JAR全部拒绝。

外层physical JAR只允许按以下算法解析：完整external form先与期望值精确相等；随后各移除一次固定前缀`jar:nested:`和固定后缀`/!BOOT-INF/classes/!/`；以剩余raw path构造`file:` URI，要求scheme、空authority/query/fragment和raw-path roundtrip均精确；最后仅通过`Path.of(fileUri)`解码一次。所得absolute normalized lexical path和real path必须分别等于预先从attempt root构造的outer lexical/real path。禁止按首个`!`截断、循环去prefix、手工URL decode、basename/checkout/classpath搜索或任何fallback。

解析出的outer必须是single-link普通非链接文件，其ref逐字段等于Manifest `source_build.local_runtime_jar`；输出`materializer_identity.runtime_jar_ref`从outer raw bytes计算。`BOOT-INF/classes/`只证明应用类装载位置，不被摘要。任一CodeSource形态、entry、URI、path、link或ref drift为`E2E_ENVIRONMENT_MISMATCH/3`，位于storage freshness/SQLite之前。测试classpath只覆盖纯解析和失败路径；成功测试必须用JDK 21 fork exact built Spring Boot JAR并通过`PropertiesLauncher`加载Materializer。

### 2.7 `source_sha256`

唯一公式：

```text
jar = outer physical JAR safely parsed from exact nested code source
source_sha256 = lowerhex(SHA-256(raw_file_bytes(jar, 0, EOF)))
source_sha256 == materializer_identity.runtime_jar_ref.sha256
```

`source_sha256`是外层exact Runtime JAR raw SHA的内联别名。它不摘要`BOOT-INF/classes/`目录entry或`E2EFixtureMaterializerCli.class`：该入口的行为还依赖其嵌套class、direct-root loader、`ProfilePackageAssembler`、依赖和Boot loader，单entry不能封闭执行身份。它也不摘要受控Java source-set：活动Attempt Artifact没有source mirror/ref，产品Java身份已冻结由Runtime JAR承接，引入source-set会建立第二条checkout信任链。

producer在code-source path、single-link、realpath和Manifest ref全部通过后，对同一打开文件句柄从0到EOF流式计算一次length/SHA，同时生成`runtime_jar_ref`和`source_sha256`。Manifest值、CLI字符串、classloader resource、ZIP entry digest或先前缓存不得作为摘要输入。观测前后file key/size/mtime漂移统一拒绝。

`source_sha256`与`runtime_jar_ref.sha256`必须相同；相同的设计理由不是冗余校验，而是分别承担“payload内联执行摘要”和“可解析raw file ref”两个结构职责，同时强制它们只描述同一执行文件。任何不等均为`E2E_ENVIRONMENT_MISMATCH/3`。

### 2.8 Manifest确定性时间

Materializer不接受独立时间参数。唯一时间输入来自已验证活动Manifest的原始`generated_at`：

```text
instant           = Instant.parse(manifest.generated_at)
source_date_epoch = instant.getEpochSecond()
manifest.generated_at == Instant.ofEpochSecond(source_date_epoch).toString()
```

`parseUtcWholeSecond`必须同时满足：字段是JSON string；`Instant.parse`成功；`instant.getNano()==0`；按epoch second重建的`Instant.toString()`与原始字符串逐code point相等。合法形状因此唯一为大写`Z`结尾、无小数部分的UTC整秒。`.000Z`、非零小数、`+00:00`、其他offset、空白、大小写变化或任何解析后被归一化的表示均拒绝。历史Manifest`0.1`的`.000Z` bytes保持只读；活动`0.2` builder必须输出canonical整秒形式。

`source_date_epoch`只作为Materializer内存中的Family/Common seed时间，统一驱动SQLite `created_at/updated_at`等确定性字段，写入文本固定为`Instant.ofEpochSecond(source_date_epoch).toString()`；它不新增到Manifest、Attempt Artifact或`fixture-materialization.json` Schema。Runner只能逐byte传递Manifest原始文件，不新增`--source-date-epoch`、环境变量或系统属性，不得解析、规范化或重写时间。Manifest semantic verifier可以提前执行同一检查，但Materializer和Artifact verifier仍必须从同一Manifest raw bytes各自独立派生；失败固定为`E2E_INPUT_INVALID/2`，且零SQLite、零`fixture-materialization.json`。

## 3. 三类摘要 Owner

### 3.1 OPL

```text
opl_bytes   = OplGoldenArtifactCanonicalWriter.write(oplTextArtifact)
opl_sha256  = SHA256(opl_bytes)
```

`opl_bytes` 是 Java writer 原样输出的 UTF-8 bytes。字段顺序、NFC、Token/SourceRef 嵌套和 optional field omission 均由该 writer 决定。Node verifier 不得用 `JSON.stringify`、JCS、`utf8_text` 或自定义排序重建 OPL bytes。

### 3.2 Trace

```text
trace_bytes  = OplGoldenArtifactCanonicalWriter.writeTraces(revisionId, traces)
trace_sha256 = SHA256(trace_bytes)
```

Trace 是独立 Bundle，不能拼入 OPL bytes。`revision_id`、Trace/SourceRef/TokenRange 顺序和缺省字段省略必须与 Java writer 完全一致。

### 3.3 Token

Java 与 Node 都实现同一个 `TokenCanonicalWriter`：先构造下列 JCS preimage，再调用共享 safe-integer JCS owner：

```json
{
  "schema_id": "OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001",
  "schema_version": "0.1",
  "revision_id": "<revision>",
  "tokens": [
    {
      "token_id": "<id>",
      "sentence_id": "<sentence>",
      "ordinal": 0,
      "text": "<NFC text>",
      "kind": "ENTITY",
      "start_utf8_byte": 0,
      "end_utf8_byte": 6,
      "source_refs": [{
        "source_kind": "ELEMENT",
        "stable_id": "<id>"
      }]
    }
  ]
}
```

```text
token_sha256 = SHA256(UTF8(JCS(token_preimage)))
```

Token 数组按 Runtime 产生顺序保留；不能排序、去重或按 ID 重排。字符串必须 NFC；optional `field_path/endpoint_ordinal/sentence_slot` 缺失时省略，不写 `null`。Token 的 byte range 必须是 UTF-8 byte 且与文本实际编码闭合。

## 4. Token parity Catalog

机器输入固定为：

```text
docs/contracts/schemas/opm-dev-canvas-06-token-digest-preimage.schema.json
docs/contracts/schemas/opm-dev-canvas-06-token-digest-parity-vectors.schema.json
tests/e2e/release/dev-canvas-06/fixtures/token-digest-v01-parity-vectors.json
```

Catalog `0.1.0` 固定 3 个正向量、4 个负向量。正向量必须同时提供 input、JCS preimage、canonical UTF-8 hex 和 SHA；负向量必须提供单变量 mutation、稳定错误码和 JSON Pointer。Node 与 Java 必须逐字段比较 preimage、canonical bytes、SHA/error/pointer；不能只比较最终 digest。

## 5. Verifier 规则

Artifact verifier 在读取任何 attempt 业务结果前必须：

1. 验证 Manifest raw bytes 和 `0.2` Schema；
2. 对Manifest原始`generated_at`执行`parseUtcWholeSecond`并派生唯一`source_date_epoch`；
3. 验证 Profile tree/raw refs 和 `active_binding.profile.sha256`；
4. 验证 Attempt Artifact `0.2` filename/schema identity、Profile refs、Artifact Index；
5. 按`runtime_jar_ref.path`只读打开attempt-local exact JAR，复算raw length/SHA，检查Manifest ref、`runtime_jar_ref`和`source_sha256`三方闭合；
6. 从真实 OPL/Trace raw artifact 调用 Java writer parity；
7. 对真实 Token payload 构造 Token preimage，运行 Node/Java parity vectors 和 SHA 复算；
8. 复算 `state_digests`、`semantic_comparison_digest` 与 Report projection。

verifier 只读，不写 cache、修复文件、补 ref、覆盖 artifact 或改变 tree。验证前后 attempt/report root tree digest 必须相等，并复核 `input_ref` 与 Manifest case 深度相等、Materializer JAR ref 与 Manifest及attempt-local code source证据闭合。

verifier不得读取checkout、Java source-set、`.java`、单个/多个`.class`或nested entry、classloader resource、Maven `target/classes`或另一个同名JAR。字段/Schema/path非法固定为`E2E_INPUT_INVALID/2`；CodeSource URI/entry/outer path、JAR文件、length、SHA、Manifest/ref/source三方join或相等不变量失败固定为`E2E_ENVIRONMENT_MISMATCH/3`。

## 6. 状态边界

本设计闭合的是文件身份、Materializer input/JAR信任边界、Manifest派生确定性时间和摘要算法输入，不是实现证据。局部 Schema、writer或preflight代码存在不等于活动 producer/consumer成功路径、Materializer、Runner、E2E Report、194/388、GATE-06-03、Candidate、Activation、Capability、生产发布或 ISO 符合性完成。
