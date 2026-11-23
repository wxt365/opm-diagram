# 草稿状态查询优化规格

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: refactor; Active Playbooks: none (primary)。仓库无 repo-profile、task-type 或适用 playbook 文件。

## 目标与非目标

减少周期性 draft/open 和完整模型重放的开销，保留保存、冲突检测、迟到响应防护与自动检查点行为。不实施 SSE，不清理用户数据，不更新安装包，不重启现有服务。

## 边界与契约

允许：apps/web/src 内相关导航、状态与 API 实现/测试；services/local-runtime/src 内草稿存储和协调器/测试；docs/specs 和 docs/integration 中相关文档。允许给前端 Runtime 适配接口增加 draftSaveState 方法，复用已有 GET draft/save-state 和现有认证传输；HTTP 请求响应 schema 不变。禁止：数据库 schema/迁移、generated 合约、新依赖、配置及日志策略变更、其他业务、.harness、版本号、分发目录与 tgz、运行数据。

## 验收

补充边界：允许相关状态控制器/测试增加 Cache-Control: no-store 响应头；后端轻量期限检查调整为每秒一次，原期限不重置，正常调度下触发误差约 1 秒。HTTP schema 不变。

- A1：状态轮询使用 GET save-state；open 仅用于实际打开或完整回读。外部 token 变化仍转只读，晚到/编辑并发响应不覆盖当前状态。
- A2：空闲 15 秒、待检查点或保存中 2 秒；查询结束后再调度，失败退避最多 30 秒；隐藏/停用暂停，恢复立即同步，卸载清理，多实例独立。
- A3：后端状态查询和自动保存期限检查只读取元数据，不重放文档；实际打开、编辑和保存继续完整校验；期限和队列语义不变。
- A4：测试和使用文档同步，安装包及线上数据/进程保持原状。

## 验证与回滚

执行前端 API、Session、轮询生命周期及工作台回归，typecheck、lint/应用构建；执行后端 Journal/SaveRepository/Coordinator/Controller 定向测试。所有数据库测试隔离。回滚仅还原本次源码和文档，不触及数据；前端自定义 Runtime 适配器应同步实现新增方法。

## Plan

1. 新增轻量状态传输与 Session 校验，替换 runtime 周期读取。
2. 独立生命周期调度，监听状态切换并处理失败退避。
3. 增加存储元数据读取，由协调器用于期限和状态，复用现有字段和事务。
4. 定向验证后扩大前端回归，更新集成文档，登记实际结果。

## Checklist

- 边界确认：以上允许/禁止范围已核对，无数据/安装包操作。
- [x] A1（本文件#验收）
- [x] A2（本文件#验收）
- [x] A3（本文件#验收）
- [x] A4（本文件#验收）

## 实际验证

- 前端全部 55 个测试文件、467 项测试通过，包括状态传输、身份校验、冲突/迟到响应、调度频率、隐藏/停用、慢请求与失败退避。
- `npm run typecheck --workspace=@opm/web`、`npm run lint --workspace=@opm/web`、`npm run build --workspace=@opm/web` 通过；应用构建保留原有 opm-bootstrap 非 module 提示。
- 后端 DraftJournalRepositoryTest、DraftSaveRepositoryTest、DraftSaveCoordinatorTest、DraftSaveControllerTest、DraftWorkspaceControllerTest、DraftSaveServiceTest、DraftPinRepositoryTest、DraftHistoryRepositoryTest，共 118 项通过，Maven BUILD SUCCESS。包含损坏文档不被轻量查询重放、真正打开拒绝损坏文档、自动保存重启、检查点/历史一致性和 no-store 响应验证。
- `git diff --check` 通过；变更清单无版本号、安装包、配置、schema、.harness 或运行数据变更。未重启现有服务。
- 未运行外部安装包浏览器测试：该测试依赖重新生成组件分发产物，本次用户明确要求不更新安装包。未进行线上部署或性能压测；请求间隔由假时钟测试验证，元数据查询由隔离 SQLite 和真实协调器测试验证。

## 完整变更清单

前端实现：

- `apps/web/src/modules/workbench/useDraftStatePolling.ts`
- `apps/web/src/modules/workbench/useWorkbenchNavigation.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/workbench/contracts.ts`

前端测试：

- `apps/web/src/modules/workbench/useDraftStatePolling.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/shared/api/localRuntimeApi.spec.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.spec.ts`

后端实现：

- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftSaveController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveCoordinator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSaveRepository.java`

后端测试：

- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/DraftSaveCoordinatorTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftSaveRepositoryTest.java`

文档：

- `docs/specs/workbench-draft-status-optimization.md`
- `docs/integration/opm-workbench.md`
- `docs/integration/opm-workbench-user-guide.md`
