# Checklist: DEV-CANVAS-06 Golden Authoring 设计阻塞闭环

> 状态：`COMPLETE`。本 checklist 只记录文档设计修正，不构成实现、release 或 ISO 证据。

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-design-closure-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：规格第 2 节；关闭 Materializer、Golden Authoring 0.2 和跨文档状态阻塞。
- 范围：规格第 4.1 节；只修改明确列出的文档和未来实现规格。
- 非目标：规格第 3、4.2 节；禁止代码、Schema、DDL、测试、配置和运行资产变更。
- 约束：规格第 5 节；确定性、失败、quarantine、verifier、并发和审批链必须封闭。
- 验收：规格第 8 节。
- 验证：规格第 9 节。
- 兼容与回滚：规格第 10 节。

## Plan

- [x] 复现并记录 7 类设计阻塞。
- [x] 确认用户并行改动和只读/文档修改边界。
- [x] 修正 Materializer 设计与 03A 实现规格。
- [x] 修正 Golden Authoring 设计并建立 03B/04/05 开发包。
- [x] 同步 DEV-CANVAS-06、测试策略、执行包、索引和历史指针。
- [x] 重算冻结基线并完成结构/定向验证。

## Design Closure

- [x] stable projection 与 per-run evidence 已分离。
- [x] `generated_at`、payload SHA 和 raw database/report SHA 的重复执行语义已冻结。
- [x] Report content/engine/write 三类失败及 storage cleanup 已冻结。
- [x] primary/secondary failure、quarantine layout/marker 和升级规则已冻结。
- [x] Materialization Report semantic verifier 及全部调用方已冻结。
- [x] `--concurrency 1..4`、停止调度和排序规则已冻结。
- [x] Approval Record/Authoring Report/Visual Manifest `0.2` 字段增量已封闭。
- [x] approve/publish/verify 命令和 Applicant/Approver 边界已冻结。
- [x] 03B/04/05 独立实现规格与 checklist 已建立。
- [x] 当前状态、版本和 `32=22+10` 口径已同步。

## Verification

- [x] Materializer/Golden Authoring 文档不存在本任务识别的自相矛盾表述。
- [x] 当前文档不再声称 Materialization Report/Materializer 完全不存在。
- [x] 延期项不再使用开放式“待确定/待定义”状态。
- [x] `docs/specs` 共 114 份 Markdown 相对链接可解析，代码围栏成对。
- [x] `docs/contracts` 共 28 个 JSON 可解析，`npm run contract:validate` 通过。
- [x] 现有 Golden Authoring `0.1` Schema 定向测试 `6/6` 通过；不解释为未来 `0.2` Schema 已实现。
- [x] 现有 Materializer Node/Report `0.1` Schema 定向测试 `3/3` 通过；该历史任务后的 `v1.5` pending预验证/唯一四阶段quarantine与Catalog `v1.1` 63-case已由implementation checklist完成重验，production 130项仍未执行。
- [x] 现有 Visual/E2E `0.1` Schema 定向测试 `6/6` 通过；不解释为 Visual Manifest `0.2` 已实现。
- [x] `git diff --check` 通过。

## Risks And Residuals

- [x] 现有代码和 Schema 尚未按升版设计重新验收，已保留为显式遗留项。
- [x] Approval/Authoring/Visual Manifest `0.2` 仍是待实现机器资产。
- [x] 真实 130 项 materialization 和 approved golden 尚未生成。
- [x] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态未提升。

## Rollback

- [x] 仅回退本规格允许的文档增量。
- [x] 不删除或覆盖用户代码、Schema、测试、Handoff、Bundle、Report、SQLite 或 golden。
- [x] 回退导致歧义恢复时，全局设计门标记为 `BLOCKED_BY_DESIGN`。
