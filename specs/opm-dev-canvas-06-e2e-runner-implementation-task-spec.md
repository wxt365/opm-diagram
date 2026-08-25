# Spec: DEV-CANVAS-06 E2E Runner 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `backend-springboot`
- `design-module-docs`

## 1. 目标与唯一身份

实现 `GATE-06-03` 的独立 E2E Runner、Reporter、只读 semantic verifier 和 release Playwright 配置，只读消费已经通过验证的活动 E2E Manifest `0.2/0.2.0` 与 Attempt Artifact `0.2`，在 production build 与 exact Runtime JAR 上串行执行。历史 Manifest/Attempt Artifact `0.1` 仅作只读兼容输入，不得由活动 builder/runner 新写：

```text
194 = 178 Family + 16 Common case
388 = 194 * 2 fresh attempt
137 = 130 Family PASS + 7 Common PASS
57 = 48 Family BLOCKED + 9 Common BLOCKED
34 = capability_results
```

唯一活动Report身份升级为`0.2`；历史`0.1`只读且禁止新写：

```text
schema_id=OPM-DEV-CANVAS-06-E2E-REPORT-001
schema_version=0.2
runner_identity.runner_version=0.2.0
report_id=dev-canvas-06.e2e-report.<manifest-raw-sha256前12位>.<runner-source-set-sha256前12位>
```

本规格只读消费Manifest `0.2`、Common Fixture、Attempt Artifact `0.2`、活动Report `0.2`/Runner Source Set `0.1` Schema，不授权实现阶段修改这些契约，也不授权Visual runner、Performance、Recovery、Candidate、Activation、Capability enablement或ISO符合性声明。历史 `0.1` 输入只能由显式历史兼容入口读取，不能与活动 `0.2` 字段混用。

### 1.1 活动输入闭包（后继设计）

活动输入、Profile 文件身份和摘要算法以 `specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md` 与 `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md` 为唯一后继口径：

1. 所有活动 Manifest 消费者 CLI 必须显式接收 `--manifest` 和 `--profile-asset-root`；先读取 Manifest raw bytes，再校验 Manifest `0.2` Schema、Profile tree/raw refs，最后执行 SQLite/Runtime/Browser/Attempt 前置检查。Manifest builder 作为生产者只新增 `--profile-asset-root`，继续由 `--out`确定输出 Manifest；
2. `active_binding` 只表达语义 identity；五份 Profile 文件、tree digest 和每项 raw SHA 必须由 Manifest `0.2` 与 Attempt Artifact `0.2` 闭合；
3. OPL/Trace 摘要只能复用 Java `OplGoldenArtifactCanonicalWriter`，Token 摘要只能使用 Token JCS preimage、固定 canonical writer 和 Node/Java parity vectors；不得由 Runner/Node 自行拼接第二套 bytes；
4. `source_date_epoch`只由Materializer对Manifest原始`generated_at`执行`parseUtcWholeSecond`派生；Runner不新增时间参数、不读取当前时钟，也不规范化Manifest；
5. 本活动输入尚未被现有 CLI/Materializer/Artifact verifier 实现消费；在实现包完成前不得生成成功 Report、194/388 证据或 Gate 证据。

Fault Launcher 的活动执行输入唯一为 `specs/opm-dev-canvas-06-e2e-fault-launcher-design-closure-bugfix-task-spec.md` 与 `docs/design/opm-dev-canvas-06-e2e-fault-launcher-design.md v1.1`。Fault Plan `0.2` Schema和既有摘要不变；实现必须使用后继设计的九项命令行配置、raw nonce/challenge/HMAC、Plan raw SHA、Spring fail-closed装配、三个精确hook和协议错误码，不得从本规格旧文字发明第二套launcher语义。

Fault Launcher代码切片只允许按`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`的精确source delta、重建顺序和验收矩阵实施；本Runner规格不额外授权修改Java、Spring资源、Common fixture或release root。

Common Driver的16项动作、selector、有序API/error、SETUP baseline和controlled JAR/Web/attempt编排唯一由`docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.2`及其实现规格承接。Manifest v02 producer/verifier、第四driver和活动Report `137/57`修正唯一由`opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md`承接；本规格不得保留第二套映射或旧`146/48`算法。

## 2. 权威输入与前置条件

1. `opm-dev-canvas-06-e2e-manifest-v02.schema.json/0.2`与 `specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md` 是活动 Manifest 输入唯一口径；历史 `opm-dev-canvas-06-e2e-manifest.schema.json/0.1` 只读；`opm-dev-canvas-06-e2e-report.schema.json/0.1`为历史只读，活动producer/verifier目标为`opm-dev-canvas-06-e2e-report-v02.schema.json/0.2`；
2. `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md` 和 `opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json/0.2` 是活动 Profile asset tree/raw ref、11类attempt JSON、Artifact Index、摘要和 verifier 顺序的唯一口径；`docs/design/opm-dev-canvas-06-e2e-attempt-artifact-design.md v1.3`与 Schema `0.1`仅为历史兼容；
3. `opm-dev-canvas-06-e2e-family-fixture-identity-catalog.schema.json/0.1`及活动Catalog`0.1.0`是Family Project identity与base fixture逐项绑定的唯一口径；
4. `opm-dev-canvas-06-e2e-runner-source-set.schema.json/0.1`是Runner source allowlist、顺序、排除和aggregate的唯一机器口径；
5. `specs/opm-dev-canvas-06-e2e-manifest-v01-builder-implementation-task-spec.md`只保留历史信任链/目录基础；活动 Manifest `0.2`输入、Profile raw ref和版本边界唯一以后继 Profile/Digest closure 规格为准；
6. E2E Manifest v02 builder/verifier必须完成Family Identity Catalog raw ref、178 -> 2集合、fixture deep join及Profile tree/raw/package/binding join；历史 v01 `23/23`不得满足本活动前置条件；
7. Manifest final root必须完整包含exact `local-runtime.jar`、production `web-dist/**`、Intake/Handoff/Evidence Bundle raw copy、Family Identity Catalog、上游fixture、Common Fixture/Factory、Profile五资产和四个driver；
8. Playwright固定`1.57.0`，Chromium固定`143.0.7499.4`，`workers=1`、`retries=0`；
9. locale=`zh-CN`、timezone=`Asia/Shanghai`、color scheme=`light`、reduced motion=`reduce`、device scale factor=`1`；
10. production run的source checkout必须clean，HEAD等于Manifest `source_build.source_commit`；Runtime JAR和Web dist只从Manifest final root读取，不从checkout重建；
11. production gate在运行前、中、后均保持`DISABLED + []`。

