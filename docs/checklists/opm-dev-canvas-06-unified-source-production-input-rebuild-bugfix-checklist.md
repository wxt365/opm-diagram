# Checklist: DEV-CANVAS-06 统一 Source 生产输入重建

状态：`FROZEN/NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 规格责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、Root Cause、Fix | 1、2 | C01~C04 |
| 身份与边界 | 3、4 | C05~C10 |
| source-root与构建 | 5 | C11~C16 |
| Handoff/Web tree | 6 | C17~C23 |
| 版本根/Common | 7、8 | C24~C29 |
| Manifest exact join | 9 | C30~C35 |
| 原子事务、sidecar marker与错误 | 10、11 | C36~C42D |
| 测试、完成、回滚 | 12、13 | C43~C50 |

## Plan

- [x] C01 本包只关闭统一production输入，不实现Manifest v02 Producer/Verifier。
- [x] C02 已复现旧Handoff两artifact、新Common和未冻结source path不能闭合。
- [x] C03 `daf383df6d7faad866b84fceac0a2c9111a8c926`只作为base commit。
- [x] C04 新clean `unified_source_commit`是全部最终输入的唯一source identity。
- [x] C05 当前`clean-daf383df6d7f`仅为Common self-verified root。
- [x] C06 实现source delta固定23个非文档路径，包含Quarantine Marker Schema和Bootstrap Build Closure嵌入子集。
- [ ] C07 clean实现提交满足`23=11 M+11 A+1 D`且source patch SHA已记录。
- [x] C08 历史Schema/Handoff/Intake/release root保持只读。
- [x] C09 除新增Handoff `0.2`外，其他Schema/API/SQLite/Java/Vue/Profile业务bytes及`.harness/**`禁止修改。
- [x] C10 fixed Handoff、Gate、Candidate、Activation和Capability不在本包。
- [x] C11 clean source四项守卫已冻结。
- [x] C12 构建前target/dist/node_modules残留拒绝。
- [x] C13 Runtime、Web、四driver、factory、generator唯一相对路径已冻结。
- [x] C14 五个Profile资产basename已与base source tree逐项核对。
- [x] C14A 五资产只构成clean source固定Source Set；本包不创建source内共同root，Profile Staging由Manifest v02 Producer在source-root外fresh物化且不进入Handoff/版本根。
- [x] C15 Node 22/npm 10.9.4/JDK 21、exact build、显式TAP和commit epoch文档时间源已冻结。
- [x] C16 禁止Node 24强制、Vite dev server和已有build output复用。
- [x] C16A Node 22根build前后Bootstrap source/dist/runtime wire/order和派生产物闭包由独立规格承接，两个vite派生文件必须不存在。
- [x] C17 Handoff新增独立`0.2` Schema，历史`0.1`原字节不变。
- [x] C18 Handoff `build_artifacts`固定Runtime、Evidence、Web三项顺序。
- [x] C19 `WEB_DIST_TREE`只允许在Handoff `0.2.build_artifacts[2]`使用。
- [x] C20 Web inventory、UTF-8 path排序、JCS、length和SHA公式唯一。
- [x] C21 Web空tree、link、special、绝对路径、source map绝对checkout和HMR拒绝。
- [x] C22 STAGING/INSTALLED物理解析显式且禁止fallback。
- [ ] C23 Web tree与既有v01 helper固定parity vectors通过。
- [x] C24 versioned input root布局已冻结且不包含Manifest输出。
- [x] C25 release-build `0.2`和Handoff三artifact逐字段相等。
- [x] C26 Common不进入Handoff，避免循环。
- [ ] C27 Common Catalog binding与新Handoff active binding相等。
- [ ] C28 Common factory/generator mirror与unified source raw bytes相等。
- [ ] C29 Common exact 43和`7 PASS+9 BLOCKED`完整Verifier通过。
- [x] C30 Runtime source/Handoff/Manifest final三方raw join已冻结。
- [x] C31 Web source/Handoff/Manifest final三方tree join已冻结。
- [x] C32 四driver source/final raw join与固定路径已冻结。
- [x] C33 Common exact 43 inventory/final copy join已冻结。
- [x] C34 Profile五资产source/staging/final raw/tree三方join及package/binding已冻结；Staging owner属于Manifest v02 Producer。
- [x] C35 READY Intake/Handoff source commit和raw ref join已冻结。
- [x] C36 Builder/独立只读Verifier完整CLI与重建事务首错顺序已冻结。
- [x] C37 final/staging/residual拒绝覆盖。
- [x] C38 rename前失败零final；rename后失败保留原始root并写固定sidecar marker。
- [x] C39 独立Verifier前后tree digest相等且installed reverify完成前不得声明READY。
- [x] C40 fixed Handoff不在本事务切换。
- [x] C40A marker固定为`handoff/releases/quarantine/clean-<source12>.json`，不进入失败根tree。
- [x] C40B Marker `0.1` Schema、八字段、字段顺序、source12/input root/tree/failure连接和bytes已冻结。
- [x] C40C temp write/fsync/reread/no-replace rename/directory fsync唯一协议及`TRANSACTION_FAILED/4`已冻结。
- [x] C40D Builder/Verifier按目标source12精确检查final/temp，存在即拒绝，禁止目录扫描、覆盖或自动重建。
- [x] C40E 删除/移动失败根、marker或temp仅由独立恢复规格和operator授权承接。
- [x] C41 十二类稳定错误码、exit和stderr首行已冻结。
- [x] C42 成功stdout只输出root、commit和tree digest。
- [ ] C43 四项先红后绿回归测试完成。
- [ ] C44 Handoff/Runtime/Web/Intake/Common完整正例通过。
- [ ] C45 source/Web/driver/Common/Profile/transaction反例矩阵通过。
- [ ] C46 同一次clean build的source/staging/installed bytes与tree digest完全相等。
- [ ] C47 统一输入定向Node测试、Common、Manifest v02和contract通过。
- [ ] C48 `git diff --check`和exact allowlist通过。
- [ ] C49 正式执行身份、摘要、计数、环境和verifier exit已记录。
- [x] C50 未提升Manifest/194/388/Report/Gate/Candidate/Activation/Capability/ISO状态。

## 当前门状态

- 设计：`FROZEN_FOR_IMPLEMENTATION`。
- 实现：`READY_FOR_BUILD/NOT_STARTED`。
- 生产重建：`NOT_RUN`。
- 当前Common root self-verification：`READY`。
- Bootstrap Build Closure：`FROZEN_FOR_IMPLEMENTATION/NOT_STARTED`。
- 统一production trust chain：`BLOCKED_BY_BOOTSTRAP_BUILD_CLOSURE_IMPLEMENTATION`；Bootstrap闭包实现后仍须完成本规格重建与Verifier，不能直接变为READY。
- Manifest v02 Production输入：`BLOCKED_BY_17_PATH_INTEGRATED_SOURCE_IMPLEMENTATION`；历史集成source commit`e598b305...`已形成，但旧Builder/Verifier仍绑定source内handoff root和untracked例外。本规格的23项实现commit及内嵌root均不能单独作为最终production source identity。
- `GATE-06-03`：`NOT_RUN`。

## 事实与待执行

### 已确认事实

- 当前仓库HEAD与base commit均为`daf383df6d7faad866b84fceac0a2c9111a8c926`。
- 四个driver和Common factory存在于base commit固定路径。
- Runtime JAR与Web dist是ignored build output，不存在于base Git tree。
- 当前固定Handoff锁定旧source commit，且只含Runtime/Evidence两项。
- 当前`clean-daf383df6d7f`只含Common 43文件root，不是完整统一版本根。

### 待执行输入

- `unified_source_commit`、source patch SHA和`23=11 M+11 A+1 D`路径计数；
- exact clean build环境与输出摘要；
- Handoff `0.2`、READY Intake、Runtime、Web和Common installed evidence；
- 四driver与五Profile资产最终raw SHA；
- 完整versioned input root tree digest和installed verifier退出码；
- exact sidecar marker guard结果；失败路径还须记录Schema-valid marker raw SHA或`CANVAS06_UNIFIED_TRANSACTION_FAILED/4`。
