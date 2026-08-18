# Spec: DEV-CANVAS-06 Recovery Schema 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GATE-06-05` 已冻结的 Recovery Manifest、test-only Gate Fixture、Recovery Report JSON Schema，并以 AJV 正反例锁定 `28=8+7+4+3+6` case、`56` 隔离 attempt、事务/重开形状、test-only gate 边界、稳定失败码和 READY 形状。

## 2. 范围

- 新增三份 Recovery JSON Schema；
- 新增 AJV 正反例测试和 npm 定向入口；
- 同步本规格与 checklist。

## 3. 非目标

- 不实现 fixture factory、fault runner、强停子进程、rollback evaluator adapter、reporter 或 verifier；
- 不注入故障、不生成 recovery/rollback manifest、不创建 Candidate/Activation、不启用 Capability；
- 不改 Runtime、Vue、API、SQLite、Profile 资产或现有 Enablement 行为；
- 不将 Schema 通过解释为恢复验收或 production gate 证据。

## 4. Spec Mapping

| 冻结输入 | 实现承接 | 验收 |
| --- | --- | --- |
| 三个机器资产 identity/封闭对象 | 三份 Draft 2020-12 Schema | AJV 正例 |
| `2/28/8/7/4/3/6/56` | Manifest/Report summary 与 catalog 尺寸 | READY 汇总反例 |
| test-only gate 边界 | Gate Fixture `test_only=true`、loader `REJECTED` | 非法 loader 状态反例 |
| 两次隔离 attempt、七项 snapshot | Report case/attempt/snapshot | attempt 数和状态反例 |
| 16 个稳定失败码与 READY 条件 | Report failure enum 与 READY 条件 | 非法 failure code/失败 READY 反例 |

## 5. 修改边界

允许修改：`docs/contracts/schemas/opm-dev-canvas-06-recovery-*.schema.json`、对应 AJV 测试、`package.json`、本规格与 checklist。

禁止修改：`apps/web/**`、`services/local-runtime/**`、`tests/recovery/**`、`packages/**`、既有 release/enablement runner、公共 API、SQLite、Profile 资产及 `.harness/**`。

## 6. 验收与回滚

1. 三份 Schema 可由 AJV Draft 2020-12 编译；
2. Manifest、Gate Fixture、READY Report 各有结构完整合法样例；
3. 覆盖固定计数、test-only loader、两 attempt、稳定失败码及 READY 状态反例；
4. 定向 Schema 测试、`contract:validate`、`git diff --check` 通过；
5. 回滚仅回退本切片新增 Schema、测试、npm 入口与文档。

## 7. 限制

Schema 不验证输入 ref/raw SHA、dependency graph、实际七写 delta、强停到达窗口、重开、幂等或 rollback 集合。上述行为必须由后续 release-only runner 和 verifier 在 exact release build 中验证。
