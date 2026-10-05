# 大文件职责拆分实现与验证记录

日期：2026-09-16。
规格：[大文件职责拆分](../../specs/opm-maintainability-module-extraction-task-spec.md)。

## 1. 实现范围与职责

本轮以任务开始时的工作树为基线，保留既有未提交的 V2 草稿、节点编辑、关系与布局功能。下表的“拆分前”不是 Git HEAD 行数。拆分以职责为界，不将业务规则复制到多个入口。

| 原文件 | 拆分前行数 | 拆分后行数 | 当前职责与提取方向 |
|---|---:|---:|---|
| `LocalApiService.java` | 2286 | 848 | 保留应用入口、事务及协调；提取投影查询、候选、语义编辑和删除规则 |
| `OplTextGenerationService.java` | 2377 | 1000 | 保留文本生成门面与句式规划；提取 Token/Trace 构建和校验 |
| `workbenchRuntime.ts` | 1505 | 704 | 保留会话、加载序号、提交串行化、保存及投影更新；提取交互和纯映射 |
| `WorkbenchView.vue` | 546 | 375 | 保留页面编排；提取属性面板、底部面板与导航生命周期 |
| `OpdCanvas.vue` | 550 | 344 | 保留唯一 Graph 和事件协调；提取节点图层与名称编辑 |
| `base.css` | 2115 | 10 | 按原顺序导入 10 个职责样式文件 |

后端新增类为包内实现，公共入口、构造器、响应、错误码、Profile binding、V1/V2 授权边界及事务归属不变。`SemanticCommandEditor` 组合 Element、Fact、Layout、Deletion 规则；被提取的规则不访问数据库，也不创建事务。

`OplTokenPipeline` 负责 Token、来源和 Trace 范围构建；`OplTraceValidator` 负责 Artifact/Trace 校验；两者通过 `OplSemanticSupport` 共享身份、Context 和 UTF-8 基础计算，避免互相依赖或复制规则。

前端 `stores/workbench/` 是原 store 的私有协作模块。Relation/State/删除候选通过显式依赖接入唯一会话；`loadSequence`、`draftSession`、`editInFlight` 留在原 store。子面板只取得需要的类型化接口，表单变更通过事件回传；导航保留迟到响应保护和卸载清理。Graph 由 `OpdCanvas.vue` 创建/销毁，提取模块通过 `getGraph()` 使用现有实例。

采用仓库 `jdp-vue3-project-structure` 技能的模块归属原则，保留当前项目目录与组件库，不进行 JDP 框架迁移。

## 2. 本轮完整文件清单

以下清单仅包含本任务改动；不代表整个 dirty 工作树。

### 后端应用层

目录：`services/local-runtime/src/main/java/org/opm/localruntime/application/`。

- 修改：`LocalApiService.java`。
- 新增：`OpdProjectionQuery.java`、`RelationCatalogQuery.java`、`CommandCapabilityOptions.java`、`SemanticViewSupport.java`。
- 新增：`SemanticCommandEditor.java`、`SemanticElementEditor.java`、`SemanticFactEditor.java`、`SemanticLayoutEditor.java`、`ConstructDeletionPolicy.java`、`SemanticEditValues.java`。

### OPL 文本层

目录：`services/local-runtime/src/main/java/org/opm/localruntime/text/`。

- 修改：`OplTextGenerationService.java`。
- 新增：`OplTokenPipeline.java`、`OplTraceValidator.java`、`OplSemanticSupport.java`。

### 前端工作台

目录：`apps/web/src/stores/`。

- 修改：`workbenchRuntime.ts`。
- 新增：`workbench/workbenchState.ts`、`workbench/projectionMapping.ts`、`workbench/candidateRules.ts`、`workbench/runtimeError.ts`、`workbench/relationEditing.ts`、`workbench/constructEditing.ts`。

目录：`apps/web/src/modules/workbench/`。

- 修改：`WorkbenchView.vue`、`OpdCanvas.vue`。
- 新增：`WorkbenchInspector.vue`、`WorkbenchBottomPanel.vue`、`workbenchPresentation.ts`、`useWorkbenchNavigation.ts`、`opd/useCanvasNameEditor.ts`、`opd/core/x6-node-layer.ts`。

