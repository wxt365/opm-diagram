# Checklist: DEV-CANVAS-06 Common Catalog E2E Asset 输出闭包修正

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
| 目标 | 关闭活动Catalog E2E ref与02B输出根冲突 | Build 1~3 |
| 范围 | 只修改设计、实现规格/checklist和全局入口 | 文件清单 |
| 非目标 | 不修改Builder/factory/fixture/Manifest/Report/release bytes | 状态与工作树核对 |
| 约束 | Catalog Schema `0.1`、`8/16`、历史`0.1.0`不变 | Schema与历史资产检查 |
| 验收 | 43文件根、全部ref、E2E final copy和失败边界唯一 | 契约一致性检查 |
| 验证 | JSON、Schema、Markdown、版本/状态、定向回归、diff | Verify分区 |
| 回滚 | 只回退本包文档增量 | Rollback分区 |

## Input Gate

- [x] 已确认活动Catalog Schema强制16个E2E条目。
- [x] 已确认02B `v1.3`输出布局缺32个E2E文件。
- [x] 已确认factory提供固定`e2eCases/e2eFixture`确定性生成入口。
- [x] 已确认现有E2E Manifest builder从checkout Common source布局复制输入。

## Build 1: 02B Output

- [x] Visual Common升为`v1.4`并冻结43文件exact inventory。
- [x] 冻结32个E2E base/input的factory生成算法、编码、排序和ref。
- [x] 冻结8 Visual与16 E2E共用唯一factory mirror。
- [x] 冻结完整root semantic verifier、tree digest和零输出事务。
- [x] 明确拒绝外部E2E root、source override和未解析ref。

## Build 2: E2E Manifest

- [x] `--common-fixture-root`只接受已验证Catalog `0.2.0`的43文件根。
- [x] final root固定逐byte复制完整树到`inputs/common/`。
- [x] Catalog、32个E2E、8个Visual和2个source mirror在final root内全部可解析。
- [x] 历史`0.1.0`、旧source布局和不完整root在写入前拒绝。
- [x] 旧`22/22`标记为历史快照，当前实现状态改为`CONTRACT_UPDATE_REQUIRED`。

## Build 3: Global Sync

- [x] 02B/E2E规格与checklist同步。
- [x] Golden Authoring、测试策略、开发执行包、toolchain checklist同步。
- [x] README与冻结基线升版，当前Visual Common指针统一为`v1.4`。
- [x] `32=22+10`、零设计冲突和`READY_FOR_DEVELOPMENT`保持不变。

## Verify

- [x] Catalog Schema历史`0.1.0`/活动`0.2.0`正例和未知版本反例`3/3`通过；factory为16 case，历史E2E文件为32个。
- [x] `43=1+8+32+2`、16 case顺序、32路径和factory ref规则跨文档一致。
- [x] Visual/E2E Schema `15/15`、Common JCS `2/2`、Color `2/2`、Projection `6/6`、Recovery `17/17`及`contract:validate`通过。
- [ ] 历史Common author回归为`1/2`：`CANVAS06_COMMON_FIXTURE_CATALOG_DRIFT`；这是旧Catalog实现漂移，活动43文件builder尚未实现，不能标记通过。
- [x] Markdown链接、表格、围栏、版本/状态术语通过。
- [x] `git diff --check`与本包文件尾随空白检查通过。

## Risks And Residuals

- [x] 02B Builder/Verifier尚未实现43文件根。
- [x] E2E Manifest Builder尚未实现新Common root消费与完整tree copy。
- [x] 旧`22/22`和历史Common author `1/2`不能证明新契约符合性。
- [x] 未生成E2E Manifest/Report、READY Gate、Candidate或Activation，未启用Capability。
- [x] production未提升，ISO仍为`EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 只回退本包新增Spec/checklist和责任文档同步增量。
- [x] 不删除或覆盖历史Catalog/fixture/Manifest、实现代码、release root或用户数据。
