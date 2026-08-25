# Spec: DEV-CANVAS-06 E2E Profile Asset 与摘要闭包修正

文档状态：`FROZEN_FOR_BUILD`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与根因

当前 E2E Manifest `0.1` 只携带 Profile/Rule/Grammar/Symbol/Normalization 的语义 binding，未携带可供 Attempt Materializer 逐 byte 校验的完整 Profile asset tree/raw refs。Attempt Artifact `0.1` 只能复用 `active_binding`，无法证明实际读取的五份 Profile 文件身份。既有 Profile loader 对相对根存在向父目录搜索行为，`input_ref` 也没有 Materializer 自校验责任，JAR identity 未限定为当前进程 code source；三者会允许 checkout fallback、未经独立验证的 input 或测试 classpath 生成伪成功 artifact。OPL/Trace 虽已有 Java `OplGoldenArtifactCanonicalWriter`，但 E2E digest 规格此前没有把它固定为唯一 owner。

根因是“语义 binding”和“文件身份”被混用，Profile/input/JAR 三条信任链没有落到 Materializer 的唯一 fail-closed 消费路径，且 OPL、Trace、Token 三类摘要此前没有统一的机器级输入、字节边界和跨语言验证入口。后续审计还发现E2E seed时间没有唯一来源，若由Runner参数、当前时钟或fixture各自提供，会使同一Manifest产生不同SQLite时间和摘要。Spring Boot `3.5.10`的forked executable JAR不会把应用类CodeSource暴露为普通`file:` JAR，而是`jar:nested:<outer-jar>/!BOOT-INF/classes/!/`；若直接对完整URI调用`Path.of`，真实forked-JAR正例会被错误拒绝。

## 2. 目标

1. 保留 Manifest/Attempt Artifact `0.1` 历史 bytes，新增活动 Manifest `0.2` 与 Attempt Artifact union `0.2`；
2. 冻结 Manifest raw 校验、`--profile-asset-root`、五份 Profile asset raw ref、tree digest 和 active binding 的 join；
3. 在 Attempt Artifact `0.2` 的 `fixture-materialization` 中加入 Profile asset tree/raw refs，并使 Artifact Index 逐项闭合；
4. 冻结三类摘要公式：OPL、Trace 复用 `OplGoldenArtifactCanonicalWriter`，Token 使用固定 JCS preimage/canonical writer；
5. 新增 Token preimage Schema、Node/Java parity vector Schema 和固定向量输入，作为 CLI 成功路径的前置条件；
6. 同步 Manifest builder/verifier、Attempt Artifact verifier、E2E Runner 实现规格和 checklist；
7. 冻结 Materializer direct-root Profile loader、显式 `--input` 自校验及当前进程唯一Spring Boot nested code source到外层JAR的安全identity解析；
8. 冻结 `materializer_identity.source_sha256` 的唯一 exact Runtime JAR raw-byte preimage、producer/verifier和错误边界；
9. 冻结 `source_date_epoch=parseUtcWholeSecond(manifest.generated_at)` 的唯一确定性时间来源、严格往返和零输出边界；
10. 本轮只冻结设计与机器契约，不实现 CLI 成功路径、Materializer、Runner、Report 或生产证据。

## 3. 非目标

- 不修改历史 `opm-dev-canvas-06-e2e-manifest.schema.json/0.1`、`opm-dev-canvas-06-e2e-attempt-artifact.schema.json/0.1`、历史 Manifest、fixture、Handoff、Intake 或 Evidence Bundle；
- 不实现 `release-canvas06-e2e-manifest-v02.mjs`、`verify-canvas06-e2e-manifest-v02.mjs`、E2E Runner、Java Materializer、Artifact verifier 或 Token writer；
- 不修改产品 API、OpenAPI、SQLite DDL/migration、Profile/Rule/Grammar/Symbol 语义、Vue、Gate、Candidate、Activation 或 Capability；
- 本次`v1.4`nested code source追加不修改活动Manifest/Attempt Artifact `0.2` Schema、历史`0.1` bytes或任何机器artifact；
- 不生成 controlled/production `194/388`、E2E Report、GATE-06-03、发布或 ISO 19450:2024 符合性证据。

## 4. 修改边界

允许修改：

