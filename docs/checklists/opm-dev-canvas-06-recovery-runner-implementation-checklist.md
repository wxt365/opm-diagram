# DEV-CANVAS-06 Recovery Runner Implementation Checklist

状态：`IN_PROGRESS`；`RECOVERY-IMPL-01=IMPLEMENTATION_IN_PROGRESS/INPUT_BLOCKED`。Node Factory、独立 Helper 和定向正反例已开始实现；冻结 Runtime JAR `0cfe0f14...` 缺少 Factory 必需的 `Rfc8785JsonCanonicalizer` 与 `ProjectionDigestV01`，因此成功 attempt 的 exact Runtime 输入尚不可构造。该阻塞不允许用当前源码重建的不同 SHA JAR 替代。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-recovery-runner-implementation-task-spec.md`
- 设计输入：`docs/design/opm-dev-canvas-06-recovery-execution-design.md v1.5`、Projection Digest Closure `v1.0/0.1`
- Factory/Runner机器输入：活动Manifest `0.2`，Gate Fixture/Report/Attempt Materialization/Tree Descriptor、Reopen Catalog、API Request Artifact、Launch Request和Launch Proof `0.1` Schema
- 冻结机器输入：`tests/recovery/release/dev-canvas-06/templates/0.1.0/*.json`与`catalogs/0.1.0/recovery-reopen-expectation-catalog.json`；实现只读消费，禁止覆盖
- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`backend-springboot`、`design-module-docs`
- 目标/前置：规格第1、2节。
- 修改边界：规格第3节。
- 实现/行为：规格第4、5节。
- 测试/验收：规格第6、7节。
- 回滚/状态：规格第8、9节。

## Build

- [x] 两份`0.1.0` immutable template已冻结为只读实现输入。
- [x] template raw/payload verifier已实现，且没有重写、格式化或覆盖冻结bytes：固定 evidence-copy path、普通文件、raw SHA、RFC8785 payload SHA、四条 request digest、两类结果 digest 与 fixture digest 均由 Node 定向测试复算；SQLite attempt materialization仍未实现。
- [x] Reopen Catalog/Manifest `0.2`及raw/canonical/parsed HTTP ingress设计已闭合；Projection Digest `0.1`的preimage、binary64、Schema与4正/9负vector已冻结，浮点冲突已关闭。
- [x] Node/Java Projection Digest `0.1` normalizer及同一vector parity测试已实现；`4`个正向量和`9`个负向量验证preimage、canonical bytes、SHA、错误码与JSON Pointer一致。
- [ ] factory三个export及fresh attempt atomic materialization已实现：`loadRecoveryTemplate`、`materializeRecoveryAttempt`和`verifyAttemptMaterialization`已落地；信任链、staging、Helper 启动、Schema/摘要/只读校验和最终提交仍等待可复核的 exact Runtime JAR 正例。
- [x] `services/recovery-test-tools`独立模块、固定JAR Manifest/source commit和evidence mirror已实现；冻结构建命令会在 Recovery Helper profile 下保留普通 Runtime 编译产物，执行仍只允许 evidence root 中的 exact Runtime JAR。
- [-] Recovery Manifest `0.2`/Gate Fixture 的冻结 Template binding、Reopen Catalog exact join、28-case catalog、test-only gate composition及历史 Manifest `0.1`拒绝已由定向 Node 测试覆盖；完整 Builder CLI 已实现 source mirror、READY Handoff/Intake/Runtime/helper JAR 信任链、Schema 预写校验和 fresh evidence root 单次原子提交，并覆盖输出路径、late mirror failure 与既有 root 零覆盖反例；只读 semantic verifier 已复算 Schema、source mirror、Template/Catalog、Profile、Web tree、case catalog和Gate Fixture，尚未形成 Recovery Report或下游 Gate 证据。
- [x] 七个SQLite fault stage默认NOOP/test-only guarded实现已完成；production JAR仅包含无副作用port，`SingleShotRecoverySqliteFaultPort`仅在测试类路径。
- [ ] `recovery-test-launcher.jar`、canonical request Filter/Advice、Launch Request/Proof producer、32-byte challenge生命周期、四个reachpoint、single-writer atomic proof和OS强停launcher已实现。
- [ ] 新JVM reopen、018/021 idempotent replay和SERVICE_RECOVERY已实现。
- [ ] rollback同源evaluator adapter、production loader rejection和gate隔离已实现。
- [ ] snapshot、artifact index、Report writer和只读verifier已实现。
- [ ] test composition/launcher不进入production JAR/release ZIP。

## Verify

- [x] Recovery Manifest Builder 定向正反例通过：完整 source mirror/Manifest `0.2`/Gate Fixture `0.1` 原子发布、冻结输出路径拒绝、late mirror failure零最终root与既有evidence root零覆盖共`4/4`；既有28-case compose/input正反例`6/6`通过。
- [ ] template只读校验/factory正反例和双attempt隔离通过。
- [ ] helper JAR只含Recovery helper package，且Runtime JAR/release ZIP均不含helper/launcher测试资产。
- [ ] SQLite 21表精确集合/计数、关键行、JCS/raw列、Head、quick/FK和sidecar正反例通过。
- [x] 七hook真实transaction rollback和七项零delta通过：`SqliteRevisionCommitRepositoryTest`覆盖默认NOOP与七stage，`SingleShotRecoverySqliteFaultPortTest`覆盖单次命中与context不匹配拒绝。
- [ ] 四forced reach proof/kill/reopen正反例通过。
- [ ] raw/canonical/parsed request、Catalog join、重排/空白/BOM/重复键/错误SHA/超限/缺guard和零执行正反例通过。
- [x] Projection Digest `4`正/`9`负、正负零、subnormal、max finite、stable code/pointer和Node/Java parity通过。
- [ ] artifact raw ref/tree/order/required coverage/日志上限通过。
- [ ] rollback `3 partial + 1 full + 2 rejected`且真实gate不变。
- [ ] 受控`28/28` case、`56/56` attempt、两次digest一致。
- [ ] 普通Runtime/API/repository/enablement回归通过。
- [ ] contract/backend/JAR内容/`git diff --check`通过。

## Release Evidence

- [ ] exact clean source、Runtime/launcher/template refs和环境指纹已记录。
- [ ] 真实28/56 artifact tree完整且Recovery Report通过`--require-ready`。
- [ ] Candidate重新消费exact READY Recovery Report前未生成Activation。
- [ ] 未手工改变production gate或启用Capability。
- [ ] 未宣称ISO 19450:2024符合性。
