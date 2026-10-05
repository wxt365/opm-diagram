# OPD 架构关联追溯

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：实现 FR-METHOD-002 的同模型 OPD 输入、生成、追溯关系记录和双向查询导航；显式关联与父子细化分别展示。
非目标：跨模型关联、自动推断/生成架构、严格三层顺序、架构决策、功能信息模式、ISO 符合性判断。
允许：相关 application/semantic/storage 草稿实现、web 方法面板与会话、契约生成器及生成物、设计说明、定向测试、本 Spec。
禁止：数据库 schema/迁移、依赖/配置、语言 Profile、原案例内容、无关重构、.harness。

契约：语义 0.5 派生于冻结的 0.4；Context 可选 architecture_links 数组，单条含 link_id、target_context_id、kind(INPUT/GENERATES/TRACE)，源是所属 Context。不属于语言 Fact，不产生画布关系/OPL。摘要继续 SaveContentDigest/2，沿用 Context 内容集合与算法，通过独立 0.5 schema 校验，旧 schema/摘要不变。首次新增升级，删除和分类修改不得降级。CREATE_ARCHITECTURE_LINK/DELETE_ARCHITECTURE_LINK 复用 METHOD_METADATA 候选、exact token、Journal、Delivery 和历史事务。新增由当前源图发起；删除允许从任一端发起，要求当前图为端点。重复源/目标/种类视为 no-op，重试复用幂等收据。禁止自连/缺失目标/未知种类/伪造授权；允许回环，闭包必须有限。不强制图分类或类别顺序，用户可迭代调整。
删除 OPD 时外部图引用子树须阻止删除，内部关联随子树删除；导出 OPD 将显式关联的两端及依赖纳入闭包，不能产生悬空引用。JSON 1.0 支持语义 0.5，旧客户端拒绝不支持版本。

验收：
- T1：新增三类有向关联，输入/生成方向文字清晰；两端均显示、可导航、可删除；只读禁改，空态/错误重试，窄屏不溢出。
- T2：非法值、自连、错图、未知目标/链接、旧 token 和错误授权拒绝；no-op/幂等/失败原子回滚及操作历史。
- T3：摘要/读写保留，旧版本不变，普通元素编辑和分类修改不降级；保存重开、固定历史隔离。
- T4：子树外部关联阻止删除，删除关联后可删；内部关联可随子树删除；导入引用与重复身份合法性校验。
- T5：关联闭包导出、跨项目后端迁移、真实浏览器独立模型导入/编辑/保存重开，源模型不变；回环闭包终止。
- T6：契约/后端/前端定向回归及真实画布创建元素与多图，桌面/390px 视觉检查；回收隔离模型，原案例不修改。

回滚：撤销本任务增量，保留其他工作区修改和已经导出的 0.5 文件；旧客户端明确拒绝，禁止静默去掉关联回写。

## Plan

1. 扩展 Context 方法元数据及复制点、独立 schema、摘要分派和版本升级守卫。
2. 关联应用规则、元数据命令与查询、子树删除依赖、迁移闭包。
3. 表单、入站/出站列表与删除操作、现有图导航，所有写入复用草稿队列。
4. 定向测试、构建更新本地后端、真实画布与迁移生命周期验证。

## Checklist

引用本 Spec 的 T1–T6。边界确认：API/语义文件 schema 允许；数据库/迁移/依赖/配置/.harness 禁止。
- [x] T1–T2
- [x] T3–T4
- [x] T5–T6

## 验证记录

T1：WorkbenchMethodLinks 的两项组件测试覆盖禁止自连/重复、出入站方向、确认删除、只读导航、加载禁用和切图重置。真实浏览器从两端导航及删除入站关联；1440px 和 390px 滚动检查顶部表单及底部列表，面板 scrollWidth 不超过 clientWidth，截图已人工查看。

T2：DraftWorkspaceControllerTest 覆盖三种关联、回环、重复 no-op、同 command_id 幂等重试、旧 token、错误 scope/选择/端点/授权、未知目标/关联和未知种类。SQLite BEFORE INSERT draft_receipt 故障注入验证正文、token、Journal、收据及操作历史整体回滚；无关第三图不能删除两端关联。历史捕获名称及有向关系，浏览器错误注入验证失败不提前添加记录。

T3：MethodArchitectureSchemaTest 和 MethodClassificationSchemaTest 验证冻结旧 schema 拒绝关联字段、摘要分派及 split/join、Reader/Writer。Controller 验证关联后分类、普通元素编辑和新增兄弟子图保留关联及 0.5。浏览器保存重开、固定历史隔离和只读导航通过；全部关联和子图删除后保存重开仍为 0.5。

T4：Controller 验证外部入站关联阻止子图删除，从目标删除关联后可删。浏览器验证内部回环随子树删除，无残余图；跨项目迁移测试拒绝缺失目标、自连、重复源/目标/种类、跨类型身份重复和非法种类，零新增模型。

