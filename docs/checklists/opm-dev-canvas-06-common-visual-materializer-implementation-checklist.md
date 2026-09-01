# Checklist: GOLDEN-AUTHORING-03C Common Visual Materializer 实现

状态：`PARTIALLY_IMPLEMENTED / CONTROLLED_8_BASE_144_ATTEMPT_PASS`。共享JCS parity、adapter/fault、Clone/Web Runtime、Adapter Request `0.2`及Adapter Test Input Bundle `0.1`设计已冻结；Java Base/Clone/Web mode、Clone Result和Runtime Ready已有受控实现。Adapter Test Input 的341文件Bundle与Node adapter真实8 Base/144 attempt固定callback路径均已通过；完整故障矩阵、真实UI setup、性能和release证据仍未完成。

Adapter Readiness：`ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`。真实 UI setup、一次性 fault、第二次正常提交、PNG 与双 attempt capture 由 03B 受控实现后作为本包 integration evidence 回填；不得将固定 callback 结果升格为该 evidence。见 `specs/opm-dev-canvas-06-common-visual-adapter-readiness-dependency-cycle-closure-bugfix-task-spec.md`。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md`。
- Task Type：`feature`。
- Active Playbooks：`backend-springboot (primary)`、`testing`、`design-module-docs`。
- 目标/设计输入/依赖：规格第 1 至 3 节。
- 允许/禁止修改：规格第 4 节。
- Runtime/SQLite/attestation/clone/fault/03B adapter：规格第 5 至 8 节。
- 错误/测试/验收：规格第 9 至 12 节。
- 回滚与 release boundary：规格第 13、14 节。

## Input Gate

- [ ] 02B checklist 全部通过，新 fixture/Catalog 通过只读 verifier。
- [ ] 全局开发门为 `READY_FOR_DEVELOPMENT`。
- [x] 受控Java 21、Maven产出的Runtime JAR、active binding和临时fresh work root已用于Java定向验证；其身份不构成production authoring输入。
- [x] 02B共用JCS parity vector存在且通过Node verifier。
- [x] Visual Common`v1.10`已冻结五类index逐列映射、固定ID/时间/状态/null、Revision到SQLite唯一编码和活动44文件输入root（含Common Setup Plan）。
- [x] Visual Common`v1.9`及后继闭包规格已冻结活动Adapter Request `0.2`、Adapter Test Input Bundle `0.1`、Runtime source/staged kind、Planner derived JDK env、其余三份adapter `0.1`、两份Clone/READY机器Schema、唯一ESM函数/CLI、144次callback、四种launch mode、动态端口/READY/关闭协议和独立one-shot fault port。
- [ ] 受控输入与 production authoring root 已隔离。

## Build

- [x] GFM/Base/Clone/Web四种launch mode、profile隔离与command-line source guard完成。
- [x] 主入口只退出三个有限mode，Common Web在READY后保持servlet长驻。
- [x] 8 subject SQLite V1 transaction seed、attestation与reopen验证由真实受控8 Base路径覆盖；故障rollback矩阵仍待完成。
- [x] attestation atomic writer 与只读 semantic verifier已由真实受控8 Base路径验证；篡改/写故障矩阵仍待完成。
- [x] 8 immutable base、72 capture x 2 attempt 的144 fresh clone已在固定callback受控路径完成。
- [x] packaged-JAR Clone CLI与Clone Result原子writer完成；完整篡改矩阵仍待Node adapter闭合。
- [x] Web Runtime动态loopback端口与Runtime Ready原子writer完成；完整篡改与关闭矩阵仍待Node adapter闭合。
- [x] 独立默认NOOP `VisualCommonCommitFaultPort`和`BLOCKED_FEEDBACK` release-only启动装配已实现并通过配置单测；实际一次性命令触发仍由03B真实UI覆盖。
- [x] 03C Common adapter、四份Schema、唯一ESM函数、144次固定callback、normalized result摘要和禁止override守卫已实现；03B candidate transaction不在本包范围。
- [x] Node adapter已按Request `0.2`完成exact Java 21与Profile root/五raw refs/tree/package/binding preflight，且无fallback。
- [x] Adapter Test Input Builder/Verifier已按`LOCAL_RUNTIME_JAR` source exact join、staged `RUNTIME_JAR` raw join和derived JDK/Planner五键env，原子生成并复核Profile 5、Common 44（含Common Setup Plan）、Plan 1242/72、Request `0.2`和144份完整Observed/PNG。
- [ ] default Runtime、公共 API、03A Family、SQLite V1 和产品配置保持不变。

## Verify

- [ ] guard 缺失/冲突/来源/Web/default/03A 反例全部通过。
- [ ] GFM/Base/Clone/Web lifecycle与web type正反例全部通过。
- [ ] 8 fixture identity、Revision JCS/raw digest、固定时间、五类index逐列/顺序/null、Projection、integrity/FK/sidecar闭合。
- [x] Java现有canonicalizer对10项共用vector的canonical JSON text/SHA与Node完全相等，safe integer边界、UTF-16 key排序、lone surrogate及其他非法值拒绝。
- [ ] migration/seed/commit/reopen/attestation/clone 故障稳定 rollback 且不触碰已有资产。
- [x] `8/72/144`、顺序、路径、base digest 和 attempt 隔离在固定callback受控路径通过。
- [ ] Clone Result和Runtime Ready的Schema/payload/ref/identity/nonce/PID/端口单变量篡改全部拒绝。
- [ ] 30秒READY、health/bootstrap、SIGTERM/10秒/SIGKILL、端口与SQLite sidecar关闭矩阵通过。
- [ ] `GOLDEN_COMMON_UI_SETUP_FAILED`经runner、Spring cause chain及packaged JAR均exit `3`，Java无第二份映射owner。
- [ ] fault hook 只对 exact subject/command 首次触发，第二次及其他模式为正常/no-op。
- [x] adapter request/invocation/observed/normalized Schema、CLI四模式、callback首错和`8/144`顺序已在定向受控路径通过；完整篡改矩阵仍待完成。
- [ ] exact packaged JAR integration 通过，不使用 exploded classpath。
- [ ] P95/总时长/RSS 满足 `5 s/30 s/1 s/512 MiB`。
- [ ] Maven、Node 定向命令、contract/backend 和 `git diff --check` 通过。

## Risks And Residuals

- [x] 受控 packaged-JAR 已完成一个 `STATE_ROLES` Base -> Clone -> Web 实测：READY公布不同的动态loopback应用/management端口，readiness为`200/UP`，Bootstrap为`200/application/javascript`，随后SIGTERM退出。该单例不替代8 base、144 clone/Runtime或production证据。
- [x] Adapter Request `0.2`已冻结exact Java 21 path/identity及Web所需Profile root/五raw refs/tree digest；设计缺口已关闭。
- [x] Adapter Test Input Builder/Verifier已以341文件活动Bundle、Runtime kind/Planner JDK env和Request `0.2`consumer/preflight完成定向验收；真实144次调度已通过。
- [x] 03C受控实现恢复03B实现依赖，不生成 production candidate。
- [ ] 真实UI setup由03C Web Runtime执行；144次PNG写入、PNG determinism和Authoring Report仍由03B callback/candidate transaction承接。
- [ ] production 8 base/144 clone、GATE-06-03、Candidate、Activation、Capability 和 ISO 状态不得提升。
- [ ] 现有局部`visualcommon` Java及fault hook字节不等于03C已实现，必须以本checklist逐项验收。

## Rollback

- [ ] 只回退 03C package、adapter、test/command 和窄 injection point。
- [ ] 不修改 SQLite V1，不删除 03A、历史、approved 或用户数据。
