# Spec: P03 统一画布构造生命周期实现

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`feature`

## Active Playbooks

- `none (primary)`

## 1. 目标

实现 `opm-p03-unified-construct-lifecycle-design-task-spec.md` 已冻结的画布构造删除链路。Object、Process、Attribute、Operation、State、Procedural/Structural Fact 均通过 Runtime 的 `DELETE_CONSTRUCT` option 和 opaque token 提交；Control 通过同一基础 Fact 的 `UPDATE_FACT(replacement.modifiers=[])` 移除。右键菜单项直接执行，`Delete/Backspace` 查询后按固定优先级直接执行且不显示菜单。

## 2. 非目标

- 不修改 SQLite migration、Profile/Rule/Grammar/Symbol 资产、依赖、路由、发布工件、Candidate、Activation 或 `runtime-data/`。
- 不实现 Context 删除、跨 Context 移动、批量删除、前端依赖分析、自由删除 X6 Cell 或 undo/redo。
- 不改变创建 payload、Fact/Modifier 的既有持久化语义，也不重构本任务以外的关系手势与节点渲染。

## 3. 允许与禁止范围

允许修改：

- `docs/contracts/openapi/opm-local-api-v1.yaml`
- `scripts/generate-api-edt-contracts.mjs`
- `scripts/validate-contracts.mjs`
- `apps/web/src/shared/api/generated/apiEdtContract.ts`
- `apps/web/src/shared/api/localRuntimeApi.ts`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/shared/styles/base.css`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/api/LocalApiController.java`
- `services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/api/LocalApiControllerTest.java`
- `services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java`
- `tests/e2e/workbench-layout.spec.ts`
- 新增 `tests/e2e/workbench-construct-lifecycle.spec.ts`
- `docs/README.md`、`docs/design/opm-design-freeze-baseline.md`（仅同步实现和验证状态）
- 本规格与对应 checklist

禁止修改上述清单外文件。任何需要 SQLite、Profile 或资产变更的发现必须先形成新的设计/实现规格，不能静默扩围。

## 4. 实现契约

### 4.1 OpenAPI、生成器与 DTO

1. `CommandCapabilityOption` 以封闭的 `delete_mode`、`delete_target`、完整 `impact_summary` 和 `impact_token` 表达删除 option；非删除 option 不得携带删除字段。
2. `DeleteConstructPayload` 必须精确为 `selection_id`、`construct_kind`、`construct_id`、`delete_mode`、`impact_token` 五个字段。`REMOVE_OCCURRENCE` 只能提交 `OCCURRENCE/selection_id`；其余模式只能提交 `ELEMENT|FEATURE|STATE|FACT`。
3. 生成器同步 TypeScript/Java DTO，校验所有新增枚举、required、`additionalProperties=false` 与 DELETE_CONSTRUCT 分支。
4. `UPDATE_FACT` 的 Control 移除复用既有 command payload，不新增 Control 删除 command。

### 4.2 Runtime

1. 查询严格以当前 projection 的 `selection_id=occurrence_id` 解析目标；未知、装饰或非当前 context occurrence 返回稳定不可删除原因，不产生 Revision 或 Operation Record。
2. Runtime 对 Element、Feature、State、Fact 和 occurrence 计算 `REMOVE_OCCURRENCE`、`DELETE_TARGET`、`CASCADE`。影响项完整、去重并按 `kind/id/context_id` 规范排序；阻断模式只有 `BLOCKER` 项，启用模式只有 `DIRECT/CASCADE` 项。
3. 删除 token 精确绑定 project/model/context、revision、binding、selection、mode、target、规范 impact、query 和 option。提交逐字段重算并验证，任一不一致返回 `IMPACT_TOKEN_STALE/409`，不写入 Revision。
4. `DELETE_TARGET` 有依赖时保留 disabled option 和 `DELETE_DEPENDENCY_EXISTS`；只有 Runtime 可闭包时才提供可提交的 `CASCADE`。删除在既有 candidate revision/提交事务中完成，失败零部分删除，重复 command id 保持既有幂等顺序。
5. 删除 Fact 同时清除它的 Control modifiers 与相关投影；移除 Control 只清空完整 modifier pair，保留基础 Fact、ID、endpoints、layout 和 capture anchor，并重建 OPL/Trace。

### 4.3 画布与交互

1. `OpdCanvas` 仅发送 `construct-actions-menu-requested` 与 `construct-delete-cancelled` 意图；右键有效 committed construct 先选择 occurrence，再请求 Runtime option。空白、未知和装饰 Cell 保持浏览器原生菜单。
2. Store 是查询、菜单与提交的唯一 owner。菜单仅展示 Runtime option、影响数量和 blocker；点击 enabled option 立即提交，不存在 `pending` 或二次确认状态。
3. 删除 State/Fact 的检查器直删入口必须移除；不增加独立工具栏或检查器删除按钮。
4. `Delete/Backspace` 在已选择构造且焦点不在输入或菜单时先查询 Runtime，并按 `DELETE_TARGET -> CASCADE -> REMOVE_OCCURRENCE` 选择 enabled option 后直接提交；不得显示菜单。无选择阻止浏览器导航但不发起请求。阻断、token stale 与提交失败保留 committed projection 和 selection。
5. Control annotation 映射到基础 Fact，右键只显示“移除 Control”且点击即执行；键盘只在该 option enabled 时直接执行，不显示 Fact 删除模式。

## 5. 验收

- `LIFECYCLE-IMPL-01`：OpenAPI、生成器、TS/Java DTO 的删除模式、影响项、payload 与负例闭合。
- `LIFECYCLE-IMPL-02`：Runtime 从 occurrence 计算并返回 Object、Process、Feature、State、Fact 的 option、blocker、cascade 与规范 impact。
- `LIFECYCLE-IMPL-03`：token 绑定、stale/rejected/failed 的零 Revision、零部分删除与幂等边界通过。
- `LIFECYCLE-IMPL-04`：Fact 删除、Control 移除和 OPL/Trace/identity 边界通过。
- `LIFECYCLE-IMPL-05`：右键菜单直接执行、键盘无菜单直接执行、菜单取消和失败保留通过，X6 零直接删除。
- `LIFECYCLE-IMPL-06`：Service/MVC、Vue/X6、E2E、contract/typecheck/build 与 diff 检查完成。

## 6. 验证顺序

1. OpenAPI generator/validator 的正反例；
2. Runtime Service/MVC：每类目标、移除 occurrence、依赖阻断、cascade、token stale、错误 payload、幂等与 Control；
3. Vue Store/View/Canvas：右键菜单直接执行、键盘固定优先级直接执行、菜单取消、Control 与失败保留；
4. 真实浏览器：每种构造的删除、阻断/cascade、reload、OPL/Trace 一致性；
5. `npm run contract:validate`、前端单测、lint、typecheck、build、定向 Maven、Playwright 与 `git diff --check`。

## 7. 回滚

回退本规格 allowlist 内的实现文件并同时关闭删除入口；不得改写或删除已经提交的业务 Revision。
