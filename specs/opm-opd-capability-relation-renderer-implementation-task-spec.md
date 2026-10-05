# Spec: OPD Capability 级关系渲染实现

## Work Mode

`change`

## Risk Level

`L3`

## Task Type

`refactor`

## Active Playbooks

- `none (primary)`

## 1. 目标

按 `docs/design/opm-opd-node-renderer-architecture.md v1.1` 将 OPD 已提交关系渲染迁移为 Capability 级 Definition/Decorator：16 个 Procedural Definition、10 个 Structural Definition 与 8 个 Control Decorator，经显式 Registry 和纯 RenderSpec 接入共享 X6 relation adapter。

## 2. 非目标

- 不迁移五类节点 Definition、独立 Vue Editor 或完整 Graph 生命周期 adapter。
- 不修改 Runtime、OpenAPI、Schema、Profile/Rule/Grammar/Symbol 资产、依赖、路由、数据库或 `runtime-data/`。
- 不改变 OPL、Trace、Fact、Occurrence、Relation Group、capture anchor、DOM test id 或命令 payload。

## 3. 允许范围

- `apps/web/src/modules/workbench/opd/**`
- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `specs/opm-opd-capability-relation-renderer-implementation-task-spec.md`
- `docs/checklists/opm-opd-capability-relation-renderer-implementation-checklist.md`

禁止修改上述范围外的所有文件。

## 4. 契约

1. 基础关系以 `relation.capabilityId` 为唯一查找键；未知、重复、缺失或非法 RenderSpec 必须用冻结诊断码 fail closed，不得回退 family/symbol renderer。
2. 每个 16/10 Capability 只由一个 Definition 文件导出；8 个 Control Capability 只由一个 Decorator 文件导出。
3. Control 仅在已有基础 Procedural RenderSpec 的 `PROCESS_INPUT` segment 添加 `e/c` 注记；不得新增或改写 Fact、Occurrence、Relation Group、primary Cell 或 capture anchor。
4. RenderSpec 纯粹、确定性且不含 Graph、DOM、Store、HTTP 或函数；X6 adapter 是唯一创建关系 X6 Cell 的 owner。
5. 迁移后 `OpdCanvas.vue` 不得保留基础关系的按 family、symbol 或 Capability 的生产分派逻辑。

## 5. 验收

1. Registry 恰好注册 16 Procedural、10 Structural、8 Control 实现，并覆盖冻结 Capability ID 集合。
2. 关系 RenderSpec 对现有 fixture 保持 edge、fan、marker、route、annotation、label、capture anchor 输出。
3. Control 前后基础 identity 不变，且不存在第二个 committed capture anchor。
4. unknown/duplicate/missing Capability 与非法 Control 输入按冻结诊断码拒绝。
5. 前端单测、lint、typecheck、build、定向 16/8/10 E2E 与 `git diff --check` 通过。

## 6. 回滚

回退本规格允许范围内的前端 relation renderer 文件与测试；不回退已经提交的业务 Revision，因为本任务不改变数据格式或语义。
