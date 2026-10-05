# P03 状态布局与符号修正检查

规格：[任务规格](../../specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md)。

- [x] 边界确认：允许 API role 标注及跨层布局行为；禁止 schema migration、Profile/发布资产与数据清理。
- [x] OS-01：四向 renderer 单测、既有反向端点规范化 Service 测试、浏览器 Attribute → Object 连线通过；截图确认双层三角尖端连接 owner，无普通箭头。
- [x] OS-02：Operation 椭圆、真实拖动、保存重开通过。
- [x] OS-03：两个状态创建后均被容纳；独立拖动和越界限制、父移动单命令、终态边框同心跟随通过。
- [x] OS-04：真实 SQLite/MVC 验证原子多布局回写、语义/OPL/Trace 不变、幂等重试和旧 token 拒绝；另行验证 referenced State、referenced owner、错误 role 零 journal/receipt。
- [x] OS-05：定向测试、契约/类型/构建/lint、浏览器、diff 和服务校验通过。

## 实际验证（2026-09-15）

- Java 21 离线 Maven：`DraftWorkspaceControllerTest,LocalApiServiceTest,LocalApiControllerTest` 58/58；新增 State 越权矩阵测试单独执行 1/1。日志：`/tmp/opm-owned-layout-java.log`、`/tmp/opm-owned-layout-negative.log`。
- Vue/renderer 定向集 112/112；增加布局失败回退测试后，`WorkbenchView.spec.ts` 重跑 76/76（最终覆盖 113 个不同测试）。
- `npm run build`（含契约生成检查、OpenAPI 校验、vue-tsc、Vite）和 `npm run lint` 通过，Node 22.22.0。Bootstrap 仍为运行时非模块脚本，Vite 对其不打包提示保持原设计行为。
- `workbench-owned-layout.spec.ts` 1/1、既有 `workbench-inline-name.spec.ts` 1/1，真实 Chromium / 5176 / 17851，数据根 `/private/tmp/opm-owned-layout-e2e-w0nQzy`。已关闭这两个临时服务。
- [浏览器截图](../../test-results/workbench-owned-layout-状态容器联动、Operation-拖动和反向展示关系在保存重开后保持一致/owned-layout.png) 已人工核对。
- 更新后的 Runtime 已启动于 17850，前端 5173 页面、后端 UP、API 代理和 Bootstrap bytes/no-store 检查全部通过。现有数据库只读 `quick_check=ok`、`foreign_key_check` 无结果；未清库。
- 旧 Runtime 在打包替换 JAR 后停止时出现 shutdown 日志类加载异常；进程已退出，新 JAR 启动正常并完成上述完整性检查。后续应在覆盖在用 JAR 前停止旧进程。
- `git diff --check` 通过；不修改发布证据与 ISO 结论。

## 本轮完整修改清单

以下仅指在现有工作区基础上叠加的本轮修改，不代表文件全部差异均属于本轮。

```text
specs/opm-p03-owned-state-layout-and-exhibition-bugfix-task-spec.md
specs/opm-p03-attribute-layout-editing-task-spec.md
docs/checklists/opm-p03-owned-state-layout-and-exhibition-bugfix-checklist.md
docs/design/opm-modeling-workbench-component-interaction.md
docs/design/opm-opd-node-renderer-architecture.md
docs/design/opm-complete-canvas-toolchain-design.md
docs/design/opm-modeling-tool-application-api-contract.md
docs/design/opm-frontend-handoff.md
docs/design/opm-design-freeze-baseline.md
docs/contracts/openapi/opm-local-api-v1.yaml
scripts/generate-api-edt-contracts.mjs
apps/web/src/shared/api/generated/apiEdtContract.ts
services/local-runtime/src/main/java/org/opm/localruntime/api/generated/ApiEdtContract.java
services/local-runtime/src/main/java/org/opm/localruntime/application/LocalApiService.java
services/local-runtime/src/main/java/org/opm/localruntime/application/DraftWorkspaceService.java
services/local-runtime/src/main/java/org/opm/localruntime/application/DraftOwnedConstructEdits.java
services/local-runtime/src/test/java/org/opm/localruntime/application/LocalApiServiceTest.java
services/local-runtime/src/test/java/org/opm/localruntime/api/DraftWorkspaceControllerTest.java
apps/web/src/shared/types/modeling.ts
apps/web/src/stores/workbenchRuntime.ts
apps/web/src/modules/workbench/OpdCanvas.vue
apps/web/src/modules/workbench/OpdCanvas.spec.ts
apps/web/src/modules/workbench/WorkbenchView.spec.ts
apps/web/src/modules/workbench/opd/core/node-geometry.ts
apps/web/src/modules/workbench/opd/core/relation-render-spec.ts
apps/web/src/modules/workbench/opd/core/x6-relation-adapter.ts
apps/web/src/modules/workbench/opd/core/relation-preview-renderer.ts
apps/web/src/modules/workbench/opd/relations/structural/exhibition-characterization.definition.ts
apps/web/src/modules/workbench/opd/relations/structural/structural-render-helpers.ts
apps/web/src/modules/workbench/opd/relations/built-in-relation-registries.spec.ts
tests/e2e/workbench-owned-layout.spec.ts
```
