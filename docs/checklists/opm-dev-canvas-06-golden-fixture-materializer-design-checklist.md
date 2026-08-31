# Checklist: DEV-CANVAS-06 Golden Fixture Materializer 设计冻结

## Spec Mapping

- 当前任务规格：`specs/opm-dev-canvas-06-golden-fixture-materializer-design-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标映射：规格第 1 节；由 Materializer 独立设计、Golden Authoring 主设计和冻结基线共同承接。
- 范围映射：规格第 2 节；只新增设计与后续实现执行包，并同步既有发布设计入口。
- 非目标映射：规格第 3 节；不实现 Java/Schema/runner，不执行真实 SQLite materialization 或 authoring。
- 修改边界映射：规格第 4 节；仅允许列出的 `specs/**` 与 `docs/**`，禁止 `.harness/**`、代码、Schema、DDL、测试和运行资产。
- 约束映射：规格第 5 节；exact archive ref、确定性身份、受控 Runtime、空 storage、事务、报告和隔离必须全部冻结。
- 验收映射：规格第 6 节；通过字段、流程、错误、测试矩阵、引用和状态一致性验证。
- 兼容与回滚映射：规格第 7、8 节；公共 API/SQLite V1 不变，Approval Record 与 Authoring Report 生产目标均升为 0.2，文档可独立回退。

## Plan

- [x] 已核对 Capture Plan `archiveEntryRef`、Planner 临时解包清理和当前 Authoring Report 0.1 字段。
- [x] 已核对 `MS-REV-001` fixture 的 Model/Revision/binding 字段及 `project_id` 缺失事实。
- [x] 已核对 `ProjectDatabaseFactory`、SQLite V1 DDL、正式 commit 路径和现有 Golden Replay initializer。
- [x] 已确认 Materializer 不走公共 API、不复用随机 Project/Model 创建路径、不调用“下一 Revision”commit 路径。
- [x] 新增 Golden Fixture Materializer 独立设计。
- [x] 新增后续 implementation task spec/checklist。
- [x] 同步 Golden Authoring、DEV-CANVAS-06、测试策略、索引和冻结基线。

## Design Closure

- [x] 冻结输入选择、exact ref 链、ZIP 安全、fixture Schema/binding 校验和去重 key。
- [x] 冻结确定性 Project ID、原样 Model/Revision identity 和 collision 守卫。
- [x] 冻结空目标、Flyway、单事务写入顺序、table counts、完整性和数据库摘要。
- [x] 冻结 base SQLite 只读发布、attempt clone 隔离和禁止共享写库。
- [x] 冻结 release-only Runtime 条件装配、非 Web 模式、生产配置冲突和无 HTTP endpoint。
- [x] 冻结 Check 8 后的 Report 接纳点、pre-acceptance 零 Report、post-acceptance BLOCKED Report、真实 identity、摘要、Approval Record 0.2 集合覆盖和 Authoring Report 0.2 exact 引用。
- [x] 冻结并发、幂等、失败零业务输出、恢复、回滚、退出码和性能阈值。
- [x] 冻结实现分层、允许目录、自动化测试矩阵、完成定义和发布顺序。

## Acceptance Mapping

| 需求 | 设计承接 | 验证方式 |
| --- | --- | --- |
| exact MS-REV archive input | 主设计输入与前置校验 | 核对 Plan/bundle/entry/bytes 四层 SHA 与 Schema/binding 守卫 |
| 同身份 SQLite | 主设计身份与持久化 | 核对 Project 派生算法、Model/Revision 原样、事务与 table count |
| release-only Runtime | 主设计装配隔离 | 核对四项必要参数、non-web、production 冲突、零 RequestMapping |
| 启动校验 | 主设计 preflight | 核对 Bundle/JAR/binding/fixture/storage 五项均为写入前守卫 |
| 可复核报告 | 主设计机器契约 | 核对 Check 1~8 零 Report、Check 9 以后成功/阻断报告、payload SHA、database/identity evidence |
| Approval/Authoring 引用 | Golden Authoring 同步 | 核对 Approval Record 0.2 覆盖 Report/SQLite 集合，Authoring Report 0.2 必填 exact refs |
| 可直接开发 | implementation Spec/checklist | 核对分层、文件边界、测试、性能、回滚无待定项 |

## Verify

- [x] Materializer 设计没有 `TBD/待定/后续决定` 或未定义字段、状态、算法、参数和错误码。
- [x] Golden Authoring 编号、命令、状态机、报告版本和开发分包一致。
- [x] DEV-CANVAS-06、测试策略、冻结基线和正式索引口径一致。
- [x] `DFR` 责任计数与基线表格一致，历史快照注记已同步。
- [x] 新增相对引用均存在，Markdown 表格/围栏结构有效。
- [x] 限定修改文件 `git diff --check` 通过。
- [x] 本任务为纯文档设计，无需代码测试；未执行构建、Maven、E2E、materialization 或发布验证。

## Risks And Residuals

- [x] Materialization Report Schema、Node 集合编排、共享 binding 和代表性 SQLite seed 已部分实现；完整条件装配、preflight、报告闭包、130 项 JAR integration 和性能仍待实现包完成。
- [x] Approval Record 0.2、Authoring Report 0.2 Schema 与 Candidate Author 仍待独立实现。
- [x] 历史旧 Evidence Bundle 的 replay 输入缺口未被旁路；新`clean-b940ac9bb734` Bundle与生产READY Plan已闭合，生产Materialization仍未执行。
- [x] 尚无真实 Materialization Report、SQLite base、approved golden、Visual READY、Candidate 或 Activation。
- [x] Capability 仍未启用，ISO 证据仍为 `EVIDENCE_MISSING/无法判断`。

## Rollback

- [x] 如需回退，只回退本规格允许文件中的 Materializer 设计增量和同步状态。
- [x] 不删除、不覆盖现有 Schema、Planner、release artifact、Handoff、Evidence Bundle、approved 资产或用户改动。

> 历史快照说明（2026-08-26 更新指针）：本 checklist 记录首轮设计冻结。当前唯一口径为Materializer `v1.5`、Verifier Catalog `v1.1`、Golden Authoring `v1.4`、Visual Common Materialization `v1.5`及03C Adapter/Fault闭包、Golden Environment `0.2`、03A当前implementation checklist和冻结基线`v1.52`；本历史勾选不覆盖后续契约。
