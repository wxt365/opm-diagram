# Spec: DEV-CANVAS-06 Materialization Verifier 受控正反例闭包

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 问题与最小复现

Materializer 设计 `v1.2` 已要求唯一只读 semantic verifier 检查 Report、SQLite、quarantine 和整个 materialization root，但当前只冻结了检查范围与 `0/2/3/4` 退出码，没有冻结受控输入 factory、稳定 verifier 错误码、首错优先级和逐项正反例。

以下输入能够稳定复现设计缺口：

1. 一个 Schema-valid Report 把两个 check 对调；现有设计只要求拒绝，没有规定稳定错误码和优先级；
2. 一个 root 同时含未知 key、缺失 expected key 和 BLOCKED Report；现有设计没有规定先报告非法结构还是不可消费状态；
3. `--fixture-ref-key` 只验证单项时，现有设计没有明确该成功是否能够证明 130 项集合完整；
4. 反例修改语义字段后未重新计算 payload/raw SHA 时，一个 case 会同时命中多个错误，测试不能证明 verifier 的具体责任；
5. verifier 前后没有受控 tree digest 断言时，无法证明只读实现没有修复、删除或隔离输入。

因此开发人员仍需自行决定错误目录、case 构造、期望退出码和 root 消费边界，`semantic verifier` 尚不具备无歧义的直接实现输入。

## 2. Root Cause

### 2.1 问题原因

上一轮设计把 semantic verifier 作为跨字段闭包的唯一入口，但测试矩阵只列出能力类别，没有建立该入口自己的可执行 case catalog。Materializer 的 `GFM_*` 生产失败码也未与只读 verifier 自身的证据判定错误分离。

### 2.2 为什么之前未发现

此前验收集中在 Report Schema、Materializer 成功/阻断写入、130 项 JAR integration 和 Report 接纳点；没有对“已生成证据如何被同一 verifier 确定性拒绝”做单变量变异和多错误优先级审计。

## 3. 目标

1. 新增唯一受控 case catalog，冻结 factory、路径、身份别名、单变量变异和零写入证明；
2. 冻结独立 `GFMV_*` verifier 错误目录、`0/2/3/4` 映射、首错优先级和 stderr 口径；
3. 冻结 Materialization Report 的合法成功、合法 BLOCKED 和非法跨字段正反例；
4. 冻结 130 项完整 root、单项诊断、缺失/额外/路径/quarantine/I/O/internal 正反例；
5. 同步 Materializer 主设计、03A 实现入口/checklist、测试策略、文档索引和全局冻结基线；
6. 保持机器 Schema、Materializer 生产失败码、SQLite/API、真实 release evidence 和生产 Gate 不变。

## 4. 修改边界

允许修改：

- 本规格及对应 checklist；
- `docs/design/opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md`；
- `docs/design/opm-dev-canvas-06-golden-fixture-materializer-design.md`；
- `specs/opm-dev-canvas-06-golden-fixture-materializer-implementation-task-spec.md`；
- `docs/checklists/opm-dev-canvas-06-golden-fixture-materializer-implementation-checklist.md`；
- `docs/design/opm-test-strategy.md`；
- `docs/design/opm-design-freeze-baseline.md`；
- `docs/README.md`；
- Golden Authoring、03B/04、DEV-CANVAS-06、执行包、历史规格/checklist 和符合性报告中仅限当前 Materializer/冻结基线版本与实现状态指针。

禁止修改：

- `.harness/**`；
- `docs/contracts/**`、SQLite DDL/Flyway migration；
- `scripts/**`、`tests/**`、`services/**`、`package.json`、POM 和 lockfile；
- Capture Plan、Evidence Bundle、Materialization Report、Quarantine Marker、SQLite base 或 approved golden 实体；
- 公共 API、Profile/Rule/Grammar/Symbol、Candidate、Activation、Capability 或生产 Gate。

本任务只补齐设计和直接开发输入，不实现 verifier、factory、fixture、fault port 或测试 runner。

## 5. 冻结方案

### 5.1 单一事实源

受控 case 的唯一事实源为 `docs/design/opm-dev-canvas-06-materialization-verifier-controlled-case-catalog.md`。主设计只承接 verifier 的规范性行为并引用 catalog；实现规格/checklist 和测试策略不得复制第二套 case 定义。

### 5.2 错误边界

Materializer 执行阶段继续使用 `GFM_*`；只读 semantic verifier 使用 `GFMV_*`。Schema/ref/root 非法固定退出 `2`，结构合法但 BLOCKED、缺失或不可消费固定退出 `3`，可信读取失败或 verifier 内部错误固定退出 `4`。

未知 key、额外 Report/database、symlink、临时文件和路径逃逸属于非法证据，退出 `2`；它们不得与合法但不可消费的 BLOCKED、缺失或闭合 quarantine 共用退出 `3`。

### 5.3 受控 factory