- 本规格和对应 checklist；
- 新增活动 Manifest `0.2` Schema、Attempt Artifact `0.2` Schema、Token preimage/Parity Schema 和 parity fixture；
- 新增 Profile asset 与摘要设计文档；
- Manifest builder/verifier、E2E Runner/Artifact verifier 实现规格、checklist、测试策略、冻结基线、开发执行包和 `docs/README.md` 的入口指针；
- 新增 Schema/JSON 解析、反例和 parity vector 定向测试。

禁止修改：`.harness/**`、历史 `0.1` Schema/bytes、`services/**`、现有 CLI 成功路径、产品 API/SQLite/Vue、fixture/Handoff/Intake/Evidence Bundle、Candidate/Activation 和 production gate。

`v1.4`追加的允许范围仅为本规格、对应设计/checklist、Runner实现规格/checklist、冻结基线和`docs/README.md`；活动`0.2` Schema已经能够承载既有JAR ref，不得因nested URI解析新增字段或升级版本。

## 5. 活动版本与兼容策略

### 5.1 Manifest

新增：

```text
schema_id       = OPM-DEV-CANVAS-06-E2E-MANIFEST-001
schema_version  = 0.2
manifest_version= 0.2.0
generator_identity.runner_version = 0.2.0
$id             = urn:opm:contract:dev-canvas-06-e2e-manifest:0.2
```

`0.1` 仅作为历史只读输入。活动 builder/verifier 目标为 `release-canvas06-e2e-manifest-v02.mjs` 与 `verify-canvas06-e2e-manifest-v02.mjs`；不得让同一入口同时写 `0.1` 和 `0.2`。

Manifest `0.2` 顶层新增必填：

```text
profile_asset_tree_ref : ProfileAssetTreeRef
profile_asset_refs     : ProfileAssetRef[5]
```

五项必须按 UTF-8 path 升序，固定覆盖 `profile.json`、Rule Set、Symbol Catalog、OPL Grammar、Normalization Data。`active_binding` 仍只表达语义 id/version/digest，不承载路径、byte length 或 tree 身份。

Manifest `0.2` builder继续使用既有确定性 source epoch 输入，但`generated_at`必须写为与Java `Instant.ofEpochSecond(source_date_epoch).toString()`逐字相同的UTC整秒字符串，例如`2026-07-01T00:00:00Z`。历史`0.1`的`.000Z` bytes保持只读；活动builder不得复制该历史表示，也不得写非零小数、`+00:00`或本地offset。

每项 raw ref 固定为 `{kind,path,byte_length,sha256}`，`kind` 集合必须各恰好一次覆盖 `PROFILE_PACKAGE/RULE_SET/SYMBOL_ASSET/GRAMMAR_ASSET/NORMALIZATION_DATA`；数组唯一顺序是 UTF-8 path 升序，不按资产类型另行排序。当前受控 Profile 的顺序固定为 `grammar/...`、`normalization/...`、`profile.json`、`rules/...`、`symbols/...`。禁止用统一 `PROFILE_ASSET` 替代具体资产类型。Artifact Index 仍使用聚合 `kind=PROFILE_ASSET`，但必须新增并逐项校验上述 `asset_kind`。

### 5.2 Attempt Artifact

新增 union Schema：

```text
$id            = urn:opm:contract:dev-canvas-06-e2e-attempt-artifact:0.2
schema_version = 0.2
```

11 类 root 的 `schema_id`、文件名和字段语义沿用 `0.1`，所有 root 版本升级为 `0.2`。`0.1` reader 只读，不能消费 `0.2`；`0.2` reader 不得回写或升级历史 root。

`fixture-materialization` 新增必填：

```text
profile_asset_tree_ref : ProfileAssetTreeRef
profile_asset_refs     : ProfileAssetRef[5]
profile_package_digest : digest
```

`profile_package_digest` 是 Profile 四项 required dependency 的 package digest，不是 `profile.json` raw SHA。它必须等于 `profile.json.manifest.package_digest.digest` 和 `active_binding.profile.sha256`，算法沿用现有 Profile owner：将四项 dependency 按 `logical_path` UTF-8 升序，对每项拼接 `logical_path + "\n" + byte_length + "\n" + sha256 + "\n"` 后计算 SHA-256。`PROFILE_PACKAGE.sha256` 单独等于 `profile.json` raw bytes SHA，允许且预期与 package digest 不同。`profile_asset_tree_ref` 在 Attempt root 内固定指向 `profile/assets`；五项 raw ref 必须位于该目录下并逐 byte 等于 Manifest `0.2` 对应 raw ref。

