# Spec: OPM 设计冲突修正与实现符合性报告刷新

规格版本：`1.0`

规格状态：`ACTIVE`

## Task Type

`bugfix`

## Active Playbooks

- `design-module-docs (primary)`
- `testing`

## 1. 背景与最小复现

当前冻结文档和执行记录存在三项可直接复现的状态冲突：

1. 原生交换契约第 1 章称物理容器、扩展名和编码未冻结，第 16.2 节又冻结为 `.opmp` ZIP、Canonical JSON 和 SHA-256；
2. 实现符合性报告仍记录已修复的前端 `0.1.0` binding、`8/8` E2E 失败、DEV-CANVAS-05 `BLOCKED` 和 DEV-CANVAS-06 Intake 缺失；
3. DEV-CANVAS-06 checklist 已记录 Intake Schema、runner 和 READY 报告证据，但同文档结论仍称 GATE-06-01/02 均未实现。

这些冲突使 `cross_document_conflict_count=0` 在修复前不可成立，并分别阻断 `.opmp` 机器实现输入、DEV-CANVAS-06 实施状态判断和当前实现符合性判断。

## 2. Root Cause

1. 原生交换契约后续冻结物理格式时，只追加第 16.2 节，没有同步删除早期开放选型表述和草案版本占位；
2. Runtime binding、P0 E2E、DEV-CANVAS-05 handoff 和 DEV-CANVAS-06 Intake 后续实现后，原符合性报告没有按“完整重验后整体刷新”规则失效并重建；
3. DEV-CANVAS-06 checklist 的 Build/Verify 项已增量更新，但章节导语和最终结论仍保留设计冻结阶段的旧状态。

之前未被发现的原因：设计冻结校验只检查了责任计数、标识和文档结构，没有针对同一责任的开放/冻结措辞及“执行记录与结论”建立状态一致性断言。

## 3. Fix Strategy

1. 保留已接受的 ARC-008 和交换契约第 16.2 节决定，冻结首发格式为 `.opmp` ZIP、Canonical JSON entries、SHA-256；首发 `exchange_format_version=1.0`、`minimum_reader_version=1.0`；
2. 升版原生交换契约和全量冻结基线，同步正式索引及验收矩阵版本引用，重新计算跨文档冲突；
3. 将 DEV-CANVAS-06 状态明确拆为：GATE-06-01 已实现且 READY；GATE-06-02 仅设计冻结、未实现；GATE-06-03~06 未实现；
4. 不局部替换旧报告结论。重新执行契约、Golden、兼容、handoff、Intake、前端、后端、完整 Playwright 和浏览器验收后，整体刷新报告；
5. 保持生产 gate 为 `DISABLED + []`，ISO 19450:2024 结论保持 `EVIDENCE_MISSING/无法判断`。

## 4. 修改边界

允许修改：

- `specs/opm-design-conflict-remediation-and-conformance-refresh-task-spec.md`；
- `docs/checklists/opm-design-conflict-remediation-and-conformance-refresh-checklist.md`；
- `docs/design/opm-native-exchange-package-contract.md`；
- `docs/design/opm-design-freeze-baseline.md`；
- `docs/checklists/opm-dev-canvas-06-toolchain-release-checklist.md`；
- `docs/requirements/opm-requirement-acceptance-matrix.md`；
- `docs/README.md`；
- `docs/reports/opm-implementation-design-conformance-test-report.md`；
- 测试命令产生的既有可再生输出目录和 `/tmp` 隔离证据。

禁止修改：

- `.harness/**`；
- `apps/**`、`services/**`、`scripts/**`、`tests/**`、`packages/**`、`package.json` 和依赖；
- OpenAPI、Revision/Intake Schema、SQLite DDL、Profile/Rule/Grammar/Symbol/Golden 和 handoff/release 资产；
- Git 历史、分支、远端和用户既有改动。

本任务不允许修改 schema、API、配置、依赖或测试代码。

## 5. Spec Mapping