### 样式

目录：`apps/web/src/shared/styles/`。

- 修改：`base.css`。
- 新增：`foundation.css`、`shell.css`、`pages.css`、`forms.css`、`workbench-layout.css`、`workbench-tools.css`、`workbench-canvas.css`、`workbench-panels.css`、`feedback.css`、`responsive.css`。

### 回归测试与记录

- 修改：`tests/e2e/workbench-layout.spec.ts`、`tests/e2e/workbench-location.spec.ts`。
- 新增：`tests/e2e/helpers/workbench-revision.ts`。
- 新增：`specs/opm-maintainability-module-extraction-task-spec.md`、`docs/checklists/opm-maintainability-module-extraction-checklist.md`、本文。

测试调整只适配已经存在的 V2 行为：从真实永久链接读取已固定 Revision，区分 V1 顶层命令与 V2 `command` 外壳，更新现有组合工具提示断言。保留命令次数、payload、稳定 Fact 身份、OPL、只读、URL 和重开等结果检查。

## 3. 验证与证据

| 验证 | 实际结果 |
|---|---|
| 拆分前基线 | 前端 19 文件、221 测试通过；后端定向 229 测试通过 |
| 拆分后前端 | typecheck、lint、221/221 单测通过；Vite 构建成功 |
| 后端定向扩大回归 | API/Draft/OPL 共 318/318 通过；后续语义编辑继续拆分后，领域相关 140/140 通过 |
| 后端最终全量 | 486 项执行，484 通过、1 failure、1 error；两项未通过均为同一个既有 Fault Plan Schema 摘要冲突，见下文 |
| JAR 与隔离 fixture | JAR package 成功；`DraftBrowserFixtureTest` 成功 |
| CSS 等价 | PostCSS AST 去除位置与排版元信息后完全一致，选择器、声明及级联顺序保持 |
| 工作台浏览器回归 | 最后一轮完整执行 26 项，24 通过、2 失败，无跳过；失败为 V2 校验未完整接入和未知 Context 未回退，见下文 |
| 差异 | `git diff --check` 通过；未改公共契约、依赖、Schema、发布 runner 或用户数据库 |

后端执行环境为 Java 21（`graalvm-jdk-21.0.7`），Maven 离线模式。命令：

```sh
npm run typecheck --workspace=@opm/web
npm run lint --workspace=@opm/web
npm run test --workspace=@opm/web
npm run build --workspace=@opm/web

./mvnw -o -pl services/local-runtime -am test \
  '-Dtest=*Opl*Test,LocalApiServiceTest,LocalApiControllerTest,Draft*Test,HybridSaveActivationTest,NewDraftModelTest' \
  -Dsurefire.failIfNoSpecifiedTests=false
./mvnw -o -pl services/local-runtime -am test

OPM_E2E_EXTERNAL_SERVERS=true npm exec -- playwright test \
  tests/e2e/workbench-layout.spec.ts \
  tests/e2e/workbench-hybrid-save.spec.ts \
  tests/e2e/workbench-inline-name.spec.ts \
  tests/e2e/workbench-owned-layout.spec.ts \
  tests/e2e/workbench-relation-gesture.spec.ts \
  tests/e2e/workbench-location.spec.ts \
  tests/e2e/workbench-construct-lifecycle.spec.ts \
  --config=tests/e2e/playwright.config.ts \
  --output=/private/tmp/opm-refactor-e2e.oLgMiP/verified-results \
  --reporter=line
```

以上 Maven 命令需要 `JAVA_HOME=/Users/xiaotaowang/Library/Java/JavaVirtualMachines/graalvm-jdk-21.0.7/Contents/Home`。浏览器服务使用独立端口 5176/17851 和临时数据库 `/private/tmp/opm-refactor-e2e.oLgMiP/opm-hs03b-browser`，未使用用户的 `runtime-data`。重验须新建 fixture 目录，不能覆盖本轮证据目录。

