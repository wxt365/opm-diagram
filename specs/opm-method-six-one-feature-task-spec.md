# 架构方法：6×1 关系证据检查

Work Mode：change；Risk Level：L3；Task Type：feature。
Active Playbooks：backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：让架构方法面板可按过程查看六类事物的现有关系证据、缺口提示与人工确认边界，并定位到对应 OPD、连线和端点。依据 reference/基于OPL的架构建模方法20260425.pdf 第8章（草案）。
非目标：完整 M11、三层架构分类、跨层追溯、决策/豁免持久化、功能信息模板、自动认定角色、ISO 全面符合性。
允许：web 工作台/store/API、local-runtime application/API、草稿契约生成器及其五份产物、定向测试、相关设计文档、本 Spec。
禁止：语义文档和数据库 schema、迁移、依赖、配置、持久化业务修改、案例模型修改、无关重构、.harness 写入。
契约：新增只读 method-summary 查询；请求精确草稿 token 或保存版本 ID 二选一，结果绑定同一输入及 context。查询不编辑模型、不修改语言校验/阻断计数。
方法边界：Agent 是主体候选，需确认人/组织；Effect 是客体候选；Instrument 是手段或信息候选，需确认用途；Consumption 是资源候选。支持对象和状态端点（含特征状态归属）；不从名称、essence 或 affiliation 猜信息/环境角色。未出现关系只提示无证据，不判错误。Result 不冒充 Effect。所有证据覆盖整个模型，过程可筛选当前 OPD/全部 OPD；明确跨图证据来源。

验收：
- M1 六类卡片、过程选择、当前/整个模型过滤、空态、缺口/待确认说明可用，无“方法全部通过”的伪结论。
- M2 后端从实际 procedural capability/角色构造证据，支持状态/特征归属，同名不同 ID 隔离，不改变输入。
- M3 草稿 token 冲突、非法输入、未知 context/version 拒绝；历史版本独立查询，不混入后续编辑。
- M4 点击证据定位关系及端点，可跨 OPD；编辑/切模型/版本后清除过期结果与高亮，迟到请求不覆盖当前输入，失败可重试，不阻断编辑。
- M5 后端/契约/前端测试、typecheck/lint/build、真实画布创建关系/查询/定位/保存重开/历史/窄屏/失败重试通过；隔离测试模型回收。

验证：先纯规则及 Controller/严格契约，再 Vue/store，最后构建本地服务及 Playwright；原五个案例只读。回滚：仅恢复本轮增量，既有文件的其他差异保留；无数据回滚或迁移。

## Plan

1. 应用层纯查询生成过程及六类证据；新增封闭查询契约，复用保存版本文档读取。
2. 独立查询加载器、输入守卫和高亮状态；跨图定位保留输入身份，复用现有画布高亮呈现及导航。
3. 独立面板，复用底部按钮样式；中文说明和自适应列表。
4. 定向验证后真实画布验收并记录证据。

## Checklist

Spec：specs/opm-method-six-one-feature-task-spec.md
- [x] 边界确认：新增只读查询契约允许；语义/数据库 schema、依赖、配置、持久化修改禁止。
- [x] M1
- [x] M2
- [x] M3
- [x] M4
- [x] M5


## 实施与验证

- M1/M2：六类卡片和过程/范围选择已接入；有关系仍需确认用途，环境/信息明确人工确认。纯规则覆盖 10 个对象/状态能力，包括特征状态所属对象、同名不同过程、跨图证据；查询不改变输入，不按名字或环境属性分类。Result/Invocation 不冒充客体影响证据。
- M3：真实 SQLite/MockMvc 验证精确 token、互斥来源、未知 context/version、读取不写入、历史与后续名称隔离。历史读取的 NOT_FOUND/PERSISTENCE_FAILED 在查询入口保留，未改变旧编辑错误处理。
- M4：独立加载器丢弃迟到结果；刷新保留已选过程，数据未加载时不显示旧卡片。证据定位跨图保留输入身份；连线、端点及所属对象同组高亮，编辑/切换后清除。高亮参数使用稳定 computed，方法响应不产生新的画布参数引用。方法面板沿用底部滚动容器和局部按钮样式。
- M5：后端 59 项通过（MethodSummaryQueryTest 4、DraftWorkspaceControllerTest 36、DraftSaveControllerTest 19），Maven package 通过。前端定向 137 项通过，迟到请求测试加强后加载器 2 项再通过；契约 12 项、完整 contract:validate、vue-tsc、ESLint、web build 和 git diff --check 通过。
- 真实 Playwright 最终 4 流程通过：新建模型在画布创建对象/过程并连出 Consumption、Agent、Instrument；方法证据/缺口及连线端点高亮、子图创建与跨图定位、保存重开、后续名称与历史隔离、读取失败重试、390px 无横向溢出。原 PROC 客体状态关系只读定位通过；原 OPL 多案例定位/下载及新画布连接回归通过。未在画布新建全部十种状态关系，状态/特征归属由纯规则测试与已有 PROC 实际画布补充验证。
- 后端旧 PID 8282 退出，新 PID 25648 以原数据目录和端口启动；前端 Vite 热更新。最终只读 API 确认活动模型 5 个，活动架构方法测试模型 0 个。无语义文档/数据库 schema 或数据迁移，无新依赖。