factory 从一个固定 READY test Plan、受控 Bundle/Runtime JAR 和空 case root 构造 130 个唯一 Family ref、每项 9 个 capture、130 份 MATERIALIZED Report 和 130 个真实 SQLite base。全部反例从该基线 clone，只改变 catalog 指定维度；除 digest 专用 case 外必须重算受影响 payload/raw ref，避免非目标错误抢占。

`K001~K130` 只作为 catalog alias；写入 Plan、Report、路径和 CLI 的始终是实际 64 位 `fixture_ref_key`。`K001` 固定映射到按实际 key 字典序排序后的第一项。

### 5.4 只读与确定性

每个 case 必须记录 verifier 前后 materialization root tree digest，且两者完全相等。首错选择固定为参数、Plan、root safety、按 key 排序的单项 Report/SQLite、集合完整性、可消费性；I/O 或内部错误在阻断可靠判定时返回 `4`。文件系统枚举顺序不得改变 top code。

## 6. Fix Strategy

1. 建立独立 case catalog，集中维护 case ID、基线、变异、调用模式、top code、退出码和副作用断言；
2. 把主设计升为 `v1.3`，明确 `GFMV_*`、优先级、single-key/full-root 边界及额外项退出 `2`；
3. 在 03A 实现规格/checklist 中把 catalog 全量通过设为 semantic verifier 完成条件；
4. 在测试策略中增加 factory、单变量、双缺陷优先级和前后 tree digest 要求；
5. 把全局冻结基线升为 `v1.6`，仍归入 `DFR-022`，责任计数保持 `32=22+10`。

本修正只补齐 verifier 验收输入，不改变 Materialization Report/Marker Schema、成功 SQLite 语义或下游审批协议。

## 7. Acceptance Mapping

| 验收 | 必须证据 |
| --- | --- |
| factory | 固定 Plan/root factory、130/130、每项 9 次、K001 映射和目录布局 |
| Report 正例 | MATERIALIZED、Binding/Storage/持久化/Report content BLOCKED、cleanup quarantine 均有稳定分类 |
| Report 反例 | checks、ID/ref、payload、binding、identity、failure、database/state/sidecar/reopen 均有单变量 case |
| root 正例 | 完整 root、single-key、合法 BLOCKED/quarantine、pre-acceptance 缺项诊断均有期望结果 |
| root 反例 | 129/131、unknown/extra、symlink/temp/escape、marker/storage、cross-key、residual、I/O/internal 均有期望结果 |
| 确定性 | 固定错误优先级、按 key 排序、至少三组双缺陷 priority case |
| 只读性 | 每个 case verifier 前后 tree digest 相等，禁止 auto-fix、cleanup、rename 或 quarantine |
| 声明边界 | 受控 fixture 不冒充真实 130 项 release evidence，不提升任何后续 Gate/ISO 状态 |

## 8. 验证方式

本任务为纯文档修正，不执行尚未实现的受控 verifier case。至少完成：

1. 检查 catalog 中 case ID、top code 和退出码无重复或缺失；
2. 检查正反例覆盖规格第 7 节全部责任；
3. 检查主设计、实现规格/checklist、测试策略、索引和冻结基线只引用同一 catalog；
4. 检查 Materialization Report/Marker Schema、代码、测试和生产资产未被本任务修改；
5. 检查全仓 Markdown 相对链接、围栏、开放状态词、责任计数和 `git diff --check`。

## 9. 兼容性、迁移与回滚

- Schema/API/SQLite/配置：不变；
- 生产失败码：既有 `GFM_*` 不变，新增 `GFMV_*` 只属于未发布的 verifier 契约；
- 历史 Report/root：不改写；仅 Schema-valid 但不满足 catalog 语义的输入继续不可消费；
- 迁移：无数据库或数据迁移；当前 verifier 实现必须在 03A 后续任务中对齐新目录；
- 回滚：只回退本规格允许的文档增量及 Materializer/冻结基线版本指针，不回退工作树中的并行代码、Schema、测试或证据资产。

## 10. 风险与遗留

1. catalog 冻结不等于 case factory、runner 或 fault injection 已实现；
2. 当前 verifier 是否符合新错误目录和 root 闭包，必须由 03A implementation checklist 后续验证；
3. 真实 130 份 Materialization Report/SQLite、approved golden 和 GATE-06-03 READY 仍未生成；
4. Candidate、Activation、Capability enablement 和 ISO 19450:2024 符合性状态均不变。

## 11. 事实与假设

### 11.1 事实

1. Materializer `v1.2` 已要求唯一只读 semantic verifier，但未提供完整受控 case catalog；
2. Materialization Report `0.1` Schema 不能表达全部跨字段、文件和 root 闭包；
3. 当前工作树已有 verifier 脚本和部分测试实现，但本任务不修改或验收它们；
4. 本任务属于既有 `DFR-022` 内部闭包，不新增设计责任。

### 11.2 假设

无。
