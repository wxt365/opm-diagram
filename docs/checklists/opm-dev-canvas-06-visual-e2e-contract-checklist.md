# Task Checklist: DEV-CANVAS-06 Visual/E2E 可执行输入闭包

## Spec Mapping

- 当前任务规格文档：`specs/opm-dev-canvas-06-visual-e2e-contract-task-spec.md`
- Task Type：`feature`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：关闭 GATE-06-03 variant、fixture、transaction、archive 与公共机器输入的设计缺口。
- 范围：总 Spec、总 checklist、测试策略及本任务文档。
- 非目标：不新增 Schema/runner/factory/golden/report，不生成 Candidate/Activation，不启用 Capability。
- 约束：不修改 `.harness/**`、代码、配置、Profile 或机器证据。
- 验收标准：当前规格第 8 节。
- 验证方式：exact 资产结构化计数、跨文档扫描和限定文件 `git diff --check`。
- 回滚：只回退本任务文档增量，保留用户既有未提交实现和证据。

## Acceptance Mapping

| 规格目标 | 文档落点 | 验证 |
| --- | --- | --- |
| Family variant 可复算 | 总 checklist GATE-06-03 input closure | 130 PASS variant、无重复 join key |
| Visual 字段层级闭合 | 总 checklist Manifest/Visual 章节 | variant 级 fixture/revision/cell 字段一致 |
| E2E transaction 可复算 | 总 checklist E2E join 章节 | 178 case 与 Replay 两次 transaction |
| archive ref 可复核 | 总 checklist bundle materialization 章节 | raw SHA、entry、物化 ref 规则完整 |
| 公共场景不再靠文字猜测 | common fixture catalog 契约 | 8/16、factory/action/transaction 字段完整 |
| Build 门槛真实 | 总 checklist 结论与 task spec | 明确仍 BLOCKED、禁止伪 READY |

## Analysis

- [x] 已读取总 Spec `4.4` 与 GATE-06-03 完整冻结契约
- [x] 已读取 feature Task Type、design-module-docs 与 testing playbook
- [x] 已检查当前 exact Handoff、Coverage、Golden Manifest/Replay、Symbol Catalog 和 evidence bundle
- [x] 已确认 Symbol Catalog 无 visual variant 字段
- [x] 已确认 Visual 多 variant 与 case-level fixture 字段冲突
- [x] 已确认 8/16 公共场景无机器 fixture/factory catalog
- [x] 已确认 130 PASS transaction 需从 Golden Replay exact join
- [x] 已确认普通 file ref 无法直接表示 evidence bundle entry

## Design Closure

- [x] 总 Spec 增加 exact join、variant 级 fixture 和公共输入前置边界
- [x] 总 checklist 冻结 `130/1242/2484` 数量和排序
- [x] 总 checklist 修正 Visual case/variant 字段层级
- [x] 总 checklist 冻结 family fixture/focus/critical region 派生
- [x] 总 checklist 冻结 E2E Golden Replay transaction join
- [x] 总 checklist 冻结 evidence bundle 安全物化与 archive entry ref
- [x] 总 checklist 冻结 common fixture catalog identity/路径/字段
- [x] 总 checklist 冻结 golden environment index 和 path 规则
- [x] 测试策略同步输入来源和证据边界
- [x] 已纠正缺少 exact mapping 时的旧冻结结论，并按新契约重新冻结

## Verify

- [x] 34 Capability、178 coverage、130 PASS、48 BLOCKED 计数通过
- [x] PASS `(capability_id,variant_key)` 重复数为 0
- [x] Golden Manifest base/input fixture 缺失数均为 0
- [x] Golden Replay 178 case 均有两次 attempt 且 transaction 可读取
- [x] 三份权威文档口径一致
- [x] 限定文件 `git diff --check` 通过
- [x] 确认无 Schema/runner/golden/report/Candidate/Activation 新产物

## Risks And Residuals

- [x] common fixture/factory catalog 仍待实现
- [x] golden environment index 与 PNG 仍待实现/审批
- [x] 六个输入/输出 Schema、manifest builder、release runner/reporter/verifier 仍待实现
- [x] GATE-06-03 仍为 BLOCKED
- [x] Capability enablement 仍为零
- [x] ISO 状态仍为 `EVIDENCE_MISSING/无法判断`
