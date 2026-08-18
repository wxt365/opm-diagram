# DEV-CANVAS-06 Visual Common Materialization 与 Color Profile 设计闭环 Checklist

状态：`COMPLETE`

## Spec Mapping

- 当前规格：`specs/opm-dev-canvas-06-visual-common-materialization-color-profile-design-closure-bugfix-task-spec.md`。
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

- [x] 复核 Common Catalog、8 个 fixture、production Plan、Golden Environment 与 03B 当前字段。
- [x] 冻结 Common Visual Fixture 版本、完整字段和 8 subject 语义/布局/UI setup。
- [x] 冻结 release-only SQLite V1 物化、base/attempt 隔离和 normalized Projection digest。
- [x] 冻结 `srgb -> sRGB IEC61966-2.1` canonicalization、比较和 fingerprint。
- [x] 建立 02B Contract/Planner 与 03C Runtime Materializer 实现入口。
- [x] 同步 Golden Authoring、03B、GATE-06-03 和全局设计状态。
- [x] 执行 Schema、链接、结构、状态和 whitespace 验证。

## Boundary

- [x] 只修改当前规格允许的设计、规格、checklist 和状态入口。
- [x] 不修改 `.harness/**`、Schema、代码、测试、SQLite、API、Profile 或 release bytes。
- [x] 不改写 `GOLDEN-CANVAS06-20260803-001`、当前 Catalog 或 8 个历史 fixture。
- [x] 不生成 candidate/approved/Manifest/Report，不提升 Gate、Capability 或 ISO 状态。

## Root Cause And Fix Strategy

- [x] Root Cause 已定位为 Common Factory 延后实现且缺少独立 materialization owner，Environment 升版未同步 Plan alias。
- [x] Fix Strategy 只保留一种 SQLite 路径和一种 color profile 映射，不允许实现时二选一。
- [x] 旧 Plan/fixture 保持不可变并转为不可供新 authoring 消费的历史输入。

## Verify

- [x] Golden Authoring Schema 回归 `6/6 PASS`。
- [x] Visual/E2E Schema 回归 `7/7 PASS`。
- [x] 19 份新增/更新 Markdown 相对链接全部存在，表格列数和围栏闭合。
- [x] `8/72/144`、`0.1/0.1.0`、`srgb/sRGB IEC61966-2.1` 与全局 `32=22+10` 状态一致。
- [x] 现行入口无 Runtime/API/SQLite 可选语义、宽松 color alias 或可继续消费的旧 Common projection 占位算法。
- [x] `git diff --check` 通过。

## Risks And Residuals

- [x] 02B、03C、03B 代码仍为 `NOT_STARTED/BLOCKED_BY_DEPENDENCY`。
- [x] 新 Common fixture/Catalog/Plan、8 个 SQLite base、144 个 attempt 和 PNG 均不存在。
- [x] GATE-06-03、Candidate、Activation、Capability 和 ISO 状态均未提升。

## Rollback

- [x] 回滚只删除本轮新增文档并恢复同步入口；不删除或覆盖任何机器资产和数据。

> 历史状态指针（2026-08-07）：本 checklist 的完成项只证明Visual Common Materialization首轮`v1.0`闭环。当前唯一口径为`v1.4`和冻结基线`v1.21`；JCS owner/parity、空Text Artifact/计数、五类index、8类UI step和43文件self-contained root均已冻结，共享模块和向量已存在，02B/03C仍未实现。
