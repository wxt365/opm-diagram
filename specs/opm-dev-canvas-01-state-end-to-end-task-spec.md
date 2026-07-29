# Spec: OPM DEV-CANVAS-01 State End-to-End

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 背景

`DEV-CANVAS-00` 已冻结 `CREATE_STATE`、`UPDATE_STATE`、候选 option 和删除 impact
token 的机器契约，但 Local Runtime 仍拒绝全部 State 命令，工作台仅显示不可用的
State 工具。语义 Revision 已有 State、owner、roles 和 State occurrence 基础结构，尚未
形成从命令到 OPD、OPL、Trace、检查器的闭环。

## 2. 目标

在 ISO 草案 Profile 的 Local Runtime 中交付一个可验证的 State 端到端最小闭环：

1. Object State 可创建、改名、改角色和删除；Process State 被稳定阻断；
2. State 只能由其 owner Object 持有，并在 owner content box 内投影为 State 符号；
3. `STATE_EXPLICIT`、`STATE_SUPPRESS`、`UNFOLD`、`FOLD` 形成 Context-scoped
   Revision，State 本体与 owner 不被这些命令改变；
4. P0 Consumption 可通过 State target 或 State qualification 表达 State-specified
   endpoint，OPL/Trace 必须定位 State；
5. P03 State 工具、候选表单、检查器、选择和错误反馈使用 Runtime API，不在前端手写
   State DTO 或伪造提交结果。

## 3. 实现决策

State 的 `explicitness/fold_state` 是 Context Projection 语义数据，而不是 State 本体
属性。实现新增按 `context_id + state_id` 定位的 State presentation 记录：

- `EXPLICIT/SUPPRESSED` 决定当前 Context 是否保留 State occurrence；
- `UNFOLDED/FOLDED` 决定当前 Context 的 State 展开投影；
- 四种状态动作均产生新 immutable Revision；
- 记录写入 revision document JSON 和机器 schema，不引入 SQLite 表或 V2 migration。

该选择对应设计文档中“对 Occurrence/Context Projection 产生 Revision、不创建或删除
State”的要求，并避免把 Context 局部视图状态错误提升为 owner 或 Element 属性。

## 4. 非目标

- 不启用 16 类 Procedural、8 类 Control 或 10 类 Structural 关系工具；
- 不实现跨 owner State 移动、Attribute/Feature State、State 顺序重排、撤销/重做；
- 不实现完整关系目录、fan、语义缩放、性能门槛或完整移动端降级；
- 不声明 ISO 19450:2024 符合性；
- 不修改 SQLite V1、公共路由、P01/P02 或无关页面。

## 5. 范围与修改边界

允许修改：

- `docs/contracts/openapi/**`、`docs/contracts/schemas/**`、契约校验与生成 DTO；
- `services/local-runtime/src/main/java/**/{api,application,semantic,text}/**` 及对应测试；
- `apps/web/src/modules/workbench/**`、`apps/web/src/shared/api/**`、
  `apps/web/src/shared/types/**`、`apps/web/src/stores/workbenchRuntime.ts`、局部样式与测试；
- 本任务规格、checklist 和必要的契约说明。

禁止修改：

- `docs/contracts/migrations/**`、SQLite V1、项目/模型路由和 P01/P02；
- `packages/**` 的代表性 Profile/Rule/Grammar/Symbol 资产；
- DEV-CANVAS-02~06 的关系生产工具、Catalog 或性能实现；
- `.harness/**`。

公共 API：允许扩展既有 `API-EDT-001/002` 的 State 专属 payload/schema，保留 P0
payload 与 operationId 兼容。数据库迁移：不允许。

## 6. 验收映射

| 需求 | 实现点 | 验证 |
| --- | --- | --- |
| Object-only State | Capability 查询、State 命令和语义校验 | Service/API 正反测试 |
| State Revision 闭环 | Create/Update/Delete/explicit/suppress/fold/unfold command handlers | Revision/重新打开 Projection 测试 |
| State Symbol | X6 State 子结点、INITIAL/DEFAULT/FINAL 描述符、owner 边界 | 组件测试与浏览器截图 |
| State-specified endpoint | Consumption 端点可引用 State 或合法 qualification | OPL/Trace unit 与 API 测试 |
| P03 交互 | Runtime option、候选输入、检查器和 aria-live 反馈 | Vitest 与 Local Runtime E2E |

## 7. 兼容性、回滚与风险

- API：`0.2.0-draft` 兼容扩展；P0 Object/Process/Consumption 请求维持可用。
- 数据：新增字段仅写入新 Revision document；历史 Revision 无记录时按
  `EXPLICIT + UNFOLDED` 读取。
- 配置：无新增运行配置或数据库 migration。
- 回滚：关闭 State 工具与 capability option；已有 State Revision 保持只读可投影，
  不删除已提交的 State 或 presentation 记录。
- 风险：代表性 Profile/Rule/Grammar 仍为草案，只能证明 Local Runtime 的有限
  State 行为，不能作为完整标准证据。

## 8. 验收与验证

1. 结构化 State command/presentation schema 通过 OpenAPI 与 JSON Schema 校验，生成
   TypeScript/Java DTO 无漂移；
2. 后端覆盖 owner、角色、删除 impact、过期 revision、显式/抑制/fold/unfold、OPL/Trace
   和重开投影；
3. 前端覆盖 State owner 未选、候选提交成功/阻断、检查器更新、State symbol 与 P0 不回归；
4. Local Runtime 主路径：Object -> State -> State Consumption -> OPL/Trace -> 重开
   Projection 通过；
5. 执行 contract validate、lint、typecheck、Vitest、build、Java 21 verify、Runtime
   E2E 和 `git diff --check`。
