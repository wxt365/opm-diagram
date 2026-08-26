# DEV-CANVAS-06 E2E Fault Launcher Implementation Checklist

状态：`BLOCKED_BY_PREFLIGHT_DESCRIPTOR_CONTRACT_IMPLEMENTATION`

受控source commit：`ORIGIN_BASE=0dcaa27a92693feaf28b731ebed2f81a9ccea02c/CONTRACT_BASE_NOT_CREATED/2A_NOT_CREATED`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`
- 活动闭包修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-clean-base-and-controlled-playwright-closure-bugfix-task-spec.md`
- 活动preflight修正：`specs/opm-dev-canvas-06-e2e-fault-launcher-preflight-descriptor-and-gate-observation-closure-bugfix-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`
- 目标/权威输入：规格第1、2节。
- 非目标/禁止：规格第3节。
- 精确allowlist：规格第4节。
- Spring/Port/Recovery：规格第5、6节。
- Common重建：规格第7节。
- 测试/完成/回滚：规格第8至10节。

## Plan

1. 从exact `0dcaa27...` fresh clean worktree先实现`12=4 M+8 A`preflight contract包并接纳新clean base；
2. 复算36项只读raw ref及集合摘要，禁止修改既有Fault Launcher、Runner、Java测试和回归测试bytes；
3. 以新contract base为唯一parent，只新增controlled Playwright spec与其Node preflight/test owner；
4. 先验证Bundle `0.2`/Descriptor `0.1`并执行D01~D09/D10A，再在`READY_TO_RUN`时执行三case、6 attempts、12 cycles及D10B的14项观测；
5. 形成single-parent 2A commit并复算patch SHA；
6. 后续按既有不可变Common/Catalog/Manifest流程闭合release输入；
7. 更新状态但不提升Gate、Candidate、Activation或Capability。

## Boundary

- [ ] source delta逐项等于两个固定`A`，无extra；36项baseline raw ref逐项及集合摘要不变。
- [x] exact clean base intake已记录为`0dcaa27a92693feaf28b731ebed2f81a9ccea02c`，parent/tree/epoch/patch SHA均由活动闭包规格冻结。
- [ ] contract包必须先形成并接纳fresh clean base；2A只能从该base产生，不得从当前dirty main或origin base直接提交。
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
- [ ] 新增`fault-launcher.controlled.spec.ts`，覆盖三类INITIAL与same-storage REOPEN。
- [ ] 新增`canvas06-e2e-fault-launcher-controlled.test.mjs`，消费Bundle `0.2`/Descriptor `0.1`，实现D01~D09/D10A及封闭preflight机器对象，并在执行期生成D10B artifact。
- [x] 历史实现曾更新三个fault错误码；活动Common factory的完整九项错误码现由Common Driver实现规格接管，不进入本delta。

## Verify

- [x] Java unit/Spring slice/hook/isolation命令通过。
- [x] clean package和`E2EFaultLauncherJarIT`通过。
- [x] factory/Common/Runner/Report Node定向命令通过。
- [ ] Visual/E2E Schema与contract验证通过。
- [ ] preflight依赖不齐时输出Schema ID `OPM-DEV-CANVAS-06-E2E-FAULT-LAUNCHER-CONTROLLED-PREFLIGHT-001/0.1`的`BLOCKED_BY_DEPENDENCY`对象、stderr稳定首行和exit `3`，并证明零执行/零输出副作用。
- [ ] D01~D09/D10A十项依赖全READY时输出`READY_TO_RUN`和唯一Playwright token数组；READY不记为测试通过。
- [ ] D10B记录`1 BEFORE+12 DURING+1 AFTER`，全部匹配且`production_gate_mutation_count=0`；漂移立即停止并写稳定错误。
- [ ] controlled Playwright三类INITIAL与REOPEN通过，固定`6 attempts/12 process cycles`，零skip/retry。
- [ ] 设计`FL-N-001~016`与实现`FLI-N-017~021`全部通过。
- [x] 三类失败七项事务delta为0，Profile/SQLite原始输入未被注入修改。
- [ ] 普通/NONE/REOPEN与Recovery回归通过。
- [ ] `git diff --check`通过。

## Rebuild

- [ ] 形成parent逐字符等于已接纳contract clean base的exact 2A source SHA与patch SHA；contract base必须single-parent于`0dcaa27...`。
- [ ] 新Runtime JAR/Evidence Bundle/versioned Handoff/READY Intake闭合。
- [ ] fresh staging生成并验证新43文件Common root。
- [ ] 仅Common Driver设计列出的六个case、12个BASE/INPUT错误码字段变化，其他fixture语义不变。
- [ ] Catalog `0.2.0`、factory refs和12个fixture refs全部重算。
- [ ] 活动Manifest v02 producer/verifier的独立实现依赖已闭合；未闭合时本项明确为`BLOCKED_BY_DEPENDENCY`且禁止使用v01替代。
- [ ] 新Manifest按规格第7.2节固定root闭合新Runtime/Handoff/Common raw refs并通过production verifier。
- [ ] 新`clean-<source12>`原子安装、安装后重验和fixed Postverify通过。
- [ ] 旧release root未覆盖、未删除、未修改。

## Status Boundary

- [ ] 只有2A、全部Verify/Rebuild及真实controlled Playwright完成才记`IMPLEMENTED/CONTROLLED_VALIDATED`。
- [ ] 未执行production `194/388`时继续记录`GATE-06-03=NOT_RUN`。
- [ ] 未生成Candidate、Activation、Capability enablement或ISO结论。

## Rollback

- [ ] 只回退两个新增文件和未激活的新版本入口，不改写36项base。
- [ ] fixed切换失败使用既有backup恢复JSON。
- [ ] 不删除旧`clean-*`、用户SQLite或历史evidence。
