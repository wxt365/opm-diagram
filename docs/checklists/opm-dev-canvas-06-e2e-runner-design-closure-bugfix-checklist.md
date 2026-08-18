# DEV-CANVAS-06 E2E Runner 设计闭环修正 Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-e2e-runner-design-closure-bugfix-task-spec.md`。
- Task Type：`bugfix`。
- Active Playbooks：`design-module-docs (primary)`、`testing`。
- 问题与 Root Cause：规格第 1 节。
- 目标：规格第 2 节。
- 范围/非目标：规格第 3 节。
- Fix Strategy：规格第 4 节。
- 验收/验证：规格第 5、6 节。
- 回滚：规格第 7 节。
- Release boundary：规格第 8 节。

## Plan

- [x] 冻结 E2E Runner/Reporter/Verifier 的 owner、CLI、输入信任链和版本。
- [x] 冻结 production/controlled 隔离、Runtime/Web/browser 启动、attempt 隔离和稳定等待。
- [x] 冻结 Family/Common 物化及 driver 映射、raw artifact、Report 字段映射和聚合。
- [x] 冻结 first-failure precedence、退出码、BLOCKED/零 Report 边界和原子提交。
- [x] 建立保持 `NOT_STARTED` 的 implementation checklist。
- [x] 同步 Gate、测试策略、开发执行包、冻结基线和文档索引。
- [x] 复核并纠正遗漏的 `DFR-021` Visual Common materialization 与 `color_profile` 设计阻塞，关闭全局开发门。
- [x] 执行 Schema 回归、链接、术语、状态和 Markdown whitespace 验证。

## Boundary

- [x] 只允许修改当前规格列出的九个文档入口。
- [x] 不修改 `.harness/**`、Schema、代码、测试、配置、SQLite、Profile 或 Handoff。
- [x] 不运行真实 `194/388`，不生成 E2E Report。
- [x] 不生成 Candidate/Activation，不启用 Capability，不形成 ISO 证明。

## Verify

- [x] `npm run release:canvas06:visual-e2e-schema:test` 为 `7/7 PASS`。
- [x] 本轮新增/更新 Markdown 相对链接全部存在。
- [x] `194/178/130/48/16/388/146/34` 数字与 `0.1/0.1.0` 版本一致。
- [x] 正式入口不再称 E2E Manifest builder 未实现。
- [x] 正式入口没有把 Runner 设计冻结写成实现或执行完成。
- [x] 当前状态入口统一为 `32=21+10+1`、`blocked=1`、`unresolved=1`、`cross_document_conflict=1`、`BLOCKED_BY_DESIGN`。
- [x] `git diff --check` 通过。

## Root Cause And Fix Strategy

- [x] Root Cause 已定位为 Manifest 输入闭包与 Gate 高层矩阵之间缺少独立执行层契约。
- [x] Fix Strategy 保持 Report Schema `0.1`，通过 attempt `artifact_refs[]` exact 引用细粒度证据。
- [x] 影响范围仅为 E2E release execution 设计和状态索引，不影响其他模块实现。
- [x] 原全局零阻塞结论的 Root Cause 已定位为 E2E 局部复核遗漏 `DFR-021` 的两个既有设计输入问题。

## Risks And Residuals

- [x] Runner/Reporter/Verifier 和 release Playwright config 仍为 `NOT_STARTED`。
- [x] production E2E Manifest、`194/388` 执行和 E2E Report 仍未生成。
- [x] `GATE-06-03`、Candidate、Activation、Capability 和 ISO 状态均未提升。
- [x] `DFR-021` 是当前唯一 blocked responsibility；后续须用独立设计切片冻结 Common Runtime materialization 和 color profile canonicalization。

## Rollback

- [x] 回滚只删除本轮新增四个文档并恢复六个入口原文，无 Schema、代码或数据回滚。

> 历史状态指针（2026-08-17）：本 checklist 的`32=21+10+1/BLOCKED_BY_DESIGN`是当轮复核结果。当前全局状态以冻结基线`v1.21`、Visual Common Materialization`v1.4`、E2E Attempt Artifact`v1.3`、Family Identity Catalog`0.1/0.1.0`、活动Report`0.2`和Runner Source Set`0.1`为准，口径为`32=22+10/READY_FOR_DEVELOPMENT`。E2E Manifest Family Catalog适配、E2E Java/source/artifact producer、02B/03C/03B与production执行仍缺失。
