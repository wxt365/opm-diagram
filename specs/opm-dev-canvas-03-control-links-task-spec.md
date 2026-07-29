# Spec: OPM DEV-CANVAS-03 Control Links

## Task Type

`feature`

## Active Playbooks

- `backend-springboot (primary)`
- `frontend-vue`
- `testing`

## 1. 背景

`DEV-CANVAS-02` 已交付 16 类 Procedural Fact。Control Link 不是独立 Fact 或重叠 edge，
而是同一个基础 Procedural Fact 上的受控 Modifier 对。设计已冻结
`control.capability=<CAP-ISO-CTRL-001~008>` 和 `control.segment=PROCESS_INPUT` 的机器表示。

## 2. 目标

1. 为 8 类 Control Capability 建立版本化 Profile、Rule、Grammar、Symbol 资产；
2. `API-EDT-001` 返回针对既有基础 Fact 的 Control candidate，携带基础 capability 与精确 Modifier 对；
3. `UPDATE_FACT` 原子写入、替换或移除 Control Modifier 对，并拒绝不匹配、重复或非法组合；
4. Revision JSON、Projection、X6、OPL/Trace 均以基础 Fact ID 为身份显示 `e/c`；
5. P03 仅对可修饰的已选 Procedural Fact 展示并提交 Runtime 返回的 Control candidate；
6. 覆盖 8 类 capability 的正反例、重开与浏览器主路径。

Concrete OPL/Trace 的机器实现统一进入 `DEV-CANVAS-05`；本包只确保基础 Fact、Modifier pair、template family 和 Projection 身份可被后续文本任务无损消费。

## 3. 范围

- Event/Condition，Transforming/Enabling，State/non-State 共 8 类 Control Capability；
- Control 仅作用于合法基础关系的 Process 输入段；Effect 输出段必须拒绝；
- API Option 扩展 `base_fact_capability_ref`；
- 不变更 SQLite schema，不新增独立 CONTROL Fact、Control edge 或 `condition` 复写。

## 4. 非目标

- Structural Link、fan、跨 Context、语义缩放与 Control 的独立谓词编辑；
- P01/P02、SQLite migration、公共 operationId 的破坏性变更；
- ISO 19450:2024 符合性声明。
- concrete OPL/Token/Trace 和 golden manifest 的实现；其输入已在符号与文本契约冻结，由 `DEV-CANVAS-05` 承接。

## 5. 修改边界

允许修改：

- `packages/**` 的 Control Profile/Rule/Grammar/Symbol 资产；
- `docs/contracts/openapi/**`、schema、生成 DTO、契约验证；
- `services/local-runtime/**` 的 semantic、application、text 与测试；
- `apps/web/src/modules/workbench/**`、Runtime API/store、共享类型/样式与测试；
- 本规格、checklist、E2E 与必要运行脚本。

禁止修改：

- SQLite migration、P01/P02、Structural/fan；
- `.harness/**`。

## 6. 验收映射

| 需求 | 证据 |
| --- | --- |
| 8 项 Control 输入闭合 | Profile/Rule/Grammar/Symbol assets 与 digest 校验 |
| Option 及端点限制 | API/Service 正反测试，含 base mismatch、Effect 输出、重复或缺失 pair |
| 原子 Revision | `UPDATE_FACT`、Revision JSON roundtrip、重开 Projection 测试 |
| 图文一致 | X6 `e/c` 注记、OPL/Trace golden |
| P03 交互 | Vitest：已选基础 Fact、候选目录、提交反馈 |
| 主路径 | Local Runtime Playwright：Event 与 Condition、Transforming/Enabling、State/non-State |

## 7. 回滚与风险

- 回滚：关闭 Control candidate 与编辑入口；已有 Control Modifier 保持只读投影；
- 风险：Control 候选必须由服务器按基础 Fact 返回，前端不得自行推断能力或输入段。
