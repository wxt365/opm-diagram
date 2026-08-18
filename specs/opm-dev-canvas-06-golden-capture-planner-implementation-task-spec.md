# Spec: DEV-CANVAS-06 Golden Capture Planner 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-02` Capture Planner：从 READY Intake、exact READY Handoff、Evidence Bundle 和 Common Fixture Catalog 在不读取任何 golden PNG 的条件下生成通过 Capture Plan Schema 的稳定 `1242/9` Plan。

## 2. 范围

- `scripts/release-canvas06-golden-plan.mjs` 与定向正反例测试；
- `package.json` 的 planner 命令；
- `scripts/build-dev-canvas-05-release.mjs` 的 Evidence Bundle 输入修复，使后续 clean build 打入 Handoff reports；
- 本规格及对应 checklist。

## 3. 非目标

- 不执行真实 Web build、浏览器启动、PNG/blank authoring、审批、发布或 approved verifier；
- 不重建当前 dirty worktree 的 DEV-CANVAS-05 release artifact 或改写已存在 Handoff；
- 不修改 Profile/Rule/Grammar/Symbol、公共 API、SQLite、Runtime、Vue 或既有 P0 E2E；
- 不生成 Candidate/Activation，不启用 Capability，不声明 `GATE-06-03` READY 或 ISO 证据。

## 4. 约束

1. Planner 只接受设计冻结的参数；显式拒绝 golden root、candidate root、PNG 和任何 accept/force 类参数；
2. 仅从 Evidence Bundle 物化 Coverage Catalog、Golden Manifest、Golden Replay、Symbol Catalog 和 PASS fixture，不得以 Handoff `reports/` 旁路替代 bundle；
3. 必须校验 `178=130 PASS+48 BLOCKED` 的 coverage/manifest/replay one-to-one exact join、两次 replay status/transaction 一致、binding 一致；
4. 输出前必须验证 Common Fixture Catalog 的 8 个 Visual subject 及其 source binding；
5. source root 必须 clean，source commit、lockfile、Node 22、runtime JAR 与 Handoff/Intake 精确匹配；archive列表与解包只能使用已验证的`${JAVA_HOME}/bin/jar 21.*`；
6. 输入失败必须退出码 `2` 或 `3` 且 Plan 目标零输出；相同输入及 epoch 必须 byte-identical；
7. 历史旧 bundle 缺少 replay report 时必须继续被 Planner 阻断；新`clean-b940ac9bb734` Bundle已归档Handoff reports，并已生成生产READY Plan。

## 5. 验收

1. 受控 READY 输入生成 Schema-valid Plan，具有 `1170+72=1242` captures 和 9 blank baselines；
2. 生成过程中不需要或扫描 PNG；显式传入 golden 参数被拒绝；
3. 缺 bundle replay、join 不一致、Common Catalog binding 不一致和 dirty source root 均被阻断且零输出；
4. Evidence Bundle source和新clean release均包含 Handoff reports，且目标 replay entry唯一、raw SHA闭合；
5. 定向测试、Schema test、`git diff --check` 通过。

## 6. 回滚

回退本规格列出的 planner、测试、命令、release bundle source 与 checklist 增量；已存在 release artifact 和 approved root 均不受影响。

## 7. 事实与假设

### 事实

1. 当前 Handoff 为 READY，具有 178/130/48 上游证据和 exact Runtime JAR；
2. 历史 Evidence Bundle 缺少`handoff/reports/golden-replay.json`，不满足冻结 Planner 输入契约；新`clean-b940ac9bb734` Bundle已包含该entry并通过raw SHA复算；
3. 当前工作树不 clean，未被用作真实authoring source root；新Bundle、Web dist和Plan来自独立clean source commit；
4. 生产Capture Planner已消费新输入并使用`jar 21.0.7`生成`READY_FOR_AUTHORING` Plan，Plan SHA-256为`8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9`。

### 假设

无。
