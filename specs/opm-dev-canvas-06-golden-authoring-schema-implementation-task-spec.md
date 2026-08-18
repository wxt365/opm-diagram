# Spec: DEV-CANVAS-06 Golden Authoring Schema 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GOLDEN-AUTHORING-01`：将已冻结的 Capture Plan、Approval Record、Authoring Report 三类机器资产落为 JSON Schema，并提供正反 contract test，作为后续 planner、author、publisher 和只读 verifier 的输入边界。

## 2. 范围

- `docs/contracts/schemas/opm-dev-canvas-06-golden-*.schema.json` 三份 Schema；
- `scripts/validate-canvas06-golden-authoring-schemas.test.mjs` 与 `package.json` 测试入口；
- 本规格及对应 checklist。

## 3. 非目标

- 不实现 Capture Planner、candidate author、Approval verifier、immutable publisher 或 approved verifier；
- 不生成或批准 PNG、blank baseline、Golden Environment、Visual Manifest/Report、Candidate 或 Activation；
- 不修改 Profile/Rule/Grammar/Symbol、公共 API、SQLite、Runtime、Vue 或既有 P0 E2E；
- 不将 Schema 通过表述为真实 authoring、`GATE-06-03` READY、Capability enablement 或 ISO 证据。

## 4. 约束

1. Schema identity、字段、状态和固定计数必须严格遵循 `docs/design/opm-dev-canvas-06-golden-authoring-design.md` 第 4、5、8、9 节；
2. 所有对象禁止额外字段，路径只允许所属根内的相对路径，digest 必须是小写 SHA-256；
3. Capture Plan 必须以 `1242` captures、`9` blank baselines 固定边界表达，且不允许任何 PNG/golden 结果字段；
4. Approval Record 仅接受 `APPROVED`，并表达 INITIAL/SUPERSEDE 的结构性字段边界；
5. Authoring Report 只允许 `READY_FOR_APPROVAL`、`APPROVED_PUBLISHED`、`BLOCKED`，且已发布状态必须声明 Approval 与 Golden Environment 引用；
6. 跨文件引用完整性、JCS SHA 重算、申请人与审批人不相同、版本比较和目录原子性不能由标准 JSON Schema 判定，必须留给后续 `GOLDEN-AUTHORING-02/04/05` runner，不得在本轮假称已验证。

## 5. 验收

1. 三份 Schema 通过 AJV draft 2020-12 编译；
2. Capture Plan 正例满足 `1242/9` 且未包含 golden PNG，含 golden 字段、错误计数和根外路径的反例被拒绝；
3. Approval Record 正例及 INITIAL/SUPERSEDE 结构反例被正确处理；
4. Authoring Report 对候选、已发布、阻断三种状态及缺审批/环境引用反例有稳定约束；
5. 定向 Schema test 与 `git diff --check` 通过。

## 6. 回滚

回退本规格列出的 Schema、测试、命令与 checklist 增量；不触碰 approved golden、Runtime 或既有发布证据。

## 7. 事实与假设

### 事实

1. Golden Authoring 设计已冻结，三类 Schema identity 和目录语义已明确；
2. 当前尚不存在真实 approved golden 或对应 runner；
3. 现有 Schema tests 使用 AJV 2020 并已作为 DEV-CANVAS-06 contract test 模式。

### 假设

无。
