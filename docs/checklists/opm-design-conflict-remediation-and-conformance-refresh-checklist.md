# Task Checklist: OPM 设计冲突修正与实现符合性报告刷新

## Spec Mapping

- 当前规格：`specs/opm-design-conflict-remediation-and-conformance-refresh-task-spec.md`
- Task Type：`bugfix`
- Active Playbooks：`design-module-docs (primary)`、`testing`
- 目标：关闭 `.opmp`、DEV-CANVAS-06 状态和过期符合性报告三项文档冲突。
- 范围：交换契约、冻结基线、正式索引/版本引用、DEV-CANVAS-06 checklist、完整实现重验和报告刷新。
- 非目标：不修改业务实现、机器契约、Profile/Golden/handoff/release 资产或生产 gate。
- 约束：完整重验前不得局部改写旧报告为 PASS；Intake READY 不得外推后续 Gate。
- 验收标准：当前规格第 7 节。
- 验证方式：设计一致性检查、完整自动化、真实 Playwright、浏览器人工验收和最终差异检查。
- 回滚：只恢复本任务文档，不回退用户实现和资产。

## 边界与复现

- [x] 阅读 `bugfix` task type、`design-module-docs` 和 `testing` playbook
- [x] 复现原生交换契约第 1、5、16 章状态冲突
- [x] 复现 DEV-CANVAS-06 Intake 执行记录与章节结论冲突
- [x] 通过当前源码确认前端已经读取 Runtime active binding
- [x] 确认旧符合性报告仍保留已失效的 binding/E2E/handoff/Intake 结论
- [x] 确认当前工作树中的 Intake、handoff 和 release 资产属于用户改动并予以保留

## 设计修正

- [x] 冻结 `.opmp` ZIP、Canonical JSON entries、SHA-256 和 MIME type
- [x] 冻结首发 `exchange_format_version=1.0`、`minimum_reader_version=1.0`
- [x] 升版原生交换契约和全量冻结基线
- [x] 同步 `docs/README.md` 和需求验收矩阵版本引用
- [x] 重算 30 项责任与跨文档冲突，确认开发门恢复为 READY

## DEV-CANVAS-06 状态同步

- [x] GATE-06-01 标记为已实现并 `READY_FOR_RELEASE_VALIDATION`
- [x] GATE-06-02 标记为设计冻结、实现/执行未完成
- [x] GATE-06-03~06 标记为实现/执行未完成
- [x] 删除“本轮没有创建 Intake Schema/runner”等失效表述
- [x] 保持 production gate=`DISABLED + []`

## 完整重验

- [x] 契约、Golden contract/check/coverage/replay 通过
- [x] Revision compatibility 与 DEV-CANVAS-05 handoff 验证通过
- [x] DEV-CANVAS-06 Intake runner tests 和 exact Intake 通过
- [x] 前端 lint、typecheck、unit、build 通过
- [x] 后端 Maven verify 通过
- [x] 完整 Playwright `9/9 PASS`，失败 `0`
- [x] 桌面浏览器复核 P01 -> P02 -> P03、建模、OPL、缩放和刷新重开；OPL/Trace 与 `390x844` 窄视口由完整 Playwright 覆盖

## 报告与最终验证

- [x] 整体刷新实现符合性报告，不保留失效测试事实
- [x] 重新计算 20 项 `FROZEN_INCLUDED` 实现状态：`PASS=14 / FAIL=6`
- [x] 明确 DEV-CANVAS-06 后续 Gate、96 Capability、`.opmp`、发布和 ISO 证据边界
- [x] 修改文档表格、code fence、相对引用和状态术语检查通过
- [x] `git diff --check` 通过
- [x] 复核本任务人工编辑未修改业务源码、机器契约、Profile、Golden、handoff/release 资产和生产 gate；工作树中相关改动为本任务开始前已确认保留的用户实现
