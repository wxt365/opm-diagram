# Checklist: P03 统一画布构造生命周期实现

## Spec Mapping

- 规格：`specs/opm-p03-unified-construct-lifecycle-implementation-task-spec.md`
- 验收：`LIFECYCLE-IMPL-01` 至 `LIFECYCLE-IMPL-06`
- 边界：仅按规格 allowlist 修改 OpenAPI/生成 DTO/Runtime/Vue/X6/测试；SQLite、Profile 资产、依赖、发布链和 `runtime-data/` 保持禁止。

## Build

- [x] `LIFECYCLE-IMPL-01` 删除 option/payload 的 OpenAPI、生成器与 TS/Java DTO 已闭合。
- [x] `LIFECYCLE-IMPL-02` Runtime occurrence、target、blocker、cascade 与规范 impact 已实现。
- [x] `LIFECYCLE-IMPL-03` token 重算、stale、事务和幂等边界已实现。
- [x] `LIFECYCLE-IMPL-04` Fact 删除和 Control 移除的 identity/OPL/Trace 边界已实现。
- [x] `LIFECYCLE-IMPL-05` 右键菜单直接执行、键盘无菜单直接执行、菜单取消和失败保留已实现。

## Verify

- [x] `LIFECYCLE-IMPL-06` Vue/X6、typecheck、build、浏览器 E2E 与 diff 检查通过；Runtime contract 未改变。

## Verify Record

- `2026-09-05`：前端全量单测 `83/83`、lint、typecheck、contract/build 通过；构造删除 Playwright `1/1` 通过。右键菜单取消保持 Revision，菜单项一次点击提交，键盘直接提交且不出现菜单/确认框。
- [x] 未将本轮局部验证表述为 Candidate、Activation、production 或 ISO 符合性证据。
