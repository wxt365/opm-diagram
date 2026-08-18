# Checklist: DEV-CANVAS-06 Common Visual Index/UI/Source 设计闭包修正

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
| 目标 | 关闭 index seed、UI step、source ref 三类开放机器语义 | 三个 Build 分区全部完成 |
| 范围 | 只修改设计、Schema、实现入口和全局指针 | `git status` 与文件清单核对 |
| 非目标 | 不实现 Builder/Verifier/UI/Materializer，不生成 fixture/release evidence | 事实与遗留项核对 |
| 约束 | Revision `0.2`、SQLite V1、Catalog `0.1`和历史 bytes 不变 | Schema/DDL/raw文件检查 |
| 验收 | entry/step/source 均形成封闭机器契约和 exact mapping | JSON Schema、文档一致性检查 |
| 验证 | JSON/Schema、Markdown、术语/计数/状态及 `git diff --check` | Verify 分区记录 |
| 回滚 | 仅回退本包新增及同步增量 | 文件列表与 diff 核对 |

## Input Gate

- [x] 已读取 Visual Common `v1.2`、02B实现规格和当前历史 fixture/factory/author入口。
- [x] 已读取 `MS-REV-001/0.2` Schema与 SQLite V1五张目标表。
- [x] 已复现：`index_seed`仅有数组名、subject steps仅有文字简写、source ref没有闭合source trust/mirror。
- [x] 已确认工作树含用户既有大量未提交内容，本包不回退或覆盖无关修改。

## Build 1: Index Seed

- [x] 新 Common Visual Fixture `0.1` Schema定义五类封闭 entry。
- [x] 固定五类 entry 的 ID、时间、状态、null/空值、唯一键和排序。
- [x] 冻结 Revision/fixed input 到 SQLite V1 每列的一对一映射。
- [x] 冻结 8 个 subject 的 exact index counts/差量和 verifier 拒绝边界。

## Build 2: UI Steps

- [x] Schema定义 8 类参数 shape 和完整 `step_type` enum。
- [x] 每种 shape 为 `additionalProperties=false`，禁止自由 selector/script/payload/sleep。
- [x] 主设计给出 8 个 subject 的 exact `steps[]` JSON。
- [x] 固定 endpoint role、panel/group/mode、finding、fault command 等参数值与顺序。

## Build 3: Source Mirror

- [x] Builder/Verifier明确禁止`--source-root`和其他source override。
- [x] 冻结当前执行generator与静态导入factory的唯一owner、realpath、ordinary file、symlink/escape守卫。
- [x] 冻结 generator/factory 两项 allowlist 与输出 mirror exact path。
- [x] Catalog source refs只指mirror，Builder逐byte复核source/mirror。
- [x] Verifier只读验证self-contained mirror、raw ref和tree digest，不依赖外部checkout。
- [x] 冻结失败零最终输出、禁止Git metadata/额外source文件和版本变更规则。
- [x] 历史Catalog`0.1.0`保持不可变，活动Catalog固定升为`0.2.0`，Schema只兼容两个已知版本。

## Global Sync

- [x] 02B实现规格/checklist同步字段、CLI、布局、测试和错误边界。
- [x] 测试策略、开发执行包、DEV-CANVAS-06工具链 checklist同步。
- [x] README、全量冻结历史指针和冻结基线版本同步。
- [x] `32=22 FROZEN_INCLUDED + 10 FROZEN_DEFERRED`保持不变。
- [x] `blocked/unresolved/cross_document_conflict=0`且开发门恢复为`READY_FOR_DEVELOPMENT`。

## Verify

- [x] 全部新增/修改 JSON 可解析，Common Visual Fixture Schema按仓库标准Ajv 2020配置编译通过。
- [x] 五类 index entry、八类 step shape、13个step type、八个 exact subject arrays和两项source allowlist完整一致。
- [x] 历史Catalog`0.1.0`与活动`0.2.0`通过Schema版本边界验证，未知`0.3.0`被拒绝。
- [x] Markdown相对链接、表格、围栏和固定版本/状态术语通过。
- [x] `git diff --check`通过。

## Risks And Residuals

- [x] 02B/03C/03B仍未实现，8个完整fixture/base和144 clone仍未生成。
- [x] 本包不证明SQLite物化、UI setup、Projection capture或source mirror producer已运行。
- [x] 未生成READY Report、Candidate或Activation，未启用Capability。
- [x] production release未提升，ISO仍为`EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 只回退本包新增Spec/checklist/Schema和责任文档同步增量。
- [x] 不删除或覆盖历史fixture、Catalog、Plan、Handoff、release root、实现代码或用户数据。
