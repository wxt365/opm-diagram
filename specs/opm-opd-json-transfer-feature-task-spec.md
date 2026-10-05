# OPD JSON 跨环境迁移

Work Mode: change；Risk Level: L3；Task Type: feature；Active Playbooks: backend-springboot (primary), frontend-vue, testing。

## Spec

目标：OPD 名称右键导出可编辑 JSON；项目页导入 JSON 为独立模型，可重新打开、继续编辑、保存。不能用画布投影替代完整语义。
非目标：合并到既有模型、OpCloud文件兼容、图片导出、历史/基线备份、Profile包安装。
允许：OPD transfer controller/service与纯闭包逻辑、LocalApiService及NewDraftModelRepository/PreparedDraftRepository新模型事务复用（仅新增模型允许0.3初始文档，旧准备入口不变）、前端API及局部导入/导出组件与页面入口、对应测试、新JSON schema/OpenAPI/设计说明和本规格。禁止：数据库DDL/迁移、依赖/配置、草稿命令协议和其他公共行为修改、.harness、案例原数据和其他无关变更。
契约影响：新增V1 OPD JSON导出/导入端点及OPM-OPD-JSON/1.0格式，不改变既有协议；复用本地写请求防护与新模型事务，不覆盖目标。

- A1：文件明确format/version、源位置、导入入口context和semantic revision。范围包括选中OPD及子图；父级关联所需祖先图和语义引用作为依赖，保留同一元素跨图身份、状态抑制、完整关系/修饰/标签、布局与绑定。剔除无关兄弟图；导出草稿需token一致，历史按固定revision读取。
- A2：导入前校验版本、结构、语义引用与活动Profile绑定，失败零模型写入；解析大小上限10MiB；导入建立新model/revision/draft身份，内部ID在新模型命名空间保留；事务失败整体回滚，同一command_id重试只创建一次。
- A3：OPD右键可导出根/子图；导出只读也可用，不产生模型写入。项目页文件预览、名称确认后导入，完成打开文件指定OPD；错误可见，可取消。
- A4：真实画布创建元素/状态/关系/子图并迁移至另一项目，核对语义与布局、重新打开、继续编辑保存；原模型不变，隔离测试模型移入回收站；后端/前端定向回归、contract/typecheck/lint/diff通过。

验证：JUnit闭包/校验/事务/幂等和MVC边界测试，Vue组件与Playwright隔离项目真实端到端。回滚：撤销本次前后端和契约增量，已导入模型可移入回收站，无数据迁移。

## Plan

1. 从完整revision构建上下文与语义引用闭包；保留原根及必要父链，使用现有reader/validator/writer。
2. 新增只读导出和NEW_MODEL导入服务，复用新模型创建事务，按实际schema写入初始版本。
3. 接入菜单下载与项目导入预览，执行真实迁移与回归。

## Checklist

Spec: specs/opm-opd-json-transfer-feature-task-spec.md。允许/禁止边界已确认；新增API和交换schema属于本次授权，禁止DDL、配置和新依赖。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

## 实际验证（2026-10-02）

- 后端定向18项通过：OpdTransferServiceTest 7、OpdTransferControllerTest 1、NewDraftModelTest 3、HybridSavePreparationTest 7。覆盖子图依赖裁剪、完整字段/路由坐标、共享状态身份、状态资格/抑制、固定版本/过期token、10MiB上限、格式与引用/来源/身份/规则校验、幂等重试、本地会话防护和SQLite插入故障整事务回滚；旧模型准备回归通过。
- 前端定向96项通过：OpdJsonImportDialog 3、ProjectDetailView 4、WorkbenchView 89。typecheck、lint（零warning）、contract:validate、git diff --check通过。后端package构建通过。
- Playwright 1项实际画布端到端通过：在案例项目只新增隔离模型，真实创建对象、状态、属性、过程、消费关系、子图及无关兄弟图；根JSON含3图、子图JSON含2图；保存后的历史只读导出与草稿语义一致。创建另一独立目标项目，由文件入口导入并直接打开entry子图，各语义集合/图关联/布局逐项一致。实际移动对象并新增过程，保存重开后集合与新布局一致；来源草稿token及完整图内容不变。
- 实际浏览器验证损坏JSON与未知版本阻止提交；规则绑定冲突显示错误，重新查询目标模型列表仍为空。导入弹窗桌面1800×1200和窄屏390×844截图已逐张检查，无横向溢出；迁移后画布截图已检查。浏览器无pageerror；源/目标测试模型均已移入回收站，原五案例未修改。
- 7份实际下载JSON通过Ajv 2020-12 schema验证。验证文件与截图位于 `/private/tmp/opm-opd-json-e2e/`，各测试日志为 `/private/tmp/opm-opd-json-{backend,unit,typecheck,lint,contract,e2e,package}.log`。
- 后端已使用原数据目录 `/private/tmp/opm-diagram-preview-runtime` 与17850端口加载新jar；前端5177继续运行。

## 边界与限制

支持迁往活动Profile全绑定一致的环境。本轮只交付OPD JSON 1.0（语义0.2/0.3），不支持0.1或OpCloud文件；导入为新模型，不携带完整历史、基线或Profile安装包。派生文本与校验证据重建，不将迁移成功标为符合性通过。跨项目迁移在当前机器两个隔离项目中实测，尚未在另一台机器部署验证。

## 本轮文件清单

以下为本轮增量涉及的全部文件；共享文件中此前工作保持。

- `services/local-runtime/src/main/java/org/opm/localruntime/api/OpdTransferController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdTransferService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/NewDraftModelRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/OpdTransferServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/OpdTransferControllerTest.java`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/modules/projects/OpdJsonImportDialog.vue`
- `apps/web/src/modules/projects/OpdJsonImportDialog.spec.ts`
- `apps/web/src/modules/projects/ProjectDetailView.vue`
- `apps/web/src/modules/projects/ProjectDetailView.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `docs/contracts/schemas/opm-opd-json-v1.schema.json`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `tests/e2e/workbench-opd-json-transfer.spec.ts`
- `specs/opm-opd-json-transfer-feature-task-spec.md`
