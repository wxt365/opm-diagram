# Checklist: DEV-CANVAS-06 Family SETUP CommandMeta Closure Bugfix

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

## Spec Mapping

- [x] CM01 OpenAPI、TypeScript与Runtime正式字段已查证为`committed_revision`。
- [x] CM02 RUN_SETUP唯一Revision字段已修正。
- [x] CM03 禁止`meta.revision`兼容fallback。
- [x] CM04 Stage R、累计delta与Source Set计数保持不变。
- [ ] CM05 binder正反例通过。
- [ ] CM06 Runner、contract与Java回归通过。
