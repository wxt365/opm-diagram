# Checklist: DEV-CANVAS-06 Common Visual JCS Owner 设计修正

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-common-visual-jcs-owner-design-correction-bugfix-task-spec.md`。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 问题/Root Cause、目标、边界、Fix Strategy、验收、回滚：分别对应规格第1至6节。
- Release boundary：规格第7节。

## Plan

- [x] 复核当前Node局部JCS、Java canonicalizer及调用边界。
- [x] 冻结唯一共享Node模块、导出函数和值域。
- [x] 冻结Node/Java共用parity vector及正反测试责任。
- [x] 同步02B/03C、Golden Authoring和全局状态。
- [x] 执行Schema、Markdown、状态和whitespace验证。

## Boundary

- [x] 只修改设计、规格、checklist和状态入口。
- [x] 不修改Schema、代码、测试、SQLite、API、Handoff/Intake或release bytes。
- [x] 不把已有局部算法误写为共享模块实现完成。

## Verify

- [x] exact模块/向量路径、safe integer、UTF-16 key排序、lone surrogate边界和10项expected在活动文档中唯一。
- [x] 02B/03C无实现阶段重新选择canonicalizer或parity input的空间。
- [x] `32=22+10/READY_FOR_DEVELOPMENT`与实现状态分栏一致。
- [x] Golden Authoring Schema `6/6`、Visual/E2E Schema `7/7`回归通过。
- [x] 10项exact vector的canonical JSON text与SHA-256复算`10/10`通过。
- [x] `docs/specs`共161份Markdown的相对链接、表格列数和围栏闭合检查通过。
- [x] 版本/状态扫描和`git diff --check`通过。

## Risks And Residuals

- [x] 共享Node模块、parity vector和跨Runtime测试仍为`NOT_STARTED`。
- [x] 02B/03C/03B、production Gate、Capability和ISO状态未提升。

## Rollback

- [x] 回滚不得保留JCS owner不唯一时的READY设计声明。
