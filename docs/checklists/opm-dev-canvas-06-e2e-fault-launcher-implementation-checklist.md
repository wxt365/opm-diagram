# DEV-CANVAS-06 E2E Fault Launcher Implementation Checklist

状态：`BLOCKED_BY_FINAL_PRODUCTION_SOURCE_CHAIN_IMPLEMENTATION`

历史受控source commit：`0dcaa27.../63851f8.../586d6de...=NOT_CONSUMABLE`

活动source-chain：唯一Build入口为`9048bb3... -> f4c978e... -> 2f698cf... -> A`；A固定`7=5 M+2 A`。C/S已形成，首轮A candidate需重写后接纳。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`
- 活动闭包修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-clean-base-and-controlled-playwright-closure-bugfix-task-spec.md`
- 活动preflight修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md`
- Contract Base Schema修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-contract-base-schema-conformance-bugfix-task-spec.md`
- D01三段Source闭包修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-d01-three-stage-source-closure-bugfix-task-spec.md`
- Final production source-chain闭包：`specs/opm-dev-canvas-06-final-production-source-chain-closure-bugfix-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`
- 目标/权威输入：规格第1、2节。
- 非目标/禁止：规格第3节。
- 精确allowlist：规格第4节。
- Spring/Port/Recovery：规格第5、6节。
- Common重建：规格第7节。
- 测试/完成/回滚：规格第8至10节。
- 唯一controlled CLI、Manifest D05、Preflight Report `0.2`、Gate Artifact与evidence事务：活动preflight修正第17章。

## Plan

1. 从O依次形成C与S，并逐stage复算parent、allowlist和patch SHA；
2. 复算36项origin raw ref及集合摘要；A允许修改两个Runner ref，其余34项保持不变；
3. 以S为唯一parent修改Runner owner及其测试，并新增controlled Playwright spec与Node owner；
4. 通过唯一`--run-controlled`命令验证Bundle `0.2`/Descriptor `0.1`和actual Manifest v02，执行D01~D09/D10A；`READY_TO_RUN`后由同一调用执行三case、6 attempts、12 cycles及D10B，并原子提交两文件controlled evidence root；
5. 形成single-parent A commit并复算四路径patch SHA；
6. 后续按既有不可变Common/Catalog/Manifest流程闭合release输入；
7. 更新状态但不提升Gate、Candidate、Activation或Capability。

## Boundary

- [ ] source delta逐项等于`7=5 M+2 A`，无extra；两个Runner、release discovery与两个unified source guard按A变更，未授权raw ref不变且36项origin摘要可复核。
- [x] exact origin固定为`9048bb355aff18d5c00fbbaeb1660b979f4e6daa`，metadata及36项摘要已复算。
- [ ] C/S形成并接纳后，A只能以S为唯一parent，不得从dirty main、O、C或旧历史commit直接提交。
- [ ] 未修改OpenAPI、SQLite DDL/迁移、活动Schema、application.yml或公共HTTP wire。
- [ ] 未修改Recovery port/stage/test-tools或既有`clean-*`。
- [ ] 未引入依赖、ThreadLocal、production开关、公共route或第二Schema实现。

## Build

- [x] 10个Fault Launcher Java文件作为base raw ref存在，本2A包只读。
- [x] `spring.factories`作为base raw ref存在并只注册唯一EnvironmentPostProcessor，本2A包只读。
- [x] POM作为base raw ref存在并将SHA为`3508290b...a916b4`的exact Attempt Artifact v02 Schema raw bytes打入固定JAR路径，本2A包只读。
- [x] Java封闭Fault Plan分支validator与Node/Ajv三正例及`FL-N-006`字段级反例accept/reject parity通过。
- [x] raw scan与PostProcessor两阶段guard、唯一named MapPropertySource状态传递、稳定stderr/cause-chain/exit已进入只读base。
- [x] 普通启动唯一NOOP，完整tuple唯一attempt port，partial/unknown/production fail-closed已进入只读base。
- [x] Attempt port以唯一`DisposableBean.destroy()`完成第三次drift与trigger-count复核，无第二个JVM shutdown hook，已进入只读base。
- [x] 同一port实例经LocalApiService/Assembler/Repository/Committer构造链传递，sealed `Disabled/Active` context和两个Repository overload已进入只读base。
- [x] Profile Symbol前、SQLite Revision INSERT前、真实Head后三个hook完成。
- [x] E2E/Recovery port字段、context、enum与调用位置隔离。
- [x] `READ_ONLY_REVISION -> 409/non-retryable`完成，其他API映射不变。
- [x] Runner challenge/raw SHA/READY/INITIAL/REOPEN命令分支已进入只读base；2A只能消费和验证。
- [x] contract候选`63851f8...`已存在，但Gate Observation Schema对FAILED错误地强制12项DURING且缺少Playwright failure code，固定为`REJECTED_AS_2A_CONTRACT_BASE`。
- [x] Gate Observation Schema与既有contract测试的`2 M`后继`586d6de...`已通过`3`正`7`负矩阵、Node 22 `13/13`与contract validate并接纳为新base。
- [ ] 新增`fault-launcher.controlled.release.spec.ts`，覆盖三类INITIAL与same-storage REOPEN；文件名必须进入固定`**/*.release.spec.ts`匹配范围。
- [ ] 新增`canvas06-e2e-fault-launcher-controlled.test.mjs`，只暴露`node --test`和唯一`--run-controlled`入口，消费Bundle `0.2`/Descriptor `0.1`/actual Manifest v02，实现D01~D09/D10A、Preflight Report `0.2`、Invocation Context及staging/final双重verifier；不得直接实现D10B sampler/writer。
- [ ] 修改`release-canvas06-e2e-run.mjs`及其测试，实现唯一`runControlledLifecycleSession()`、内部`prepareControlledAttempt()`、六方法sink、Page网络事件、`ATTACHED_SAMPLING -> CONFIRMED_SENTINEL -> CLOSED`与最终Browser proof、Runtime/Web/D10B/cleanup owner；两个新增文件不得复制Runner业务语义。
- [x] 历史实现曾更新三个fault错误码；活动Common factory的完整九项错误码现由Common Driver实现规格接管，不进入本delta。

## Verify

- [x] Java unit/Spring slice/hook/isolation命令通过。
- [x] clean package和`E2EFaultLauncherJarIT`通过。
- [x] factory/Common/Runner/Report Node定向命令通过。
- [ ] Visual/E2E Schema与contract验证通过。
- [ ] preflight依赖不齐时输出`OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001/0.2`的`BLOCKED_BY_DEPENDENCY`对象、stderr稳定首行和exit `3`，并证明零执行/零evidence副作用。
- [ ] D01~D09/D10A十项依赖全READY时输出`READY_TO_RUN`和唯一Playwright token数组；READY不记为测试通过。
- [ ] D01证明活动`O -> C -> S -> A`，且`S -> A`恰为四项`M/M/A/A`；Report仍只记录origin/contract/candidate，不新增字段。
- [ ] D05先执行活动Manifest v02 controlled verifier，再逐字段闭合三个case；attempt/cycle/port只从Descriptor交叉验证，不声称为Manifest字段。
- [ ] Runner lifecycle接口作为D10B sampler与Gate Artifact唯一writer，成功记录`1 BEFORE+12 DURING+1 AFTER`且mutation count为0；spec只提供handler，逐cycle在route/navigation/API前attach真实Page并在finally关闭fresh Chromium/context/page后confirm同一对象；confirm后业务采样停止但迟到事件sentinel必须保留到handler settle和sink关闭，Runner复核零迟到事件并移除全部sentinel后才接纳最终proof和采样DURING。confirm后迟到事件、监听空窗、sentinel提前移除或最终残留固定事务失败且零可消费Artifact；Gate/Playwright业务失败只记录真实DURING前缀和AFTER，漂移立即停止并保留首错；父进程只读复验，不通过stdout猜测cycle。
- [ ] evidence final root恰含`fault-launcher/preflight-report.json`和`fault-launcher/gate-observation.json`，root ID使用Manifest/Descriptor raw SHA前12位。
- [ ] preflight report与Gate artifact分别经固定temp、file fsync、no-replace rename、directory fsync；root经staging verifier、postorder fsync、no-replace rename、parent fsync和installed verifier。
- [ ] 参数/input错误exit `2`、依赖阻断exit `3`、完整PASS exit `0`、Schema-valid失败证据exit `1`、事务失败exit `4`；事务失败final不存在且staging保留不可消费。
- [ ] controlled Playwright三类INITIAL与REOPEN通过，固定`6 attempts/12 process cycles`，零skip/retry。
- [ ] 设计`FL-N-001~016`与实现`FLI-N-017~021`全部通过。
- [x] 三类失败七项事务delta为0，Profile/SQLite原始输入未被注入修改。
- [ ] 普通/NONE/REOPEN与Recovery回归通过。
- [ ] `git diff --check`通过。

## Rebuild

- [ ] 形成parent逐字符等于S的exact A source SHA与patch SHA；D01必须同时证明`parent(S)=C`和`parent(C)=O`。
- [ ] 新Runtime JAR/Evidence Bundle/versioned Handoff/READY Intake闭合。
- [ ] fresh staging生成并验证新43文件Common root。
- [ ] 仅Common Driver设计列出的六个case、12个BASE/INPUT错误码字段变化，其他fixture语义不变。
- [ ] Catalog `0.2.0`、factory refs和12个fixture refs全部重算。
- [ ] 活动Manifest v02 producer/verifier的独立实现依赖已闭合；未闭合时本项明确为`BLOCKED_BY_DEPENDENCY`且禁止使用v01替代。
- [ ] 新Manifest按规格第7.2节固定root闭合新Runtime/Handoff/Common raw refs并通过production verifier。
- [ ] 新`clean-<source12>`原子安装、安装后重验和fixed Postverify通过。
- [ ] 旧release root未覆盖、未删除、未修改。

## Frozen Controlled Protocol

- [x] 唯一业务入口冻结为`--run-controlled`；旧`--preflight/--mode=preflight`及candidate/Runtime/Web/browser override均拒绝。
- [x] `--manifest-root`与固定`--manifest dev-canvas-06-e2e-manifest.json`是actual Manifest唯一定位方式。
- [x] Runtime JAR/Web只从Manifest refs解析，browser只从显式file与Descriptor/Environment exact join解析。
- [x] Preflight Report活动版本冻结为`0.2`，包含origin/contract/candidate三段身份及可空Manifest/Descriptor refs。
- [x] controlled run ID、staging/final路径、两文件最终布局和禁止写入production Report root已冻结。
- [x] PASS固定14项Gate观测；提前失败固定真实DURING前缀，不允许用虚假观测补足12项。
- [x] 文件和目录原子顺序、双verifier、稳定exit及失败保留边界已冻结。
- [x] 父进程到Playwright唯一通过带raw ref的Invocation Context传输；单一环境键、12-cycle schedule、Context原子写入与child重验均已冻结。

## Status Boundary

- [ ] 只有2A、全部Verify/Rebuild及真实controlled Playwright完成才记`IMPLEMENTED/CONTROLLED_VALIDATED`。
- [ ] 未执行production `194/388`时继续记录`GATE-06-03=NOT_RUN`。
- [ ] 未生成Candidate、Activation、Capability enablement或ISO结论。

## Rollback

- [ ] 回滚A-stage时，两个Runner恢复S的exact bytes、删除两个controlled新增文件；不改写其余34项base或已安装历史根。
- [ ] fixed切换失败使用既有backup恢复JSON。
- [ ] 不删除旧`clean-*`、用户SQLite或历史evidence。
