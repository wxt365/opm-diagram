# Checklist: DEV-CANVAS-06 Materialization Verifier 受控正反例闭包

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-materialization-verifier-controlled-cases-bugfix-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标映射：规格第 3、5 节；冻结 factory、`GFMV_*`、优先级和 Report/root 正反例。
- 范围映射：规格第 4 节；只修改列出的设计、规格、checklist、策略、索引和基线文档。
- 非目标映射：不修改 Schema、Java、Node、测试、SQLite、Evidence Bundle、golden 或 production gate。
- 约束映射：规格第 5 节；单一事实源、单变量变异、只读 tree digest 和稳定首错。
- 验收与验证映射：规格第 7、8 节；case coverage、跨文档引用、状态/计数和 Markdown 检查。
- 回滚映射：规格第 9 节；只回退本任务文档，不覆盖并行实现或证据。

## Reproduction

- [x] 当前主设计只列 verifier 检查范围与 `0/2/3/4`，没有稳定 `GFMV_*` 目录。
- [x] 当前测试矩阵没有受控 Report/root case ID、factory 和期望 top code。
- [x] 当前没有单变量 digest 重算规则，反例可能同时触发多个错误。
- [x] 当前没有 verifier 前后 root tree digest 只读断言。
- [x] 当前“额外项返回 3”与“非法 ref/root 返回 2”的分类边界不明确。

## Plan

- [x] 建立独立 bugfix Spec 与 Spec Mapping checklist。
- [x] 新增唯一受控 case catalog。
- [x] 修订 Materializer 主设计并升为 v1.3。
- [x] 同步 03A implementation Spec/checklist 和测试策略。
- [x] 同步 README 与冻结基线 v1.6。
- [x] 完成文档、状态、计数和 diff 验证。

## Design Closure

- [x] 冻结 130/130 正例 root factory、K001 alias 和单变量 clone 规则。
- [x] 冻结 verifier CLI 观察口径、`GFMV_*` 错误目录和退出码。
- [x] 冻结首错优先级、按 key 排序和双缺陷 priority case。
- [x] 冻结 6 个 Report 正例与 21 个 Report 反例。
- [x] 冻结 5 个 root 正例、19 个 root/input 反例和 5 个 priority 反例。
- [x] 冻结 single-key 只作诊断、full-root 才能证明集合完整。
- [x] 冻结 57 个 case 前后 tree digest 相等和零写入边界。
- [x] 冻结受控 case 不构成真实 release/ISO evidence。

## Acceptance Mapping

| 需求 | 设计承接 | 当前状态 |
| --- | --- | --- |
| factory/变异 | verifier controlled case catalog | `FROZEN` |
| 错误目录/优先级 | verifier controlled case catalog + Materializer v1.3 | `FROZEN` |
| Report 正反例 | verifier controlled case catalog | `FROZEN` |
| root 正反例 | verifier controlled case catalog | `FROZEN` |
| 03A 开发入口 | implementation Spec/checklist | `READY_FOR_DEVELOPMENT` |
| 全局冻结 | README + baseline v1.6 | `FROZEN` |

## Verify

- [x] catalog 为 `57=1+6+21+5+19+5`，20 个稳定 top code 均有受控覆盖。
- [x] 主设计、实现规格/checklist、测试策略和索引只引用一份 catalog。
- [x] Materialization Report/Marker Schema 未由本任务修改。
- [x] Java、Node、测试、package/POM、SQLite 和生产资产未由本任务修改。
- [x] 全仓 119 份 Markdown、28 个本地链接和全部围栏检查通过。
- [x] `32=22+10`、`blocked=0`、`cross_document_conflict_count=0` 复核通过。
- [x] `git diff --check` 和本轮新增文件 trailing whitespace 检查通过。
- [x] 纯文档任务未运行尚未实现的 verifier controlled cases，不声明 `57/57 PASS`。

## Risks And Residuals

- [x] case catalog 只关闭设计输入，不表示 runner/factory/fault port 已实现。
- [x] 当前 verifier 仍须按 v1.3 和 catalog 完整重验。
- [x] 真实 130 项 Report/SQLite、approved golden、GATE-06-03、Candidate 和 Activation 未生成。
- [x] ISO 19450:2024 状态保持 `EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 仅回退本规格允许的文档增量和版本指针。
- [x] 不回退或覆盖工作树中的 Schema、Java、Node、测试及其他用户改动。
