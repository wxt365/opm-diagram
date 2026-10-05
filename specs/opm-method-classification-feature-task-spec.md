# OPD 架构层分类与细化追溯

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：在架构方法面板给当前 OPD 设置任务／功能／产品分类，展示全模型分类清单和已有父子图、展开元素的细化追溯并导航。
非目标：独立模型分类、自动继承分类、强制三层顺序、架构输入／生成关系、决策记录、自动生成架构、ISO 符合性判断。
依据：reference/基于OPL的架构建模方法20260425.pdf 第4章（草案），FR-METHOD-001 的 OPD 分类切片；FR-METHOD-002 仅既有细化关系导航，不能宣称完成全部追溯。

允许：本任务涉及的 application/semantic/storage 草稿实现、web 方法面板和草稿会话、契约生成器及生成物、设计说明、定向测试和本 Spec。
禁止：数据库 schema/迁移、依赖/配置、语言 Profile、原案例内容、无关重构、.harness 内容。
公共契约：新增 UPDATE_ARCHITECTURE_CLASSIFICATION 草稿命令及封闭 METHOD_METADATA 候选，权限来自当前本地会话和 exact draft token，不伪造语言能力。MethodSummary 增加 contexts/refinements。新增语义 0.4 可选 Context.architecture_level（MISSION/FUNCTION/PRODUCT，清除时省略）；旧 0.2/0.3 文件规则不改。摘要沿用 SaveContentDigest/2 算法及内容集合，在单独的 0.4 schema 中扩展 Context，分类进入摘要；旧字节不变，无数据库迁移。旧客户端明确拒绝 0.4。

验收：
- C1：当前 OPD 可设置/清除三类；新子图默认未分类，不自动继承；失败不冒充成功，只读版本禁改。
- C2：封闭命令/候选，非法值、错 context、过期 token、篡改授权拒绝；幂等重试/no-op、原子历史和草稿事务复用。
- C3：分类进入摘要；旧摘要不变；普通编辑、增删子图、读写不丢分类、不降持久版本；保存重开、历史隔离。
- C4：已有父子细化显示父图/子图/展开元素名称，跳图并定位元素；清单可导航，历史版本内导航。
- C5：JSON 导出/跨模型导入/继续编辑/保存重开保留分类、细化，来源不变。
- C6：后端、契约、前端定向回归，真实画布新建元素/子图，桌面/390px 检查，清理隔离测试模型；原案例只读。

回滚：撤销本任务增量，不覆盖既有修改；保留已经导出的 0.4 文件，旧客户端拒绝该版本，不能静默去除分类回写。

## Plan

1. 派生语义 0.4 与保存内容 schema，扩展 reader/writer、摘要分派及版本升级守卫、Context 复制点。
2. 新元数据候选独立封闭 variant；复用 Journal/Delivery，不走语言模板候选，查询加入分类/细化。
3. 当前图分类控件、模型分类清单和细化导航；借用现有导航与画布定位。
4. 定向测试后构建重启 runtime，真实画布与迁移生命周期验证。

## Checklist

引用：本 Spec 的 C1–C6；允许/禁止边界已确认。API/语义文件 schema 允许，数据库/迁移/依赖/配置/.harness 禁止。
- [x] C1–C2
- [x] C3
- [x] C4
- [x] C5
- [x] C6

## 验证记录

C1–C6 已完成本 Spec 定义的切片。

- 后端：77 项定向测试通过（DraftWorkspaceControllerTest 39、DraftSaveControllerTest 19、OpdTransferServiceTest 8、SaveContentDigestV1Test 6、MethodClassificationSchemaTest 1、MethodSummaryQueryTest 4）。随后增加分类收据故障原子回滚，Controller 40 项全部通过：共 78 个不同用例。故障触发在测试临时 SQLite，文档/token/journal/receipt/history 均保持原状态；未改用户库 schema。
- 前端：WorkbenchMethodPanel / methodSummary / draftWorkbenchSession / WorkbenchBottomPanel / WorkbenchView 共 134 项通过；typecheck、lint、build、contract:validate 通过，已冻结生成物检查通过，git diff --check 通过。
- 契约：Draft workspace 与旧保存摘要向量共 19 项通过；真实导出的历史文件、导入编辑重开文件和删除子图文件共 3 份分别通过 OPD JSON 1.0 与 0.4 SaveContent Document 的 Ajv 校验，6 次检查通过。导出文件主动移除历史/符合性元数据，因此没有声称通过完整发布 Revision 的必需证据字段校验。
- 浏览器：三层分类生命周期与原 6×1 两流程共 3 项通过；补齐删除已分类子树后，分类生命周期 1 项再通过。真实创建对象/过程、三级子图、设置/清除分类、新图不继承、父图展开元素定位、固定历史只读及导航、导出/同项目独立模型导入、继续新增和改名/保存重开、原草稿与导入模型隔离、分类提交失败不提前显示成功、读取错误重试、390px 无横向溢出、删除子树保留父图分类并重开。跨项目分类迁移由 OpdTransferServiceTest 覆盖。本轮未重复做跨项目 UI 迁移，未声明完整 FR-METHOD-002 或 ISO 校验通过。
- 原 PROC 案例只读，没有 draft commands/save/pin 写请求。最终活动模型 5 个，分类/6×1 测试活动模型 0 个。测试模型已移入回收站。
- 后端已更新并运行 17850（PID 56317）；前端 Vite 5177 热更新可见（PID 36508）。未增加依赖或数据库迁移。

证据：`/private/tmp/opm-classification-backend-tests.log`、`/private/tmp/opm-classification-atomic-tests.log`、`/private/tmp/opm-classification-final-frontend.log`、`/private/tmp/opm-classification-contract.log`、`/private/tmp/opm-classification-final-build.log`、`/private/tmp/opm-classification-lint.log`、`/private/tmp/opm-classification-regression-e2e.log`、`/private/tmp/opm-classification-final-e2e.log`、`/private/tmp/opm-classification-final-e2e/`、`/private/tmp/opm-classification-models.json`。

## 本轮完整增量文件清单（保留此前工作区变更）

- specs/opm-method-classification-feature-task-spec.md
- scripts/generate-opd-refinement-contract.mjs
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- docs/contracts/schemas/opm-revision-v0.4.schema.json
- docs/contracts/schemas/opm-save-content-v2-method.schema.json
- docs/contracts/schemas/opm-opd-json-v1.schema.json
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- docs/contracts/openapi/opm-draft-workspace-v02.json
- docs/design/opm-modeling-tool-application-api-contract.md
- services/local-runtime/src/main/resources/draftsave/save-content-v2-method.schema.json
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevision.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java
- services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionJsonWriter.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/MethodClassificationEdit.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/MethodSummaryQuery.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticElementEditor.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/ConstructDeletionPolicy.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftModelValidation.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java
- services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/OpdTransferServiceTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/semantic/MethodClassificationSchemaTest.java
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/shared/api/draftWorkbenchSession.ts
- apps/web/src/shared/api/draftWorkbenchSession.spec.ts
- apps/web/src/stores/workbenchRuntime.ts
- apps/web/src/stores/workbench/methodSummary.spec.ts
- apps/web/src/modules/workbench/WorkbenchMethodPanel.vue
- apps/web/src/modules/workbench/WorkbenchMethodPanel.spec.ts
- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchView.vue
- tests/e2e/workbench-method-classification.spec.ts
