# 脑图分析到单 OPD 实施规格

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、frontend-vue、db-migration、testing。

四个 playbook 同时启用：脑图资料、来源守卫和模型确认必须在 SQLite 中保持原子性，前端交互与跨层测试不能拆成互不验证的交付。

## Spec

目标：完成[设计](../docs/design/opm-mindmap-analysis-design.md)阶段 A/B，支持模型级脑图编辑与独立保存、模型级 DeepSeek 分析会话、脑图 JSON 交换、单 OPD 渐进预览、最终校验/标准审查、一次确认、持久来源映射与增量转换。

非目标：阶段 C/D、跨图自动细化、完整双向同步、第三方格式、批量删除正式模型、新依赖、生产发布及 Git 提交。

允许：Web 工作台/脑图组件及 API/样式/测试；Assistant 服务/工具/会话/测试；Runtime 脑图应用服务、草稿执行及 Journal/来源仓储、控制器/错误处理/测试；协议生成器及生成产物；新增 SQLite V8 迁移；相关设计、索引、运行文档与本规格。禁止 `.harness/`、密钥配置、用户模型、无关重构及改写既有迁移。保留之前五份设计变更。

契约决策：Runtime 新增模型级脑图查询/保存操作，资料独立修订，不进入语义正文；一个模型一份脑图，稳定节点/关系 ID，最多 300 节点和 100 关系。ANALYSIS 会话与 OPD 会话隔离，保存使用 CAS。整图请求增加可选来源信息，旧请求不变；Journal 确认事务同时检查脑图修订/摘要与 DraftToken，并持久化来源映射，重试优先查原回执。SQLite V8 仅新增分析/转换表，旧程序不依赖新表；回滚代码保留新表及用户资料，不降级/删除数据库。

验收：MI-01 脑图创建/键盘/拖动/折叠/类型/归属/撤销/搜索/缩放、自动保存与重开独立于模型 token；MI-02 JSON 往返及非法版本/树/绑定隔离；MI-03 独立分析会话通过真实 deepseek-flash 多轮更新脑图并恢复；MI-04 咖啡状态关系单图实时预览、平台诊断/标准审查与一次提交/保存重开；MI-05 来源持久化、重复不创建、增量改名/新增、删除来源不删除正式元素及三方冲突；MI-06 版本竞态/只读/跨图/取消/停止/超限/未知回执安全；MI-07 四屏宽浏览器、前后端定向回归和迁移验证。

验证：先协议/纯规则及 SQLite/MVC，再助手和组件，再静态/构建及隔离真实浏览器和 DeepSeek。使用独立存储和测试模型，用户服务与数据不作为测试目标。报告实际覆盖，不声称完整 ISO 符合性。

## Plan

1. 收口版本化脑图结构和来源信息，新增兼容迁移及 Runtime 持久化/原子守卫。
2. 增加分析会话与专用工具，复用整图校验/审查/应用，通过稳定来源编译增量步骤。
3. 增加脑图画布及工作台切换，统一正常请求与错误/竞态处理。
4. 定向回归、真实模型与浏览器验证、同步设计和证据。

## Checklist

引用：本文件 Spec。边界已确认，源 HEAD 为 c389970，设计文档未提交。

- [x] MI-01
- [x] MI-02
- [x] MI-03
- [x] MI-04
- [x] MI-05
- [x] MI-06
- [x] MI-07

## 验证记录

2026-10-05，隔离服务使用 Runtime 17851、助手 17861、Web 5176。Runtime 存储 `/private/tmp/opm-mindmap-proof-20261005`，助手存储 `/private/tmp/opm-mindmap-assistant-20261005`。未修改用户日常服务的运行配置或把用户已有模型作为测试目标，未提交 Git。

验收后已停止上述三个隔离服务，测试数据、截图和日志均保留；日常服务未重启加载本轮实现。