Artifact Index `0.2` 除原 10 类核心 JSON 外，必须恰有一个 `PROFILE_ASSET_TREE` 和五个 `PROFILE_ASSET` 条目；五项 `asset_kind` 集合各恰好一次覆盖 `PROFILE_PACKAGE/RULE_SET/SYMBOL_ASSET/GRAMMAR_ASSET/NORMALIZATION_DATA`，条目唯一顺序仍为 UTF-8 path 升序。不得自引用、跨 attempt、缺项、重复或出现额外 Profile 文件。

## 6. CLI 与 Manifest raw ref 校验

活动 Manifest 消费者固定接受：

```text
--manifest <manifest-root 内的相对 Manifest 路径>
--profile-asset-root <只读 Profile asset tree 根目录>
```

角色边界固定为：

1. Manifest `0.2` builder 是生产者，只在历史 `0.1` builder 参数基础上新增 `--profile-asset-root`，继续用 `--out`指定新 Manifest；禁止接受一个既有 `--manifest`后重写；
2. Manifest `0.2` verifier、E2E Runner、Java Materializer 和 Attempt Artifact verifier 都必须同时接受 `--manifest-root`、`--manifest` 和 `--profile-asset-root`；
3. Java Materializer 的 `--manifest` 必须指向 attempt-local exact raw copy，`--profile-asset-root` 必须指向 attempt-local只读副本；二者先于 SQLite 创建校验；
4. Attempt Artifact verifier 的活动命令固定为：

```text
node scripts/verify-canvas06-e2e-report.mjs \
  --scope ATTEMPT \
  --manifest-root <只读Manifest final root> \
  --manifest <Manifest root内相对Manifest路径> \
  --profile-asset-root <只读Profile asset tree根目录> \
  --attempt-root <只读单attempt root> \
  --report-root <只读E2E Report transaction root>
```

`--scope` 必填且只允许 `ATTEMPT/REPORT`，禁止根据参数或路径自动推断；完整 Report verifier 固定显式传 `--scope REPORT`。该 verifier 不接受 `--fix/--rewrite/--update-digest/--ignore-profile`，ATTEMPT 成功 stdout 只输出 attempt tree SHA；失败输出稳定错误码且验证前后 attempt/report root tree SHA 必须相等。Node Token canonical writer 固定实现在已由 Runner Source Set `0.1`锁定的 `scripts/canvas06-e2e-attempt-artifacts.mjs`；Java `TokenCanonicalWriter` 由 exact Runtime JAR ref 承接，不新增未进入 Source Set 的 Node 文件。

Runner 不执行上游 Manifest verifier CLI，也不把其源码暗中纳入Runner identity；Manifest `0.2`的 raw/Profile校验共享 owner 固定为Runner Source Set `0.1`已锁定的 `scripts/canvas06-e2e-run-input.mjs`。Manifest v02 builder/verifier只调用该纯函数owner并由各自 `generator_identity.runner_source_sha256`记录入口源码；禁止再新增未被 Manifest identity 或Runner Source Set承接的 helper。

规则：

1. `--manifest` 必须是相对路径、单次出现、普通非链接文件，读取 raw bytes 后先做 Schema `0.2` 校验；禁止根据 basename 或 `active_binding` 反推 Manifest；
2. `--profile-asset-root` 必须是普通非链接目录，目录树不得含 symlink、hardlink、socket、device、FIFO、临时文件或额外文件；
3. verifier 将 `profile_asset_tree_ref.path` 的前缀从 Manifest root 映射到 `--profile-asset-root`，逐项校验五份 `profile_asset_refs` 的 path、byte_length、SHA-256；
4. `profile_asset_tree_ref.sha256` 固定为：

```text
sha256(UTF8(JCS({
  schema_id: "OPM-DEV-CANVAS-06-PROFILE-ASSET-TREE-001",
  schema_version: "0.1",
  root_path,
  entries: [{kind,path,byte_length,sha256}] // 按 UTF-8 path 升序
})))
```

Manifest tree 的 `root_path` 固定为 `inputs/upstream/profile-assets`，Attempt tree 的 `root_path` 固定为 `profile/assets`；复制后必须重新计算 Attempt tree SHA，因此两个 tree SHA 预期不同，禁止直接相等比较。唯一 join 是分别剥离两个 root prefix 后，五项 `{kind,relative_path,byte_length,sha256}` 逐项深度相等。

