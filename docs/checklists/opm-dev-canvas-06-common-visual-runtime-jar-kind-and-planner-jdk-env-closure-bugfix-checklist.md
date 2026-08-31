# DEV-CANVAS-06 Common Visual Runtime JAR Kind 与 Planner JDK 环境闭包 Checklist

状态：`DESIGN_FROZEN / IMPLEMENTATION_NOT_ACCEPTED`

## Spec Mapping

- [x] 目标：关闭Request/Handoff/Plan Runtime kind冲突和Planner父`JAVA_HOME`漂移。
- [x] 范围：仅活动Request Schema、03C设计/规格/checklist及索引同步；后继代码范围仍为既有19项。
- [x] 非目标：不修改Handoff/Plan/Bundle/Runtime Ready版本，不执行8/144，不提升Gate。
- [x] 约束：source/staged Runtime身份分离，JDK只从exact `--java-executable`推导，零fallback。
- [x] 验收：Schema正反例、source/staged exact join、受控Planner env、首错和零输出。
- [x] 验证：strict Ajv、`npm run contract:validate`、目标链接、一致性扫描、`git diff --check`。
- [x] 回滚：Schema与active pointer一起回退，并恢复明确BLOCKED状态。

## Design

- [x] C01 Request `0.2 runtime_jar_ref.kind`固定为`LOCAL_RUNTIME_JAR`。
- [x] C02 Handoff/Plan/Request source ref固定四字段逐项相等。
- [x] C03 Request `runtime_jar_path`与source ref path分离，物理文件只复核raw length/SHA。
- [x] C04 Bundle source ref保持`LOCAL_RUNTIME_JAR`，staged ref保持`RUNTIME_JAR`。
- [x] C05 Runtime Ready保持attempt-local `RUNTIME_JAR`，只以raw identity闭合source ref。
- [x] C06 JDK根唯一由exact `--java-executable`的realpath父两级推导。
- [x] C07 `jdk_root/bin/jar`普通单链接、可执行、realpath和major 21验证已冻结。
- [x] C08 Planner环境固定五键，禁止父环境继承和fallback。
- [x] C09 Verifier独立重复JDK/jar验证但不重跑Planner。
- [x] C10 首错、exit 2/3/4和零输出事务边界已冻结。
- [x] C11 实现allowlist保持`19=8 M+11 A`，未扩大。
- [x] C12 Request/Bundle/Plan/Runtime Ready版本均保持不变。

## Implementation Acceptance

- [ ] I01 Request旧`RUNTIME_JAR`反例被拒绝，新`LOCAL_RUNTIME_JAR`正例通过。
- [ ] I02 Materializer和Verifier按source kind与staged raw identity分别复核。
- [ ] I03 Builder在任何输出前验证derived JDK root和`bin/jar`。
- [ ] I04 Planner spawn显式传入精确五键env，不泄漏父进程变量。
- [ ] I05 父`JAVA_HOME`缺失/JDK17/恶意值三类反例不影响有效显式JDK21成功路径。
- [ ] I06 derived jar缺失/link/hardlink/非21/不可执行均exit 2且零输出。
- [ ] I07 Builder/Verifier全矩阵通过后才允许运行8/144。

## Validation

- [x] Request Schema strict Ajv编译和kind正反例通过。
- [x] `npm run contract:validate`通过。
- [x] 目标Markdown本地链接通过。
- [x] 活动状态、版本和Runtime kind一致性扫描通过。
- [x] `git diff --check`通过。
- [x] 本轮无需Maven/Playwright/8/144：未接纳或修改实现代码。

## 当前门状态

- 设计修正：`FROZEN_FOR_IMPLEMENTATION`。
- Builder/Verifier实现验收：`BLOCKED_UNTIL_CONFORMANT_IMPLEMENTATION`。
- Node adapter：`BLOCKED_BY_ADAPTER_TEST_INPUT_BUILDER_IMPLEMENTATION`。
- `8 base/144 clone`：`NOT_RUN`。
- Gate、Candidate、Activation、Capability、production、ISO：不提升。

