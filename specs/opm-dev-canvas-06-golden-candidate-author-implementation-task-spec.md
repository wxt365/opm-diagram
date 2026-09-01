# Spec: GOLDEN-AUTHORING-03B Candidate Author 实现

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-03B`：从 READY Capture Plan、通过 semantic verifier 的 130 项 Materialization root、exact clean source build、Runtime JAR 和固定浏览器/字体环境，生成隔离 candidate 资产、`2484+18` 次确定性 attempt 证据和 `READY_FOR_APPROVAL` Authoring Report `0.2`。本包不审批、不发布、不写 approved root。

## 2. 设计输入

- `docs/design/opm-dev-canvas-06-golden-authoring-design.md` `v1.4`；
- `docs/design/opm-dev-canvas-06-visual-common-materialization-design.md` `v1.5`；
- `specs/opm-dev-canvas-06-golden-environment-v02-design-bugfix-task-spec.md`；
- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md` `v1.5`；
- `docs/design/opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md` `v1.1`；
- `specs/opm-dev-canvas-06-common-visual-fixture-contract-implementation-task-spec.md`；
- `specs/opm-dev-canvas-06-common-visual-materializer-implementation-task-spec.md`；
- Capture Plan `0.1`、Materialization Report `0.1` 和未来 Authoring Report `0.2` Schema；
- DEV-CANVAS-06 READY Intake/Handoff、Common Fixture Catalog 和固定工具链版本。
- `opm-dev-canvas-06-golden-candidate-author-input-closure-bugfix-task-spec.md`。

实现不得重新决定 capture ID/顺序、attempt 数量、环境指纹、等待条件、ref/SHA 算法、报告字段、失败码或性能阈值。

## 3. 前置条件

1. Capture Planner、Materialization Report semantic verifier 和 Golden Environment `0.2` Schema/semantic verifier 已完成；
2. 02B 已达到 `IMPLEMENTED/CONTROLLED_TEST_PASS`，新Common fixture/Catalog/Plan的semantic join通过；
3. 03C 已达到 `ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`，四份adapter机器契约、唯一ESM函数/144次callback、8个Common base、attestation、fresh clone和独立one-shot fault hook受控基线可用；真实 UI/fault/capture integration 由本03B完成后回填03C，禁止循环等待。唯一解释见 `opm-dev-canvas-06-common-visual-adapter-readiness-dependency-cycle-closure-bugfix-task-spec.md`；
4. 输入 Plan 为新 change ID 的 `READY_FOR_AUTHORING`，130 项 Family root 在 `--require-materialized` 下通过，旧 `GOLDEN-CANVAS06-20260803-001` 被 semantic preflight拒绝；
5. source checkout clean，Node 22/npm 10.9.4/Java 21/Playwright 1.57.0/Chromium 143.0.7499.4 可用；
6. 真实 release 执行必须使用新 clean Handoff/Bundle/Plan；受控 test Plan 只能证明实现。

当前仅在缺少上述 Adapter Readiness 时保持 `BLOCKED_BY_DEPENDENCY`。Adapter Readiness 成立后可进入受控实现，但第6项仍阻断真实 candidate、审批和 GATE-06-03 状态提升。

## 4. 修改边界

允许修改：

- 新增 `docs/contracts/schemas/opm-dev-canvas-06-golden-authoring-report-v02.schema.json`；
- Candidate Author、environment verifier、Common UI setup/capture adapter 的 `scripts/**` 和定向测试；
- `tests/e2e/release/**` 中仅与 candidate author 隔离 fixture/runner 相关的文件；
- `package.json` 中仅新增 03B 命令/测试入口，不新增依赖；
- 本规格、对应 checklist 和必要实现状态文档。

禁止修改：

- Authoring Report `0.1`、Capture Plan、Materialization Report、Approval Record、Visual Manifest 既有 Schema；
- SQLite DDL、公共 API、Vue 产品行为、Profile/Rule/Grammar/Symbol；
- Golden Environment `0.1/0.2` Schema（由独立 Environment Schema 切片负责）、Approval Record writer、Publisher、approved root、Visual Manifest/Report、Candidate/Activation；
- validation runner 的 golden 只读边界。

## 5. 实现责任

