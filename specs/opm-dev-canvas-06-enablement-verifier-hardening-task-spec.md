# Spec: DEV-CANVAS-06 Enablement Verifier 守卫加固

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`

当前仓库没有匹配的 Node 发布工具链 playbook。

## 1. 背景与问题

当前工作树已经包含 `GATE-06-02` Enablement Schema、builder、verifier、activate/rollback runner 和两项隔离测试，但尚未生成真实 Candidate 或 Activation，也未启用任何 Capability。

现有实现存在以下冻结契约缺口：

1. `verify` 主要校验 JSON Schema、34 个 ID 和引用完整性，没有从 Intake 与 release evidence 重新计算 decision、batch、proposed set、manifest status 和 production gate；被篡改的派生字段可能继续通过；
2. 隔离测试直接构造最小 `GATE-06-06 READY` JSON 并生成 Activation，但当前没有可执行的 GATE-06-06 Report Schema/verifier 和 exact READY Report；该测试不能作为 Activation 前置闭包；
3. manifest 写入使用覆盖式写入，没有落实“同一 manifest 原始 bytes 不可变、新状态必须新文件”的守卫；
4. 符合性报告仍称 GATE-06-02 runner 未实现，与当前工作树和 checklist 不一致。

## 2. Root Cause

实现把 Schema 合法与派生语义合法混为一层，并用最小模拟报告覆盖了正向状态迁移，却没有为篡改、重复输出和缺少 exact GATE-06-06 证据建立失败测试。原实现验收只验证生成器能产出对象，没有验证 verifier 能独立重算和拒绝伪造状态。

## 3. Fix Strategy

1. 先增加篡改 Candidate、重复输出和缺少可执行 GATE-06-06 Schema/READY Report 的失败测试；
2. verifier 从 exact Intake 与四类 release evidence 复算 Candidate 的 dependency closure、coverage、decision、batch、proposed set、status 和 gate；
3. Activation 在 GATE-06-06 Report Schema 未实现或报告不能通过 Schema/ref/派生校验时必须返回非零且不写输出；
4. manifest 使用排他创建，禁止覆盖已有输出；
5. 只在验证通过后同步 checklist 和符合性报告中的“工具实现状态”，真实 Candidate/Activation 继续保持未生成。

## 4. 修改边界

允许修改：

- `scripts/release-canvas06-enablement.mjs`；
- `scripts/release-canvas06-enablement.test.mjs`；
- `docs/contracts/schemas/opm-dev-canvas-06-enablement-manifest.schema.json`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/reports/opm-implementation-design-conformance-test-report.md`；
- 本规格和对应 checklist。

禁止修改：

- GATE-06-03~06 的 Schema、runner、fixture、Report 和 Golden；
- `packages/**`、Profile/Rule/Grammar/Symbol、DEV-CANVAS-05 Handoff/Intake；
- `apps/**`、`services/**`、SQLite、OpenAPI、公共 API 和依赖；
- 生产 gate、真实 Candidate、Activation 或 Rollback 资产。

本任务不允许新增依赖，不允许生成仓库内 enablement manifest。

## 5. 验收标准

1. 合法 BLOCKED/READY Candidate 的隔离构建行为与冻结退出码一致，Candidate 始终 `production_gate=DISABLED + []`；
2. 修改 Candidate 的 status、proposed set、decision、batch 或 production gate 后，`verify` 必须拒绝；
3. 缺少可执行 GATE-06-06 Report Schema、非 READY、ref/SHA 或派生绑定不合法时，`activate` 必须拒绝且不创建输出；
4. 已存在输出路径不得被覆盖，原始 bytes/SHA 保持不变；
5. 测试只使用 `/tmp` 隔离目录，结束后仓库内无 Candidate/Activation/Rollback；
6. Enablement 定向测试、Intake 回归、契约校验和 `git diff --check` 通过；
7. 文档明确区分“Schema/runner 已实现”和“真实 Candidate/Activation 尚未生成”。

## 6. 验证方式

1. `npm run release:canvas06:enablement:test`；
2. `npm run release:canvas06:intake:test`；
3. `npm run contract:validate`；
4. 关键状态、禁止产物和文档一致性扫描；
5. `git diff --check`。

## 7. 回滚

只回退本任务对 Enablement runner/test/Schema 和两份状态文档的增量。不得删除或回退用户已有 Intake、Handoff、release artifact 和其他未提交改动。

## 8. 事实与假设

### 事实

1. 当前没有真实 Candidate、Activation 或 enabled Capability；
2. GATE-06-03~05 exact Report 和 GATE-06-06 READY Report 尚未生成；
3. 当前两项 Enablement 隔离测试通过，但覆盖不足以证明 verifier 闭环。

### 假设

当前未提交的 Enablement Schema/runner/test 是需要保留并加固的用户实现，不作为可回退的基线资产。