缺 production Manifest、浏览器实体或 clean environment 不阻断代码和受控测试，但阻断 production Report 与 `GATE-06-03`。

## 3. Owner 与修改边界

| Owner | 唯一职责 | 禁止职责 |
| --- | --- | --- |
| `scripts/release-canvas06-e2e-run.mjs` | CLI、信任预检、attempt 编排、原子提交和 Report writer | 修改 Manifest/fixture、启动 dev server、提升 Gate |
| `scripts/verify-canvas06-e2e-report.mjs` | 通过必填 `--scope REPORT/ATTEMPT` 分别校验完整Report或单Attempt；按活动 Profile/Digest closure、Attempt Artifact `0.2`、Family Identity Catalog和Report `0.2`校验filename/schema identity、Profile/Java/source ref、Projection/OPL/Trace/Token Digest、`10+1+5` Index、聚合和tree digest | 自动推断scope、修复/补写证据、执行case、生成Candidate |
| `scripts/canvas06-e2e-attempt-artifacts.mjs` | 既有23项Source Set内的Attempt writer/verifier公共owner与Node Token canonical writer | 放宽JCS、复制Java OPL/Trace writer、产生第二摘要公式 |
| `scripts/canvas06-projection-digest-v01.mjs` | 按Projection Digest `0.1`把正式response data规范化为safe-integer JCS preimage并计算SHA | 修改Projection、放宽JCS值域、排序array、提供float策略 |
| `scripts/canvas06-e2e-production-web.mjs` | 从 exact `web-dist` 提供 loopback production static/SPA 和 loopback Runtime proxy | Vite/HMR、外网代理、目录列表、写 dist |
| `tests/e2e/release/dev-canvas-06/playwright.release.config.ts` | 固定 browser/context/timeouts/worker/retry/trace 规则 | `webServer` 自动构建、复用已有 server、dev server |
| 三个 Family driver | 按 Manifest `driver_id` 执行 Procedural/Control/Structural UI 动作 | 自行解释 Rule、修改 expectation、写 Report |
| `common-driver.mjs` | 封闭映射 16 个 Common case 到真实 UI/API 动作，并作为Manifest `driver_catalog[3]`的exact source | 自行解释Rule、修改expectation或从checkout fallback |
| E2E Fixture Materializer CLI | 在 fresh attempt storage 中物化 exact Family base 或确定性 Common 空模型 | Web/API 暴露、非空 storage 写入、生产默认装配 |
| E2E test launcher/fault port | 只在受控启动 guard 下安装 Common fault plan | 公共 route、普通生产启动生效、持久化测试开关 |

允许未来实现修改：上述 owner、其共享 helper/定向测试、为 non-web materializer/test launcher 所需的最小 Java 代码、`package.json` 的四个 E2E release 命令和对应状态文档。

禁止修改：历史 E2E Manifest/Attempt Artifact `0.1`、活动 Manifest/Attempt Artifact `0.2`、Report `0.2`、Runner Source Set `0.1`、Common/Visual Schema，OpenAPI/公共HTTP wire，SQLite DDL/migration，Profile/Rule/Grammar/Symbol/Handoff，Vue业务行为和production gate默认值。不得复制`GoldenFixtureSeedRepository`语义写入逻辑；应抽取或复用同一受控seed kernel。

## 4. 完整 CLI

### 4.1 Production run

```text
npm run release:canvas06:e2e:run -- \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读handoff_bundle_root> \
  --intake-report <handoff-root内相对READY intake path> \
  --manifest-root <只读E2E Manifest final root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --profile-asset-root <只读Profile asset tree根目录> \
  --source-root <clean target checkout> \
  --java-home <JDK 21 home> \
  --browser-executable <Chromium 143.0.7499.4普通文件> \
  --runtime-port <1024..65535> \
  --web-port <1024..65535且不等于runtime-port> \
  --output-root <production evidence_output_root> \
  --out dev-canvas-06/e2e/reports/<report-id>/dev-canvas-06-e2e-report.json \
  --require-production
```

### 4.2 Controlled run

```text
npm run release:canvas06:e2e:run -- \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读canvas06-controlled-identity root> \
  --manifest-root <只读controlled E2E Manifest final root> \
  --manifest dev-canvas-06-e2e-manifest.json \
  --profile-asset-root <只读Profile asset tree根目录> \
  --source-root <clean target checkout> \
  --java-home <JDK 21 home> \
  --browser-executable <Chromium 143.0.7499.4普通文件> \
  --runtime-port <1024..65535> \
  --web-port <1024..65535且不等于runtime-port> \
  --output-root <fresh controlled output root> \
  --out dev-canvas-06/e2e/reports/<report-id>/dev-canvas-06-e2e-report.json
```

### 4.3 Verifier

```text
npm run release:canvas06:e2e:verify -- \
  --scope REPORT \
  --input-mode PRODUCTION_HANDOFF \
  --handoff-root <只读handoff_bundle_root> \
  --intake-report <handoff-root内相对READY intake path> \
  --evidence-root <production evidence_output_root> \
  --manifest-root <只读E2E Manifest final root> \
  --manifest <Manifest root内相对Manifest路径> \
  --profile-asset-root <只读Profile asset tree根目录> \
  --report dev-canvas-06/e2e/reports/<report-id>/dev-canvas-06-e2e-report.json \
  --require-production \
  --require-ready

npm run release:canvas06:e2e:verify -- \
  --scope REPORT \
  --input-mode CONTROLLED_TEST \
  --controlled-bundle-root <只读canvas06-controlled-identity root> \
  --evidence-root <controlled output root> \
  --manifest-root <只读controlled E2E Manifest final root> \
  --manifest <Manifest root内相对Manifest路径> \
  --profile-asset-root <只读Profile asset tree根目录> \
  --report dev-canvas-06/e2e/reports/<report-id>/dev-canvas-06-e2e-report.json
```

每个参数只能出现一次。未知、缺失、重复、空值、`--x=y`、位置参数、两个模式参数互用、production 缺 `--require-production`、controlled 带 `--require-production/--require-ready` 均在读取 browser/JAR 或创建 staging 前退出 `2`。不提供 `--force-ready/--skip/--retry/--reuse-server/--update-fixture/--ignore-digest`。

## 5. 输入信任链与可报告边界

