# Spec: DEV-CANVAS-06 Performance Schema 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GATE-06-04` 已冻结的 Performance Manifest、Raw Samples、Report JSON Schema，并以 AJV 正反例锁定 4 个 fixture、7 个 scenario、11 个 metric instance、原始样本完整性、稳定失败码与 READY 形状。

## 2. 范围

- 新增三个 Performance Schema；
- 新增 Schema 正反例测试和 npm 定向入口；
- 同步本规格与 checklist。

## 3. 非目标

- 不实现 fixture factory、Manifest builder、性能 runner、统计器、reporter、verifier 或性能发布配置；
- 不生成 fixture、raw sample、Report 或 `READY_FOR_ENABLEMENT_EVALUATION` 真实证据；
- 不执行 benchmark，不修改前后端、Runtime、API、SQLite、Profile 或业务语义；
- 不引入 benchmark/statistics 依赖。

## 4. Spec Mapping

| 冻结输入 | 实现承接 | 验收 |
| --- | --- | --- |
| 3 个资产 identity 与封闭对象 | 三份 Draft 2020-12 Schema | AJV 编译与正例 |
| `4/7/11/7/615/900/600/2115` | Manifest/Report summary、catalog 上界和 READY 条件 | READY 正反例 |
| Raw samples、单调时间与 integrity | Samples series/sample/integrity | 非法 status 与完整性反例 |
| 13 个 failure code | Report failure enum | 非法 code 反例 |
| READY 算法 | Report READY 时零失败、零干扰、固定统计计数与 PASS 状态 | READY 聚合反例 |

## 5. 修改边界

允许修改：`docs/contracts/schemas/opm-dev-canvas-06-performance-*.schema.json`、对应 AJV 测试、`package.json`、本规格与 checklist。

禁止修改：`apps/web/**`、`services/local-runtime/**`、`tests/performance/**`、`packages/**`、既有 release runner、公共 API、SQLite、Profile 资产与 `.harness/**`。

## 6. 验收与回滚

1. 三个 Schema 可由 AJV Draft 2020-12 编译；
2. Manifest、Samples、READY Report 各有合法样例；
3. 覆盖 READY 计数、非法 sample status、非法 failure code 及封闭对象反例；
4. 定向 Schema 测试、`contract:validate` 和 `git diff --check` 通过；
5. 回滚仅回退本切片新增 Schema、测试、npm 入口及文档，不影响任何性能或生产证据。

## 7. 限制

Schema 不计算 JCS fingerprint、SHA、nearest-rank、跨文件 ref/deep equality、阈值或真实浏览器/Runtime 性能。这些属于后续 fixture/runner/verifier 的职责。
