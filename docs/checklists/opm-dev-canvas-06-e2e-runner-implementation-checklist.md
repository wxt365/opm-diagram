# DEV-CANVAS-06 E2E Runner Implementation Checklist

状态：`IN_PROGRESS/FAMILY_MATERIALIZER_BLOCKED_BY_DEPENDENCY`。Family Identity Catalog设计已冻结，但新Handoff/Evidence Bundle、Manifest适配和Runner实现尚未完成；不得继续真实Family materialization。本 checklist 只跟踪 Runner/Reporter/verifier 实现与受控验证；即使全部完成，也不自动构成 production `194/388`、`GATE-06-03`、Candidate、Activation、Capability 或 ISO 证据。

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-runner-implementation-task-spec.md`。
- Artifact设计输入：`docs/design/opm-dev-canvas-06-e2e-attempt-artifact-design.md v1.3`、Family Fixture Identity Catalog `0.1/0.1.0`、Projection Digest Closure `v1.0/0.1`、E2E Attempt Artifact union Schema `0.1`、活动E2E Report `0.2`与Runner Source Set `0.1`；实现只读消费。历史Report `0.1`仅只读。
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
- [ ] 不修改 E2E Manifest `0.1`、活动Report `0.2`、Runner Source Set `0.1`、Attempt Artifact、Common/Visual Schema、OpenAPI、SQLite DDL、Profile/Rule/Grammar/Symbol/Handoff 或 Vue 业务行为。
- [ ] test-only materializer/fault launcher 默认生产启动不可达且无公共 API。
- [ ] 不把 controlled Report、代码完成或 Schema-valid 当成 production Gate READY。

## Build

- [x] Node 基础层已实现并有定向测试：闭合 production/controlled CLI 解析、固定 Report 路径、同目录 staging/全树 fsync/atomic rename、Manifest `inputs/**` 原始副本、production static/SPA loopback server、纯 Report 聚合和失败优先级；Report semantic comparison digest 已使用共享 RFC 8785 JCS owner；尚不生成最终 Report。
- [x] 只读 preflight 已复用 Manifest semantic verifier 与两类信任链，校验 clean source HEAD、Java 21、Chromium `143.0.7499.4`/SHA、34项Capability闭包和两个空闲 loopback 端口；任一失败发生在 staging 前。
- [x] 11类attempt JSON的filename/schema identity、递归封闭字段、fault映射、materialization、Runtime/Browser/Network/Console/Transaction/Reopen/API/Index join、Report投影和失败边界已由Artifact设计`v1.3`与union Schema `0.1`冻结；Family Project与attempt ordinal来源也已冻结，实现不得重新定义机器格式。
- [x] attempt artifact writer已实现固定filename-to-schema identity、JCS payload SHA、同attempt单链接原子写入、三类fault plan映射及10类核心artifact的raw index闭合；Runtime/Browser/Materializer producer仍待接入该writer。
- [x] Projection Digest Closure `v1.0/0.1`设计、preimage/vector Schema及4正/9负不可变vector已冻结；E2E Artifact设计现行为`v1.3`，全部Projection SHA沿用其`v1.2`冻结的Digest绑定，并追加Family identity/Fault Plan ordinal闭包。
- [x] 活动E2E Report已升级为`0.2`，冻结`runner_version=0.2.0`、Java executable byte mirror/version/release refs及23项Runner Source Set；历史Report `0.1`保持只读，E2E Manifest保持`0.1`。
- [x] `canvas06-projection-digest-v01.mjs`、Java `ProjectionDigestV01`及同一vector全链路parity已实现；`4`个正向量和`9`个负向量验证preimage、canonical bytes、SHA、错误码与JSON Pointer一致。
- [x] Common Fixture staging输入 verifier已实现并接入Runner preflight：复核Catalog `0.1`、active binding、16个唯一有序case、唯一Factory raw ref及`e2eCases`导出，并逐项比较`e2eFixture(case_id)+fixture_kind`与BASE/INPUT的JCS；Java materializer接入仍待实现。
- [x] release Playwright config已固定 Chromium、单worker、零retry、120秒超时、`zh-CN/Asia/Shanghai/light/reduce/DPR=1`及七项launch参数；不定义`webServer`、dev server或reuse-existing-server。
- [ ] 实现 production/controlled run CLI、模式互斥、白名单参数和 exact Report ID/path。
- [ ] 复用 E2E Manifest verifier，闭合 production READY Handoff 与 controlled descriptor 信任链。
- [ ] 实现 clean source、固定23项runner source set、JDK 21 executable mirror/version/release evidence、Playwright/Chromium、browser SHA 和端口排他预检。
- [ ] 实现 self-contained Report staging/final root、Manifest inputs逐byte复制、fsync和目录级atomic rename。
- [ ] 实现只服务 production dist 的loopback Web server；无Vite/HMR/外网proxy。
- [ ] 实现每 attempt fresh SQLite/Runtime/Web/browser/process/context/port proof和reopen cycle。
- [ ] Manifest/Handoff/Evidence Bundle适配并验证唯一Family Identity Catalog raw ref、178 -> 2集合与fixture deep join。
- [ ] 复用不含Project派生的seed kernel实现Family exact Revision和Common deterministic empty model的non-web materializer；Family Project只读Catalog，禁止Golden/Recovery派生或默认。
- [ ] plan builder先原子写入并验证`fault-plan.json`；Materializer及其余artifact只从该文件读取`attempt_ordinal`，禁止路径/循环下标反推。
- [x] Common Factory输出与BASE/INPUT raw fixture JCS相等；Common Catalog `0.1` bytes不修改。
- [ ] 实现三个Family driver和一个runner-owned Common driver，闭合178+16唯一case映射。
- [ ] 实现16-case fault plan/test launcher guard；普通production启动无法启用。
- [ ] 实现正式UI触发、稳定等待、同Revision Projection/OPL/Token/Trace和事务/reopen断言。
- [ ] 实现外网、console/pageerror、5xx、skip/retry/timeout检测。
- [ ] 实现全部必填attempt artifact、artifact index、source set aggregate和semantic comparison digest。
- [ ] 实现Report字段映射、194/388/34聚合、failure precedence和READY算法。
- [ ] 实现只读semantic verifier、`--require-production/--require-ready`守卫和tree digest不变性。
- [ ] `package.json`仅新增规格冻结的四个E2E release命令。

## Verify

- [ ] controlled完整194/388正例通过，130+16 PASS、48 BLOCKED、34 Capability聚合正确。
- [ ] production信任链正例只消费Manifest build副本，不执行build或启动dev server。
- [ ] 完整BLOCKED Report正例可验证，`--require-ready`拒绝。
- [ ] 参数、class、path、ref、digest、23项source allowlist、Java mirror/ref、JDK/browser/port反例通过。
- [ ] symlink/hardlink/extra、跨root、existing final、staging residual反例通过。
- [ ] Family/Common混用、Identity Catalog缺失/extra/重复/SHA/字段/Project命名空间drift、factory drift、非空storage、fault guard旁路和driver错映射反例通过。
- [ ] Fault Plan缺失/partial、Schema/payload错误、ordinal与case/path/schedule不一致均在SQLite/Runtime前稳定拒绝。
- [ ] 外网、HMR、skip/retry/timeout、console/pageerror/5xx反例通过。
- [ ] expectation、Revision、Projection、Text/Trace、transaction、reopen和nondeterminism反例通过。
- [x] Projection Digest正负零、subnormal、max finite、9类稳定错误及Node/Java parity通过；Common Visual normalized Projection仍使用其独立safe-integer算法。
- [ ] artifact缺失/extra/SHA、case/attempt/capability聚合和Report ID反例通过。
- [ ] 所有rename前故障final零输出；rename后fsync失败保留但不声明成功。
- [ ] verifier运行前后Report root tree digest相等且不访问网络。
- [x] `npm run release:canvas06:e2e:runner:test`通过`35/35`；其中production static loopback测试必须在允许绑定`127.0.0.1`的环境运行。
- [x] 历史/活动Report、Runner Source Set和Artifact Schema正反例已并入`npm run release:canvas06:visual-e2e-schema:test`并通过`15/15`；这只证明机器契约和局部join，不证明producer/verifier已实现。
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