### 5.1 Preflight 顺序

Runner 必须按以下唯一顺序执行，first failure 后不继续：

```text
ARGS -> INPUT_CLASS -> EXTERNAL_TRUST -> MANIFEST_RAW -> MANIFEST_SCHEMA_0.2
-> MANIFEST_SEMANTIC -> PROFILE_TREE -> PROFILE_RAW_REFS -> PROFILE_BINDING_JOIN
-> SOURCE_ROOT -> RUNNER_SOURCE_SET -> JAVA -> BROWSER -> PORT_LOCK
-> OUTPUT_FRESH -> REPORT_ID
```

1. production 复用 Manifest verifier 的 READY Intake -> exact Handoff -> Evidence Bundle 链并强制 `--require-production`；Manifest 必须来自显式 `--manifest` raw ref，不能由 basename、目录扫描或 active binding 反推；
2. controlled 复用 descriptor/identity/`approved_version_ref=null` 和三份 raw ref 链；
3. Manifest `0.2` raw/schema/semantic verifier 和 Profile tree/raw ref verifier 必须在 Runner 读取任何 case 前通过，且 verifier 前后 Manifest/Profile root tree digest 相等；Profile preflight 失败统一为 `E2E_MANIFEST_PROFILE_ASSET_INVALID/3`，SQLite、Runtime、Browser、Attempt 和 Report 均为零输出；
4. `source-root` clean HEAD、lockfile、Node/Playwright、runner source set 必须与 Manifest target source commit 闭合；
5. Java必须来自`--java-home/bin/java`或Windows `java.exe`，入口和realpath都必须是non-symlink普通可执行文件、major=`21`，并按第6.1节生成byte mirror/version/release refs；browser realpath必须是non-symlink普通文件，版本=`143.0.7499.4`，SHA在environment artifact中记录；
6. 两个端口只允许 `127.0.0.1`，Runner 对完整 run 持有排他 lock，启动前必须无 listener；禁止连接或终止未知已有进程；
7. final report root、同 ID staging 和同 ID crash residual 必须不存在。

上述任一失败都是 `pre-acceptance rejection`：稳定 stderr、退出码 `2/3/4`，final Report root、Report 和 attempt artifact 均不存在。

### 5.2 Run acceptance

只有 Preflight 全部通过、输入副本写入 staging 并再次逐 byte 校验后，run 才进入 `ACCEPTED`。ACCEPTED 后必须尝试执行全部 `388` attempt；单 case 失败不得停止后续调度。Family Project identity必须从Manifest锁定的Catalog取得，attempt ordinal必须从已验证Fault Plan取得；只有每个 attempt 都取得真实 fixture identity、Project/Model/base/head identity 和完整 artifact index，才允许写 Schema-valid Report。

进程崩溃、强停、磁盘耗尽或基础设施故障导致任一 attempt 缺必填真实 identity 时，不得用占位值补齐 Report；final Report root必须不存在。正常可归类的 case/assertion 失败在全部 `388` attempt 完成后写 `BLOCKED` Report。

## 6. 自包含 Report transaction root

```text
<output-root>/dev-canvas-06/e2e/reports/<report-id>/
  dev-canvas-06-e2e-report.json
  inputs/
    manifest/dev-canvas-06-e2e-manifest.json
    build/**
    raw/**
    upstream/**
    profile-assets/**
    common/**
    drivers/**
    runner/runner-source-set.json
    runner/<allowlisted runner/helper/config source>
    runner/toolchain/java/<java-executable-sha256>/
      java|java.exe
      java-version.txt
      release
  attempts/<percent-encoded-case-id>/<attempt-ordinal>/
    fault-plan.json
    fixture-materialization.json
    attempt-observation.json
    runtime-process.json
    browser-environment.json
    network-observation.json
    console-errors.json
    reopen-observation.json
    transaction-observation.json
    api-exchanges/index.json
    api-exchanges/*.json
    stdout/*.log
    stderr/*.log
    failure/**
    artifact-index.json
```

1. `inputs/build|raw|upstream|common|drivers` 是 Manifest final root 对应目录的逐 byte 副本，内部 path 保持不变，因此 Report `intake_report_ref/handoff_ref/source_build` 可与 Manifest 深度相等；
2. `inputs/manifest` 保存 exact Manifest raw bytes；Report `manifest_ref` 指向该副本；
3. 所有 Report file ref 相对 final Report root，禁止 `..`、absolute、symlink、hardlink、socket、device、FIFO 和 extra；
4. `runner-source-set.json`必须通过Runner Source Set `0.1` Schema，23项顺序严格等于Schema `prefixItems`，不得排序、扫描或增删；Report `runner_identity.runner_source_sha256`等于其`source_set_sha256`，`runner_source_set_ref`指向该raw文件；
5. case path 使用 Manifest builder 相同的 UTF-8 byte percent encoding，除 ASCII 字母数字、`.`、`-`、`_` 外逐 byte 大写 `%HH`；
6. attempt root 全部进入同一 Report staging/final transaction，不得先把 attempts 提交到共享 `e2e/attempts` 再拼 Report。

### 6.1 Java executable mirror/ref

1. preflight对实际`java`入口和realpath执行lstat、普通文件、非symlink、可执行和raw SHA检查；运行`java -version`必须exit 0、stdout为空、stderr证明major 21，同时读取同一Java home下普通文件`release`；
2. 以实际executable raw SHA作为目录名，把executable原始bytes逐byte复制到`inputs/runner/toolchain/java/<sha>/java`或`java.exe`，把`java -version`原始stderr写入`java-version.txt`，把`$JAVA_HOME/release`原始bytes复制为`release`；三项均必须是普通文件、无链接并逐raw SHA复核；
3. mirror只作为不可变证据，不从移动后的路径执行；每次Runtime启动前重新复算原始executable raw SHA并要求仍等于mirror ref；实际执行路径变化或bytes变化立即成为`E2E_ENVIRONMENT_MISMATCH`且final Report零输出；
4. Report `runner_identity.java_executable`严格使用Report `0.2` Schema，`image_payload_sha256=sha256(UTF8(JCS(除自身外完整java_executable对象)))`；目录SHA必须等于`mirror_ref.sha256`；
5. 全部`runtime-process.cycles[].java_ref`必须逐字段等于`mirror_ref`，`normalized_command[0]`固定写`<E2E_JAVA_EXECUTABLE_MIRROR>`而不是绝对path；verifier反查实际执行日志、version/release refs和全部388 attempt，不允许第二Java identity；
6. Java mirror、version/release文件不进入runner source set，也不等于Runtime JAR。其存在只证明执行工具链bytes，不证明该JDK适用于其他OS/arch。

