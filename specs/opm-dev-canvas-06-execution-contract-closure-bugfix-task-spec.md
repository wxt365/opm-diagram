# Spec: DEV-CANVAS-06 执行契约缺口修正

文档状态：`FROZEN`

冻结日期：`2026-08-03`

当前适用性：`HISTORICAL_RECORD`。本文记录当时冻结的 Recovery Execution `v1.0`输入；当前 runner 实现唯一消费输入已由`specs/opm-dev-canvas-06-recovery-template-input-closure-bugfix-task-spec.md`升级为Recovery Execution `v1.1`及两份只读`0.1.0` template。本文第4节的`v1.0`记录不得作为当前实现版本指针。

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

DEV-CANVAS-06 已冻结 Visual/E2E、Golden Fixture Materializer 和 Recovery/Rollback 的高层机器契约，但实现人员仍需自行决定三类关键行为：

1. E2E Manifest `0.1` 只有简写命令和 Schema 字段，没有独立 builder 的完整 CLI、controlled bundle 内 Catalog/fixture 物理布局、逐字段输入 ref 映射和失败零输出事务；
2. Materializer cleanup 同时要求“先通过完整 verifier”与“先移动 residual 并写 marker”，而完整 verifier 会把尚未移动的 residual 判为非法，形成不可执行的循环依赖；
3. Recovery 只有 28-case 高层矩阵和 Schema，未冻结 factory 模块 API、两份不可变模板的 raw ref、SQLite fault port、强停 launcher、子进程到达证明和 artifact 采集格式。

最小复现为：开发人员只读取当前活动设计与 Schema，仍无法唯一写出 E2E builder、cleanup orchestrator 或 Recovery runner，而不新增自己的目录、参数、过渡状态或证据格式。

## 2. 目标

1. 为 E2E Manifest `0.1` 建立唯一独立 builder 实现规格和 checklist；
2. 为 cleanup 增加只读、窄化、不可持久化的 `pending-quarantine` 预验证契约，并冻结唯一四阶段调用顺序；
3. 为 Recovery 建立独立 execution 设计、runner 实现规格和 checklist；
4. 同步 DEV-CANVAS-06 正式入口、测试策略、开发执行包、文档索引和全局冻结基线；
5. 保持设计冻结、Schema/实现状态、真实执行证据、Gate、Activation、Capability 和 ISO 结论互不推导。

## 3. 修改边界

### 3.1 允许修改

- 本规格及对应 checklist；
- E2E Manifest `0.1` builder 实现规格/checklist；
- Golden Fixture Materializer 设计、实现规格/checklist和受控 case catalog；
- Recovery execution 设计、runner 实现规格/checklist；
- DEV-CANVAS-06 release checklist、测试策略、开发执行包、文档索引和冻结基线中的必要入口与口径。
- 历史规格、checklist 与实现验收报告中指向“当前冻结基线”的版本指针；只允许同步指针和适用性说明，不刷新历史执行结论。

### 3.2 禁止修改

- `apps/**`、`services/**`、`scripts/**`、`tests/**`、`packages/**`、`package.json`；
- `docs/contracts/**`、OpenAPI、SQLite DDL/migration、Profile、Rule、Grammar、Symbol 和 Handoff；
- 任一 fixture/template、Manifest、Report、Candidate、Activation、golden、artifact 或 production gate；
- `.harness/**` 和用户/开发人员并行实现。

本轮不修改 schema、公共 API、配置和依赖，不执行发布命令，不启动或强停进程。

## 4. Spec Mapping

| 输入缺口 | 设计承接 | 验收 |
| --- | --- | --- |
| E2E CLI、controlled 布局、ref 映射、零输出事务 | E2E Manifest `0.1` builder 实现规格 | 参数表、两类目录树、逐字段映射、事务状态机无开放项 |
| cleanup verifier 循环依赖 | Materializer `v1.5` + Verifier Catalog `v1.1` | pending attestation 与四阶段顺序、正反例、失败边界唯一 |
| Recovery factory/template/fault/launcher/artifact | Recovery Execution 设计 `v1.0` + runner 实现规格 | 模块 API、raw ref、reachpoint protocol、artifact index 与 28/56 矩阵闭合 |
| 跨文档入口与版本 | DEV-CANVAS-06、测试策略、执行包、README、冻结基线 | 活动 owner、版本和状态唯一；冲突计数保持 `0` |

