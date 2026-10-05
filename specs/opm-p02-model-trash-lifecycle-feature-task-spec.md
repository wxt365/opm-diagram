# P02 模型回收站与永久删除

## 执行元数据

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：backend-springboot（primary）、frontend-vue、db-migration、testing。四项共同约束同一跨层数据生命周期，不拆分实现以避免前端删除入口缺少后端保护。

## Spec

目标：模型列表支持移入回收站、查看回收站、恢复及确认后永久删除。
非目标：项目归档、批量清理、导出包/迁移备份/浏览器待确认输入的删除、其他模型编辑功能。
允许：项目详情组件/样式/store/API、Local Runtime 模型生命周期 controller/service/repository、存储迁移入口和新增 Flyway Java migration、活动模型访问守卫、对应测试、接口与页面设计文档、`scripts/validate-contracts.mjs` 生命周期契约用例、规格。
禁止：改写已发布 SQL migration、改变既有模型文档 schema、引入依赖、重构其他业务、写入 `.harness`、删除用户已有模型或备份。
保留上一轮底部布局改动，不覆盖其他工作。

### 契约与数据边界

- 沿用 model_catalog.status ACTIVE/ARCHIVED，ARCHIVED 在 P02 显示为回收站；默认模型列表及模型数量仍只统计 ACTIVE。
- GET models 新增可选 archive_state=ACTIVE|ARCHIVED，默认 ACTIVE。
- POST models/{modelId}/lifecycle：request_id、command_id、action=TRASH|RESTORE|PURGE、expected_state=ACTIVE|ARCHIVED；PURGE 必填 confirmation_name，须等于当前模型名称。返回项目/模型 ID 与 lifecycle_state=ACTIVE|ARCHIVED|PURGED。
- 写请求沿用本地 session、Host/Origin 守卫及 command_id 幂等。状态冲突返回 409，模型不存在返回 404，非法参数返回 400；结果和审计同事务。
- TRASH/RESTORE 只改状态与更新时间，保留 OPD、草稿日志、内容、保存点、历史版本与基线。已回收模型不得通过旧工作台 URL 或 Draft 操作继续读取/编辑。
- PURGE 使用 SQLite BEGIN IMMEDIATE 和延迟外键约束，限定单个模型。清除模型、历史、草稿、索引及关联任务和旧收据；保留项目级生命周期收据/审计，避免重试重复操作。共享配置档、项目和其他模型不受影响。
- 新增 Flyway V7 Java migration，对旧式与混合保存库分别安装适用触发器；不可变数据的删除仅在同事务存在 model_purge_authorization 且模型 ARCHIVED 时允许。平时归档模型也不能直接删历史。现有版本 SQL 不改。旧式 Factory 仅在明确调用 openForModelLifecycle 时应用 V7，保留发布/转换工具的固定版本路径；已升级库的普通 open 识别并校验 V7。混合保存 Factory 默认包含 V7。
- SQLite 本地单机范围；新库运行完整迁移，已有库由原迁移入口生成迁移前备份再运行 V7。新增 V7 属兼容的删除守卫升级，未具备 V3/V4/V5 的已有库仍按原边界拒绝自动转换。旧程序不得在 V7 后继续写入；暂停服务后可恢复迁移前完整备份，禁止用代码回退逆转永久删除。
- 在途 Draft 提交与生命周期命令通过 SQLite 写事务排序；归档后后续写入被拒绝，已持久化内容保留。移入回收站后释放该模型保存调度器，恢复后重新注册。浏览器有未确认输入时阻断本地删除操作，保留输入供恢复确认。

### 验收