### 6.2 Runner source set精确集合与排除

唯一文件为`inputs/runner/runner-source-set.json`，Schema为`OPM-DEV-CANVAS-06-E2E-RUNNER-SOURCE-SET-001/0.1/0.1.0`。`entries[]`恰为Schema固定的23项prefixItems；每项从clean `source-root`读取普通非链接文件并逐byte镜像到`inputs/runner/<same-path>`，entry对源文件和镜像文件raw bytes同时成立。

```text
source_set_sha256 = sha256(UTF8(JCS({
  schema_id,schema_version,source_set_version,selection_policy,
  entries,excluded_classes
})))
```

preimage排除`source_set_sha256`自身。集合选择只能逐项读取Schema allowlist，禁止glob、目录递归、Git tracked set、import graph、mtime或“目录内所有`.mjs`”动态发现。`selection_policy=EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED`表示任何未列路径均被排除；`excluded_classes[]`只做审计说明，不授权从对应目录扫描。

明确排除：除上述4个release Playwright config/driver外、所有不在entries内的测试/spec，以及fixture/template/Catalog/vector、契约Schema/reference、Manifest builder-only source、产品前后端source、依赖/build output、Java/browser镜像、Report输入/attempt/release artifact、VCS/dirty patch及所有链接/特殊文件。产品Java/Vue身份分别由exact Runtime JAR/Web dist ref承接；`package-lock.json`由`source_build.lockfile_sha256`承接，不得重复混入source set。

## 7. Production Runtime 与 Web 启动协议

每个 attempt 使用新的 Runtime、production Web server、Chromium process/context 和 storage；重开阶段再使用第二组新进程读取同一 storage。

普通 INITIAL/全部 REOPEN 的 Runtime 唯一命令模板：

```text
<verified-original-java> -jar inputs/build/local-runtime.jar
  --server.address=127.0.0.1
  --server.port=<runtime-port>
  --opm.storage.root=<attempt-root>/storage
```

只有三个故障case的`INITIAL` cycle使用Fault Launcher设计`v1.1`第4.1节完整命令，且九项`opm.release.e2e.*`参数必须全部来自命令行。其余191个`NONE` INITIAL与全部194个REOPEN不得携带fault profile或任一fault键。

Web 唯一命令模板：

```text
<source-root-node> inputs/runner/scripts/canvas06-e2e-production-web.mjs
  --root inputs/build/web-dist
  --host 127.0.0.1
  --port <web-port>
  --runtime-origin http://127.0.0.1:<runtime-port>
```

1. Web server 只提供普通 production assets、SPA fallback，并把 `/api/**`、`/opm-bootstrap.js` 代理到 exact Runtime；禁止 Vite、HMR、source map directory listing、缓存写入和外网 upstream；
2. Fault Launcher必须按后继设计的固定首错顺序闭合active profile、九项命令行参数、fresh storage、Plan single-link/raw SHA/Schema/payload/semantic identity和parent nonce/challenge HMAC后才装配attempt-local port；普通`java -jar`只装配`E2EFaultPort.NOOP`，partial、unknown、非命令行来源或production配置必须启动失败，禁止静默fallback；
3. Runner 轮询 Runtime `/actuator/health`，必须在 `120000 ms` 内得到连续三次、间隔 `200 ms` 的 `UP`；Web 必须在 `60000 ms` 内使 `/`、`/opm-bootstrap.js` 和 HTML 引用的全部 JS/CSS 返回 `200`；
4. browser 只访问 `http://127.0.0.1:<web-port>`，不直接读取 `file:` 或 Runtime origin；
5. 每阶段正常停止等待 `10000 ms`，确认 health 不可达、端口无 listener、无 runner-owned 子进程后才进入下一阶段；不得 kill 未通过 PID/parent nonce 证明的进程。

## 8. Fixture 到 storage 的唯一映射

### 8.1 Family `178`

1. `fixture_ref` 必须是 Manifest final root 中已验证的 exact `MS-REV-001/0.2` base Revision；
2. non-web E2E Fixture Materializer 复用 Golden Materializer 的 migration、binding 校验、Revision writer 和不含Project派生的seed kernel；Project只读取Family Identity Catalog，Model/Revision/Context/construct读取fixture并与Catalog深度校验后写入 fresh SQLite；
3. materializer 禁止生成、派生或默认业务 ID，禁止调用Golden `project.golden.fixture.<sha256>`公式、归一化 fixture bytes、调用公共 Web API 或写 Materialization Report；它只写 attempt-local `fixture-materialization.json`；
4. 写后必须读取 Project/Model/Head/Revision/Projection/Text/Trace 与 fixture expected digest 比较，SQLite `quick_check=ok`、foreign key violation=`0` 后才能启动 Runtime。

Materializer 唯一命令模板为：

```text
<verified-original-java>
  -Dloader.main=org.opm.localruntime.releaseevidence.E2EFixtureMaterializerCli
  -cp inputs/build/local-runtime.jar
  org.springframework.boot.loader.launch.PropertiesLauncher
  --guard RELEASE_E2E_ONLY
  --fixture-kind FAMILY|COMMON
  --case-id <Manifest case_id>
  --fixture <attempt-local exact fixture copy>
  --family-identity-catalog <attempt-local exact catalog copy，仅FAMILY>
  --manifest-root <attempt-local只读输入根>
  --manifest <manifest-root内相对Manifest路径>
  --input <attempt-local exact input raw file>
  --profile-asset-root <attempt-local已验证Profile asset root>
  --binding <attempt-local active-binding.json>
  --fault-plan <same-attempt-root/fault-plan.json>
  --storage <fresh attempt-root/storage>
  --out <attempt-root/fixture-materialization.json>
```

子进程 working directory 固定为当前 attempt root，因此命令中的 `inputs/build/local-runtime.jar` 只能解析到该 attempt 的物理文件。Runner 必须先把 Manifest raw source 保留在 `--manifest-root/<input_ref.path>`，再逐 byte 复制为固定 `--input=<attempt-root>/inputs/materializer/input.raw`；两者不得是同一路径或同一 inode。

命令不得新增`--source-date-epoch`或任何时间环境变量/系统属性。Runner只传递Manifest原始文件及既有`--manifest-root/--manifest`定位参数；时间语义由Materializer读取Manifest raw bytes后独立验证和派生。

