# 智能助手实时整图预览与一次确认

Work Mode：change；Risk Level：L3；Task Type：feature；Active Playbooks：backend-springboot (primary)、frontend-vue、testing。

## Spec

目标：助手连续生成整张 OPM 图，生成中逐步在画布显示结果；完成后统一校验，用户只确认一次，整组修改一次事务提交。

非目标：生成中写入真值、删除元素、跨 OPD 写入、自动细化、语义撤销、新依赖、数据库迁移及生产发布。

允许：助手服务/工具/测试、Runtime 草稿服务及模型方案辅助类/测试、草稿协议生成器和对应生成产物/OpenAPI、助手前端预览/面板/测试、相关文档和本规格。禁止：`.harness/`、密钥、用户模型和无关文件；保留此前未提交改动。

契约：新增 APPLY_MODEL_PLAN 草稿命令及 plan-preview 查询。方案限定当前 OPD，最多 100 步，支持对象/过程/状态/关系/改名/布局；本地别名用于新图元依赖，服务端依据候选转换，不接受伪造语义身份。生成中只在内存副本推演，投影通过助手事件流送到画布。每一步复用现有规则保证投影可渲染，完成时重新统一验证；未完成/失败/停止的方案不能确认。确认使用原 token、单一 command_id、Journal 原子提交和回执恢复；冲突/非法/跨图零写入，未知提交保留 pending。旧单步提案仍可恢复。

验收：LP-01 实时方案依赖解析、候选与状态关系正确；LP-02 完整校验后一次事务、幂等、冲突/非法/共享修改零写入；LP-03 自动实时预览及一次确认/取消/停止/恢复/只读/切图；LP-04 真实 DeepSeek 一次需求连续生成多元素关系，在运行中看到预览，完成后一次确认并保存重开。

验证：协议生成/定向契约检查、Runtime MVC及存储回归、助手单元测试、前端定向测试、typecheck/lint/build、隔离模型真实浏览器和截图；不把这些结果表述为全部自然语言意图或完整 ISO 符合性。

回滚：撤销本轮代码，历史旧提案保留。已确认方案复用原 Journal 格式，不变更数据库 schema。

## Plan

新增高层方案步骤和本地别名，Runtime 逐步在副本中绑定候选并生成投影。助手新增 stage_change 工具，逐步保存同一方案并发布投影，完成时再验证并将方案标为 ready。前端自动接收最新方案，生成中禁止确认，完成后提供一个确认入口；原单步能力保持兼容。

## Checklist

引用：本文件 Spec。允许/禁止范围、单次原子提交、实时展示与零真值写入边界已确认。

- [x] LP-01
- [x] LP-02
- [x] LP-03
- [x] LP-04

## 验证记录

- LP-01/02：`JAVA_HOME=… mvn -o -pl services/local-runtime -am -Dtest=DraftWorkspaceControllerTest,DraftJournalRepositoryTest -Dsurefire.failIfNoSpecifiedTests=false test`，55 项通过。覆盖渐进投影、状态依赖关系、重复重演及提交身份稳定、SQLite 一次事务/回执/重启、非法后续步骤及冲突零部分写入、共享改名阻断和本图移动。
- LP-01/02/03：`npm run assistant:test`，20 项通过。覆盖生成阶段零写入、一次确认、失败/停止阻断、错误步骤修正、暂存候选、确认前续聊与稳定身份、未知响应回执恢复。
- LP-03：前端 AssistantPanel/assistantPreview/WorkbenchView 定向 107 项通过；补充自动适应视口后受影响的两组件 104 项再次通过。覆盖自动预览、无变化事件不重绘、生成中禁用确认、切图晚到响应、只读/过期清理及应用。
- 契约：`node --test scripts/draft-workspace-contract.test.mjs`，15 项通过；含生成器一致性、OpenAPI 与封闭步骤/大小/范围检查。
- LP-04：真实 `deepseek-flash` 浏览器隔离模型用例通过（40.4 秒）。一次需求生成 5 个节点、4 条 Consumption/Result 关系；生成中画布可见且真值 token 不变。确认前续聊改名保留图元身份；一次确认 edit_seq=1，重复提交不增加；OPL、保存重开、取消/停止零写入、手工编辑后旧方案 HTTP 409 均通过。截图已实际查看，补齐自动适应整图。
- LP-03/04：重启助手后同一隔离模型恢复会话及记录，真实供应商只读解释不改变 token，用例通过（6.6 秒）。
- 静态与构建：Web typecheck、lint、production build；Java 离线 package 均通过。`git diff --check` 通过，未跟踪交付文件检查空白和密钥；密钥配置仍被 Git 忽略。

浏览器证据目录：`/private/tmp/opm-assistant-live-plan-e2e`、`/private/tmp/opm-assistant-live-plan-resume-e2e`。原 Runtime 数据根保留，Java/助手已重启，Vite 在 5177 热更新。测试只操作隔离测试模型。

验证边界：本轮重新执行的是实时整图主流程及恢复用例；旧七轮兼容/安全/问题编辑 E2E 未整组重跑。上述证据覆盖当前步骤契约和实际咖啡投入产出场景，不代表任意自然语言业务语义正确、完整 ISO 符合性、所有供应商网络故障或生产部署。


## 本轮完整变更清单

以下是本轮文件，先前未提交的助手实现、配置和依赖变更另行保留。

- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `docs/contracts/openapi/opm-draft-workspace-v02.json`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftWorkspaceContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftModelPlan.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOperationDescription.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `apps/assistant/src/service.mjs`
- `apps/assistant/src/harness.mjs`
- `apps/assistant/src/harness-plugin.mjs`
- `apps/assistant/src/harness-sdk.mjs`
- `apps/assistant/test/service.test.mjs`
- `apps/assistant/README.md`
- `apps/web/src/shared/api/assistantApi.ts`
- `apps/web/src/modules/workbench/assistantPreview.ts`
- `apps/web/src/modules/workbench/assistantPreview.spec.ts`
- `apps/web/src/modules/workbench/AssistantPanel.vue`
- `apps/web/src/modules/workbench/AssistantPanel.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-assistant-live-plan.spec.ts`
- `tests/e2e/workbench-assistant.spec.ts`
- `tests/e2e/workbench-assistant-safety.spec.ts`
- `tests/e2e/workbench-assistant-message-edit.spec.ts`
- `docs/design/opm-conversational-modeling-design.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `specs/opm-assistant-live-plan-task-spec.md`
