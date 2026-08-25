# Checklist: DEV-CANVAS-06 Visual/E2E 输入契约修正

> 状态：`COMPLETE/HISTORICAL_E2E_DECISION_SUPERSEDED`。本 checklist 只记录设计修正；其中E2E保持`0.1/0.1.0`的历史决定已被活动Manifest `0.2`设计和独立producer/verifier规格取代，不构成 builder、Manifest、Gate、release 或 ISO 证据。

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-visual-e2e-input-correction-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：规格第 2 节；冻结 builder/版本、Visual approved exact join 和 bundle class。
- 范围：规格第 3.1 节；只修改明确列出的设计与入口文档。
- 非目标：规格第 3.2 节；禁止实现、Schema、测试、bundle 和 release 资产变更。
- 约束：规格第 4 至第 7 节；owner、版本、exact join、目录、身份和失败边界必须唯一。
- 验收：规格第 10 节。
- 验证：规格第 11 节。
- 兼容与回滚：规格第 12 节。

## Plan

- [x] 复现 Visual `0.1/0.2` builder 双目标和 E2E 版本未决问题。
- [x] 核对 Golden Authoring `v1.3`、Visual `0.2` 与 E2E `0.1` Schema identity。
- [x] 冻结独立 builder owner、版本和单输出事务。
- [x] 冻结 Visual approved transitive exact join。
- [x] 冻结 `CONTROLLED_TEST/PRODUCTION_HANDOFF` 根、身份和禁止互用规则。
- [x] 将旧合并 builder 规格/checklist降级为历史。
- [x] 同步活动开发入口、release/test/index/baseline 文档。
- [x] 完成结构与一致性验证。

## Design Closure

- [x] Visual 唯一输出为 `schema_version=0.2/manifest_version=0.2.0/runner_version=0.2.0`。
- [x] 历史E2E曾冻结为`0.1/0.1.0/0.1.0`并拒绝全部Golden Authoring参数；该版本决定现已被活动`0.2/0.2.0`后继规格取代，拒绝Golden Authoring参数的边界继续有效。
- [x] Report/Approval/Environment/Plan/130 Materialization/database/八字段 exact join 已冻结。
- [x] `--input-mode` 必填且不能由路径推断。
- [x] controlled descriptor Schema identity、controlled/production bundle ID、source/output root 和证据边界已冻结。
- [x] `approved_version_ref` 字段必填；Visual 为对象、E2E 为 `null`，两者生成不同 identity。
- [x] 两种 class 和 descriptor mode 的八项互用拒绝已冻结。
- [x] 历史合并 builder 不再是活动实现入口。

## Verification

- [x] 活动文档只存在一个 Visual `0.2` builder 目标。
- [x] E2E 活动目标只保留 `0.1`。
- [x] Schema identity、字段名、数量和路径人工核对通过。
- [x] `approved_version_ref` 缺失、Visual=`null`、E2E=object 三类反例已形成明确验收输入。
- [x] Markdown 相对链接和代码围栏检查通过。
- [x] `git diff --check` 通过。
- [x] 未运行实现测试：本任务没有修改 builder、Schema、测试或 release 资产。

## Risks And Residuals

- [x] 受控 bundle descriptor/fixture、两个 builder 和 production verifier 仍待后续实现。
- [x] 真实 approved version、Visual/E2E Manifest/Report 和 GATE-06-03 仍未生成。
- [x] Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [x] 只回退本规格允许的文档增量。
- [x] 不删除或覆盖用户代码、Schema、测试、bundle、Manifest、Report 或 golden。
- [x] 回退后全局设计门恢复 `BLOCKED_BY_DESIGN`，不得恢复 production Visual `0.1` 输出。