- ML-01：确认移入回收站后活动列表与数量更新，回收站可见；取消不发写请求。
- ML-02：恢复后原 ID、OPD、草稿和历史不变，可重开编辑。
- ML-03：已回收模型旧 URL/Draft 读取与写入失败；另一模型保持可用。
- ML-04：永久删除要求回收站状态与名称确认；清理单个模型的全部内部数据且外键完整，失败原子回滚；共享包/其他模型保留。
- ML-05：非法状态、错项目、重复命令、不同内容重用命令 ID 拒绝或按契约回放；本地写守卫仍生效。
- ML-06：桌面和窄屏中操作、确认弹窗、错误反馈可用；真实浏览器走取消、回收、恢复、重开及永久删除路径。
- ML-07：V7 对旧库与混合保存库执行、重复打开不重复迁移；既有不可变保护仍有效，迁移备份存在。

验证：JUnit + 真实临时 SQLite/MVC，现有 Draft 回归，Vue 页面交互测试，类型/lint/build、契约校验、真实浏览器测试、diff 检查。
回滚：停止新服务、还原本轮代码与受影响项目库的迁移前备份。回收站可直接恢复；永久删除不提供应用内恢复，外部备份不自动清理。

## Plan

1. 添加受控迁移与单模型事务 Repository；Service 校验状态/确认/幂等并结束调度。
2. 扩展列表过滤和 lifecycle endpoint，阻断归档模型旧会话。
3. 接入 P02 回收站切换、模型操作和确认对话框，复用焦点管理与 API 错误反馈。
4. 同步设计/OpenAPI，完成定向测试和隔离浏览器验证，再更新当前本地服务。

## Checklist

- [x] Spec 允许/禁止边界已确认；保留已有改动；数据库仅 SQLite；迁移保护/回滚见 Spec。
- [x] ML-01/02/03：生命周期与活动访问验证。
- [x] ML-04/05/07：事务、幂等、保护与迁移验证。
- [x] ML-06：页面测试与真实浏览器。
- [x] 契约、类型、lint、构建和 diff 检查。

## 实际验证与交付

- 后端 Node 不参与执行；Java 21 + 本机 Maven 执行。仓库 `mvnw` 不可执行且缺少 `.mvn/wrapper/maven-wrapper.properties`，使用现有 `mvn -o`，未改构建工具配置。
- `mvn -o -pl services/local-runtime -Dtest=ModelLifecycleControllerTest,LocalApiControllerTest,ProjectDatabaseFactoryTest,DraftWorkspaceControllerTest,DraftSaveControllerTest,DraftSaveServiceTest,SqliteRevisionCommitRepositoryTest,HybridSavePreparationTest,ActivatedDraftRepositoryTest,NewDraftModelRepositoryTest test`：实际匹配并执行 81 项，全部通过；NewDraftModelRepositoryTest 不存在，随后使用真实 NewDraftModelTest 名称补验。
- 迁移备份与触发器补强后，`-Dtest=ModelLifecycleControllerTest,ProjectDatabaseFactoryTest,LocalApiControllerTest,DraftSaveServiceTest package`：22 项通过，JAR 打包成功。包含 V7 升级备份完整性与 WAL 已提交数据保留验证。
- `-Dtest=SaveContentDigestV2MigrationTest,NewDraftModelTest test`：6 项通过；既有成功迁移断言升级为 V7，原 V6 失败保持 V5 的回滚断言保留。
- 补充真实跨项目模型 ID 拒绝后，`-Dtest=ModelLifecycleControllerTest test`：7 项再次通过。
- `npm run test --workspace=@opm/web`：20 个文件、245 项通过，其中 P02 页面 4 项覆盖取消、回收/恢复/永久删除、名称确认、待确认输入保护及失败命令重试。
- `npm run contract:validate`：生成契约检查、OpenAPI/Schema 与新增生命周期请求正反例通过。
- `npm run lint --workspace=@opm/web`、`npm run build --workspace=@opm/web`：通过，构建包含 Vue 类型检查；仍有既有 `/opm-bootstrap.js` 非 module 提示。
- `tests/e2e/model-lifecycle.spec.ts`：真实 Chromium 两次通过。第一次独立前端 5190 / 后端 17860 / 隔离数据目录；第二次当前前端 5177 / 后端 17850、现有项目中仅创建并清理本次验证模型。实际在画布创建 Object 与 Process、手动保存、取消回收、移入回收站、拒绝旧地址、恢复后重开保持两个元素、错误名称阻断及正确名称永久删除。桌面 1600px、窄屏 390px/320px 页面无横向溢出，已查看回收站底部、手机确认弹窗、恢复画布和现有五模型列表截图。
- 当前后端已加载新 JAR，保留 `/private/tmp/opm-diagram-preview-runtime`；前端 Vite 热更新。原五模型在 20 张模型相关表中的全部记录与 V7 迁移前备份一致；模型身份/状态、历史摘要、草稿序号与验证前一致；`PRAGMA integrity_check=ok`、`foreign_key_check` 无结果。
- 已停止本轮隔离 17860/5190 服务，当前用户使用的 17850/5177 服务继续运行。
- 当前项目备份：`/private/tmp/opm-diagram-preview-runtime/projects/project.9ae0e3dd46ae4f3a8b45520c5057ecd7/project.db.before-migration-1790841185766-209e1f4b-28f5-4235-927a-377892b1ffa2.bak`。备份为 SQLite VACUUM INTO 一致快照，保留 WAL 已提交内容。
- 浏览器证据：`/private/tmp/opm-model-lifecycle-browser/`、`/private/tmp/opm-model-lifecycle-preview-browser/`；隔离测试数据库保留在 `/private/tmp/opm-model-lifecycle-e2e-20261001/`。
- `git diff --check`：通过。未执行全仓后端测试及外部发布工具完整重放；本次仅证明上述定向回归、SQLite 与本地浏览器流程，不表示生产发布验收。