5. tree preimage/SHA 不闭合、任一 raw ref 与实际文件不等、`profile.json.manifest.entries[]` 与四项 dependency raw ref 不等、重算 package digest 与 `profile.json.manifest.package_digest.digest` 或 `active_binding.profile.sha256` 不等，或 Manifest raw bytes 被重序列化后再比较，均固定返回 `E2E_MANIFEST_PROFILE_ASSET_INVALID`，退出码 `3`；禁止把 `profile.json` raw SHA 与 package digest 直接比较；
6. Manifest/asset preflight 失败发生在 SQLite、Runtime、Browser 和 Attempt artifact 写入之前，属于零输出 rejection。

### 6.1 Materializer direct-root Profile loader

E2E Materializer 只能通过 `FileProfilePackageLoader` 的显式 `DIRECT_PACKAGE_ROOT` 模式装配 Profile。实现入口固定为 `FileProfilePackageLoader.forVerifiedDirectPackageRoot(Path, VerifiedProfileAssetSet)`；现有构造器继续表示 `HIERARCHICAL_ASSET_ROOT`，其兼容行为不得被 Materializer 调用。

`DIRECT_PACKAGE_ROOT` 的唯一物理根是当前 attempt 的 `<attempt-root>/profile/assets`。`VerifiedProfileAssetSet` 只能由本节前述 Manifest `0.2`、Profile tree、五项 raw ref 和 package/binding join 全部成功后创建，并恰含五项 `{kind,relative_path,byte_length,sha256}`。loader 必须满足：

1. root 必须是绝对、规范化、真实存在的普通非链接目录，且 real path 仍位于 attempt root；禁止相对路径、父目录搜索、工作目录、classpath、环境变量、系统属性、checkout、JAR 内资源或已安装 Profile fallback；
2. root 的递归普通文件集合必须与五项 verified refs 完全相等，`profile.json` 恰为根下 `PROFILE_PACKAGE`，其余四项只按 Manifest logical path 解析；缺失、额外、重复、symlink、hardlink、特殊文件或路径逃逸统一为 `E2E_MANIFEST_PROFILE_ASSET_INVALID/3`；
3. `loadPackage(profile_id, package_version, package_digest)` 在 direct 模式不得拼接 `<profile_id>/<version>`，只能读取该 root 的 `profile.json`，并继续校验其 identity、manifest entries、四项 dependency raw bytes、package digest 和五角色 binding；
4. direct loader 必须原样传给既有 `ProfilePackageAssembler`，继续复用 `RuleSetAssetLoader`、`OplGrammarAssetLoader`、`OplSymbolCatalogAssetLoader`、`NormalizationAssetLoader` 和 capability binding 校验；禁止在 Materializer 内复制或缩减这些规则。

### 6.2 `input_ref` 信任责任

Materializer CLI 新增必填且只能出现一次的：

```text
--input <attempt-local exact input raw file>
```

Runner 必须保留 `--manifest-root` 下由 Manifest case `input_ref.path` 解析出的只读 raw source，并把它逐 byte 复制为 attempt-local `<attempt-root>/inputs/materializer/input.raw`；禁止 parse/normalize/reserialize。Runner 的预验证不替代 Materializer 自校验。Materializer 必须在 SQLite 创建前分别打开 source 与 `--input` 两个 single-link 普通非链接文件，要求二者 real path 不同、都位于 attempt root，且 `Files.mismatch(input, source)=-1`；随后以 source raw bytes 核对 `byte_length` 和 SHA-256 与 Manifest `input_ref` 闭合。`fixture-materialization.input_ref` 必须逐字段复制 Manifest case 的原对象，不得从 CLI path 重建。

缺失、重复、unsafe path、跨 root 或不是普通单链接文件固定为 `E2E_INPUT_INVALID/2`；raw bytes、length、SHA 或 Manifest case join 不一致固定为 `E2E_FIXTURE_MISMATCH/3`。两类失败均为零 SQLite、零 `fixture-materialization.json`、零后续 artifact。`FAMILY/COMMON` 都必须传 `--input`，即使该输入不参与 base SQLite seed，也不得跳过验证。

### 6.3 当前进程 JAR identity

Materializer只能接受当前进程`E2EFixtureMaterializerCli.class.getProtectionDomain().getCodeSource().getLocation()`的唯一Spring Boot application-classes形态。设：