| 验收 | 实际证据与边界 |
|---|---|
| MI-01 | 真实 UI 创建对象/过程/状态、键盘新增/改名、拖动父级、折叠/搜索/缩放、撤销/重做、自动保存/重开；脑图保存前后模型 token 一致。组件验证 Vue 代理复制、保存失败保留、错配响应拒绝及生成/只读禁用。 |
| MI-02 | 真实 UI JSON 导出/导入及重开，重建节点身份，解除外部 target_id，保留内部 owner/关系端点引用；契约/组件拒绝非法版本、树循环、未知类型、引用循环和超量节点。 |
| MI-03 | 使用已配置 deepseek-flash，经真实 Harness 两轮保存咖啡脑图，稳定 ID 不变；重启助手后同会话第三轮保存，SDK 恢复成功。分析与 OPD 对话隔离，切目标子图仍保持模型级分析会话。 |
| MI-04 | Effect 与 Instrument 逐步显示在真实 X6 画布，生成/审查期间模型 token 未变；平台 MODEL Findings 无阻断，独立标准审查无 ERROR 后一次提交，保存/刷新及来源定位成功。初始布局改为对象/过程分行，截图确认连线不再穿过烘焙机。 |
| MI-05 | 重复转换不创建提案或副本；真实增量改名预览及确认仅一项 UPDATE_PROPERTY，target ID 保持；新增、同名异实体、entity_ref、三方冲突和丢失绑定由确定性用例验证。真实删除分析来源后正式对象保留、token 不变并显示“来源已移除”。刷新恢复明确排除项。 |
| MI-06 | 真实修改来源后旧方案确认 HTTP 409；UI 禁确认/清预览，目标子图转换按用户选择导航并绑定，停止清预览且零正式写入，历史版本禁用脑图。助手限制分析/建模/审查工具和停止后的迟到调用；SQLite 测试注入 mapping 写入失败，模型/Journal/回执完整回滚；原成功回执在来源改变后仍可恢复。超限和无效来源覆盖拒绝。 |
| MI-07 | 四屏宽 1600/1280/820/390px 浏览器及截图检查，另检查过 768px；前端全量、助手、契约、Java 定向/迁移回归与构建通过。输入上限不等于 300 节点性能验收。 |

执行结果：

- `node --test scripts/draft-workspace-contract.test.mjs`：17/17；`node scripts/generate-draft-workspace-contract.mjs --check` 通过，生成产物一致。
- `npm run assistant:test`：39/39。包含本机 HTTP 监听的测试以本地端口权限运行；沙箱内 EPERM 的首次运行不算产品失败或通过证据。
- `npm run test --workspace=@opm/web`：47 文件、413/413；最后私有键盘禁用属性改名后另定向复测 MindmapPanel/OpdCanvas 32/32。
- `npm run typecheck`、`npm run lint`、`npm run build` 通过。Vite 的既有 opm-bootstrap.js 非 module 提示仍存在，不影响构建成功。
- Java 使用本机 Java 21 和 Maven 3.6.3 离线执行：MindmapWorkspaceTest、DraftWorkspaceControllerTest、DraftWorkspaceContractTest、DraftJournalRepositoryTest、ProjectDatabaseFactoryTest 共 70/70；MindmapWorkspaceTest 最终来源排除项回归 4/4；ModelLifecycleControllerTest、HybridSaveFoundationMigrationTest、SaveContentDigestV2MigrationTest 共 14/14。Runtime JAR package 成功。
- Playwright 三个脑图用例分别执行并通过：手工编辑/关系表单/JSON/四屏宽；真实 DeepSeek 主流程；助手重启后的续聊/增量确认/来源删除/子图目标/停止/只读。

浏览器证据（本机临时独立产物，不含会话凭据）：

- `/private/tmp/opm-mindmap-ui-e2e/`：四屏宽截图和 mindmap-ui-proof.json。
- `/private/tmp/opm-mindmap-delivery-e2e/`：实时生成、就绪截图和 mindmap-live-proof.json，记录真实需求、脑图、提案、平台与标准报告及来源映射。
- `/private/tmp/opm-mindmap-resume-delivery-e2e/`：mindmap-resume-proof.json，记录重启恢复、增量正式身份和停止前后 token。
- Java/助手/契约/Web/构建日志均为 `/private/tmp/opm-mindmap-*.log`。

