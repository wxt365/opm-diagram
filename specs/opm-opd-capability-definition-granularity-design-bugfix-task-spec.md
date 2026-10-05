# Spec: OPD Capability 级关系 Definition 粒度设计修正

## Work Mode

`change`

## Risk Level

`L2`

## Task Type

`bugfix`

## Active Playbooks

- `none (primary)`

## 1. 问题与目标

`opm-opd-node-renderer-architecture.md v1.0` 已冻结节点按类型独立 Definition，但关系仍只设置 Procedural、Control、Structural 三个实现文件。该粒度会把 16/8/10 共 34 个 Capability 的不同端点、属性、分段、fan、marker、label、Control 注记和 Editor 适配重新集中到三个大型条件分支中，不能满足修改隔离目标。

本任务将关系实现修正为：

- 16 个 Procedural Capability 各一个 Definition 文件；
- 8 个 Control Capability 各一个 Decorator 文件；
- 10 个 Structural Capability 各一个 Definition 文件；
- 重复算法由族级无状态 helper 组合；
- 注册表按 `capability_id` 精确查找，不按 family 选择大型 renderer。

## 2. 非目标

- 不修改产品 Vue/TypeScript、测试、Runtime、OpenAPI、SQLite、Profile/Rule/Grammar/Symbol 资产、依赖或构建配置。
- 不改变 16/8/10 Capability 的语义、ID、端点、属性、Symbol、OPL、Trace 或生产启用状态。
- 不把 Control 变成独立 Fact、Occurrence、Relation Group 或第二条 X6 关系。
- 不把 Profile 合法性、Candidate 过滤或 Modifier 组合规则复制到前端 Definition。
- 不要求没有行为差异的 Definition 重复实现公共算法。

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
- `specs/opm-opd-node-renderer-registry-design-task-spec.md`
- `docs/checklists/opm-opd-node-renderer-registry-design-checklist.md`
- 本规格与对应 checklist

禁止修改上述清单外全部路径，尤其 `apps/**`、`services/**`、`scripts/**`、`tests/**`、contracts、release root、lockfile 和 `runtime-data/`。

## 4. 冻结修正

1. 基础关系注册表只注册 16 Procedural 与 10 Structural Definition，共 26 项，以基础 Fact `capability_id` 为唯一键。
2. Control decorator 注册表单独注册 8 项，以 `control.capability` 为唯一键；它接收已生成的基础 Procedural RenderSpec 并返回保持同一 identity 的装饰结果。
3. 每个 Capability 有一个显式文件和一个唯一注册导出；即使实现只调用共享 factory，也不得与另一 Capability 合并到一个条件分支文件。
4. family 只用于目录分组、共享 helper 和回归选择，不作为 production renderer 的最终查找键。
5. Symbol、marker、label slot、route 和属性值仍读取已验证 Projection/Symbol Descriptor/Runtime Option；Definition 只拥有 Capability 到表现策略的适配责任。
6. 未注册 Capability、重复 Capability、Control decorator 与基础 Fact identity 不一致必须 fail closed。
7. 当前三个 family 文件目标由本规格取代；它们不得作为与 Capability 文件并存的第二条 production 路径。

## 5. 兼容与迁移

- 节点五文件、Node Registry、RenderSpec、X6 adapter、Editor 和增量调和设计保持不变。
- 现有三族目录仍保留，但只承载子目录、helper、factory 和聚合注册入口，不承载 34 项业务 `switch`。
- 后继实现先建立 34 项 contract fixture 和 registry，再逐族替换当前集中式关系渲染；同一 Capability 不得同时由 family renderer 和 Capability Definition 接管。
- DOM/capture anchor、relation/occurrence identity、Control Modifier、现有视觉、E2E、OPL/Trace 和 Revision 回流保持兼容。

## 6. 验收项

- `OPD-CAP-DEF-01`：16 个 Procedural Capability 与 16 个唯一 Definition 文件逐项映射。
- `OPD-CAP-DEF-02`：8 个 Control Capability 与 8 个唯一 Decorator 文件逐项映射，并保持基础 Fact identity。
- `OPD-CAP-DEF-03`：10 个 Structural Capability 与 10 个唯一 Definition 文件逐项映射。
- `OPD-CAP-DEF-04`：关系接口、基础注册表、Control decorator 注册表和 RenderSpec 组合契约封闭。
- `OPD-CAP-DEF-05`：族级 helper 与 Capability Definition 的责任、禁止复制和影响范围明确。
- `OPD-CAP-DEF-06`：旧三 family production renderer 目标被明确取代，不存在双实现或 fallback。
- `OPD-CAP-DEF-07`：技术基线、组件交互、完整画布、符号契约、handoff、索引和全局基线同步。
- `OPD-CAP-DEF-08`：34 项 ID/文件唯一覆盖、Markdown 链接、术语冲突和 `git diff --check` 验证通过。

## 7. 验证与回滚

本任务只运行文档链接、34 项映射、术语和 Git diff 检查，不运行代码测试、构建、visual/E2E 或性能测试。回滚仅回退本规格允许的文档，不涉及数据和运行时回滚。