```text
expected_outer = absolute normalized <attempt-root>/inputs/build/local-runtime.jar
expected_raw_path = expected_outer.toUri().getRawPath()
expected_code_source = "jar:nested:" + expected_raw_path + "/!BOOT-INF/classes/!/"
```

`CodeSource.location.toExternalForm()`必须逐code point等于`expected_code_source`。唯一允许的协议链是外层`jar:`、内层`nested:`，唯一nested entry是`BOOT-INF/classes/`，最外层JarURLConnection entry后缀固定为`!/`。不得接受`file:`、`jar:file:`、裸`nested:`、`BOOT-INF/lib/*.jar`、其他nested entry、额外`!/`链、query、fragment、authority、classpath目录或另一个JAR。

外层physical JAR的安全解析固定为：只在完整字符串已与`expected_code_source`相等后，移除唯一前缀`jar:nested:`和唯一后缀`/!BOOT-INF/classes/!/`取得`raw_outer_path`；构造`URI.create("file:" + raw_outer_path)`，要求scheme精确为`file`、authority/query/fragment为空、`getRawPath()`逐字等于`raw_outer_path`；再用`Path.of(fileUri)`只解码一次。解析后的absolute normalized lexical path必须等于`expected_outer`，两者`toRealPath()`也必须相等。禁止用`indexOf('!')`、反复去prefix、URLDecoder、字符串替换、basename搜索、classpath扫描或解析失败后的fallback定位JAR。

解析出的外层JAR必须是single-link普通非链接文件，位于受控attempt root，且ref逐字段等于Manifest `source_build.local_runtime_jar`。`materializer_identity.runtime_jar_ref`只能由该外层physical JAR raw bytes计算并写入；inner `BOOT-INF/classes/`只证明应用类装载位置，不作为摘要输入。CodeSource缺失、形态/entry/path不等、URI非canonical、目录、`target/classes`、IDE/JUnit/Maven test classpath、其他JAR、symlink/hardlink或ref drift统一为`E2E_ENVIRONMENT_MISMATCH/3`，发生在storage freshness和SQLite创建之前。

单元测试可以覆盖URI纯解析和失败路径；成功artifact测试必须通过JDK 21 fork exact built Spring Boot JAR，以`PropertiesLauncher`加载Materializer，并断言真实CodeSource精确等于上述nested形态、反解析外层path等于attempt-local JAR。测试classpath直接调用`main/run`永远不得生成成功artifact。

### 6.4 `source_sha256` 唯一 preimage

`materializer_identity.source_sha256` 的唯一原始输入不是 Java source、source-set、单个 `.class`、nested entry、Manifest/ref对象或其JCS，而是第6.3节从唯一nested CodeSource安全解析并通过guard的外层exact Runtime JAR普通文件从offset `0`到EOF的全部raw bytes：

```text
runtime_jar_bytes = raw bytes of <attempt-root>/inputs/build/local-runtime.jar [0, EOF)
source_sha256     = lowerhex(SHA-256(runtime_jar_bytes))
runtime_jar_ref   = {
  kind: "LOCAL_RUNTIME_JAR",
  path: "inputs/build/local-runtime.jar",
  byte_length: runtime_jar_bytes.length,
  sha256: source_sha256
}
```

因此 `source_sha256 == runtime_jar_ref.sha256` 是必需不变量，不是允许相同，也不得因字段名包含 `source` 而改读 checkout Java source。保留两个字段的理由是：`runtime_jar_ref`承载kind/path/length和可解析raw file identity，`source_sha256`是被纳入`materialization_payload_sha256`的内联执行输入摘要；两者共享同一preimage，避免出现“ref指向一个JAR、source摘要描述另一个输入”的双重身份。

producer只能对已验证code source的同一打开文件句柄进行一次raw流式观测，取得byte length和SHA后同时填入两个字段；Manifest SHA只能作为期望值比较，禁止直接复制Manifest字段、CLI字符串或预先缓存值。hash前后file key/size/mtime发生变化、entry point不是exact JAR或两字段不等均固定为`E2E_ENVIRONMENT_MISMATCH/3`，零SQLite、零artifact。

verifier必须从attempt root按`runtime_jar_ref.path`重新解析single-link普通非链接文件，复算raw length和SHA，并同时检查：ref逐字段等于Manifest `source_build.local_runtime_jar`、观察SHA等于`runtime_jar_ref.sha256`、观察SHA等于`source_sha256`。Schema/字段/path非法为`E2E_INPUT_INVALID/2`；文件、length、任一SHA或三方join不一致为`E2E_ENVIRONMENT_MISMATCH/3`。禁止回退到source checkout、runner source-set、classloader resource、`.class` entry、Maven target目录、另一个同名JAR或Manifest声明值。