1. CLI 严格实现主设计第 7 章及输入闭包修正规格的十个参数，拒绝所有禁止参数和非空 candidate root；
2. 复核 Plan/Handoff/Intake、130 项 materialization、active binding、clean build、Runtime JAR、Web dist 和 source epoch；
3. 生成并校验完整 environment fingerprint 和实际 font refs，禁止隐式系统字体替代；
4. Family capture 每 attempt 从 130 个 immutable SQLite base 创建独立 clone；Common capture 只能静态ESM调用03C的`runCommonVisualMaterialization(request,captureCallback)`，从8个immutable base创建144个fresh clone并消费Schema-valid normalized result，禁止03B自行seed、选择API/SQLite路径、动态加载callback或重定义callback/result字段；
5. 固定单 browser lane，对 1242 capture 和 9 blank 各执行两次新 context，按 Plan 顺序稳定等待并生成 raw/geometry/projection 证据；
6. 只在两次 attempt 完全一致、计数闭合且无额外文件时保留 attempt 1 canonical refs；
7. 先原子写并通过 semantic verifier 的 candidate Golden Environment `0.2`，其完整 fingerprint、1242 PNG、9 blank 和 font refs 与 candidate content 深度相等；
8. 最后原子写 `READY_FOR_APPROVAL` Authoring Report `0.2`，包含 Environment exact ref、130/130 refs、2484/18 逐 attempt results、三个集合 SHA、verifier identity、完整资产 refs 和 payload SHA；
9. Report 写成后 candidate root 进入只读消费状态；runner 不提供接受/更新 golden 的命令。

## 6. 状态、失败与原子性

- 成功只产生 `READY_FOR_APPROVAL`；可归类执行失败可在 work root 产生 `BLOCKED` 诊断 Report，但不得产生 READY Report；
- 缺 capture、额外 capture、非确定性、环境/font/build/JAR/materialization 不一致固定退出 `3`；输入/Schema/ref 无效退出 `2`；未分类 I/O/内部错误退出 `4`；
- Report writer 采用同目录 fresh temp、fsync、Schema/payload verifier、atomic rename；已有目标不覆盖；
- 任一失败不得写 Approval、approved root、Visual Manifest 或修改 materialization base；
- attempt clone 可清理，base、Report 和 candidate 已完成 bytes 不得被重写。

## 7. 测试要求

1. Authoring Report `0.2` 三状态/三类 report ID 与 Golden Environment `0.2` 正反 Schema contract，重点覆盖 Environment exact ref、130/130、2484/18、payload/attempt SHA 和状态条件；
2. clean/dirty source、Node/npm/Java/JAR/Web dist/binding/source epoch 正反例；
3. OS/Chromium/browser executable/font/locale/timezone/color/reduced-motion/screenshot option 指纹正反例；
4. Family 130 base与Common 8 base/144 clone隔离，双attempt不共享Runtime/Web/context/view state，base digest不变；
5. Common 8 subject真实UI setup、normalized Projection深度/digest、focus/cell/geometry和一次性fault hook正反例；
6. `1242/2484/9/18` 计数、固定顺序、缺失/额外/重复和 attempt 不一致反例；
7. health/workbench/font/quiet-window/RAF geometry/projection 各等待阶段及 30 秒超时；
8. candidate root 非空、Report 已存在、temp/write/rename 故障和零越权输出；
9. 受控全量 author integration 通过，但不得冒充生产 approved evidence。

## 8. 验收与性能

验收必须证明：exact 输入闭包、单 lane/双 attempt、immutable base、固定环境、完整 refs/SHA、READY 状态和 approved root 零写入。性能采用主设计第 14.1 节：build `<=15 min`，单 attempt P95 `<=5 s`，全量 `<=180 min`，peak RSS `<=4 GiB`。

## 9. 验证命令

实现后至少执行：

```text
npm run release:canvas06:golden-authoring-schema:test
npm run release:canvas06:golden:author:test
npm run release:canvas06:golden:author -- <受控 Plan/source/JAR/materialization/candidate/epoch>
npm run release:canvas06:golden:materialize:verify -- <受控 Plan/root/require-materialized>
npm run contract:validate
git diff --check
```

## 10. 完成定义

Schema、runner、verifier、Common Factory、全量正反测试和性能证据全部通过；candidate report/refs/payload 可独立复算；implementation checklist 记录 exact 版本/命令/计数/SHA。不得宣称人工审批、approved publish、Visual Manifest READY、GATE-06-03、Candidate、Activation、Capability 或 ISO PASS。

## 11. 兼容与回滚

公共 API、SQLite、产品配置和 `0.1` 资产不变。回滚只删除本包新增的 `0.2` Schema/runner/test/命令，不删除任何 materialization、candidate、approved 或用户数据；失败不得通过降低环境、attempt、SHA 或只读守卫解决。

## 12. 事实与假设

事实：当前 `03B` runner 与真实 candidate 尚未完成；Authoring Report 和 Golden Environment `0.2` Schema/离线 verifier 已完成，但 runtime browser/font/Plan 闭包尚未实现。Common Runtime Materialization、Color Profile、Node adapter四份机器契约及one-shot fault实现边界已由Visual Common`v1.5`冻结，不再是设计待定项；03C 已达到 `ADAPTER_READY_FOR_03B_CONTROLLED_INTEGRATION`，其真实 UI/fault/capture integration evidence 仍由03B完成后回填，详见依赖环闭包修正规格。假设：无；真实环境 SHA、PNG 和性能必须执行生成。
