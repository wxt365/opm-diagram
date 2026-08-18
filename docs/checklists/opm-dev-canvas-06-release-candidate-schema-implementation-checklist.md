# DEV-CANVAS-06 Release Candidate Schema 实现 Checklist

## 任务声明

- Task Type：`feature`
- Active Playbooks：`testing (primary)`、`design-module-docs`
- 当前任务规格：[Release Candidate Schema 实现](../../specs/opm-dev-canvas-06-release-candidate-schema-implementation-task-spec.md)

## Spec Mapping

| 规格项 | 目标/范围 | 非目标与约束 | 验收与验证 | 回滚 |
| --- | --- | --- | --- | --- |
| §1~2 | Manifest/Report Schema、AJV 测试、Activation 字段对齐 | 不实现 assemble/smoke/ZIP/Candidate/Activation | Schema 正反例、Enablement 测试、contract validate | §7 回退本切片文件 |
| §4 | 以 `GATE-06-06` 冻结字段为唯一输入 | 不新增状态、失败码或旁路 | `$id`、字段、READY 条件与 20 code 测试 | 不影响现有证据 |
| §5 | 仅 Schema/script/package/spec/checklist | 禁改前后端、Runtime、API、SQLite、Profile | `git diff --check` 与目录审查 | 删除新增文件并回退最小字段改动 |

## 实施清单

- [x] 新建 Manifest Schema：identity、source build、锁文件、发布产物、环境、6 个 smoke case、disabled gate、20 code blocker。
- [x] 新建 Report Schema：exact refs、产物观察、环境、2 lane/12 attempt、聚合、disabled gate、失败与 ISO 边界。
- [x] 将 Enablement Activation 守卫改为读取 `release_status` 和 `enablement_candidate_ref`。
- [x] 新增 AJV 正反例，覆盖 READY 合法性、非法 report 状态、非法候选 ref、非法失败码及封闭对象。
- [x] 新增 npm Schema 测试入口。

## 验证清单

- [x] `npm run release:canvas06:release-candidate-schema:test`
- [x] `npm run release:canvas06:enablement:test`
- [x] `npm run contract:validate`
- [x] `git diff --check`

## 事实、风险与遗留项

- 事实：`GATE-06-06` 的机器 Schema 字段、6/2/12 固定计数、20 失败码和 READY 算法已冻结。
- 事实：当前尚无 Release ZIP、静态打包、smoke runner、正式 Manifest/Report 或 Activation。
- 风险：Schema 不能验证 ZIP 内容、SHA、跨文件深度相等和真实浏览器行为。
- 遗留：后续独立实现 `assemble`、`smoke`、`verify`，并在可复核输入齐备后执行真实 Gate。
