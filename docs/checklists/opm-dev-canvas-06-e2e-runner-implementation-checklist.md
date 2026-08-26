# DEV-CANVAS-06 E2E Runner Implementation Checklist

状态：`IN_PROGRESS/ACTIVE_PROFILE_DIGEST_CONTRACT_READY`。`clean-37c5412a9c12`的exact Evidence Bundle、安装后的fixed Handoff和活动production Manifest已通过Node `v24.19.0`/JDK `21.0.7` production verifier；Family Materializer的输入依赖已解除，可进入实现。Manifest/Attempt Artifact `0.2`、Profile asset tree/raw refs 和 Token parity 设计已冻结，但尚未接入现有 CLI/Materializer/Artifact verifier。Java Materializer与Runner仍未实现，不得执行真实Family materialization或提升 production `194/388`、`GATE-06-03`、Candidate、Activation、Capability 或 ISO 状态。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md`。
- Fault Launcher实现入口：实现规格、clean base闭包、Preflight Descriptor/Gate Observation闭包及对应checklist；活动边界为`origin base=0dcaa27... + 36 READ_ONLY_BASELINE + contract 12=4 M+8 A + 2 A`。
- Manifest v02入口：`specs/opm-dev-canvas-06-e2e-manifest-v02-builder-verifier-implementation-task-spec.md`及对应checklist；负责第四driver、Profile输入和活动Report `137/57`修正。
- Common Driver/编排入口：`docs/design/opm-dev-canvas-06-e2e-common-driver-controlled-orchestration-design.md v1.4`、对应实现规格/checklist、Runner Source Set闭包及17项集成Source规格/checklist。
- Artifact设计输入：活动 `specs/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-bugfix-task-spec.md`、`docs/design/opm-dev-canvas-06-e2e-profile-assets-and-digest-closure-design.md`、Manifest/Attempt Artifact `0.2` Schema、Family Fixture Identity Catalog `0.1/0.1.0`、Projection Digest Closure `v1.0/0.1`、活动E2E Report `0.2`与Runner Source Set `0.1`；实现只读消费。历史 Manifest/Attempt Artifact/Report `0.1`仅只读。
- Task Type：`feature`。
- Active Playbooks：`testing (primary)`、`backend-springboot`、`design-module-docs`。
- 目标/身份/输入：规格第 1、2 节。
- Owner/修改边界：规格第 3 节。
- CLI/信任链/可报告边界：规格第 4、5 节。
- Report root/启动/隔离：规格第 6、7 节。
- Fixture/driver/等待：规格第 8 至 10 节。
- Artifact/Report/聚合：规格第 11 至 13 节。
- 事务/退出码：规格第 14、15 节。
- 验收/回滚/非结论：规格第 16 至 18 节。

## Boundary

- [ ] 只修改规格第 3 节允许的 Runner、helper、release config、driver、test-only Java、定向测试、命令和状态文档。
- [ ] 不修改历史 E2E Manifest/Attempt Artifact `0.1`、活动 Manifest/Attempt Artifact `0.2`、活动Report `0.2`、Runner Source Set `0.1`、Common/Visual Schema、OpenAPI、SQLite DDL、Profile/Rule/Grammar/Symbol/Handoff 或 Vue 业务行为。
- [ ] test-only materializer/fault launcher 默认生产启动不可达且无公共 API。
- [ ] 不把 controlled Report、代码完成或 Schema-valid 当成 production Gate READY。

## Build

- [x] Node 基础层已实现并有定向测试：闭合 production/controlled CLI 解析、固定 Report 路径、同目录 staging/全树 fsync/atomic rename、Manifest `inputs/**` 原始副本、production static/SPA loopback server、纯 Report 聚合和失败优先级；Report semantic comparison digest 已使用共享 RFC 8785 JCS owner；尚不生成最终 Report。
- [x] 只读 preflight 已复用 Manifest semantic verifier 与两类信任链，校验 clean source HEAD、Java 21、Chromium `143.0.7499.4`/SHA、34项Capability闭包和两个空闲 loopback 端口；任一失败发生在 staging 前。
- [x] 活动 Attempt Artifact `0.2` 的 filename/schema identity、Profile tree/raw refs、递归封闭字段、fault映射、materialization、Runtime/Browser/Network/Console/Transaction/Reopen/API/Index join、Report投影和失败边界已由 Profile/Digest closure 设计与 `0.2` union Schema 冻结，实现不得重新定义机器格式；Family Project与attempt ordinal来源也已冻结。历史 `v1.3/0.1` 仅兼容读取。
- [x] 历史 attempt artifact writer 已实现固定filename-to-schema identity、JCS payload SHA、同attempt单链接原子写入和三类fault plan映射；活动 `0.2` 的 Profile tree/raw refs、16 类 Index 条目和 Token digest writer 尚未接入，Runtime/Browser/Materializer producer仍待实现。
- [x] Projection Digest Closure `v1.0/0.1`设计、preimage/vector Schema及4正/9负不可变vector已冻结；活动 Attempt Artifact `0.2` 继续绑定该Projection摘要，并继承历史`v1.3`冻结的Family identity/Fault Plan ordinal语义。
- [x] 活动E2E Report已升级为`0.2`，冻结`runner_version=0.2.0`、Java executable byte mirror/version/release refs及23项Runner Source Set；活动 Manifest/Attempt Artifact 为`0.2`，历史 Manifest/Attempt Artifact/Report `0.1`保持只读。
- [x] Common controlled orchestration owner已收敛到Source Set第1项`release-canvas06-e2e-run.mjs`；Source Set保持`0.1/0.1.0/23`，Report保持`0.2/0.2.0`，`8=7 M+1 A`仅为17项集成包内职责子集，禁止独立production orchestration helper或独立commit。
- [x] Handoff、Intake解析Handoff、Manifest、source HEAD、Report runner identity与Common/External final commit六方source join已冻结；祖先关系不能替代逐字符相等。
- [x] `--manifest` 与 `--profile-asset-root`、Manifest raw/schema/semantic -> Profile tree/raw ref -> binding join 顺序、Profile tree digest、五项 raw ref 和 zero-output rejection 已冻结；现有 CLI 尚未实现该成功路径。
- [x] Fault Launcher `v1.2`已冻结九项命令行配置、普通启动NOOP/partial与production fail-closed、32-byte parent nonce/challenge和HMAC、Plan raw SHA/链接/首错顺序、三个精确产品hook、一次性状态机、稳定协议错误码及正反例矩阵；36项实现基线已进入exact `0dcaa27...`且只读。
- [x] Fault Launcher活动边界已收敛为`36 READ_ONLY_BASELINE + contract 12=4 M+8 A + 2 A`；Bundle `0.2`、Descriptor/JarIT/Gate Observation `0.1`、D10A/D10B均已冻结，contract/new base未实现，2A状态为`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`；基线集合摘要固定为`69491a...b411e`。
- [x] OPL/Trace 唯一复用 `OplGoldenArtifactCanonicalWriter`；Token JCS preimage、固定 canonical writer、3 正向量/4 负向量和 Node/Java parity 已实现。Node writer 位于 `scripts/canvas06-e2e-attempt-artifacts.mjs`，Java writer 位于 `TokenCanonicalWriter`；两端均逐字段验证 preimage、canonical UTF-8 bytes、SHA/error/pointer。该证据不提升 Materializer、Runner、Report 或 Gate 状态。
- [x] `canvas06-projection-digest-v01.mjs`、Java `ProjectionDigestV01`及同一vector全链路parity已实现；`4`个正向量和`9`个负向量验证preimage、canonical bytes、SHA、错误码与JSON Pointer一致。
- [x] 历史Common Fixture staging输入 verifier已复核Catalog Schema `0.1`、16个唯一有序case、Factory raw ref及BASE/INPUT JCS；Java Materializer已有COMMON空Revision受控集成证据。该完成项不证明活动Catalog `0.2.0`、Common Driver v0.2或Manifest v02输入闭包。
- [x] release Playwright config已固定 Chromium、单worker、零retry、120秒超时、`zh-CN/Asia/Shanghai/light/reduce/DPR=1`及七项launch参数；不定义`webServer`、dev server或reuse-existing-server。
- [ ] 实现 production/controlled run CLI、模式互斥、白名单参数和 exact Report ID/path。
- [ ] 为 Runner/Report verifier/Java Materializer/Attempt Artifact verifier 实现显式 `--manifest-root`、`--manifest`、`--profile-asset-root`，并保证 Profile preflight 失败时零SQLite、零attempt、零Report。Java Materializer 已实现 Family 输入预检切片，尚未接入SQLite物化或完整活动 Manifest Schema engine。
- [ ] Materializer只通过`FileProfilePackageLoader.forVerifiedDirectPackageRoot()`读取attempt-local `profile/assets`五项exact文件；禁止hierarchical/父目录/checkout/classpath/JAR resource fallback，并复用完整`ProfilePackageAssembler`校验链。
- [ ] Runner保留Manifest raw source并复制为不同inode的`inputs/materializer/input.raw`；Materializer对FAMILY/COMMON都要求显式`--input`，自行执行containment、`Files.mismatch`、length/SHA、Manifest case和输出`input_ref`深度join。
- [ ] Materializer只接受当前进程CodeSource的唯一`jar:nested:<attempt-local raw outer path>/!BOOT-INF/classes/!/`形态；完整external form精确匹配后才按固定prefix/suffix安全反解析outer，单次URI解码，并要求outer lexical/real path均为attempt-local `inputs/build/local-runtime.jar`且与Manifest ref闭合；test classpath永远不能写成功artifact。
- [ ] Materializer以同一次exact JAR raw观测同时生成`runtime_jar_ref`与`source_sha256`并强制SHA相等；不得摘要`.class`、Java/Runner source-set、Manifest字符串或其他JAR。
- [ ] Materializer只从Manifest原始`generated_at`严格往返派生`source_date_epoch`；Runner不得新增时间参数，`.000Z`/fraction/offset/非法值以`E2E_INPUT_INVALID/2`零SQLite、零artifact拒绝，verifier独立复算并检查seed时间。
- [ ] 复用 E2E Manifest verifier，闭合 production READY Handoff 与 controlled descriptor 信任链。
- [ ] 实现 clean source、固定23项runner source set、JDK 21 executable mirror/version/release evidence、Playwright/Chromium、browser SHA 和端口排他预检。
- [ ] 实现 self-contained Report staging/final root、Manifest inputs逐byte复制、fsync和目录级atomic rename。
- [ ] 实现只服务 production dist 的loopback Web server；无Vite/HMR/外网proxy。
- [ ] 实现每 attempt fresh SQLite/Runtime/Web/browser/process/context/port proof和reopen cycle。
- [x] Manifest/Handoff/Evidence Bundle已适配并在安装后production verifier中验证唯一Family Identity Catalog raw ref、178 -> 2集合与fixture deep join。
- [x] 已从Golden seed抽取显式`SeedIdentity`入口；调用方传入的Project ID逐字写入SQLite，既有Golden默认派生保持不变。
- [x] 复用不含Project派生的seed kernel 实现 Family exact Revision 和 Common deterministic empty model 的 non-web materializer；Family Project 只读 Catalog，Common Project 使用 `sha256(UTF8(case_id))` 前16位，禁止 Golden/Recovery 派生或默认。Artifact Index 生产仍待实现。
- [x] plan builder先原子写入并验证`fault-plan.json`；Materializer及其余artifact只从该文件读取`attempt_ordinal`，禁止路径/循环下标反推。
- [x] 历史Common Factory输出与BASE/INPUT raw fixture JCS相等；历史Catalog `0.1.0` bytes不修改。
- [x] Common Driver、三个selector、Fact删除入口、store、factory和活动Catalog `0.2.0` root已作为只读前置存在；其局部实现不等于controlled执行或Report证据。
- [ ] 按17项集成Source规格，在同一`e598...`clean worktree内联合实现External Store `9=7 M+2 A`与Common编排`8=7 M+1 A`，一次提交为`17=14 M+3 A`；Common子集在`release-canvas06-e2e-run.mjs`实现`prepareControlledAttempt()`并以Manifest `driver_catalog[3]`锁定的既有Common driver闭合16项受控执行，禁止重复修改Driver/UI/factory。
- [ ] 先完成`12=4 M+8 A`contract包并接纳新base，再只新增Fault Launcher controlled Playwright spec与Node preflight/test owner；preflight按D01~D09/D10A输出封闭机器对象，READY后执行三case、6 attempts、12 cycles，并以D10B记录14项Gate观测。36项launcher/guard/Plan/port/hook/Runner基线不得修改；发现基线缺陷必须新开bugfix规格。
- [ ] 实现正式UI触发、稳定等待、同Revision Projection/OPL/Token/Trace和事务/reopen断言。
- [ ] 实现外网、console/pageerror、5xx、skip/retry/timeout检测。
- [ ] 实现全部必填attempt artifact、artifact index、source set aggregate和semantic comparison digest。
- [ ] 在既有 `verify-canvas06-e2e-report.mjs` 实现必填 `--scope REPORT/ATTEMPT`，ATTEMPT模式闭合 `10+1+5`、五类 `asset_kind`、OPL/Trace Java writer、Token parity和验证前后tree SHA不变；禁止scope自动推断。
- [ ] 实现Report字段映射、194/388/34聚合、failure precedence和READY算法。
- [ ] 实现只读semantic verifier、`--require-production/--require-ready`守卫和tree digest不变性。
- [ ] `package.json`仅新增规格冻结的四个E2E release命令。

## Verify

- [ ] controlled完整194/388正例通过，Family `130 PASS+48 BLOCKED`、Common `7 PASS+9 BLOCKED`、总计`137 PASS+57 BLOCKED`及34 Capability聚合正确。
- [ ] production信任链正例只消费Manifest build副本，不执行build或启动dev server。
- [ ] 完整BLOCKED Report正例可验证，`--require-ready`拒绝。
- [ ] 参数、class、path、ref、digest、23项source allowlist、Java mirror/ref、JDK/browser/port反例通过；额外覆盖direct-root checkout fallback、Profile extra/link、`--input`缺失/跨root/raw drift、CodeSource为`file:`/`jar:file:`/裸`nested:`/其他entry/额外nested链/query/fragment/authority/非canonical URI/test classpath/其他JAR、outer lexical/real path或单次解码不闭合、`.class`/source-set错误preimage、`source_sha256 != runtime_jar_ref.sha256`及Manifest时间`.000Z`/fraction/offset/空白/非法/归一化/fallback。
- [ ] JDK 21 fork exact built Spring Boot JAR并通过`PropertiesLauncher`加载Materializer的成功集成测试通过；断言完整nested CodeSource、outer lexical/real path及外层JAR raw SHA三者闭合。
- [ ] symlink/hardlink/extra、跨root、existing final、staging residual反例通过。
- [ ] Family/Common混用、Identity Catalog缺失/extra/重复/SHA/字段/Project命名空间drift、factory drift、非空storage、fault guard旁路和driver错映射反例通过。
- [ ] Fault Plan缺失/partial、Schema/payload错误、ordinal与case/path/schedule不一致均在SQLite/Runtime前稳定拒绝。
- [ ] Fault Launcher正例覆盖三类INITIAL、NONE INITIAL和故障后REOPEN；反例覆盖二次触发、未触发shutdown、plan drift、错误challenge/nonce、错context、链接/path、partial/unknown/production配置，并断言稳定exit/code及零错误层副作用。
- [ ] 外网、HMR、skip/retry/timeout、console/pageerror/5xx反例通过。
- [ ] expectation、Revision、Projection、Text/Trace、transaction、reopen和nondeterminism反例通过。
- [x] Projection Digest正负零、subnormal、max finite、9类稳定错误及Node/Java parity通过；Common Visual normalized Projection仍使用其独立safe-integer算法。
- [ ] artifact缺失/extra/SHA、case/attempt/capability聚合和Report ID反例通过。
- [ ] 所有rename前故障final零输出；rename后fsync失败保留但不声明成功。
- [ ] verifier运行前后Report root tree digest相等且不访问网络。
- [x] `npm run release:canvas06:e2e:runner:test`通过`44/44`；其中production static loopback测试必须在允许绑定`127.0.0.1`的环境运行。
- [x] 历史/活动Report、Runner Source Set、历史/活动 Manifest/Attempt Artifact、Profile asset 和 Token parity Schema/fixture 已并入`npm run release:canvas06:visual-e2e-schema:test`并通过`19/19`；这只证明机器契约、Profile package/raw digest分离、固定 canonical bytes 和局部join，不证明 producer/verifier 或 Java Token writer 已实现。
- [ ] E2E Manifest、Visual/E2E Schema、contract、lint、typecheck、build和Maven回归通过。
- [ ] `git diff --check`通过。

## Release Boundary

- [ ] Runner implementation完成状态与production execution状态分栏记录。
- [ ] production Manifest和真实`194/388`未执行前，E2E Report保持未生成。
- [ ] Visual与E2E两个READY Report均存在且其他`GATE-06-03`条件满足前，Gate保持`BLOCKED`。
- [ ] 不生成Candidate/Activation，不启用Capability。
- [ ] 不声明ISO 19450:2024符合性。

## Rollback

- [ ] 只回退本包新增Runner/Reporter/verifier/Web server/release config/driver/materializer/test launcher、测试和命令。
- [ ] 不修改、覆盖或删除既有Manifest、Handoff、fixture、用户SQLite或不可变evidence root。
