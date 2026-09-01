# Spec: Common Projection Normalizer API 闭包

文档状态：`FROZEN_FOR_IMPLEMENTATION`

实现状态：`READY_FOR_CONTROLLED_IMPLEMENTATION`

## Task Type

`bugfix`

## Active Playbooks

- `backend-springboot (primary)`
- `testing`

## 1. 问题

`API-CTX-002` 当前只为部分 Fact 输出 `capability_id`，不输出 construct 的 `target_kind`。Common Projection `0.1` 要求每个 committed cell 包含这两个字段，且使用 `ELEMENT_NODE/STATE_LABEL/FACT_EDGE` role；callback 无法只依靠受控 Runtime/API 与页面状态完成深度比较。

## 2. 冻结修正

`API-CTX-002` 的 `constructs[]` 新增必填字段：

```text
target_kind = occurrence.targetKind().name()
capability_id = target Element/Feature/State/Fact 的 capability.capabilityId()
```

二者对每个 construct 均存在，不允许省略、null、从 Profile checkout 补值或按 label 推导。既有字段不删除，公共 command payload、SQLite DDL 和 Revision bytes 不变。

Normalizer 的唯一 role 映射为：

| `target_kind` | normalized `construct_role` |
| --- | --- |
| `ELEMENT` | `ELEMENT_NODE` |
| `STATE` | `STATE_LABEL` |
| `FACT` | `FACT_EDGE` |

`FEATURE`、`CONTEXT` 或未知值在 Common capture 中以 `GOLDEN_COMMON_NORMALIZED_PROJECTION_INVALID/3` 拒绝。Normalizer 按 `occurrence_id` 作为 `cell_id`，保留 API layout 的 `x/y/width/height/z_order`，state roles 仅 State 保留，否则空数组。随后按 `cell_id` UTF-8 byte lexical 升序排序；这就是 `committed_cells` 的唯一来源。

## 3. 修改边界与验收

允许修改：`LocalApiService.projection`、controller 定向测试、OpenAPI Projection schema、web wire type、Common browser normalizer 与定向测试、相关 03B specs/checklist。禁止修改 DDL、公共 command、fixture expected Projection、JCS owner、Candidate/Approval/Manifest。

验收：

- `API-CTX-002` 为 Element/State/Fact 输出完整 target/capability；
- 六个 fixture 类别 `ELEMENT/STATE/FACT` 的 mapping 正反例通过；
- 所有八个 Common fixture 的 expected committed cells 可由 Runtime Projection 和该映射深度比较；
- 无法映射的 target kind 不产生 observed result。