Materializer 唯一 preflight 顺序为：`ARGS -> GUARD -> MANIFEST_RAW/SCHEMA/CASE -> MANIFEST_TIME -> PROFILE_TREE/RAW/BINDING -> FIXTURE/INPUT_RAW -> ACTIVE_BINDING -> FAULT_PLAN -> JAR_CODE_SOURCE -> STORAGE_FRESH -> SQLITE`。first failure 后停止，SQLite前任一阶段失败均为零 SQLite、零 `fixture-materialization.json`。

Profile 装配只能调用 `FileProfilePackageLoader.forVerifiedDirectPackageRoot(<attempt-root>/profile/assets, verifiedSet)`；direct 模式只接受 Manifest已验证的五个文件，禁止父目录搜索、checkout/classpath/JAR resource/环境/系统属性/安装目录fallback，并继续交给既有 `ProfilePackageAssembler`完成Manifest、Rule/Grammar/Symbol/Normalization和Capability校验。

`--input`对`FAMILY/COMMON`均必填。Materializer必须自行打开Manifest source和Materializer copy两个不同的single-link普通非链接文件，要求二者均位于attempt root、`Files.mismatch=-1`，并以source raw bytes完成length/SHA闭合；输出`input_ref`逐字段复制Manifest对象。不得以Runner已验证、路径名或已解析JSON代替；path错误为`E2E_INPUT_INVALID/2`，raw/ref drift为`E2E_FIXTURE_MISMATCH/3`。

Materializer必须对Manifest原始`generated_at`执行唯一算法：`instant=Instant.parse(text)`、`instant.getNano()==0`、`source_date_epoch=instant.getEpochSecond()`，并要求原始`text`逐code point等于`Instant.ofEpochSecond(source_date_epoch).toString()`。只有大写`Z`结尾且无小数部分的UTC整秒可接受；`.000Z`、非零小数、`+00:00`、其他offset、空白、大小写变化、非法或解析后被归一化的值固定为`E2E_INPUT_INVALID/2`。派生epoch只在进程内传给Family/Common seed kernel，所有SQLite确定性时间写为同一`Instant.toString()`；不得写入新的Manifest/Attempt字段。Attempt verifier从同一Manifest raw bytes独立复算并验证SQLite时间。任一失败发生在storage创建前，零SQLite、零`fixture-materialization.json`。

JAR identity只能来自当前进程`E2EFixtureMaterializerCli` protection-domain CodeSource。设`expected_outer=absoluteNormalize(<attempt-root>/inputs/build/local-runtime.jar)`、`expected_raw_path=expected_outer.toUri().getRawPath()`，唯一合法external form固定为：

```text
expected_code_source = "jar:nested:" + expected_raw_path + "/!BOOT-INF/classes/!/"
```

`CodeSource.location.toExternalForm()`必须逐code point等于`expected_code_source`。只有外层`jar:`、内层`nested:`、唯一entry `BOOT-INF/classes/`和最外层固定`!/`合法；`file:`、`jar:file:`、裸`nested:`、`BOOT-INF/lib/*.jar`、其他entry、额外nested链、query、fragment、authority、test classpath、`target/classes`或其他JAR全部拒绝。

外层physical JAR只能在完整字符串精确匹配后解析：各移除一次固定前缀`jar:nested:`和固定后缀`/!BOOT-INF/classes/!/`得到`raw_outer_path`；构造`URI.create("file:" + raw_outer_path)`，要求scheme精确为`file`、authority/query/fragment为空、`getRawPath()`逐字等于`raw_outer_path`；随后只允许`Path.of(fileUri)`单次解码。解析所得absolute normalized lexical path必须等于`expected_outer`，两者`toRealPath()`也必须相等。禁止按首个`!`截断、循环剥离prefix、手工/重复URL decode、basename搜索、classpath/checkout扫描或任何fallback。

解析出的outer必须是attempt-local single-link普通非链接文件，raw ref逐字段等于Manifest `source_build.local_runtime_jar`并写入`materializer_identity.runtime_jar_ref`。任一CodeSource形态、entry、URI、lexical/real path、link或ref drift为`E2E_ENVIRONMENT_MISMATCH/3`。成功集成测试必须用JDK 21 fork exact built Spring Boot JAR，并通过`PropertiesLauncher`加载Materializer；禁止JUnit/Maven/IDE classpath直接产生成功artifact。

`materializer_identity.source_sha256`唯一等于上述exact code-source JAR从offset 0到EOF的raw file SHA-256，并必须等于`materializer_identity.runtime_jar_ref.sha256`。producer必须在同一文件句柄上完成一次length/SHA观测并同时填充ref和source字段；禁止读取或摘要`.java`、Runner Source Set、单个/多个`.class` entry、classloader resource、Manifest SHA字符串、CLI path字符串或其他JAR。采用完整JAR是因为Materializer行为跨入口嵌套class、direct loader、assembler及其依赖；单entry不封闭行为，Java source-set又没有attempt-local mirror/ref且会引入checkout信任。

Attempt verifier必须重新只读打开`runtime_jar_ref.path`，复算raw length/SHA，并依次比较Manifest `source_build.local_runtime_jar`、`runtime_jar_ref`、`source_sha256`。字段/path非法返回`E2E_INPUT_INVALID/2`；文件、length、SHA、三方join、前后metadata或`source_sha256 != runtime_jar_ref.sha256`返回`E2E_ENVIRONMENT_MISMATCH/3`。verifier不得使用producer缓存值或任何fallback，且验证前后attempt/report tree digest必须相等。

`FAMILY` 只接受 `MS-REV-001/0.2`，且Catalog raw ref必须是Manifest `fixture_refs[]`中唯一`kind=FAMILY_FIXTURE_IDENTITY_CATALOG`项；`COMMON` 禁止携带该参数且只接受第8.2节验证后的 BASE JSON。两类都必须先读取同attempt root已Schema/payload验证的Fault Plan，从其中取得`case_id/attempt_ordinal`，再与CLI、Manifest schedule交叉校验；CLI不提供`--attempt-ordinal`。

