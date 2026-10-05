# 操作历史接入

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：frontend-vue (primary)、backend-springboot、testing。

## Spec

目标：在工作台操作历史中查看模型的真实编辑、手动保存、自动保存和固定版本记录，显示中文说明、OPD、时间与结果；可打开关联保存版本。
非目标：架构方法、语义撤销、用户身份审计、ISO 符合性声明、完整补回旧操作名称。
允许：web 工作台/API/store、local-runtime application/storage/API、现有契约生成器与生成产物、定向测试、设计文档、本 Spec。
禁止：数据库 schema/迁移、新依赖、配置变更、无关重构、改动案例模型、覆盖既有修改、写入 .harness。
契约：新增只读 operation-history 查询，严格校验请求与响应；保留既有编辑/保存收据格式。新编辑可读信息通过现有 idempotency_record 独立命名空间与编辑事务原子保存；保存及固定版本沿用真实收据，自动保存追加内部历史详情。前端通过 API 层访问，查询失败不阻断画布编辑。
旧记录：只展示收据/旧 Operation Record 可证实的信息，并明确详情缺失；不根据当前名称伪造历史名称。

验收：
- H1 新编辑记录包含中文操作与当时目标名、OPD名；幂等重放不重复，失败回滚不留记录。
- H2 手动/自动保存、固定版本可查看；保存重开及服务重启后仍存在；有保存版本可打开只读版本。
- H3 模型级记录按时间倒序分页，历史版本限制在该版本输入及保存时点，不混入后续编辑；模型隔离与非法游标拒绝。
- H4 面板加载、空、失败重试、加载更多、中文时间/结果清晰；切图、切模型与迟到响应不串数据，窄屏不溢出。
- H5 契约、后端真实 SQLite、前端定向测试、typecheck/lint、真实画布流程通过。

验证：契约生成与 Ajv 检查；后端事务/查询/Controller 定向测试；前端 store/面板测试；Playwright 创建隔离模型，在画布创建/改名/移动/删除/保存/重开/版本查看并检查窄屏与错误重试；实际重启后读取记录。
回滚：恢复本轮差异；新增详情保留在内部命名空间，可被旧程序忽略，无数据库迁移。禁止回滚其他轮次差异。

## Plan

1. 应用层生成中文编辑详情，存储层在既有事务追加记录；保存查询复用收据，自动保存记录与检查点原子写入。
2. 实现有界查询、版本截止与游标，生成严格契约。
3. 独立历史加载状态与竞态守卫；复用版本导航，布局局部化。
4. 定向验证后构建运行，完成真实画布与重启持久化验收。

## Checklist

Spec：specs/opm-operation-history-feature-task-spec.md
- [x] 边界确认：允许上述只读 API/契约与现有表内数据追加；禁止 schema/迁移/依赖/无关文件。
- [x] H1
- [x] H2
- [x] H3
- [x] H4
- [x] H5


## 实施与验收结果

- H1：新编辑在应用层捕获中文操作、名称及 OPD；与 Journal/收据在一个事务写入。真实 SQLite 触发器故障验证整个编辑回滚，重试仅产生一条记录；同 ID 重放不重复。单元素的批量布局命令显示为“移动或调整元素”。
- H2：真实画布创建/改名/移动/删除；观察自动保存与手动保存；打开保存版本并确认后续名称未混入。跨 OPD 通过复制永久链接生成固定版本，历史中可打开。实际后端 PID 6879 退出后，以同一目录重启 PID 8282；全新浏览器会话再次验证记录和版本保留。隔离测试模型均移入回收站。默认回归清理流程再次执行通过；最终只读查询确认活动模型仍为 5 个，活动历史测试模型为 0。
- H3：同时间分页 105 条返回 100+5 且不重复；非法/跨模型游标与未知版本拒绝。固定时钟下同 seq 的后续无变化编辑、重复保存、固定版本不会混入较早保存版本；历史不依赖 Journal 压缩。
- H4：模型级列表展示父图与子图操作、当时 OPD 名称；独立 loading/error/retry；首次读取失败与分页失败重试覆盖；迟到响应不覆盖新列表。真实 390px 窄屏截图无横向溢出，画布在历史读取失败时仍可编辑。
- H5：后端定向 76 项通过（5 个实际测试类）；后续加入同 seq 截止断言后 DraftSaveControllerTest 19 项通过，最终构建中 Controller 合计 54 项通过。前端定向 134 项通过，最终交互调整后 98 项再通过。草稿契约测试 11 项、完整 contract:validate、vue-tsc、ESLint、web build、Maven package、git diff --check 通过。浏览器三个流程分别实际执行并通过，重启验收需显式环境标记，不将默认跳过视为通过。

实际命令：
- Maven：`mvn -o -pl services/local-runtime -am test -Dtest=DraftSaveControllerTest,DraftWorkspaceControllerTest,DraftJournalRepositoryTest,DraftSaveRepositoryTest,DraftCheckpointRepositoryTest,DraftHistoryRepositoryTest -Dsurefire.failIfNoSpecifiedTests=false`（DraftCheckpointRepositoryTest 不存在，实际运行其余 5 类共 76 项；检查点事务由 DraftSaveRepositoryTest 覆盖）。
- Vitest：`npm --prefix apps/web run test -- src/stores/workbench/operationHistory.spec.ts src/modules/workbench/WorkbenchBottomPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts src/stores/workbench/findingsWorkflow.spec.ts src/shared/api/draftWorkbenchSession.spec.ts`。
- 契约与静态检查：`node --test scripts/draft-workspace-contract.test.mjs`、`npm run contract:validate`、`npm --prefix apps/web run typecheck`、`npm --prefix apps/web run lint`、`npm --prefix apps/web run build`、`git diff --check`。
- Playwright：外部本地服务 5177/17850，运行 `tests/e2e/workbench-operation-history.spec.ts` 的真实画布与跨 OPD 用例；需要跨进程复核时，首次运行设置 `OPM_HISTORY_PRESERVE_FOR_RESTART=true` 保留隔离模型；重启后设置 `OPM_HISTORY_RESTART_PROOF=true` 单独运行重启用例并回收模型。默认回归始终自动回收。

证据：`/private/tmp/opm-history-backend.log`、`/private/tmp/opm-history-final-package.log`、`/private/tmp/opm-history-frontend.log`、`/private/tmp/opm-history-frontend-final.log`、`/private/tmp/opm-history-contract.log`、`/private/tmp/opm-history-e2e`、`/private/tmp/opm-history-cross-e2e`、`/private/tmp/opm-history-restart-e2e`。

兼容边界：新增只读 V2 查询及其生成契约；既有编辑/保存收据保持兼容，无数据库 schema/迁移、依赖或配置变更。旧记录不承诺可恢复具体命令、旧名称与操作人；历史不是语义撤销，架构方法仍未实现。

## 完整改动清单

前端：
- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchBottomPanel.spec.ts
- apps/web/src/modules/workbench/WorkbenchView.vue
- apps/web/src/shared/api/localRuntimeApi.ts
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/stores/workbenchRuntime.ts
- apps/web/src/stores/workbench/operationHistory.ts
- apps/web/src/stores/workbench/operationHistory.spec.ts

后端：
- services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java
- services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSaveRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json

契约、文档与浏览器验证：
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- docs/contracts/openapi/opm-draft-workspace-v02.json
- docs/design/opm-modeling-workbench-page-design.md
- docs/design/opm-modeling-tool-application-api-contract.md
- tests/e2e/workbench-operation-history.spec.ts
- specs/opm-operation-history-feature-task-spec.md
