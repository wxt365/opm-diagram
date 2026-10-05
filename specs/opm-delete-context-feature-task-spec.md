# 子图及下级图删除

Work Mode: change；Risk Level: L3；Task Type: feature。
Active Playbooks: backend-springboot (primary), frontend-vue, testing。

## Spec

用户已通过“下一步”授权前一轮具体方案及必要前后端契约扩展。
目标：OPD行右键「删除子图…」，预览子树和专属内容数量、确认后原子删除并返回父图；父元素保留，边框/创建入口恢复。跨图引用阻断，历史版本保留。
非目标：根图删除、只读修改、跨图引用自动重写、语义撤销、数据库迁移及通用菜单重构。
允许：工作台Vue/store/session及定向测试；草稿契约生成器和生成的TS/JSON资源、对应契约测试和JS/Java草稿交叉字段校验；后端application草稿命令/领域删除策略及API测试；Journal日志回放改为相邻编辑版本校验（保持不可变字段和仅允许0.2→0.3升级，无迁移）；规格、API和页面设计文档。
禁止：新增依赖、数据库schema、配置、.harness、原案例数据、旧Revision API行为扩展及无关重构。
仓库repo-profile仍为Harness模板事实，实际运行命令以现有package.json/pom.xml为准，不修改该模板。
契约：仅草稿V2新增DELETE_CONTEXT、DeleteContextPayload和ContextDeleteImpact候选；复用DraftToken、候选/影响摘要身份和Journal原子提交。保留旧删除契约。无需数据迁移。

验收：
- A1：非根OPD右键可预览/取消/确认；根图、只读及忙碌禁用；窗口说明子图/后代及专属内容数量，错误可见。
- A2：后端计算完整子树，删除图/细化边、出现位置/布局及专属元素/特征/状态/关系，保留父元素、非子树和历史修订。
- A3：跨图出现位置、关系端点、细化边及状态呈现/所属引用阻断；伪造目标/影响token、过期token拒绝且无部分写入，重试幂等。
- A4：删除当前图或其他子图后回读幸存父图，导航和加粗标记更新；保存/重开成立，取消零写入。
- A5：封闭schema、定向后端原子/引用拒绝测试、前端会话/工作台回归、真实画布子树删除及历史/只读、契约/typecheck/lint/diff通过。

## Plan

1. 在V2生成器增加封闭删除payload及携带context_impact的候选，不修改旧Revision契约。
2. 新领域删除策略共用预览/执行计划，在同一Journal提交内重建授权及影响token后应用JSON差异，保留未删除正文原字段。
3. store沿用候选缓存和execute回读，仅DELETE_CONTEXT指定幸存父图作回读目标；树右键和确认窗口复用现有交互/样式。
4. 先契约/后端定向验证，再重建后端启动真实浏览器，验证三级子树/父元素/历史与取消，最后回归和文档。

## Checklist

Spec: specs/opm-delete-context-feature-task-spec.md。允许/禁止边界已确认，API/草稿schema扩展已授权；无需db-migration。
- [x] A1
- [x] A2
- [x] A3
- [x] A4
- [x] A5

## 验证与回滚

隔离测试模型，finally移入回收站，不删除用户现有案例子图。定向Java API测试使用独立SQLite临时目录。
回滚本次命令/界面增量；旧版本可读取剩余模型正文，新删除记录仍保留在Journal和已有历史，不宣称语义撤销。


## 实际验证（2026-10-02）

- A1/A4：真实前后端 `tests/e2e/workbench-context-delete.spec.ts` 与既有 `workbench-navigator-visual.spec.ts`，3项通过。隔离模型由画布工具创建三级树、对象/过程、属性和状态；在下级图右键祖先子图，确认覆盖2张图。取消无删除请求且token不变，删除后回到SD，父对象边框4→2且添加入口恢复。手动保存、刷新后只剩根图；删除前历史仍有3张图和全部原内容，属性需按既有交互展开。根图和历史只读菜单禁用，Escape可关闭。桌面1440×1000与窄屏390×844截图已人工查看，确认窗口未越界。
- A2/A3：Java21 + Maven3.9.10，`DraftWorkspaceControllerTest,DraftJournalRepositoryTest,DraftWorkspaceContractTest,DraftSaveControllerTest` 共62项通过。新增删除测试含下级图内容和内部关系，保存前Journal重开、原子拒绝、跨图occurrence/关系/状态呈现/细化边阻断、伪造目标/候选/影响token、旧token拒绝、重试幂等、schema降级拒绝和历史表保留。
- A1/A4：Vitest定向 `draftWorkbenchSession.spec.ts,WorkbenchView.spec.ts,OpdCanvas.spec.ts` 共135项通过，含取消后迟到响应、提交失败保留窗口、草稿变化清除删除授权、父图回读和只读/引用拦截。
- A5：JS封闭契约10项通过；`npm run contract:validate`、`npm run typecheck`、`npm run lint`、`git diff --check`通过。
- 已重建后端jar并重启17850服务，数据目录仍为 `/private/tmp/opm-diagram-preview-runtime`；5177前端热更新。浏览器验证模型均移入回收站，原案例未修改。截图及测试日志在 `/private/tmp/opm-context-delete-e2e` 和 `/private/tmp/opm-context-delete-*.log`。

## 本次修改文件（不包含前几轮已有变更）

- `scripts/generate-draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.mjs`
- `scripts/draft-workspace-contract.test.mjs`
- `docs/contracts/schemas/opm-draft-workspace-v02.schema.json`
- `services/local-runtime/src/main/resources/draftsave/draft-workspace-v02.schema.json`
- `apps/web/src/shared/api/generated/draftWorkspaceContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/DraftWorkspaceSchema.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftContextDeletion.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/storage/DraftJournalRepository.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java`
- `apps/web/src/shared/api/draftWorkbenchSession.ts`
- `apps/web/src/shared/api/draftWorkbenchSession.spec.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-context-delete.spec.ts`
- `docs/design/opm-modeling-tool-application-api-contract.md`
- `docs/design/opm-modeling-workbench-page-design.md`
- `specs/opm-delete-context-feature-task-spec.md`
