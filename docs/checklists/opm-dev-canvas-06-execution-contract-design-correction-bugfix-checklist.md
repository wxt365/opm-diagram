# Checklist: DEV-CANVAS-06 执行契约设计修正

状态：`COMPLETE`

更新时间：`2026-08-07`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| Spec职责 | 本清单映射 | 验证 |
| --- | --- | --- |
| 目标 | 依次关闭02B、Recovery launch、E2E工具链身份三项开放语义 | 三个Build分区全部完成 |
| 范围 | 仅设计、Schema、契约测试和状态入口；不改产品实现/数据/发布状态 | `git status`人工核对 |
| 非目标 | 不执行02B/Recovery/E2E生产流程，不生成Report/Candidate/Activation | 事实与遗留项核对 |
| 约束 | Revision `0.2`、E2E Manifest `0.1`、SQLite V1、既有release bytes不变 | Schema/raw文件检查 |
| 验收 | 字段、摘要、计数、原子协议、Java ref和source allowlist唯一闭合 | 定向Schema及文档检查 |
| 验证 | Recovery/Visual-E2E Schema回归、Markdown、状态、`git diff --check` | Verify分区记录 |
| 回滚 | 仅回退本包新增和同步增量，不触碰用户既有资产 | 文件清单与diff核对 |

## Input Gate

- [x] 已读取Revision `0.2` Text Artifact Schema和既有OPL Artifact摘要口径。
- [x] 已读取Visual Common `v1.1`、Recovery Execution `v1.4`和E2E Attempt Artifact `v1.1`。
- [x] 已确认E2E Report `0.1`封闭字段无法承载Java executable ref。
- [x] 已确认工作树包含用户既有未提交/未跟踪修改，本包不回退或覆盖无关改动。

## Build 1: 02B Empty Text Artifact

- [x] 冻结唯一空`text_artifact`字段和ID派生。
- [x] 冻结versioned preimage、JCS/SHA-256算法及Grammar exact join。
- [x] 冻结显式`text_traces=[]`及Revision digest包含规则。
- [x] 冻结SQLite/Verifier的`text_artifact_count/text_trace_count`和delta语义。
- [x] 同步02B与03C实现入口，解除Revision `0.2`矛盾但不提升实现状态。

## Build 2: Recovery Launch Protocol

- [x] 新增Launch Request `0.1` Schema及正反例。
- [x] 新增Launch Proof `0.1` union Schema及四类proof正反例。
- [x] 冻结32-byte challenge的权限、atomic publish、读取和清理边界。
- [x] 冻结`child-ready -> reachpoint -> parent-observed -> termination`单写顺序。
- [x] 冻结重复、超时、提前退出、原子写失败和首错映射。
- [x] 同步Recovery Runner规格和Execution设计版本。

## Build 3: E2E Java/Source Identity

- [x] 保留历史E2E Report `0.1`，新增活动Report `0.2` Schema。
- [x] 冻结Java executable byte mirror、version evidence和Report/ref exact join。
- [x] 新增Runner Source Set `0.1` Schema，固定完整路径allowlist和aggregate。
- [x] 冻结排除集及禁止glob/递归/Git/import动态发现。
- [x] 同步Runtime Process Artifact、E2E Runner规格和Artifact设计版本。

## Global Sync

- [x] 测试策略和开发执行包区分历史Report `0.1`与活动Report `0.2`。
- [x] 冻结基线追加本次复核记录并保持`32=22+10`。
- [x] `blocked/unresolved/cross_document_conflict=0`且`READY_FOR_DEVELOPMENT`。
- [x] 文档索引存在且不把设计冻结写成实现、Report或Gate完成。

## Verify

- [x] Recovery Schema正反例`17/17`通过。
- [x] Visual/E2E Schema正反例`15/15`通过。
- [x] Projection Digest `6/6`、Common JCS `2/2`回归通过。
- [x] Markdown相对链接、表格和围栏通过。
- [x] `docs/contracts/schemas`共`51`份JSON全部可解析，版本/计数/状态检查通过。
- [x] `git diff --check`通过。

## Risks And Residuals

- [x] 02B/03C仍未实现，8个base和144个clone仍未生成。
- [x] Recovery launcher/fault/proof producer及`28/56`仍未实现/执行。
- [x] E2E Report `0.2` producer/verifier、Java mirror和`194/388`仍未实现/执行。
- [x] 未生成READY Report、Candidate或Activation，未启用Capability。
- [x] production release未提升，ISO仍为`EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 回滚边界仅限本包新增Schema、规格、checklist、设计和同步增量。
- [x] 不删除或覆盖既有fixture、template、Manifest、Report、release root或用户数据。