### 6.5 `source_date_epoch` 唯一来源

`source_date_epoch`不是新的Manifest、Attempt Artifact或`fixture-materialization.json`字段，而是Materializer从已通过raw/Schema校验的活动Manifest内存派生的唯一确定性seed时间：

```text
instant           = Instant.parse(manifest.generated_at)
source_date_epoch = instant.getEpochSecond()
manifest.generated_at == Instant.ofEpochSecond(source_date_epoch).toString()
```

`parseUtcWholeSecond(text)`固定执行：输入必须是JSON string；使用Java `Instant.parse`严格解析；要求`instant.getNano()==0`；取得epoch second后以`Instant.ofEpochSecond(epoch).toString()`重建，并与原始JSON字符串逐code point相等。只有以大写`Z`结尾、无小数部分且可严格往返的UTC整秒形式合法。`.000Z`即使数值上是整秒也因raw表示不相等而拒绝；`+00:00`、其他offset、非零小数、空白、大小写变化、非法或被解析器归一化的日期时间同样拒绝。

Materializer不得接受`--source-date-epoch`、环境变量、系统属性、当前时钟、fixture时间或Runner传值。Runner只逐byte保留并传递Manifest原始文件及既有`--manifest-root/--manifest`参数，不解析、规范化或重写`generated_at`。Manifest semantic verifier可用同一算法提前拒绝，但不得替代Materializer独立复验。派生值只用于Family/Common SQLite seed的`created_at/updated_at`等确定性时间输入；写入值统一为`Instant.ofEpochSecond(source_date_epoch).toString()`。Materializer和Attempt verifier都必须从同一Manifest raw bytes独立复算；任一解析、整秒或严格往返失败固定为`E2E_INPUT_INVALID/2`，且零SQLite、零`fixture-materialization.json`。

## 7. 三类摘要公式

### 7.1 OPL

唯一 owner 为 Java `org.opm.localruntime.golden.OplGoldenArtifactCanonicalWriter`：

```text
opl_sha256 = SHA256(writer.write(oplTextArtifact))
```

canonical bytes 必须是 writer 原样输出的 UTF-8 bytes；不得由 Node `JSON.stringify`、JCS 或文本字段重新拼接替代。Node verifier 只接受已验证 OPL raw artifact/ref，并以 parity fixture 对照，不自行发明第二 writer。

### 7.2 Trace

唯一 owner 仍为同一 Java writer：

```text
trace_sha256 = SHA256(writer.writeTraces(revisionId, traces))
```

Trace Bundle 的 revision、数组顺序、SourceRef 可选字段省略规则、TokenRange UTF-8 byte offset 和 NFC 归一完全沿用 `OplGoldenArtifactCanonicalWriter`。Trace 不并入 OPL artifact digest。

### 7.3 Token

新增 Java `TokenCanonicalWriter` 与 Node 对等实现，唯一 preimage Schema 为 `OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001/0.1`：

```text
token_preimage = {
  schema_id: "OPM-DEV-CANVAS-06-TOKEN-DIGEST-PREIMAGE-001",
  schema_version: "0.1",
  revision_id,
  tokens: [{token_id,sentence_id,ordinal,text,kind,start_utf8_byte,end_utf8_byte,source_refs}]
}
token_sha256 = SHA256(UTF8(JCS(token_preimage)))
```

Token 顺序沿 OPL sentence/token 产生顺序保留，不排序、不去重；所有文本 NFC 归一，SourceRef 可选字段缺失时省略而非写 `null`；偏移是 UTF-8 byte，`kind/source_kind` 使用现有枚举。JCS owner 仍为共享 safe-integer owner，Token writer 不得放宽浮点或复制 JCS。

## 8. Node/Java parity vectors

新增不可变 Catalog：

```text
catalog_id       = dev-canvas-06.token-digest-v01-parity
catalog_version  = 0.1.0
schema_id        = OPM-DEV-CANVAS-06-TOKEN-DIGEST-PARITY-VECTORS-001
```

Catalog 固定包含 3 个正向量和 4 个负向量：

- 正向：空 token 集、单个 ASCII token、Unicode 多 SourceRef token；
- 负向：非 NFC 字符、UTF-8 byte range 不闭合、safe integer 越界、未知 token/source kind。