Family Catalog必须通过`OPM-DEV-CANVAS-06-E2E-FAMILY-FIXTURE-IDENTITY-CATALOG-001/0.1` Schema和payload SHA；178个Family case的`fixture_ref`深度去重集合当前恰为2，并与Catalog SHA集合一一相等。每项固定校验`fixture_sha256=sha256(raw fixture)`、`model_id=fixture.model_id=fixture.model_header.model_id`、`context_id=fixture.model_header.root_context_id`、`base_revision=fixture.revision_id`和`revision_sequence`；fixture存在可选`parent_revision_id`时Catalog取其字符串，字段缺失时Catalog必须为显式`null`。`project_id`只取Catalog。缺项、额外、重复、SHA/字段或parent归一值drift、`project.golden.fixture.*`/`project.recovery.*`命名空间统一为`E2E_FIXTURE_MISMATCH/3`和零SQLite。

### 8.2 Common `16`

Common Fixture 的唯一选择是 direct SQLite materialization，不允许 Runner 临时在 Runtime/API 与 SQLite 之间选择：

1. Node 必须从 Manifest root import exact `common-fixture-factory.mjs`，调用 `e2eFixture(case_id)`；`JCS({...output,fixture_kind:"BASE"})` 必须等于 `base_fixture_ref` 的 JCS，`JCS({...output,fixture_kind:"INPUT"})` 必须等于 `input_ref` 的 JCS，factory/source/ref 任一不符即拒绝；
2. Materializer 只用 base fixture 的 `case_id/project_name/model_name/initial_revision` 和 active binding 创建空模型；固定 identity seed 为 `sha256(UTF8(case_id))`；
3. `project_id=project.e2e.<seed前16位>`、`model_id=model.e2e.<seed前16位>`、`context_id=context.e2e.<seed前16位>`，Revision ID 必须精确使用 fixture `initial_revision`；两个 attempt 使用相同业务 identity但不同 storage path；
4. initial Revision 固定为 active binding 下、仅包含 root Context、无 construct/fact 的合法 `MS-REV-001/0.2`；其 canonical digest 由 materializer 写入 artifact 并由 verifier复算；
5. input fixture 只提供 case/action expectation，不直接写 SQLite；后续状态只能由 `common-driver.mjs` 经真实 UI 和既有 `/api/v1` wire产生；
6. 历史Common Factory/Catalog `0.1.0` bytes不修改；活动Catalog固定`0.2.0`，`common-driver.mjs`同时由Runner Source Set和Manifest `driver_catalog[3]` raw ref锁定，两者必须指向同一source bytes。

### 8.3 故障 case

`ASSET_MISSING/PERSISTENCE_FAILED/READONLY`只能由Fault Launcher设计`v1.1`规定的attempt-local port触发；禁止seed状态、删除/移动/chmod资产、SQLite`query_only`、修改表数据、Controller短路或复用Recovery强停hook。`REVISION_CONFLICT/STALE_OPTION/STALE_TOKEN/MISMATCHED_TOKEN`按Common Driver设计的受控先行动作或单次request mutation产生；三类fault的kind/target/trigger、NONE映射、`plan_sha256` preimage、nonce、原子先写和ordinal唯一来源继续由活动union Schema`0.2`保持。九个Common BLOCKED case的空码/错误码唯一以Common Driver设计第2.3、5章为准，修正并重建raw refs前不得生成production Report。

## 9. Driver 接口与执行映射

四个 driver module 必须实现同一封闭接口：

```text
driver_id
driver_version = "0.1.0" (Family) | "0.2.0" (Common)
case_ids[]
executeCase({page, case_entry, attempt_identity, observation_sink}) -> void
```

1. Family `PROC/CTRL/STRUCT` 只能分别使用 Manifest `driver_catalog[0/1/2]` 的 exact source；`driver_id`、family、case capability prefix 和 source SHA 必须一致；
2. Common driver 的 `case_ids[]` 必须与 Common Catalog 16 项同序、无缺项/重复/额外；每个 ID 只有一个 handler；
3. driver 通过可访问的 tool icon、candidate catalog、inspector、State editor、OPL/Trace pane 和正式反馈执行动作；禁止直接调用 Pinia/private component method 或在 page 中注入业务状态；
4. 为捕获事务/Projection/Text/Trace，Runner可以在同源网络层记录正式API request/response；业务动作由浏览器真实交互触发，只有Common设计明确列出的三种单次request mutation和两种正式precondition API动作可由封闭client执行，且必须保留before/after raw evidence；fixture seed是唯一允许的预运行直接SQLite写入；
5. expected status、error、transaction、assertion IDs 只从 Manifest/Common Catalog读取，driver不得根据 observed 结果改写。

## 10. 稳定等待、网络与浏览器策略

Release config 固定：`fullyParallel=false/workers=1/retries=0/timeout=120000`，禁止 `test.only/test.skip/fixme`。每个 attempt 使用 Manifest viewport、`zoom=100%`、新 browser process、新 context、新 page、空 cache/storage/cookie/service worker。

浏览器 launch args 至少固定包含：

```text
--disable-background-networking
--disable-component-update
--disable-default-apps
--disable-extensions
--disable-sync
--no-first-run
--no-default-browser-check
```

稳定等待不能只使用 `networkidle` 或固定 sleep，必须同时满足：

1. `document.readyState=complete`、`document.fonts.ready`；
2. workbench shell、canvas、inspector 和 OPL pane 可见；
3. 最近 mutation response 已完整到达，response Revision 等于 workspace、URL 和可见 revision；
4. Projection 与 Text/Trace endpoint 均返回同一 Revision；
5. 同源活动请求为 `0` 持续 `500 ms`，再经过两个 `requestAnimationFrame`；
6. action-specific expected selector/feedback 到达终态。

Browser route 只允许目标 `127.0.0.1:<web-port>` 和代理后的同源请求。任何非 loopback、不同端口、`file/data/blob` 导航、WebSocket/HMR、service worker、download、popup、permission request 或未知 3xx/4xx/5xx 都写入 network artifact 并使 attempt FAILED；测试框架生成的内部 `about:blank` 仅在首次导航前允许。

## 11. 每 attempt 机器证据

所有 JSON 使用 UTF-8、LF、结尾换行和 RFC 8785 JCS digest。活动 `0.2` 的 11 类 root、Profile tree/raw refs、全部嵌套对象、file/schema identity、三类fault条件、Family Catalog/Family/Common materialization、Runtime INITIAL/REOPEN、Browser环境、Network/Console/API、Transaction/Reopen、Artifact Index 16 个必需 kind 及 Report 投影，全部只以 `docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md`、Family Identity Catalog `0.1/0.1.0` 和 `opm-dev-canvas-06-e2e-attempt-artifact-v02.schema.json/0.2` 为准。历史 `v1.3/0.1` 只读。

