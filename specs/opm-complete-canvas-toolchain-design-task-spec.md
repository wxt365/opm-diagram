# Spec: OPM 完整画布工具链设计补齐

## Task Type

`feature`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景

当前产品需求和 Profile Capability Matrix 已覆盖 Object State、Procedural Link、Control Link 和 Structural Link，但 P0 前端任务只实现 Object、Process 与 Consumption。现有符号契约仅冻结首批符号，完整 ISO Symbol Catalog、关系候选交互、图标工具链和逐关系验收输入尚未收口，导致“完整 OPM 工具”目标与“最小 P0 演示”之间存在设计断层。

## 2. 目标

1. 冻结 State 的展示、创建、编辑、修饰、所有权、选择和删除交互。
2. 把 ISO 配置档 16 类 Procedural Link、8 类 Control Link 组合和 10 类 Structural Link 映射到可实现的工具分组、候选过滤、符号描述符、命令 payload、OPL 模板族和验收用例。
3. 冻结图标化画布工具链的组件树、字段、状态、交互、键盘和响应式口径。
4. 将完整画布能力拆成有依赖顺序、完成定义和回滚口径的后续开发包。
5. 同步 symbol/text contract、frontend handoff、development execution pack 和文档索引，使后续开发不再以 P0 最小演示冒充完整 OPM 能力。

## 3. 非目标

- 不修改 `apps/**`、`services/**`、`tests/**` 或原型，不实现任何代码。
- 不修改 OpenAPI、JSON Schema、SQLite schema、Profile 包或 Rule 包。
- 不拆解全部 511 个原子 `shall/shall not`，不补完整 Annex A Grammar。
- 不宣称产品已经符合 ISO 19450:2024，也不把设计存在解释为运行证据。
- 不设计中文草案配置档的全部专属结点和关系符号；本轮只保留扩展入口和隔离规则。

## 4. 修改边界

### 4.1 允许修改

- `specs/opm-complete-canvas-toolchain-design-task-spec.md`
- `docs/checklists/opm-complete-canvas-toolchain-design-checklist.md`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-development-execution-pack.md`
- `docs/README.md`

### 4.2 禁止修改

- `.harness/**`
- `apps/**`、`services/**`、`tests/**`、`prototype/**`
- `docs/contracts/**`、`reference/**`
- 既有需求编号、Capability ID、API operationId 和 schema 字段定义

### 4.3 变更类型

- schema：禁止
- 公共 API：禁止；只允许引用 `API-EDT-001/002` 并定义后续 payload 设计输入
- 配置：禁止
- 文档：允许
- 测试代码：禁止；只补设计验收矩阵和可执行验证口径

## 5. 设计输入基线

1. 产品与能力：`opm-online-modeling-tool-requirements.md`、`opm-profile-capability-matrix.md`、`iso-19450-2024-conformance-matrix.md`。
2. 元模型与应用命令：`opm-core-metamodel-field-schema.md`、`opm-modeling-tool-application-api-contract.md`。
3. 页面与交互：四份 `opm-modeling-workbench-*` 文档及已验收原型。
4. 符号与文本：`opm-symbol-and-text-generation-implementation-contract.md`。
5. 开发准备：`opm-frontend-handoff.md`、`opm-development-execution-pack.md`、`opm-test-strategy.md`。

## 6. 核心设计约束

1. State 是 Object/Attribute 的从属语义，不作为独立 Thing；ISO 配置档禁止 Process State。
2. 关系候选由 Profile Capability、端点类型、Context、State 和已有 Fact 动态过滤，前端不得硬编码领域合法性。
3. 用户拖线方向不等于规范 source/target；Candidate Builder 必须完成端点归一化，歧义时显示候选菜单。
4. 常用工具使用图标和 tooltip；关系类型使用标准符号预览、名称和快捷说明，不能只靠颜色。
5. Symbol Catalog、Grammar、Rule 与 Revision 显式版本绑定；缺任一模板、规则或证据时不得启用生产工具。
6. 所有语义提交通过 `API-EDT-002` 形成新 Revision；viewport、选择和菜单状态不得进入语义命令。

## 7. 验收标准与验证

1. 专题设计覆盖工具栏组件树、工具分组、图标、字段、状态、主路径、异常路径、键盘和移动降级。
2. State 覆盖 owned State、Initial/Default/Final、显式/抑制、展开/折叠、state-specified 端点和 OPL 追踪。
3. 16 类 Procedural、8 类 Control 和 10 类 Structural 能力均有唯一 Capability 映射、工具入口、端点规则、符号引用和验收层级。
4. Symbol contract 为全部关系族给出 line/marker/label slot/route/template family，且不伪造未冻结的标准像素值。
5. Frontend handoff 明确前端组件边界、状态切片、API-EDT-001/002 输入输出和稳定 `data-testid`。
6. Execution pack 将完整画布拆成可独立验收的开发包，写明依赖、非目标、DoD、自动化层级和回滚。
7. `docs/README.md` 的状态、入口和阅读顺序与新增设计一致。
8. 执行 Markdown 相对链接检查、术语/Capability 覆盖检查和 `git diff --check`；文档任务无需运行代码测试。

## 8. 兼容性与回滚

- API：本轮无变更；后续发现现有 `API-EDT-001/002` 无法表达冻结 payload 时，必须另立 API 任务。
- 数据：本轮无变更；不推断现有 schema 已支持全部关系运行行为。
- 前端：当前 P0 页面行为不变；后续按开发包渐进启用工具，不允许一次性打开无规则证据的完整菜单。
- 回滚：回退本任务修改的文档；不涉及数据或运行时回滚。

## 9. 事实与假设

### 9.1 事实

1. Capability Matrix 已列出 ISO 配置档所需的 State、16 类 Procedural、8 类 Control 和 10 类 Structural 能力。
2. 当前 Vue 类型和工具栏只承载 Object、Process 与 Consumption。
3. 现有文档明确声明完整 Symbol Catalog 和视觉证据尚未形成。

### 9.2 假设/待后续验证

1. 现有通用 Fact/Endpoint schema 能承载全部冻结关系 payload，仍需后续 schema 契约测试证明。
2. X6 能满足完整 marker、fan、state containment 和大图性能，仍需组件、视觉和性能测试证明。
