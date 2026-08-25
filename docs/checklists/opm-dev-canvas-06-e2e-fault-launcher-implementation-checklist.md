# DEV-CANVAS-06 E2E Fault Launcher Implementation Checklist

状态：`READY_FOR_BUILD/IN_PROGRESS`

受控source commit：`BLOCKED_BY_BASE_INTAKE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`
- 目标/权威输入：规格第1、2节。
- 非目标/禁止：规格第3节。
- 精确allowlist：规格第4节。
- Spring/Port/Recovery：规格第5、6节。
- Common重建：规格第7节。
- 测试/完成/回滚：规格第8至10节。

## Plan

1. 建立Fault Launcher纯Java owner及JAR内Schema资源；
2. 接入raw args、EnvironmentPostProcessor和fail-closed Spring装配；
3. 以显式Context接入Profile/Repository三个hook并修正LocalApi映射；
4. 补unit、slice、integration、forked-JAR和Recovery isolation；
5. 只补Runner challenge/启动路径；Common factory映射由独立Common Driver实现规格拥有；
6. 形成新clean source和不可变Common/Catalog/Manifest版本根；
7. 执行controlled E2E与全部回归，更新状态但不提升Gate。

## Boundary

- [ ] source delta逐项等于规格第4.1至4.5节38个逻辑路径，无extra。
- [ ] 受控提交前已记录第4.7节exact clean base intake；不得从当前工作树推断`M/A`或整体提交脏状态。
- [ ] 未修改OpenAPI、SQLite DDL/迁移、活动Schema、application.yml或公共HTTP wire。
- [ ] 未修改Recovery port/stage/test-tools或既有`clean-*`。
- [ ] 未引入依赖、ThreadLocal、production开关、公共route或第二Schema实现。

## Build

- [ ] 新增10个固定Fault Launcher Java文件。
- [ ] `spring.factories`只注册唯一EnvironmentPostProcessor。
- [ ] POM只把SHA为`3508290b...a916b4`的exact Attempt Artifact v02 Schema raw bytes打入固定JAR路径，未新增Schema依赖。
- [x] Java封闭Fault Plan分支validator与Node/Ajv三正例及`FL-N-006`字段级反例accept/reject parity通过。
- [ ] raw scan与PostProcessor两阶段guard、唯一named MapPropertySource状态传递、稳定stderr/cause-chain/exit完成。
- [ ] 普通启动唯一NOOP，完整tuple唯一attempt port，partial/unknown/production fail-closed。
- [ ] Attempt port以唯一`DisposableBean.destroy()`完成第三次drift与trigger-count复核，无第二个JVM shutdown hook。
- [ ] 同一port实例经LocalApiService/Assembler/Repository/Committer构造链传递，sealed `Disabled/Active` context和两个Repository overload完成，无null/ThreadLocal/static context。
- [x] Profile Symbol前、SQLite Revision INSERT前、真实Head后三个hook完成。
- [x] E2E/Recovery port字段、context、enum与调用位置隔离。
- [x] `READ_ONLY_REVISION -> 409/non-retryable`完成，其他API映射不变。
- [ ] Runner完成challenge/raw SHA/READY/INITIAL/REOPEN命令分支。
- [x] 历史实现曾更新三个fault错误码；活动Common factory的完整九项错误码现由Common Driver实现规格接管，不进入本delta。

## Verify

- [x] Java unit/Spring slice/hook/isolation命令通过。
- [x] clean package和`E2EFaultLauncherJarIT`通过。
- [x] factory/Common/Runner/Report Node定向命令通过。
- [ ] Visual/E2E Schema与contract验证通过。
- [ ] controlled Playwright三类INITIAL与REOPEN通过，零skip/retry。
- [ ] 设计`FL-N-001~016`与实现`FLI-N-017~021`全部通过。
- [x] 三类失败七项事务delta为0，Profile/SQLite原始输入未被注入修改。
- [ ] 普通/NONE/REOPEN与Recovery回归通过。
- [ ] `git diff --check`通过。

## Rebuild

- [ ] 形成exact clean source SHA与patch SHA。
- [ ] 新Runtime JAR/Evidence Bundle/versioned Handoff/READY Intake闭合。
- [ ] fresh staging生成并验证新43文件Common root。
- [ ] 仅Common Driver设计列出的六个case、12个BASE/INPUT错误码字段变化，其他fixture语义不变。
- [ ] Catalog `0.2.0`、factory refs和12个fixture refs全部重算。
- [ ] 活动Manifest v02 producer/verifier的独立实现依赖已闭合；未闭合时本项明确为`BLOCKED_BY_DEPENDENCY`且禁止使用v01替代。
- [ ] 新Manifest按规格第7.2节固定root闭合新Runtime/Handoff/Common raw refs并通过production verifier。
- [ ] 新`clean-<source12>`原子安装、安装后重验和fixed Postverify通过。
- [ ] 旧release root未覆盖、未删除、未修改。

## Status Boundary

- [ ] 只有全部Build/Verify/Rebuild完成才记`IMPLEMENTED/CONTROLLED_VALIDATED`。
- [ ] 未执行production `194/388`时继续记录`GATE-06-03=NOT_RUN`。
- [ ] 未生成Candidate、Activation、Capability enablement或ISO结论。

## Rollback

- [ ] 只回退精确source delta和未激活的新版本入口。
- [ ] fixed切换失败使用既有backup恢复JSON。
- [ ] 不删除旧`clean-*`、用户SQLite或历史evidence。