T5：OpdTransferServiceTest 验证关联两端及父级/语义依赖闭包、回环终止、跨项目导入和来源不变。浏览器下载固定历史 JSON，导入独立模型后新增画布元素、改分类、保存重开；关联不丢失，新增元素与 occurrence 数一致，画布可见。源模型迁移前后 contexts/elements/features/states/facts/occurrences/layouts/state_presentations/refinement_edges 逐项相同，草稿身份一致。

T6：后端第一组 79 项、补充边界 1 项、固定摘要与 Journal 回放 13 项，共 93 个不同用例通过；前端 7 文件 140 项通过；草稿契约 14 项通过。typecheck、lint、web build、Maven package、两个生成器 --check、git diff --check 均通过。真实浏览器关联主流程和三项分类/6×1回归通过，无 pageerror；原 PROC 回归未发出 commands/save/pin 请求。测试模型使用正常回收站操作收尾，活动模型仍为原 5 个，本轮活动测试模型为 0。

实际命令与证据：
- Maven 使用 Java 21 和 Maven 3.9.10，`-pl services/local-runtime -am -Dtest=DraftWorkspaceControllerTest,MethodArchitectureSchemaTest,MethodClassificationSchemaTest,MethodSummaryQueryTest,OpdTransferServiceTest,DraftSaveControllerTest,OpdTransferControllerTest -Dsurefire.failIfNoSpecifiedTests=false test`；日志 `/private/tmp/opm-trace-backend-test.log`。增补 `DraftWorkspaceControllerTest#addingAnotherChildKeepsLinksAndUnrelatedContextCannotDeleteThem`；日志 `/private/tmp/opm-trace-extra-boundary.log`。
- 同样的 Maven 配置执行 `-Dtest=SaveContentDigestV1Test,DraftJournalRepositoryTest`，6+7 项通过；日志 `/private/tmp/opm-trace-digest-journal.log`。
- `npm run test --workspace=@opm/web -- src/modules/workbench/WorkbenchMethodLinks.spec.ts src/modules/workbench/WorkbenchMethodPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts src/modules/workbench/WorkbenchBottomPanel.spec.ts src/stores/workbench/methodSummary.spec.ts src/stores/workbench/operationHistory.spec.ts src/shared/api/draftWorkbenchSession.spec.ts`；日志 `/private/tmp/opm-trace-web-regression.log`。
- `node --test scripts/draft-workspace-contract.test.mjs`；日志 `/private/tmp/opm-trace-contract-test.log`；`node scripts/generate-opd-refinement-contract.mjs --check`、`node scripts/generate-draft-workspace-contract.mjs --check`。
- `npm run typecheck`、`npm run lint`、`npm run build --workspace=@opm/web`；日志 `/private/tmp/opm-trace-{typecheck,lint,build}.log`。Maven `-DskipTests package` 仅用于打包，不能替代上述运行测试。
- Playwright 使用 `OPM_E2E_EXTERNAL_SERVERS=true`、`OPM_PLACEMENT_PROJECT=project.9ae0e3dd46ae4f3a8b45520c5057ecd7`，配置 `tests/e2e/playwright.config.ts`，运行 `workbench-method-trace.spec.ts`；最终证据 `/private/tmp/opm-trace-final-e2e`，日志 `/private/tmp/opm-trace-final-e2e.log`。回归 `workbench-method-classification.spec.ts`、`workbench-method-summary.spec.ts`；证据 `/private/tmp/opm-trace-regression-e2e`，日志 `/private/tmp/opm-trace-regression-e2e.log`。
- Ajv 2020-12 校验最终五个下载文件，分别通过 OPD JSON 1.0 包 schema 和 SaveContent Document 0.5；日志 `/private/tmp/opm-trace-artifact-validation.log`。导出包清除发布诊断元数据，此验证不代表完整发布 Revision schema 或 ISO 符合性通过。

兼容边界：语义 0.5、同模型关联、SaveContentDigest/2、OPD JSON 1.0；不改数据库、迁移、依赖或配置。后端在 17850 已加载新包，前端 5177 已热更新。冻结的 0.2/0.3/0.4 schema 无本轮增量。

## 本轮增量文件清单

- `specs/opm-method-trace-feature-task-spec.md`
- `scripts/generate-opd-refinement-contract.mjs`
- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `docs/contracts/schemas/opm-revision-v0.5.schema.json`
- `docs/contracts/schemas/opm-save-content-v2-trace.schema.json`
- `docs/contracts/schemas/opm-opd-json-v1.schema.json`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `services/local-runtime/src/main/resources/draftsave/save-content-v2-trace.schema.json`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevision.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionJsonWriter.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionValidator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticElementEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/ConstructDeletionPolicy.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftModelValidation.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodClassificationEdit.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodArchitectureLinks.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodSummaryQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftContextDeletion.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/OpdTransferServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/MethodArchitectureSchemaTest.java`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/stores/workbench/methodSummary.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchMethodPanel.vue`
- `apps/web/src/modules/workbench/WorkbenchMethodPanel.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchMethodLinks.vue`
- `apps/web/src/modules/workbench/WorkbenchMethodLinks.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchBottomPanel.vue`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `tests/e2e/workbench-method-trace.spec.ts`