## 本轮完整文件清单

- 前端：`apps/web/src/modules/projects/ProjectDetailView.vue`、`apps/web/src/modules/projects/ProjectDetailView.spec.ts`、`apps/web/src/shared/api/localRuntimeApi.ts`、`apps/web/src/stores/projectModel.ts`、`apps/web/src/shared/styles/pages.css`、`apps/web/src/shared/styles/responsive.css`。
- 后端入口：`services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`、`services/local-runtime/src/main/java/org/opm/localruntime/api/ModelLifecycleController.java`。
- 后端服务：`services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`、`services/local-runtime/src/main/java/org/opm/localruntime/application/ModelLifecycleService.java`、`services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveService.java`。
- 存储：`services/local-runtime/src/main/java/org/opm/localruntime/storage/ModelLifecycleRepository.java`、`services/local-runtime/src/main/java/org/opm/localruntime/storage/ProjectDatabaseFactory.java`、`services/local-runtime/src/main/java/org/opm/localruntime/storage/FlywayProjectSchemaMigrator.java`、`services/local-runtime/src/main/java/org/opm/localruntime/storage/migration/V7__Model_lifecycle_delete_guards.java`。
- 回归：`services/local-runtime/src/test/java/org/opm/localruntime/api/ModelLifecycleControllerTest.java`、`services/local-runtime/src/test/java/org/opm/localruntime/application/NewDraftModelTest.java`、`services/local-runtime/src/test/java/org/opm/localruntime/storage/SaveContentDigestV2MigrationTest.java`、`tests/e2e/model-lifecycle.spec.ts`、`scripts/validate-contracts.mjs`。
- 契约与设计：`docs/contracts/openapi/opm-local-api-v1.yaml`、`docs/design/opm-modeling-workbench-page-design.md`、`docs/design/opm-modeling-tool-application-api-contract.md`。
- 本规格：`specs/opm-p02-model-trash-lifecycle-feature-task-spec.md`。上一轮未提交的 `specs/opm-p02-model-card-footer-layout-bugfix-task-spec.md` 与相关布局改动保留。