正式Projection是普通JCS公式的唯一数值适配例外：materialization、before/after/reopen和semantic comparison中全部Projection SHA必须调用`docs/design/opm-dev-canvas-06-projection-digest-closure-design.md v1.0/0.1`。Node与Java实现读取同一`projection-digest-v01-parity-vectors.json`，对4个正向量执行input bits -> runtime value -> preimage -> canonical bytes -> SHA全链路比较，并对9个负向量比较稳定code/pointer。禁止默认decimal string、取整、容差、数组排序、忽略unknown字段或放宽共享JCS owner。

Runner和verifier必须按固定文件名选择预期root identity，不能只验证union后接受文件放错位置。每个artifact携带`artifact_payload_sha256`；attempt 1/2 的`semantic_comparison_digest`排除PID、端口、时间和路径并必须相等。活动 `artifact-index.refs[]`必须各恰好包含一个10类核心artifact、一个 `PROFILE_ASSET_TREE` 和五个 `PROFILE_ASSET`，且不含自身；Profile 条目按 UTF-8 path 排序并与 Manifest raw refs 深度相等，Report attempt `artifact_refs[]`固定由Index投影。API raw body保持正式wire bytes并由OpenAPI/Revision Schema验证，不套用Runner artifact wrapper。缺失、extra、跨attempt、ref/SHA不等、Profile binding drift 或identity不可信时禁止生成占位Report。

`source_date_epoch`不进入Attempt Artifact Schema；verifier必须从Manifest raw bytes独立执行严格往返，再验证Project/Model/Revision/Head等SQLite seed时间均等于canonical `Instant.toString()`。不得因semantic digest排除时间而跳过该检查。

## 12. Report 字段唯一映射

| Report 字段 | 唯一来源 |
| --- | --- |
| `schema_id/schema_version` | 固定 `OPM-DEV-CANVAS-06-E2E-REPORT-001/0.2`；`0.1`只读不新写 |
| `report_id` | 第1节公式；同时是 final root basename |
| `generated_at` | 全部 attempt 结束后的实际 UTC 时间 |
| `runner_identity` | actual Node/Playwright/Chromium/OS、规范化CLI、source commit、23项runner source set ref/aggregate及Java executable mirror/version/release refs |
| `manifest_ref` | `inputs/manifest/dev-canvas-06-e2e-manifest.json` raw ref |
| `intake_report_ref/handoff_ref` | 与 Manifest对应 ref深度相等 |
| `upstream_source_build/source_build` | 与 Manifest深度相等 |
| `environment` | browser environment artifact复算；policy字段与 Manifest相等 |
| `case_results[]` | 与 Manifest `cases[]` 同序一对一；每项只读聚合两个 attempt observation |
| `capability_results[]` | Intake 34项顺序；只聚合对应 family case，不含 Common |
| `summary` | 从 `case_results[]` 重算，禁止读 Manifest summary observed字段 |
| `failures[]` | 按 case顺序、attempt ordinal、失败优先级稳定排序 |
| `limitations[]` | 至少声明环境适用范围、未证明其他硬件、未证明 ISO 19450:2024 符合性 |

Attempt 字段映射：`fixture/input SHA`、Project/Model、base/head、observed status、transaction、reopen 和 artifact refs 只能来自已验证 artifact。`status` 由第13节算法产生，不能信任 driver 自报。

## 13. 状态、聚合与 failure precedence

### 13.1 Attempt/Case

1. expected PASS 与 Common：全部 Manifest assertion matched -> `PASS_MATCHED`；
2. expected BLOCKED：expected error matched、七项 delta=`0`、Head/Projection/Text不动、reopen matched -> `BLOCKED_MATCHED`；
3. 任一断言失败、未预期 console/page/request error、外网、timeout、skip/retry 或两次 semantic digest不等 -> `FAILED`；
4. case 只有两个 attempt 都等于 expected status且 semantic digest相等时才 matched，否则 `FAILED`。

### 13.2 Capability

对每个 Intake Capability，`covered_coverage_keys` 与 dependency closure 集合完全相等，`case_refs` 与对应 Manifest family case 同序：

```text
if any case FAILED -> FAILED
else if pass_matched_count == 0 and blocked_matched_count > 0 -> BLOCKED_MATCHED
else -> PASS_MATCHED
```

34项都 matched 才能使 Report READY；`BLOCKED_MATCHED` 表示测试按预期阻断，不表示 Gate 或 Capability 已启用。

### 13.3 稳定失败优先级

同一 observation 命中多个 code 时按以下顺序输出并以第一项作为主分类；`failure_codes[]` 保留全部命中项但同序去重：

```text
1  E2E_INPUT_INVALID
2  E2E_ENVIRONMENT_MISMATCH
3  E2E_FIXTURE_MISMATCH
4  E2E_CASE_MISSING
5  E2E_UNEXPECTED_RUNTIME_ERROR
6  E2E_EXPECTATION_MISMATCH
7  E2E_REVISION_MISMATCH
8  E2E_PROJECTION_MISMATCH
9  E2E_TEXT_TRACE_MISMATCH
10 E2E_TRANSACTION_DELTA_MISMATCH
11 E2E_NONDETERMINISTIC
```

`failures[]` 的 `message_key` 固定为 `release.canvas06.e2e.<code小写>`，状态不得由本地化文本决定。

### 13.4 READY

Report 只有同时满足下式才为 `READY_FOR_ENABLEMENT_EVALUATION`：

```text
case_count=194
family_case_count=178
family expectations=130 PASS + 48 BLOCKED
common_case_count=16
attempt_count=388
pass_matched_count=137
blocked_matched_count=57
failed_count=0
skipped_count=0
retry_count=0
capability_results.length=34
all cases == expected status
all capability coverage == Intake dependency closure
failures=[]
```

全部 `388` attempt 已形成真实身份但任一不满足时写 `BLOCKED` Report，`failures[]` 至少一项。Controlled Report 即使 status 为 READY，也只能由 controlled verifier读取，禁止 `--require-production/--require-ready`，不构成 Gate evidence。

## 14. Report 原子事务、恢复与并发

唯一状态机：

```text
PREFLIGHT -> ACCEPTED -> STAGING -> EXECUTING_388 -> AGGREGATING
-> SCHEMA_VERIFY -> SEMANTIC_VERIFY -> FSYNC -> ATOMIC_RENAME -> PARENT_FSYNC
```

