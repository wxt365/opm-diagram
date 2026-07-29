# Spec: OPM DEV-CANVAS-04 Structural Links

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`
- `design-module-docs`

## 1. 背景

`DEV-CANVAS-00~03` 已建立 State、Procedural Fact 与 Control Modifier 的候选、命令和投影链路。
本包实现设计已冻结的 10 类 Structural Capability。Structural Fact 不是 Object-Process
关系；Fundamental fan 仍是单一 Fact，成员变化不得改变稳定 Fact ID。

## 2. 目标

1. 为 `CAP-ISO-STRUCT-001~010` 建立 Profile、Rule、Grammar、Symbol 绑定和 digest 校验；
2. `API-EDT-001` 按规范端点返回 Structural candidate，并携带标签槽位、marker、route 和模板引用；
3. `CREATE_FACT/UPDATE_FACT` 原子保存 Structural Fact、双向标签及 fan 成员，拒绝非法端点与不完整 payload；
4. Revision Projection 和 X6 显示 Structural marker、标签与 Fundamental fan；
5. P03 使用 Runtime 返回的候选创建或更新 Structural Link，不从前端推断端点、标签或完整性规则；
6. 为 Exhibition 与 State-specified Characterization 提供最小 Attribute/Operation 与 Feature Value State 创建、投影和候选链路；
7. 覆盖 10 类 capability、fan 成员稳定身份、完整性规则和浏览器主路径。

## 3. 范围

- 单向标记、单向空标签、双向标记、互惠标记；
- Aggregation、Exhibition、Generalization、Classification；
- State-specified Characterization 与 State-specified Tagged；
- Fundamental fan 的 refinee 增删、稳定 Fact ID，以及 Aggregation/Exhibition/Generalization 的完整性标记；
- Structural 默认阻断 Object-Process；Exhibition 的 Attribute/Operation 例外只按 Profile Endpoint Schema 开放。
- State-specified Characterization 固定为 Specialized Object -> 其继承 Attribute 的 Value State；State-specified Tagged 只接受 Object/owned Object State，不接受 Process。
- Feature 仅覆盖 `ATTRIBUTE/OPERATION` 创建和归属 Feature 的 Value State；不实现 Feature 更新、删除、值域编辑或 Feature OPL/Trace。

## 4. 非目标

- 具体 Structural OPL、token range、Trace 和 golden 的机器实现；句式、句数、fan/list/completeness 输入已冻结，由 `DEV-CANVAS-05` 实现；
- Procedural、Control、P01/P02、跨 Context、语义缩放；
- SQLite migration、公共 operationId 的破坏性变更、ISO 19450:2024 符合性声明。

## 5. 修改边界

允许修改：

- `packages/**` 的 Structural Profile/Rule/Grammar/Symbol 资产；
- `docs/contracts/openapi/**`、schema、生成 DTO、契约验证；
- `docs/design/opm-complete-canvas-toolchain-design.md`、`opm-core-metamodel-field-schema.md`、`opm-modeling-tool-application-api-contract.md` 的 Feature 最小契约；
- `services/local-runtime/**` 的 semantic、application、text、projection 与测试；
- `apps/web/src/modules/workbench/**`、Runtime API/store、共享类型/样式与测试；
- 本规格、checklist、E2E 与必要运行脚本。

禁止修改：

- SQLite migration、P01/P02、Procedural/Control 行为；
- `.harness/**`。

## 6. 验收映射

| 需求 | 证据 |
| --- | --- |
| 10 项 Structural 输入闭合 | Profile/Rule/Grammar/Symbol assets 与 digest 校验 |
| 端点和标签限制 | API/Service 正反测试，含默认 Object-Process 拒绝和 Exhibition 例外 |
| fan 身份与完整性 | `CREATE_FACT/UPDATE_FACT`、Revision JSON roundtrip、成员增删与重开 Projection 测试 |
| 图形一致 | X6 marker、双向/互惠标签与完整性标记组件测试 |
| P03 交互 | Vitest：候选目录、必填标签、fan 成员和提交反馈 |
| 主路径 | Local Runtime Playwright：代表性 tagged、fan、完整性与刷新重开 |

## 7. 回滚与风险

- 回滚：关闭 Structural candidate 与编辑入口；已存在 Structural Fact/fan 保持只读投影和稳定身份；
- 风险：端点、标签槽位、完整性和 fan 成员均由 Runtime 返回/校验，前端不得按图形方向或菜单名称猜测；
- 风险：本包只保存并传播 `opl.structural.*` 模板引用，不生成 concrete 文本；`DEV-CANVAS-05` 必须按已冻结输入实现，不得从模板 ID 猜测句式。
