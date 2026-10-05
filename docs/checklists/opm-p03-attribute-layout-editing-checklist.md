# Checklist: OPM P03 Attribute 布局编辑

## Spec Mapping

- 规格：`specs/opm-p03-attribute-layout-editing-task-spec.md`
- 验收：`ATTR-LAYOUT-01` 至 `ATTR-LAYOUT-08`
- 边界确认：只扩展 owned Attribute occurrence；Operation、State、Fact、非 owned、跨 Context、SQLite、Profile 和发布资产保持禁止或只读。

## Build

- [x] `ATTR-LAYOUT-01` OpenAPI、生成守卫和生成产物已同步。
- [x] `ATTR-LAYOUT-02` Runtime Attribute occurrence 授权和布局提交已实现。
- [x] `ATTR-LAYOUT-03` Runtime 拒绝联合与零 Revision 回归已实现。
- [x] `ATTR-LAYOUT-04` Layout/Feature/OPL/Trace 不变量已覆盖。
- [x] `ATTR-LAYOUT-05` Vue 拖放白名单与 exact occurrence 事件已实现。
- [x] `ATTR-LAYOUT-06` Attribute 拖动和 reload 重开 E2E 已实现。

## Verify

- [x] `ATTR-LAYOUT-07` 契约、Service、MVC、组件、typecheck 和 build 通过。
- [x] `ATTR-LAYOUT-06` 定向真实浏览器 E2E 通过。
- [x] `ATTR-LAYOUT-08` 文档链接、尾随空白和 `git diff --check` 通过。

## Verify Record

- `npm run contract:validate`：通过，OpenAPI、代表性 Schema 与生成 DTO 当前一致。
- JDK 21 `LocalApiServiceTest,LocalApiControllerTest`：`27/27` 通过。
- `npm run test --workspace=@opm/web`：`69/69` 通过。
- `npm run typecheck`、`npm run build`：通过；构建仅保留既有 `/opm-bootstrap.js` 非 module 提示。
- Playwright `Attribute 拖动布局并在刷新后保持位置`：`1/1` 通过。
- 本任务 Markdown 本地引用、尾随空白与 `git diff --check`：通过。

当前结论：`IMPLEMENTED / VERIFIED_LOCAL_FEATURE_SCOPE`。本结果不构成 DEV-CANVAS-06、Candidate、Activation、生产发布或 ISO 符合性证据。
