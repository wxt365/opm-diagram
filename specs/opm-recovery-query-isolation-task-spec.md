# 恢复状态查询与辅助请求隔离

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: bugfix; Active Playbooks: none (primary)。repo-profile/task-types/playbooks 缺失，沿用 AGENTS.md。

## Spec
目标：新版本辅助信息不等待旧版本；工具栏恢复状态不遍历操作历史。
非目标：乐观编辑、数据迁移、改写持久恢复链、修改真实用户模型。
允许：工作台运行时及现有测试、draftWorkspaceSession/localRuntimeApi 与测试、草稿契约生成器及其既有生成产物、DraftWorkspaceController/Service、OperationHistoryRepository 及相关后端/契约测试、本规格。允许隔离测试数据与验证产物。
禁止：依赖、配置、数据库 schema、无关模块、.harness 写入；保留此前未提交修改。
契约：新增 POST draft/recovery-state，输入 request_id/draft_token；输出回显身份/token 的至多两个恢复项。旧 operation-history 不变；过期 token 拒绝，恢复提交校验不变。不提供全历史扫描回退。
验收：A1 新 token/model/context 的 details 独立执行，迟到结果不覆盖；同身份并发复用。A2 恢复查询固定一次，不依赖历史长度，支持 UNDO/REDO/两者/无、新分支及过期 token。A3 原保存、布局、只读、子图回退和历史分页保留。A4 契约生成、前后端定向测试、typecheck/lint/diff 检查；能使用更新后的服务时补充浏览器验证。
回滚：仅还原本轮增量及新增 endpoint；无数据变更，恢复链格式不变。

## Plan
1. 将 details 在途共享限定为 session/token/context/load sequence，移除跨身份排队。
2. 复用恢复槽，在同一只读事务中校验 token、直接读取对应历史详情并构造恢复状态。
3. 生成新增契约并接入工具栏；历史面板继续独立分页。
4. 更新慢请求及长历史验证，执行定向回归。

## Checklist
Spec: specs/opm-recovery-query-isolation-task-spec.md
- [x] 边界确认。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

## 实际验证
- 前端 WorkbenchView 143、operationHistory 2、relationLayout 11、draftWorkbenchSession 49，合计 205 项通过。新版本辅助结果在旧请求挂起时独立更新；旧结果释放后不覆盖；同 token 再次应用投影也不会复用已失效刷新。验证直接查询恢复状态、不扫描历史、响应 token 错配关闭入口及重试。
- SQLite 后端 DraftJournalRepositoryTest 13、DraftWorkspaceControllerTest 63、DraftWorkspaceContractTest 5，合计 81 项通过，BUILD SUCCESS。350 条补充历史下恢复查询无分页；覆盖无/单向/双向恢复、新分支、checkpoint 后恢复状态及过期 token。真实 HTTP controller 验证 meta token 回显和过期查询拒绝。
- Node 草稿契约测试 20 项通过；生成一致性、typecheck、lint、git diff --check 通过；Maven package 成功。仓库 wrapper 缺少 .mvn 配置，使用已安装 Maven、JDK 和仓库现有 runtime-maven-settings.xml 完成离线构建。
- 独立 SQLite 后端 17851 + 本地 5173 + Chrome：创建隔离项目/模型；扣留第一次 details 后，第二次编辑的 details 正常发出；删除/撤销后仅一次 recovery-state、零次 operation-history；重做和保存通过，pageerror 为空。验证脚本 test-results/recovery-query-browser.mjs 退出 0；临时数据仅在 test-results/recovery-query-runtime，未访问真实用户模型。首次临时浏览器脚本在断言全部通过后关闭过早导致代理请求销毁错误，修正收尾后重新执行成功；不是产品验证通过依据。
- 未执行 PostgreSQL 集成测试：当前会话未提供 OPM_PG_PASSWORD；未改写数据库凭据。未执行全库/跨窗口并发/复杂大图浏览器测试。长历史与状态链由存储回归覆盖。
- 主后端未重启；当前运行的旧主后端不支持 recovery-state，主工作台使用本轮前端前须同步升级并重启后端。新接口不回退全历史扫描；旧 operation-history 保持兼容。独立验证后端完成验证后停止。

## 本轮完整文件清单
此前 workbenchLayout.ts、relationLayout.spec.ts 及两份先前任务规格的未提交改动保留，不属于本轮新增变更。
- apps/web/src/stores/workbenchRuntime.ts
- apps/web/src/modules/workbench/WorkbenchView.spec.ts
- apps/web/src/shared/api/localRuntimeApi.ts
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- docs/contracts/openapi/opm-draft-workspace-v02.json
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java
- services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/storage/DraftJournalRepositoryTest.java
- specs/opm-recovery-query-isolation-task-spec.md
- 验证产物（忽略目录）：test-results/recovery-query-browser.mjs、recovery-query-backend.log、recovery-query-runtime.*.log、recovery-query-runtime/**。