本轮浏览器发现并修正：数字格式版本的 Java 校验兼容、名称输入重渲染丢失、保存重算 scope 导致会话/输入重置、排除项刷新丢失、对象排列导致关系穿框、脑图 Delete 冒泡误触隐藏 OPD 删除。快捷键问题仅在隔离测试模型复现，已由组件和真实安全流程复验。其余测试重试原因包括沙箱端口权限、测试在平移后点击不可见节点、提交中 OPEN 两次版本读取的短暂冲突及旧迁移用例仍假设最高 V7；只重读 OPEN，不重发修改命令。

## 尚未覆盖与后续边界

阶段 C/D 未实施：自动父子图、多图整体事务、属性/条件新增步骤、第三方脑图格式、完整双向同步。已有子 OPD 可作为单图目标，但不自动建立跨图共享 occurrence。300 节点性能、完整 ISO 符合性、任意业务语义、生产部署、多用户协作、供应商全部网络故障均未验证。标准审查仅覆盖现有六组规则，允许模型存在遗漏/误判。

模型/OPD 原生导出不包含脑图，迁移分析须单独导出脑图 JSON。脑图只对应活动模型，历史 Revision 不能显示活动脑图冒充历史快照。类型、状态归属与已有关系能力/端点变化明确阻断；新增及改名支持增量。请求/工具字节与字符限制见设计和助手 README。

## 回滚

1. 停止相关 Runtime 和助手，备份项目 SQLite 一致快照与助手 conversations/workspaces；不删除来源与对话资料。
2. 功能回滚保留 V8 migration/resources 及表，关闭脑图入口/工具或撤销功能调用；不修改既有迁移 checksum、不降级数据库。
3. 如必须物理恢复，明确会丢失恢复点后的修改，再使用迁移前一致备份和对应代码启动。旧二进制遇到 future version 是否兼容未验证，不能直接宣称换旧 JAR 即安全回滚。

## 完整变更清单

下列为本轮及保留的前轮五份设计变更；未修改依赖版本、密钥配置、既有迁移或 `.harness/`。


- `apps/assistant/README.md`
- `apps/assistant/src/harness-plugin.mjs`
- `apps/assistant/src/harness-sdk.mjs`
- `apps/assistant/src/harness.mjs`
- `apps/assistant/src/messages.mjs`
- `apps/assistant/src/mindmap-plan.mjs`
- `apps/assistant/src/mindmap-service.mjs`
- `apps/assistant/src/plan-finalizer.mjs`
- `apps/assistant/src/proposal-application.mjs`
- `apps/assistant/src/server.mjs`
- `apps/assistant/src/service.mjs`
- `apps/assistant/src/store.mjs`
- `apps/assistant/src/tools.mjs`
- `apps/assistant/test/mindmap.test.mjs`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/MindmapPanel.spec.ts`
- `apps/web/src/modules/workbench/MindmapPanel.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/mindmapModel.ts`
- `apps/web/src/modules/workbench/useMindmap.ts`
- `apps/web/src/shared/api/assistantApi.ts`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `docs/README.md`
- `docs/checklists/opm-mindmap-analysis-design-checklist.md`
- `docs/contracts/README.md`
- `docs/contracts/migrations/sqlite-mindmap/V8__mindmap_analysis.sql`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/design/opm-mindmap-analysis-design.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `scripts/draft-workspace-contract.test.mjs`
- `scripts/generate-draft-workspace-contract.mjs`
- `services/local-runtime/pom.xml`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MindmapConversions.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MindmapDocuments.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/FlywayProjectSchemaMigrator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/MindmapRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/ProjectDatabaseFactory.java`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/MindmapWorkspaceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/ModelLifecycleControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/storage/SaveContentDigestV2MigrationTest.java`
- `specs/opm-mindmap-implementation-task-spec.md`
- `tests/e2e/workbench-mindmap.spec.ts`
