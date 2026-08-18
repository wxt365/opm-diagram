# Spec: DEV-CANVAS-06 Release Candidate Schema 实现

## Task Type

`feature`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

实现 `GATE-06-06` 已冻结的 Release Candidate Manifest/Report JSON Schema，并以 AJV 正反例锁定机器资产的最小结构、状态和关键不变量。同时让既有 Enablement Activation 守卫读取冻结字段名。

## 2. 范围

- 新增 Release Candidate Manifest/Report `0.1` Schema；
- 新增 Schema 正反例测试及 npm 定向入口；
- 修正 `release-canvas06-enablement.mjs` 对 Release Report 的两个冻结字段读取；
- 同步本规格与 checklist。

## 3. 非目标

- 不实现 ZIP/JAR/Web 静态打包、assemble、smoke、reporter、verifier 或 CI；
- 不生成 Manifest、Report、Candidate、Activation 或启用任何 Capability；
- 不修改 Runtime、Vue、API、SQLite、Profile/Rule/Grammar/Symbol、既有发布证据语义；
- 不将 Schema 通过解释为 `GATE-06-06 READY`。

## 4. 设计输入与实现映射

| 冻结输入 | 实现承接 | 验收方式 |
| --- | --- | --- |
| `GATE-06-06` 机器路径、identity、封闭对象 | 两个 JSON Schema 的 `$id`、`additionalProperties:false` | AJV 正例 |
| 发布构建、依赖锁、ZIP/JAR/Web dist、环境 | Manifest `source_build`、`dependency_locks`、`artifacts`、`target_environment` | AJV 缺字段/状态反例 |
| 6 case、2 lane、12 attempt、production gate disabled | Manifest `smoke_catalog`；Report `lane_results`、`aggregation`、gate observation | AJV 枚举与 READY 条件反例 |
| 20 个稳定失败码 | Manifest blocker / Report failure enum | AJV 非法 failure code 反例 |
| Activation 前置字段 | Enablement 守卫读取 `release_status`、`enablement_candidate_ref` | 定向脚本测试 |

## 5. 修改边界

允许修改：

- `docs/contracts/schemas/opm-dev-canvas-06-release-candidate-*.schema.json`；
- `scripts/validate-canvas06-release-candidate-schemas.test.mjs`；
- `scripts/release-canvas06-enablement.mjs`、其定向测试和 `package.json`；
- 本规格及对应 checklist。

禁止修改：

- `apps/web/**`、`services/local-runtime/**`、`packages/**`、`tests/e2e/**`；
- Schema 之外的 Release runner、构建/打包配置、生产 enablement 产物；
- `.harness/**`、公共 API、SQLite schema、业务语义。

## 6. 验收标准

1. 两个 Schema 均可被 AJV Draft 2020-12 编译；
2. 各有至少一个结构完整的合法样例，及关键状态/封闭对象/失败码反例；
3. READY Report 强制两个 lane、12 条 PASS attempt、零失败/跳过/重试和全程 disabled production gate；
4. Activation 守卫使用冻结 Report 字段，不再读取过时字段；
5. 定向 Schema 测试、现有 Enablement 测试、`npm run contract:validate` 和 `git diff --check` 通过。

## 7. 回滚

回退本任务新增 Schema、测试、npm 入口及 Enablement 守卫字段修正；不会影响任何已生成的 release evidence 或 production gate。

## 8. 已知限制

Schema 只验证对象形状和可局部表达的状态不变量。raw SHA、跨 Report 深度相等、ZIP/JAR 内容、环境指纹与 smoke 行为必须由后续 `assemble/smoke/verify` runner 验证。
