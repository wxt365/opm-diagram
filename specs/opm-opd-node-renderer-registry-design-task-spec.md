# Spec: OPD 节点定义与渲染注册架构设计

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`feature`

## Active Playbooks

- `none (primary)`

## 0. 后继修正

本规格初始冻结的“Procedural/Control/Structural 各一个 production 文件”粒度已由 `specs/opm-opd-capability-definition-granularity-design-bugfix-task-spec.md` 取代。当前唯一口径是三族目录下 `16 Procedural Definition + 8 Control Decorator + 10 Structural Definition`，按 Capability ID 注册；本规格的节点、Registry、RenderSpec、X6 adapter、Editor 和增量调和边界继续有效。

## 1. 目标

冻结 P03 OPD 画布的前端节点代码组织和渲染扩展边界：每种内置节点使用独立定义文件，通过类型安全注册表生成纯 `NodeRenderSpec`，再由共享 X6 adapter 装配为 Cell。编辑器独立于节点定义，所有正式修改仍通过应用 Command 和 committed Revision 回流。

## 2. 非目标

- 本任务不重构 `OpdCanvas.vue`，不修改 Vue、TypeScript、测试或构建配置。
- 不改变 Object、Process、State、Attribute、Operation、Fact、Occurrence、Layout 或 Symbol Catalog 的语义。
- 不修改 OpenAPI、Runtime、SQLite、Profile/Rule/Grammar/Symbol 资产或依赖。
- 不开放第三方 JavaScript 插件、动态代码加载、Profile 脚本执行或远程扩展市场。
- 不把画布中的每个节点实例实现为独立文件、Vue 组件或持久化 X6 Cell。

## 3. 允许与禁止范围

允许新增或修改：

- `docs/design/opm-opd-node-renderer-architecture.md`
- `docs/design/opm-development-technology-baseline.md`
- `docs/design/opm-modeling-workbench-component-interaction.md`
- `docs/design/opm-complete-canvas-toolchain-design.md`
- `docs/design/opm-symbol-and-text-generation-implementation-contract.md`
- `docs/design/opm-frontend-handoff.md`
- `docs/design/opm-design-freeze-baseline.md`
- `docs/README.md`
- 本规格与对应 checklist

禁止修改上述清单外的全部路径，尤其 `apps/**`、`services/**`、`scripts/**`、`tests/**`、机器 Schema、OpenAPI、Profile 包、依赖、lockfile、release root 和 `runtime-data/`。

## 4. 冻结决策

1. 建立 `OpdNodeDefinition` 基础接口，不建立可实例化的 `BaseNode` Vue 类或多层继承树；`Node` 只表示画布图元，不改变 OPM 领域 Element/State/Feature 分类。
2. Object、Process、State、Attribute、Operation 各自拥有唯一 `*.definition.ts`；一个文件服务该类型的全部实例。
3. 共享几何和行为通过无状态 helper/composable 组合，不通过继承复写生命周期。
4. `NodeDefinitionRegistry` 在应用 bootstrap 时显式注册内置定义，重复、缺失或未知 kind 必须 fail closed。
5. 定义模块只把正式 Projection 映射为纯 `NodeRenderSpec`；共享 X6 adapter 是唯一把 RenderSpec 转换为 X6 Cell 的 owner。
6. Runtime `CommandCapabilityQuery/Option` 是编辑能力真值；前端定义不得硬编码 Profile 合法性或自行批准命令。
7. 节点编辑器使用独立 Vue 组件，只形成用户意图和候选值，不直接修改 Projection、Pinia 正式数据或 X6 Cell。
8. 关系渲染按 Procedural、Control、Structural 三族组织目录和共享 helper；production 实现按后继修正规格以 16/8/10 Capability 各自独立 Definition/Decorator 注册，具体符号继续来自版本化 Symbol Catalog。
9. 目标实现采用 occurrence 稳定键增量调和；选择、Finding、viewport 和单节点更新不得以 `graph.clearCells()` 作为正常更新路径。
10. Profile 包仍是声明式数据，不得携带或触发任意前端代码；本注册表不是第三方插件 API。

## 5. 兼容与迁移

- 当前集中式 `OpdCanvas.vue` 保持现状，直到后继独立实现规格完成迁移和回归。
- 后继实现必须先增加契约、注册表及测试，再逐类迁移节点和关系，最后切换增量调和并删除旧分支。
- 迁移期间同一 kind 只能有一个活动 renderer，禁止新旧路径双重渲染或按运行环境静默 fallback。
- DOM capture anchor、稳定 `data-testid`、名称编辑行为、命令 payload、Revision 回流和现有视觉语义保持兼容。
- API、Schema、config、data 和 release 格式均不受本设计任务影响。

## 6. 验收项

- `OPD-REG-01`：独立设计文档冻结分层、目录、接口、注册和禁止边界。
- `OPD-REG-02`：五种内置节点均映射到唯一独立定义文件；关系按三族组织并由后继修正规格细化为 16/8/10 独立 Definition/Decorator。
- `OPD-REG-03`：Node Definition、RenderSpec、X6 adapter、编辑器和 Command owner 之间不存在职责重叠。
- `OPD-REG-04`：实例修改、类型定义修改、共享核心修改和 Symbol Catalog 修改的影响范围明确。
- `OPD-REG-05`：注册完整性、跨类型隔离、稳定 anchor、编辑行为、visual/E2E 和性能验收完整。
- `OPD-REG-06`：后继迁移顺序、双实现禁止、回滚和实现证据边界明确。
- `OPD-REG-07`：技术基线、组件交互、完整画布、符号契约、handoff、索引和全局冻结基线同步引用唯一设计。
- `OPD-REG-08`：Markdown 相对链接、关键术语和 `git diff --check` 验证通过。

## 7. 验证

本任务只验证文档链接、术语、冻结边界和 Git diff，不运行前端测试、构建、浏览器 E2E 或性能测试。未执行的代码验证不得写为通过。

## 8. 回滚

回退本规格列出的设计、索引和 checklist 修改。由于没有产品代码、数据或 Schema 变更，不需要运行时或数据回滚。