1. staging 固定为 final root 同父目录的 `.<report-id>.tmp-<随机128位>`，排他创建；
2. 输入副本、attempt、Report 全部在 staging，rename 是唯一提交点；
3. schema/semantic verifier 必须在 rename 前对 staging 的受限内部入口完整执行；
4. 任一 rename 前正常失败删除本次 staging，final root不存在；进程崩溃 residual 不得自动续跑或删除，后续调用退出 `2`，由人工隔离；
5. rename 后 parent fsync失败退出 `4`，保留 final root但不得声明成功，需人工隔离整个 root；
6. final root 永不覆盖、合并或写 latest/current pointer；相同 report ID 已存在时幂等重跑也必须拒绝；
7. run 固定单并发，attempt/case不得并行；端口可以在串行 attempt间复用，但每次必须重新证明无 listener、创建新进程并在结束后释放；
8. verifier 记录验证前后 final root tree digest并要求相等，禁止写 cache、temp、修复结果或访问网络。

## 15. 退出码与稳定 stderr

| Exit | Run | Verifier |
| --- | --- | --- |
| `0` | 完整 READY Report已原子提交 | Schema/semantic有效，且请求的READY条件满足 |
| `2` | 参数、class、path、Schema、staging/residual无效 | 参数/path/Schema/ref无效 |
| `3` | 完整 BLOCKED Report已原子提交，或preflight内容不匹配 | semantic/READY/class mismatch |
| `4` | 未分类 I/O、进程、fsync或内部错误，final成功不成立 | 未分类 I/O/内部错误 |

stderr 第一行固定 `<CODE>\t<stage>\t<case-id或->\t<attempt或->`；stdout 成功只输出 final Report绝对路径和 raw SHA。不得输出 session token、request/response正文、用户路径正文或自由文本状态判定。

## 16. 实现验收

### 16.1 定向正例

1. controlled最小完整 `194/388` run 生成 Schema-valid、semantic-valid Report；
2. Family `130 PASS/48 BLOCKED`、Common `7 PASS/9 BLOCKED`及fault case均覆盖；
3. attempt 1/2 semantic digest相等但PID/端口/时间可不同；
4. production trust chain正例必须从 production Manifest读取 exact build，不调用Vite或构建命令；
5. exact JAR正例必须由JDK 21 fork built Spring Boot JAR并通过`PropertiesLauncher`加载Materializer，断言CodeSource精确为`jar:nested:<attempt-local raw outer path>/!BOOT-INF/classes/!/`、安全反解析的outer lexical/real path均为attempt-local JAR，再由producer同一次outer raw观测写出`source_sha256 == runtime_jar_ref.sha256`，verifier独立复算得到同一值；
6. canonical UTC整秒`generated_at`正例由Materializer和verifier派生同一`source_date_epoch`，SQLite seed时间逐字段相等；
7. BLOCKED正例完整执行388 attempt、原子生成可验证Report，`--require-ready`拒绝。

### 16.2 定向反例

至少覆盖：参数/模式互用、controlled生产化、dirty/wrong commit、Manifest/root/ref/SHA/extra/symlink/hardlink、Manifest时间`.000Z`/非零小数/`+00:00`/其他offset/空白/大小写/非法/归一化值及时间参数fallback、Family Catalog缺失/extra/重复/SHA/Project/Model/Context/base/sequence/parent drift、Golden/Recovery Project命名空间、Fault Plan缺失/partial/ordinal与path/schedule不一致、wrong Java/Playwright/Chromium、browser SHA变化、端口占用、非loopback绑定、Vite/HMR、外网、factory输出不等、Family/Common物化混用、非空storage、fault guard旁路、driver错族/缺case、skip/retry/timeout、console/pageerror/5xx、事务/Revision/Projection/Text/Trace/reopen/nondeterminism、Projection Digest 4正/9负与Node/Java parity、CodeSource为`file:`/`jar:file:`/裸`nested:`/其他nested entry/额外nested链/query/fragment/authority/非canonical URI/test classpath/其他JAR、outer path单次解码或lexical/real path不闭合、`source_sha256`误用`.class`/source-set/Manifest值/其他JAR、`source_sha256 != runtime_jar_ref.sha256`、JAR hash前后metadata漂移、artifact缺失/extra/SHA、194/388/34聚合错误、Report ID/路径错误、rename前故障、crash residual、verifier写入。

### 16.3 必跑命令

```text
npm run release:canvas06:e2e:runner:test
npm run release:canvas06:visual-e2e-schema:test
npm run release:canvas06:e2e:manifest:v02:test
npm run contract:validate
npm run lint
npm run typecheck
npm run build
./mvnw verify
git diff --check
```

真实 production `194/388` 仅在 clean Handoff/Manifest和固定环境可用时执行；代码/受控测试完成不等于 production Report 或 Gate READY。

## 17. 回滚与兼容

1. 代码回滚删除本包新增 Runner/Reporter/verifier/Web server/release config/driver/materializer/test launcher和命令；
2. 不修改或删除既有 Manifest、Handoff、fixture、SQLite用户数据、production evidence或其他Gate资产；
3. 已原子提交的 Report root不可原地修改，错误产物只能整体隔离并以新source/runner identity重新生成；
4. 活动 E2E Manifest 与 Attempt Artifact 为 `0.2`；Report活动writer为`0.2`，历史 Manifest/Attempt Artifact/Report `0.1`只读。后续不兼容变化必须再新增Schema/runner版本，不得原地修改任何已提交Report。

## 18. 事实与非结论

事实：E2E Manifest builder/verifier已完成活动Common Catalog `0.2.0` 43文件root和Family Identity Catalog适配并完成版本化 Handoff/Manifest 输入重验；活动 Manifest `0.2`、Attempt Artifact `0.2`、Profile asset tree/raw ref 和 Token parity 设计已冻结，但现有 builder/verifier/Materializer/Runner 尚未消费这些活动 Schema。Java Materializer、Profile raw producer、Token writer、完整 artifact verifier 和真实 production Report 尚未闭合或执行。

本规格的设计输入已闭合，但Family Materializer实现必须等待新Catalog进入clean Handoff/Evidence Bundle和活动Manifest后才能继续；这不构成 implementation完成、production `194/388`通过、`GATE-06-03` handoff、Candidate、Activation、Capability enablement、生产发布或 ISO 19450:2024 符合性证明。
