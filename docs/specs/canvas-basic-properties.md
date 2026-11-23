# 画布元素基本信息简化

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: frontend-vue (primary)、backend-springboot、testing、db-migration。备注保存跨前端编辑、后端草稿、数据库约束及验证，四项属于同一不可拆分功能。

## 目标与边界

单击对象、过程、属性、操作及状态后，右侧只展示基本信息中的名称和备注。备注为普通多行文本，允许清空，最多 4000 个 Unicode code point；沿用失焦提交和保存草稿流程。隐藏标识信息、状态角色和展示配置，关系编辑面板保持现有行为。

允许修改元素检查器、文本编辑复用组件、投影与草稿命令、Runtime 对应实现和契约生成脚本、关联测试、集成工作台包引用。备注复用草稿授权和日志，不新增数据库表或配置、不引入依赖、不清空业务数据，不改变模型关系、布局或状态角色。已有用户改动保留。

现有 UPDATE_PROPERTY 仅支持名称，需增加草稿 remark 属性及状态目标。备注作为元素的非执行性说明保存，不参与 OPL 或规则推导。新增 Revision 0.6 和 SaveContentDigest/4 承载可选 remark 字段，旧版本和冻结摘要原样保留；首次备注编辑升级当前草稿，历史版本仍只读。后端先更新，再加载工作台新包。

数据库仅面向本仓库实际使用的 PostgreSQL，沿用 Flyway 新增 V3，扩展 draft_content.digest_version 检查约束以允许 Digest/4。无新增表、字段和回填；迁移先于备注保存，原 Digest/1～3 数据继续合法。迁移短暂获取该表的约束变更锁。回滚界面可使用旧工作台包；已有 Digest/4 时保留新读取逻辑和扩展约束，不降级、不删除备注。隔离测试模式验证迁移执行及重复启动。

## 实施与验收

- UI-01：所有节点面板只有名称、备注两个输入，无标识、状态角色和展示区域；关系面板保持兼容。
- EDIT-01：复用现有输入法、异步提交、防重复和失败处理；名称与备注顺序提交，失败阻止切换或保存丢失输入。备注保留换行和普通文本，不渲染 HTML。
- DATA-01：草稿授权目标一致，备注随目标身份跨图共享；更新备注不改变名称、状态角色或其他实体属性。空文本可清除，长度和只读限制前后端一致。
- SAVE-01：备注进入草稿日志、内容摘要和版本保存，重开可恢复；旧草稿和摘要继续可读取，后续改名与布局不丢备注。

边界已确认。顺序：补齐备注契约与版本读取/保存，再接入复用编辑器与面板，运行定向及相关回归、构建和真实页面验证。

## 验证与回滚

Vitest 检查面板、投影和文本编辑；JUnit 检查授权命令、备注持久化与摘要；Chrome 检查已有模型面板和隔离测试模型的编辑保存重开。测试不改写用户语义数据。

回滚需保留已产生的 0.6 数据读取能力；旧前端可回退，新备注后端及 schema 应保留，避免已保存版本无法打开。不删除或降级现有数据。

## 已完成验证

UI-01、EDIT-01、DATA-01、SAVE-01 已实现。前端 4 个定向测试文件共 174 项通过，类型检查及变更文件 ESLint 通过。后端草稿命令、冻结摘要、契约、版本读取和保存集成测试通过；备注覆盖对象、属性和状态目标、清空、改名保留、重启恢复、手动保存和历史版本投影。数据库集成测试使用独立 opm_diagram_tool_* 模式。

工作台 .28 和平台生产构建通过。工作台 .28 已安装；3000 前端与 17850 Runtime 已重启，新 Runtime 健康检查 UP，opm_diagram 的 V3 迁移成功。Chrome 在主题 54 检查对象、过程和属性面板，仅有名称与备注两个输入，无页面脚本错误。页面验证未修改用户元素名称或备注。截图及浏览器报告位于相邻平台 logs/canvas-basic-properties.png、logs/canvas-basic-properties-browser.json。

备注目前由 V2 草稿编辑保存，历史版本只读；旧 V1 编辑模式给出明确不支持提示。构建仍有平台既有大包提示，不影响本次构建成功。

## 本任务完整文件清单

以下为相对 opm-diagram 的文件，包含生成产物，不含之前布局任务及用户已有改动：

- `apps/web/scripts/package-workbench.mjs`
- `apps/web/src/modules/workbench/ElementNameProperty.vue`
- `apps/web/src/modules/workbench/ElementNameProperty.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchInspector.vue`
- `apps/web/src/modules/workbench/WorkbenchSurface.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `apps/web/src/shared/types/modeling.ts`
- `apps/web/src/stores/workbench/projectionMapping.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/generate-element-remark-contract.mjs`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `docs/contracts/schemas/opm-revision-v0.6.schema.json`
- `docs/contracts/schemas/opm-save-content-v4.schema.json`
- `docs/specs/canvas-basic-properties.md`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftCapabilityQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSubgraphReorganization.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodArchitectureLinks.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodClassificationEdit.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdProjectionQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/RevisionDocumentReaderRouter.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSeedRepository.java`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/resources/draftsave/save-content-v4.schema.json`
- `services/local-runtime/src/main/resources/db/migration/postgresql/V3__element_remark_digest.sql`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/SaveContentDigestV1Test.java`

相对 opm-platform 的集成文件：

- `apps/web-console/package.json`
- `apps/web-console/vendor/opm-workbench-0.2.2-platform.28.tgz`

临时验证脚本位于被忽略的 `.codex/basic-properties-browser.mjs`，未引入生产依赖。
