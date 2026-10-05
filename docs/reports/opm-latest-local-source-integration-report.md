# 最新本地程序合并与验证记录

日期：2026-10-05。规格：[最新本地程序合并](../../specs/opm-latest-local-source-integration-task-spec.md)。

2026-10-06 更新：原五项 Java 失败和中文改名 E2E 失败均已修复并复验，结果见[修复复验](#修复复验2026-10-06)。下文 2026-10-05 的失败计数保留为历史证据。

## 合并结果

从用户指定的最新目录合并 379 份新增或更新输入，包含已提交工作台/助手改进及未提交脑图和助手修复。来源 HEAD c389970，目标起点 2b63baf；使用源码快照，不导入来源 Git 历史。2310 份允许输入的合并前摘要为 df9856cbf66204f47697c60d60febcadb39344784b026cc1248587f1850d4313。

保留当前 README、忽略规则、Maven Wrapper、AGENTS.md 及本仓库独有维护规格。来源输入均复核字节一致，唯一主动适配是助手 README 将 npm ci 改为 npm install，与本仓库不跟踪根锁文件的用户决定一致。主 README 补充助手/脑图能力及启动入口；.gitignore 补充 Runtime 子目录的本地数据路径。未修改任何来源文件。

本次共 383 个变更文件：379 个来源输入及主 README、.gitignore、合并规格和本文。完整清单见下文。未提交或推送；未启动发布验证或启用生产 Capability。

## 密钥与数据边界

- 真实 DeepSeek 配置仍在来源被忽略的 apps/assistant/.env.local；目标没有复制该文件。
- 仅合并空 DEEPSEEK_API_KEY 的 .env.example；实际密钥字符串匹配和常见 sk-/私钥格式扫描零命中，扫描只输出文件位置/计数，没有输出凭据值。
- .env.local、根 package-lock.json 和 Runtime 本地数据目录的 git check-ignore 验证命中。安装生成的依赖和锁文件仅本地保留。
- 不合并用户模型、脑图资料、助手会话、.dsh、日志、截图、缓存和构建产物；不导入来源 Git 历史。
- 后端 V1～V5 既有迁移 raw bytes 与原 HEAD 一致；引入来源 V6 Java digest、V7 生命周期守卫及 V8 脑图迁移，未访问/迁移用户数据库。已有迁移备份及恢复机制测试通过，不能将旧二进制直接当作新数据库的降级方案。

## 实际验证

| 验证 | 结果 |
| --- | --- |
| npm 安装 | npm install --ignore-scripts 成功，Node 22.22.0；固定 Harness 0.2.0-rc.2 三个包安装成功 |
| 生成契约 | 草稿协议 --check 通过；API-EDT/OpenAPI/代表 Schema 校验通过 |
| 草稿契约单测 | 17/17 通过 |
| 前端 | typecheck、lint、417/417 单测、production build 通过 |
| 助手 | 49/49 通过；HTTP 端口测试沙箱 EPERM 后在本机权限下完整复跑，未调用真实供应商 |
| Java 全量 | Java 21 + Maven 3.6.3 离线执行 556 项；551 通过、2 failure、3 error，零跳过；五项详情见下文 |
| JAR | 保留的 Maven 3.9.10 Wrapper 离线 package -DskipTests 成功；此项只证明打包，不能替代失败测试 |
| 脑图 API / 迁移 | MindmapWorkspaceTest 4/4、DraftWorkspaceControllerTest 49/49、SaveContentDigestV2MigrationTest 3/3 已包含于全量通过项；覆盖独立保存、来源守卫、原子回滚、新库及一致备份后升级 |
| 浏览器脑图 | 真实编辑/键盘/拖动/缩放/独立保存/JSON 往返/刷新及四屏宽通过 |
| 浏览器画布 | 空白平移、选择及无模型写入用例通过 |
| 浏览器基础建模 | 独立脚本创建对象/过程、中文双击改名、边缘拖线、OPL、保存/刷新保持；零 pageerror |
| 浏览器交换 / 生命周期 | 明确指定隔离项目后 OPD JSON 跨项目迁移、只读导出、异常零写入、继续编辑保存；模型回收/恢复/永久删除：2/2 通过 |
| 文档 | 223 个本地 Markdown 链接存在；git diff --check 通过 |

隔离 Runtime 17851、助手 17861、Web 5176；使用独立数据 /private/tmp/opm-integration-20261005.jnLEdx。JAR 从构建目录复制到不可覆盖的独立启动路径后运行。助手仅用测试占位密钥，未提交生成请求。验收项目均独立新建，不使用用户日常数据；测试服务验收后关闭。

Playwright 第一轮为 2 通过、1 失败、1 跳过：跳过的 OPD JSON 用例要求明确项目参数，补齐参数后第二轮交换/生命周期 2/2 通过。中文改名旧用例的失败发生在关系中心点拖线，尚未进入改名断言；没有把后续独立主路径成功改写成原用例成功。

## 历史未通过项与验证边界（2026-10-05）

五项 Java 测试失败输入及实现均与来源同字节，不是复制遗漏；本次不改写产品规则或弱化断言以掩盖结果：

1. NewDraftModelTest.createsIndependentDraftsAndEditsSavesAndReopensWithoutPerEditRevisions：来源仍断言新库七个迁移，新增 V8 后实际为八个。脑图/V8 正向和备份迁移测试通过，此项旧断言仍需适配。
2. LocalApiServiceTest.persistsTheP0ProjectToBaselinePathInSeparateProjectSqlite：创建基线返回 VALIDATION_BLOCKED，当前要求完整无阻断证据，来源校验结果不能满足旧用例的基线放行预期。
3. ElementNameEditingServiceTest.distinguishesStaleAndBaselineAndReplaysDuplicateCommandBeforeRevisionChecks：同样在基线证据门失败。未绕过校验门以推进断言。
4. E2EFaultPlanVerifierTest.rejectsRawDigestDriftAfterPlanValidation：预期 digest mismatch，实际先遇到 Schema invalid。
5. E2EFaultPlanVerifierTest.acceptsAllThreeFaultPlansWithNodeAjvAndTheJarValidator：JAR Schema resource 摘要不匹配。这两项 Fault Plan 问题在此前目标仓库重构报告中已有记录。

浏览器旧 workbench-inline-name.spec.ts 在关系拖线阶段未使编辑序号变化；用当前正常边缘拖线方式验证的完整基础流程通过，但旧用例尚未修复。构建仍有既有 opm-bootstrap.js 非 module 提示；没有宣称无告警构建。

未执行真实 DeepSeek 生成/网络故障验证、全量 Playwright、300 节点性能、正式发布门/Candidate/Activation 或完整 ISO 符合性。当前未跟踪根锁文件导致冻结发布输入缺失的问题仍保持原记录。

## 修复复验（2026-10-06）

修正规格：[合并后未通过项修复](../../specs/opm-integrated-failed-items-bugfix-task-spec.md)。本轮五项 Java 失败及原中文改名浏览器失败全部闭合；未修改 API、Schema 结构、迁移、依赖或生产门禁。

| 问题 | 修正与实证 |
| --- | --- |
| 迁移数仍预期 7 | 对齐 V8 为 8，并检查 mindmap_document、mindmap_conversion 两张表存在；新草稿保存/重开断言保留 |
| 两个旧基线测试错误期待放行 | 从隔离 SQLite 按 task_id 读取实际 INCOMPLETE 汇总及 token，断言 VALIDATION_BLOCKED 和 baseline 表零写入；历史基线夹具独立验证只读、过期和重复命令保护 |
| Fault verifier 固定旧 raw 摘要 | 按后继规格更新固定值为当前 61432 bytes / d8c34923a1342cdffd5eb4e22ddf328969bf3c1f6b6804e7acebb56dd51891d8；JAR 内资源同摘要，无 checkout fallback；缺失、字节篡改、字段错误及 Plan digest drift 均拒绝 |
| 原改名 E2E 中心拖线未执行 | 默认 1280×720 的节点中心落在底部面板，真实事件命中 DIV；桌面用例设置 1600×1000，中心拖线、全部中文改名、OPL、保存、刷新及属性面板断言完整通过 |

实际复验：

| 验证 | 结果 / 证据 |
| --- | --- |
| 原失败路径定向 | 39/39，/private/tmp/opm-failed-items-green2-20261006.log |
| 后端全量与打包 | Java 21 + Maven Wrapper 3.9.10，mvnw -o -pl services/local-runtime verify；558/558，零失败、错误、跳过；/private/tmp/opm-failed-items-backend-full-20261006.log |
| 最终基线零写入断言 | 两类最终测试 27/27；/private/tmp/opm-failed-items-baseline-zero-write-20261006.log；只加强测试，生产源码未再次变更 |
| Fault verifier | 5/5，包括独立 ClassLoader 下正确资源通过、缺失/合法 JSON 的 raw 字节漂移拒绝；/private/tmp/opm-fault-resource-negative-20261006.log |
| 打包 JAR 集成 | 显式执行 -Dtest=E2EFaultLauncherJarIT；6/6，完整启动、缺参拒绝、握手失败、真实 JAR 资源篡改、Plan drift 和未触发关闭拒绝；/private/tmp/opm-failed-items-fault-jar-it-20261006.log |
| 前端 / 助手 | 417/417、49/49，/private/tmp/opm-failed-items-web-20261006.log、/private/tmp/opm-failed-items-assistant-20261006.log；未调用真实供应商 |
| 草稿契约 | draft-journal、draft-save、draft-workspace 三组 Node 测试 26/26；/private/tmp/opm-failed-items-contract-tests-20261006.log |
| 静态 / production build | npm run typecheck、lint、build 全通过，build 同时执行 contract:validate；/private/tmp/opm-failed-items-static-20261006.log；既有 bootstrap 非 module 提示仍在 |
| 隔离浏览器 | 6/6、零跳过：原中文改名、脑图四屏宽、空白平移、状态/Operation 移动、适应画布及模型生命周期；/private/tmp/opm-failed-items-20261005.XZ0M6x/browser-regression.log |
| 安全 | 2321 份 Git 跟踪及非忽略候选文件中，来源真实密钥精确匹配 0，带 token 边界的 sk-/私钥模式匹配 0；仅输出计数/文件路径，未输出密钥 |

浏览器命令使用 OPM_E2E_EXTERNAL_SERVERS=true，六个对应 spec 及 --grep-invert 排除真实供应商、已有用户资料续聊和五个既有客户案例。每个实际用例均新建隔离项目，Runtime 存储为 /private/tmp/opm-failed-items-20261005.XZ0M6x/storage；运行 JAR 为上轮不可覆盖副本，前端为当前源码。新版 JAR 的 raw pin 另外核验，并用实际子进程集成测试通过。Runtime 17851、Vite 5176 两个本轮隔离服务已关闭，证据保留。

本轮完整修改清单（不重复上轮 383 文件合并清单）：

- services/local-runtime/src/main/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlanVerifier.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/NewDraftModelTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/ElementNameEditingServiceTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/releaseevidence/fault/E2EFaultPlanVerifierTest.java
- tests/e2e/workbench-inline-name.spec.ts
- specs/opm-dev-canvas-06-e2e-fault-launcher-implementation-task-spec.md
- specs/opm-dev-canvas-06-e2e-fault-launcher-clean-base-and-controlled-playwright-closure-bugfix-task-spec.md
- specs/opm-integrated-failed-items-bugfix-task-spec.md
- docs/reports/opm-latest-local-source-integration-report.md

未执行全量 Playwright、真实 DeepSeek、300 节点性能或正式发布验证；不提升 GATE/Candidate/Activation/ISO 状态。不提交、不推送，来源目录和用户存储未修改。

## 证据与回滚

本次临时清单：/private/tmp/opm-source-integration-20261005-inventory.json。前端/契约/助手/Java 日志位于 /private/tmp/opm-integration-*-20261005.log；浏览器截图、报告与测试数据位于 /private/tmp/opm-integration-20261005.jnLEdx/。这些仅是本机验收产物，不提交版本库。

回滚范围仅为下列变更清单，恢复目标起点的跟踪文件并移除本次新增源码，保留本地配置、依赖和用户数据；不要执行全工作树 destructive reset。本次没有修改用户数据库。以后若升级用户数据库至 V8，需保留向前迁移结构，或停机后从一致备份物理恢复并明确备份后的数据损失。

## 完整变更清单

- `.gitignore`
- `README.md`
- `apps/assistant/.env.example`
- `apps/assistant/README.md`
- `apps/assistant/package.json`
- `apps/assistant/skills/opm-modeling-guide/SKILL.md`
- `apps/assistant/skills/opm-modeling-guide/references/quality-policy.json`
- `apps/assistant/skills/opm-standard-review/SKILL.md`
- `apps/assistant/skills/opm-standard-review/references/rules.json`
- `apps/assistant/src/commands.mjs`
- `apps/assistant/src/harness-plugin.mjs`
- `apps/assistant/src/harness-sdk.mjs`
- `apps/assistant/src/harness.mjs`
- `apps/assistant/src/messages.mjs`
- `apps/assistant/src/mindmap-plan.mjs`
- `apps/assistant/src/mindmap-repair.mjs`
- `apps/assistant/src/mindmap-service.mjs`
- `apps/assistant/src/plan-finalizer.mjs`
- `apps/assistant/src/proposal-application.mjs`
- `apps/assistant/src/quality.mjs`
- `apps/assistant/src/review.mjs`
- `apps/assistant/src/runtime.mjs`
- `apps/assistant/src/server.mjs`
- `apps/assistant/src/service.mjs`
- `apps/assistant/src/store.mjs`
- `apps/assistant/src/tools.mjs`
- `apps/assistant/test/harness.test.mjs`
- `apps/assistant/test/http.test.mjs`
- `apps/assistant/test/mindmap-repair.test.mjs`
- `apps/assistant/test/mindmap.test.mjs`
- `apps/assistant/test/quality.test.mjs`
- `apps/assistant/test/review.test.mjs`
- `apps/assistant/test/service.test.mjs`
- `apps/web/src/layout/AppLayout.spec.ts`
- `apps/web/src/layout/AppLayout.vue`
- `apps/web/src/modules/projects/OpdJsonImportDialog.spec.ts`
- `apps/web/src/modules/projects/OpdJsonImportDialog.vue`
- `apps/web/src/modules/projects/ProjectDetailView.spec.ts`
- `apps/web/src/modules/projects/ProjectDetailView.vue`
- `apps/web/src/modules/projects/ProjectLibraryView.spec.ts`
- `apps/web/src/modules/projects/ProjectLibraryView.vue`
- `apps/web/src/modules/workbench/AssistantMessageContent.spec.ts`
- `apps/web/src/modules/workbench/AssistantMessageContent.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AutoLayoutPreviewBar.spec.ts`
- `apps/web/src/modules/workbench/AutoLayoutPreviewBar.vue`
- `apps/web/src/modules/workbench/CanvasContextMenu.spec.ts`
- `apps/web/src/modules/workbench/CanvasContextMenu.vue`
- `apps/web/src/modules/workbench/CanvasFullscreenButton.spec.ts`
- `apps/web/src/modules/workbench/CanvasFullscreenButton.vue`
- `apps/web/src/modules/workbench/CanvasZoomControls.spec.ts`
- `apps/web/src/modules/workbench/CanvasZoomControls.vue`
- `apps/web/src/modules/workbench/LayoutActionItems.vue`
- `apps/web/src/modules/workbench/LayoutToolMenu.spec.ts`
- `apps/web/src/modules/workbench/LayoutToolMenu.vue`
- `apps/web/src/modules/workbench/MindmapPanel.spec.ts`
- `apps/web/src/modules/workbench/MindmapPanel.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/RelationToolSymbol.spec.ts`
- `apps/web/src/modules/workbench/RelationToolSymbol.vue`
- `apps/web/src/modules/workbench/WorkbenchBottomPanel.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchBottomPanel.vue`
- `apps/web/src/modules/workbench/WorkbenchInspector.vue`
- `apps/web/src/modules/workbench/WorkbenchMethodLinks.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchMethodLinks.vue`
- `apps/web/src/modules/workbench/WorkbenchMethodPanel.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchMethodPanel.vue`
- `apps/web/src/modules/workbench/WorkbenchNavigatorResizer.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchNavigatorResizer.vue`
- `apps/web/src/modules/workbench/WorkbenchPanelResizer.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchPanelResizer.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/assistantMarkdown.ts`
- `apps/web/src/modules/workbench/assistantPreview.spec.ts`
- `apps/web/src/modules/workbench/assistantPreview.ts`
- `apps/web/src/modules/workbench/mindmapModel.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-movement.spec.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-movement.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-scene.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-viewport.spec.ts`
- `apps/web/src/modules/workbench/opd/core/canvas-viewport.ts`
- `apps/web/src/modules/workbench/opd/core/parallel-relation-layout.spec.ts`
- `apps/web/src/modules/workbench/opd/core/parallel-relation-layout.ts`
- `apps/web/src/modules/workbench/opd/core/relation-preview-renderer.spec.ts`
- `apps/web/src/modules/workbench/opd/core/relation-render-spec.ts`
- `apps/web/src/modules/workbench/opd/core/relation-tool-symbol.spec.ts`
- `apps/web/src/modules/workbench/opd/core/relation-tool-symbol.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-node-layer.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-adapter.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-adapter.ts`
- `apps/web/src/modules/workbench/opd/relations/built-in-relation-registries.spec.ts`
- `apps/web/src/modules/workbench/opd/relations/control/control-decoration-helpers.ts`
- `apps/web/src/modules/workbench/opd/relations/procedural/procedural-render-helpers.ts`
- `apps/web/src/modules/workbench/opd/relations/structural/classification-instantiation.definition.ts`
- `apps/web/src/modules/workbench/opd/relations/structural/state-specified-characterization.definition.ts`
- `apps/web/src/modules/workbench/opd/relations/structural/structural-render-helpers.ts`
- `apps/web/src/modules/workbench/opd/useBlankCanvasPan.spec.ts`
- `apps/web/src/modules/workbench/opd/useBlankCanvasPan.ts`
- `apps/web/src/modules/workbench/opd/useCanvasNameEditor.ts`
- `apps/web/src/modules/workbench/useMindmap.ts`
- `apps/web/src/modules/workbench/useOpdRefinement.ts`
- `apps/web/src/modules/workbench/usePreviewViewport.ts`
- `apps/web/src/modules/workbench/useWorkbenchNavigation.ts`
- `apps/web/src/shared/api/assistantApi.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.spec.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.ts`
- `apps/web/src/shared/api/generated/apiEdtContract.ts`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/shared/styles/forms.css`
- `apps/web/src/shared/styles/pages.css`
- `apps/web/src/shared/styles/responsive.css`
- `apps/web/src/shared/styles/workbench-canvas.css`
- `apps/web/src/shared/styles/workbench-layout.css`
- `apps/web/src/shared/styles/workbench-panels.css`
- `apps/web/src/shared/styles/workbench-tools.css`
- `apps/web/src/stores/projectModel.ts`
- `apps/web/src/stores/workbench/autoLayout.spec.ts`
- `apps/web/src/stores/workbench/autoLayout.ts`
- `apps/web/src/stores/workbench/constructEditing.ts`
- `apps/web/src/stores/workbench/findingDetails.ts`
- `apps/web/src/stores/workbench/findingsWorkflow.spec.ts`
- `apps/web/src/stores/workbench/findingsWorkflow.ts`
- `apps/web/src/stores/workbench/layoutArrangement.spec.ts`
- `apps/web/src/stores/workbench/layoutArrangement.ts`
- `apps/web/src/stores/workbench/layoutSelection.spec.ts`
- `apps/web/src/stores/workbench/layoutSelection.ts`
- `apps/web/src/stores/workbench/methodSummary.spec.ts`
- `apps/web/src/stores/workbench/methodSummary.ts`
- `apps/web/src/stores/workbench/operationHistory.spec.ts`
- `apps/web/src/stores/workbench/operationHistory.ts`
- `apps/web/src/stores/workbench/ownedNodePlacement.spec.ts`
- `apps/web/src/stores/workbench/ownedNodePlacement.ts`
- `apps/web/src/stores/workbench/projectionMapping.spec.ts`
- `apps/web/src/stores/workbench/projectionMapping.ts`
- `apps/web/src/stores/workbench/workbenchLayout.ts`
- `apps/web/src/stores/workbench/workbenchState.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/vite.config.ts`
- `docs/README.md`
- `docs/checklists/opm-conversational-modeling-design-checklist.md`
- `docs/checklists/opm-conversational-modeling-implementation-checklist.md`
- `docs/checklists/opm-customer-demo-entry-feature-checklist.md`
- `docs/checklists/opm-customer-demo-feature-checklist.md`
- `docs/checklists/opm-digest-v2-persistence-bugfix-checklist.md`
- `docs/checklists/opm-mindmap-analysis-design-checklist.md`
- `docs/checklists/opm-multilevel-opd-local-delete-bugfix-checklist.md`
- `docs/checklists/opm-multilevel-opd-modeling-checklist.md`
- `docs/checklists/opm-p03-effect-pair-arrow-direction-bugfix-checklist.md`
- `docs/checklists/opm-p03-input-output-effect-tool-symbol-bugfix-checklist.md`
- `docs/checklists/opm-p03-opd-switch-loading-layout-bugfix-checklist.md`
- `docs/checklists/opm-p03-parallel-relation-clearance-bugfix-checklist.md`
- `docs/checklists/opm-p03-state-procedural-link-visibility-bugfix-checklist.md`
- `docs/checklists/opm-p03-toolbar-render-fidelity-bugfix-checklist.md`
- `docs/checklists/opm-ui-runtime-metadata-navigation-bugfix-checklist.md`
- `docs/checklists/opm-workbench-bottom-panel-resize-feature-checklist.md`
- `docs/checklists/opm-workbench-navigator-resize-feature-checklist.md`
- `docs/checklists/opm-workbench-refactor-performance-checklist.md`
- `docs/checklists/workbench-header-visual-polish.md`
- `docs/contracts/README.md`
- `docs/contracts/migrations/sqlite-mindmap/V8__mindmap_analysis.sql`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `docs/contracts/schemas/opm-opd-json-v1.schema.json`
- `docs/contracts/schemas/opm-revision-v0.3.schema.json`
- `docs/contracts/schemas/opm-revision-v0.4.schema.json`
- `docs/contracts/schemas/opm-revision-v0.5.schema.json`
- `docs/contracts/schemas/opm-save-content-v2-method.schema.json`
- `docs/contracts/schemas/opm-save-content-v2-trace.schema.json`
- `docs/contracts/schemas/opm-save-content-v2.schema.json`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/design/opm-customer-demo-entry-record.md`
- `docs/design/opm-customer-demo.md`
- `docs/design/opm-mindmap-analysis-design.md`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `docs/design/opm-opl-review-record.md`
- `docs/design/opm-workbench-refactor-performance-spec.md`
- `docs/reports/opm-latest-local-source-integration-report.md`
- `package.json`
- `scripts/draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `scripts/generate-api-edt-contracts.mjs`
- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/generate-opd-refinement-contract.mjs`
- `scripts/validate-contracts.mjs`
- `services/local-runtime/pom.xml`
- `services/local-runtime/src/main/java/db/digestv2/V6__save_content_digest_v2.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceSchema.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/ModelLifecycleController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/OpdTransferController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/CommandCapabilityOptions.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/ConstructDeletionPolicy.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftCapabilityQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftContextDeletion.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftModelPlan.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftModelValidation.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOwnedConstructEdits.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftSaveService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceQueries.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiResponses.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalCatalogService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodArchitectureLinks.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodClassificationEdit.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MethodSummaryQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MindmapConversions.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/MindmapDocuments.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/ModelLifecycleService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdJsonPackage.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdProjectionQuery.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/OpdTransferService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticCommandEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticElementEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/SemanticLayoutEditor.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentDigestV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SaveContentSchemaV1.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevision.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionJsonWriter.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionReader.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticRevisionValidator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/semantic/SemanticValidationCode.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftHistoryRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftSaveRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/FlywayProjectSchemaMigrator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/LocalApiRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/MindmapRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/ModelLifecycleRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/NewDraftModelRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/OperationHistoryRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/PreparedDraftRepository.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/ProjectDatabaseFactory.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/migration/V7__Model_lifecycle_delete_guards.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/text/OplStructuralSentenceGenerator.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/text/OplTextGenerationService.java`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/resources/draftsave/save-content-v2-method.schema.json`
- `services/local-runtime/src/main/resources/draftsave/save-content-v2-trace.schema.json`
- `services/local-runtime/src/main/resources/draftsave/save-content-v2.schema.json`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftSaveControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/MindmapWorkspaceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/ModelLifecycleControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/OpdTransferControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/DraftModelValidationTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/ElementNameEditingServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/MethodSummaryQueryTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/NewDraftModelTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/OpdTransferServiceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/SemanticLayoutEditorTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/ValidationTaskPersistenceTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/MethodArchitectureSchemaTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/MethodClassificationSchemaTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/semantic/SemanticRevisionValidatorTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/storage/SaveContentDigestV2MigrationTest.java`
- `specs/opm-align-distribute-feature-task-spec.md`
- `specs/opm-assistant-followup-visibility-task-spec.md`
- `specs/opm-assistant-generation-quality-task-spec.md`
- `specs/opm-assistant-left-panel-task-spec.md`
- `specs/opm-assistant-live-plan-task-spec.md`
- `specs/opm-assistant-markdown-task-spec.md`
- `specs/opm-assistant-message-edit-task-spec.md`
- `specs/opm-assistant-review-truncation-bugfix-spec.md`
- `specs/opm-assistant-single-session-task-spec.md`
- `specs/opm-assistant-validation-review-task-spec.md`
- `specs/opm-auto-layout-feature-task-spec.md`
- `specs/opm-blank-context-menu-feature-task-spec.md`
- `specs/opm-blank-drag-pan-feature-task-spec.md`
- `specs/opm-canvas-zoom-controls-feature-task-spec.md`
- `specs/opm-context-layout-actions-feature-task-spec.md`
- `specs/opm-control-label-spacing-bugfix-task-spec.md`
- `specs/opm-conversational-modeling-implementation-task-spec.md`
- `specs/opm-customer-demo-entry-feature-task-spec.md`
- `specs/opm-customer-demo-feature-task-spec.md`
- `specs/opm-delete-context-feature-task-spec.md`
- `specs/opm-digest-v2-persistence-bugfix-task-spec.md`
- `specs/opm-element-refinement-menu-feature-task-spec.md`
- `specs/opm-finding-locate-style-bugfix-task-spec.md`
- `specs/opm-findings-workflow-feature-task-spec.md`
- `specs/opm-fit-view-feature-task-spec.md`
- `specs/opm-latest-local-source-integration-task-spec.md`
- `specs/opm-layout-selection-history-feature-task-spec.md`
- `specs/opm-method-classification-feature-task-spec.md`
- `specs/opm-method-six-one-feature-task-spec.md`
- `specs/opm-method-trace-feature-task-spec.md`
- `specs/opm-mindmap-conversion-guidance-bugfix-spec.md`
- `specs/opm-mindmap-implementation-task-spec.md`
- `specs/opm-mindmap-preview-repair-bugfix-spec.md`
- `specs/opm-mindmap-review-feedback-bugfix-spec.md`
- `specs/opm-mindmap-runtime-recovery-task-spec.md`
- `specs/opm-multilevel-opd-local-delete-bugfix-task-spec.md`
- `specs/opm-multilevel-opd-modeling-task-spec.md`
- `specs/opm-opd-json-transfer-feature-task-spec.md`
- `specs/opm-opd-navigator-visual-bugfix-task-spec.md`
- `specs/opm-opd-row-add-feature-task-spec.md`
- `specs/opm-opd-row-parent-feature-task-spec.md`
- `specs/opm-operation-history-feature-task-spec.md`
- `specs/opm-opl-panel-feature-task-spec.md`
- `specs/opm-owned-node-placement-bugfix-task-spec.md`
- `specs/opm-p02-model-card-footer-layout-bugfix-task-spec.md`
- `specs/opm-p02-model-trash-lifecycle-feature-task-spec.md`
- `specs/opm-p03-attribute-owner-link-and-collapse-feature-checklist.md`
- `specs/opm-p03-attribute-owner-link-and-collapse-feature-task-spec.md`
- `specs/opm-p03-direct-state-creation-and-default-feature-collapse-checklist.md`
- `specs/opm-p03-direct-state-creation-and-default-feature-collapse-task-spec.md`
- `specs/opm-p03-effect-pair-arrow-direction-bugfix-task-spec.md`
- `specs/opm-p03-feature-owner-and-name-editing-feature-checklist.md`
- `specs/opm-p03-feature-owner-and-name-editing-feature-task-spec.md`
- `specs/opm-p03-feature-owner-relation-symbol-bugfix-checklist.md`
- `specs/opm-p03-feature-owner-relation-symbol-bugfix-task-spec.md`
- `specs/opm-p03-input-output-effect-tool-symbol-bugfix-task-spec.md`
- `specs/opm-p03-opd-switch-loading-layout-bugfix-task-spec.md`
- `specs/opm-p03-parallel-relation-clearance-bugfix-task-spec.md`
- `specs/opm-p03-state-procedural-link-visibility-bugfix-task-spec.md`
- `specs/opm-p03-toolbar-render-fidelity-bugfix-task-spec.md`
- `specs/opm-p03-workbench-header-inspector-polish-refactor-checklist.md`
- `specs/opm-p03-workbench-header-inspector-polish-refactor-task-spec.md`
- `specs/opm-preview-repair-recovery-bugfix-spec.md`
- `specs/opm-refined-element-navigation-feature-task-spec.md`
- `specs/opm-relation-selection-bugfix-task-spec.md`
- `specs/opm-root-opd-name-bugfix-task-spec.md`
- `specs/opm-ui-runtime-metadata-navigation-bugfix-task-spec.md`
- `specs/opm-validation-task-persistence-bugfix-task-spec.md`
- `specs/opm-wheel-zoom-feature-task-spec.md`
- `specs/opm-workbench-bottom-panel-resize-feature-task-spec.md`
- `specs/opm-workbench-navigator-resize-feature-task-spec.md`
- `tests/e2e/drivers/assistant-review-fault.mjs`
- `tests/e2e/fixtures/canvas-performance.ts`
- `tests/e2e/model-lifecycle.spec.ts`
- `tests/e2e/playwright.config.ts`
- `tests/e2e/playwright.performance.config.ts`
- `tests/e2e/viewport-controls.ts`
- `tests/e2e/workbench-assistant-followup.spec.ts`
- `tests/e2e/workbench-assistant-live-plan.spec.ts`
- `tests/e2e/workbench-assistant-markdown.spec.ts`
- `tests/e2e/workbench-assistant-message-edit.spec.ts`
- `tests/e2e/workbench-assistant-quality.spec.ts`
- `tests/e2e/workbench-assistant-review.spec.ts`
- `tests/e2e/workbench-assistant-safety.spec.ts`
- `tests/e2e/workbench-assistant.spec.ts`
- `tests/e2e/workbench-attribute-owner.spec.ts`
- `tests/e2e/workbench-auto-layout.spec.ts`
- `tests/e2e/workbench-blank-context-menu.spec.ts`
- `tests/e2e/workbench-blank-pan.spec.ts`
- `tests/e2e/workbench-context-delete.spec.ts`
- `tests/e2e/workbench-control-label-spacing.spec.ts`
- `tests/e2e/workbench-direct-state-and-default-collapse.spec.ts`
- `tests/e2e/workbench-findings.spec.ts`
- `tests/e2e/workbench-fit-view.spec.ts`
- `tests/e2e/workbench-header-inspector-polish.spec.ts`
- `tests/e2e/workbench-inline-name.spec.ts`
- `tests/e2e/workbench-layout-arrangement.spec.ts`
- `tests/e2e/workbench-layout-selection.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `tests/e2e/workbench-method-classification.spec.ts`
- `tests/e2e/workbench-method-summary.spec.ts`
- `tests/e2e/workbench-method-trace.spec.ts`
- `tests/e2e/workbench-mindmap.spec.ts`
- `tests/e2e/workbench-navigator-visual.spec.ts`
- `tests/e2e/workbench-node-placement.spec.ts`
- `tests/e2e/workbench-opd-json-transfer.spec.ts`
- `tests/e2e/workbench-operation-history.spec.ts`
- `tests/e2e/workbench-opl-panel.spec.ts`
- `tests/e2e/workbench-owned-layout.spec.ts`
- `tests/e2e/workbench-performance.spec.ts`
- `tests/e2e/workbench-relation-selection.spec.ts`
- `tests/e2e/workbench-wheel-zoom.spec.ts`
- `tests/e2e/workbench-zoom-controls.spec.ts`
