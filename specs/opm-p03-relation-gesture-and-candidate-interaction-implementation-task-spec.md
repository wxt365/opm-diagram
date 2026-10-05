# Spec: P03 关系手势与统一候选交互实现

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `frontend-vue (primary)`
- `backend-springboot`
- `testing`

## 1. 目标

实现设计规格 `opm-p03-relation-gesture-and-candidate-interaction-design-bugfix-task-spec.md`：以单一 Runtime 目录进入 16 Procedural、10 Structural 的拖线/Runtime 候选流程，并以选中基础 Procedural Fact 进入 8 Control 的注记预览/确认更新。基础关系的后继直接创建语义以 `opm-p03-direct-relation-commit-interaction-task-spec.md` 为准。

## 2. 非目标

- 不修改 SQLite、Profile/Rule/Grammar/Symbol 资产、依赖、路由、发布资产或生产 Capability 状态。
- 不改变 Fact/Occurrence/Modifier/OPL/Trace 的持久化语义。
- 不实现自由连线、前端端点规则或 Control 第二关系。
- 不重构本任务之外的节点、名称编辑、State 或 Layout 路径。

## 3. 允许范围

允许修改：

- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs`
- `apps/web/src/shared/api/generated/apiEdtContract.ts`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/shared/styles/base.css`
- `apps/web/src/modules/workbench/opd/core/relation-gesture-state.ts`
- `apps/web/src/modules/workbench/opd/core/relation-gesture-state.spec.ts`
- `apps/web/src/modules/workbench/opd/core/relation-preview-render-spec.ts`
- `apps/web/src/modules/workbench/opd/core/relation-preview-renderer.ts`
- `apps/web/src/modules/workbench/opd/core/relation-preview-renderer.spec.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-gesture-adapter.ts`
- `apps/web/src/modules/workbench/opd/core/x6-relation-gesture-adapter.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `tests/e2e/workbench-relation-gesture.spec.ts`
- `docs/README.md`（仅同步实现状态）
- `docs/design/opm-design-freeze-baseline.md`（仅同步实现与证据状态）
- 本规格与对应 checklist

禁止修改上述清单外文件，尤其数据库 migration、Profile packages、Golden、Manifest、Report、Candidate、Activation 和 `runtime-data/`。新增测试发现清单外根因时必须先修正规格，不得静默扩围。

## 4. 实现契约

### 4.1 OpenAPI 与 Runtime

1. `API-CAT-001` 接收可选 `selection_id`；Catalog item 增加设计规格第 5.1 节字段并保持 `additionalProperties=false`。
2. 生成器必须精确校验枚举、required 字段、仅可缺失但不可为 `null` 的 `max_endpoints` 和嵌套 role 形状，再同步 TS/Java DTO digest。
3. Runtime 从活动 Catalog/Profile/asset binding 生成 34 项，不从前端参数接受 endpoint legality。
4. Control 的 `enabled/reason_codes` 必须由所选 committed Procedural Fact 和真实 `UPDATE_FACT` options 计算；非 Fact、Structural Fact、缺选择和不匹配基础 Capability 均不得启用。
5. `API-EDT-001` 继续以用户选择顺序接收重复 endpoint ID，返回规范 `normalized_endpoints`；现有 `CREATE_FACT/UPDATE_FACT` payload wire 保持不变。

### 4.2 前端状态与手势

1. 删除两个同质关系按钮，只保留 `P03-tool-relation`；目录项必须可进入对应流程。
2. `relation-gesture-state.ts` 是七阶段状态和转换的唯一 owner；Store 不维护第二套字符串状态。
3. `x6-relation-gesture-adapter.ts` 是四类意图事件的唯一 X6 owner；临时拖线与 candidate cells 在取消、Context 切换、工具切换和卸载时完整释放。
4. Store 只用 current Projection 将 occurrence 映射为 API endpoint locator；不得从 DOM、Cell shape、文字或拖线方向推断角色。
5. 当前端点数小于 Catalog `min_endpoints` 时直接返回 `relation-armed` 继续选择，但不得据此推断端点合法性；fan 继续添加、同一 Process Self-invocation 和 State occurrence 必须保留原选择顺序并由 Runtime normalization 覆盖规范顺序。

### 4.3 预览与提交

1. 26 个基础 Capability 全部经过 Runtime option；无自由参数的唯一 option 由后继直接创建规格授权自动提交，需要参数、多个 option 或失败恢复才保留可见 `RelationPreviewRenderSpec`。
2. preview renderer 复用 Capability Definition 和 exact symbol ref，但强制移除 relation/occurrence/capture identity；通用虚线只允许用于尚未释放的 pointer drag，不允许作为 candidate preview。
3. 参数变化以同一 option 重建 preview；端点集合变化重新查询。每次提交前进行 exact option refresh，再提交恰一次 `CREATE_FACT`。
4. Control 使用只读 base RenderSpec 的临时 annotation overlay，确认后提交恰一次 `UPDATE_FACT`；不得增加 edge 或 anchor。
5. query/validation/commit 失败保留用户输入和可复核 reason；取消、空白、无候选及失败路径不得改变 revision tag。

## 5. 验收

- `REL-GESTURE-IMPL-01`：OpenAPI、生成 DTO 与 Runtime Catalog 新字段闭合，目录精确为 16/8/10。
- `REL-GESTURE-IMPL-02`：单一入口可从每个 Procedural/Structural item 进入拖线，Control 只能从 selected base Fact 进入。
- `REL-GESTURE-IMPL-03`：七阶段状态机与四类 X6 意图按冻结顺序运行，X6 零命令提交。
- `REL-GESTURE-IMPL-04`：26 个基础 Capability 均使用 Runtime 候选；无自由参数时最终松开后恰一个新 Revision，需要参数时编辑提交前 revision 不变。
- `REL-GESTURE-IMPL-05`：Control preview 只显示 `e/c` overlay，确认后更新同一 Fact，不创建第二关系。
- `REL-GESTURE-IMPL-06`：取消、空白、非法 Cell、无候选、参数失败、query/commit 失败均零 committed artifact并按规定保留/清理。
- `REL-GESTURE-IMPL-07`：binary、fan、Self-invocation、State-specified 和 reload E2E 通过。
- `REL-GESTURE-IMPL-08`：contract、Java Service/MVC、Vue/store/adapter、typecheck、build、浏览器 E2E 和 diff 检查通过。

## 6. 验证顺序

1. OpenAPI generator/validator 正反例；
2. Runtime Catalog/Capability/command Service 与 MVC；
3. 纯状态机、preview renderer、X6 gesture adapter 单测；
4. Workbench Store/View/Canvas 组件测试；
5. typecheck、build 和完整前端回归；
6. Playwright 更新既有工作台主回归并新增关系手势专用回归，覆盖 26 个基础入口、8 个 Control 入口、零提交反例、fan/Self/State/reload；
7. Markdown/契约引用和 `git diff --check`。

## 7. 回滚

回退本规格允许的 OpenAPI、Runtime、前端和测试文件，恢复旧 UI 前必须同时关闭完整关系能力入口；不得恢复两个按钮同函数、目录无动作或 option 直接提交。已提交业务 Revision 不改写、不删除。