实际命令：
- `mvn -o -pl services/local-runtime -am package -Dtest=MethodSummaryQueryTest,DraftWorkspaceControllerTest,DraftSaveControllerTest -Dsurefire.failIfNoSpecifiedTests=false`（Java 21，现有 Maven wrapper 安装路径）。
- `npm --prefix apps/web run test -- src/stores/workbench/methodSummary.spec.ts src/modules/workbench/WorkbenchMethodPanel.spec.ts src/modules/workbench/WorkbenchBottomPanel.spec.ts src/modules/workbench/WorkbenchView.spec.ts src/stores/workbench/findingsWorkflow.spec.ts src/shared/api/draftWorkbenchSession.spec.ts`。
- `node --test scripts/draft-workspace-contract.test.mjs`、`npm run contract:validate`、`npm --prefix apps/web run typecheck`、`npm --prefix apps/web run lint`、`npm --prefix apps/web run build`、`git diff --check`。
- `OPM_E2E_EXTERNAL_SERVERS=true OPM_PLACEMENT_BASE=http://127.0.0.1:5177 OPM_PLACEMENT_PROJECT=project.9ae0e3dd46ae4f3a8b45520c5057ecd7 npx playwright test --config=tests/e2e/playwright.config.ts tests/e2e/workbench-method-summary.spec.ts tests/e2e/workbench-opl-panel.spec.ts --output=/private/tmp/opm-method-regression-e2e`。

证据：`/private/tmp/opm-method-package.log`、`/private/tmp/opm-method-frontend-final.log`、`/private/tmp/opm-method-contract.log`、`/private/tmp/opm-method-full-contract.log`、`/private/tmp/opm-method-typecheck-final.log`、`/private/tmp/opm-method-lint-final.log`、`/private/tmp/opm-method-web-build-final.log`、`/private/tmp/opm-method-regression-e2e.log` 和该浏览器输出目录截图。

## 本轮完整文件清单

- services/local-runtime/src/main/java/org/opm/localruntime/application/MethodSummaryQuery.java
- services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
- services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java
- services/local-runtime/src/test/java/org/opm/localruntime/application/MethodSummaryQueryTest.java
- services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
- scripts/generate-draft-workspace-contract.mjs
- scripts/draft-workspace-contract.test.mjs
- docs/contracts/openapi/opm-draft-workspace-v02.json
- docs/contracts/schemas/opm-draft-workspace-v02.schema.json
- services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json
- services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java
- apps/web/src/shared/api/generated/draftWorkspaceContract.ts
- apps/web/src/shared/api/localRuntimeApi.ts
- apps/web/src/stores/workbenchRuntime.ts
- apps/web/src/stores/workbench/methodSummary.ts
- apps/web/src/stores/workbench/methodSummary.spec.ts
- apps/web/src/modules/workbench/WorkbenchMethodPanel.vue
- apps/web/src/modules/workbench/WorkbenchMethodPanel.spec.ts
- apps/web/src/modules/workbench/WorkbenchBottomPanel.vue
- apps/web/src/modules/workbench/WorkbenchView.vue
- tests/e2e/workbench-method-summary.spec.ts
- docs/design/opm-modeling-tool-application-api-contract.md
- docs/design/opm-modeling-workbench-page-design.md
- specs/opm-method-six-one-feature-task-spec.md