每个正向量必须携带 `input_tokens`、`expected_preimage`、`expected_canonical_utf8_hex`、`expected_token_sha256`；每个负向量必须携带 `mutation`、稳定错误码和 JSON Pointer。Node/Java 必须比较 preimage、canonical bytes、SHA、错误码和 pointer；只通过 Schema 不能关闭 parity。

## 9. Builder/Verifier/Artifact 顺序

唯一顺序：

```text
ARGS -> MANIFEST_RAW -> MANIFEST_SCHEMA_0.2 -> MANIFEST_SEMANTIC
-> MANIFEST_TIME
-> PROFILE_TREE -> PROFILE_RAW_REFS -> PROFILE_BINDING_JOIN
-> DIRECT_PROFILE_LOAD -> FIXTURE_INPUT_RAW -> ACTIVE_BINDING -> FAULT_PLAN
-> JAR_CODE_SOURCE -> JAR_RAW_SOURCE_DIGEST
-> OUTPUT_FRESH -> MATERIALIZE/ATTEMPT
-> ARTIFACT_SCHEMA_0.2 -> ARTIFACT_INDEX -> DIGEST/PARITY
-> REPORT_PROJECTION
```

任一前置失败都不得创建 SQLite、Runtime、Browser、Attempt Artifact、Report 或 temporary success marker。Artifact verifier 只读，必须记录验证前后 attempt/report root tree digest 相等，不得修复、重写、补 ref 或生成 placeholder。

## 10. 验收

1. Manifest/Attempt Artifact `0.2`、ProfileAssetTree、Token preimage/parity Schema 均为 Draft 2020-12，所有 object `additionalProperties=false`；
2. Manifest 正例、缺 Profile 文件、extra、symlink、tree/raw SHA、binding drift 和旧 `0.1` 互用反例稳定拒绝；
3. Attempt Artifact `0.2` 正例闭合 11 root、Profile tree、5 raw refs、Index 条目和 package digest；`0.1` 不得误接收新字段；
4. OPL/Trace 使用 Java writer 的固定 bytes；Token 三个正向量与四个负向量 Node/Java parity 全部匹配；
5. builder/verifier/runner/materializer/artifact verifier 的参数、顺序、错误码、零输出和只读 tree digest 规则在实现规格/checklist中一致；
6. direct-root 正例只读取 `profile/assets` 五项文件；checkout fallback、extra/symlink/hardlink、Manifest drift 反例稳定拒绝；
7. `--input` 正例与 Manifest raw ref 逐 byte闭合，缺失/跨root/raw drift反例在 SQLite 前拒绝；
8. exact built JAR fork正例必须取得唯一`jar:nested:<outer>/!BOOT-INF/classes/!/` CodeSource并安全反解析同一外层JAR；`file:`、其他nested entry/链、test classpath、目录、其他JAR、非canonical URI或ref drift不得生成成功artifact；
9. `source_sha256`正例必须等于exact Runtime JAR raw SHA；`.class`、source-set、Manifest值、不同JAR及`source_sha256 != runtime_jar_ref.sha256`反例稳定拒绝；
10. `generated_at`整秒UTC canonical正例派生唯一`source_date_epoch`；`.000Z`、非零小数、`+00:00`、其他offset、非法值和无法严格往返的输入均以`E2E_INPUT_INVALID/2`在SQLite前拒绝；
11. 只运行 Schema/JSON/parity和文档一致性设计验证，不生成 CLI 成功路径、194/388、Report、Gate、Candidate、Activation 或 ISO 证据。

## 11. 状态边界

本规格完成表示 Profile 文件身份、Materializer input/JAR信任边界、Manifest派生确定性时间和 OPL/Trace/Token 摘要的设计输入已冻结，允许后继实现包进入 CLI/Materializer/Artifact verifier 实现。现有局部 Schema、writer 或 preflight 代码的实现状态只以对应 implementation checklist 的当前证据为准；本规格不表示活动 producer/consumer成功路径、E2E Runner、194/388、E2E READY Report、GATE-06-03、Candidate、Activation、Capability、生产发布或 ISO 符合性完成。

## 12. 回滚

只删除本修正新增的活动 `0.2` Schema、Token Schema/vector、规格、设计和 checklist；保留历史 `0.1` Schema/bytes、现有实现和未提交用户改动。不得覆盖现有 release root 或 Handoff/Intake。