收尾已核对进程参数并停止本轮临时服务，5176/17851 无监听；临时数据库、日志和截图保留，用户服务未重启或停止。

本机原始日志保留于 `/private/tmp/opm-refactor-backend-baseline.log`、`opm-refactor-backend.log`、`opm-refactor-domain-tests.log`、`opm-refactor-backend-full.log`、`opm-refactor-package.log`、`opm-refactor-browser-fixture.log`、`opm-refactor-e2e.log`、`opm-refactor-e2e-remaining.log`、`opm-refactor-e2e-capabilities.log`、`opm-refactor-e2e-structural.log`、`opm-refactor-e2e-final.log`、`opm-refactor-e2e-verified.log`（后续文件名均在同一 `/private/tmp/` 目录）。最后一份日志对应 24/26 结果，截图与 trace 在临时证据根目录下。

通过的浏览器用例覆盖节点选择/改名/移动、State 与 Feature、关系创建/编辑/删除、16 类 Procedural、8 类 Control、10 类 Structural、OPL/Trace 重开、面板折叠、手动和自动保存、交付恢复、迟到响应保护及 HEAD/EXACT 正常导航。桌面与移动截图已查看；部分聚合用例在失败断言后未执行的步骤不列为通过。不是 production build 下的发布级全矩阵验证。

### 已定位的问题

1. 后端 `E2EFaultPlanVerifierTest` 两项失败：`E2EFaultPlanVerifier.EXPECTED_SCHEMA_SHA256` 为 `3508290b…`，实际源码 Schema 与复制到 `target/classes` 的资源均为 `d8c34923…`。已对 Git HEAD 执行源码读取与 SHA-256 核对，相同冲突已在 HEAD 中存在；两个源文件在本轮无差异。不是陈旧 JAR 单独导致，本轮不修改冻结的 Fault Launcher/Schema 校验契约。
2. 旧工作台 E2E 的四处失败分别涉及 V2 下不存在的 release capture 标记、两处 V1 命令外壳断言和旧工具提示。定位后更新测试，并连同两项稳定 URL 测试一起使用真实保存版本验证。
3. 十类 Structural 聚合测试的 fan 拖线出现时序失败：原 helper 仅等待离开 `dragging`，尚处于 `candidate-filtering` 就开始下一段，鼠标按下被忽略。单独带 trace 重跑曾通过；后续完整运行捕获到过滤中的状态，遂在 helper 增加候选查询完成等待。未增加任意 sleep，未修改业务状态机。
4. V2 两项现有行为与旧验收预期不一致：手动校验只提示核心校验 `INCOMPLETE`，界面仍为“结果过期”；带未知 Context 的 HEAD 打开返回 `NOT_FOUND`，未回退根图。通过逆向本轮补丁恢复内存中的任务前源码，核对 `load`、`runValidation` 与当前实现逐字一致（store 原 1505 行，现 704 行）。未执行完整拆分前浏览器基线；上述是当前运行结果及源代码对比证据。保留这两个失败断言，不修改或跳过检查来宣称全绿。
5. 前端构建仍提示 `/opm-bootstrap.js` 为非 module 脚本；本次未改此启动契约。主 JS 198.80 kB，画布分片 450.45 kB；仅是本机构建结果，不是发布性能验收。

## 4. 未纳入本轮的拆分

`scripts/release-canvas06-e2e-run.mjs` 暂未拆分。其源码受 [Runner Source Set Schema](../contracts/schemas/opm-dev-canvas-06-e2e-runner-source-set.schema.json) 的 `EXACT_ALLOWLIST_ALL_OTHERS_EXCLUDED` 与固定 24 项约束；`scripts/canvas06-e2e-run-stage.mjs` 同时校验精确数量。引入新模块需要同步 source-set、staging、verifier、打包输入和冻结设计，不能只移动文件。

本轮也未机械拆分大型聚合测试。它们继续作为跨模块行为保护；后续可按独立领域及复用 fixture 划分，不以文件行数作为唯一标准。

本次是本地重构与回归，不提升 GATE、Candidate、Activation 或 ISO 符合性状态。
