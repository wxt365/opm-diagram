# Checklist: P03 连线上关系名称编辑

Spec：[实现规格](../../specs/opm-p03-on-edge-relation-label-editing-task-spec.md)。

- [x] 边界确认：仅前端、定向测试和设计；复用 Runtime UPDATE_FACT，不修改公共契约或用户模型。
- [x] EDGE-LABEL-01：真实 Chromium 检查创建和更新输入与 SVG 路径的几何关系、缩放跟随；单元覆盖 scale/translate/resize、路径缺失、非 committed Cell。已查看真实编辑截图。独立 addEdge 的异步视图挂载已补定位回调。
- [x] EDGE-LABEL-02：单元覆盖无 labels option、只读、同名、空白、Escape、IME；浏览器覆盖聚焦、同名、取消及组合输入。
- [x] EDGE-LABEL-03：单元覆盖失败保留重试、候选失效、预检期间切换选择和重复 Enter；真实 API request 断言只含 labels replacement、一次更新、Fact ID 不变，刷新后名称/OPL 一致。
- [x] EDGE-LABEL-04：以下均为 2026-09-11 实际执行结果。

验证记录：

- Node `v22.22.0`；`npm run test --workspace=@opm/web`：15 文件、99/99 通过。
- `npm run lint --workspace=@opm/web` 与 `npm run build --workspace=@opm/web`：通过；build 包含 vue-tsc。保留既有 Runtime bootstrap 外置脚本提示。
- `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-layout.spec.ts tests/e2e/workbench-relation-gesture.spec.ts`：16/16 通过；最后补充异步取消守卫后，受影响的“连线上输入”真实用例重跑 1/1 通过。
- 测试使用隔离的 17851 Runtime、5176 Web 与临时数据库；没有操作用户运行模型。首次沙箱阻止本地端口后，已通过批准的测试执行权限完成验证。
- `git diff --check`：通过。现有工作区其他改动保留。

本包完整文件清单（仅这些文件的本轮增量）：

- `apps/web/src/modules/workbench/OpdCanvas.vue`
- `apps/web/src/modules/workbench/WorkbenchView.vue`
- `apps/web/src/stores/workbenchRuntime.ts`
- `apps/web/src/shared/styles/base.css`
- `apps/web/src/modules/workbench/OpdCanvas.spec.ts`
- `apps/web/src/modules/workbench/WorkbenchView.spec.ts`
- `tests/e2e/workbench-layout.spec.ts`
- `docs/design/opm-modeling-workbench-component-interaction.md`
- `docs/design/opm-design-freeze-baseline.md`
- `specs/opm-p03-on-edge-relation-label-editing-task-spec.md`
- 本 Checklist。

边界确认：未改 Runtime、OpenAPI、Schema、SQLite、Profile 或依赖；未实施 HEAD URL 设计，未生成发布或 ISO 符合性证据。
