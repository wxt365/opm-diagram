# Spec: OPM DEV-CANVAS-02 Procedural Links

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 背景

`DEV-CANVAS-01` 已完成 Object State 的命令、Projection、OPL/Trace 和 P03 闭环。
`DEV-CANVAS-02` 必须交付 ISO 草案 Profile 的 16 类 Procedural Link，不能把目前唯一
已存在的 Consumption 误称为完整过程关系工具链。

当前 `packages/profiles/profile.iso19450.2024.draft/0.1.0/profile.json`、代表性 Rule 和
Grammar 只声明 Consumption；这与设计冻结的 16 个 Capability 不一致。本包负责补齐可执行
资产与 Runtime/P03 闭环，但不宣称 ISO 19450:2024 符合性。

## 2. 目标

1. 为 `CAP-ISO-PROC-001~016` 建立版本化 Profile、Rule、Grammar、Symbol descriptor 输入；
2. Runtime 按固定 `base_revision` 和端点选择返回结构化候选，服务器规范化端点顺序；
3. `CREATE_FACT`/`UPDATE_FACT` 支持 16 类 Procedural Fact，拒绝错误端点、错误 State owner、
   缺少 duration、错误 self ID 和过期 option；
4. Projection、X6 和 OPL/Trace 为每类能力提供对应符号、Marker/注记和确定性文本；
5. P03 关系目录仅展示 Runtime 已启用候选，存在多个候选时必须显式选择，不自动提交；
6. 逐项覆盖 descriptor、正反端点、command、Rule、Projection、组件测试及 E2E。

## 3. 范围

涵盖以下冻结关系：Consumption、Result、Effect、Agent、Instrument、State-specified
Consumption/Result/三种 Effect/Agent/Instrument、Invocation、Self-invocation、Overtime
Exception、Undertime Exception。

Effect 必须保留输入/输出 State 的规范端点；Invocation 与 Self-invocation 均为 Process
关系，后者只允许同一稳定 ID；两种 Exception 必须包含受控 duration。关系图形遵循
`opm-symbol-and-text-generation-implementation-contract.md` 的 marker、lightning、duration
annotation 和 route family，不由前端根据名称猜测。

## 4. 非目标

- 不实现 8 类 Control Link、10 类 Structural Link、fan 或完整关系搜索；
- 不实现跨 Context 关系、语义缩放、撤销重做或性能门槛；
- 不修改 SQLite schema、P01/P02 路由或公共 operationId；
- 不做 ISO 19450:2024 合规性声明。

## 5. 修改边界

允许修改：

- `packages/**` 的 ISO 草案 Profile/Rule/Grammar/Symbol 资产；
- `docs/contracts/openapi/**`、schema、生成 DTO 和契约验证；
- `services/local-runtime/**` 的 asset、semantic、application、text 与测试；
- `apps/web/src/modules/workbench/**`、Runtime API/store、共享类型/样式与测试；
- 本规格、checklist、E2E 与必要运行脚本。

禁止修改：

- SQLite migration、项目/模型路由、P01/P02；
- DEV-CANVAS-03~06 的 Control/Structural/fan 功能；
- `.harness/**`。

公共 API 允许在既有 `API-EDT-001/002` 内扩展 Procedural capability option 和 Fact payload，
必须保留 P0 Consumption 兼容。数据库 migration 不允许。

## 6. 验收映射

| 需求 | 证据 |
| --- | --- |
| 16 个 Capability 输入闭合 | Profile/Rule/Grammar/Symbol 资产与 digest 校验 |
| 端点规范化与阻断 | API/Service 正反测试，含反向拖线、State owner、duration/self ID |
| 命令与 Revision | 提交、过期 option、重开 Projection 测试 |
| 图文一致 | X6 descriptor 组件测试、每类 OPL/Trace golden |
| P03 候选交互 | Vitest：目录、多个 option 显式选择、反馈保留 |
| 主路径 | Local Runtime Playwright：至少覆盖 Result、Effect State、Invocation、Exception |

## 7. 回滚与风险

- 回滚：关闭新增 capability option 和 P03 条目；已提交 Fact 保持只读投影，导出/文本缺资产时
  稳定阻断；
- 风险：16 类 assets 是草案代表性实现，完整 Clause/Annex 覆盖仍属于 DEV-CANVAS-05；
- 风险：不得以仅有的 Consumption Rule/Grammar 作为其余 15 类的替身。
