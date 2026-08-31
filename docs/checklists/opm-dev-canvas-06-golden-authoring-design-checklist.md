# Checklist: DEV-CANVAS-06 Golden Authoring 设计冻结

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-authoring-design-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标映射：规格第 1 节；由独立 Golden Authoring 主设计、上游引用和冻结基线共同承接。
- 范围映射：规格第 2 节；只新增设计包并同步 DEV-CANVAS-06 既有设计入口。
- 非目标映射：规格第 3 节；不实现 Schema/runner，不生成或批准 PNG，不生成发布证据。
- 修改边界映射：规格第 4 节；仅允许列出的 `specs/**` 与 `docs/**` 文件，禁止 `.harness/**`、Schema、代码、测试和运行资产。
- 约束映射：规格第 5 节；Capture Plan、环境固定、审批、不可变版本、runner 隔离和失败拒绝必须全部冻结。
- 验收映射：规格第 6 节；通过文档结构、计数、引用、状态、失败码与 Markdown 验证。
- 兼容与回滚映射：规格第 7 节；无 API/schema/配置/数据改动，文档可独立回退且不触碰并行实现。

## Plan

- [x] 已确认现有 `GATE-06-03` 的 `378/756/1242/2484` 数量、capture ID 算法、exact join 和 validation runner 只读边界。
- [x] 已确认当前缺少独立 Capture Plan、Approval Record、Authoring Report、INITIAL/SUPERSEDE 状态机和不可变 approved root 契约。
- [x] 已确认现有 Visual/E2E 并行实现为用户改动，本任务只兼容、不覆盖。
- [x] 新增 Golden Authoring 主设计。
- [x] 同步上游规格、release checklist、测试策略、冻结基线、文档索引和历史状态范围注记。

## Design Closure

- [x] 冻结三类机器资产的 schema identity、版本、路径、所有者、输入、输出和 exact ref。
- [x] 冻结无需既有 PNG 即可生成 `1242` capture ID 的 Capture Plan 算法、排序、集合 SHA 和拒绝条件。
- [x] 冻结 clean build、Runtime JAR、fixture materialization、Playwright/Chromium、字体、时钟和稳定等待协议。
- [x] 冻结 `plan/author/publish/verify` 命令、参数、写入边界、退出码和零输出语义。
- [x] 冻结申请人与审批人分离的审批字段、签署对象和 SHA 闭包。
- [x] 冻结 `INITIAL/SUPERSEDE` 状态机、版本号、不可变目录、并发、幂等、恢复和回滚语义。
- [x] 冻结 Golden Environment 与 Visual Manifest 对 approved Authoring Report 的前置守卫和失败码。
- [x] 冻结 validation runner 永久只读和禁止原地接受新图的权限边界。
- [x] 冻结设计、实现、真实 authoring、release READY、Capability enablement 与 ISO 证据的声明边界。

## Acceptance Mapping

| 需求 | 设计承接 | 验证方式 |
| --- | --- | --- |
| Capture Plan exact `1242` | 主设计 Capture Plan 章节 | 核对 `130×3×3 + 8×3×3 = 1242`、ID 算法、唯一性和集合 SHA |
| Author 固定环境 | 主设计 Author Protocol 章节 | 核对 build/JAR/materialization/Chromium/font/clock/wait 字段无待定项 |
| 审批记录 | 主设计 Approval 章节 | 核对必填字段、职责分离、签署摘要和 exact output path |
| 首轮与变更规则 | 主设计 Version/State 章节 | 核对 INITIAL 排他创建与 SUPERSEDE 只新建版本 |
| 失败边界 | 主设计 Guard/Error 章节 | 核对缺 capture、环境、审批、SHA、路径冲突均为零发布输出 |
| Manifest 守卫 | release spec/checklist + 测试策略 | 核对 Visual Manifest 必须消费 exact approved report/environment |

## Verify

- [x] 设计文档中 `1242`、`2484`、`378`、`756` 口径一致。
- [x] 三类新机器资产及其后续实现状态未被误报为已实现。
- [x] 所有新增相对链接目标存在，正式索引包含主设计与本任务记录。
- [x] 全局冻结基线已登记新设计责任且 `cross_document_conflict_count=0` 结论有本轮验证支撑。
- [x] 历史 `30/20` 冻结结果已标注为快照，当前实现符合性报告已明确未覆盖 `DFR-021`。
- [x] `git diff --check` 通过。
- [x] 本任务为纯文档设计，无需执行代码测试；通过结构化人工校对和只读命令验证。

## Risks And Residuals

- [x] Capture Plan、Approval Record、Authoring Report Schema 和 runner 待后续独立实现任务完成。
- [x] 当前没有真实 approved golden set、Golden Environment、生产 Visual Manifest 或 Visual Report。
- [x] `GATE-06-03`、Candidate、Activation 与 Capability 均保持未关闭/未启用。
- [x] 本设计不构成 ISO 19450:2024 符合性证明。

## Rollback

- [x] 如需回退，只回退本规格允许文件中的 Golden Authoring 文档增量。
- [x] 不删除、不覆盖现有 Visual/E2E 并行实现、证据或用户未提交改动。

> 历史快照说明（2026-08-26 更新指针）：本 checklist 的勾选记录是首轮设计冻结快照。当前状态以Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2`、Fixture Materializer `v1.5`、Verifier Catalog `v1.1`和冻结基线`v1.52`为准；03C Node adapter/fault/8 base/144 clone未完成、03B等待依赖，真实approved evidence仍待完成。