| 问题 | 修复来源 | 验收 |
| --- | --- | --- |
| `.opmp` 物理格式冲突 | ARC-008、原生交换契约第 16.2 节 | 第 1、5、6、16 章对容器、编码、摘要和版本表述唯一一致 |
| 冻结基线冲突计数失真 | 全量冻结基线第 8、10 章 | 版本升版，30 项责任重算，正式入口无开放/冻结冲突 |
| DEV-CANVAS-06 状态不同步 | Intake Schema/runner/test、exact handoff 与 Intake 输出 | GATE-06-01 READY；02 仅设计冻结；03~06 未实现 |
| 实现验收报告过期 | 当前源码、机器资产和本轮完整命令结果 | 报告全部结论、计数、矩阵和限制来自本轮重验 |
| 发布和 ISO 边界 | DEV-CANVAS-06 状态机、冻结延期责任 | 不以 Intake READY 外推 enablement、release 或 ISO 符合性 |

## 6. 验证方式

1. 对冻结设计执行关键术语、版本、状态、表格、code fence、相对引用和 `git diff --check` 校验；
2. 执行 contract、Golden contract/check/coverage/replay、Revision compatibility、handoff evidence/contract、DEV-CANVAS-06 Intake test 和 exact Intake；
3. 执行前端 lint、typecheck、unit、build，后端 Maven verify；
4. 执行完整 Playwright，并在当前真实 Runtime/Vite 上复核 P01 -> P02 -> P03、建模、OPL/Trace、缩放和窄视口；
5. 只把实际执行结果写入报告；任何未实现 Gate 保持 `NOT_IMPLEMENTED/NOT_RUN`。

## 7. 验收标准

1. `.opmp` 首发格式和最低读取器版本只有一个冻结值，不再出现“物理格式未冻结”或“评审后再分配版本”；
2. 全量冻结基线重新满足 `30=20+10`、`blocked=0`、`unresolved=0`、`cross_document_conflict_count=0`；
3. DEV-CANVAS-06 checklist 章节导语、Build/Verify、结论和下一步状态一致；
4. 符合性报告不再包含已失效的 binding、E2E、handoff 或 Intake 结论，并记录本轮完整重验环境和结果；
5. 报告明确：GATE-06-01 READY 不构成 GATE-06-02~06、96 Capability、`.opmp`、生产发布或 ISO 符合性证明；
6. 所有允许修改文档通过最终一致性与 whitespace 检查，业务实现和机器契约未被本任务修改。

## 8. 回滚

回滚只恢复本任务修改的文档和删除本任务新增的规格/checklist。不得回退用户已实现的 Runtime binding、DEV-CANVAS-05 handoff、DEV-CANVAS-06 Intake Schema/runner/report、测试或发布资产。

## 9. 事实与假设

### 事实

1. 当前前端创建模型、编辑和校验均读取 Runtime 下发的 active binding；
2. 当前 DEV-CANVAS-05 handoff 为 `READY_FOR_DEV_CANVAS_06`，34 项均为 `ELIGIBLE_FOR_RELEASE_VALIDATION`，production gate 为 `DISABLED + []`；
3. DEV-CANVAS-06 Intake Schema、runner 和测试入口已存在；Enablement、Visual/E2E、Performance、Recovery、Candidate/Activation 仍无完整实现证据；
4. 两配置档 96 Capability 的设计输入已冻结，当前 Profile 实例不完整属于实现缺失；
5. `.opmp` 机器 Schema、reader/writer 和 golden roundtrip 尚未实现。

### 假设

当前未提交工作树代表本次需要重新验收的候选实现。任何测试期间出现的新用户修改均不由本任务覆盖或回退。

> 历史快照说明（2026-08-07 更新指针）：本任务的`30=20+10`与`PASS=14/FAIL=6`对应早期基线。当前唯一状态源为`docs/design/opm-design-freeze-baseline.md` `v1.21`，责任口径为`32=22+10`；本历史重验未覆盖后续执行契约闭包。