## 5. Root Cause

既有设计先冻结了 Schema 形状、case 数量和 Gate 聚合，再分批补 Golden Authoring、controlled bundle 和 Recovery Schema。三个后续实现边界没有回填为同等粒度的执行契约，导致高层状态正确但 builder/orchestrator/runner 仍存在实现者自由裁量。

## 6. Fix Strategy

1. 不修改已实现 Schema，新增实现规格解释既有字段如何由受控输入唯一派生；
2. 不让完整 verifier 接受非法过渡 root，新增只返回内存 attestation 的窄化预验证入口；
3. 不把 fault fixture 放入产品 API，Recovery 通过 test-only composition、独立子进程和 immutable template clone 执行；
4. 将目录、raw ref、调用序列、failure code、退出码和零输出边界同时冻结，避免实现阶段再次设计；
5. 使用独立 checklist 承接未来代码和真实 release evidence，文档完成不提升 Gate 状态。

## 7. 验收标准

1. E2E builder 的必填/禁止参数、两种输入模式、输出 root、Catalog/fixture 布局、所有 Manifest ref 来源和原子提交步骤均唯一；
2. cleanup 只能按“pending 预验证 -> 原子移动 residual -> 原子写 marker -> 完整 verifier”执行，任何中间失败均有稳定退出与不可消费边界；
3. Verifier Catalog 新版包含 pending-quarantine 受控正反例，旧 57 case 不删除、不改号；
4. Recovery factory、两份 template、七个 SQLite hook、四个强停 reachpoint、launcher 握手、snapshot/artifact index 和零生产暴露规则全部冻结；
5. Recovery runner 仍固定 `2` fixture、`28` case、`56` attempt、16 个稳定失败码；
6. 所有活动文档引用相同版本和 owner，不出现第二个 E2E builder、cleanup 顺序或 Recovery artifact 格式；
7. Markdown 链接、代码围栏、计数、版本术语及限定文件 `git diff --check` 通过。

## 8. 验证方式

1. 搜索 E2E Manifest `0.1` builder 命令、owner 和版本，确认只有一个活动实现入口；
2. 核对 E2E Schema 顶层字段、五个 `upstream_input_refs`、194 case、388 attempt 与逐字段映射；
3. 核对 Materializer cleanup、marker、full verifier 与 catalog case 总数；
4. 核对 Recovery Schema 的 `2/28/56`、七项 snapshot、16 failure code 与 execution 设计；
5. 检查 Markdown 相对链接、代码围栏和限定文件 `git diff --check`。

本轮是纯文档任务，不执行 Schema、Node、Java、浏览器、fault injection、强停、E2E 或 release 测试。

## 9. 兼容、回滚与风险

- E2E Manifest 保持 `0.1/0.1.0`，不新增 Schema 字段；
- Materialization Report 与 Quarantine Marker 均保持 `0.1`，pending attestation 不落盘、不新增 Schema；
- Recovery 三份 Schema 保持 `0.1`，execution 设计只冻结未来实现；
- 回滚只回退本轮文档增量；回滚后上述三个实现缺口重新成为 `BLOCKED_BY_DESIGN`，不得保留 `READY_FOR_DEVELOPMENT` 声明；
- 并行代码可能已实现部分旧口径，后续实现任务必须按新设计做差异审计，不能从文档冻结推断代码已符合。

## 10. 事实与假设

### 10.1 事实

1. E2E Manifest/Report、controlled bundle、Materialization Report/Marker 和 Recovery 三份 Schema 已存在；
2. controlled bundle verifier、Materializer 和 Recovery Schema 有部分实现证据，但本任务不重验实现；
3. 真实 E2E/Recovery READY Report、Candidate、Activation 和 production Capability enablement 尚未由本任务生成；
4. 本任务不构成 ISO 19450:2024 符合性证明。

### 10.2 假设

无。
